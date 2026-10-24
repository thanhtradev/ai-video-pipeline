import { randomBytes } from 'node:crypto';
import { Redis } from 'ioredis';

// Local docker-compose.test.yml only; never a production host.
const REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:56379/15';

export function createTestRedis(): Redis {
  return new Redis(REDIS_URL, { maxRetriesPerRequest: 1 });
}

export function uniqueStream(): string {
  return `q:t${randomBytes(4).toString('hex')}`;
}
