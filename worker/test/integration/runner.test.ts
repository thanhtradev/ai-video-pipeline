import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Redis } from 'ioredis';
import pino from 'pino';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createJobStore, type JobStore } from '../../src/db/job-store.js';
import { createRedisQueue } from '../../src/queue/redis-queue.js';
import {
  PermanentJobError,
  ProviderBlockedError,
  runNextJob,
  type JobHandler,
  type RunnerDeps,
} from '../../src/runner.js';
import { createTestDb, type TestDb } from '../helpers/db.js';
import {
  createBatch,
  createJob,
  createVideo,
  jobStatus,
  markWorkerIdle,
} from '../helpers/fixtures.js';
import { createTestRedis, uniqueStream } from '../helpers/redis.js';

let db: TestDb;
let redis: Redis;
let store: JobStore;

beforeAll(async () => {
  db = await createTestDb();
  redis = createTestRedis();
  store = createJobStore(db.pool);
});

afterAll(async () => {
  await redis.quit();
  await db.drop();
});

interface Harness {
  stream: string;
  jobId: string;
  deps: (handlers: Record<string, JobHandler>, overrides?: Partial<RunnerDeps>) => RunnerDeps;
  dispatch: () => Promise<string[]>;
}

async function setup(step = 'simulate'): Promise<Harness> {
  const stream = uniqueStream();
  const batchId = await createBatch(db.pool);
  const { versionId } = await createVideo(db.pool, batchId, 1);
  const jobId = await createJob(db.pool, versionId, step, { stream });
  const workRoot = await mkdtemp(join(tmpdir(), 'work-'));

  const dispatch = async (): Promise<string[]> => {
    const claimed = await db.pool.query<{ job_id: string }>(
      'SELECT job_id FROM dispatch_claim($1, 10)',
      [stream],
    );
    const ids = claimed.rows.map((row) => row.job_id);
    if (ids.length > 0) await redis.rpush(stream, ...ids);
    return ids;
  };

  return {
    stream,
    jobId,
    dispatch,
    deps: (handlers, overrides = {}) => ({
      store,
      queue: createRedisQueue(redis, { workerId: 'mac-mini-m4', streams: [stream] }),
      handlers: new Map(Object.entries(handlers)),
      workRoot,
      workerId: 'mac-mini-m4',
      leaseSeconds: 60,
      heartbeatMs: 50,
      logger: pino({ level: 'silent' }),
      ...overrides,
    }),
  };
}

const writeResult: JobHandler = async ({ workDir }) => {
  await writeFile(join(workDir, 'result.txt'), 'done');
  return { outputs: ['result.txt'], result: { ok: true } };
};

describe('runNextJob', () => {
  test('runs a dispatched job, checkpoints it, and marks it SUCCEEDED', async () => {
    const h = await setup();
    await h.dispatch();

    const outcome = await runNextJob(h.deps({ simulate: writeResult }));

    expect(outcome).toEqual({ kind: 'succeeded', jobId: h.jobId, fromCheckpoint: false });
    expect(await jobStatus(db.pool, h.jobId)).toBe('SUCCEEDED');
    const output = await db.pool.query('SELECT output FROM job WHERE id = $1', [h.jobId]);
    expect(output.rows[0].output.outputs[0]).toMatchObject({ path: 'result.txt', bytes: 4 });
    expect(await redis.llen(`${h.stream}:processing:mac-mini-m4`)).toBe(0);
  });

  test('returns idle when the queue is empty', async () => {
    const h = await setup();
    expect(await runNextJob(h.deps({ simulate: writeResult }))).toEqual({ kind: 'idle' });
  });

  test('a retryable error becomes FAILED_RETRYABLE', async () => {
    const h = await setup();
    await h.dispatch();
    const flaky: JobHandler = async () => {
      throw new Error('network timeout');
    };

    expect(await runNextJob(h.deps({ simulate: flaky }))).toMatchObject({
      kind: 'failed',
      status: 'FAILED_RETRYABLE',
    });
  });

  test('a PermanentJobError fails the job permanently', async () => {
    const h = await setup();
    await h.dispatch();
    const invalid: JobHandler = async () => {
      throw new PermanentJobError('bad input');
    };

    expect(await runNextJob(h.deps({ simulate: invalid }))).toMatchObject({
      kind: 'failed',
      status: 'FAILED_PERMANENT',
    });
  });

  test('a ProviderBlockedError blocks the job instead of failing it', async () => {
    const h = await setup();
    await h.dispatch();
    const limited: JobHandler = async () => {
      throw new ProviderBlockedError('claude-code usage limit reached', 1800);
    };

    expect(await runNextJob(h.deps({ simulate: limited }))).toMatchObject({
      kind: 'blocked',
      jobId: h.jobId,
    });
    expect(await jobStatus(db.pool, h.jobId)).toBe('BLOCKED');
    const job = await db.pool.query<{ wait_seconds: number }>(
      `SELECT extract(epoch FROM next_attempt_at - now())::int AS wait_seconds FROM job WHERE id = $1`,
      [h.jobId],
    );
    expect(job.rows[0]!.wait_seconds).toBeGreaterThan(1700);
  });

  test('an unknown step fails permanently', async () => {
    const h = await setup('no-such-step');
    await h.dispatch();

    expect(await runNextJob(h.deps({ simulate: writeResult }))).toMatchObject({
      kind: 'failed',
      status: 'FAILED_PERMANENT',
    });
  });

  test('cancellation reaches the handler through heartbeat and abort', async () => {
    const h = await setup();
    await h.dispatch();
    const slow: JobHandler = ({ signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')));
        setTimeout(() => {
          void db.pool.query(`SELECT job_cancel($1, 'owner')`, [h.jobId]);
        }, 20);
      });

    expect(await runNextJob(h.deps({ simulate: slow }))).toEqual({
      kind: 'aborted',
      jobId: h.jobId,
      reason: 'CANCELLED',
    });
    expect(await jobStatus(db.pool, h.jobId)).toBe('CANCELLED');
  });

  test('a duplicate message for a running job is dropped', async () => {
    const h = await setup();
    await h.dispatch();
    await redis.rpush(h.stream, h.jobId);

    await runNextJob(h.deps({ simulate: writeResult }));
    expect(await runNextJob(h.deps({ simulate: writeResult }))).toEqual({
      kind: 'skipped',
      jobId: h.jobId,
    });
  });
});

