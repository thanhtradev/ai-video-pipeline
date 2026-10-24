import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pino from 'pino';
import { beforeEach, describe, expect, test } from 'vitest';
import type { CostStore, GuardDecision, GuardResult } from '../../src/db/cost-store.js';
import { billedChars, createTtsHandler, type TtsHandlerDeps } from '../../src/handlers/tts.js';
import { PermanentJobError, ProviderBlockedError, type HandlerContext } from '../../src/runner.js';
import type { IteraClient, IteraTask, SpeechRequest } from '../../src/tts/itera-client.js';

const MODEL = 'a3bb189e-8bf9-4888-9912-ace4e6543002';
const INPUT = {
  scenes: [
    { index: 1, text: 'Bầu trời xanh.' },
    { index: 2, text: 'Vì tán xạ.' },
  ],
  provider_model_id: MODEL,
  language: 'vi',
};
const PARAMS = { provider: 'elevenlabs', language_code: 'vi', voice_id: 'voice-1' };

let workDir: string;
let created: SpeechRequest[];
let guardCalls: number[];
let recorded: { ref: string; units: number; amount: number }[];
let decision: GuardDecision;
let balance: number;
let taskStatus: (id: string, polls: number) => IteraTask['status'];

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'tts-'));
  created = [];
  guardCalls = [];
  recorded = [];
  decision = 'ALLOW';
  balance = 1000;
  taskStatus = () => 'completed';
});

function fakeItera(): IteraClient {
  const polls = new Map<string, number>();
  return {
    createSpeech: async (request) => {
      created.push(request);
      return `task-${created.length}`;
    },
    getTask: async (id) => {
      const count = (polls.get(id) ?? 0) + 1;
      polls.set(id, count);
      const status = taskStatus(id, count);
      return {
        id,
        status,
        audioUrl: status === 'completed' ? `https://api.genmax.io/audio/${id}.mp3` : undefined,
        error: status === 'failed' ? 'voice unavailable' : undefined,
        charactersUsed: 14,
        creditsDeducted: 15,
      };
    },
    creditBalance: async () => balance,
    download: async (url) => new TextEncoder().encode(`mp3:${url}`),
  };
}

function fakeCosts(): CostStore {
  return {
    guard: async (_jobId, _workerId, units): Promise<GuardResult> => {
      guardCalls.push(units);
      return {
        decision,
        providerId: 'itera',
        modelId: 'eleven_multilingual_v2',
        params: PARAMS,
        amount: units,
        budget: 30,
        spent: 0,
        currency: 'CRD',
      };
    },
    record: async (_jobId, _workerId, ref, units, amount) => {
      recorded.push({ ref, units, amount });
      return true;
    },
  };
}

function deps(overrides: Partial<TtsHandlerDeps> = {}): TtsHandlerDeps {
  return {
    itera: fakeItera(),
    costs: fakeCosts(),
    probe: async () => 2.5,
    workerId: 'mac-mini-m4',
    pollMs: 1,
    taskTimeoutMs: 200,
    blockSeconds: 3600,
    ...overrides,
  };
}

function context(input: unknown = INPUT): HandlerContext {
  return {
    jobId: 'job-1',
    attemptNo: 1,
    input,
    workDir,
    signal: new AbortController().signal,
    logger: pino({ level: 'silent' }),
  };
}

