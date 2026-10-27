import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, realpath, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import type { AgentRunner } from '../claude/agent-cli.js';
import { agentSettings } from '../episode/agent-settings.js';
import {
  browserCrash,
  describeFailures,
  gateReportSchema,
  type GateReport,
  type GateRunner,
} from '../episode/gates.js';
import { agentFiles, containsSecret, prepareWorkspace } from '../episode/workspace.js';
import { rulesMarkdown, type RulesSource } from '../rules/channel-rules.js';
import { readValidCheckpoint, writeFileAtomic } from '../storage/checkpoint.js';
import { resolveInside } from '../storage/workspace.js';
import {
  PermanentJobError,
  ProviderBlockedError,
  type HandlerContext,
  type JobHandler,
} from '../runner.js';

// Episode `episode_code` step (q:render, docs/episode-pipeline.md §6, D-052–D-054): Claude Code
// (Opus) writes the episode in a sandboxed workspace; the worker gates it and resumes the session
// with the report and the storyboard. Turn 1 writes; turn 2 always reviews the storyboard; turn 3
// only fixes failed gates. All agent turns share a 90-minute limit. Failing gates after the last
// turn is permanent: a person decides (the workspace stays for an interactive session).
// agent-turns.json checkpoints every agent turn and gate run: a retry (a crash, the gates' Chrome,
// /retry on Telegram) resumes the same session where it stopped instead of writing it again.

const AGENT_LIMIT_MS = 90 * 60 * 1000;
const MAX_FOLLOW_UPS = 2;
const WORKSPACE = 'ws';
const SETTINGS = 'agent-settings.json';
const TURNS_LOG = 'agent-turns.json';
export const NO_CHROME =
  "Remotion's Chrome is not installed: run `npx remotion browser ensure` in remotion/ (ops/episode-pipeline.md)";

const inputSchema = z.object({
  script_job_id: z.uuid(),
  timing_job_id: z.uuid(),
  revision: z
    .object({ previous_job_id: z.uuid(), feedback: z.string().min(1).max(4000) })
    .optional(),
});
type Input = z.infer<typeof inputSchema>;

export interface EpisodeCodeDeps {
  agent: AgentRunner;
  gates: GateRunner;
  /** Secret values the agent's files must never contain (e.g. the Claude token). */
  secrets: readonly string[];
  /** The owner's channel rules (D-059): rules.md of a new workspace. */
  rules: RulesSource;
  /** False while Remotion's Chrome is missing: the job waits (BLOCKED) instead of running. */
  browserReady: () => boolean;
  blockSeconds: number;
  /** Overridable for tests. */
  limitMs?: number;
}

async function jobDir(workDir: string, jobId: string, what: string): Promise<string> {
  const dir = await resolveInside(dirname(workDir), jobId);
  if (!(await readValidCheckpoint(dir))) {
    throw new PermanentJobError(`${what} job ${jobId} is missing or changed`);
  }
  return dir;
}

/** A failed earlier attempt's workspace is kept for inspection, never deleted. */
async function freshWorkspacePath(workDir: string, attemptNo: number): Promise<string> {
  const ws = join(workDir, WORKSPACE);
  if (existsSync(ws)) await rename(ws, join(workDir, `${WORKSPACE}.attempt-${attemptNo - 1}`));
  return ws;
}

const turnSchema = z.object({
  prompt: z.string(),
  result: z.object({ sessionId: z.string(), durationMs: z.number().nullable().optional() }).loose(),
  /** Null until the gates ran after this turn. */
  gates: z.object({ ok: z.boolean(), failures: z.array(z.string()) }).nullable(),
});
const stateSchema = z.object({
  sessionId: z.string().nullable(),
  /** Wall time of all agent turns so far, across attempts (the 90-minute limit). */
  agentMs: z.number().nonnegative(),
  turns: z.array(turnSchema),
  /** The last gate report. */
  report: gateReportSchema.nullable(),
});
type AgentState = z.infer<typeof stateSchema>;
const EMPTY_STATE: AgentState = { sessionId: null, agentMs: 0, turns: [], report: null };

