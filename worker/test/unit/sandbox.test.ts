import { describe, expect, test } from 'vitest';
import { sandboxCommand, type PathKind, type SandboxedNode } from '../../src/episode/sandbox.js';

const RUN: SandboxedNode = {
  profile: '/repo/ops/claude/episode-render.sb',
  ws: '/srv/aivideo/work/ws-1',
  runtimeRoot: '/srv/aivideo',
  script: '/repo/remotion/scripts/episode-render.mjs',
  args: ['/srv/aivideo/work/ws-1', 'out.mp4', '1'],
  timeoutMs: 1000,
  signal: new AbortController().signal,
};

const kinds = (entries: Record<string, PathKind>) => (path: string) => entries[path] ?? null;

/** Pairs each bwrap option with its operands, e.g. ['--bind', src, dest]. */
function bwrapPairs(args: readonly string[], option: string, operands: number): string[][] {
  return args.flatMap((arg, i) => (arg === option ? [args.slice(i + 1, i + 1 + operands)] : []));
}

describe('sandboxCommand on macOS', () => {
  test('runs node under the Seatbelt profile with the workspace parameters', () => {
    const command = sandboxCommand(RUN, {
      platform: 'darwin',
      home: '/Users/aivideo',
      nodeBin: '/opt/node',
      pathKind: kinds({}),
    });

    expect(command.file).toBe('/usr/bin/sandbox-exec');
    expect(command.args).toEqual([
      ...['-f', RUN.profile, '-D', `WS=${RUN.ws}`, '-D', `TMP=${RUN.ws}/tmp`],
      ...['-D', 'HOME=/Users/aivideo', '-D', 'ROOT=/srv/aivideo'],
      '/opt/node',
      RUN.script,
      ...RUN.args,
    ]);
  });
});

describe('sandboxCommand on Linux (bubblewrap)', () => {
  const home = '/home/aivideo';
  const linux = (pathKind = kinds({})) =>
    sandboxCommand(RUN, { platform: 'linux', home, nodeBin: '/usr/bin/node', pathKind });

  test('mounts the system read-only, the workspace writable, and runs node last', () => {
    const { file, args } = linux();

    expect(file).toBe('bwrap');
    expect(args.slice(0, 3)).toEqual(['--ro-bind', '/', '/']);
    expect(bwrapPairs(args, '--bind', 2)).toEqual([[RUN.ws, RUN.ws]]);
    expect(args.slice(-(3 + RUN.args.length))).toEqual([
      '--',
      '/usr/bin/node',
      RUN.script,
      ...RUN.args,
    ]);
  });

  test('cuts the network but keeps loopback, as the Seatbelt profile does', () => {
    const { args } = linux();

    expect(args).toContain('--unshare-net');
    expect(args).toContain('--die-with-parent');
    expect(args).toContain('--new-session');
  });

  test('gives Chrome fresh /dev, /proc, /dev/shm and a private /tmp', () => {
    const { args } = linux();

    expect(bwrapPairs(args, '--dev', 1)).toEqual([['/dev']]);
    expect(bwrapPairs(args, '--proc', 1)).toEqual([['/proc']]);
    expect(bwrapPairs(args, '--tmpfs', 1)).toEqual(
      expect.arrayContaining([['/dev/shm'], ['/tmp']]),
    );
  });

  test('hides secret folders and files that exist', () => {
    const { args } = linux(
      kinds({
        '/home/aivideo/.ssh': 'dir',
        '/home/aivideo/.config': 'dir',
        '/home/aivideo/.claude': 'dir',
        '/home/aivideo/.claude.json': 'file',
        '/srv/aivideo/config': 'dir',
      }),
    );

    const hiddenDirs = bwrapPairs(args, '--tmpfs', 1).map(([path]) => path);
    expect(hiddenDirs).toEqual(
      expect.arrayContaining([
        '/home/aivideo/.ssh',
        '/home/aivideo/.config',
        '/home/aivideo/.claude',
        '/srv/aivideo/config',
      ]),
    );
    expect(bwrapPairs(args, '--ro-bind', 2)).toContainEqual([
      '/dev/null',
      '/home/aivideo/.claude.json',
    ]);
  });

  test('skips missing secret paths, since bubblewrap cannot mount over them', () => {
    const { args } = linux(kinds({ '/home/aivideo/.ssh': 'dir' }));

    expect(args).not.toContain('/home/aivideo/.claude');
    expect(args).not.toContain('/home/aivideo/.claude.json');
  });

  test('mounts the hidden paths after the workspace so a workspace bind cannot reopen them', () => {
    const { args } = linux(kinds({ '/home/aivideo/.ssh': 'dir' }));

    expect(args.indexOf('/home/aivideo/.ssh')).toBeGreaterThan(args.indexOf('--bind'));
  });
});

test('rejects platforms without a sandbox instead of running unconfined', () => {
  expect(() =>
    sandboxCommand(RUN, { platform: 'win32', home: 'C:\\', nodeBin: 'node', pathKind: kinds({}) }),
  ).toThrow(/no sandbox for platform win32/);
});