describe('tts handler', () => {
  test('makes one clip per scene with the configured voice and reports the costs', async () => {
    const result = await createTtsHandler(deps())(context());

    expect(result.outputs).toEqual(['scene-01.mp3', 'scene-02.mp3']);
    expect(created.map((r) => [r.voiceId, r.modelId, r.provider, r.languageCode, r.text])).toEqual([
      ['voice-1', 'eleven_multilingual_v2', 'elevenlabs', 'vi', 'Bầu trời xanh.'],
      ['voice-1', 'eleven_multilingual_v2', 'elevenlabs', 'vi', 'Vì tán xạ.'],
    ]);
    // One configuration check, then one guard per paid call with its billed characters.
    expect(guardCalls).toEqual([0, 14, 10]);
    expect(recorded).toEqual([
      { ref: 'task-1', units: 14, amount: 15 },
      { ref: 'task-2', units: 14, amount: 15 },
    ]);
    expect(result.result).toMatchObject({
      provider: 'itera',
      voice_id: 'voice-1',
      total_seconds: 5,
      total_credits: 30,
      scenes: [
        { index: 1, file: 'scene-01.mp3', task_id: 'task-1', duration_seconds: 2.5, credits: 15 },
        { index: 2, file: 'scene-02.mp3', task_id: 'task-2', duration_seconds: 2.5, credits: 15 },
      ],
    });
    expect(await readFile(join(workDir, 'scene-01.mp3'), 'utf8')).toContain('task-1.mp3');
  });

  test('counts code points after NFC, like the SQL estimate', () => {
    expect(billedChars('à')).toBe(1);
    expect(billedChars('Bầu trời xanh.')).toBe(14);
  });

  test('a re-run reuses finished scenes and pays nothing again', async () => {
    const handler = createTtsHandler(deps());
    await handler(context());
    created = [];
    recorded = [];

    await handler(context());

    expect(created).toEqual([]);
    expect(recorded).toEqual([]);
  });

  test('a re-run after a timeout polls the queued task instead of paying for a new one', async () => {
    taskStatus = () => 'processing';
    const first = await createTtsHandler(deps({ taskTimeoutMs: 5 }))(context()).catch(
      (e: unknown) => e,
    );
    expect(String(first)).toMatch(/not finished/);
    expect(created).toHaveLength(1);

    taskStatus = () => 'completed';
    await createTtsHandler(deps())(context());

    expect(created).toHaveLength(2); // only scene 2 was new
    expect(recorded.map((r) => r.ref)).toEqual(['task-1', 'task-2']);
  });

  test('a failed provider task is retryable and is forgotten so the next attempt queues anew', async () => {
    taskStatus = (id) => (id === 'task-1' ? 'failed' : 'completed');
    const error = await createTtsHandler(deps())(context()).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(PermanentJobError);
    expect(String(error)).toMatch(/task-1 failed: voice unavailable/);
    expect(await readdir(workDir)).not.toContain('scene-01.json');
  });

  test('changing the text makes a new clip for that scene', async () => {
    await createTtsHandler(deps())(context());
    const edited = { ...INPUT, scenes: [INPUT.scenes[0], { index: 2, text: 'Khác.' }] };

    await createTtsHandler(deps())(context(edited));

    expect(created.map((r) => r.text)).toEqual(['Bầu trời xanh.', 'Vì tán xạ.', 'Khác.']);
  });

  test.each(['DISABLED', 'EXHAUSTED'] as const)(
    'blocks the job when the guard says %s',
    async (d) => {
      decision = d;
      const error = await createTtsHandler(deps())(context()).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ProviderBlockedError);
      expect(created).toEqual([]);
    },
  );

  test.each(['OVER_BUDGET', 'NO_PRICE'] as const)(
    'needs a decision when the guard says %s',
    async (d) => {
      decision = d;
      await expect(createTtsHandler(deps())(context())).rejects.toBeInstanceOf(PermanentJobError);
      expect(created).toEqual([]);
    },
  );

  test('blocks without an API key, a voice, or enough credits, before any paid call', async () => {
    await expect(createTtsHandler(deps({ itera: null }))(context())).rejects.toThrow(
      /API key is not configured/,
    );

    const costs = fakeCosts();
    const noVoice: CostStore = {
      ...costs,
      guard: async (...args) => ({ ...(await costs.guard(...args)), params: { provider: 'x' } }),
    };
    await expect(createTtsHandler(deps({ costs: noVoice }))(context())).rejects.toBeInstanceOf(
      ProviderBlockedError,
    );

    balance = 5;
    await expect(createTtsHandler(deps())(context())).rejects.toThrow(/credit balance 5/);
    expect(created).toEqual([]);
  });

  test('rejects invalid input permanently', async () => {
    await expect(createTtsHandler(deps())(context({ scenes: [] }))).rejects.toBeInstanceOf(
      PermanentJobError,
    );
  });

  test('ignores a corrupt scene state file', async () => {
    await writeFile(join(workDir, 'scene-01.json'), '{not json');
    await createTtsHandler(deps())(context());
    expect(created).toHaveLength(2);
  });
});
