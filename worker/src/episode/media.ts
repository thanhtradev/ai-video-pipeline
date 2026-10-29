import { timingSafeEqual } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { resolveInside } from '../storage/workspace.js';

// Episode media for Telegram (D-057, D-062, D-070). Like storyboard pages (D-055), the capability is
// a token in a job's checkpoint: a qa_preview job serves the preview of the render it checked, a
// metadata job its own thumbnail, a script job its script.md. A file is served only when a checkpoint lists it. Every failure
// looks the same to the caller.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TOKEN = /^[0-9a-f]{32}$/;
const TYPES: Readonly<Record<string, string>> = {
  'preview.mp4': 'video/mp4',
  'vi.srt': 'application/x-subrip',
  'thumbnail.jpg': 'image/jpeg',
  'script.md': 'text/markdown; charset=utf-8',
};

const checkpointSchema = z.object({
  outputs: z.array(z.object({ path: z.string() })),
  result: z.object({ media_token: z.string(), render_job_id: z.string().regex(UUID).optional() }),
});
const renderSchema = z.object({ outputs: z.array(z.object({ path: z.string() })) });

export interface MediaRequest {
  videoId: string;
  version: string;
  jobId: string;
  file: string;
  token: string;
}

export interface MediaFile {
  path: string;
  bytes: number;
  contentType: string;
}

export async function findEpisodeMedia(
  workRoot: string,
  request: MediaRequest,
): Promise<MediaFile | null> {
  const { videoId, version, jobId, file, token } = request;
  const contentType = TYPES[file];
  if (!contentType || !UUID.test(videoId) || !UUID.test(jobId)) return null;
  if (!/^[1-9]\d{0,3}$/.test(version) || !TOKEN.test(token)) return null;
  try {
    const jobs = await resolveInside(workRoot, join('videos', videoId, `v${version}`, 'jobs'));
    const jobDir = await resolveInside(jobs, jobId);
    const job = checkpointSchema.parse(
      JSON.parse(await readFile(join(jobDir, 'checkpoint.json'), 'utf8')),
    );
    const expected = Buffer.from(job.result.media_token);
    const given = Buffer.from(token);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    if (job.outputs.some((o) => o.path === file)) {
      const path = await resolveInside(jobDir, file);
      return { path, bytes: (await stat(path)).size, contentType };
    }
    if (!job.result.render_job_id) return null;
    const renderDir = await resolveInside(jobs, job.result.render_job_id);
    const render = renderSchema.parse(
      JSON.parse(await readFile(join(renderDir, 'checkpoint.json'), 'utf8')),
    );
    if (!render.outputs.some((o) => o.path === file)) return null;
    const path = await resolveInside(renderDir, file);
    return { path, bytes: (await stat(path)).size, contentType };
  } catch {
    return null;
  }
}
