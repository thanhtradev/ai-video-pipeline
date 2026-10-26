import type pg from 'pg';
import { rulesSchema, type RulesSource } from '../rules/channel-rules.js';

/** The channel rules through rules_current() (SECURITY DEFINER; the worker reads no table). */
export function createRulesSource(pool: pg.Pool, workerId: string): RulesSource {
  return async () => {
    const result = await pool.query<{ rules: unknown }>('SELECT rules_current($1) AS rules', [
      workerId,
    ]);
    return rulesSchema.parse(result.rows[0]!.rules);
  };
}
