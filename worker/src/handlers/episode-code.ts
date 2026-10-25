import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, realpath, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import type { AgentRunner, AgentTurnResult } from '../claude/agent-cli.js';
import { agentSettings } from '../episode/agent-settings.js';
import { describeFailures, type GateReport, type GateRunner } from '../episode/gates.js';
import { agentFiles, containsSecret, prepareWorkspace } from '../episode/workspace.js';
import { readValidCheckpoint, writeFileAtomic } from '../storage/checkpoint.js';
import { resolveInside } from '../storage/workspace.js';
import { PermanentJobError, type HandlerContext, type JobHandler } from '../runner.js';

// Episode `episode_code` step (q:render, docs/episode-pipeline.md §6, D-052–D-054): Claude Code
// (Opus) writes the episode in a sandboxed workspace; the worker gates it and resumes the session
// with the report and the storyboard. Turn 1 writes; turn 2 always reviews the storyboard; turn 3
// only fixes failed gates. All agent turns share a 90-minute limit. Failing gates after the last
// turn is permanent: a person decides (the workspace stays for an interactive session).

const AGENT_LIMIT_MS = 90 * 60 * 1000;
const MAX_FOLLOW_UPS = 2;
const WORKSPACE = 'ws';
const SETTINGS = 'agent-settings.json';
const TURNS_LOG = 'agent-turns.json';

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

interface Turn {
  prompt: string;
  result: AgentTurnResult;
  gates: { ok: boolean; failures: string[] };
}

async function runTurns(context: HandlerContext, deps: EpisodeCodeDeps, ws: string, input: Input) {
  const settingsPath = join(context.workDir, SETTINGS);
  const deadline = Date.now() + (deps.limitMs ?? AGENT_LIMIT_MS);
  const turns: Turn[] = [];
  let sessionId: string | undefined;
  let report: GateReport | null = null;
  for (let n = 0; n <= MAX_FOLLOW_UPS; n++) {
    if (n === 2 && report?.ok) break;
    const timeoutMs = deadline - Date.now();
    if (timeoutMs <= 0) break;
    const prompt =
      n === 0
        ? input.revision
          ? REVISION_PROMPT
          : FIRST_PROMPT
        : followUpPrompt(report!, n === 1);
    const result = await deps.agent({
      prompt,
      cwd: ws,
      settingsPath,
      resumeSessionId: sessionId,
      timeoutMs,
      signal: context.signal,
    });
    sessionId = result.sessionId;
    report = await deps.gates(ws, context.signal);
    turns.push({ prompt, result, gates: { ok: report.ok, failures: describeFailures(report) } });
    context.logger.info(
      { turn: n + 1, gatesOk: report.ok, agentMs: result.durationMs },
      'episode agent turn',
    );
  }
  await writeFileAtomic(join(context.workDir, TURNS_LOG), `${JSON.stringify(turns, null, 1)}\n`);
  return { turns, report };
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
    const ws = await freshWorkspacePath(workDir, context.attemptNo);
    await prepareWorkspace(ws, {
      scriptMarkdown: await readFile(join(scriptDir, 'script.md'), 'utf8'),
      timingDir,
      revision:
        input.revision && previous
          ? { previousWorkspace: previous, feedback: input.revision.feedback }
          : undefined,
    });
    const realWs = await realpath(ws);
    await writeFile(join(workDir, SETTINGS), `${JSON.stringify(agentSettings(realWs), null, 1)}\n`);

    const { turns, report } = await runTurns(context, deps, realWs, input);
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
        session_id: turns.at(-1)?.result.sessionId ?? null,
        agent_ms: turns.reduce((sum, t) => sum + (t.result.durationMs ?? 0), 0),
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
