import { createHash, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import type { AgentRunner } from '../claude/agent-cli.js';
import { sumUsage } from '../claude/usage.js';
import { agentSettings } from '../episode/agent-settings.js';
import type { ResolvedSelection } from '../episode/catalog.js';
import { selectionOf } from '../episode/channel-prompt.js';
import {
  browserCrash,
  isBrowserCrash,
  isKitFault,
  describeFailures,
  gateReportSchema,
  type GateReport,
  type GateRunner,
  type KitChecker,
} from '../episode/gates.js';
import { withLanguageGate } from '../episode/language-gate.js';
import type { Language } from '../episode/language.js';
import {
  agentFiles,
  containsSecret,
  keepPreviousWorkspace,
  prepareWorkspace,
  refreshKit,
} from '../episode/workspace.js';
import type { LoudnessNormalizer } from '../media/loudness.js';
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
// A Chrome crash in the gates is retried once; a second one on the same code goes to the agent (D-088).
// The gates also render the episode's audio (voice + SFX); mix.m4a, at the delivery loudness, goes
// to the storyboard request with the pages (D-071).
// A turn that changed no agent file (src/episode, sfx) reuses the last gate report instead of
// running the gates again: they are deterministic on the same code, and a run takes minutes.
// The gate run after turn 1 is a draft without the audio mix, which only the last run's report
// delivers; a passing draft is never reused and never finishes the job (D-114).

const AGENT_LIMIT_MS = 90 * 60 * 1000;
const MAX_FOLLOW_UPS = 2;
/** Chrome crashes in a row on the same code before the agent is told: the code triggers a Chrome bug. */
const CRASHES_BEFORE_AGENT = 2;
const WORKSPACE = 'ws';
const SETTINGS = 'agent-settings.json';
const TURNS_LOG = 'agent-turns.json';
const MIX = 'mix.m4a';
const KIT_ERROR_CHARS = 1500;
export const NO_CHROME =
  "Remotion's Chrome is not installed: run `npx remotion browser ensure` in remotion/ (ops/episode-pipeline.md)";

const slug = z.string().regex(/^[a-z0-9-]{2,40}$/);
const inputSchema = z.object({
  script_job_id: z.uuid(),
  timing_job_id: z.uuid(),
  /** Kit and character set of the clip (D-066); the catalog defaults when absent. */
  kit: slug.optional(),
  character_set: slug.optional(),
  revision: z
    .object({ previous_job_id: z.uuid(), feedback: z.string().min(1).max(4000) })
    .optional(),
});
type Input = z.infer<typeof inputSchema>;

export interface EpisodeCodeDeps {
  agent: AgentRunner;
  gates: GateRunner;
  /** Compiles the worker-owned kit before any agent turn. */
  kitCheck: KitChecker;
  /** Secret values the agent's files must never contain (e.g. the Claude token). */
  secrets: readonly string[];
  /** The owner's channel rules (D-059): rules.md of a new workspace. */
  rules: RulesSource;
  /** False while Remotion's Chrome is missing: the job waits (BLOCKED) instead of running. */
  browserReady: () => boolean;
  blockSeconds: number;
  /** Encodes mix.m4a (-14 LUFS, as the delivered video). */
  loudness: LoudnessNormalizer;
  /** The worker's runtime root (D-065): its private folders are denied to the agent. */
  runtimeRoot: string;
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
  await keepPreviousWorkspace(workDir, WORKSPACE, attemptNo);
  return join(workDir, WORKSPACE);
}

const turnSchema = z.object({
  prompt: z.string(),
  result: z
    .object({
      sessionId: z.string(),
      durationMs: z.number().nullable().optional(),
      // Absent in checkpoints from before the usage report (Q-004).
      costUsd: z.number().nullable().optional(),
      usage: z.record(z.string(), z.unknown()).nullable().optional(),
      models: z.array(z.string()).optional(),
    })
    .loose(),
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
  /** Chrome crashes in a row in the gates since the last agent turn; absent in older checkpoints. */
  crashes: z.number().int().nonnegative().default(0),
  /** Fingerprint of the agent files the last report was made on; absent in older checkpoints. */
  gatedHash: z.string().nullable().default(null),
});
type AgentState = z.infer<typeof stateSchema>;
const EMPTY_STATE: AgentState = {
  sessionId: null,
  agentMs: 0,
  turns: [],
  report: null,
  crashes: 0,
  gatedHash: null,
};

/** sha256 over the paths and contents of the agent-written files: what the gates check. */
async function agentFingerprint(ws: string): Promise<string> {
  const hash = createHash('sha256');
  for (const file of await agentFiles(ws)) {
    hash.update(`${file}\0`);
    hash.update(await readFile(join(ws, file)));
    hash.update('\0');
  }
  return hash.digest('hex');
}

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

/**
 * What the agent turns used (Q-004). The CLI's cost is kept per turn: on `--resume` its figure may
 * cover the whole session so far, which a sum would count twice.
 */
function claudeUsage(turns: AgentState['turns']) {
  return {
    turn_costs_usd: turns.map((turn) => turn.result.costUsd ?? null),
    usage: sumUsage(turns.map((turn) => turn.result.usage)),
    models: [...new Set(turns.flatMap((turn) => turn.result.models ?? []))].sort(),
  };
}

const firstPrompt = (referenceEpisode: string) =>
  'Write the episode described in brief.md, following CLAUDE.md. Start by reading CLAUDE.md, ' +
  `brief.md, FILES.md and the reference episode in kit/${referenceEpisode}/.`;
const REVISION_PROMPT =
  'Revise the episode in src/episode/ and sfx/ (your previous version) following feedback.md, ' +
  'brief.md and CLAUDE.md. Start by reading CLAUDE.md, feedback.md and brief.md.';
const REVIEW_REQUEST = 'Now review the storyboard pages';

/** What the storyboard review checks; an English episode also checks for anything Vietnamese (D-092). */
function reviewChecklist(language: Language): string {
  return language === 'en'
    ? '(style, framing, continuity, text in frame, nothing empty, and no Vietnamese text or ' +
        'Vietnam-specific setting, prop or custom on any page).'
    : '(style, framing, continuity, text in frame, nothing empty).';
}

function followUpPrompt(report: GateReport, review: boolean, language: Language): string {
  const failures = describeFailures(report);
  const pages = report.board?.pages ?? [];
  return [
    failures.length > 0
      ? `The worker's checks failed:\n\n${failures.join('\n\n')}`
      : "The worker's checks passed.",
    review && pages.length > 0
      ? `${REVIEW_REQUEST} ${pages.join(', ')} with the Read tool, shot by shot, ` +
        `against brief.md and CLAUDE.md ${reviewChecklist(language)}`
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
  selection: ResolvedSelection,
  saved: AgentState,
): Promise<AgentState> {
  const settingsPath = join(context.workDir, SETTINGS);
  const deadline = Date.now() + (deps.limitMs ?? AGENT_LIMIT_MS) - saved.agentMs;
  let state = saved;
  // Turns in which the agent was shown what it could not fix (an older worker's Chrome crashes, a
  // kit that does not compile, D-108) are given back.
  const wasted = saved.turns.filter(
    (turn, i) => i > 0 && (isBrowserCrash(turn.prompt) || isKitFault(turn.prompt)),
  ).length;
  const maxTurns = MAX_FOLLOW_UPS + 1 + wasted;
  const save = () =>
    writeFileAtomic(join(context.workDir, TURNS_LOG), `${JSON.stringify(state, null, 1)}\n`);

  const recordGates = (n: number, report: GateReport) => {
    const gates = { ok: report.ok, failures: describeFailures(report) };
    return state.turns.map((turn, i) => (i === n - 1 ? { ...turn, gates } : turn));
  };

  const gate = async (draft: boolean) => {
    const n = state.turns.length;
    const hash = await agentFingerprint(ws);
    const last = state.report;
    const needsMix = !draft && last?.ok === true && last.mixDeferred === true;
    if (hash === state.gatedHash && last !== null && browserCrash(last) === null && !needsMix) {
      state = { ...state, turns: recordGates(n, last) };
      await save();
      context.logger.info(
        { turn: n, gatesOk: last.ok },
        'episode gates reused: no agent file changed',
      );
      return;
    }
    await context.progress({ stage: 'gates', turn: n, of: maxTurns });
    const report = await withLanguageGate(
      await deps.gates(ws, context.signal, { draft }),
      ws,
      selection.language,
    );
    const crash = browserCrash(report);
    const crashes = crash ? state.crashes + 1 : 0;
    if (crash && crashes < CRASHES_BEFORE_AGENT) {
      // Not recorded as this turn's gates, so the retry runs the gates again before any agent turn.
      state = { ...state, crashes };
      await save();
      throw new Error(`the gates' Chrome crashed: ${crash.slice(0, 1000)}`);
    }
    // A crash that repeats on the same code goes to the agent like any failed check.
    state = { ...state, report, crashes, gatedHash: hash, turns: recordGates(n, report) };
    await save();
    if (crash)
      context.logger.warn(
        { turn: n, crashes },
        'the gates crashed Chrome again; telling the agent',
      );
    context.logger.info({ turn: n, gatesOk: report.ok, gatesMs: report.ms }, 'episode gates');
  };

  // The last attempt stopped after an agent turn but before its gates finished, or an older worker
  // recorded a Chrome crash as that turn's gates.
  const crashed = state.report !== null && browserCrash(state.report) !== null;
  const isFirstGateRun = () => state.turns.length === 1;
  if (state.turns.at(-1)?.gates === null || crashed) await gate(isFirstGateRun());
  // A turn whose report had no pages (it failed before the board) could not review; a later one does.
  const canReview = () =>
    (state.report?.board?.pages?.length ?? 0) > 0 &&
    !state.turns.some((turn) => turn.prompt.includes(REVIEW_REQUEST));
  for (let n = state.turns.length; n < maxTurns; n++) {
    if (n >= 2 && state.report?.ok && !canReview()) break;
    const timeoutMs = deadline - Date.now();
    if (timeoutMs <= 0) break;
    const prompt =
      n === 0
        ? input.revision
          ? REVISION_PROMPT
          : firstPrompt(selection.referenceEpisode)
        : followUpPrompt(state.report!, canReview(), selection.language);
    await context.progress({ stage: 'agent', turn: n + 1, of: maxTurns });
    const started = Date.now();
    const result = await deps.agent({
      prompt,
      cwd: ws,
      settingsPath,
      resumeSessionId: state.sessionId ?? undefined,
      timeoutMs,
      signal: context.signal,
      job: { id: context.jobId },
    });
    state = {
      ...state,
      sessionId: result.sessionId,
      agentMs: state.agentMs + (Date.now() - started),
      turns: [...state.turns, { prompt, result: { ...result }, gates: null }],
      crashes: 0,
    };
    await save();
    context.logger.info({ turn: n + 1, agentMs: result.durationMs }, 'episode agent turn');
    await gate(isFirstGateRun());
  }
  // The time ran out after turn 1: the job must still end on a full run, with its audio.
  if (state.report?.ok && state.report.mixDeferred) await gate(false);
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

    // The clip's kit and character set (D-066); an unknown slug fails the job, never falls back.
    const selection = selectionOf(input);
    const prepareStart = Date.now();
    let saved = await savedState(context);
    if (saved) {
      context.logger.info({ turns: saved.turns.length }, 'resuming the episode agent');
      // A worker update since the first attempt (a kit or catalog fix, D-108) reaches the
      // workspace here; a changed kit means the last gate report no longer applies.
      if (await refreshKit(join(workDir, WORKSPACE), selection)) {
        context.logger.info('kit refreshed from the current repo: running the gates again');
        const n = saved.turns.length;
        saved = {
          ...saved,
          gatedHash: null,
          turns: saved.turns.map((turn, i) => (i === n - 1 ? { ...turn, gates: null } : turn)),
        };
      }
    } else {
      const rules = await deps.rules();
      context.logger.info({ rulesVersion: rules.version }, 'episode workspace');
      await prepareWorkspace(await freshWorkspacePath(workDir, context.attemptNo), {
        selection,
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
    const kit = await deps.kitCheck(realWs, context.signal);
    if (!kit.ok) {
      throw new PermanentJobError(
        `kit ${selection.kit} + ${selection.characterSet} does not compile, agent not started; ` +
          `needs a repo fix, then /retry: ${kit.output.slice(0, KIT_ERROR_CHARS)}`,
      );
    }
    context.logger.info({ prepareMs: Date.now() - prepareStart }, 'episode workspace ready');
    await writeFile(
      join(workDir, SETTINGS),
      `${JSON.stringify(agentSettings(realWs, deps.runtimeRoot), null, 1)}\n`,
    );

    const { turns, report, sessionId, agentMs } = await runTurns(
      context,
      deps,
      realWs,
      input,
      selection,
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
    // A gate report from before the mix step has none: the storyboard then goes without audio.
    const mixFile = report.mix?.ok ? report.mix.file : undefined;
    const mixLoudness = mixFile
      ? await deps.loudness(
          await resolveInside(realWs, mixFile),
          join(workDir, MIX),
          context.signal,
        )
      : null;
    return {
      outputs: [
        ...files.map((f) => `${WORKSPACE}/${f}`),
        ...pages.map((p) => `${WORKSPACE}/${p}`),
        `${WORKSPACE}/gates.json`,
        TURNS_LOG,
        ...(mixLoudness ? [MIX] : []),
      ],
      result: {
        turns: turns.length,
        session_id: sessionId,
        agent_ms: agentMs,
        claude: claudeUsage(turns),
        board_pages: pages.map((p) => `${WORKSPACE}/${p}`),
        // Capability for GET /boards/… (D-055): only Postgres readers (n8n) learn it.
        board_token: randomBytes(16).toString('hex'),
        // The same for GET /media/…/mix.m4a (D-057, D-071).
        media_token: randomBytes(16).toString('hex'),
        mix_loudness: mixLoudness,
        sfx_files: report.sfx?.files?.length ?? 0,
        text_bounds_blur: report.textBounds?.blur ?? 0,
        revision: Boolean(input.revision),
        // The kit's video size (D-080): render_episode renders at it.
        frame: selection.frame,
        // The kit's language (D-092): render_episode names the subtitles after it.
        language: selection.language,
      },
    };
  };
}
