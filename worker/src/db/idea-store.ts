import type pg from 'pg';

// Thin wrapper over the idea lease functions (db/migrations/20261115000100_video_ideas.sql, D-083).
// The rules (lease expiry, attempts, link checks, episode numbers) live in the database.

export interface IdeaHistory {
  videos: Record<string, unknown>[];
  unused_ideas: string[];
}

export interface ClaimedIdeaRequest {
  requestId: string;
  attemptNo: number;
  kit: string;
  characterSet: string;
  ideaCount: number;
  history: IdeaHistory;
}

export interface IdeaStore {
  claim: (workerId: string, leaseSeconds: number) => Promise<ClaimedIdeaRequest | null>;
  /** False when the request is no longer running for this worker. */
  complete: (requestId: string, workerId: string, ideas: unknown[]) => Promise<boolean>;
  fail: (requestId: string, workerId: string, error: string, retryable: boolean) => Promise<string>;
  block: (
    requestId: string,
    workerId: string,
    reason: string,
    retryAfterSeconds: number,
  ) => Promise<string>;
}

interface ClaimRow {
  request_id: string;
  attempt_no: number;
  kit: string;
  character_set: string;
  idea_count: number;
  history: IdeaHistory;
}

export function createIdeaStore(pool: pg.Pool): IdeaStore {
  return {
    claim: async (workerId, leaseSeconds) => {
      const result = await pool.query<ClaimRow>('SELECT * FROM idea_claim($1, $2)', [
        workerId,
        leaseSeconds,
      ]);
      const row = result.rows[0];
      if (!row) return null;
      return {
        requestId: row.request_id,
        attemptNo: row.attempt_no,
        kit: row.kit,
        characterSet: row.character_set,
        ideaCount: row.idea_count,
        history: row.history,
      };
    },

    complete: async (requestId, workerId, ideas) => {
      const result = await pool.query<{ ok: boolean }>(
        'SELECT idea_complete($1, $2, $3::jsonb) AS ok',
        [requestId, workerId, JSON.stringify(ideas)],
      );
      return result.rows[0]!.ok;
    },

    fail: async (requestId, workerId, error, retryable) => {
      const result = await pool.query<{ status: string }>(
        'SELECT idea_fail($1, $2, $3, $4) AS status',
        [requestId, workerId, error, retryable],
      );
      return result.rows[0]!.status;
    },

    block: async (requestId, workerId, reason, retryAfterSeconds) => {
      const result = await pool.query<{ status: string }>(
        'SELECT idea_block($1, $2, $3, $4) AS status',
        [requestId, workerId, reason, Math.round(retryAfterSeconds)],
      );
      return result.rows[0]!.status;
    },
  };
}
