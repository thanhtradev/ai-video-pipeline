import type pg from 'pg';

// Thin wrapper over the job lifecycle SQL functions (db/migrations/*_job_functions.sql).
// All state rules live in the database; this module only maps rows to types.

export type HeartbeatStatus = 'RUNNING' | 'CANCELLED' | 'LOST' | 'NOT_FOUND';

export interface StartedJob {
  jobId: string;
  attemptNo: number;
  step: string;
  input: unknown;
  videoVersionId: string;
  videoId: string;
  version: number;
}

export interface JobStore {
  start: (jobId: string, workerId: string, leaseSeconds: number) => Promise<StartedJob | null>;
  heartbeat: (jobId: string, workerId: string, leaseSeconds: number) => Promise<HeartbeatStatus>;
  /** What a running job is doing (P-017); false when the job is not running for this worker. */
  reportProgress: (
    jobId: string,
    workerId: string,
    progress: Record<string, unknown>,
  ) => Promise<boolean>;
  succeed: (jobId: string, workerId: string, output: Record<string, unknown>) => Promise<boolean>;
  fail: (jobId: string, workerId: string, error: string, retryable: boolean) => Promise<string>;
  /** Provider usage limit: BLOCKED until retryAfterSeconds pass. Returns BLOCKED or LOST. */
  block: (
    jobId: string,
    workerId: string,
    reason: string,
    retryAfterSeconds: number,
  ) => Promise<string>;
  workerHeartbeat: (
    workerId: string,
    streams: readonly string[],
    apiUrl: string | undefined,
  ) => Promise<void>;
  /** Records that every queue this worker serves was empty (watchdog lost-message detection). */
  workerIdle: (workerId: string) => Promise<void>;
}

interface StartRow {
  attempt_no: number;
  step: string;
  input: unknown;
  video_version_id: string;
  video_id: string;
  version: number;
}

export function createJobStore(pool: pg.Pool): JobStore {
  return {
    start: async (jobId, workerId, leaseSeconds) => {
      const result = await pool.query<StartRow>('SELECT * FROM job_start($1, $2, $3)', [
        jobId,
        workerId,
        leaseSeconds,
      ]);
      const row = result.rows[0];
      if (!row) return null;
      return {
        jobId,
        attemptNo: row.attempt_no,
        step: row.step,
        input: row.input,
        videoVersionId: row.video_version_id,
        videoId: row.video_id,
        version: row.version,
      };
    },

    heartbeat: async (jobId, workerId, leaseSeconds) => {
      const result = await pool.query<{ status: HeartbeatStatus }>(
        'SELECT job_heartbeat($1, $2, $3) AS status',
        [jobId, workerId, leaseSeconds],
      );
      return result.rows[0]!.status;
    },

    reportProgress: async (jobId, workerId, progress) => {
      const result = await pool.query<{ ok: boolean }>(
        'SELECT job_report_progress($1, $2, $3::jsonb) AS ok',
        [jobId, workerId, JSON.stringify(progress)],
      );
      return result.rows[0]!.ok;
    },

    succeed: async (jobId, workerId, output) => {
      const result = await pool.query<{ ok: boolean }>(
        'SELECT job_succeed($1, $2, $3::jsonb) AS ok',
        [jobId, workerId, JSON.stringify(output)],
      );
      return result.rows[0]!.ok;
    },

    fail: async (jobId, workerId, error, retryable) => {
      const result = await pool.query<{ status: string }>(
        'SELECT job_fail($1, $2, $3, $4) AS status',
        [jobId, workerId, error, retryable],
      );
      return result.rows[0]!.status;
    },

    block: async (jobId, workerId, reason, retryAfterSeconds) => {
      const result = await pool.query<{ status: string }>(
        'SELECT job_block($1, $2, $3, $4) AS status',
        [jobId, workerId, reason, Math.round(retryAfterSeconds)],
      );
      return result.rows[0]!.status;
    },

    workerHeartbeat: async (workerId, streams, apiUrl) => {
      await pool.query('SELECT worker_heartbeat($1, $2, $3)', [workerId, streams, apiUrl ?? null]);
    },

    workerIdle: async (workerId) => {
      await pool.query('SELECT worker_idle($1)', [workerId]);
    },
  };
}
