import { lstat, mkdir, mkdtemp, readdir, rename, rm, symlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { extract, type ReadEntry } from 'tar';
import { CHECKPOINT_FILE, readValidCheckpoint } from '../storage/checkpoint.js';
import { VIDEO_ID_PATTERN } from './export-video.js';

// Target side of a video move (D-087). The tar from the source worker is unpacked into
// WORK_ROOT/videos/.incoming/<id>-<random>, never straight into place. Only what a video folder
// holds is accepted: files and directories under <id>/, hard links to other entries of the
// copy, and the workspaces' node_modules symbolic link, which is re-created pointing at this
// worker's own node_modules. Every job checkpoint must match its files. Only then is an older
// copy of the video moved aside (never deleted) and the new folder renamed into place. Any
// problem rejects the whole copy and removes the incoming folder.

const FILE_TYPES = new Set(['File', 'OldFile', 'ContiguousFile', 'Directory']);
const NODE_MODULES = 'node_modules';
const VERSION_DIR = /^v\d+$/;

export class VideoImportError extends Error {
  override name = 'VideoImportError';
}

export interface ImportVideoOptions {
  workRoot: string;
  videoId: string;
  /** The tar stream from the source worker's /transfer endpoint. */
  source: Readable;
  /** This worker's repo node_modules, the target of every workspace link. */
  nodeModules: string;
}

export interface ImportResult {
  /** Job checkpoints verified. */
  checkpoints: number;
  /** node_modules links re-created. */
  relinked: number;
  /** Where an older copy of the video was moved, or null. */
  movedAside: string | null;
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

function isInsideVideo(path: string, videoId: string): boolean {
  const parts = path.replace(/\/+$/, '').split('/');
  return !path.startsWith('/') && !parts.includes('..') && parts[0] === videoId;
}

/** Why an entry is refused, or null; node_modules links are collected instead of extracted. */
function refusal(path: string, entry: ReadEntry, videoId: string, links: string[]): string | null {
  if (!isInsideVideo(path, videoId)) return `entry outside the video: ${path}`;
  const parts = path.replace(/\/+$/, '').split('/');
  if (parts.slice(0, -1).includes(NODE_MODULES)) {
    return `entry inside a node_modules link: ${path}`;
  }
  if (FILE_TYPES.has(entry.type)) return null;
  if (entry.type === 'SymbolicLink') {
    if (parts.at(-1) !== NODE_MODULES) return `symbolic link not allowed: ${path}`;
    links.push(parts.join('/'));
    return null;
  }
  if (entry.type === 'Link') {
    return isInsideVideo(entry.linkpath ?? '', videoId)
      ? null
      : `hard link outside the video: ${path}`;
  }
  return `entry type ${entry.type} not allowed: ${path}`;
}

async function unpack(source: Readable, staging: string, videoId: string): Promise<string[]> {
  const refusals: string[] = [];
  const links: string[] = [];
  try {
    await pipeline(
      source,
      extract({
        cwd: staging,
        strict: true,
        preserveOwner: false,
        filter: (path, entry) => {
          const reason = refusal(path, entry as ReadEntry, videoId, links);
          if (reason) refusals.push(reason);
          // node_modules links are re-created by relink(), not extracted.
          return reason === null && (entry as ReadEntry).type !== 'SymbolicLink';
        },
      }),
    );
  } catch (error: unknown) {
    if (refusals.length > 0) throw new VideoImportError(refusals[0]!);
    const message = error instanceof Error ? error.message : String(error);
    throw new VideoImportError(`the copy is not a valid archive: ${message}`);
  }
  if (refusals.length > 0) throw new VideoImportError(refusals[0]!);
  return links;
}

async function relink(staging: string, links: string[], nodeModules: string): Promise<void> {
  for (const path of links) {
    const target = join(staging, path);
    await mkdir(dirname(target), { recursive: true });
    await symlink(nodeModules, target);
  }
}

async function subdirectories(dir: string): Promise<string[]> {
  if (!(await exists(dir))) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

/** Verifies every job checkpoint of every version; returns how many there were. */
async function verifyCheckpoints(videoDir: string): Promise<number> {
  let count = 0;
  for (const version of (await subdirectories(videoDir)).filter((name) => VERSION_DIR.test(name))) {
    const jobsDir = join(videoDir, version, 'jobs');
    for (const job of await subdirectories(jobsDir)) {
      const jobDir = join(jobsDir, job);
      if (!(await exists(join(jobDir, CHECKPOINT_FILE)))) continue;
      if (!(await readValidCheckpoint(jobDir))) {
        throw new VideoImportError(`checkpoint does not match its files: ${version}/jobs/${job}`);
      }
      count += 1;
    }
  }
  return count;
}

async function moveAside(videosDir: string, videoId: string): Promise<string | null> {
  const current = join(videosDir, videoId);
  if (!(await exists(current))) return null;
  const aside = join(videosDir, '.moved-away', `${videoId}-${Date.now()}`);
  await mkdir(dirname(aside), { recursive: true });
  await rename(current, aside);
  return aside;
}

export async function importVideo(options: ImportVideoOptions): Promise<ImportResult> {
  const { workRoot, videoId, source, nodeModules } = options;
  if (!VIDEO_ID_PATTERN.test(videoId)) throw new VideoImportError('invalid video id');
  const videosDir = join(workRoot, 'videos');
  const incoming = join(videosDir, '.incoming');
  await mkdir(incoming, { recursive: true });
  const staging = await mkdtemp(join(incoming, `${videoId}-`));
  try {
    const links = await unpack(source, staging, videoId);
    const copied = join(staging, videoId);
    if (!(await exists(copied))) {
      throw new VideoImportError('the copy holds no folder for the video');
    }
    await relink(staging, links, nodeModules);
    const checkpoints = await verifyCheckpoints(copied);
    const movedAside = await moveAside(videosDir, videoId);
    await rename(copied, join(videosDir, videoId));
    return { checkpoints, relinked: links.length, movedAside };
  } finally {
    // Only this attempt's own incoming folder; empty after a successful rename.
    await rm(staging, { recursive: true, force: true });
  }
}
