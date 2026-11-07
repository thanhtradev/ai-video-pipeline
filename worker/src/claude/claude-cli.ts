import { spawn } from 'node:child_process';
import { ProviderBlockedError } from '../runner.js';
import { runCost, usageOf, type RunCost } from './usage.js';

// Headless Claude Code CLI on the Max subscription (D-019, D-042). The Claude API is used only for a
// job the owner moved to it after a Max usage limit (D-118): the same CLI with the API key instead
// of the subscription token, never both, and --max-budget-usd. Text-only steps
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
  /** The job this request belongs to: lets the owner move it to the Claude API (D-118). */
  job?: JobRef;
  /** Set by withClaudeApi only: run on the Claude API with this budget. */
  api?: ApiBudget;
}

export interface JobRef {
  id: string;
}

export interface ApiBudget {
  maxBudgetUsd: number;
}

/** API mode cannot start on this worker (no key, no explicit model): nothing was spent. */
export class ClaudeApiUnavailableError extends ProviderBlockedError {
  override name = 'ClaudeApiUnavailableError';
}

export interface ClaudeResult extends RunCost {
  output: unknown;
  durationMs: number | null;
  numTurns: number | null;
  usage: Record<string, unknown> | null;
}

/** The `claude` field of a text step's job result: what the request used (Q-004). */
export function claudeSummary(reply: ClaudeResult) {
  return {
    duration_ms: reply.durationMs,
    num_turns: reply.numTurns,
    usage: reply.usage,
    cost_usd: reply.costUsd,
    models: reply.models,
  };
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
  /** The child environment in API mode (claudeApiEnv); absent when this worker has no key. */
  apiEnv?: Readonly<Record<string, string>> | undefined;
  model?: string;
}

const MAX_STDOUT_BYTES = 5 * 1024 * 1024;
const STDERR_TAIL = 500;
const KILL_GRACE_MS = 5_000;
export const USAGE_LIMIT = /usage limit|limit reached|out of extra usage/i;
// A login the worker cannot repair itself (e.g. OAuth refresh against a locked Keychain): block the
// job until a person fixes it instead of spending its attempts.
// Only the CLI's own login messages: a blocked job never uses up an attempt, so a loose match
// (e.g. any error that mentions "oauth") would retry a real failure forever.
// Claude API refusals (D-118): no credit, the workspace spend limit, the --max-budget-usd stop, a bad
// key. The exact wording of the budget stop is [UNKNOWN] until the Step 0 smoke test (ops/claude-api.md).
export const API_BLOCK =
  /credit balance|spend(ing)? limit|budget|x-api-key|invalid api key|authentication_error|permission_error/i;
export const AUTH_FAILURE =
  /failed to authenticate|authentication failed|not authenticated|oauth (session|token) (has |is )?(expired|invalid|revoked)|not logged in|invalid api key|run \/login|claude login|please log ?in/i;
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

/** The child environment for the CLI, taken from the worker's environment. Never an API key. */
export function claudeChildEnv(
  env: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  return Object.fromEntries(CHILD_ENV_KEYS.flatMap((key) => (env[key] ? [[key, env[key]]] : [])));
}

/**
 * The child environment in API mode (D-118): the API key and never the subscription token. In -p
 * mode the CLI prefers ANTHROPIC_API_KEY whenever it is present, so the two never meet in one run.
 * CLAUDE_CODE_SUBPROCESS_ENV_SCRUB keeps the key out of the agent's own subprocesses.
 */
