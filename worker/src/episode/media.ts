import { timingSafeEqual } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { resolveInside } from '../storage/workspace.js';

// The episode preview for WF-13 (D-057). Like storyboard pages (D-055), the capability is a token
// in a checkpoint: the media token of the qa_preview job, which names the render it checked. A file
// is served only when that render's checkpoint lists it. Every failure looks the same to the caller.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TOKEN = /^[0-9a-f]{32}$/;
const TYPES: Readonly<Record<string, string>> = {
  'preview.mp4': 'video/mp4',
  'vi.srt': 'application/x-subrip',
};

const qaSchema = z.object({
  result: z.object({ media_token: z.string(), render_job_id: z.string().regex(UUID) }),
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

export async function findPreviewMedia(
  workRoot: string,
  request: MediaRequest,
): Promise<MediaFile | null> {
  const { videoId, version, jobId, file, token } = request;
  const contentType = TYPES[file];
  if (!contentType || !UUID.test(videoId) || !UUID.test(jobId)) return null;
  if (!/^[1-9]\d{0,3}$/.test(version) || !TOKEN.test(token)) return null;
  try {
    const jobs = await resolveInside(workRoot, join('videos', videoId, `v${version}`, 'jobs'));
    const qa = qaSchema.parse(
      JSON.parse(await readFile(join(await resolveInside(jobs, jobId), 'checkpoint.json'), 'utf8')),
    );
    const expected = Buffer.from(qa.result.media_token);
    const given = Buffer.from(token);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    const renderDir = await resolveInside(jobs, qa.result.render_job_id);
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
