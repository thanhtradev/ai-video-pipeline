import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db.js';
import {
  createBatch,
  createJob,
  createVideo,
  jobStatus,
  markWorkerIdle,
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

async function dispatch(stream: string, maxInFlight = 10): Promise<string[]> {
  const result = await db.pool.query<{ job_id: string }>(
    'SELECT job_id FROM dispatch_claim($1, $2)',
    [stream, maxInFlight],
  );
  return result.rows.map((row) => row.job_id);
}

async function start(jobId: string, workerId = 'mac-mini-m4'): Promise<number | null> {
  const result = await db.pool.query<{ attempt_no: number }>(
    'SELECT attempt_no FROM job_start($1, $2, 60)',
    [jobId, workerId],
  );
  return result.rows[0]?.attempt_no ?? null;
}

async function fail(jobId: string, retryable: boolean, workerId = 'mac-mini-m4'): Promise<string> {
  const result = await db.pool.query<{ job_fail: string }>('SELECT job_fail($1, $2, $3, $4)', [
    jobId,
    workerId,
    'boom',
    retryable,
  ]);
  return result.rows[0]!.job_fail;
}

describe('job_create', () => {
  test('is idempotent on video version + step + input hash', async () => {
    const batchId = await createBatch(db.pool);
    const { versionId } = await createVideo(db.pool, batchId, 1);

    const first = await createJob(db.pool, versionId, 'script', { inputHash: 'abc' });
    const second = await createJob(db.pool, versionId, 'script', { inputHash: 'abc' });

    expect(second).toBe(first);
    const count = await db.pool.query(
      'SELECT count(*)::int AS n FROM job WHERE video_version_id = $1',
      [versionId],
    );
    expect(count.rows[0].n).toBe(1);
  });

  test('stays PENDING until dependencies succeed, then promotes to READY', async () => {
    const batchId = await createBatch(db.pool);
    const { versionId } = await createVideo(db.pool, batchId, 1);
    const parent = await createJob(db.pool, versionId, 'tts');
    const child = await createJob(db.pool, versionId, 'subtitles', { dependsOn: [parent] });

    expect(await jobStatus(db.pool, child)).toBe('PENDING');

    await dispatch('q:light');
    await start(parent);
    await db.pool.query(`SELECT job_succeed($1, 'mac-mini-m4', '{}'::jsonb)`, [parent]);
    await db.pool.query('SELECT job_promote()');

    expect(await jobStatus(db.pool, child)).toBe('READY');
  });
});

describe('dispatch_claim', () => {
  test('claims FIFO by batch, then video sequence', async () => {
    const olderBatch = await createBatch(db.pool, 'fifo-older');
    const newerBatch = await createBatch(db.pool, 'fifo-newer');
    const newer = await createVideo(db.pool, newerBatch, 1);
    const olderSecond = await createVideo(db.pool, olderBatch, 2);
    const olderFirst = await createVideo(db.pool, olderBatch, 1);
    const jobNewer = await createJob(db.pool, newer.versionId, 'x', { stream: 'q:fifo' });
    const jobOlderSecond = await createJob(db.pool, olderSecond.versionId, 'x', {
      stream: 'q:fifo',
    });
    const jobOlderFirst = await createJob(db.pool, olderFirst.versionId, 'x', { stream: 'q:fifo' });

    expect(await dispatch('q:fifo')).toEqual([jobOlderFirst, jobOlderSecond, jobNewer]);
  });

  test('respects the in-flight limit per stream', async () => {
    const batchId = await createBatch(db.pool);
    const a = await createVideo(db.pool, batchId, 1);
    const b = await createVideo(db.pool, batchId, 2);
    await createJob(db.pool, a.versionId, 'x', { stream: 'q:limit' });
    await createJob(db.pool, b.versionId, 'x', { stream: 'q:limit' });

    expect(await dispatch('q:limit', 1)).toHaveLength(1);
    expect(await dispatch('q:limit', 1)).toHaveLength(0);
  });

  test('skips blocked videos without blocking the others', async () => {
    const batchId = await createBatch(db.pool);
    const blocked = await createVideo(db.pool, batchId, 1);
    const healthy = await createVideo(db.pool, batchId, 2);
    await createJob(db.pool, blocked.versionId, 'x', { stream: 'q:skip' });
    const healthyJob = await createJob(db.pool, healthy.versionId, 'x', { stream: 'q:skip' });
    await setVersionStatus(db.pool, blocked.versionId, ['SCRIPTING', 'NEEDS_DECISION']);

    expect(await dispatch('q:skip')).toEqual([healthyJob]);
  });
});

describe('job execution', () => {
  test('a duplicate queue message cannot start a job twice', async () => {
    const batchId = await createBatch(db.pool);
    const { versionId } = await createVideo(db.pool, batchId, 1);
    const jobId = await createJob(db.pool, versionId, 'x', { stream: 'q:dup' });
    await dispatch('q:dup');

    expect(await start(jobId)).toBe(1);
    expect(await start(jobId)).toBeNull();
  });

  test('only the claiming worker can heartbeat or finish', async () => {
    const batchId = await createBatch(db.pool);
    const { versionId } = await createVideo(db.pool, batchId, 1);
    const jobId = await createJob(db.pool, versionId, 'x', { stream: 'q:owner' });
    await dispatch('q:owner');
    await start(jobId, 'worker-a');

    const heartbeat = await db.pool.query(`SELECT job_heartbeat($1, 'worker-b', 60) AS s`, [jobId]);
    expect(heartbeat.rows[0].s).toBe('LOST');
    const succeed = await db.pool.query(`SELECT job_succeed($1, 'worker-b', '{}'::jsonb) AS ok`, [
      jobId,
    ]);
    expect(succeed.rows[0].ok).toBe(false);
  });

  test('heartbeat reports cancellation to the worker', async () => {
    const batchId = await createBatch(db.pool);
    const { versionId } = await createVideo(db.pool, batchId, 1);
    const jobId = await createJob(db.pool, versionId, 'x', { stream: 'q:cancel' });
    await dispatch('q:cancel');
    await start(jobId);
    await db.pool.query(`SELECT job_cancel($1, 'owner')`, [jobId]);

    const heartbeat = await db.pool.query(`SELECT job_heartbeat($1, 'mac-mini-m4', 60) AS s`, [
      jobId,
    ]);
    expect(heartbeat.rows[0].s).toBe('CANCELLED');
  });
});

describe('retry', () => {
  test('retryable failure backs off, then returns to READY when due', async () => {
    const batchId = await createBatch(db.pool);
    const { versionId } = await createVideo(db.pool, batchId, 1);
    const jobId = await createJob(db.pool, versionId, 'x', { stream: 'q:retry' });
    await dispatch('q:retry');
    await start(jobId);

    expect(await fail(jobId, true)).toBe('FAILED_RETRYABLE');
    await db.pool.query('SELECT job_promote()');
    expect(await jobStatus(db.pool, jobId)).toBe('FAILED_RETRYABLE');

    await db.pool.query(
      `UPDATE job SET next_attempt_at = now() - interval '1 second' WHERE id = $1`,
      [jobId],
    );
    await db.pool.query('SELECT job_promote()');
    expect(await jobStatus(db.pool, jobId)).toBe('READY');
  });

  test('exhausted attempts become FAILED_PERMANENT and the video needs a decision', async () => {
    const batchId = await createBatch(db.pool);
    const { versionId } = await createVideo(db.pool, batchId, 1);
    await setVersionStatus(db.pool, versionId, ['SCRIPTING']);
    const jobId = await createJob(db.pool, versionId, 'x', { stream: 'q:exhaust', maxAttempts: 1 });
    await dispatch('q:exhaust');
    await start(jobId);

    expect(await fail(jobId, true)).toBe('FAILED_PERMANENT');
    expect(await versionStatus(db.pool, versionId)).toBe('NEEDS_DECISION');
  });

  test('non-retryable failure is permanent immediately', async () => {
    const batchId = await createBatch(db.pool);
    const { versionId } = await createVideo(db.pool, batchId, 1);
    const jobId = await createJob(db.pool, versionId, 'x', { stream: 'q:perm' });
    await dispatch('q:perm');
    await start(jobId);

    expect(await fail(jobId, false)).toBe('FAILED_PERMANENT');
  });
});

describe('recovery', () => {
  test('expired lease marks the attempt abandoned and the job retryable', async () => {
    const batchId = await createBatch(db.pool);
    const { versionId } = await createVideo(db.pool, batchId, 1);
    const jobId = await createJob(db.pool, versionId, 'x', { stream: 'q:lease' });
    await dispatch('q:lease');
    await start(jobId);
    await db.pool.query(
      `UPDATE job SET lease_expires_at = now() - interval '1 second' WHERE id = $1`,
      [jobId],
    );

    const expired = await db.pool.query('SELECT job_expire_leases() AS n');
    expect(expired.rows[0].n).toBeGreaterThanOrEqual(1);
    expect(await jobStatus(db.pool, jobId)).toBe('FAILED_RETRYABLE');
    const attempt = await db.pool.query('SELECT status FROM job_attempt WHERE job_id = $1', [
      jobId,
    ]);
    expect(attempt.rows[0].status).toBe('ABANDONED');
  });

  test('a job lost from Redis is re-queued and still runs exactly once', async () => {
    const batchId = await createBatch(db.pool);
    const { versionId } = await createVideo(db.pool, batchId, 1);
    const jobId = await createJob(db.pool, versionId, 'x', { stream: 'q:lost' });
    await dispatch('q:lost');
    await db.pool.query(`UPDATE job SET queued_at = now() - interval '1 hour' WHERE id = $1`, [
      jobId,
    ]);
    // The worker serving q:lost later polled and found the queue empty: the message is gone.
    await markWorkerIdle(db.pool, 'worker-lost', ['q:lost']);

    const requeued = await db.pool.query(`SELECT job_requeue_stale(interval '10 minutes') AS n`);
    expect(requeued.rows[0].n).toBe(1);
    expect(await dispatch('q:lost')).toEqual([jobId]);

    expect(await start(jobId)).toBe(1);
    expect(await start(jobId)).toBeNull();
  });

  test('a job waiting behind a long job is not re-queued', async () => {
    const batchId = await createBatch(db.pool);
    const { versionId } = await createVideo(db.pool, batchId, 1);
    const jobId = await createJob(db.pool, versionId, 'x', { stream: 'q:waiting' });
    await dispatch('q:waiting');
    await db.pool.query(`UPDATE job SET queued_at = now() - interval '1 hour' WHERE id = $1`, [
      jobId,
    ]);
    // The only worker for q:waiting has been busy (never idle) since the job was queued.
    await db.pool.query(
      `INSERT INTO worker (id, capabilities, last_seen_at, last_idle_at)
       VALUES ('worker-busy', '{q:waiting}', now(), now() - interval '2 hours')`,
    );

    const requeued = await db.pool.query(`SELECT job_requeue_stale(interval '10 minutes') AS n`);

    expect(requeued.rows[0].n).toBe(0);
    expect(await jobStatus(db.pool, jobId)).toBe('QUEUED');
  });
});
