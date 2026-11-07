import { chmod, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createAgentCli } from '../../src/claude/agent-cli.js';
import {
  ClaudeApiUnavailableError,
  claudeApiEnv,
  claudeChildEnv,
  claudeSummary,
  createClaudeCli,
  type ClaudeRunner,
} from '../../src/claude/claude-cli.js';
import { ProviderBlockedError } from '../../src/runner.js';

const FAKE_CLAUDE = fileURLToPath(new URL('../fixtures/fake-claude.mjs', import.meta.url));
const SCHEMA = { type: 'object', properties: { title: { type: 'string' } } };

let cwd: string;
let claude: ClaudeRunner;

beforeAll(async () => {
  await chmod(FAKE_CLAUDE, 0o755);
});

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'claude-'));
  claude = createClaudeCli({
    bin: FAKE_CLAUDE,
    settingsPath: '/repo/ops/claude/pipeline-settings.json',
    timeoutMs: 5_000,
    blockSeconds: 3600,
    env: { PATH: process.env.PATH ?? '', HOME: '/Users/test' },
  });
});

function run(mode: string, signal = new AbortController().signal): ReturnType<ClaudeRunner> {
  return claude({
    prompt: `MODE:${mode}\nWrite a script.`,
    systemPrompt: 'You write scripts.',
    jsonSchema: SCHEMA,
    cwd,
    signal,
  });
}

async function lastCall(): Promise<{ argv: string[]; envKeys: string[]; stdin: string }> {
  return JSON.parse(await readFile(join(cwd, 'fake-claude-call.json'), 'utf8'));
}

