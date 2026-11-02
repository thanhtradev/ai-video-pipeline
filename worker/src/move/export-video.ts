import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { create } from 'tar';
import { resolveInside } from '../storage/workspace.js';

// Source side of a video move (D-087): the whole WORK_ROOT/videos/<id> folder (every version, every
// job folder) as a tar stream. Symbolic links are stored as links, never followed, so the
// workspaces' node_modules link is sent as a link and the target re-points it.

export const VIDEO_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A tar of the video's folder, or null when the id is invalid or the folder does not exist. */
export async function exportVideo(workRoot: string, videoId: string): Promise<Readable | null> {
  if (!VIDEO_ID_PATTERN.test(videoId)) return null;
  try {
    const dir = await resolveInside(workRoot, join('videos', videoId));
    if (!(await stat(dir)).isDirectory()) return null;
  } catch {
    return null;
  }
  const pack = create({ cwd: join(workRoot, 'videos'), portable: true, follow: false }, [videoId]);
  return Readable.from(pack);
}
