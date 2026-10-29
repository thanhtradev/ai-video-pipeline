import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pino from 'pino';
import { beforeAll, describe, expect, test } from 'vitest';
import { archiveDirectory, verifyArchive } from '../../src/archive/archiver.js';
import { createRcloneRunner, createRcloneTarget } from '../../src/archive/rclone-target.js';

// The real rclone binary against a local folder (never Drive): checks the batch copy and the
// SHA-256 listing flags. Skipped where rclone is not installed.

const BIN = process.env.RCLONE_BIN ?? 'rclone';
const hasRclone = (() => {
  try {
    execFileSync(BIN, ['version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();
const logger = pino({ level: 'silent' });

describe.skipIf(!hasRclone)('archiveDirectory with rclone', () => {
  beforeAll(async () => {
    // An empty config: never the owner's (encrypted) remotes.
    process.env.RCLONE_CONFIG = join(await mkdtemp(join(tmpdir(), 'rclone-conf-')), 'rclone.conf');
  });

  test('uploads in one copy, verifies from listed hashes, and publishes', async () => {
    const localDir = await mkdtemp(join(tmpdir(), 'archive-'));
    await mkdir(join(localDir, 'renders'));
    await mkdir(join(localDir, 'jobs', 'job-1'), { recursive: true });
    await writeFile(join(localDir, 'manifest.json'), '{"video":"x"}');
    await writeFile(join(localDir, 'renders', 'final 1080p.mp4'), randomBytes(100_000));
    await writeFile(join(localDir, 'jobs', 'job-1', 'tmp.bin'), 'scratch');
    const root = await mkdtemp(join(tmpdir(), 'archive-root-'));
    const target = createRcloneTarget({ run: createRcloneRunner(BIN, 60_000), root });

    const result = await archiveDirectory({ target, localDir, remoteDir: '2026/10/v/v1', logger });

    expect(result.fileCount).toBe(3);
    expect((await readdir(join(root, '2026', '10', 'v'))).sort()).toEqual(['v1']);
    expect((await target.list('2026/10/v/v1')).every((entry) => entry.sha256)).toBe(true);
    expect((await verifyArchive(target, localDir, '2026/10/v/v1')).problems).toEqual([]);
  });
});
