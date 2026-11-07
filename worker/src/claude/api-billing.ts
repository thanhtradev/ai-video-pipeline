import type pg from 'pg';
import { ProviderBlockedError } from '../runner.js';
import { ClaudeApiUnavailableError, type ApiBudget, type JobRef } from './claude-cli.js';
import type { RunCost } from './usage.js';

// Claude API as owner-approved overflow (D-118). Before every Claude CLI run of a job the worker
// asks claude_api_begin (db/migrations/20261203000100_claude_api.sql): without the owner's grant
// the run stays on Max, unchanged. With one, the run gets the API key and the reserved budget,
// and the CLI's cost is recorded after it. A failed run leaves its reservation unrecorded, which
// counts as fully spent: a crash can never let the month overspend.

export type ClaudeApiDecision = 'SUBSCRIPTION' | 'ALLOW' | 'DENIED' | 'LOST';

export interface ClaudeApiBegin {
  decision: ClaudeApiDecision;
  spendId: string | null;
  maxUsd: number | null;
  reason: string | null;
}

export interface ClaudeApiStore {
  begin: (jobId: string) => Promise<ClaudeApiBegin>;
  /** False when this reservation was already recorded. */
  record: (spendId: string, usd: number, detail: Record<string, unknown>) => Promise<boolean>;
}

interface BeginRow {
  decision: ClaudeApiDecision;
  spend_id: string | null;
  max_usd: number | null;
  reason: string | null;
}

export function createClaudeApiStore(pool: pg.Pool, workerId: string): ClaudeApiStore {
  return {
    begin: async (jobId) => {
      const result = await pool.query<BeginRow>(
        `SELECT decision, spend_id, max_usd::float8 AS max_usd, reason
         FROM claude_api_begin($1, $2)`,
        [jobId, workerId],
      );
      const row = result.rows[0]!;
      return {
        decision: row.decision,
        spendId: row.spend_id,
        maxUsd: row.max_usd,
        reason: row.reason,
      };
    },
    record: async (spendId, usd, detail) => {
      const result = await pool.query<{ recorded: boolean }>(
        'SELECT claude_api_record($1, $2, $3, $4::jsonb) AS recorded',
        [spendId, workerId, usd, JSON.stringify(detail)],
      );
      return result.rows[0]!.recorded;
    },
  };
}

interface Billable {
  job?: JobRef;
  api?: ApiBudget;
}

interface Costed extends RunCost {
  usage: Record<string, unknown> | null;
}

/** Wraps a Claude runner (text or agent) with the owner's grant, if the job has one. */
export function withClaudeApi<Req extends Billable, Res extends Costed>(
  run: (request: Req) => Promise<Res>,
  store: ClaudeApiStore,
  blockSeconds: number,
): (request: Req) => Promise<Res> {
  return async (request) => {
    if (!request.job) return run(request);
    const lease = await store.begin(request.job.id);
    if (lease.decision === 'SUBSCRIPTION') return run(request);
    if (lease.decision === 'LOST') {
      throw new Error(`claude api: job ${request.job.id} is not running for this worker`);
    }
    if (lease.decision === 'DENIED' || lease.spendId === null || lease.maxUsd === null) {
      throw new ProviderBlockedError(
        `claude api refused: ${lease.reason ?? 'no reservation'}; the job waits for Max`,
        blockSeconds,
      );
    }

    let result: Res;
    try {
      result = await run({ ...request, api: { maxBudgetUsd: lease.maxUsd } });
    } catch (error) {
      // Refused before the CLI started: nothing was spent, so the reservation is freed.
      if (error instanceof ClaudeApiUnavailableError) {
        await store.record(lease.spendId, 0, {
          refused: error.message.replace(/^claude api: /, ''),
        });
      }
      throw error;
    }
    await store.record(lease.spendId, result.costUsd ?? lease.maxUsd, {
      models: result.models,
      usage: result.usage,
    });
    return result;
  };
}