describe('claude cli', () => {
  test('returns the structured output and usage', async () => {
    const result = await run('structured');

    expect(result.output).toMatchObject({ title: 'Bầu trời xanh' });
    expect(result).toMatchObject({ durationMs: 1234, numTurns: 1, usage: { output_tokens: 42 } });
  });

  test('returns the CLI cost estimate and the models that ran (Q-004)', async () => {
    const result = await run('structured');

    expect(result).toMatchObject({ costUsd: 0.0123, models: ['claude-test-model'] });
  });

  test('summarizes a reply for the job result', async () => {
    const result = await run('structured');

    expect(claudeSummary(result)).toEqual({
      duration_ms: 1234,
      num_turns: 1,
      usage: { output_tokens: 42 },
      cost_usd: 0.0123,
      models: ['claude-test-model'],
    });
  });

  test('falls back to JSON in the result text', async () => {
    const result = await run('text-json');
    expect(result.output).toMatchObject({ title: 'Bầu trời xanh' });
  });

  test('runs headless with no tools, no MCP, no session, and the pipeline settings', async () => {
    await run('structured');
    const { argv, stdin } = await lastCall();

    expect(argv).toEqual(
      expect.arrayContaining(['-p', '--output-format', 'json', '--no-session-persistence']),
    );
    expect(argv[argv.indexOf('--tools') + 1]).toBe('');
    expect(argv).toContain('--strict-mcp-config');
    expect(argv[argv.indexOf('--settings') + 1]).toBe('/repo/ops/claude/pipeline-settings.json');
    expect(JSON.parse(argv[argv.indexOf('--json-schema') + 1]!)).toEqual(SCHEMA);
    expect(argv[argv.indexOf('--system-prompt') + 1]).toBe('You write scripts.');
    expect(argv).not.toContain('--fallback-model');
    expect(stdin).toContain('Write a script.');
  });

  test('passes only the configured environment, never worker secrets', async () => {
    process.env.DATABASE_URL = 'postgres://secret';
    try {
      await run('structured');
    } finally {
      delete process.env.DATABASE_URL;
    }
    const { envKeys } = await lastCall();

    expect(envKeys).not.toContain('DATABASE_URL');
    expect(envKeys).toEqual(expect.arrayContaining(['PATH', 'HOME']));
  });

  test('a usage limit becomes ProviderBlockedError', async () => {
    const error = await run('usage-limit').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ProviderBlockedError);
    expect((error as ProviderBlockedError).retryAfterSeconds).toBe(3600);
  });

  test('a login failure blocks the job instead of spending attempts', async () => {
    const error = await run('auth-failure').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ProviderBlockedError);
    expect((error as Error).message).toMatch(/login failed.*OAuth session expired/s);
  });

  test('an error that merely mentions oauth is a normal (retryable) failure', async () => {
    const error = await run('mentions-oauth').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(ProviderBlockedError);
    expect((error as Error).message).toMatch(/exited with code 1/);
  });

  test('the child environment keeps the CLI token and drops worker secrets', () => {
    const env = claudeChildEnv({
      PATH: '/usr/bin',
      HOME: '/Users/test',
      CLAUDE_CODE_OAUTH_TOKEN: 'token-value',
      DATABASE_URL: 'postgres://secret',
      REDIS_URL: 'redis://secret',
      API_CLIENT_KEYS: '{}',
      ITERA_API_KEY: 'secret',
    });

    expect(env).toEqual({
      PATH: '/usr/bin',
      HOME: '/Users/test',
      CLAUDE_CODE_OAUTH_TOKEN: 'token-value',
    });
  });

  test('the child environment never carries an API key (D-118)', () => {
    const env = claudeChildEnv({
      PATH: '/usr/bin',
      CLAUDE_CODE_OAUTH_TOKEN: 'token-value',
      ANTHROPIC_API_KEY: 'sk-ant-stray',
      PIPELINE_ANTHROPIC_API_KEY: 'sk-ant-pipeline',
    });

    expect(env).toEqual({ PATH: '/usr/bin', CLAUDE_CODE_OAUTH_TOKEN: 'token-value' });
  });

  test('the API environment has the key and never the subscription token (D-118)', () => {
    const env = claudeApiEnv(
      {
        PATH: '/usr/bin',
        HOME: '/Users/test',
        CLAUDE_CODE_OAUTH_TOKEN: 'token-value',
        DATABASE_URL: 'postgres://secret',
      },
      'sk-ant-pipeline',
    );

    expect(env).toEqual({
      PATH: '/usr/bin',
      HOME: '/Users/test',
      ANTHROPIC_API_KEY: 'sk-ant-pipeline',
      CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1',
    });
  });

  test('a crash is a retryable error with the stderr tail', async () => {
    const error = await run('crash').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(ProviderBlockedError);
    expect((error as Error).message).toMatch(/exited with code 2.*internal error/s);
  });

  test('a missing binary is a normal error, not a crash', async () => {
    claude = createClaudeCli({
      bin: join(cwd, 'no-such-claude'),
      settingsPath: '/x.json',
      timeoutMs: 5_000,
      blockSeconds: 3600,
      env: { PATH: process.env.PATH ?? '' },
    });
    await expect(run('structured')).rejects.toThrow(/ENOENT/);
  });

  test('a successful reply mentioning limits is not a usage limit', async () => {
    const result = await run('success-mentions-limit');
    expect(result.output).toMatchObject({ note: 'speed limit reached' });
  });

  test('a reply without JSON is an error', async () => {
    await expect(run('no-output')).rejects.toThrow(/no structured output/);
  });

  test('times out and kills the process', async () => {
    claude = createClaudeCli({
      bin: FAKE_CLAUDE,
      settingsPath: '/x.json',
      timeoutMs: 300,
      blockSeconds: 3600,
      env: { PATH: process.env.PATH ?? '' },
    });
    await expect(run('hang')).rejects.toThrow(/timed out/);
  });

  test('a request can set its own timeout', async () => {
    const pending = claude({
      prompt: 'MODE:hang\nWrite an episode.',
      systemPrompt: 'You write episodes.',
      jsonSchema: SCHEMA,
      cwd,
      signal: new AbortController().signal,
      timeoutMs: 300,
    });
    await expect(pending).rejects.toThrow(/timed out after 300 ms/);
  });

  test('stops when the job is cancelled', async () => {
    const controller = new AbortController();
    const pending = run('hang', controller.signal);
    setTimeout(() => controller.abort('CANCELLED'), 100);

    await expect(pending).rejects.toThrow(/aborted/);
  });
});

