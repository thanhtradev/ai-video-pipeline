import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readdir, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pino from 'pino';
import { beforeEach, describe, expect, test } from 'vitest';
import {
  archiveDirectory,
  ArchiveConflictError,
  ArchiveVerificationError,
} from '../../src/archive/archiver.js';
import { createWebdavTarget, type ArchiveTarget } from '../../src/archive/webdav-target.js';

// Local docker-compose.test.yml WebDAV server only.
const target = createWebdavTarget({
  baseUrl: process.env.TEST_WEBDAV_URL ?? 'http://127.0.0.1:58080/',
  username: 'archive',
  password: 'archive',
});
const logger = pino({ level: 'silent' });

let localDir: string;
let remoteDir: string;

beforeEach(async () => {
  localDir = await mkdtemp(join(tmpdir(), 'archive-'));
  await mkdir(join(localDir, 'renders'));
  await mkdir(join(localDir, 'subtitles'));
  await mkdir(join(localDir, 'jobs', 'job-1'), { recursive: true });
  await writeFile(join(localDir, 'manifest.json'), '{"video":"x"}');
  await writeFile(join(localDir, 'renders', 'final 1080p.mp4'), randomBytes(200_000));
  await writeFile(
    join(localDir, 'subtitles', 'vi.srt'),
    '1\n00:00:00,000 --> 00:00:01,000\nXin chào\n',
  );
  await writeFile(join(localDir, 'jobs', 'job-1', 'tmp.bin'), 'scratch');
  remoteDir = `t-${randomBytes(4).toString('hex')}/2026/10/video/v1`;
});

async function listLocal(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true });
  return entries.sort();
}

describe('archiveDirectory', () => {
  test('uploads, verifies, and publishes the archive; skips jobs/', async () => {
    const before = await listLocal(localDir);

    const result = await archiveDirectory({ target, localDir, remoteDir, logger });

    expect(result).toMatchObject({ remotePath: remoteDir, fileCount: 4 });
    expect(result.manifestSha256).toMatch(/^[0-9a-f]{64}$/);
    const remote = (await target.list(remoteDir)).map((entry) => entry.path).sort();
    expect(remote).toEqual([
      'checksums.sha256',
      'manifest.json',
      'renders/final 1080p.mp4',
      'subtitles/vi.srt',
    ]);
    expect(await target.exists(`${remoteDir}.partial`)).toBe(false);
    // Local working copy is never deleted (D-014); only checksums.sha256 is added.
    expect(await listLocal(localDir)).toEqual([...before, 'checksums.sha256'].sort());
  });

  test('detects a corrupted upload and does not publish', async () => {
    const corrupting: ArchiveTarget = {
      ...target,
      upload: async (localPath, remotePath) => {
        await target.upload(localPath, remotePath);
        if (remotePath.endsWith('vi.srt')) {
          await target.putContent(remotePath, 'corrupted');
        }
      },
    };

    const run = archiveDirectory({ target: corrupting, localDir, remoteDir, logger });

    await expect(run).rejects.toBeInstanceOf(ArchiveVerificationError);
    await expect(run).rejects.toThrow(/subtitles\/vi\.srt/);
    expect(await target.exists(remoteDir)).toBe(false);
  });

  test('is idempotent when the same content is already archived', async () => {
    const first = await archiveDirectory({ target, localDir, remoteDir, logger });
    const second = await archiveDirectory({ target, localDir, remoteDir, logger });
    expect(second).toEqual(first);
  });

  test('refuses to overwrite a different existing archive', async () => {
    await archiveDirectory({ target, localDir, remoteDir, logger });
    await writeFile(join(localDir, 'manifest.json'), '{"video":"changed"}');

    await expect(archiveDirectory({ target, localDir, remoteDir, logger })).rejects.toBeInstanceOf(
      ArchiveConflictError,
    );
  });
});

describe('archiveDirectory local collection', () => {
  test('accepts a trailing slash on localDir and skips node_modules', async () => {
    await mkdir(join(localDir, 'remotion', 'node_modules', 'pkg'), { recursive: true });
    await writeFile(join(localDir, 'remotion', 'node_modules', 'pkg', 'index.js'), 'x');
    await writeFile(join(localDir, 'remotion', 'package-lock.json'), '{}');

    const result = await archiveDirectory({ target, localDir: `${localDir}/`, remoteDir, logger });

    const remote = (await target.list(remoteDir)).map((entry) => entry.path).sort();
    expect(remote).toContain('remotion/package-lock.json');
    expect(remote).toContain('renders/final 1080p.mp4');
    expect(remote.some((path) => path.includes('node_modules'))).toBe(false);
    expect(result.fileCount).toBe(5);
  });

  test('refuses to archive a directory containing symlinks', async () => {
    await symlink(join(localDir, 'manifest.json'), join(localDir, 'renders', 'link.json'));

    await expect(archiveDirectory({ target, localDir, remoteDir, logger })).rejects.toThrow(
      /symlink.*renders\/link\.json/,
    );
    expect(await target.exists(`${remoteDir}.partial`)).toBe(false);
  });
});

describe('webdav timeouts', () => {
  test('a server that never answers fails the request instead of hanging', async () => {
    const server = createServer(() => {
      // Accept the connection, never respond.
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const stuck = createWebdavTarget({
      baseUrl: `http://127.0.0.1:${port}/`,
      username: 'u',
      password: 'p',
      requestTimeoutMs: 200,
    });

    try {
      await expect(stuck.exists('anything')).rejects.toThrow(/timed out/);
    } finally {
      server.closeAllConnections();
      server.close();
    }
  });
});

describe('webdav target', () => {
  test('rejects remote paths that try to escape the base', async () => {
    await expect(target.exists('../outside')).rejects.toThrow(/invalid remote path/);
  });

  test('reports authentication failures clearly', async () => {
    const wrong = createWebdavTarget({
      baseUrl: 'http://127.0.0.1:58080/',
      username: 'archive',
      password: 'wrong',
    });
    await expect(wrong.exists('anything')).rejects.toThrow(/401/);
  });
});