describe('finalizing', () => {
  test('reports LOST when the job was taken away before succeed', async () => {
    const h = await setup();
    await h.dispatch();
    const lostStore: JobStore = { ...store, succeed: async () => false };

    expect(await runNextJob(h.deps({ simulate: writeResult }, { store: lostStore }))).toEqual({
      kind: 'aborted',
      jobId: h.jobId,
      reason: 'LOST',
    });
  });

  test('keeps the lease alive while checkpointing and reporting', async () => {
    const h = await setup();
    await h.dispatch();
    let heartbeats = 0;
    let heartbeatsDuringSucceed = 0;
    let inSucceed = false;
    const slowStore: JobStore = {
      ...store,
      heartbeat: async (...args) => {
        heartbeats += 1;
        if (inSucceed) heartbeatsDuringSucceed += 1;
        return store.heartbeat(...args);
      },
      succeed: async (...args) => {
        inSucceed = true;
        await new Promise((resolve) => setTimeout(resolve, 200));
        inSucceed = false;
        return store.succeed(...args);
      },
    };

    await runNextJob(h.deps({ simulate: writeResult }, { store: slowStore }));

    expect(heartbeats).toBeGreaterThan(0);
    expect(heartbeatsDuringSucceed).toBeGreaterThan(0);
  });
});

describe('crash recovery', () => {
  test('a worker killed after checkpoint resumes without re-running the handler', async () => {
    const h = await setup();
    await h.dispatch();
    let calls = 0;
    const counted: JobHandler = async (ctx) => {
      calls += 1;
      return writeResult(ctx);
    };
    const crashingStore: JobStore = {
      ...store,
      succeed: async () => {
        throw new Error('process killed');
      },
    };

    await expect(
      runNextJob(h.deps({ simulate: counted }, { store: crashingStore })),
    ).rejects.toThrow('process killed');
    expect(await jobStatus(db.pool, h.jobId)).toBe('RUNNING');

    // Watchdog: lease expires, backoff elapses, job is dispatched again.
    await db.pool.query(
      `UPDATE job SET lease_expires_at = now() - interval '1 second' WHERE id = $1`,
      [h.jobId],
    );
    await db.pool.query('SELECT job_expire_leases()');
    await db.pool.query(
      `UPDATE job SET next_attempt_at = now() - interval '1 second' WHERE id = $1`,
      [h.jobId],
    );
    await db.pool.query('SELECT job_promote()');
    await h.dispatch();

    const outcome = await runNextJob(h.deps({ simulate: counted }));

    expect(outcome).toEqual({ kind: 'succeeded', jobId: h.jobId, fromCheckpoint: true });
    expect(calls).toBe(1);
  });

  test('a job lost by Redis is re-queued from Postgres and runs exactly once', async () => {
    const h = await setup();
    await h.dispatch();
    await redis.del(h.stream);
    let calls = 0;
    const counted: JobHandler = async (ctx) => {
      calls += 1;
      return writeResult(ctx);
    };

    expect(await runNextJob(h.deps({ simulate: counted }))).toEqual({ kind: 'idle' });

    await db.pool.query(`UPDATE job SET queued_at = now() - interval '1 hour' WHERE id = $1`, [
      h.jobId,
    ]);
    await markWorkerIdle(db.pool, 'mac-mini-m4', [h.stream]);
    await db.pool.query(`SELECT job_requeue_stale(interval '10 minutes')`);
    await h.dispatch();
    await redis.rpush(h.stream, h.jobId);

    await runNextJob(h.deps({ simulate: counted }));
    await runNextJob(h.deps({ simulate: counted }));

    expect(calls).toBe(1);
    expect(await jobStatus(db.pool, h.jobId)).toBe('SUCCEEDED');
  });
});
