import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pino from 'pino';
import { beforeEach, describe, expect, test } from 'vitest';
import { agentArgs, type AgentRunner, type AgentTurn } from '../../src/claude/agent-cli.js';
import { agentSettings, SFX_COMMAND, TYPECHECK_COMMAND } from '../../src/episode/agent-settings.js';
import { describeFailures, type GateReport, type GateRunner } from '../../src/episode/gates.js';
import { createEpisodeCodeHandler, type EpisodeCodeDeps } from '../../src/handlers/episode-code.js';
import { PermanentJobError, type HandlerContext } from '../../src/runner.js';
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

let jobsDir: string;
let workDir: string;
let turns: AgentTurn[];

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
    await writeFile(join(ws, 'gates.json'), JSON.stringify(report));
    return report;
  };
}

function deps(overrides: Partial<EpisodeCodeDeps> = {}): EpisodeCodeDeps {
  return { agent: agent(), gates: gates(PASS), secrets: [SECRET], ...overrides };
}

function context(input: unknown = INPUT, attemptNo = 1): HandlerContext {
  return {
    jobId: CODE_JOB,
    attemptNo,
    input,
    workDir,
    signal: new AbortController().signal,
    logger: pino({ level: 'silent' }),
  };
}

describe('episode_code handler', () => {
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
    expect(existsSync(join(ws, 'kit/ep1/Character.tsx'))).toBe(true);
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
    const log = JSON.parse(await readFile(join(workDir, 'agent-turns.json'), 'utf8'));
    expect(log).toHaveLength(2);
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

describe('agent settings and arguments', () => {
  const ws = '/Users/aivideo/work/jobs/j1/ws';

  test('allow only workspace reads, edits in src/episode and sfx, and two commands', () => {
    const settings = agentSettings(ws);
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
      expect.arrayContaining(['~/.ssh', '~/.config', '~/.claude', '~/Library', '/Volumes']),
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
