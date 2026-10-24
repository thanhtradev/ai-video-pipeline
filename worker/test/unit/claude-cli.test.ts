import { chmod, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createClaudeCli, type ClaudeRunner } from '../../src/claude/claude-cli.js';
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

  test('stops when the job is cancelled', async () => {
    const controller = new AbortController();
    const pending = run('hang', controller.signal);
    setTimeout(() => controller.abort('CANCELLED'), 100);

    await expect(pending).rejects.toThrow(/aborted/);
  });
});