export function claudeApiEnv(
  env: Readonly<Record<string, string | undefined>>,
  apiKey: string,
): Record<string, string> {
  const { CLAUDE_CODE_OAUTH_TOKEN: _token, ...rest } = claudeChildEnv(env);
  return { ...rest, ANTHROPIC_API_KEY: apiKey, CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1' };
}

/** The env and the extra flags of one run: the subscription, or the API with its budget. */
export function billingOf(
  options: {
    env: Readonly<Record<string, string>>;
    apiEnv?: Readonly<Record<string, string>> | undefined;
    blockSeconds: number;
  },
  api: ApiBudget | undefined,
): { env: Readonly<Record<string, string>>; args: string[] } {
  if (!api) return { env: options.env, args: [] };
  if (!options.apiEnv) {
    throw new ClaudeApiUnavailableError(
      'claude api: PIPELINE_ANTHROPIC_API_KEY is not set on this worker',
      options.blockSeconds,
    );
  }
  return { env: options.apiEnv, args: ['--max-budget-usd', String(api.maxBudgetUsd)] };
}

/** Why a failed run must wait instead of using up an attempt, or null. */
export function blockReason(api: boolean, text: string, stderr: string): string | null {
  const matches = (pattern: RegExp) => pattern.test(text) || pattern.test(stderr);
  const detail = text || stderr;
  // In API mode every refusal ends the grant (the job blocks): never reported as the Max limit,
  // so it is not offered again without the owner (D-118).
  if (api) {
    return matches(USAGE_LIMIT) || matches(AUTH_FAILURE) || matches(API_BLOCK)
      ? `claude api: ${detail}`
      : null;
  }
  if (matches(USAGE_LIMIT)) return `claude-code usage limit: ${detail}`;
  if (matches(AUTH_FAILURE)) return `claude-code login failed (see ops/phase-2a.md §2): ${detail}`;
  return null;
}

interface CliEnvelope {
  is_error?: boolean;
  result?: unknown;
  structured_output?: unknown;
  duration_ms?: unknown;
  num_turns?: unknown;
  usage?: unknown;
  total_cost_usd?: unknown;
  modelUsage?: unknown;
}

export interface ProcessResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function buildArgs(options: ClaudeCliOptions, request: ClaudeRequest, extra: string[]): string[] {
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
    ...extra,
  ];
}

export interface ClaudeProcess {
  bin: string;
  args: string[];
  env: Readonly<Record<string, string>>;
  cwd: string;
  /** Sent on stdin (the prompt). */
  input: string;
  timeoutMs: number;
  signal: AbortSignal;
  maxStdoutBytes: number;
}

/** Runs the CLI once; rejects on timeout, cancellation, oversized output or a failed start. */
export function runClaudeProcess(p: ClaudeProcess): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    if (p.signal.aborted) {
      reject(new Error(`claude aborted: ${String(p.signal.reason)}`));
      return;
    }
    const child = spawn(p.bin, p.args, {
      cwd: p.cwd,
      env: { ...p.env },
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
    const timer = setTimeout(
      () => stop(new Error(`claude timed out after ${p.timeoutMs} ms`)),
      p.timeoutMs,
    );
    const onAbort = (): void => stop(new Error(`claude aborted: ${String(p.signal.reason)}`));
    p.signal.addEventListener('abort', onAbort, { once: true });

    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      stdout += chunk;
      if (stdout.length > p.maxStdoutBytes) stop(new Error('claude output too large'));
    });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      stderr = (stderr + chunk).slice(-STDERR_TAIL);
    });
    child.on('error', (error) => stop(error));
    child.on('close', (code) => {
      clearTimeout(timer);
      p.signal.removeEventListener('abort', onAbort);
      if (failure) reject(failure);
      else resolve({ code, stdout, stderr });
    });
    // A child that failed to start closes stdin early; the spawn error above is the real cause.
    child.stdin.on('error', () => undefined);
    child.stdin.end(p.input);
  });
}

function runProcess(options: ClaudeCliOptions, request: ClaudeRequest): Promise<ProcessResult> {
  // API mode needs an explicit model: the default per credential is not documented, and a silent
  // model change would break the no-switch rule (CLAUDE.md §5).
  if (request.api && !options.model) {
    throw new ClaudeApiUnavailableError(
      'claude api: CLAUDE_MODEL is not set on this worker',
      options.blockSeconds,
    );
  }
  const billing = billingOf(options, request.api);
  return runClaudeProcess({
    bin: options.bin,
    args: buildArgs(options, request, billing.args),
    env: billing.env,
    cwd: request.cwd,
    input: request.prompt,
    timeoutMs: request.timeoutMs ?? options.timeoutMs,
    signal: request.signal,
    maxStdoutBytes: MAX_STDOUT_BYTES,
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
    const blocked = failed ? blockReason(Boolean(request.api), message, stderr) : null;
    if (blocked) throw new ProviderBlockedError(blocked.slice(0, 300), options.blockSeconds);
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
      usage: usageOf(envelope.usage),
      ...runCost(envelope),
    };
  };
}
