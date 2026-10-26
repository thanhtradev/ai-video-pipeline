import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { runSandboxedNode } from './sandbox.js';
import { GATES_SCRIPT } from './workspace.js';

// Worker gates on the agent's workspace (docs/episode-pipeline.md §6): the agent's own claims are
// not trusted. remotion/scripts/episode-gates.mjs runs agent-written code, so it runs sandboxed.

const GATES_TIMEOUT_MS = 45 * 60 * 1000;
const REPORT_ROWS = 30;

const stepSchema = z.object({ ok: z.boolean(), error: z.string().optional() }).loose();
export const gateReportSchema = z
  .object({
    ok: z.boolean(),
    typecheck: z.object({ ok: z.boolean(), output: z.string() }),
    sfx: stepSchema
      .extend({ files: z.array(z.string()).optional(), output: z.string().optional() })
      .optional(),
    bundle: stepSchema.optional(),
    board: stepSchema.extend({ pages: z.array(z.string()).optional() }).optional(),
    textBounds: stepSchema
      .extend({
        sharp: z.number().optional(),
        blur: z.number().optional(),
        rows: z
          .array(
            z.object({
              kind: z.string(),
              side: z.string(),
              text: z.string(),
              from: z.number(),
              to: z.number(),
            }),
          )
          .optional(),
      })
      .optional(),
  })
  .loose();

export type GateReport = z.infer<typeof gateReportSchema>;
export type GateRunner = (ws: string, signal: AbortSignal) => Promise<GateReport>;

export interface GateRunnerOptions {
  /** ops/claude/episode-render.sb */
  profile: string;
}

/** `ws` must be the real path (Seatbelt matches resolved paths, e.g. /private/tmp). */
export function createGateRunner(options: GateRunnerOptions): GateRunner {
  return async (ws, signal) => {
    await runSandboxedNode({
      profile: options.profile,
      ws,
      script: GATES_SCRIPT,
      args: [ws],
      timeoutMs: GATES_TIMEOUT_MS,
      signal,
    });
    return gateReportSchema.parse(JSON.parse(await readFile(join(ws, 'gates.json'), 'utf8')));
  };
}

/** Remotion's errors when Chrome itself dies (e.g. a V8 fatal check), not the episode code. */
const BROWSER_CRASH = /Page crashed!|Target closed|browser crashed|Session closed/i;

/** The Chrome crash of a gate run, or null. The agent cannot fix it: the worker retries. */
export function browserCrash(report: GateReport): string | null {
  const errors = [report.board?.error, report.textBounds?.error];
  return errors.find((e): e is string => e !== undefined && BROWSER_CRASH.test(e)) ?? null;
}

const frames = (from: number, to: number) => `episode frames ${from}–${to}`;

/** What failed, in words the agent can act on. */
export function describeFailures(report: GateReport): string[] {
  const out: string[] = [];
  if (!report.typecheck.ok) out.push(`Typecheck failed:\n${report.typecheck.output}`);
  if (report.sfx && !report.sfx.ok)
    out.push(`The SFX script failed:\n${report.sfx.output ?? report.sfx.error ?? ''}`);
  if (report.bundle && !report.bundle.ok)
    out.push(`Bundling failed:\n${report.bundle.error ?? ''}`);
  if (report.board && !report.board.ok)
    out.push(`The storyboard render failed:\n${report.board.error ?? ''}`);
  const tb = report.textBounds;
  if (tb && !tb.ok) {
    const rows = (tb.rows ?? []).filter((r) => r.kind !== 'blur').slice(0, REPORT_ROWS);
    out.push(
      tb.error
        ? `The text-bounds QA failed:\n${tb.error}`
        : `${tb.sharp ?? rows.length} sharp texts are partly outside the 1920×1080 frame ` +
            `(side: t/r/b/l = top/right/bottom/left and pixels outside):\n` +
            rows
              .map((r) => `- "${r.text}" ${r.kind}, ${r.side}, ${frames(r.from, r.to)}`)
              .join('\n'),
    );
  }
  return out;
}
