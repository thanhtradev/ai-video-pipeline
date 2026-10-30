import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { runSandboxedNode } from '../../src/episode/sandbox.js';

// The bubblewrap sandbox on a Linux worker (D-075) enforces what episode-render.sb does on macOS:
// loopback only, writes only inside the workspace, no reads of secret folders. Runs only on Linux
// with bwrap installed (the HP worker VM); skipped elsewhere.

const hasBwrap = process.platform === 'linux' && spawnSync('bwrap', ['--version']).status === 0;

/** Runs `code` as a script in a fresh workspace and returns what it wrote to result.json. */
async function inSandbox(code: string): Promise<Record<string, unknown>> {
  const ws = await realpath(await mkdtemp(join(tmpdir(), 'sandbox-')));
  await mkdir(join(ws, 'tmp'));
  const script = join(ws, 'probe.mjs');
  await writeFile(script, `${code}\n`);
  await runSandboxedNode({
    profile: '',
    ws,
    runtimeRoot: join(homedir(), 'aivideo'),
    script,
    args: [ws],
    timeoutMs: 20_000,
    signal: new AbortController().signal,
    env: { REMOTION_GL: 'swangle' },
  });
  return JSON.parse(await readFile(join(ws, 'result.json'), 'utf8')) as Record<string, unknown>;
}

describe.skipIf(!hasBwrap)('bubblewrap sandbox (Linux worker)', () => {
  test('writes inside the workspace, nowhere else outside its private /tmp', async () => {
    const result = await inSandbox(`
      import { writeFileSync } from 'node:fs';
      import { join } from 'node:path';
      const ws = process.argv[2];
      const tryWrite = (path) => { try { writeFileSync(path, 'x'); return 'ok'; } catch (e) { return e.code; } };
      writeFileSync(join(ws, 'result.json'), JSON.stringify({
        home: tryWrite(join(process.env.HOME, 'sandbox-escape.txt')),
        env: process.env.REMOTION_GL,
      }));
    `);

    expect(result).toEqual({ home: 'EROFS', env: 'swangle' });
  });

  test('cannot reach other hosts but can use loopback', async () => {
    const result = await inSandbox(`
      import { createServer, connect } from 'node:net';
      import { writeFileSync } from 'node:fs';
      import { join } from 'node:path';
      const reach = (host, port) => new Promise((done) => {
        const socket = connect({ host, port, timeout: 3000 });
        socket.on('connect', () => { socket.destroy(); done('ok'); });
        socket.on('error', (e) => done(e.code));
        socket.on('timeout', () => { socket.destroy(); done('timeout'); });
      });
      const server = createServer((s) => s.end()).listen(0, '127.0.0.1');
      await new Promise((r) => server.on('listening', r));
      const loopback = await reach('127.0.0.1', server.address().port);
      server.close();
      const remote = await reach('1.1.1.1', 443);
      writeFileSync(join(process.argv[2], 'result.json'), JSON.stringify({ loopback, remote }));
    `);

    expect(result.loopback).toBe('ok');
    expect(result.remote).not.toBe('ok');
  });

  test('sees ~/.ssh and ~/.config as empty', async () => {
    const result = await inSandbox(`
      import { readdirSync, writeFileSync } from 'node:fs';
      import { join } from 'node:path';
      const list = (dir) => { try { return readdirSync(dir); } catch (e) { return e.code; } };
      const home = process.env.HOME;
      writeFileSync(join(process.argv[2], 'result.json'), JSON.stringify({
        ssh: list(join(home, '.ssh')),
        config: list(join(home, '.config')),
      }));
    `);

    for (const entries of [result.ssh, result.config]) {
      expect(entries === 'ENOENT' || (Array.isArray(entries) && entries.length === 0)).toBe(true);
    }
  });
});