describe('agent cli', () => {
  const agent = () =>
    createAgentCli({
      bin: FAKE_CLAUDE,
      model: 'claude-test-model',
      blockSeconds: 3600,
      env: { PATH: process.env.PATH ?? '', HOME: '/Users/test' },
    });
  const turn = (mode: string) => ({
    prompt: `MODE:${mode}\nWrite the episode.`,
    cwd,
    settingsPath: '/tmp/agent-settings.json',
    timeoutMs: 5_000,
    signal: new AbortController().signal,
  });

  test('returns the session, the usage and the CLI cost estimate', async () => {
    const result = await agent()(turn('agent'));

    expect(result).toMatchObject({
      sessionId: 'sess-1',
      text: 'done',
      usage: { output_tokens: 42 },
      costUsd: 0.0123,
      models: ['claude-test-model'],
    });
  });

  test('an error turn that exits 0 fails instead of counting as a normal turn', async () => {
    const error = await agent()(turn('agent-error')).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(ProviderBlockedError);
    expect((error as Error).message).toMatch(/agent turn failed.*API Error: 500/s);
  });

  test('a usage limit still blocks the job', async () => {
    const error = await agent()(turn('usage-limit')).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ProviderBlockedError);
  });
});

describe('API mode (D-118)', () => {
  const API_ENV = { PATH: process.env.PATH ?? '', HOME: '/Users/test', ANTHROPIC_API_KEY: 'k' };
  const textCli = (options: { model?: string; apiEnv?: Record<string, string> }) =>
    createClaudeCli({
      bin: FAKE_CLAUDE,
      settingsPath: '/repo/ops/claude/pipeline-settings.json',
      timeoutMs: 5_000,
      blockSeconds: 3600,
      env: { PATH: process.env.PATH ?? '', HOME: '/Users/test', CLAUDE_CODE_OAUTH_TOKEN: 't' },
      ...options,
    });
  const request = (mode: string) => ({
    prompt: `MODE:${mode}\nWrite a script.`,
    systemPrompt: 'You write scripts.',
    jsonSchema: SCHEMA,
    cwd,
    signal: new AbortController().signal,
    api: { maxBudgetUsd: 1.25 },
  });

  test('runs with the API environment, the budget and the model', async () => {
    await textCli({ model: 'claude-sonnet-5-5', apiEnv: API_ENV })(request('structured'));
    const { argv, envKeys } = await lastCall();

    expect(envKeys).toContain('ANTHROPIC_API_KEY');
    expect(envKeys).not.toContain('CLAUDE_CODE_OAUTH_TOKEN');
    expect(argv.join(' ')).toContain('--max-budget-usd 1.25');
    expect(argv.join(' ')).toContain('--model claude-sonnet-5-5');
  });

  test('is refused without a key or without an explicit model', async () => {
    const noKey = await textCli({ model: 'claude-sonnet-5-5' })(request('structured')).catch(
      (e: unknown) => e,
    );
    const noModel = await textCli({ apiEnv: API_ENV })(request('structured')).catch(
      (e: unknown) => e,
    );

    expect(noKey).toBeInstanceOf(ClaudeApiUnavailableError);
    expect((noKey as Error).message).toMatch(/PIPELINE_ANTHROPIC_API_KEY/);
    expect(noModel).toBeInstanceOf(ClaudeApiUnavailableError);
    expect((noModel as Error).message).toMatch(/CLAUDE_MODEL/);
  });

  test('an API-side block is reported as a claude api block, never as the Max usage limit', async () => {
    const cli = textCli({ model: 'claude-sonnet-5-5', apiEnv: API_ENV });
    const credit = await cli(request('api-credit')).catch((e: unknown) => e);
    const limit = await cli(request('usage-limit')).catch((e: unknown) => e);

    expect(credit).toBeInstanceOf(ProviderBlockedError);
    expect((credit as Error).message).toMatch(/^claude api: Credit balance is too low/);
    expect((limit as Error).message).toMatch(/^claude api: /);
  });

  test('the agent runs with the API environment and the budget', async () => {
    const agent = createAgentCli({
      bin: FAKE_CLAUDE,
      model: 'claude-opus-5-5',
      blockSeconds: 3600,
      env: { PATH: process.env.PATH ?? '', HOME: '/Users/test', CLAUDE_CODE_OAUTH_TOKEN: 't' },
      apiEnv: API_ENV,
    });

    await agent({
      prompt: 'MODE:agent\nWrite the episode.',
      cwd,
      settingsPath: '/tmp/agent-settings.json',
      timeoutMs: 5_000,
      signal: new AbortController().signal,
      api: { maxBudgetUsd: 6 },
    });
    const { argv, envKeys } = await lastCall();

    expect(envKeys).not.toContain('CLAUDE_CODE_OAUTH_TOKEN');
    expect(argv.join(' ')).toContain('--max-budget-usd 6');
  });
});