/** The checkpoint of an earlier attempt with at least one finished agent turn, or null. */
async function savedState(context: HandlerContext): Promise<AgentState | null> {
  const path = join(context.workDir, TURNS_LOG);
  if (context.attemptNo === 1 || !existsSync(path) || !existsSync(join(context.workDir, WORKSPACE)))
    return null;
  let json: unknown;
  try {
    json = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    context.logger.warn({ err: String(error) }, 'unreadable agent checkpoint; starting over');
    return null;
  }
  // An older worker's log (a list of turns) is not a checkpoint: start over.
  const parsed = stateSchema.safeParse(json);
  if (!parsed.success) {
    context.logger.warn(
      { err: parsed.error.message },
      'unreadable agent checkpoint; starting over',
    );
    return null;
  }
  return parsed.data.turns.length > 0 ? parsed.data : null;
}

const FIRST_PROMPT =
  'Write the episode described in brief.md, following CLAUDE.md. Start by reading CLAUDE.md, ' +
  'brief.md, FILES.md and the reference episode in kit/ep5/.';
const REVISION_PROMPT =
  'Revise the episode in src/episode/ and sfx/ (your previous version) following feedback.md, ' +
  'brief.md and CLAUDE.md. Start by reading CLAUDE.md, feedback.md and brief.md.';

