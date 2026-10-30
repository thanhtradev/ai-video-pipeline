import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pino from 'pino';
import { beforeEach, describe, expect, test } from 'vitest';
import { agentArgs, type AgentRunner, type AgentTurn } from '../../src/claude/agent-cli.js';
import { agentSettings, SFX_COMMAND, TYPECHECK_COMMAND } from '../../src/episode/agent-settings.js';
import {
  browserCrash,
  describeFailures,
  type GateReport,
  type GateRunner,
} from '../../src/episode/gates.js';
import { createEpisodeCodeHandler, type EpisodeCodeDeps } from '../../src/handlers/episode-code.js';
import type { LoudnessNormalizer } from '../../src/media/loudness.js';
import { NO_RULES } from '../../src/rules/channel-rules.js';
import { PermanentJobError, ProviderBlockedError, type HandlerContext } from '../../src/runner.js';
import { writeCheckpoint } from '../../src/storage/checkpoint.js';

const SCRIPT_JOB = '11111111-1111-4111-8111-111111111111';
const TIMING_JOB = '22222222-2222-4222-8222-222222222222';
const PREVIOUS_JOB = '33333333-3333-4333-8333-333333333333';
const CODE_JOB = '44444444-4444-4444-8444-444444444444';
const INPUT = { script_job_id: SCRIPT_JOB, timing_job_id: TIMING_JOB };
const SECRET = 'sk-test-secret-value-0123456789';

const PASS: GateReport = {
  ok: true,
  typecheck: { ok: true, output: '' },
  sfx: { ok: true, files: ['clap.wav'] },
  board: { ok: true, pages: ['board/page-01.jpg'] },
  mix: { ok: true, file: 'board/mix.wav' },
  textBounds: { ok: true, sharp: 0, blur: 1, rows: [] },
};
const FAIL: GateReport = {
  ok: false,
  typecheck: {
    ok: false,
    output: "src/episode/Episode.tsx(3,1): error TS2304: Cannot find name 'x'.",
  },
};
const TEXT_FAIL: GateReport = {
  ...PASS,
  ok: false,
  textBounds: {
    ok: false,
    sharp: 1,
    blur: 0,
    rows: [{ kind: 'html', side: 't16', text: 'NHỚ CHI TIẾT NÀY', from: 2310, to: 2380 }],
  },
};
const CHROME_CRASH: GateReport = {
  ...PASS,
  ok: false,
  textBounds: {
    ok: false,
    error: 'Error: Page crashed!\n    at #onTargetCrashed (index.mjs:3562:24)',
  },
};

let jobsDir: string;
let workDir: string;
let turns: AgentTurn[];
let reported: Record<string, unknown>[];
let mixed: [string, string][];

async function writeJob(id: string, files: Record<string, string>): Promise<void> {
  const dir = join(jobsDir, id);
  await mkdir(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    await mkdir(join(dir, name, '..'), { recursive: true });
    await writeFile(join(dir, name), content);
  }
  await writeCheckpoint(dir, Object.keys(files), {});
}

beforeEach(async () => {
  jobsDir = await realpath(await mkdtemp(join(tmpdir(), 'jobs-')));
  workDir = join(jobsDir, CODE_JOB);
  await mkdir(workDir);
  turns = [];
  reported = [];
  mixed = [];
  await writeJob(SCRIPT_JOB, { 'script.json': '{}', 'script.md': '# Nếu bạn dừng thời gian\n' });
  await writeJob(TIMING_JOB, {
    'timing.json': '{"shots":[]}',
    'captions.json': '{"captions":[]}',
    'voice.wav': 'RIFF',
  });
});

/** Writes the episode on the first turn; `extra` lets a test write more. */
function agent(extra?: (turn: AgentTurn, n: number) => Promise<void>): AgentRunner {
  return async (turn) => {
    turns.push(turn);
    if (turns.length === 1) {
      await writeFile(
        join(turn.cwd, 'src/episode/Episode.tsx'),
        'export const Episode = () => null;\n',
      );
    }
    await extra?.(turn, turns.length);
    return {
      sessionId: 'session-1',
      text: 'done',
      isError: false,
      numTurns: 5,
      durationMs: 1000,
      usage: null,
    };
  };
}

