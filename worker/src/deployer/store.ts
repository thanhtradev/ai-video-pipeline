import type pg from 'pg';
import type { DeployAction, DeployPoll, DeployStore, PreflightResult } from './deployer.js';

interface PollRow {
  action: DeployAction;
  request_id: string | null;
  sha: string | null;
  last_sha: string | null;
  target: string | null;
}

export function createDeployStore(
  pool: pg.Pool,
  workerId: string,
  canDeployN8n: boolean,
): DeployStore {
  return {
    poll: async (): Promise<DeployPoll> => {
      const result = await pool.query<PollRow>('SELECT * FROM deploy_poll($1, $2)', [
        workerId,
        canDeployN8n,
      ]);
      const row = result.rows[0]!;
      return {
        action: row.action,
        requestId: row.request_id,
        sha: row.sha,
        lastSha: row.last_sha,
        target: row.target,
      };
    },

    reportPreflight: async (requestId: string, report: PreflightResult) => {
      await pool.query('SELECT deploy_preflight_report($1, $2, $3, $4, $5, $6)', [
        workerId,
        requestId,
        report.sha,
        report.commits,
        report.migrations,
        report.error,
      ]);
    },

    reportTarget: async (requestId, target, ok, detail) => {
      const result = await pool.query<{ accepted: boolean }>(
        'SELECT deploy_target_report($1, $2, $3, $4, $5) AS accepted',
        [workerId, requestId, target, ok, detail],
      );
      return result.rows[0]!.accepted;
    },
  };
}
