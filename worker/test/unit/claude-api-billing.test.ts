import { describe, expect, test } from 'vitest';
import {
  withClaudeApi,
  type ClaudeApiBegin,
  type ClaudeApiStore,
} from '../../src/claude/api-billing.js';
import { ClaudeApiUnavailableError } from '../../src/claude/claude-cli.js';
import { ProviderBlockedError } from '../../src/runner.js';

// The worker side of D-118: ask claude_api_begin before every run of a job, run on the API only
// with a reservation, and record what the CLI reports.

interface Request {
  job?: { id: string };
  api?: { maxBudgetUsd: number };
}
interface Result {
  costUsd: number | null;
  models: string[];
  usage: Record<string, unknown> | null;
}

function fakeStore(answer: ClaudeApiBegin) {
  const recorded: [string, number, unknown][] = [];
  const begun: string[] = [];
  const store: ClaudeApiStore = {
    begin: async (jobId) => {
      begun.push(jobId);
      return answer;
    },
    record: async (spendId, usd, detail) => {
      recorded.push([spendId, usd, detail]);
      return true;
    },
  };
  return { store, recorded, begun };
}

function runner(result: Result | Error) {
  const calls: Request[] = [];
  const run = async (request: Request): Promise<Result> => {
    calls.push(request);
    if (result instanceof Error) throw result;
    return result;
  };
  return { run, calls };
}

const RESULT: Result = {
  costUsd: 0.42,
  models: ['claude-sonnet-5-5'],
  usage: { output_tokens: 9 },
};
const ALLOW: ClaudeApiBegin = { decision: 'ALLOW', spendId: 'spend-1', maxUsd: 2, reason: null };

describe('withClaudeApi', () => {
  test('a request without a job (ideas) never asks and runs on the subscription', async () => {
    const { store, begun } = fakeStore(ALLOW);
    const { run, calls } = runner(RESULT);

    await withClaudeApi(run, store, 3600)({});

    expect(begun).toEqual([]);
    expect(calls).toEqual([{}]);
  });

  test('no grant: runs unchanged on the subscription', async () => {
    const { store, recorded } = fakeStore({
      decision: 'SUBSCRIPTION',
      spendId: null,
      maxUsd: null,
      reason: null,
    });
    const { run, calls } = runner(RESULT);

    await withClaudeApi(run, store, 3600)({ job: { id: 'job-1' } });

    expect(calls).toEqual([{ job: { id: 'job-1' } }]);
    expect(recorded).toEqual([]);
  });

  test('a grant: runs with the reserved budget and records the CLI cost', async () => {
    const { store, recorded } = fakeStore(ALLOW);
    const { run, calls } = runner(RESULT);

    const result = await withClaudeApi(run, store, 3600)({ job: { id: 'job-1' } });

    expect(result).toBe(RESULT);
    expect(calls).toEqual([{ job: { id: 'job-1' }, api: { maxBudgetUsd: 2 } }]);
    expect(recorded).toEqual([
      ['spend-1', 0.42, { models: ['claude-sonnet-5-5'], usage: { output_tokens: 9 } }],
    ]);
  });

  test('a run with no cost figure records the whole reservation', async () => {
    const { store, recorded } = fakeStore(ALLOW);
    const { run } = runner({ ...RESULT, costUsd: null });

    await withClaudeApi(run, store, 3600)({ job: { id: 'job-1' } });

    expect(recorded[0]![1]).toBe(2);
  });

  test('a failed run leaves the reservation unrecorded, so it counts as spent', async () => {
    const { store, recorded } = fakeStore(ALLOW);
    const { run } = runner(new Error('claude exited with code 1'));

    await expect(withClaudeApi(run, store, 3600)({ job: { id: 'job-1' } })).rejects.toThrow(
      /exited/,
    );
    expect(recorded).toEqual([]);
  });

  test('a run refused before it started (no key, no model) frees the reservation', async () => {
    const { store, recorded } = fakeStore(ALLOW);
    const { run } = runner(
      new ClaudeApiUnavailableError('PIPELINE_ANTHROPIC_API_KEY is not set', 60),
    );

    await expect(withClaudeApi(run, store, 3600)({ job: { id: 'job-1' } })).rejects.toBeInstanceOf(
      ProviderBlockedError,
    );
    expect(recorded).toEqual([
      ['spend-1', 0, { refused: 'PIPELINE_ANTHROPIC_API_KEY is not set' }],
    ]);
  });

  test('DENIED blocks the job: it waits for Max, never spends', async () => {
    const { store } = fakeStore({
      decision: 'DENIED',
      spendId: null,
      maxUsd: null,
      reason: 'BUDGET',
    });
    const { run, calls } = runner(RESULT);

    const error = await withClaudeApi(
      run,
      store,
      3600,
    )({ job: { id: 'job-1' } }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ProviderBlockedError);
    expect((error as ProviderBlockedError).retryAfterSeconds).toBe(3600);
    expect((error as Error).message).toMatch(/^claude api refused: BUDGET/);
    expect(calls).toEqual([]);
  });

  test('LOST: the job is no longer ours, nothing runs', async () => {
    const { store } = fakeStore({ decision: 'LOST', spendId: null, maxUsd: null, reason: null });
    const { run, calls } = runner(RESULT);

    await expect(withClaudeApi(run, store, 3600)({ job: { id: 'job-1' } })).rejects.toThrow(
      /not running for this worker/,
    );
    expect(calls).toEqual([]);
  });
});
