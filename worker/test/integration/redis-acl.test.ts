import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createRedisQueue } from '../../src/queue/redis-queue.js';
import { createRedisNonceStore } from '../../src/security/redis-nonce-store.js';
import { createTestRedis, uniqueStream } from '../helpers/redis.js';

const ACL_FILE = new URL('../../../ops/redis/acl-setup.redis', import.meta.url);
const PASSWORDS = {
  __N8N_PASSWORD__: randomBytes(16).toString('hex'),
  __WORKER_PASSWORD__: randomBytes(16).toString('hex'),
};

let admin: Redis;
let n8n: Redis;
let worker: Redis;

function connectAs(username: string, password: string): Redis {
  return new Redis({
    host: '127.0.0.1',
    port: 56379,
    db: 15,
    username,
    password,
    maxRetriesPerRequest: 1,
  });
}

beforeAll(async () => {
  admin = createTestRedis();
  const lines = (await readFile(ACL_FILE, 'utf8'))
    .split('\n')
    .filter((line) => line.startsWith('ACL SETUSER'));
  for (const line of lines) {
    let command = line;
    for (const [placeholder, value] of Object.entries(PASSWORDS)) {
      command = command.replace(placeholder, value);
    }
    const [, , ...args] = command.split(' ');
    await admin.call('ACL', 'SETUSER', ...args);
  }
  n8n = connectAs('aivideo-n8n', PASSWORDS.__N8N_PASSWORD__);
  worker = connectAs('aivideo-worker-mac-mini-m4', PASSWORDS.__WORKER_PASSWORD__);
});

afterAll(async () => {
  await Promise.all([n8n.quit(), worker.quit(), admin.quit()]);
});

describe('redis ACL', () => {
  test('n8n can enqueue and the worker can consume, ack, and claim nonces', async () => {
    const stream = uniqueStream();
    const jobId = randomUUID();
    await n8n.rpush(stream, jobId);

    const queue = createRedisQueue(worker, { workerId: 'mac-mini-m4', streams: [stream] });
    const message = await queue.next();
    expect(message?.jobId).toBe(jobId);
    await queue.ack(message!);
    expect(await createRedisNonceStore(worker).claim(randomUUID(), 10)).toBe(true);
  });

  test('n8n cannot read or delete queue data', async () => {
    await expect(n8n.lpop('q:any')).rejects.toThrow(/NOPERM/);
    await expect(n8n.del('q:any')).rejects.toThrow(/NOPERM/);
  });

  test('the worker cannot touch keys outside its namespaces or run admin commands', async () => {
    await expect(worker.set('other:key', '1')).rejects.toThrow(/NOPERM/);
    await expect(worker.flushdb()).rejects.toThrow(/NOPERM/);
    await expect(worker.call('CONFIG', 'GET', 'requirepass')).rejects.toThrow(/NOPERM/);
  });
});
