import { execFile } from 'node:child_process';
import { statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

// Runs a worker-owned Node script on an episode workspace in a sandbox: the script executes
// agent-written code (SFX synthesis, the episode in Chrome), so it gets loopback only and may write
// only inside the workspace. macOS uses the Seatbelt profile ops/claude/episode-render.sb (D-054);
// Linux uses bubblewrap with the same policy (D-075).

const execFileAsync = promisify(execFile);
const MAX_BUFFER = 16 * 1024 * 1024;

export interface SandboxedNode {
  /** The Seatbelt profile file (macOS only). */
  profile: string;
  /** Real path of the workspace (Seatbelt matches resolved paths, e.g. /private/tmp). */
  ws: string;
  /** The worker's runtime root (D-065): its config/ is denied to the sandboxed process. */
  runtimeRoot: string;
  script: string;
  args: readonly string[];
  timeoutMs: number;
  signal: AbortSignal;
  /** Extra environment for the script (render tunables); never secrets. */
  env?: Readonly<Record<string, string>>;
  sandboxExec?: string;
  nodeBin?: string;
}

export type PathKind = 'dir' | 'file' | null;

export interface SandboxHost {
  platform: NodeJS.Platform;
  home: string;
  nodeBin: string;
  /** What exists at a path; bubblewrap can only mount over existing paths. */
  pathKind: (path: string) => PathKind;
}

export interface SandboxCommand {
  file: string;
  args: string[];
}

function darwinCommand(run: SandboxedNode, host: SandboxHost): SandboxCommand {
  return {
    file: run.sandboxExec ?? '/usr/bin/sandbox-exec',
    args: [
      ...['-f', run.profile, '-D', `WS=${run.ws}`, '-D', `TMP=${join(run.ws, 'tmp')}`],
      ...['-D', `HOME=${host.home}`, '-D', `ROOT=${run.runtimeRoot}`],
      host.nodeBin,
      run.script,
      ...run.args,
    ],
  };
}

/** Paths with credentials the sandboxed process must not read (cf. episode-render.sb). */
function linuxHiddenPaths(run: SandboxedNode, host: SandboxHost): string[] {
  return [
    join(host.home, '.ssh'),
    // rclone's Drive token and the aivideo config live here; Chrome gets an empty one.
    join(host.home, '.config'),
    // Claude Code keeps its login here on Linux.
    join(host.home, '.claude'),
    join(host.home, '.claude.json'),
    // worker.env and, on Linux, the secret files (ops/systemd/run-worker.sh).
    join(run.runtimeRoot, 'config'),
  ];
}

function hideArgs(path: string, kind: PathKind): string[] {
  if (kind === 'dir') return ['--tmpfs', path];
  if (kind === 'file') return ['--ro-bind', '/dev/null', path];
  return [];
}

function linuxCommand(run: SandboxedNode, host: SandboxHost): SandboxCommand {
  return {
    file: 'bwrap',
    args: [
      ...['--ro-bind', '/', '/'],
      ...['--dev', '/dev', '--tmpfs', '/dev/shm', '--proc', '/proc', '--tmpfs', '/tmp'],
      ...['--bind', run.ws, run.ws],
      ...linuxHiddenPaths(run, host).flatMap((path) => hideArgs(path, host.pathKind(path))),
      // A new network namespace has only loopback, which Remotion's bundle server needs.
      ...['--unshare-net', '--unshare-pid', '--die-with-parent', '--new-session'],
      '--',
      host.nodeBin,
      run.script,
      ...run.args,
    ],
  };
}

export function sandboxCommand(run: SandboxedNode, host: SandboxHost): SandboxCommand {
  if (host.platform === 'darwin') return darwinCommand(run, host);
  if (host.platform === 'linux') return linuxCommand(run, host);
  throw new Error(`no sandbox for platform ${host.platform}`);
}

function pathKind(path: string): PathKind {
  try {
    return statSync(path).isDirectory() ? 'dir' : 'file';
  } catch {
    return null;
  }
}

export async function runSandboxedNode(run: SandboxedNode): Promise<void> {
  const home = homedir();
  const command = sandboxCommand(run, {
    platform: process.platform,
    home,
    nodeBin: run.nodeBin ?? process.execPath,
    pathKind,
  });
  await execFileAsync(command.file, command.args, {
    env: {
      PATH: process.env.PATH ?? '/usr/bin:/bin',
      HOME: home,
      TMPDIR: join(run.ws, 'tmp'),
      LANG: 'en_US.UTF-8',
      ...run.env,
    },
    timeout: run.timeoutMs,
    maxBuffer: MAX_BUFFER,
    signal: run.signal,
  });
}
