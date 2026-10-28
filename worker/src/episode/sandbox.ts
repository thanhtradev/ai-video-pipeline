import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

// Runs a worker-owned Node script on an episode workspace under the worker's Seatbelt profile
// (ops/claude/episode-render.sb, D-054): the script executes agent-written code (SFX synthesis, the
// episode in Chrome), so it gets loopback only and may write only inside the workspace.

const execFileAsync = promisify(execFile);
const MAX_BUFFER = 16 * 1024 * 1024;

export interface SandboxedNode {
  /** The profile file. */
  profile: string;
  /** Real path of the workspace (Seatbelt matches resolved paths, e.g. /private/tmp). */
  ws: string;
  /** The worker's runtime root (D-065): its config/ is denied to the sandboxed process. */
  runtimeRoot: string;
  script: string;
  args: readonly string[];
  timeoutMs: number;
  signal: AbortSignal;
  sandboxExec?: string;
  nodeBin?: string;
}

export async function runSandboxedNode(run: SandboxedNode): Promise<void> {
  const tmp = join(run.ws, 'tmp');
  const home = homedir();
  await execFileAsync(
    run.sandboxExec ?? '/usr/bin/sandbox-exec',
    [
      ...['-f', run.profile, '-D', `WS=${run.ws}`, '-D', `TMP=${tmp}`, '-D', `HOME=${home}`],
      ...['-D', `ROOT=${run.runtimeRoot}`],
      run.nodeBin ?? process.execPath,
      run.script,
      ...run.args,
    ],
    {
      env: {
        PATH: process.env.PATH ?? '/usr/bin:/bin',
        HOME: home,
        TMPDIR: tmp,
        LANG: 'en_US.UTF-8',
      },
      timeout: run.timeoutMs,
      maxBuffer: MAX_BUFFER,
      signal: run.signal,
    },
  );
}
