import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createRedisQueue } from '../../src/queue/redis-queue.js';
import { createTestRedis, uniqueStream } from '../helpers/redis.js';

let redis: Redis;

beforeAll(() => {
  redis = createTestRedis();
});

afterAll(async () => {
  await redis.quit();
});

describe('redis queue', () => {
  test('delivers job ids FIFO and respects stream priority', async () => {
    const high = uniqueStream();
    const low = uniqueStream();
    const queue = createRedisQueue(redis, { workerId: 'w1', streams: [high, low] });
    const [a, b, c] = [randomUUID(), randomUUID(), randomUUID()];
    await redis.rpush(low, c);
    await redis.rpush(high, a, b);

    const received: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const message = await queue.next();
      received.push(message!.jobId);
      await queue.ack(message!);
    }

    expect(received).toEqual([a, b, c]);
    expect(await queue.next()).toBeNull();
  });

  test('keeps unacked messages in flight and recovers them after a restart', async () => {
    const stream = uniqueStream();
    const jobId = randomUUID();
    await redis.rpush(stream, jobId);
    const crashed = createRedisQueue(redis, { workerId: 'w2', streams: [stream] });
    await crashed.next();

    expect(await redis.llen(stream)).toBe(0);

    const restarted = createRedisQueue(redis, { workerId: 'w2', streams: [stream] });
    expect(await restarted.recoverInFlight()).toBe(1);
    expect((await restarted.next())?.jobId).toBe(jobId);
  });

  test('drops malformed messages instead of blocking the queue', async () => {
    const stream = uniqueStream();
    const jobId = randomUUID();
    await redis.rpush(stream, 'not-a-uuid', jobId);
    const queue = createRedisQueue(redis, { workerId: 'w3', streams: [stream] });

    expect((await queue.next())?.jobId).toBe(jobId);
    expect(await redis.llen(`${stream}:processing:w3`)).toBe(1);
  });
});
