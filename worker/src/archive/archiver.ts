import { readdir } from 'node:fs/promises';
import { dirname, join, sep } from 'node:path';
import type { Logger } from 'pino';
import { sha256File, writeFileAtomic, type FileDigest } from '../storage/checkpoint.js';
import type { ArchiveTarget } from './webdav-target.js';

// Archive procedure from docs/storage-and-manifest.md §4:
// checksums -> upload to <dir>.partial -> verify count, size, SHA-256 (download and hash) -> rename.
// Never deletes anything, locally or remotely.

export const CHECKSUMS_FILE = 'checksums.sha256';
const EXCLUDED_TOP_LEVEL = new Set(['jobs']);

export class ArchiveVerificationError extends Error {
  override name = 'ArchiveVerificationError';
}

export class ArchiveConflictError extends Error {
  override name = 'ArchiveConflictError';
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

async function collectFiles(localDir: string): Promise<string[]> {
  const entries = await readdir(localDir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) =>
      join(entry.parentPath, entry.name)
        .slice(localDir.length + 1)
        .split(sep)
        .join('/'),
    )
    .filter((path) => !EXCLUDED_TOP_LEVEL.has(path.split('/')[0]!) && path !== CHECKSUMS_FILE)
    .sort();
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
  const remote = new Map((await target.list(remoteDir)).map((entry) => [entry.path, entry.bytes]));

  for (const path of remote.keys()) {
    if (!expected.has(path)) problems.push(`unexpected remote file ${path}`);
  }
  for (const [path, digest] of expected) {
    const remoteBytes = remote.get(path);
    if (remoteBytes === undefined) {
      problems.push(`missing ${path}`);
      continue;
    }
    if (remoteBytes !== digest.bytes) {
      problems.push(`size mismatch ${path}: ${remoteBytes} != ${digest.bytes}`);
      continue;
    }
    const remoteDigest = await target.hash(`${remoteDir}/${path}`);
    if (remoteDigest.sha256 !== digest.sha256) problems.push(`checksum mismatch ${path}`);
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

export async function archiveDirectory(input: ArchiveInput): Promise<ArchiveResult> {
  const { target, localDir, remoteDir, logger } = input;
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
  const dirs = new Set([...expected.keys()].map((path) => dirname(path)).filter((d) => d !== '.'));
  for (const dir of [...dirs].sort()) await target.ensureDir(`${partial}/${dir}`);
  for (const path of expected.keys()) {
    await target.upload(join(localDir, path), `${partial}/${path}`);
  }

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
