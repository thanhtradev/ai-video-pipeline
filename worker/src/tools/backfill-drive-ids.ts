import pg from 'pg';
import { z } from 'zod';
import { backfillDriveIds } from '../archive/backfill-drive-ids.js';
import { createRcloneRunner, createRcloneTarget } from '../archive/rclone-target.js';
import { createLogger } from '../logger.js';

// Records the Drive ids of videos archived before the library (D-104), run by the user on a worker
// that has rclone (ops/video-library.md). Reads Drive and changes nothing there. --dry-run writes
// nothing to the database either.

const RCLONE_TIMEOUT_MS = 120_000;

const envSchema = z.object({
  WORKER_ID: z.string().regex(/^[a-z0-9-]{3,64}$/),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  ARCHIVE_RCLONE_REMOTE: z.string().min(1),
  RCLONE_BIN: z.string().min(1).default('rclone'),
});

async function main(): Promise<void> {
  const env = envSchema.parse(process.env);
  const dryRun = process.argv.includes('--dry-run');
  const logger = createLogger({ level: 'info' });
  const target = createRcloneTarget({
    run: createRcloneRunner(env.RCLONE_BIN, RCLONE_TIMEOUT_MS),
    root: env.ARCHIVE_RCLONE_REMOTE,
  });
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 1 });
  try {
    const summary = await backfillDriveIds({
      store: {
        missing: async () =>
          (
            await pool.query<{ video_version_id: string; path: string }>(
              'SELECT video_version_id, path FROM archive_records_missing_drive_ids()',
            )
          ).rows,
        save: async (versionId, fileId, folderId) => {
          await pool.query('SELECT archive_record_set_drive_ids($1, $2, $3, $4)', [
            env.WORKER_ID,
            versionId,
            fileId,
            folderId,
          ]);
        },
      },
      remoteId: target.remoteId!,
      dryRun,
      logger,
    });
    logger.info({ ...summary, dryRun }, 'Drive id backfill finished');
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  // Zod lists the names of invalid variables, never a value; other errors have no connection string.
  createLogger({ level: 'error' }).error(
    { err: error instanceof Error ? error.message : String(error) },
    'Drive id backfill failed',
  );
  process.exitCode = 1;
});
