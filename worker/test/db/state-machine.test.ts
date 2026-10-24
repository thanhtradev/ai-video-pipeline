import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db.js';
import {
  createBatch,
  createJob,
  createVideo,
  jobStatus,
  setVersionStatus,
  versionStatus,
} from '../helpers/fixtures.js';

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(async () => {
  await db.drop();
});

describe('job status transitions', () => {
  test('allows the documented forward path', async () => {
    const batchId = await createBatch(db.pool);
    const { versionId } = await createVideo(db.pool, batchId, 1);
    const jobId = await createJob(db.pool, versionId, 'script');

    for (const status of ['QUEUED', 'RUNNING', 'SUCCEEDED']) {
      await db.pool.query('UPDATE job SET status = $2 WHERE id = $1', [jobId, status]);
    }

    expect(await jobStatus(db.pool, jobId)).toBe('SUCCEEDED');
  });

  test('rejects a transition that skips states', async () => {
    const batchId = await createBatch(db.pool);
    const { versionId } = await createVideo(db.pool, batchId, 1);
    const jobId = await createJob(db.pool, versionId, 'script');

    await expect(
      db.pool.query(`UPDATE job SET status = 'SUCCEEDED' WHERE id = $1`, [jobId]),
    ).rejects.toThrow(/invalid job transition READY -> SUCCEEDED/);
  });

  test('rejects leaving a terminal state', async () => {
    const batchId = await createBatch(db.pool);
    const { versionId } = await createVideo(db.pool, batchId, 1);
    const jobId = await createJob(db.pool, versionId, 'script');
    await db.pool.query(`UPDATE job SET status = 'CANCELLED' WHERE id = $1`, [jobId]);

    await expect(
      db.pool.query(`UPDATE job SET status = 'READY' WHERE id = $1`, [jobId]),
    ).rejects.toThrow(/invalid job transition CANCELLED -> READY/);
  });
});

describe('video version status transitions', () => {
  test('follows the default flow to COMPLETED', async () => {
    const batchId = await createBatch(db.pool);
    const { versionId } = await createVideo(db.pool, batchId, 1);

    await setVersionStatus(db.pool, versionId, [
      'SCRIPTING',
      'AWAITING_SCRIPT_APPROVAL',
      'GENERATING_ASSETS',
      'RENDERING_PREVIEW',
      'QA_RUNNING',
      'AWAITING_PREVIEW_APPROVAL',
      'RENDERING_FINAL',
      'ARCHIVING',
      'ARCHIVE_VERIFIED',
      'COMPLETED',
    ]);

    expect(await versionStatus(db.pool, versionId)).toBe('COMPLETED');
  });

  test('rejects rendering final before preview approval', async () => {
    const batchId = await createBatch(db.pool);
    const { versionId } = await createVideo(db.pool, batchId, 1);
    await setVersionStatus(db.pool, versionId, ['SCRIPTING', 'AWAITING_SCRIPT_APPROVAL']);

    await expect(setVersionStatus(db.pool, versionId, ['RENDERING_FINAL'])).rejects.toThrow(
      /invalid video_version transition AWAITING_SCRIPT_APPROVAL -> RENDERING_FINAL/,
    );
  });

  test('a blocking state remembers and only resumes to the previous status', async () => {
    const batchId = await createBatch(db.pool);
    const { versionId } = await createVideo(db.pool, batchId, 1);
    await setVersionStatus(db.pool, versionId, ['SCRIPTING', 'NEEDS_DECISION']);

    await expect(setVersionStatus(db.pool, versionId, ['COMPLETED'])).rejects.toThrow(
      /must resume to SCRIPTING/,
    );

    await setVersionStatus(db.pool, versionId, ['SCRIPTING']);
    const row = await db.pool.query(
      'SELECT status, resume_status FROM video_version WHERE id = $1',
      [versionId],
    );
    expect(row.rows[0]).toEqual({ status: 'SCRIPTING', resume_status: null });
  });

  test('FAILED is only reachable from a blocking state', async () => {
    const batchId = await createBatch(db.pool);
    const { versionId } = await createVideo(db.pool, batchId, 1);
    await setVersionStatus(db.pool, versionId, ['SCRIPTING']);

    await expect(setVersionStatus(db.pool, versionId, ['FAILED'])).rejects.toThrow(
      /invalid video_version transition SCRIPTING -> FAILED/,
    );
  });
});

describe('audit log', () => {
  test('records status changes and is append-only', async () => {
    const batchId = await createBatch(db.pool);
    const { versionId } = await createVideo(db.pool, batchId, 1);
    await setVersionStatus(db.pool, versionId, ['SCRIPTING']);

    const entries = await db.pool.query(
      `SELECT action, detail FROM audit_log WHERE object_type = 'video_version' AND object_id = $1`,
      [versionId],
    );
    expect(entries.rows).toContainEqual({
      action: 'status_change',
      detail: { from: 'BRIEF_SUBMITTED', to: 'SCRIPTING' },
    });

    await expect(db.pool.query('UPDATE audit_log SET actor = $1', ['x'])).rejects.toThrow(
      /audit_log is append-only/,
    );
    await expect(db.pool.query('DELETE FROM audit_log')).rejects.toThrow(
      /audit_log is append-only/,
    );
  });
});
