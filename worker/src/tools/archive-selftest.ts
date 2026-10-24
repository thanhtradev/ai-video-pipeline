import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { archiveDirectory, ArchiveVerificationError } from '../archive/archiver.js';
import { createWebdavTarget, type ArchiveTarget } from '../archive/webdav-target.js';
import { createLogger, redactUrl } from '../logger.js';

// Phase 1 acceptance check against the real archive (docs/roadmap.md, "Storage verification"):
// 1. archive generated test data and verify count/size/SHA-256 on the server;
// 2. archive again with one file corrupted in transit and confirm verification catches it.
// Writes only under <ARCHIVE_SELFTEST_ROOT>/<timestamp>; never deletes. Remove test folders by hand.

const envSchema = z.object({
  ARCHIVE_WEBDAV_URL: z.url(),
  ARCHIVE_WEBDAV_USER: z.string().min(1),
  ARCHIVE_WEBDAV_PASSWORD: z.string().min(1),
  ARCHIVE_SELFTEST_ROOT: z.string().default('selftest'),
});

async function makeTestData(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'archive-selftest-'));
  await mkdir(join(dir, 'renders'));
  await writeFile(join(dir, 'manifest.json'), JSON.stringify({ selftest: true }));
  await writeFile(join(dir, 'renders', 'sample.bin'), randomBytes(5 * 1024 * 1024));
  return dir;
}

async function main(): Promise<void> {
  const env = envSchema.parse(process.env);
  const logger = createLogger({ level: 'info' });
  const target = createWebdavTarget({
    baseUrl: env.ARCHIVE_WEBDAV_URL,
    username: env.ARCHIVE_WEBDAV_USER,
    password: env.ARCHIVE_WEBDAV_PASSWORD,
  });
  const run = `${env.ARCHIVE_SELFTEST_ROOT}/${new Date().toISOString().replaceAll(':', '-')}`;
  logger.info({ target: redactUrl(env.ARCHIVE_WEBDAV_URL), run }, 'archive self-test starting');

  const result = await archiveDirectory({
    target,
    localDir: await makeTestData(),
    remoteDir: `${run}/ok`,
    logger,
  });
  logger.info({ ...result }, 'PASS: archive uploaded and verified');

  const corrupting: ArchiveTarget = {
    ...target,
    upload: async (localPath, remotePath) => {
      await target.upload(localPath, remotePath);
      if (remotePath.endsWith('manifest.json')) await target.putContent(remotePath, 'corrupted');
    },
  };
  try {
    await archiveDirectory({
      target: corrupting,
      localDir: await makeTestData(),
      remoteDir: `${run}/corrupted`,
      logger,
    });
    throw new Error('FAIL: corrupted upload was not detected');
  } catch (error: unknown) {
    if (!(error instanceof ArchiveVerificationError)) throw error;
    logger.info({ detail: error.message }, 'PASS: corrupted upload detected, not published');
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
