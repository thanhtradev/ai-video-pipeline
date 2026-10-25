import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { alignWords, parseWhisperJson } from '../episode/align.js';
import { episodeSentences } from '../episode/sentences.js';
import { buildTiming, checkCuts, envelope, FPS, type EpisodeTiming } from '../episode/timing.js';
import { readPcm16, type VoiceBuilder } from '../media/voice.js';
import type { Transcriber } from '../media/whisper.js';
import { readValidCheckpoint, writeFileAtomic } from '../storage/checkpoint.js';
import { resolveInside } from '../storage/workspace.js';
import {
  PermanentJobError,
  ProviderBlockedError,
  type HandlerContext,
  type JobHandler,
} from '../runner.js';

// Episode `timing` step (q:heavy, docs/episode-pipeline.md §5): joins the act clips of the tts job
// into voice.wav, transcribes it with whisper.cpp, and builds timing.json + captions.json for the
// kit from the approved script. Free (local). Deterministic failures (a MỐC that is not spoken, a
// cut in speech) are permanent: re-running cannot change them, a person decides.

const VOICE = 'voice.wav';
const ANALYSIS = 'voice-16k.wav';
const TRANSCRIPT_PREFIX = 'transcript';
const TIMING = 'timing.json';
const CAPTIONS = 'captions.json';
const TIMELINE = 'timeline.md';

const inputSchema = z.object({
  script_job_id: z.uuid(),
  tts_job_id: z.uuid(),
  language: z.literal('vi'),
});

const scriptSchema = z.object({
  acts: z
    .array(
      z.object({
        lines: z.array(z.object({ id: z.string(), text: z.string() })).min(1),
        shots: z
          .array(
            z.object({
              id: z.string(),
              moc: z.string(),
              hold_seconds: z.number().optional(),
              fast: z.boolean().optional(),
            }),
          )
          .min(1),
      }),
    )
    .min(1),
});

const ttsResultSchema = z.object({
  scenes: z.array(z.object({ index: z.number().int().min(1), file: z.string().min(1) })).min(1),
});

export interface TimingHandlerDeps {
  buildVoice: VoiceBuilder;
  /** Null when no whisper model is configured: jobs wait as BLOCKED until it is. */
  transcribe: Transcriber | null;
  blockSeconds: number;
}

/** A finished job's checkpoint: proof its files are complete and unchanged. */
async function checkpointOf(workDir: string, jobId: string, what: string) {
  const dir = await resolveInside(dirname(workDir), jobId);
  const checkpoint = await readValidCheckpoint(dir);
  if (!checkpoint) throw new PermanentJobError(`${what} job ${jobId} is missing or changed`);
  return { dir, checkpoint };
}

async function loadScript(workDir: string, jobId: string) {
  const { dir } = await checkpointOf(workDir, jobId, 'script');
  const parsed = scriptSchema.safeParse(
    JSON.parse(await readFile(await resolveInside(dir, 'script.json'), 'utf8')),
  );
  if (!parsed.success) throw new PermanentJobError('script.json is not an episode script');
  return parsed.data;
}

async function loadClips(workDir: string, jobId: string, acts: number): Promise<string[]> {
  const { dir, checkpoint } = await checkpointOf(workDir, jobId, 'tts');
  const tts = ttsResultSchema.safeParse(checkpoint.result);
  if (!tts.success) throw new PermanentJobError('tts job result has no clips');
  const scenes = [...tts.data.scenes].sort((a, b) => a.index - b.index);
  if (scenes.length !== acts) {
    throw new PermanentJobError(`tts job has ${scenes.length} clips for ${acts} acts`);
  }
  return Promise.all(scenes.map((scene) => resolveInside(dir, scene.file)));
}

