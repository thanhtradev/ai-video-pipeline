import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import { runSandboxedNode } from './sandbox.js';
import { GATES_SCRIPT, NODE_MODULES } from './workspace.js';

// Worker gates on the agent's workspace (docs/episode-pipeline.md §6): the agent's own claims are
// not trusted. remotion/scripts/episode-gates.mjs runs agent-written code, so it runs sandboxed.

const GATES_TIMEOUT_MS = 45 * 60 * 1000;
const REPORT_ROWS = 30;
const runFile = promisify(execFile);
const TSC = join(NODE_MODULES, 'typescript', 'bin', 'tsc');
const KIT_CHECK_CONFIG = 'kit-check.tsconfig.json';
const KIT_CHECK_TIMEOUT_MS = 5 * 60 * 1000;
const KIT_CHECK_MAX_OUTPUT = 4 * 1024 * 1024;

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
    /** The episode's audio, rendered without frames (D-071); absent in older reports. */
    mix: stepSchema.extend({ file: z.string().optional() }).optional(),
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
    /** The worker's English-text check (D-092); only in English episodes' reports. */
    language: z
      .object({
        ok: z.boolean(),
        hits: z.array(z.object({ file: z.string(), line: z.number(), text: z.string() })),
      })
      .optional(),
    /** Wall time per gate step in ms; absent in reports of older gate scripts. */
    ms: z.record(z.string(), z.number()).optional(),
  })
  .loose();

export type GateReport = z.infer<typeof gateReportSchema>;
export type GateRunner = (ws: string, signal: AbortSignal) => Promise<GateReport>;

export interface GateRunnerOptions {
  /** ops/claude/episode-render.sb */
  profile: string;
  /** The worker's runtime root (D-065). */
  runtimeRoot: string;
  /** Render tunables for the gates script (D-075). */
  env?: Readonly<Record<string, string>>;
}

/** `ws` must be the real path (Seatbelt matches resolved paths, e.g. /private/tmp). */
export function createGateRunner(options: GateRunnerOptions): GateRunner {
  return async (ws, signal) => {
    await runSandboxedNode({
      profile: options.profile,
      ws,
      runtimeRoot: options.runtimeRoot,
      ...(options.env ? { env: options.env } : {}),
      script: GATES_SCRIPT,
      args: [ws],
      timeoutMs: GATES_TIMEOUT_MS,
      signal,
    });
    return gateReportSchema.parse(JSON.parse(await readFile(join(ws, 'gates.json'), 'utf8')));
  };
}

export interface KitCheck {
  readonly ok: boolean;
  /** tsc's errors; empty when the kit compiles. */
  readonly output: string;
}
export type KitChecker = (ws: string, signal: AbortSignal) => Promise<KitCheck>;

/** An error from a tsc that ran and exited non-zero, not one that was killed or never started. */
const isTscFailure = (err: unknown): err is { stdout: string; stderr: string } =>
  err instanceof Error && 'code' in err && typeof err.code === 'number';

/**
 * Compiles only the worker-owned kit/ of a workspace, before any agent turn: the agent cannot fix a
 * kit error, so it must not cost a first turn to find one. This runs repo code only, so it needs no
 * sandbox. The config sits next to the workspace, out of the agent's sight. An abort or timeout
 * throws, so the job can run again; only a real compile error is a result.
 */
export const checkKit: KitChecker = async (ws, signal) => {
  const config = join(dirname(ws), KIT_CHECK_CONFIG);
  await writeFile(
    config,
    `${JSON.stringify({ extends: join(ws, 'tsconfig.json'), include: [join(ws, 'kit')] })}\n`,
  );
  try {
    await runFile(process.execPath, [TSC, '-p', config], {
      cwd: ws,
      signal,
      timeout: KIT_CHECK_TIMEOUT_MS,
      maxBuffer: KIT_CHECK_MAX_OUTPUT,
    });
    return { ok: true, output: '' };
  } catch (err) {
    if (!isTscFailure(err)) throw err;
    return { ok: false, output: `${err.stdout}${err.stderr}` };
  }
};

/** Remotion's errors when Chrome itself dies (e.g. a V8 fatal check), not the episode code. */
const BROWSER_CRASH = /Page crashed!|Target closed|browser crashed|Session closed/i;

/** True when the text (a gate error, or a prompt quoting one) shows Chrome itself crashing. */
export const isBrowserCrash = (text: string): boolean => BROWSER_CRASH.test(text);

/** A typecheck error inside the worker-owned kit/ (a catalog gap), which the agent cannot fix. */
const KIT_FAULT = /^kit\/\S+\(\d+,\d+\): error TS\d+/m;

/** True when the text (a gate failure, or a prompt quoting one) blames the kit, not the agent. */
export const isKitFault = (text: string): boolean => KIT_FAULT.test(text);

/**
 * A Chrome crash told to the agent once it repeats on the same code (the code triggers a Chrome
 * bug). Worded so that it does not match BROWSER_CRASH: the turn is not given back as wasted.
 */
export const CHROME_ABORT_HINT =
  'Chrome itself aborted while rendering the episode, on two runs of the same code, so something ' +
  'in the code triggers a Chrome bug. A known cause: Skia aborts on an animated ' +
  'strokeDasharray with pathLength (a draw-on or partial curve, dashes near zero) of a curved SVG ' +
  'path (Q, C, S, T or A commands). Draw the visible part of such a curve as a polyline of straight ' +
  'segments, without dashes, and check any other unusual SVG or CSS you added in your last turn.';

const stepError = (error: string | undefined): string =>
  error !== undefined && isBrowserCrash(error) ? CHROME_ABORT_HINT : (error ?? '');

/** The Chrome crash of a gate run, or null. The worker retries it once before the agent sees it. */
export function browserCrash(report: GateReport): string | null {
  const errors = [report.board?.error, report.mix?.error, report.textBounds?.error];
  return errors.find((e): e is string => e !== undefined && isBrowserCrash(e)) ?? null;
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
    out.push(`The storyboard render failed:\n${stepError(report.board.error)}`);
  if (report.mix && !report.mix.ok)
    out.push(`The audio mix render failed:\n${stepError(report.mix.error)}`);
  const tb = report.textBounds;
  if (tb && !tb.ok) {
    const rows = (tb.rows ?? []).filter((r) => r.kind !== 'blur').slice(0, REPORT_ROWS);
    out.push(
      tb.error
        ? `The text-bounds QA failed:\n${stepError(tb.error)}`
        : `${tb.sharp ?? rows.length} sharp texts are partly outside the video frame ` +
            `(side: t/r/b/l = top/right/bottom/left and pixels outside):\n` +
            rows
              .map((r) => `- "${r.text}" ${r.kind}, ${r.side}, ${frames(r.from, r.to)}`)
              .join('\n'),
    );
  }
  if (report.language && !report.language.ok) {
    out.push(
      'This is an English episode, but these lines of src/episode/ contain Vietnamese text ' +
        '(translate them to English or remove them):\n' +
        report.language.hits.map((h) => `- ${h.file}:${h.line} ${h.text}`).join('\n'),
    );
  }
  return out;
}
