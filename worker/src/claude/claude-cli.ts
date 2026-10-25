import { spawn } from 'node:child_process';
import { ProviderBlockedError } from '../runner.js';

// Headless Claude Code CLI on the Max subscription (D-019, D-042): no Claude API. Text-only steps
// run with every tool disabled, no MCP servers, no session persistence, the pipeline deny-list
// settings, and a minimal environment so worker secrets never reach the child (P-012).
// No fallback model is ever passed (CLAUDE.md §5).

export interface ClaudeRequest {
  prompt: string;
  systemPrompt: string;
  jsonSchema: object;
  /** Empty per-job directory; the CLI runs there. */
  cwd: string;
  signal: AbortSignal;
  /** Overrides the runner's timeout for a request known to take longer (e.g. a whole episode). */
  timeoutMs?: number;
}

export interface ClaudeResult {
  output: unknown;
  durationMs: number | null;
  numTurns: number | null;
  usage: Record<string, unknown> | null;
}

export type ClaudeRunner = (request: ClaudeRequest) => Promise<ClaudeResult>;

export interface ClaudeCliOptions {
  bin: string;
  settingsPath: string;
  timeoutMs: number;
  /** Wait before retrying after a usage limit or a login failure. */
  blockSeconds: number;
  /** The complete child environment (PATH, HOME, ...). Nothing else is inherited. */
  env: Readonly<Record<string, string>>;
  model?: string;
}

const MAX_STDOUT_BYTES = 5 * 1024 * 1024;
const STDERR_TAIL = 500;
const KILL_GRACE_MS = 5_000;
const USAGE_LIMIT = /usage limit|limit reached|out of extra usage/i;
// A login the worker cannot repair itself (e.g. OAuth refresh against a locked Keychain): block the
// job until a person fixes it instead of spending its attempts.
const AUTH_FAILURE = /failed to authenticate|oauth|not logged in|invalid api key|\/login/i;
// Non-secret variables the CLI needs (HOME for its config), plus the long-lived subscription token
// from `claude setup-token` (D-046). Nothing else from the worker environment is passed.
const CHILD_ENV_KEYS = [
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'TMPDIR',
  'LANG',
  'CLAUDE_CODE_OAUTH_TOKEN',
] as const;

/** The child environment for the CLI, taken from the worker's environment. */
export function claudeChildEnv(
  env: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  return Object.fromEntries(CHILD_ENV_KEYS.flatMap((key) => (env[key] ? [[key, env[key]]] : [])));
}

interface CliEnvelope {
  is_error?: boolean;
  result?: unknown;
  structured_output?: unknown;
  duration_ms?: unknown;
  num_turns?: unknown;
  usage?: unknown;
}

interface ProcessResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function buildArgs(options: ClaudeCliOptions, request: ClaudeRequest): string[] {
  return [
    '-p',
    '--output-format',
    'json',
    '--json-schema',
    JSON.stringify(request.jsonSchema),
    '--system-prompt',
    request.systemPrompt,
    '--tools',
    '',
    '--strict-mcp-config',
    '--setting-sources',
    'project',
    '--settings',
    options.settingsPath,
    '--no-session-persistence',
    ...(options.model ? ['--model', options.model] : []),
  ];
}

function runProcess(options: ClaudeCliOptions, request: ClaudeRequest): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    if (request.signal.aborted) {
      reject(new Error(`claude aborted: ${String(request.signal.reason)}`));
      return;
    }
    const child = spawn(options.bin, buildArgs(options, request), {
      cwd: request.cwd,
      env: { ...options.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let failure: Error | null = null;

    const stop = (error: Error): void => {
      failure ??= error;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), KILL_GRACE_MS).unref();
    };
    const timeoutMs = request.timeoutMs ?? options.timeoutMs;
    const timer = setTimeout(
      () => stop(new Error(`claude timed out after ${timeoutMs} ms`)),
      timeoutMs,
    );
    const onAbort = (): void => stop(new Error(`claude aborted: ${String(request.signal.reason)}`));
    request.signal.addEventListener('abort', onAbort, { once: true });

    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      stdout += chunk;
      if (stdout.length > MAX_STDOUT_BYTES) stop(new Error('claude output too large'));
    });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      stderr = (stderr + chunk).slice(-STDERR_TAIL);
    });
    child.on('error', (error) => stop(error));
    child.on('close', (code) => {
      clearTimeout(timer);
      request.signal.removeEventListener('abort', onAbort);
      if (failure) reject(failure);
      else resolve({ code, stdout, stderr });
    });
    // A child that failed to start closes stdin early; the spawn error above is the real cause.
    child.stdin.on('error', () => undefined);
    child.stdin.end(request.prompt);
  });
}

function parseEnvelope(stdout: string): CliEnvelope | null {
  try {
    const parsed: unknown = JSON.parse(stdout);
    return typeof parsed === 'object' && parsed !== null ? (parsed as CliEnvelope) : null;
  } catch {
    return null;
  }
}

function structuredOutput(envelope: CliEnvelope): unknown {
  if (envelope.structured_output !== undefined) return envelope.structured_output;
  if (typeof envelope.result !== 'string') return undefined;
  try {
    return JSON.parse(envelope.result);
  } catch {
    return undefined;
  }
}

const numberOrNull = (value: unknown): number | null => (typeof value === 'number' ? value : null);

export function createClaudeCli(options: ClaudeCliOptions): ClaudeRunner {
  return async (request) => {
    const { code, stdout, stderr } = await runProcess(options, request);
    const envelope = parseEnvelope(stdout);
    const message = typeof envelope?.result === 'string' ? envelope.result : '';

    const failed = code !== 0 || !envelope || envelope.is_error === true;
    if (failed && (USAGE_LIMIT.test(message) || USAGE_LIMIT.test(stderr))) {
      throw new ProviderBlockedError(
        `claude-code usage limit: ${message || stderr}`.slice(0, 300),
        options.blockSeconds,
      );
    }
    if (failed && (AUTH_FAILURE.test(message) || AUTH_FAILURE.test(stderr))) {
      throw new ProviderBlockedError(
        `claude-code login failed (see ops/phase-2a.md §2): ${message || stderr}`.slice(0, 300),
        options.blockSeconds,
      );
    }
    if (failed) {
      throw new Error(
        `claude exited with code ${code}: ${(message || stderr).slice(-STDERR_TAIL)}`,
      );
    }

    const output = structuredOutput(envelope);
    if (output === undefined) {
      throw new Error('claude returned no structured output');
    }
    return {
      output,
      durationMs: numberOrNull(envelope.duration_ms),
      numTurns: numberOrNull(envelope.num_turns),
      usage:
        typeof envelope.usage === 'object' && envelope.usage !== null
          ? (envelope.usage as Record<string, unknown>)
          : null,
    };
  };
}
