import type { Redis } from 'ioredis';

// Reliable-list queue: n8n RPUSHes job ids onto a stream list; the worker LMOVEs each message into
// its own processing list and LREMs it after handling. Postgres stays the source of truth, so a
// lost or duplicated message is harmless (job_requeue_stale / job_start guard).
// Jobs of a video pinned to this worker arrive on its own list q:<stream>:w:<worker id> (D-074);
// it is read before the shared list of the same stream.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface QueueMessage {
  stream: string;
  /** The Redis list the message came from (the shared stream list or this worker's own). */
  list: string;
  jobId: string;
  raw: string;
}

export interface JobQueue {
  /** Returns the next message from the highest-priority non-empty stream, or null. */
  next: () => Promise<QueueMessage | null>;
  ack: (message: QueueMessage) => Promise<void>;
  /** Moves messages left in this worker's processing lists (after a crash) back to the queues. */
  recoverInFlight: () => Promise<number>;
}

export interface QueueOptions {
  workerId: string;
  /** In priority order. */
  streams: readonly string[];
}

export function processingKey(list: string, workerId: string): string {
  return `${list}:processing:${workerId}`;
}

/** Must match job_queue_key in SQL (db/migrations/20261110000100_worker_affinity.sql). */
export function workerListKey(stream: string, workerId: string): string {
  return `${stream}:w:${workerId}`;
}

export function createRedisQueue(redis: Redis, options: QueueOptions): JobQueue {
  const { workerId, streams } = options;
  const lists = streams.flatMap((stream) => [
    { stream, list: workerListKey(stream, workerId) },
    { stream, list: stream },
  ]);

  return {
    next: async () => {
      for (const { stream, list } of lists) {
        for (;;) {
          const raw = await redis.lmove(list, processingKey(list, workerId), 'LEFT', 'RIGHT');
          if (raw === null) break;
          const jobId = raw.trim();
          if (UUID_PATTERN.test(jobId)) return { stream, list, jobId, raw };
          // Malformed message: drop it so it cannot block the stream.
          await redis.lrem(processingKey(list, workerId), 1, raw);
        }
      }
      return null;
    },

    ack: async (message) => {
      await redis.lrem(processingKey(message.list, workerId), 1, message.raw);
    },

    recoverInFlight: async () => {
      let moved = 0;
      for (const { list } of lists) {
        while ((await redis.lmove(processingKey(list, workerId), list, 'RIGHT', 'LEFT')) !== null) {
          moved += 1;
        }
      }
      return moved;
    },
  };
}
