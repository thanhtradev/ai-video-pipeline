import pino from 'pino';
import { describe, expect, test } from 'vitest';
import type { ClaudeRunner } from '../../src/claude/claude-cli.js';
import type { ClaimedIdeaRequest, IdeaStore } from '../../src/db/idea-store.js';
import { createIdeaRunner } from '../../src/ideas/idea-runner.js';
import { ProviderBlockedError } from '../../src/runner.js';

const REQUEST: ClaimedIdeaRequest = {
  requestId: 'req-1',
  attemptNo: 1,
  kit: 'whatif',
  characterSet: 'chip',
  ideaCount: 1,
  history: { videos: [], unused_ideas: [] },
};

const IDEA = { kind: 'new', topic: 'Nếu bạn là cá heo', hook: 'Nếu bạn…?', angle: 'Mới.' };

function fakeStore(claimed: ClaimedIdeaRequest | null) {
  const calls: { method: string; args: unknown[] }[] = [];
  const store: IdeaStore = {
    claim: async (...args) => {
      calls.push({ method: 'claim', args });
      return claimed;
    },
    complete: async (...args) => {
      calls.push({ method: 'complete', args });
      return true;
    },
    fail: async (...args) => {
      calls.push({ method: 'fail', args });
      return 'PENDING';
    },
    block: async (...args) => {
      calls.push({ method: 'block', args });
      return 'BLOCKED';
    },
  };
  return { store, calls };
}

function runner(store: IdeaStore, claude: ClaudeRunner) {
  return createIdeaRunner({
    store,
    claude,
    workerId: 'mac-mini-m4',
    leaseSeconds: 900,
    logger: pino({ level: 'silent' }),
  });
}

const reply =
  (output: unknown): ClaudeRunner =>
  async () => ({ output, durationMs: 1, numTurns: 1, usage: null });

describe('idea runner', () => {
  test('does nothing when no request is due', async () => {
    const { store, calls } = fakeStore(null);
    expect(await runner(store, reply({ ideas: [IDEA] }))()).toBe(false);
    expect(calls.map((c) => c.method)).toEqual(['claim']);
    expect(calls[0]!.args).toEqual(['mac-mini-m4', 900]);
  });

  test('stores the ideas of a claimed request', async () => {
    const { store, calls } = fakeStore(REQUEST);
    expect(await runner(store, reply({ ideas: [IDEA] }))()).toBe(true);
    expect(calls[1]).toEqual({ method: 'complete', args: ['req-1', 'mac-mini-m4', [IDEA]] });
  });

  test('a bad reply is a retryable failure', async () => {
    const { store, calls } = fakeStore(REQUEST);
    await runner(store, reply({ ideas: [] }))();
    expect(calls[1]!.method).toBe('fail');
    expect(calls[1]!.args.slice(0, 2)).toEqual(['req-1', 'mac-mini-m4']);
    expect(String(calls[1]!.args[2])).toMatch(/schema/);
    expect(calls[1]!.args[3]).toBe(true);
  });

  test("passes the worker loop's stop signal to the Claude call", async () => {
    const { store } = fakeStore(REQUEST);
    const controller = new AbortController();
    let seen: AbortSignal | undefined;
    const capturing: ClaudeRunner = async (request) => {
      seen = request.signal;
      return { output: { ideas: [IDEA] }, durationMs: 1, numTurns: 1, usage: null };
    };
    await runner(store, capturing)(controller.signal);
    expect(seen).toBe(controller.signal);
  });

  test('a shutdown during the Claude call is not a failed attempt', async () => {
    const { store, calls } = fakeStore(REQUEST);
    const controller = new AbortController();
    const interrupted: ClaudeRunner = async (request) => {
      controller.abort();
      throw new Error(`claude aborted: ${String(request.signal.reason)}`);
    };
    expect(await runner(store, interrupted)(controller.signal)).toBe(true);
    expect(calls.map((c) => c.method)).toEqual(['claim']);
  });

  test('a usage limit blocks the request instead of failing it', async () => {
    const { store, calls } = fakeStore(REQUEST);
    const limited: ClaudeRunner = async () => {
      throw new ProviderBlockedError('usage limit reached', 1800);
    };
    await runner(store, limited)();
    expect(calls[1]!.method).toBe('block');
    expect(calls[1]!.args[3]).toBe(1800);
  });
});
