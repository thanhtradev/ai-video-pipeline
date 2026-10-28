import { existsSync } from 'node:fs';
import { readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { runSandboxedNode } from '../episode/sandbox.js';
import { copyWorkspace, RENDER_SCRIPT } from '../episode/workspace.js';
import type { DurationProbe } from '../media/ffprobe.js';
import type { LoudnessNormalizer } from '../media/loudness.js';
import { buildCues, toSrt } from '../render/subtitles.js';
import { readValidCheckpoint } from '../storage/checkpoint.js';
import { resolveInside } from '../storage/workspace.js';
import { PermanentJobError, ProviderBlockedError, type JobHandler } from '../runner.js';
import { NO_CHROME } from './episode-code.js';

// Episode `render_episode` step (q:render, docs/episode-pipeline.md §8): the approved storyboard's
// code rendered at 1280×720 with its burned-in captions, loudness normalised (D-032), plus a
// sidecar SRT from the sentence timeline. `render_final` (after A2, D-057) is the same at 1920×1080. The render runs agent-written code, so it runs on a copy
// of the approved workspace under the worker's sandbox profile (D-054). Free (local).

export const EPISODE_PREVIEW_SCALE = 2 / 3;
const QUALITIES = {
  preview: { scale: EPISODE_PREVIEW_SCALE, video: 'preview.mp4' },
  final: { scale: 1, video: 'final.mp4' },
} as const;
const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 30;
const RENDER_TIMEOUT_MS = 90 * 60 * 1000;
const SRT = 'vi.srt';

const inputSchema = z.object({
  episode_code_job_id: z.uuid(),
  timing_job_id: z.uuid(),
  quality: z.enum(['preview', 'final']).default('preview'),
});

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
): EpisodeRenderer {
  return (ws, output, scale, signal) =>
    runSandboxedNode({
      profile,
      ws,
      runtimeRoot,
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
  /** False while Remotion's Chrome is missing: the job waits (BLOCKED) instead of failing. */
  browserReady: () => boolean;
  blockSeconds: number;
}

async function checkedJobDir(workDir: string, jobId: string, what: string): Promise<string> {
  const dir = await resolveInside(dirname(workDir), jobId);
  if (!(await readValidCheckpoint(dir))) {
    throw new PermanentJobError(`${what} job ${jobId} is missing or changed`);
  }
  return dir;
}

export function createRenderEpisodeHandler(deps: RenderEpisodeDeps): JobHandler {
  return async ({ input, workDir, signal, attemptNo, logger, progress }) => {
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success) {
      throw new PermanentJobError(`invalid render_episode input: ${parsed.error.message}`);
    }
    if (!deps.browserReady()) throw new ProviderBlockedError(NO_CHROME, deps.blockSeconds);
    const codeDir = await checkedJobDir(workDir, parsed.data.episode_code_job_id, 'episode_code');
    const timingDir = await checkedJobDir(workDir, parsed.data.timing_job_id, 'timing');
    const timing = timingSchema.parse(
      JSON.parse(await readFile(join(timingDir, 'timing.json'), 'utf8')),
    );

    // A failed earlier attempt's copy is kept for inspection, never deleted.
    const copy = join(workDir, 'ws');
    if (existsSync(copy)) await rename(copy, join(workDir, `ws.attempt-${attemptNo - 1}`));
    await copyWorkspace(join(codeDir, 'ws'), copy);
    const ws = await realpath(copy);
    const { scale, video } = QUALITIES[parsed.data.quality];
    const raw = `out/${video.replace('.mp4', '.raw.mp4')}`;

    logger.info({ frames: timing.totalFrames }, 'rendering episode');
    await progress({ stage: 'render', frames: timing.totalFrames });
    await deps.render(ws, raw, scale, signal);
    await progress({ stage: 'loudness' });
    const loudness = await deps.loudness(join(ws, raw), join(workDir, video), signal);
    await rm(join(ws, raw), { force: true });

    const cues = buildCues(
      timing.lines.map((line) => ({
        narration: line.text,
        startSeconds: line.from / FPS,
        speechSeconds: (line.to - line.from) / FPS,
      })),
    );
    await writeFile(join(workDir, SRT), toSrt(cues));
    const durationSeconds = await deps.probe(join(workDir, video));

    return {
      outputs: [video, SRT],
      result: {
        template: 'Episode',
        quality: parsed.data.quality,
        width: Math.round(WIDTH * scale),
        height: Math.round(HEIGHT * scale),
        fps: FPS,
        frames: timing.totalFrames,
        duration_seconds: Math.round(durationSeconds * 100) / 100,
        subtitles: { language: 'vi', cues: cues.length, files: [SRT] },
        loudness,
      },
    };
  };
}
