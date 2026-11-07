// What one Claude Code CLI run used, from its `--output-format json` envelope (Q-004).
// `total_cost_usd` is the CLI's own estimate at API list prices; on the Max subscription nothing is
// billed per request, so it measures what a run would cost on the Claude API, not what it cost.

const TOKEN_FIELDS = [
  'input_tokens',
  'output_tokens',
  'cache_read_input_tokens',
  'cache_creation_input_tokens',
] as const;

export type TokenTotals = Record<(typeof TOKEN_FIELDS)[number], number>;

export interface RunCost {
  /** The CLI's list-price estimate in USD; null when the envelope has none. */
  costUsd: number | null;
  /** The models that ran (keys of the envelope's `modelUsage`), sorted. */
  models: string[];
}

/** The usage object of an envelope, or null. */
export function usageOf(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

export function runCost(envelope: { total_cost_usd?: unknown; modelUsage?: unknown }): RunCost {
  const cost = envelope.total_cost_usd;
  const models = usageOf(envelope.modelUsage);
  return {
    costUsd: typeof cost === 'number' && Number.isFinite(cost) ? cost : null,
    models: models ? Object.keys(models).sort() : [],
  };
}

/** Adds the token counts of several runs; missing or non-numeric fields count as 0. */
export function sumUsage(
  usages: readonly (Record<string, unknown> | null | undefined)[],
): TokenTotals {
  const count = (usage: Record<string, unknown> | null | undefined, field: string): number => {
    const value = usage?.[field];
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  };
  return Object.fromEntries(
    TOKEN_FIELDS.map((field) => [field, usages.reduce((sum, u) => sum + count(u, field), 0)]),
  ) as TokenTotals;
}
