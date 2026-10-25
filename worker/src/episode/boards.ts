import { timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { resolveInside } from '../storage/workspace.js';

// Storyboard pages for WF-12 (D-055). The capability is the board token the episode_code job
// stored in its checkpoint (and in Postgres); a page is served only when the job listed it.
// Every failure looks the same to the caller.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PAGE = /^page-\d{2}\.jpg$/;
const TOKEN = /^[0-9a-f]{32}$/;

const checkpointSchema = z.object({
  result: z.object({ board_token: z.string(), board_pages: z.array(z.string()) }),
});

export interface BoardRequest {
  videoId: string;
  version: string;
  jobId: string;
  page: string;
  token: string;
}

export async function readBoardPage(
  workRoot: string,
  request: BoardRequest,
): Promise<Buffer | null> {
  const { videoId, version, jobId, page, token } = request;
  if (!UUID.test(videoId) || !UUID.test(jobId) || !/^[1-9]\d{0,3}$/.test(version)) return null;
  if (!PAGE.test(page) || !TOKEN.test(token)) return null;
  try {
    const jobDir = await resolveInside(
      workRoot,
      join('videos', videoId, `v${version}`, 'jobs', jobId),
    );
    const checkpoint = checkpointSchema.parse(
      JSON.parse(await readFile(join(jobDir, 'checkpoint.json'), 'utf8')),
    );
    const expected = Buffer.from(checkpoint.result.board_token);
    const given = Buffer.from(token);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    const relative = `ws/board/${page}`;
    if (!checkpoint.result.board_pages.includes(relative)) return null;
    return await readFile(await resolveInside(jobDir, relative));
  } catch {
    return null;
  }
}
