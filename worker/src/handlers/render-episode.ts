import { copyFile, link, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { runSandboxedNode } from '../episode/sandbox.js';
import { frameSchema, LANDSCAPE_FRAME, scaledFrame, type Frame } from '../episode/frame.js';
import { copyWorkspace, keepPreviousWorkspace, RENDER_SCRIPT } from '../episode/workspace.js';
import type { DurationProbe } from '../media/ffprobe.js';
import type { LoudnessNormalizer, LoudnessReport } from '../media/loudness.js';
import type { VideoScaler } from '../media/scale.js';
import { buildCues, toSrt } from '../render/subtitles.js';
import { readValidCheckpoint } from '../storage/checkpoint.js';
import { resolveInside } from '../storage/workspace.js';
import { PermanentJobError, ProviderBlockedError, type JobHandler } from '../runner.js';
import { NO_CHROME } from './episode-code.js';

// Episode `render_episode` step (q:render, docs/episode-pipeline.md §8): the approved storyboard's
// code rendered at 2/3 size (1280×720 for 16:9) with its burned-in captions, loudness normalised (D-032), plus a
// sidecar SRT from the sentence timeline. `render_final` (after A2, D-057) is the same at full size. The size is
// the kit's frame that the episode_code job recorded (D-080: 1920×1080 or 1080×1920). The render runs agent-written code, so it runs on a copy
// of the approved workspace under the worker's sandbox profile (D-054). Free (local).
// D-089: the preview job renders once at full size (master.mp4, the final's exact render) and
// scales preview.mp4 down from it; render_final links the preview job's master.mp4 instead of
// rendering the same code again. Without a usable master (older jobs) the final renders as before.

export const EPISODE_PREVIEW_SCALE = 2 / 3;
const MASTER = 'master.mp4';
const PREVIEW = 'preview.mp4';
const FINAL = 'final.mp4';
const FPS = 30;
const RENDER_TIMEOUT_MS = 90 * 60 * 1000;
const SRT = 'vi.srt';

const inputSchema = z.object({
  episode_code_job_id: z.uuid(),
  timing_job_id: z.uuid(),
  quality: z.enum(['preview', 'final']).default('preview'),
  /** render_final: the preview job whose full-size render it reuses (D-089). */
  preview_job_id: z.uuid().optional(),
});
type Input = z.infer<typeof inputSchema>;

/** What a D-089 preview job records about its full-size render. */
const previewResultSchema = z.object({
  episode_code_job_id: z.uuid(),
  master: z.object({ file: z.literal(MASTER), loudness: z.record(z.string(), z.number()) }),
});

// Episode code made before D-080 has no frame: those episodes are all 16:9.
const codeResultSchema = z.object({ frame: frameSchema.default(LANDSCAPE_FRAME) });

const timingSchema = z.object({
  totalFrames: z.number().int().positive(),
  lines: z.array(z.object({ text: z.string(), from: z.number(), to: z.number() })).min(1),
});

/** Renders `Episode` of the workspace `ws` (real path) to `output` (relative to it). */
export type EpisodeRenderer = (
  ws: string,
  output: string,
  scale: number,
  signal: AbortSignal,
) => Promise<void>;

export function createSandboxedEpisodeRenderer(
  profile: string,
  runtimeRoot: string,
  env?: Readonly<Record<string, string>>,
): EpisodeRenderer {
  return (ws, output, scale, signal) =>
    runSandboxedNode({
      profile,
      ws,
      runtimeRoot,
      ...(env ? { env } : {}),
      script: RENDER_SCRIPT,
      args: [ws, output, String(scale)],
      timeoutMs: RENDER_TIMEOUT_MS,
      signal,
    });
}

export interface RenderEpisodeDeps {
  render: EpisodeRenderer;
  loudness: LoudnessNormalizer;
  probe: DurationProbe;
  /** Scales the full-size render down to the preview (D-089). */
  scale: VideoScaler;
  /** False while Remotion's Chrome is missing: the job waits (BLOCKED) instead of failing. */
  browserReady: () => boolean;
  blockSeconds: number;
}

async function checkedJob(workDir: string, jobId: string, what: string) {
  const dir = await resolveInside(dirname(workDir), jobId);
  const checkpoint = await readValidCheckpoint(dir);
  if (!checkpoint) throw new PermanentJobError(`${what} job ${jobId} is missing or changed`);
  return { dir, checkpoint };
}

/** The preview job's full-size render of the same code, or null when it has none (D-089). */
async function reusableMaster(
  workDir: string,
  input: Input,
): Promise<{ file: string; loudness: LoudnessReport } | null> {
  if (input.quality !== 'final' || !input.preview_job_id) return null;
  // A missing or changed preview job is no reason to fail: the final is then rendered.
  const dir = await resolveInside(dirname(workDir), input.preview_job_id);
  const checkpoint = await readValidCheckpoint(dir);
  if (!checkpoint) return null;
  const parsed = previewResultSchema.safeParse(checkpoint.result);
  if (!parsed.success || parsed.data.episode_code_job_id !== input.episode_code_job_id) return null;
  if (!checkpoint.outputs.some((o) => o.path === MASTER)) return null;
  return {
    file: join(dir, MASTER),
    loudness: parsed.data.master.loudness as unknown as LoudnessReport,
  };
}

/** A hard link (same file, no copy); a copy where links are not possible. */
async function linkOrCopy(from: string, to: string): Promise<void> {
  await rm(to, { force: true });
  try {
    await link(from, to);
  } catch {
    await copyFile(from, to);
  }
}

export function createRenderEpisodeHandler(deps: RenderEpisodeDeps): JobHandler {
  /** Renders the copied workspace at full size, loudness normalised, to `output` in workDir. */
  const renderFull = async (ws: string, output: string, workDir: string, signal: AbortSignal) => {
    const raw = `out/${output.replace('.mp4', '.raw.mp4')}`;
    await deps.render(ws, raw, 1, signal);
    const loudness = await deps.loudness(join(ws, raw), join(workDir, output), signal);
    await rm(join(ws, raw), { force: true });
    return loudness;
  };

  return async ({ input, workDir, signal, attemptNo, logger, progress }) => {
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success) {
      throw new PermanentJobError(`invalid render_episode input: ${parsed.error.message}`);
    }
    if (!deps.browserReady()) throw new ProviderBlockedError(NO_CHROME, deps.blockSeconds);
    const code = await checkedJob(workDir, parsed.data.episode_code_job_id, 'episode_code');
    const { frame } = codeResultSchema.parse(code.checkpoint.result);
    const timingDir = (await checkedJob(workDir, parsed.data.timing_job_id, 'timing')).dir;
    const timing = timingSchema.parse(
      JSON.parse(await readFile(join(timingDir, 'timing.json'), 'utf8')),
    );
    const isFinal = parsed.data.quality === 'final';
    const master = await reusableMaster(workDir, parsed.data);

    let loudness: LoudnessReport;
    let video: Frame;
    if (master) {
      logger.info({ previewJobId: parsed.data.preview_job_id }, "reusing the preview job's render");
      await linkOrCopy(master.file, join(workDir, FINAL));
      loudness = master.loudness;
      video = frame;
    } else {
      // A failed earlier attempt's copy is kept for inspection, never deleted.
      await keepPreviousWorkspace(workDir, 'ws', attemptNo);
      const copy = join(workDir, 'ws');
      await copyWorkspace(join(code.dir, 'ws'), copy);
      const ws = await realpath(copy);
      logger.info({ frames: timing.totalFrames }, 'rendering episode');
      await progress({ stage: 'render', frames: timing.totalFrames });
      loudness = await renderFull(ws, isFinal ? FINAL : MASTER, workDir, signal);
      video = frame;
      if (!isFinal) {
        video = scaledFrame(frame, EPISODE_PREVIEW_SCALE);
        await progress({ stage: 'scale' });
        await deps.scale(join(workDir, MASTER), join(workDir, PREVIEW), video, signal);
      }
    }

    const cues = buildCues(
      timing.lines.map((line) => ({
        narration: line.text,
        startSeconds: line.from / FPS,
        speechSeconds: (line.to - line.from) / FPS,
      })),
    );
    await writeFile(join(workDir, SRT), toSrt(cues));
    const output = isFinal ? FINAL : PREVIEW;
    const durationSeconds = await deps.probe(join(workDir, output));

    return {
      outputs: isFinal ? [FINAL, SRT] : [PREVIEW, MASTER, SRT],
      result: {
        template: 'Episode',
        quality: parsed.data.quality,
        ...video,
        fps: FPS,
        frames: timing.totalFrames,
        duration_seconds: Math.round(durationSeconds * 100) / 100,
        subtitles: { language: 'vi', cues: cues.length, files: [SRT] },
        loudness,
        episode_code_job_id: parsed.data.episode_code_job_id,
        ...(isFinal ? {} : { master: { file: MASTER, ...frame, loudness } }),
        ...(master ? { reused_render: parsed.data.preview_job_id } : {}),
      },
    };
  };
}
