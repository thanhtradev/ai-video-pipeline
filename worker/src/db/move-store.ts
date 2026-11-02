import type pg from 'pg';

// Thin wrapper over the video move functions (db/migrations/20261117000100_worker_choice_move.sql,
// D-087). The rules (who may claim, attempts, lease expiry, re-pinning) live in the database.

export interface ClaimedMove {
  moveId: string;
  videoId: string;
  fromWorker: string;
  /** The source worker's API base URL; null when it never reported one. */
  sourceUrl: string | null;
  token: string;
  attemptNo: number;
}

export interface MoveStore {
  claim: (workerId: string, leaseSeconds: number) => Promise<ClaimedMove | null>;
  /** Source side: whether a /transfer request carries the current copy token of this video. */
  tokenValid: (workerId: string, videoId: string, token: string) => Promise<boolean>;
  /** DONE, or LOST when the move is no longer this worker's copy. */
  complete: (moveId: string, workerId: string) => Promise<string>;
  /** WAITING (another attempt follows), FAILED, or LOST. */
  fail: (moveId: string, workerId: string, error: string) => Promise<string>;
}

interface ClaimRow {
  move_id: string;
  video_id: string;
  from_worker: string;
  source_url: string | null;
  token: string;
  attempt_no: number;
}

export function createMoveStore(pool: pg.Pool): MoveStore {
  return {
    claim: async (workerId, leaseSeconds) => {
      const result = await pool.query<ClaimRow>('SELECT * FROM video_move_claim($1, $2)', [
        workerId,
        leaseSeconds,
      ]);
      const row = result.rows[0];
      if (!row) return null;
      return {
        moveId: row.move_id,
        videoId: row.video_id,
        fromWorker: row.from_worker,
        sourceUrl: row.source_url,
        token: row.token,
        attemptNo: row.attempt_no,
      };
    },

    tokenValid: async (workerId, videoId, token) => {
      const result = await pool.query<{ ok: boolean }>(
        'SELECT video_move_token_valid($1, $2, $3) AS ok',
        [workerId, videoId, token],
      );
      return result.rows[0]!.ok;
    },

    complete: async (moveId, workerId) => {
      const result = await pool.query<{ status: string }>(
        'SELECT video_move_complete($1, $2) AS status',
        [moveId, workerId],
      );
      return result.rows[0]!.status;
    },

    fail: async (moveId, workerId, error) => {
      const result = await pool.query<{ status: string }>(
        'SELECT video_move_fail($1, $2, $3) AS status',
        [moveId, workerId, error],
      );
      return result.rows[0]!.status;
    },
  };
}