function gates(...reports: GateReport[]): GateRunner {
  let n = 0;
  return async (ws) => {
    const report = reports[Math.min(n++, reports.length - 1)]!;
    await mkdir(join(ws, 'board'), { recursive: true });
    for (const page of report.board?.pages ?? []) await writeFile(join(ws, page), 'jpg');
    if (report.mix?.file) await writeFile(join(ws, report.mix.file), 'RIFF');
    await writeFile(join(ws, 'gates.json'), JSON.stringify(report));
    return report;
  };
}

const MIX_LOUDNESS = {
  input_lufs: -18,
  input_true_peak: -2,
  output_lufs: -14,
  output_true_peak: -1.5,
};
const loudness: LoudnessNormalizer = async (input, output) => {
  mixed.push([input, output]);
  await writeFile(output, 'm4a');
  return MIX_LOUDNESS;
};

function deps(overrides: Partial<EpisodeCodeDeps> = {}): EpisodeCodeDeps {
  return {
    loudness,
    agent: agent(),
    gates: gates(PASS),
    secrets: [SECRET],
    rules: async () => ({ ...NO_RULES, video: [{ id: 1, text: 'Không dùng nhạc nền.' }] }),
    browserReady: () => true,
    blockSeconds: 1800,
    runtimeRoot: '/Users/aivideo/aivideo',
    ...overrides,
  };
}

function context(input: unknown = INPUT, attemptNo = 1): HandlerContext {
  return {
    jobId: CODE_JOB,
    attemptNo,
    input,
    workDir,
    signal: new AbortController().signal,
    logger: pino({ level: 'silent' }),
    progress: async (p) => {
      reported.push(p);
    },
  };
}

