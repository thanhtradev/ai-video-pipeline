import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import type { Logger } from 'pino';
import { sha256File, writeFileAtomic, type FileDigest } from '../storage/checkpoint.js';
import type { ArchiveTarget } from './webdav-target.js';

// Archive procedure from docs/storage-and-manifest.md §4:
// checksums -> upload to <dir>.partial -> verify count, size, SHA-256 (listed by the target, or
// downloaded and hashed) -> rename.
// Never deletes anything, locally or remotely.

export const CHECKSUMS_FILE = 'checksums.sha256';
// jobs/ holds per-attempt scratch space; node_modules is reproducible from the lockfile (manifest).
const EXCLUDED_TOP_LEVEL = new Set(['jobs']);
const EXCLUDED_ANYWHERE = new Set(['node_modules']);

export class ArchiveVerificationError extends Error {
  override name = 'ArchiveVerificationError';
}

export class ArchiveConflictError extends Error {
  override name = 'ArchiveConflictError';
}

/** The working directory cannot be archived as-is (e.g. it contains symlinks). */
export class ArchiveSourceError extends Error {
  override name = 'ArchiveSourceError';
}

export interface ArchiveInput {
  target: ArchiveTarget;
  localDir: string;
  /** Relative to the target base, e.g. 2026/10/<video_id>/v1. */
  remoteDir: string;
  logger: Logger;
}

export interface ArchiveResult {
  remotePath: string;
  fileCount: number;
  totalBytes: number;
  manifestSha256: string;
}

type Expected = Map<string, FileDigest>;

function isExcluded(path: string): boolean {
  const segments = path.split('/');
  return (
    path === CHECKSUMS_FILE ||
    EXCLUDED_TOP_LEVEL.has(segments[0]!) ||
    segments.some((segment) => EXCLUDED_ANYWHERE.has(segment))
  );
}

/** Relative, '/'-separated paths of every regular file to archive. Symlinks are refused, not
 * skipped: silently leaving a file out would let verification pass on an incomplete archive. */
async function collectFiles(localDir: string): Promise<string[]> {
  const root = resolve(localDir);
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = relative(root, join(entry.parentPath, entry.name)).split(sep).join('/');
    if (isExcluded(path)) continue;
    if (entry.isSymbolicLink()) {
      throw new ArchiveSourceError(`cannot archive symlink ${path}; replace it with the real file`);
    }
    if (entry.isFile()) files.push(path);
  }
  return files.sort();
}

async function buildChecksums(localDir: string): Promise<Expected> {
  const expected: Expected = new Map();
  for (const path of await collectFiles(localDir)) {
    expected.set(path, await sha256File(join(localDir, path)));
  }
  const lines = [...expected].map(([path, digest]) => `${digest.sha256}  ${path}\n`).join('');
  await writeFileAtomic(join(localDir, CHECKSUMS_FILE), lines);
  expected.set(CHECKSUMS_FILE, await sha256File(join(localDir, CHECKSUMS_FILE)));
  return expected;
}

async function findProblems(
  target: ArchiveTarget,
  remoteDir: string,
  expected: Expected,
): Promise<string[]> {
  const problems: string[] = [];
  const remote = new Map((await target.list(remoteDir)).map((entry) => [entry.path, entry]));

  for (const path of remote.keys()) {
    if (!expected.has(path)) problems.push(`unexpected remote file ${path}`);
  }
  for (const [path, digest] of expected) {
    const entry = remote.get(path);
    if (entry === undefined) {
      problems.push(`missing ${path}`);
      continue;
    }
    if (entry.bytes !== digest.bytes) {
      problems.push(`size mismatch ${path}: ${entry.bytes} != ${digest.bytes}`);
      continue;
    }
    const remoteSha256 = entry.sha256 ?? (await target.hash(`${remoteDir}/${path}`)).sha256;
    if (remoteSha256 !== digest.sha256) problems.push(`checksum mismatch ${path}`);
  }
  return problems;
}

function summarize(remoteDir: string, expected: Expected): ArchiveResult {
  let totalBytes = 0;
  for (const digest of expected.values()) totalBytes += digest.bytes;
  return {
    remotePath: remoteDir,
    fileCount: expected.size,
    totalBytes,
    manifestSha256: expected.get(CHECKSUMS_FILE)!.sha256,
  };
}

/**
 * Problems with an existing archive, against the checksums.sha256 written when it was made (local
 * sizes, remote sizes and SHA-256). Empty means the remote copy is complete and intact. Used right
 * before deleting the local copy (D-063).
 */
export async function verifyArchive(
  target: ArchiveTarget,
  localDir: string,
  remoteDir: string,
): Promise<{ problems: string[]; checksumsSha256: string }> {
  const dir = resolve(localDir);
  const lines = (await readFile(join(dir, CHECKSUMS_FILE), 'utf8')).split('\n').filter(Boolean);
  const expected: Expected = new Map();
  for (const line of lines) {
    const match = /^([0-9a-f]{64}) {2}(.+)$/.exec(line);
    if (!match) throw new ArchiveSourceError(`malformed ${CHECKSUMS_FILE} line: ${line}`);
    const bytes = (await stat(join(dir, match[2]!))).size;
    expected.set(match[2]!, { sha256: match[1]!, bytes });
  }
  const checksums = await sha256File(join(dir, CHECKSUMS_FILE));
  expected.set(CHECKSUMS_FILE, checksums);
  return {
    problems: await findProblems(target, remoteDir, expected),
    checksumsSha256: checksums.sha256,
  };
}

async function uploadAll(
  target: ArchiveTarget,
  localDir: string,
  remoteDir: string,
  paths: string[],
): Promise<void> {
  if (target.uploadFiles) return target.uploadFiles(localDir, remoteDir, paths);
  const dirs = new Set(paths.map((path) => dirname(path)).filter((d) => d !== '.'));
  for (const dir of [...dirs].sort()) await target.ensureDir(`${remoteDir}/${dir}`);
  for (const path of paths) await target.upload(join(localDir, path), `${remoteDir}/${path}`);
}

export async function archiveDirectory(input: ArchiveInput): Promise<ArchiveResult> {
  const { target, remoteDir, logger } = input;
  const localDir = resolve(input.localDir);
  const expected = await buildChecksums(localDir);

  if (await target.exists(remoteDir)) {
    const problems = await findProblems(target, remoteDir, expected);
    if (problems.length > 0) {
      throw new ArchiveConflictError(
        `archive ${remoteDir} already exists with different content: ${problems.join('; ')}`,
      );
    }
    logger.info({ remoteDir }, 'archive already present and verified');
    return summarize(remoteDir, expected);
  }

  const partial = `${remoteDir}.partial`;
  await target.ensureDir(partial);
  await uploadAll(target, localDir, partial, [...expected.keys()]);

  const problems = await findProblems(target, partial, expected);
  if (problems.length > 0) {
    throw new ArchiveVerificationError(
      `archive verification failed for ${partial}: ${problems.join('; ')}`,
    );
  }

  await target.move(partial, remoteDir);
  const result = summarize(remoteDir, expected);
  logger.info({ ...result }, 'archive verified and published');
  return result;
}
