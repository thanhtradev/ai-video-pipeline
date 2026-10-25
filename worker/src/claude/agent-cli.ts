import { ProviderBlockedError } from '../runner.js';
import { AUTH_FAILURE, runClaudeProcess, USAGE_LIMIT } from './claude-cli.js';

// Headless Claude Code as a coding agent (episode code, D-053/D-054): tools allowed by the
// per-job settings file (permissions + macOS sandbox), no MCP servers, only project settings, the
// worker's environment stripped (claudeChildEnv). Sessions persist so a later turn can resume the
// same conversation with the gate report. No fallback model is ever passed (CLAUDE.md §5).

export interface AgentTurn {
  prompt: string;
  /** Workspace; the agent may only change what the settings file allows. */
  cwd: string;
  /** Per-job settings (permissions + sandbox), outside the workspace. */
  settingsPath: string;
  /** Resume this session (a later turn of the same job). */
  resumeSessionId?: string | undefined;
  timeoutMs: number;
  signal: AbortSignal;
}

export interface AgentTurnResult {
  sessionId: string;
  /** The agent's final message. */
  text: string;
  isError: boolean;
  numTurns: number | null;
  durationMs: number | null;
  usage: Record<string, unknown> | null;
}

export type AgentRunner = (turn: AgentTurn) => Promise<AgentTurnResult>;

export interface AgentCliOptions {
  bin: string;
  model: string;
  /** Wait before retrying after a usage limit or a login failure. */
  blockSeconds: number;
  /** The complete child environment. Nothing else is inherited. */
  env: Readonly<Record<string, string>>;
}

const MAX_STDOUT_BYTES = 20 * 1024 * 1024;
const STDERR_TAIL = 1000;

export function agentArgs(options: AgentCliOptions, turn: AgentTurn): string[] {
  return [
    '-p',
    '--output-format',
    'json',
    '--model',
    options.model,
    '--permission-mode',
    'dontAsk',
    '--settings',
    turn.settingsPath,
    '--setting-sources',
    'project',
    '--strict-mcp-config',
    ...(turn.resumeSessionId ? ['--resume', turn.resumeSessionId] : []),
  ];
}

interface Envelope {
  session_id?: unknown;
  result?: unknown;
  is_error?: unknown;
  num_turns?: unknown;
  duration_ms?: unknown;
  usage?: unknown;
}

const numberOrNull = (value: unknown): number | null => (typeof value === 'number' ? value : null);

function parseEnvelope(stdout: string): Envelope | null {
  try {
    const parsed: unknown = JSON.parse(stdout);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Envelope) : null;
  } catch {
    return null;
  }
}

export function createAgentCli(options: AgentCliOptions): AgentRunner {
  return async (turn) => {
    const { code, stdout, stderr } = await runClaudeProcess({
      bin: options.bin,
      args: agentArgs(options, turn),
      env: options.env,
      cwd: turn.cwd,
      input: turn.prompt,
      timeoutMs: turn.timeoutMs,
      signal: turn.signal,
      maxStdoutBytes: MAX_STDOUT_BYTES,
    });
    const envelope = parseEnvelope(stdout);
    const text = typeof envelope?.result === 'string' ? envelope.result : '';
    const failed = code !== 0 || !envelope;
    if (
      (failed || envelope?.is_error === true) &&
      (USAGE_LIMIT.test(text) || USAGE_LIMIT.test(stderr))
    ) {
      throw new ProviderBlockedError(
        `claude-code usage limit: ${text || stderr}`.slice(0, 300),
        options.blockSeconds,
      );
    }
    if (failed && (AUTH_FAILURE.test(text) || AUTH_FAILURE.test(stderr))) {
      throw new ProviderBlockedError(
        `claude-code login failed (see ops/phase-2a.md §2): ${text || stderr}`.slice(0, 300),
        options.blockSeconds,
      );
    }
    if (failed || typeof envelope?.session_id !== 'string') {
      throw new Error(`agent exited with code ${code}: ${(text || stderr).slice(-STDERR_TAIL)}`);
    }
    return {
      sessionId: envelope.session_id,
      text,
      isError: envelope.is_error === true,
      numTurns: numberOrNull(envelope.num_turns),
      durationMs: numberOrNull(envelope.duration_ms),
      usage:
        typeof envelope.usage === 'object' && envelope.usage !== null
          ? (envelope.usage as Record<string, unknown>)
          : null,
    };
  };
}
