import { readdir, rm } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { z } from 'zod';
import { verifyArchive } from '../archive/archiver.js';
import type { ArchiveTarget } from '../archive/webdav-target.js';
import { diskBytes } from '../storage/disk-usage.js';
import { PermanentJobError, ProviderBlockedError, type JobHandler } from '../runner.js';

// Episode `cleanup` step (q:heavy, D-063): runs only after the owner approved deleting the Mac copy
// of an archived version on Telegram. It re-verifies the archive against the checksums written when
// it was made (sizes and SHA-256 on the remote), and only then deletes the version folder on the
// Mac, except its own job folder (which keeps this report). Any doubt stops it; nothing remote is
// touched.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const inputSchema = z.object({
  video_id: z.uuid(),
  version: z.number().int().min(1),
  target: z.string(),
  remote_dir: z.string().min(1),
  manifest_sha256: z.string().regex(/^[0-9a-f]{64}$/),
});

export interface CleanupLocalDeps {
  target: ArchiveTarget | null;
  targetName: string;
  blockSeconds: number;
}

/** The version folder of this job, after checking the layout videos/<id>/v<n>/jobs/<job>. */
function versionFolder(workDir: string, videoId: string, version: number): string {
  const jobs = dirname(workDir);
  const versionDir = dirname(jobs);
  if (
    !UUID.test(basename(workDir)) ||
    basename(jobs) !== 'jobs' ||
    basename(versionDir) !== `v${version}` ||
    basename(dirname(versionDir)) !== videoId ||
    basename(dirname(dirname(versionDir))) !== 'videos'
  ) {
    throw new PermanentJobError(`unexpected folder layout for ${workDir}`);
  }
  return resolve(versionDir);
}

export function createCleanupLocalHandler(deps: CleanupLocalDeps): JobHandler {
  return async ({ input, workDir, logger, progress }) => {
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success) {
      throw new PermanentJobError(`invalid cleanup input: ${parsed.error.message}`);
    }
    const data = parsed.data;
    if (data.target !== deps.targetName) {
      throw new PermanentJobError(
        `archived to ${data.target}, but this worker archives to ${deps.targetName}`,
      );
    }
    if (!deps.target) {
      throw new ProviderBlockedError(
        'no archive is configured (ARCHIVE_RCLONE_REMOTE)',
        deps.blockSeconds,
      );
    }
    const versionDir = versionFolder(workDir, data.video_id, data.version);

    await progress({ stage: 'cleanup', step: 'verifying' });
    const { problems, checksumsSha256 } = await verifyArchive(
      deps.target,
      versionDir,
      data.remote_dir,
    );
    if (checksumsSha256 !== data.manifest_sha256) {
      throw new PermanentJobError(
        'the local checksums differ from the archive record; nothing deleted',
      );
    }
    if (problems.length > 0) {
      throw new PermanentJobError(
        `the archive does not match; nothing deleted: ${problems.slice(0, 5).join('; ')}`,
      );
    }

    await progress({ stage: 'cleanup', step: 'deleting' });
    const before = await diskBytes(versionDir);
    const own = basename(workDir);
    for (const entry of await readdir(versionDir)) {
      if (entry !== 'jobs') {
        await rm(join(versionDir, entry), { recursive: true, force: true });
        continue;
      }
      for (const job of await readdir(join(versionDir, 'jobs'))) {
        if (job !== own) await rm(join(versionDir, 'jobs', job), { recursive: true, force: true });
      }
    }
    const freed = before - (await diskBytes(versionDir));
    logger.info({ freed, remote: data.remote_dir }, 'local copy deleted after verification');
    return {
      outputs: [],
      result: { freed_bytes: freed, remote_dir: data.remote_dir, verified_files: true },
    };
  };
}
