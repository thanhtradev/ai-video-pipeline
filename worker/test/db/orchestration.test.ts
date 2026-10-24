import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db.js';
import { createBatch, createJob, createVideo, jobStatus } from '../helpers/fixtures.js';

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(async () => {
  await db.drop();
});

describe('stream_config', () => {
  test('is seeded with one in-flight job per stream for the single Mac mini worker', async () => {
    const result = await db.pool.query(
      'SELECT stream, max_in_flight, enabled FROM stream_config ORDER BY stream',
    );
    expect(result.rows).toEqual([
      { stream: 'q:heavy', max_in_flight: 1, enabled: true },
      { stream: 'q:light', max_in_flight: 1, enabled: true },
      { stream: 'q:render', max_in_flight: 1, enabled: true },
    ]);
  });
});

describe('dispatch_all', () => {
  test('promotes and claims across enabled streams within their limits', async () => {
    const batchId = await createBatch(db.pool);
    const a = await createVideo(db.pool, batchId, 1);
    const b = await createVideo(db.pool, batchId, 2);
    const render = await createJob(db.pool, a.versionId, 'render', { stream: 'q:render' });
    const lightFirst = await createJob(db.pool, a.versionId, 'qa', { stream: 'q:light' });
    await createJob(db.pool, b.versionId, 'qa', { stream: 'q:light' });

    const result = await db.pool.query('SELECT stream, job_id FROM dispatch_all()');

    expect(result.rows).toEqual(
      expect.arrayContaining([
        { stream: 'q:render', job_id: render },
        { stream: 'q:light', job_id: lightFirst },
      ]),
    );
    expect(result.rows).toHaveLength(2);
  });

  test('skips disabled streams', async () => {
    await db.pool.query(`UPDATE stream_config SET enabled = false WHERE stream = 'q:heavy'`);
    const batchId = await createBatch(db.pool);
    const { versionId } = await createVideo(db.pool, batchId, 1);
    const jobId = await createJob(db.pool, versionId, 'heavy', { stream: 'q:heavy' });

    const result = await db.pool.query('SELECT job_id FROM dispatch_all()');

    expect(result.rows.map((row) => row.job_id)).not.toContain(jobId);
    expect(await jobStatus(db.pool, jobId)).toBe('READY');
    await db.pool.query(`UPDATE stream_config SET enabled = true WHERE stream = 'q:heavy'`);
  });
});

describe('watchdog_run', () => {
  test('recovers leases and stale queue entries, expires approvals, reports offline workers', async () => {
    const batchId = await createBatch(db.pool);
    const { versionId } = await createVideo(db.pool, batchId, 1);
    const stuck = await createJob(db.pool, versionId, 'stuck', { stream: 'q:watch' });
    const lost = await createJob(db.pool, versionId, 'lost', { stream: 'q:watch' });
    await db.pool.query(`SELECT * FROM dispatch_claim('q:watch', 5)`);
    await db.pool.query(`SELECT * FROM job_start($1, 'mac-mini-m4', 60)`, [stuck]);
    await db.pool.query(`UPDATE job SET lease_expires_at = now() - interval '1 s' WHERE id = $1`, [
      stuck,
    ]);
    await db.pool.query(`UPDATE job SET queued_at = now() - interval '1 hour' WHERE id = $1`, [
      lost,
    ]);
    await db.pool.query(
      `INSERT INTO worker (id, last_seen_at) VALUES ('macbook-pro-m1', now() - interval '1 day')`,
    );

    const result = await db.pool.query<{ watchdog_run: Record<string, unknown> }>(
      'SELECT watchdog_run()',
    );

    expect(result.rows[0]!.watchdog_run).toMatchObject({
      expired_leases: 1,
      requeued: 1,
      approvals_expired: 0,
      offline_workers: ['macbook-pro-m1'],
    });
    expect(await jobStatus(db.pool, stuck)).toBe('FAILED_RETRYABLE');
    expect(await jobStatus(db.pool, lost)).toBe('READY');
  });
});
