import pino from 'pino';
import { describe, expect, test } from 'vitest';
import { backfillDriveIds, type BackfillStore } from '../../src/archive/backfill-drive-ids.js';

// Older videos have no Drive ids (D-104). One video failing must not stop the others.

const ROW = (n: number) => ({ video_version_id: `version-${n}`, path: `2026/10/video-${n}/v1` });
const logger = pino({ level: 'silent' });

function store(rows: { video_version_id: string; path: string }[]) {
  const saved: { versionId: string; fileId: string | null; folderId: string | null }[] = [];
  const value: BackfillStore = {
    missing: async () => rows,
    save: async (versionId, fileId, folderId) => {
      saved.push({ versionId, fileId, folderId });
    },
  };
  return { saved, value };
}

describe('backfillDriveIds', () => {
  test('saves the ids of each video', async () => {
    const { saved, value } = store([ROW(1)]);

    const summary = await backfillDriveIds({
      store: value,
      remoteId: async (path) => (path.endsWith('.mp4') ? 'file-1' : 'folder-1'),
      dryRun: false,
      logger,
    });

    expect(saved).toEqual([{ versionId: 'version-1', fileId: 'file-1', folderId: 'folder-1' }]);
    expect(summary).toEqual({ found: 1, saved: 1, missing: [], failed: [] });
  });

  test('writes nothing on a dry run', async () => {
    const { saved, value } = store([ROW(1)]);

    const summary = await backfillDriveIds({
      store: value,
      remoteId: async () => 'an-id',
      dryRun: true,
      logger,
    });

    expect(saved).toEqual([]);
    expect(summary).toMatchObject({ found: 1, saved: 0 });
  });

  test('goes on past a video Drive cannot find or an error, and reports both', async () => {
    const { saved, value } = store([ROW(1), ROW(2), ROW(3)]);

    const summary = await backfillDriveIds({
      store: value,
      remoteId: async (path) => {
        if (path.includes('video-1')) return null;
        if (path.includes('video-2')) throw new Error('quota');
        return 'an-id';
      },
      dryRun: false,
      logger,
    });

    expect(saved.map((row) => row.versionId)).toEqual(['version-3']);
    expect(summary).toEqual({
      found: 3,
      saved: 1,
      missing: ['2026/10/video-1/v1'],
      failed: ['2026/10/video-2/v1'],
    });
  });

  test('a failed save is reported, and the rest go on', async () => {
    const { value } = store([ROW(1), ROW(2)]);
    const saved: string[] = [];

    const summary = await backfillDriveIds({
      store: {
        ...value,
        save: async (versionId) => {
          if (versionId === 'version-1') throw new Error('connection lost');
          saved.push(versionId);
        },
      },
      remoteId: async () => 'an-id',
      dryRun: false,
      logger,
    });

    expect(saved).toEqual(['version-2']);
    expect(summary.failed).toEqual(['2026/10/video-1/v1']);
  });
});
