import type { Redis } from 'ioredis';
import type { NonceStore } from './hmac.js';

const NONCE_PREFIX = 'nonce:';

/** Nonce replay protection shared across worker restarts (SET NX with TTL). */
export function createRedisNonceStore(redis: Redis): NonceStore {
  return {
    claim: async (nonce, ttlSeconds) => {
      const result = await redis.set(`${NONCE_PREFIX}${nonce}`, '1', 'EX', ttlSeconds, 'NX');
      return result === 'OK';
    },
  };
}
