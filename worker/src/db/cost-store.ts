import type pg from 'pg';

// Thin wrapper over the cost SQL functions (db/migrations/*_tts_flow.sql). The rules (budget,
// enabled models, prices) live in the database; this module only maps rows to types.

export type GuardDecision =
  'ALLOW' | 'DISABLED' | 'EXHAUSTED' | 'NO_PRICE' | 'OVER_BUDGET' | 'LOST';

export interface GuardResult {
  decision: GuardDecision;
  providerId: string | null;
  modelId: string | null;
  params: Record<string, unknown>;
  amount: number | null;
  budget: number | null;
  spent: number | null;
  currency: string | null;
}

export interface CostStore {
  /** Asks before a paid call whether this job may spend `units` more (CLAUDE.md §5). */
  guard: (jobId: string, workerId: string, units: number) => Promise<GuardResult>;
  /** Records what the provider charged for one task; false when it was already recorded. */
  record: (
    jobId: string,
    workerId: string,
    externalRef: string,
    units: number,
    amount: number,
  ) => Promise<boolean>;
}

interface GuardRow {
  decision: GuardDecision;
  provider_id: string | null;
  model_id: string | null;
  params: Record<string, unknown> | null;
  amount: number | null;
  budget: number | null;
  spent: number | null;
  currency: string | null;
}

export function createCostStore(pool: pg.Pool): CostStore {
  return {
    guard: async (jobId, workerId, units) => {
      const result = await pool.query<GuardRow>(
        `SELECT decision, provider_id, model_id, params, currency,
                amount::float8 AS amount, budget::float8 AS budget, spent::float8 AS spent
         FROM cost_guard($1, $2, $3)`,
        [jobId, workerId, units],
      );
      const row = result.rows[0]!;
      return {
        decision: row.decision,
        providerId: row.provider_id,
        modelId: row.model_id,
        params: row.params ?? {},
        amount: row.amount,
        budget: row.budget,
        spent: row.spent,
        currency: row.currency,
      };
    },

    record: async (jobId, workerId, externalRef, units, amount) => {
      const result = await pool.query<{ inserted: boolean }>(
        'SELECT cost_record($1, $2, $3, $4, $5) AS inserted',
        [jobId, workerId, externalRef, units, amount],
      );
      return result.rows[0]!.inserted;
    },
  };
}
