import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Redis } from 'ioredis';
import pino from 'pino';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createJobStore } from '../../src/db/job-store.js';
import { simulateHandler } from '../../src/handlers/simulate.js';
import { createRedisQueue } from '../../src/queue/redis-queue.js';
import { createRedisNonceStore } from '../../src/security/redis-nonce-store.js';
import { createWorkerLoop } from '../../src/worker-loop.js';
import { createTestDb, type TestDb } from '../helpers/db.js';
import { createBatch, createJob, createVideo, jobStatus } from '../helpers/fixtures.js';
import { createTestRedis, uniqueStream } from '../helpers/redis.js';

let db: TestDb;
let redis: Redis;

beforeAll(async () => {
  db = await createTestDb();
  redis = createTestRedis();
});

afterAll(async () => {
  await redis.quit();
  await db.drop();
});

async function waitFor(condition: () => Promise<boolean>, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error('timed out waiting for condition');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

describe('worker loop', () => {
  test('processes dispatched jobs, records its heartbeat, and stops gracefully', async () => {
    const stream = uniqueStream();
    const batchId = await createBatch(db.pool);
    const { versionId } = await createVideo(db.pool, batchId, 1);
    const jobId = await createJob(db.pool, versionId, 'simulate', { stream });
    await db.pool.query('SELECT job_id FROM dispatch_claim($1, 5)', [stream]);
    await redis.rpush(stream, jobId);

    const store = createJobStore(db.pool);
    const loop = createWorkerLoop({
      store,
      queue: createRedisQueue(redis, { workerId: 'loop-worker', streams: [stream] }),
      handlers: new Map([['simulate', simulateHandler]]),
      workRoot: await mkdtemp(join(tmpdir(), 'loop-')),
      workerId: 'loop-worker',
      streams: [stream],
      leaseSeconds: 60,
      heartbeatMs: 1000,
      pollIntervalMs: 20,
      logger: pino({ level: 'silent' }),
    });

    loop.start();
    await waitFor(async () => (await jobStatus(db.pool, jobId)) === 'SUCCEEDED');
    await loop.stop();

    const worker = await db.pool.query(`SELECT capabilities FROM worker WHERE id = 'loop-worker'`);
    expect(worker.rows[0].capabilities).toEqual([stream]);
    expect(loop.activeJobs()).toBe(0);
  });
});

describe('redis nonce store', () => {
  test('claims a nonce once', async () => {
    const nonces = createRedisNonceStore(redis);
    const nonce = `n-${Date.now()}-${Math.random()}`;
    expect(await nonces.claim(nonce, 10)).toBe(true);
    expect(await nonces.claim(nonce, 10)).toBe(false);
  });
});
