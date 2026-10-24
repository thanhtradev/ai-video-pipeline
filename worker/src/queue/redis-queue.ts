import type { Redis } from 'ioredis';

// Reliable-list queue: n8n RPUSHes job ids onto a stream list; the worker LMOVEs each message into
// its own processing list and LREMs it after handling. Postgres stays the source of truth, so a
// lost or duplicated message is harmless (job_requeue_stale / job_start guard).

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface QueueMessage {
  stream: string;
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

export function processingKey(stream: string, workerId: string): string {
  return `${stream}:processing:${workerId}`;
}

export function createRedisQueue(redis: Redis, options: QueueOptions): JobQueue {
  const { workerId, streams } = options;

  return {
    next: async () => {
      for (const stream of streams) {
        for (;;) {
          const raw = await redis.lmove(stream, processingKey(stream, workerId), 'LEFT', 'RIGHT');
          if (raw === null) break;
          const jobId = raw.trim();
          if (UUID_PATTERN.test(jobId)) return { stream, jobId, raw };
          // Malformed message: drop it so it cannot block the stream.
          await redis.lrem(processingKey(stream, workerId), 1, raw);
        }
      }
      return null;
    },

    ack: async (message) => {
      await redis.lrem(processingKey(message.stream, workerId), 1, message.raw);
    },

    recoverInFlight: async () => {
      let moved = 0;
      for (const stream of streams) {
        while (
          (await redis.lmove(processingKey(stream, workerId), stream, 'RIGHT', 'LEFT')) !== null
        ) {
          moved += 1;
        }
      }
      return moved;
    },
  };
}
