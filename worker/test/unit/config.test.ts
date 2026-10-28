import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { loadConfig } from '../../src/config.js';

const VALID_ENV = {
  WORKER_ID: 'mac-mini-m4',
  WORKER_STREAMS: 'q:render,q:heavy,q:light',
  DATABASE_URL: 'postgres://worker:secret-value@192.168.1.102:5432/aivideo',
  REDIS_URL: 'redis://:secret-value@192.168.1.112:6379/1',
  WORK_ROOT: '/Users/aivideo/work',
  API_CLIENT_KEYS: JSON.stringify({ n8n: 'x'.repeat(48) }),
};

describe('loadConfig', () => {
  test('parses a valid environment with defaults', () => {
    const config = loadConfig(VALID_ENV);
    expect(config.workerStreams).toEqual(['q:render', 'q:heavy', 'q:light']);
    expect(config.apiHost).toBe('127.0.0.1');
    expect(config.leaseSeconds).toBe(60);
    expect(config.heartbeatSeconds).toBe(20);
  });

  test('defaults the Claude Code CLI settings', () => {
    expect(loadConfig(VALID_ENV).claude).toEqual({
      bin: 'claude',
      model: undefined,
      agentModel: 'claude-opus-5-5',
      timeoutSeconds: 600,
      blockSeconds: 3600,
    });
  });

  test('reads Claude Code CLI overrides', () => {
    const config = loadConfig({
      ...VALID_ENV,
      CLAUDE_BIN: '/Users/aivideo/.local/bin/claude',
      CLAUDE_MODEL: 'opus',
      CLAUDE_TIMEOUT_SECONDS: '900',
      CLAUDE_BLOCK_SECONDS: '1800',
    });
    expect(config.claude).toEqual({
      bin: '/Users/aivideo/.local/bin/claude',
      model: 'opus',
      timeoutSeconds: 900,
      blockSeconds: 1800,
      agentModel: 'claude-opus-5-5',
    });
  });

  test('defaults the ITERA settings and keeps the key optional', () => {
    expect(loadConfig(VALID_ENV)).toMatchObject({
      itera: {
        baseUrl: 'https://api.genmax.io',
        apiKey: undefined,
        pollMs: 2000,
        taskTimeoutSeconds: 300,
        blockSeconds: 3600,
      },
      ffprobeBin: 'ffprobe',
    });
    expect(loadConfig({ ...VALID_ENV, ITERA_API_KEY: 'k'.repeat(40) }).itera.apiKey).toBe(
      'k'.repeat(40),
    );
  });

  test('preview rendering: ffmpeg defaults, the music library is optional and absolute', () => {
    expect(loadConfig(VALID_ENV)).toMatchObject({
      ffmpegBin: 'ffmpeg',
      musicLibraryDir: undefined,
    });
    expect(
      loadConfig({ ...VALID_ENV, MUSIC_LIBRARY_DIR: '/Users/aivideo/MediaLibrary/music' })
        .musicLibraryDir,
    ).toBe('/Users/aivideo/MediaLibrary/music');
    expect(() => loadConfig({ ...VALID_ENV, MUSIC_LIBRARY_DIR: 'MediaLibrary/music' })).toThrow(
      /MUSIC_LIBRARY_DIR/,
    );
  });

  test('episode agent: Opus 5.5 unless configured', () => {
    expect(loadConfig(VALID_ENV).claude.agentModel).toBe('claude-opus-5-5');
    expect(
      loadConfig({ ...VALID_ENV, CLAUDE_AGENT_MODEL: 'claude-sonnet-5-5' }).claude.agentModel,
    ).toBe('claude-sonnet-5-5');
  });

  test('episode timing: whisper-cli by default, the model file is optional and absolute', () => {
    expect(loadConfig(VALID_ENV).whisper).toEqual({ bin: 'whisper-cli', model: undefined });
    expect(
      loadConfig({ ...VALID_ENV, WHISPER_MODEL: '/Users/aivideo/Models/ggml-large-v3-turbo.bin' })
        .whisper.model,
    ).toBe('/Users/aivideo/Models/ggml-large-v3-turbo.bin');
    expect(() => loadConfig({ ...VALID_ENV, WHISPER_MODEL: 'ggml.bin' })).toThrow(/WHISPER_MODEL/);
  });

  test('accepts only an https ITERA base url', () => {
    expect(() => loadConfig({ ...VALID_ENV, ITERA_BASE_URL: 'http://api.genmax.io' })).toThrow(
      /ITERA_BASE_URL/,
    );
  });

  test('the runtime root defaults to ~/aivideo and must be absolute', () => {
    expect(loadConfig(VALID_ENV).runtimeRoot).toBe(join(homedir(), 'aivideo'));
    expect(loadConfig({ ...VALID_ENV, AIVIDEO_ROOT: '/srv/aivideo' }).runtimeRoot).toBe(
      '/srv/aivideo',
    );
    expect(() => loadConfig({ ...VALID_ENV, AIVIDEO_ROOT: 'aivideo' })).toThrow(/AIVIDEO_ROOT/);
  });

  test('lists invalid variables without echoing their values', () => {
    const env = { ...VALID_ENV, WORK_ROOT: 'relative/path', DATABASE_URL: undefined };
    expect(() => loadConfig(env)).toThrow(/WORK_ROOT/);
    expect(() => loadConfig(env)).toThrow(/DATABASE_URL/);
    try {
      loadConfig({ ...env, REDIS_URL: 'not a url with secret-value' });
    } catch (error: unknown) {
      expect(String(error)).not.toContain('secret-value');
    }
  });

  test('rejects client keys shorter than 32 characters', () => {
    expect(() =>
      loadConfig({ ...VALID_ENV, API_CLIENT_KEYS: JSON.stringify({ n8n: 'short' }) }),
    ).toThrow(/API_CLIENT_KEYS/);
  });

  test('requires the heartbeat to be well inside the lease', () => {
    expect(() =>
      loadConfig({ ...VALID_ENV, LEASE_SECONDS: '30', HEARTBEAT_SECONDS: '20' }),
    ).toThrow(/HEARTBEAT_SECONDS/);
  });
});
