import type { Logger } from 'pino';

// Videos archived before the library (D-104) have no Drive ids. This reads them from Drive, one video
// at a time, so one that Drive cannot find is reported and the rest go on. It only reads Drive.

export interface MissingDriveIds {
  video_version_id: string;
  path: string;
}

export interface BackfillStore {
  missing: () => Promise<MissingDriveIds[]>;
  save: (versionId: string, fileId: string, folderId: string | null) => Promise<void>;
}

export interface BackfillOptions {
  store: BackfillStore;
  remoteId: (path: string) => Promise<string | null>;
  dryRun: boolean;
  logger: Logger;
}

export interface BackfillSummary {
  found: number;
  saved: number;
  /** Folders Drive cannot find: moved, deleted, or made through another rclone login. */
  missing: string[];
  failed: string[];
}

export const FINAL_VIDEO_PATH = 'renders/final_1080p.mp4';

export async function backfillDriveIds(options: BackfillOptions): Promise<BackfillSummary> {
  const { store, remoteId, dryRun, logger } = options;
  const rows = await store.missing();
  const missing: string[] = [];
  const failed: string[] = [];
  let saved = 0;
  for (const row of rows) {
    try {
      const fileId = await remoteId(`${row.path}/${FINAL_VIDEO_PATH}`);
      if (!fileId) {
        missing.push(row.path);
        continue;
      }
      const folderId = await remoteId(row.path);
      if (dryRun) {
        logger.info({ path: row.path }, 'would save Drive ids');
        continue;
      }
      await store.save(row.video_version_id, fileId, folderId);
      saved += 1;
    } catch (error: unknown) {
      logger.warn(
        { path: row.path, err: error instanceof Error ? error.message : String(error) },
        'could not read or save Drive ids',
      );
      failed.push(row.path);
    }
  }
  return { found: rows.length, saved, missing, failed };
}
