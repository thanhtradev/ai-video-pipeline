import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import pino from 'pino';
import { beforeEach, describe, expect, test } from 'vitest';
import type { ClaimedMove, MoveStore } from '../../src/db/move-store.js';
import { exportVideo } from '../../src/move/export-video.js';
import { createMoveRunner, type TransferFetch } from '../../src/move/move-runner.js';

// The target side of a move (D-087), run as idle work: claim a move, fetch the tar from the
// source worker, import it, then complete; any failure is reported and the SQL side decides
// whether another attempt follows.

const VIDEO = '5b0c7a8e-1111-4c2d-9e3f-000000000001';
const MOVE: ClaimedMove = {
  moveId: 'move-1',
  videoId: VIDEO,
  fromWorker: 'mac-mini-m4',
  sourceUrl: 'http://100.71.214.125:8787',
  token: 'a'.repeat(32),
  attemptNo: 1,
};

let sourceRoot: string;
let targetRoot: string;

beforeEach(async () => {
  sourceRoot = await mkdtemp(join(tmpdir(), 'runner-src-'));
  targetRoot = await mkdtemp(join(tmpdir(), 'runner-dst-'));
  await mkdir(join(sourceRoot, 'videos', VIDEO, 'v1'), { recursive: true });
  await writeFile(join(sourceRoot, 'videos', VIDEO, 'v1', 'brief.md'), '# Mèo');
});

function fakeStore(claimed: ClaimedMove | null, completed = 'DONE') {
  const calls: { method: string; args: unknown[] }[] = [];
  const store: MoveStore = {
    claim: async (...args) => {
      calls.push({ method: 'claim', args });
      return claimed;
    },
    tokenValid: async () => true,
    complete: async (...args) => {
      calls.push({ method: 'complete', args });
      return completed;
    },
    fail: async (...args) => {
      calls.push({ method: 'fail', args });
      return 'WAITING';
    },
  };
  return { store, calls };
}

const fromSource: TransferFetch = async (url) => {
  const videoId = new URL(url).pathname.split('/').at(-1)!;
  const stream = await exportVideo(sourceRoot, videoId);
  return stream ? { ok: true, status: 200, body: stream } : { ok: false, status: 404, body: null };
};

function runner(store: MoveStore, fetchTransfer: TransferFetch = fromSource) {
  return createMoveRunner({
    store,
    workerId: 'hp-400-g7',
    workRoot: targetRoot,
    nodeModules: '/home/aivideo/aivideo/repo/node_modules',
    fetchTransfer,
    logger: pino({ level: 'silent' }),
  });
}

describe('move runner', () => {
  test('does nothing when no move is waiting for this worker', async () => {
    const { store, calls } = fakeStore(null);

    expect(await runner(store)()).toBe(false);

    expect(calls).toEqual([{ method: 'claim', args: ['hp-400-g7', expect.any(Number)] }]);
  });

  test('copies the video from the source worker, then completes the move', async () => {
    const { store, calls } = fakeStore(MOVE);
    const urls: string[] = [];

    const ran = await runner(store, async (url, signal) => {
      urls.push(url);
      return fromSource(url, signal);
    })();

    expect(ran).toBe(true);
    expect(urls).toEqual([`http://100.71.214.125:8787/transfer/${VIDEO}?t=${'a'.repeat(32)}`]);
    expect(await readFile(join(targetRoot, 'videos', VIDEO, 'v1', 'brief.md'), 'utf8')).toBe(
      '# Mèo',
    );
    expect(calls.at(-1)).toEqual({ method: 'complete', args: ['move-1', 'hp-400-g7'] });
  });

  test('reports a refused transfer as a failed attempt', async () => {
    const { store, calls } = fakeStore({
      ...MOVE,
      videoId: '5b0c7a8e-9999-4c2d-9e3f-000000000009',
    });

    expect(await runner(store)()).toBe(true);

    expect(calls.at(-1)).toEqual({
      method: 'fail',
      args: ['move-1', 'hp-400-g7', 'source worker answered HTTP 404'],
    });
  });

  test('reports a source without an API URL, an unreachable source and a bad copy', async () => {
    const noUrl = fakeStore({ ...MOVE, sourceUrl: null });
    await runner(noUrl.store)();
    expect(noUrl.calls.at(-1)!.args[2]).toBe('source worker mac-mini-m4 has no API URL');

    const down = fakeStore(MOVE);
    await runner(down.store, async () => {
      throw new Error('connect ECONNREFUSED');
    })();
    expect(down.calls.at(-1)!.args[2]).toBe('Error: connect ECONNREFUSED');

    const bad = fakeStore(MOVE);
    await runner(bad.store, async () => ({
      ok: true,
      status: 200,
      body: Readable.from([Buffer.from('not a tar at all')]),
    }))();
    expect(String(bad.calls.at(-1)!.args[2])).toMatch(/^VideoImportError: /);
  });

  test('leaves the move to its lease when the worker is stopping', async () => {
    const { store, calls } = fakeStore(MOVE);
    const stop = new AbortController();

    const ran = await runner(store, async () => {
      stop.abort();
      throw new Error('aborted');
    })(stop.signal);

    expect(ran).toBe(true);
    expect(calls.map((c) => c.method)).toEqual(['claim']);
  });
});
