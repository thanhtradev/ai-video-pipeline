import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { overallLevel, previewChecks } from '../episode/qa.js';
import type { GapDetector, MediaInspector } from '../media/inspect.js';
import { readValidCheckpoint, writeFileAtomic } from '../storage/checkpoint.js';
import { resolveInside } from '../storage/workspace.js';
import { PermanentJobError, type JobHandler } from '../runner.js';
import { EPISODE_PREVIEW_SCALE } from './render-episode.js';

// Episode `qa_preview` step (q:light, D-057, docs/quality-and-approval.md §3): checks the 720p
// preview of a render_episode job before A2. Any FAIL is permanent (the video needs a decision;
// QA is never retried until it passes); WARN goes into the A2 message. The result carries the
// media token that lets WF-13 fetch the preview from the worker API (D-055). `qa_final` (D-062) runs
// the same checks on the 1080p final.mp4 before A3. Free (local).

const REPORT = 'qa-report.json';
const SRT = 'vi.srt';
const FPS = 30;

const QUALITIES = {
  preview: { video: 'preview.mp4', scale: EPISODE_PREVIEW_SCALE },
  final: { video: 'final.mp4', scale: 1 },
} as const;

const inputSchema = z.object({
  render_job_id: z.uuid(),
  timing_job_id: z.uuid(),
  quality: z.enum(['preview', 'final']).default('preview'),
});
const renderSchema = z.object({
  loudness: z.object({ output_lufs: z.number(), output_true_peak: z.number() }),
});
const timingSchema = z.object({ totalFrames: z.number().int().positive() });

export interface QaPreviewDeps {
  inspect: MediaInspector;
  detectGaps: GapDetector;
}

async function finishedJob(workDir: string, jobId: string, what: string) {
  const dir = await resolveInside(dirname(workDir), jobId);
  const checkpoint = await readValidCheckpoint(dir);
  if (!checkpoint) throw new PermanentJobError(`${what} job ${jobId} is missing or changed`);
  return { dir, checkpoint };
}

export function createQaPreviewHandler(deps: QaPreviewDeps): JobHandler {
  return async ({ input, workDir, signal, logger, progress }) => {
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success) {
      throw new PermanentJobError(`invalid qa_preview input: ${parsed.error.message}`);
    }
    const render = await finishedJob(workDir, parsed.data.render_job_id, 'render_episode');
    const timing = await finishedJob(workDir, parsed.data.timing_job_id, 'timing');
    const { loudness } = renderSchema.parse(render.checkpoint.result);
    const { totalFrames } = timingSchema.parse(
      JSON.parse(await readFile(join(timing.dir, 'timing.json'), 'utf8')),
    );

    await progress({ stage: 'qa' });
    const { video: file, scale } = QUALITIES[parsed.data.quality];
    const video = join(render.dir, file);
    const info = await deps.inspect(video);
    const checks = previewChecks({
      info,
      gaps: await deps.detectGaps(video, signal),
      expected: {
        width: Math.round(1920 * scale),
        height: Math.round(1080 * scale),
        fps: FPS,
        seconds: totalFrames / FPS,
      },
      loudness,
      srt: await readFile(join(render.dir, SRT), 'utf8'),
    });
    const level = overallLevel(checks);
    // Written before a FAIL too, for whoever decides.
    await writeFileAtomic(join(workDir, REPORT), `${JSON.stringify({ level, checks }, null, 1)}\n`);
    logger.info({ level }, 'preview QA');
    if (level === 'FAIL') {
      const failed = checks.filter((c) => c.level === 'FAIL');
      throw new PermanentJobError(
        `QA failed: ${failed.map((c) => `${c.name} (${c.detail})`).join('; ')}`,
      );
    }

    return {
      outputs: [REPORT],
      result: {
        level,
        checks,
        render_job_id: parsed.data.render_job_id,
        duration_seconds: Math.round(info.durationSeconds * 10) / 10,
        loudness,
        // Capability for GET /media/… (D-055): only Postgres readers (n8n) learn it.
        media_token: randomBytes(16).toString('hex'),
      },
    };
  };
}