describe('episode_code handler', () => {
  test('encodes the audio mix for the storyboard request, with a media token (D-071)', async () => {
    const result = await createEpisodeCodeHandler(deps())(context());

    const ws = await realpath(join(workDir, 'ws'));
    expect(mixed).toEqual([[join(ws, 'board/mix.wav'), join(workDir, 'mix.m4a')]]);
    expect(result.outputs).toContain('mix.m4a');
    expect(result.outputs).not.toContain('ws/board/mix.wav');
    expect(result.result).toMatchObject({ mix_loudness: MIX_LOUDNESS });
    expect(result.result.media_token).toMatch(/^[0-9a-f]{32}$/);
  });

  test('has no mix when the gate report predates it', async () => {
    const { mix: _mix, ...old } = PASS;
    const result = await createEpisodeCodeHandler(deps({ gates: gates(old) }))(context());
    expect(mixed).toEqual([]);
    expect(result.outputs).not.toContain('mix.m4a');
    expect(result.result).toMatchObject({ mix_loudness: null });
  });

  test('a failed mix is reported to the agent, and a Chrome crash there is retried', () => {
    const broken: GateReport = { ...PASS, ok: false, mix: { ok: false, error: 'staticFile x' } };
    expect(describeFailures(broken)).toEqual(['The audio mix render failed:\nstaticFile x']);
    const crash: GateReport = { ...PASS, ok: false, mix: { ok: false, error: 'Target closed' } };
    expect(browserCrash(crash)).toBe('Target closed');
  });

  test('writes, then reviews the storyboard in the same session, and returns the code', async () => {
    const result = await createEpisodeCodeHandler(deps())(context());

    const ws = join(workDir, 'ws');
    expect(turns).toHaveLength(2);
    expect(turns[0]).toMatchObject({ cwd: ws, settingsPath: join(workDir, 'agent-settings.json') });
    expect(turns[0]!.resumeSessionId).toBeUndefined();
    expect(turns[0]!.prompt).toMatch(/Write the episode described in brief.md/);
    expect(turns[1]!.resumeSessionId).toBe('session-1');
    expect(turns[1]!.prompt).toMatch(
      /checks passed[\s\S]*review the storyboard pages board\/page-01.jpg/,
    );
    expect(await readFile(join(ws, 'CLAUDE.md'), 'utf8')).toMatch(/Episode workspace/);
    expect(await readFile(join(ws, 'brief.md'), 'utf8')).toContain('Nếu bạn dừng thời gian');
    expect(await readFile(join(ws, 'rules.md'), 'utf8')).toContain('- Không dùng nhạc nền.');
    expect(existsSync(join(ws, 'kit/rig/Character.tsx'))).toBe(true);
    expect(existsSync(join(ws, 'kit/active/theme.ts'))).toBe(true);
    expect(await readFile(join(ws, 'kit/active/cast.ts'), 'utf8')).toContain(
      'characters/chip/cast',
    );
    expect(turns[0]!.prompt).toContain('kit/episodes/ep5/');
    expect(existsSync(join(ws, 'public/voice.wav'))).toBe(true);
    expect(result.outputs).toEqual(
      expect.arrayContaining([
        'ws/src/episode/Episode.tsx',
        'ws/sfx/generate-sfx.mjs',
        'ws/board/page-01.jpg',
        'ws/gates.json',
        'agent-turns.json',
      ]),
    );
    expect(result.result).toMatchObject({ turns: 2, board_pages: ['ws/board/page-01.jpg'] });
    // WF-12 fetches the pages from the worker API with this token (D-055).
    expect(result.result.board_token).toMatch(/^[0-9a-f]{32}$/);
    const log = JSON.parse(await readFile(join(workDir, 'agent-turns.json'), 'utf8'));
    expect(log).toMatchObject({ sessionId: 'session-1', report: { ok: true } });
    expect(log.turns.map((t: { gates: { ok: boolean } }) => t.gates.ok)).toEqual([true, true]);
    // /status on Telegram (P-017) sees each agent turn and gate run.
    expect(reported).toEqual([
      { stage: 'agent', turn: 1, of: 3 },
      { stage: 'gates', turn: 1, of: 3 },
      { stage: 'agent', turn: 2, of: 3 },
      { stage: 'gates', turn: 2, of: 3 },
    ]);
  });

  test('gives the agent the gate failures and stops once they pass', async () => {
    await createEpisodeCodeHandler(deps({ gates: gates(FAIL, TEXT_FAIL, PASS) }))(context());

    expect(turns).toHaveLength(3);
    expect(turns[1]!.prompt).toMatch(/Typecheck failed:[\s\S]*Cannot find name 'x'/);
    expect(turns[2]!.prompt).toMatch(
      /1 sharp texts are partly outside[\s\S]*"NHỚ CHI TIẾT NÀY" html, t16/,
    );
  });

  test('skips the third turn when the review turn passes', async () => {
    await createEpisodeCodeHandler(deps({ gates: gates(FAIL, PASS) }))(context());
    expect(turns).toHaveLength(2);
  });

  test('fails permanently when the gates still fail after the last turn', async () => {
    const error = await createEpisodeCodeHandler(deps({ gates: gates(FAIL) }))(context()).catch(
      (e: unknown) => e,
    );
    expect(turns).toHaveLength(3);
    expect(error).toBeInstanceOf(PermanentJobError);
    expect((error as Error).message).toMatch(
      /episode gates failed after 3 turns: Typecheck failed/,
    );
  });

  test('stops starting turns at the time limit', async () => {
    const slow = agent(() => new Promise((resolve) => setTimeout(resolve, 20)));
    await createEpisodeCodeHandler(deps({ agent: slow, limitMs: 10 }))(context());
    expect(turns).toHaveLength(1);
    expect(turns[0]!.timeoutMs).toBeLessThanOrEqual(10);
  });

  test('refuses agent files that contain a secret', async () => {
    const leaky = agent(async (turn) => {
      await writeFile(join(turn.cwd, 'sfx/generate-sfx.mjs'), `// ${SECRET}\n`);
    });
    await expect(createEpisodeCodeHandler(deps({ agent: leaky }))(context())).rejects.toThrow(
      /contain a secret: sfx\/generate-sfx.mjs/,
    );
  });

  test('a revision starts from the previous code with the feedback', async () => {
    await writeJob(PREVIOUS_JOB, {
      'ws/src/episode/Episode.tsx': '// previous version\n',
      'ws/sfx/generate-sfx.mjs': '// previous sfx\n',
    });
    const input = {
      ...INPUT,
      revision: { previous_job_id: PREVIOUS_JOB, feedback: 'Shot 2.3 tối quá.' },
    };
    const seen: string[] = [];
    const reader = agent(async (turn, n) => {
      if (n === 1) seen.push(await readFile(join(turn.cwd, 'sfx/generate-sfx.mjs'), 'utf8'));
    });

    await createEpisodeCodeHandler(deps({ agent: reader }))(context(input));

    expect(turns[0]!.prompt).toMatch(/Revise the episode .* following feedback.md/);
    expect(seen).toEqual(['// previous sfx\n']);
    expect(await readFile(join(workDir, 'ws/feedback.md'), 'utf8')).toContain('Shot 2.3 tối quá.');
  });

  test("keeps a failed attempt's workspace instead of deleting it", async () => {
    await mkdir(join(workDir, 'ws'));
    await writeFile(join(workDir, 'ws', 'note.txt'), 'attempt 1');
    await createEpisodeCodeHandler(deps())(context(INPUT, 2));
    expect(await readFile(join(workDir, 'ws.attempt-1', 'note.txt'), 'utf8')).toBe('attempt 1');
  });

  test("waits (blocked) while Remotion's Chrome is missing, before any agent turn", async () => {
    const error = await createEpisodeCodeHandler(deps({ browserReady: () => false }))(
      context(),
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderBlockedError);
    expect((error as Error).message).toMatch(/npx remotion browser ensure/);
    expect(turns).toEqual([]);
    expect(existsSync(join(workDir, 'ws'))).toBe(false);
  });

  test('a retry after the gates crashed resumes the session instead of writing again', async () => {
    const crash: GateRunner = async () => {
      throw new Error('EPERM: mkdir node_modules/.remotion');
    };
    await expect(createEpisodeCodeHandler(deps({ gates: crash }))(context())).rejects.toThrow(
      /EPERM/,
    );
    expect(turns).toHaveLength(1);

    const result = await createEpisodeCodeHandler(deps())(context(INPUT, 2));

    // Gates for turn 1, then the review turn in the same session; the code was not rewritten.
    expect(turns).toHaveLength(2);
    expect(turns[1]!.resumeSessionId).toBe('session-1');
    expect(turns[1]!.prompt).toMatch(/review the storyboard/);
    expect(existsSync(join(workDir, 'ws.attempt-1'))).toBe(false);
    expect(await readFile(join(workDir, 'ws/src/episode/Episode.tsx'), 'utf8')).toMatch(/Episode/);
    expect(result.result).toMatchObject({ turns: 2, session_id: 'session-1' });
    expect(reported.slice(2)).toEqual([
      { stage: 'gates', turn: 1, of: 3 },
      { stage: 'agent', turn: 2, of: 3 },
      { stage: 'gates', turn: 2, of: 3 },
    ]);
  });

  test('a Chrome crash in the gates is retried, not handed to the agent', async () => {
    await expect(
      createEpisodeCodeHandler(deps({ gates: gates(CHROME_CRASH) }))(context()),
    ).rejects.toThrow(/the gates' Chrome crashed[\s\S]*Page crashed!/);
    expect(turns).toHaveLength(1);
    const log = JSON.parse(await readFile(join(workDir, 'agent-turns.json'), 'utf8'));
    expect(log.turns[0].gates).toBeNull();

    await createEpisodeCodeHandler(deps())(context(INPUT, 2));

    expect(turns).toHaveLength(2);
    expect(turns[1]!.prompt).not.toMatch(/Page crashed/);
  });

  test('a Chrome crash recorded by an older worker is gated again on retry', async () => {
    await expect(
      createEpisodeCodeHandler(deps({ gates: gates(TEXT_FAIL) }))(context()),
    ).rejects.toThrow(PermanentJobError);
    expect(turns).toHaveLength(3);
    // Before the crash check, the crash was recorded as the last turn's gates.
    const path = join(workDir, 'agent-turns.json');
    const log = JSON.parse(await readFile(path, 'utf8'));
    log.report = CHROME_CRASH;
    log.turns[2].gates = { ok: false, failures: describeFailures(CHROME_CRASH) };
    await writeFile(path, JSON.stringify(log));

    const result = await createEpisodeCodeHandler(deps())(context(INPUT, 2));

    expect(turns).toHaveLength(3);
    expect(result.result).toMatchObject({ turns: 3 });
  });

  test('follow-up turns an older worker spent on a Chrome crash are given back', async () => {
    await expect(
      createEpisodeCodeHandler(deps({ gates: gates(TEXT_FAIL) }))(context()),
    ).rejects.toThrow(PermanentJobError);
    // Before the crash check, both follow-up prompts showed the agent a Chrome crash.
    const path = join(workDir, 'agent-turns.json');
    const log = JSON.parse(await readFile(path, 'utf8'));
    const crashPrompt = `The worker's checks failed:\n\n${describeFailures(CHROME_CRASH).join('\n\n')}`;
    log.turns[1].prompt = crashPrompt;
    log.turns[2].prompt = crashPrompt;
    await writeFile(path, JSON.stringify(log));

    const result = await createEpisodeCodeHandler(deps())(context(INPUT, 2));

    expect(turns).toHaveLength(4);
    expect(turns[3]!.prompt).toMatch(/1 sharp texts are partly outside[\s\S]*NHỚ CHI TIẾT NÀY/);
    expect(result.result).toMatchObject({ turns: 4 });
  });

  test('a render error thrown by the episode code still goes to the agent', async () => {
    const RENDER_ERROR: GateReport = {
      ...PASS,
      ok: false,
      board: { ok: false, error: "TypeError: Cannot read properties of undefined (reading 'x')" },
    };
    await createEpisodeCodeHandler(deps({ gates: gates(RENDER_ERROR, PASS) }))(context());

    expect(turns).toHaveLength(2);
    expect(turns[1]!.prompt).toMatch(/storyboard render failed:[\s\S]*reading 'x'/);
  });

  test('a retry after a failed review continues with the fix turn', async () => {
    let calls = 0;
    const crashOnSecond: GateRunner = async (ws, signal) => {
      if (++calls === 2) throw new Error('bundle crashed');
      return gates(FAIL)(ws, signal);
    };
    await expect(
      createEpisodeCodeHandler(deps({ gates: crashOnSecond }))(context()),
    ).rejects.toThrow(/bundle crashed/);

    await createEpisodeCodeHandler(deps({ gates: gates(PASS) }))(context(INPUT, 2));

    expect(turns).toHaveLength(2);
  });

  test('the time limit counts the agent time of earlier attempts', async () => {
    const crash: GateRunner = async () => {
      throw new Error('crashed');
    };
    const slow = agent(() => new Promise((resolve) => setTimeout(resolve, 30)));
    await expect(
      createEpisodeCodeHandler(deps({ agent: slow, gates: crash, limitMs: 25 }))(context()),
    ).rejects.toThrow(/crashed/);

    await createEpisodeCodeHandler(deps({ gates: gates(FAIL), limitMs: 25 }))(
      context(INPUT, 2),
    ).catch(() => undefined);

    expect(turns).toHaveLength(1);
  });

  test('a retry starts over when the checkpoint is unreadable', async () => {
    await mkdir(join(workDir, 'ws'));
    await writeFile(join(workDir, 'agent-turns.json'), '[{"prompt":"old format"}]');
    await createEpisodeCodeHandler(deps())(context(INPUT, 2));
    expect(turns[0]!.prompt).toMatch(/Write the episode/);
    expect(existsSync(join(workDir, 'ws.attempt-1'))).toBe(true);
  });

  test('rejects invalid input or a missing timing job permanently', async () => {
    const handler = createEpisodeCodeHandler(deps());
    await expect(handler(context({ script_job_id: 'x' }))).rejects.toBeInstanceOf(
      PermanentJobError,
    );
    await expect(handler(context({ ...INPUT, timing_job_id: PREVIOUS_JOB }))).rejects.toThrow(
      /timing job .* is missing or changed/,
    );
  });
});

describe('kit and character selection', () => {
  test('the job input picks the kit and cast of the workspace', async () => {
    await createEpisodeCodeHandler(deps())(
      context({ ...INPUT, kit: 'science', character_set: 'bip' }),
    );
    const ws = join(workDir, 'ws');
    expect(existsSync(join(ws, 'kit/kits/science/theme.ts'))).toBe(true);
    expect(await readFile(join(ws, 'kit/active/cast.ts'), 'utf8')).toContain('characters/bip/cast');
    expect(await readFile(join(ws, 'CLAUDE.md'), 'utf8')).toContain('BÍP');
  });

  test('an unknown kit is a permanent failure, not a fallback', async () => {
    await expect(
      createEpisodeCodeHandler(deps())(context({ ...INPUT, kit: 'anime' })),
    ).rejects.toThrow(/unknown kit/);
  });
});

describe('agent settings and arguments', () => {
  const ws = '/Users/aivideo/work/jobs/j1/ws';

  test('allow only workspace reads, edits in src/episode and sfx, and two commands', () => {
    const settings = agentSettings(ws, '/Users/aivideo/aivideo');
    expect(settings.permissions.allow).toEqual([
      `Read(/${ws}/**)`,
      `Edit(/${ws}/src/episode/**)`,
      `Edit(/${ws}/sfx/**)`,
      'Bash(node node_modules/typescript/bin/tsc:*)',
      'Bash(node sfx/generate-sfx.mjs:*)',
    ]);
    expect(TYPECHECK_COMMAND).toBe('node node_modules/typescript/bin/tsc -p tsconfig.json');
    expect(SFX_COMMAND).toBe('node sfx/generate-sfx.mjs public/sfx');
    expect(settings.sandbox).toMatchObject({
      enabled: true,
      autoAllowBashIfSandboxed: false,
      allowUnsandboxedCommands: false,
      failIfUnavailable: true,
      network: { allowedDomains: [], strictAllowlist: true },
    });
    expect(settings.sandbox.filesystem.denyRead).toEqual(
      expect.arrayContaining([
        '~/.ssh',
        '~/.config',
        '~/.claude',
        '~/Library',
        '/Volumes',
        '/mnt',
        '/media',
        '/Users/aivideo/aivideo/config',
        '/Users/aivideo/aivideo/media',
      ]),
    );
    expect(settings.sandbox.filesystem.denyWrite).toEqual(
      expect.arrayContaining([`${ws}/kit`, `${ws}/CLAUDE.md`, `${ws}/.claude`, `${ws}/src/data`]),
    );
  });

  test('run the agent headless with the model, no fallback, and resume later turns', () => {
    const options = { bin: 'claude', model: 'claude-opus-5-5', blockSeconds: 3600, env: {} };
    const turn = {
      prompt: 'x',
      cwd: ws,
      settingsPath: '/s.json',
      timeoutMs: 1,
      signal: new AbortController().signal,
    };
    const args = agentArgs(options, turn);
    expect(args).toEqual(
      expect.arrayContaining(['-p', '--model', 'claude-opus-5-5', '--permission-mode', 'dontAsk']),
    );
    expect(args).toEqual(
      expect.arrayContaining(['--setting-sources', 'project', '--strict-mcp-config']),
    );
    expect(args).not.toContain('--fallback-model');
    expect(args).not.toContain('--resume');
    expect(agentArgs(options, { ...turn, resumeSessionId: 's1' })).toEqual(
      expect.arrayContaining(['--resume', 's1']),
    );
  });

  test('describe gate failures for the agent', () => {
    expect(describeFailures(PASS)).toEqual([]);
    expect(describeFailures(TEXT_FAIL)[0]).toMatch(/episode frames 2310–2380/);
  });
});