function followUpPrompt(report: GateReport, review: boolean): string {
  const failures = describeFailures(report);
  const pages = report.board?.pages ?? [];
  return [
    failures.length > 0
      ? `The worker's checks failed:\n\n${failures.join('\n\n')}`
      : "The worker's checks passed.",
    review && pages.length > 0
      ? `Now review the storyboard pages ${pages.join(', ')} with the Read tool, shot by shot, ` +
        'against brief.md and CLAUDE.md (style, framing, continuity, text in frame, nothing empty).'
      : '',
    'Fix everything that is wrong, run the typecheck again, and reply with a short summary.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

async function runTurns(
  context: HandlerContext,
  deps: EpisodeCodeDeps,
  ws: string,
  input: Input,
  saved: AgentState,
): Promise<AgentState> {
  const settingsPath = join(context.workDir, SETTINGS);
  const deadline = Date.now() + (deps.limitMs ?? AGENT_LIMIT_MS) - saved.agentMs;
  let state = saved;
  const save = () =>
    writeFileAtomic(join(context.workDir, TURNS_LOG), `${JSON.stringify(state, null, 1)}\n`);

  const gate = async () => {
    const n = state.turns.length;
    await context.progress({ stage: 'gates', turn: n, of: MAX_FOLLOW_UPS + 1 });
    const report = await deps.gates(ws, context.signal);
    // Not recorded as this turn's gates, so the retry runs the gates again before any agent turn.
    const crash = browserCrash(report);
    if (crash) throw new Error(`the gates' Chrome crashed: ${crash.slice(0, 1000)}`);
    const gates = { ok: report.ok, failures: describeFailures(report) };
    state = {
      ...state,
      report,
      turns: state.turns.map((turn, i) => (i === n - 1 ? { ...turn, gates } : turn)),
    };
    await save();
    context.logger.info({ turn: n, gatesOk: report.ok }, 'episode gates');
  };

  // The last attempt stopped after an agent turn but before its gates finished, or an older worker
  // recorded a Chrome crash as that turn's gates.
  const crashed = state.report !== null && browserCrash(state.report) !== null;
  if (state.turns.at(-1)?.gates === null || crashed) await gate();
  for (let n = state.turns.length; n <= MAX_FOLLOW_UPS; n++) {
    if (n === 2 && state.report?.ok) break;
    const timeoutMs = deadline - Date.now();
    if (timeoutMs <= 0) break;
    const prompt =
      n === 0
        ? input.revision
          ? REVISION_PROMPT
          : FIRST_PROMPT
        : followUpPrompt(state.report!, n === 1);
    await context.progress({ stage: 'agent', turn: n + 1, of: MAX_FOLLOW_UPS + 1 });
    const started = Date.now();
    const result = await deps.agent({
      prompt,
      cwd: ws,
      settingsPath,
      resumeSessionId: state.sessionId ?? undefined,
      timeoutMs,
      signal: context.signal,
    });
    state = {
      sessionId: result.sessionId,
      agentMs: state.agentMs + (Date.now() - started),
      turns: [...state.turns, { prompt, result: { ...result }, gates: null }],
      report: state.report,
    };
    await save();
    context.logger.info({ turn: n + 1, agentMs: result.durationMs }, 'episode agent turn');
    await gate();
  }
  return state;
}

export function createEpisodeCodeHandler(deps: EpisodeCodeDeps): JobHandler {
  return async (context) => {
    const parsed = inputSchema.safeParse(context.input);
    if (!parsed.success)
      throw new PermanentJobError(`invalid episode_code input: ${parsed.error.message}`);
    const input = parsed.data;
    const { workDir } = context;

    const scriptDir = await jobDir(workDir, input.script_job_id, 'script');
    const timingDir = await jobDir(workDir, input.timing_job_id, 'timing');
    const previous = input.revision
      ? join(await jobDir(workDir, input.revision.previous_job_id, 'episode_code'), WORKSPACE)
      : null;
    if (!deps.browserReady()) throw new ProviderBlockedError(NO_CHROME, deps.blockSeconds);

    const saved = await savedState(context);
    if (saved) {
      context.logger.info({ turns: saved.turns.length }, 'resuming the episode agent');
    } else {
      const rules = await deps.rules();
      context.logger.info({ rulesVersion: rules.version }, 'episode workspace');
      await prepareWorkspace(await freshWorkspacePath(workDir, context.attemptNo), {
        scriptMarkdown: await readFile(join(scriptDir, 'script.md'), 'utf8'),
        rulesMarkdown: rulesMarkdown(rules),
        timingDir,
        revision:
          input.revision && previous
            ? { previousWorkspace: previous, feedback: input.revision.feedback }
            : undefined,
      });
    }
    const realWs = await realpath(join(workDir, WORKSPACE));
    await writeFile(join(workDir, SETTINGS), `${JSON.stringify(agentSettings(realWs), null, 1)}\n`);

    const { turns, report, sessionId, agentMs } = await runTurns(
      context,
      deps,
      realWs,
      input,
      saved ?? EMPTY_STATE,
    );
    if (!report) throw new Error('the episode agent had no time for a first turn');
    if (!report.ok) {
      throw new PermanentJobError(
        `episode gates failed after ${turns.length} turns: ${describeFailures(report).join(' | ').slice(0, 1500)}`,
      );
    }
    const leaked = await containsSecret(realWs, deps.secrets);
    if (leaked.length > 0)
      throw new PermanentJobError(`agent files contain a secret: ${leaked.join(', ')}`);

    const files = await agentFiles(realWs);
    const pages = report.board?.pages ?? [];
    return {
      outputs: [
        ...files.map((f) => `${WORKSPACE}/${f}`),
        ...pages.map((p) => `${WORKSPACE}/${p}`),
        `${WORKSPACE}/gates.json`,
        TURNS_LOG,
      ],
      result: {
        turns: turns.length,
        session_id: sessionId,
        agent_ms: agentMs,
        board_pages: pages.map((p) => `${WORKSPACE}/${p}`),
        // Capability for GET /boards/… (D-055): only Postgres readers (n8n) learn it.
        board_token: randomBytes(16).toString('hex'),
        sfx_files: report.sfx?.files?.length ?? 0,
        text_bounds_blur: report.textBounds?.blur ?? 0,
        revision: Boolean(input.revision),
      },
    };
  };
}