const clock = (frames: number) => {
  const seconds = frames / FPS;
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, '0')}`;
};

/** The timeline as a table for people: shot, sentence, start, end, text, hold. */
export function toTimelineMarkdown(timing: EpisodeTiming): string {
  const index = new Map(timing.lines.map((line, i) => [line.id, i]));
  const rows = timing.shots.flatMap((shot) => {
    const first = index.get(shot.firstLine)!;
    const last = index.get(shot.lastLine)!;
    return timing.lines.slice(first, last + 1).map((line, k) => {
      const hold = line.hold ? `${line.hold}` : '';
      return `| ${k === 0 ? shot.id : ''} | ${line.id} | ${clock(line.from)} | ${clock(line.to)} | ${line.text} | ${hold} |`;
    });
  });
  return [
    `# Timeline`,
    '',
    `Total: **${timing.totalFrames} frames = ${clock(timing.totalFrames)}**; end card from ${clock(timing.endCardFrom)}.`,
    '',
    '| Shot | Sentence | Start | End | Text | Hold |',
    '|---|---|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');
}

async function analyse(context: HandlerContext, deps: TimingHandlerDeps, transcribe: Transcriber) {
  const { workDir, signal } = context;
  const input = inputSchema.parse(context.input);
  const script = await loadScript(workDir, input.script_job_id);
  const clips = await loadClips(workDir, input.tts_job_id, script.acts.length);

  await context.progress({ stage: 'voice' });
  await deps.buildVoice(
    clips,
    { voice: join(workDir, VOICE), analysis: join(workDir, ANALYSIS) },
    signal,
  );
  await context.progress({ stage: 'whisper' });
  const transcript = await transcribe(
    join(workDir, ANALYSIS),
    join(workDir, TRANSCRIPT_PREFIX),
    input.language,
    signal,
  );
  const pcm = await readPcm16(join(workDir, ANALYSIS));
  return { script, heard: parseWhisperJson(transcript), db: envelope(pcm.samples, pcm.sampleRate) };
}

export function createTimingHandler(deps: TimingHandlerDeps): JobHandler {
  return async (context) => {
    if (!inputSchema.safeParse(context.input).success) {
      throw new PermanentJobError('invalid timing input');
    }
    if (!deps.transcribe) {
      throw new ProviderBlockedError(
        'no whisper model configured (WHISPER_MODEL)',
        deps.blockSeconds,
      );
    }
    const { script, heard, db } = await analyse(context, deps, deps.transcribe);

    const sentences = episodeSentences(script.acts);
    const words = alignWords(sentences, heard);
    const shots = script.acts.flatMap((act, a) =>
      act.shots.map((shot) => ({ ...shot, act: a + 1 })),
    );
    let built: ReturnType<typeof buildTiming>;
    try {
      built = buildTiming({ sentences, words, shots, db, voice: VOICE });
    } catch (error: unknown) {
      throw new PermanentJobError(`timeline: ${(error as Error).message}`);
    }
    const bad = checkCuts(built.timing, db);
    if (bad.length > 0) {
      throw new PermanentJobError(
        `${bad.length} cuts land in speech: ${bad.slice(0, 5).join('; ')}`,
      );
    }

    const { workDir, logger } = context;
    await writeFileAtomic(join(workDir, TIMING), `${JSON.stringify(built.timing, null, 1)}\n`);
    await writeFileAtomic(join(workDir, CAPTIONS), `${JSON.stringify(built.captions, null, 0)}\n`);
    await writeFileAtomic(join(workDir, TIMELINE), toTimelineMarkdown(built.timing));

    const matched = words.flat().filter((w) => w.heard).length;
    const result = {
      sentences: sentences.length,
      shots: shots.length,
      total_seconds: built.timing.totalSec,
      words_matched: matched,
      words_total: words.flat().length,
      joins: built.timing.lines.filter((line) => line.joinNext).length,
      noise_floor_db: Math.round(built.floor * 10) / 10,
    };
    logger.info(result, 'episode timeline built');
    return {
      outputs: [VOICE, TIMING, CAPTIONS, TIMELINE, `${TRANSCRIPT_PREFIX}.json`],
      result,
    };
  };
}
