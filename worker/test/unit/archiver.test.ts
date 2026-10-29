import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pino from 'pino';
import { beforeEach, describe, expect, test } from 'vitest';
import { archiveDirectory, ArchiveVerificationError } from '../../src/archive/archiver.js';
import type { ArchiveTarget } from '../../src/archive/webdav-target.js';

// A target that uploads in one call and lists SHA-256 (rclone, D-063) is verified from the listing:
// no per-file upload or hash call, and a listed hash that does not match still fails verification.

const logger = pino({ level: 'silent' });
const sha256 = (data: Buffer) => createHash('sha256').update(data).digest('hex');

let localDir: string;

beforeEach(async () => {
  localDir = await mkdtemp(join(tmpdir(), 'archiver-'));
  await mkdir(join(localDir, 'renders'));
  await writeFile(join(localDir, 'manifest.json'), '{"video":"x"}');
  await writeFile(join(localDir, 'renders', 'final.mp4'), 'video bytes');
});

/** In memory; lists SHA-256 for every file except those in `unhashed`. */
function batchTarget(options: { unhashed?: string[]; corrupt?: string } = {}) {
  const files = new Map<string, Buffer>();
  const calls: string[] = [];
  const target: ArchiveTarget = {
    exists: async (path) => [...files.keys()].some((key) => key.startsWith(`${path}/`)),
    ensureDir: async () => {
      calls.push('ensureDir');
    },
    upload: async () => {
      calls.push('upload');
    },
    uploadFiles: async (dir, remoteDir, paths) => {
      calls.push('uploadFiles');
      for (const path of paths) {
        const data =
          path === options.corrupt ? Buffer.from('corrupt!!!!') : await readFile(join(dir, path));
        files.set(`${remoteDir}/${path}`, data);
      }
    },
    putContent: async () => {},
    list: async (remoteDir) => {
      calls.push('list');
      return [...files]
        .filter(([key]) => key.startsWith(`${remoteDir}/`))
        .map(([key, data]) => {
          const path = key.slice(remoteDir.length + 1);
          return options.unhashed?.includes(path)
            ? { path, bytes: data.length }
            : { path, bytes: data.length, sha256: sha256(data) };
        });
    },
    hash: async (path) => {
      calls.push('hash');
      const data = files.get(path)!;
      return { sha256: sha256(data), bytes: data.length };
    },
    move: async (from, to) => {
      calls.push('move');
      for (const [key, data] of [...files]) {
        if (!key.startsWith(`${from}/`)) continue;
        files.delete(key);
        files.set(`${to}/${key.slice(from.length + 1)}`, data);
      }
    },
  };
  return { target, calls };
}

describe('archiveDirectory with a batch target', () => {
  test('uploads in one call and verifies from the listed hashes', async () => {
    const { target, calls } = batchTarget();

    const result = await archiveDirectory({ target, localDir, remoteDir: '2026/10/v/v1', logger });

    expect(result.fileCount).toBe(3);
    expect(calls).toEqual(['ensureDir', 'uploadFiles', 'list', 'move']);
  });

  test('hashes only the files the listing has no SHA-256 for', async () => {
    const { target, calls } = batchTarget({ unhashed: ['manifest.json'] });

    await archiveDirectory({ target, localDir, remoteDir: '2026/10/v/v1', logger });

    expect(calls.filter((call) => call === 'hash')).toHaveLength(1);
  });

  test('a listed hash that does not match fails verification', async () => {
    const { target, calls } = batchTarget({ corrupt: 'renders/final.mp4' });

    const run = archiveDirectory({ target, localDir, remoteDir: '2026/10/v/v1', logger });

    await expect(run).rejects.toBeInstanceOf(ArchiveVerificationError);
    await expect(run).rejects.toThrow(/checksum mismatch renders\/final.mp4/);
    expect(calls).not.toContain('move');
  });
});
