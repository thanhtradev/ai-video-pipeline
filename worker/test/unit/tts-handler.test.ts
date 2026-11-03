import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pino from 'pino';
import { beforeEach, describe, expect, test } from 'vitest';
import type { CostStore, GuardDecision, GuardResult } from '../../src/db/cost-store.js';
import { billedChars, createTtsHandler, type TtsHandlerDeps } from '../../src/handlers/tts.js';
import { NO_RULES, type ChannelRules } from '../../src/rules/channel-rules.js';
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
let rules: ChannelRules;
let guardParams: Record<string, unknown>;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'tts-'));
  created = [];
  guardCalls = [];
  recorded = [];
  decision = 'ALLOW';
  balance = 1000;
  taskStatus = () => 'completed';
  rules = NO_RULES;
  guardParams = PARAMS;
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
        modelId: 'eleven_v3',
        params: guardParams,
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
    rules: async () => rules,
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
    progress: async () => undefined,
  };
}

describe('tts handler', () => {
  test('makes one clip per scene with the configured voice and reports the costs', async () => {
    const result = await createTtsHandler(deps())(context());

    expect(result.outputs).toEqual(['scene-01.mp3', 'scene-02.mp3']);
    expect(created.map((r) => [r.voiceId, r.modelId, r.provider, r.languageCode, r.text])).toEqual([
      ['voice-1', 'eleven_v3', 'elevenlabs', 'vi', 'Bầu trời xanh.'],
      ['voice-1', 'eleven_v3', 'elevenlabs', 'vi', 'Vì tán xạ.'],
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

  test("accepts one act of an episode per request, up to eleven_v4's 10000 characters", async () => {
    balance = 100_000;
    const act = { index: 1, text: `[punchy] ${'Bạn vỗ tay. '.repeat(900)}`.slice(0, 10_000) };
    await createTtsHandler(deps())(context({ ...INPUT, scenes: [act] }));
    expect(created[0]!.text).toBe(act.text);

    const tooLong = { index: 1, text: 'a'.repeat(10_001) };
    await expect(
      createTtsHandler(deps())(context({ ...INPUT, scenes: [tooLong] })),
    ).rejects.toBeInstanceOf(PermanentJobError);
  });

  test('reads the pronunciation table once per job and sends the spoken text (D-059)', async () => {
    rules = {
      ...NO_RULES,
      version: 'v1',
      pronunciation: [{ term: 'TikTok', spoken: 'tích tốc' }],
    };
    const input = { ...INPUT, scenes: [{ index: 1, text: '[punchy] TikTok, ai biết TikTok?' }] };
    const result = await createTtsHandler(deps())(context(input));

    expect(created[0]!.text).toBe('[punchy] tích tốc, ai biết tích tốc?');
    expect(guardCalls.at(-1)).toBe(billedChars('[punchy] tích tốc, ai biết tích tốc?'));
    expect(result.result.pronunciation).toEqual({
      version: 'v1',
      entries: [{ term: 'TikTok', spoken: 'tích tốc' }],
    });

    // An edit before a retry does not change this job's text (no new paid clip).
    rules = { ...rules, version: 'v2', pronunciation: [{ term: 'TikTok', spoken: 'tic toc' }] };
    await createTtsHandler(deps())(context(input));
    expect(created).toHaveLength(1);
  });

  test('a corrupt scene state stops the job instead of paying for the scene again', async () => {
    await writeFile(join(workDir, 'scene-01.json'), '{not json');
    const error = await createTtsHandler(deps())(context()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PermanentJobError);
    expect(String(error)).toMatch(/corrupt scene state .*scene-01\.json/);
    expect(created).toEqual([]);
  });

  test('a refused request (rate limit, bad request) leaves no intent behind', async () => {
    const refusing: IteraClient = {
      ...fakeItera(),
      createSpeech: async () => {
        throw new ProviderBlockedError('ITERA rate limit', 60);
      },
    };
    await expect(createTtsHandler(deps({ itera: refusing }))(context())).rejects.toBeInstanceOf(
      ProviderBlockedError,
    );
    expect(await readdir(workDir)).not.toContain('scene-01.json');

    // The retry after the block is a normal one: the scene is requested, nothing stops the job.
    const result = await createTtsHandler(deps())(context());
    expect(result.outputs).toEqual(['scene-01.mp3', 'scene-02.mp3']);
  });

  test('writes the intent before the paid request, so a crash in between is visible', async () => {
    const seen: string[] = [];
    const crashing: IteraClient = {
      ...fakeItera(),
      createSpeech: async () => {
        seen.push(await readFile(join(workDir, 'scene-01.json'), 'utf8'));
        throw new Error('process killed after the request reached the provider');
      },
    };
    await expect(createTtsHandler(deps({ itera: crashing }))(context())).rejects.toThrow(
      /process killed/,
    );
    expect(JSON.parse(seen[0]!)).toMatchObject({ taskId: null, done: false, chars: 14 });
  });

  test('an unrecorded request stops the job once; the owner retry requests the scene again', async () => {
    const crashing: IteraClient = {
      ...fakeItera(),
      createSpeech: async () => {
        throw new Error('killed');
      },
    };
    await expect(createTtsHandler(deps({ itera: crashing }))(context())).rejects.toThrow(/killed/);

    const error = await createTtsHandler(deps())(context()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PermanentJobError);
    expect(String(error)).toMatch(/scene 1: a TTS request of 14 characters may have been sent/);
    expect(created).toEqual([]);
    expect(JSON.parse(await readFile(join(workDir, 'scene-01.json'), 'utf8'))).toMatchObject({
      taskId: null,
      reported: true,
    });

    // After /retry (the only way past a permanent failure) the scene is requested again.
    const result = await createTtsHandler(deps())(context());
    expect(created).toHaveLength(2);
    expect(result.outputs).toEqual(['scene-01.mp3', 'scene-02.mp3']);
  });

  test('a completed task without audio is recorded as paid and polled again next time', async () => {
    const itera = fakeItera();
    let withoutAudio = true;
    const flaky: IteraClient = {
      ...itera,
      getTask: async (id, signal) => {
        const task = await itera.getTask(id, signal);
        return withoutAudio && id === 'task-1' ? { ...task, audioUrl: undefined } : task;
      },
    };
    const error = await createTtsHandler(deps({ itera: flaky }))(context()).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(PermanentJobError);
    expect(String(error)).toMatch(/task-1 completed without an audio url/);
    expect(recorded).toEqual([{ ref: 'task-1', units: 14, amount: 15 }]);
    expect(await readdir(workDir)).toContain('scene-01.json');

    withoutAudio = false;
    await createTtsHandler(deps({ itera: flaky }))(context());
    // No new request for scene 1: the paid task was polled again.
    expect(created).toHaveLength(2);
    expect(recorded.map((r) => r.ref)).toEqual(['task-1', 'task-1', 'task-2']);
  });
});

describe('voice per language (D-092)', () => {
  const EN_INPUT = {
    ...INPUT,
    scenes: [{ index: 1, text: 'What if you could fly?' }],
    language: 'en',
  };
  const EN_VOICE = { voice_id: 'voice-en', language_code: 'en' };

  test('an English job reads with the English voice of the model', async () => {
    guardParams = { ...PARAMS, voices: { en: EN_VOICE } };
    const result = await createTtsHandler(deps())(context(EN_INPUT));
    expect(created.map((r) => [r.voiceId, r.languageCode, r.provider])).toEqual([
      ['voice-en', 'en', 'elevenlabs'],
    ]);
    expect(result.result.voice_id).toBe('voice-en');
  });

  test('an English job without an English voice waits instead of using another voice', async () => {
    await expect(createTtsHandler(deps())(context(EN_INPUT))).rejects.toThrow(
      /no TTS voice configured for language en/,
    );
    expect(created).toEqual([]);
  });

  test('a Vietnamese job keeps the flat voice when a voices map is added', async () => {
    guardParams = { ...PARAMS, voices: { en: EN_VOICE } };
    await createTtsHandler(deps())(context());
    expect(created.map((r) => [r.voiceId, r.languageCode])).toEqual([
      ['voice-1', 'vi'],
      ['voice-1', 'vi'],
    ]);
  });

  test('the Vietnamese pronunciation table is not applied to English narration', async () => {
    guardParams = { ...PARAMS, voices: { en: EN_VOICE } };
    rules = { ...NO_RULES, pronunciation: [{ term: 'fly', spoken: 'phờ lai' }] };
    await createTtsHandler(deps())(context(EN_INPUT));
    expect(created[0]!.text).toBe('What if you could fly?');
  });
});

describe('voice per kit (D-095)', () => {
  const SCIENCE_VOICE = { voice_id: 'voice-science', language_code: 'vi' };
  const EN_VOICE = { voice_id: 'voice-en', language_code: 'en' };

  test('a job of a kit with its own voice reads with that voice', async () => {
    guardParams = { ...PARAMS, kit_voices: { science: SCIENCE_VOICE } };
    const result = await createTtsHandler(deps())(context({ ...INPUT, kit: 'science' }));
    expect(created.map((r) => [r.voiceId, r.languageCode])).toEqual([
      ['voice-science', 'vi'],
      ['voice-science', 'vi'],
    ]);
    expect(result.result.voice_id).toBe('voice-science');
  });

  test.each([{ kit: 'whatif' }, {}])(
    'another kit or no kit keeps the language voice (%j)',
    async (kit) => {
      guardParams = { ...PARAMS, kit_voices: { science: SCIENCE_VOICE } };
      await createTtsHandler(deps())(context({ ...INPUT, ...kit }));
      expect(created.map((r) => r.voiceId)).toEqual(['voice-1', 'voice-1']);
    },
  );

  test('the kit voice wins over the language voice', async () => {
    guardParams = {
      ...PARAMS,
      voices: { en: EN_VOICE },
      kit_voices: { 'whatif-en': { voice_id: 'voice-whatif-en', language_code: 'en' } },
    };
    const input = {
      ...INPUT,
      scenes: [{ index: 1, text: 'What if?' }],
      language: 'en',
      kit: 'whatif-en',
    };
    await createTtsHandler(deps())(context(input));
    expect(created.map((r) => [r.voiceId, r.languageCode])).toEqual([['voice-whatif-en', 'en']]);
  });

  test('a half-configured kit voice is ignored', async () => {
    guardParams = { ...PARAMS, kit_voices: { science: { voice_id: 'voice-science' } } };
    await createTtsHandler(deps())(context({ ...INPUT, kit: 'science' }));
    expect(created[0]!.voiceId).toBe('voice-1');
  });
});
