import { execFile } from 'node:child_process';
import type { FileDigest } from '../storage/checkpoint.js';
import type { ArchiveTarget } from './webdav-target.js';

// Google Drive as the archive (D-063) through rclone: a remote created once by the owner with
// `rclone config` (personal account, OAuth, scope drive.file so rclone sees only what it created).
// The OAuth token lives in rclone's config file, never in this repo; the worker only runs rclone.
// Uses lsjson, mkdir, copyto, rcat, hashsum and moveto; it never deletes anything remote.

const SHA256 = /^[0-9a-f]{64}$/;
/** rclone exit codes for "directory not found" and "file not found". */
const NOT_FOUND_CODES = new Set([3, 4]);
const GLOBAL_FLAGS = ['--retries', '3', '--low-level-retries', '10'];

export class RcloneError extends Error {
  override name = 'RcloneError';

  constructor(
    message: string,
    readonly exitCode: number | null,
  ) {
    super(message);
  }
}

/** Runs rclone with arguments (and optional stdin); resolves stdout, rejects with RcloneError. */
export type RcloneRunner = (args: readonly string[], input?: string) => Promise<string>;

export function createRcloneRunner(bin: string, timeoutMs: number): RcloneRunner {
  return (args, input) =>
    new Promise((resolve, reject) => {
      const child = execFile(
        bin,
        [...GLOBAL_FLAGS, ...args],
        { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 },
        (error, stdout, stderr) => {
          if (!error) return resolve(stdout);
          const code = typeof error.code === 'number' ? error.code : null;
          reject(
            new RcloneError(
              `rclone ${args[0]} failed (${code}): ${stderr.trim().slice(-500)}`,
              code,
            ),
          );
        },
      );
      child.stdin?.end(input ?? '');
    });
}

export interface RcloneTargetOptions {
  run: RcloneRunner;
  /** e.g. "aivideo-drive:AI Video Archive" */
  root: string;
}

interface LsEntry {
  Path: string;
  Size: number;
  IsDir?: boolean;
}

export function createRcloneTarget(options: RcloneTargetOptions): ArchiveTarget {
  const { run } = options;
  const at = (path: string) => `${options.root.replace(/\/+$/, '')}/${path}`;

  const stat = async (path: string): Promise<LsEntry | null> => {
    try {
      return JSON.parse(await run(['lsjson', '--stat', at(path)])) as LsEntry;
    } catch (error: unknown) {
      if (error instanceof RcloneError && NOT_FOUND_CODES.has(error.exitCode ?? -1)) return null;
      throw error;
    }
  };

  const sha256 = async (path: string, download: boolean): Promise<string | null> => {
    const args = ['hashsum', 'sha256', ...(download ? ['--download'] : []), at(path)];
    try {
      const hash = (await run(args)).trim().split(/\s+/)[0] ?? '';
      return SHA256.test(hash) ? hash : null;
    } catch (error: unknown) {
      if (download) throw error;
      return null;
    }
  };

  return {
    exists: async (path) => (await stat(path)) !== null,
    ensureDir: async (path) => {
      await run(['mkdir', at(path)]);
    },
    upload: async (localPath, remotePath) => {
      await run(['copyto', localPath, at(remotePath)]);
    },
    putContent: async (remotePath, content) => {
      await run(['rcat', at(remotePath)], content);
    },
    list: async (remoteDir) => {
      const entries = JSON.parse(
        await run(['lsjson', '-R', '--files-only', at(remoteDir)]),
      ) as LsEntry[];
      return entries.map((entry) => ({ path: entry.Path, bytes: entry.Size }));
    },
    // Drive keeps a SHA-256 of every file; when it is not available yet, rclone downloads the file
    // and hashes it, which is what the Nextcloud target always did.
    hash: async (remotePath): Promise<FileDigest> => {
      const entry = await stat(remotePath);
      if (!entry) throw new RcloneError(`${remotePath} not found`, 4);
      const hash = (await sha256(remotePath, false)) ?? (await sha256(remotePath, true));
      if (!hash) throw new RcloneError(`no SHA-256 for ${remotePath}`, null);
      return { sha256: hash, bytes: entry.Size };
    },
    move: async (fromPath, toPath) => {
      if (await stat(toPath)) throw new RcloneError(`${toPath} already exists`, null);
      await run(['moveto', at(fromPath), at(toPath)]);
    },
  };
}
