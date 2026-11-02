import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readlink, symlink, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pino from 'pino';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { buildApi } from '../../src/api.js';
import { createMoveStore } from '../../src/db/move-store.js';
import { createMoveRunner } from '../../src/move/move-runner.js';
import { createMemoryNonceStore } from '../../src/security/hmac.js';
import { readValidCheckpoint } from '../../src/storage/checkpoint.js';
import { createTestDb, type TestDb } from '../helpers/db.js';
import { createBatch, createJob, createVideo } from '../helpers/fixtures.js';

// D-087 end to end on the local test Postgres: a video pinned to worker A with a finished step on
// A's disk; the owner sends /move; worker B's move runner copies the folder from A's real API
// over HTTP, verifies the checkpoint and completes the move; the next job goes to B's queue.

const OWNER = 111;
const SOURCE = 'mac-mini-m4';
const TARGET = 'hp-400-g7';
const SCRIPT = '# Mèo nghĩ gì?\n';

let db: TestDb;
let api: Awaited<ReturnType<typeof buildApi>>;
let sourceRoot: string;
let targetRoot: string;

beforeAll(async () => {
  db = await createTestDb();
  sourceRoot = await mkdtemp(join(tmpdir(), 'move-a-'));
  targetRoot = await mkdtemp(join(tmpdir(), 'move-b-'));
  const store = createMoveStore(db.pool);
  api = await buildApi({
    workerId: SOURCE,
    streams: ['q:light'],
    clientKeys: { n8n: 'z'.repeat(48) },
    nonces: createMemoryNonceStore(),
    activeJobs: () => 0,
    workRoot: sourceRoot,
    transferAllowed: (videoId, token) => store.tokenValid(SOURCE, videoId, token),
  });
  await api.listen({ host: '127.0.0.1', port: 0 });
  const { port } = api.server.address() as AddressInfo;
  await db.pool.query(
    `INSERT INTO approver (telegram_user_id, name, is_owner) VALUES ($1, 'owner', true)`,
    [OWNER],
  );
  await db.pool.query(
    `INSERT INTO worker (id, capabilities, last_seen_at, api_url) VALUES
       ($1, '{q:light}', now(), $3), ($2, '{q:light}', now(), 'http://127.0.0.1:1')`,
    [SOURCE, TARGET, `http://127.0.0.1:${port}`],
  );
});

afterAll(async () => {
  await api.close();
  await db.drop();
});

async function finishedStepOnSource(videoId: string, jobId: string): Promise<void> {
  const dir = join(sourceRoot, 'videos', videoId, 'v1', 'jobs', jobId);
  await mkdir(join(dir, 'episode'), { recursive: true });
  await writeFile(join(dir, 'script.md'), SCRIPT);
  await symlink('/Users/aivideo/aivideo/repo/node_modules', join(dir, 'episode', 'node_modules'));
  await writeFile(
    join(dir, 'checkpoint.json'),
    JSON.stringify({
      version: 1,
      completedAt: '2026-11-02T00:00:00Z',
      outputs: [
        {
          path: 'script.md',
          sha256: createHash('sha256').update(SCRIPT).digest('hex'),
          bytes: Buffer.byteLength(SCRIPT),
        },
      ],
      result: {},
    }),
  );
}

test('a video moves from A to B and its next job goes to B', async () => {
  const { videoId, versionId } = await createVideo(db.pool, await createBatch(db.pool), 1);
  await db.pool.query('UPDATE video SET worker_id = $2 WHERE id = $1', [videoId, SOURCE]);
  const done = await createJob(db.pool, versionId, 'script', { stream: 'q:light' });
  await finishedStepOnSource(videoId, done);
  const next = await createJob(db.pool, versionId, 'tts', { stream: 'q:move-it' });

  const requested = await db.pool.query<{ result: string }>(
    'SELECT result FROM telegram_move($1, $2, $3)',
    [OWNER, videoId.slice(0, 8), TARGET],
  );
  expect(requested.rows[0]!.result).toBe('REQUESTED');
  const nodeModules = '/home/aivideo/aivideo/repo/node_modules';
  const runner = createMoveRunner({
    store: createMoveStore(db.pool),
    workerId: TARGET,
    workRoot: targetRoot,
    nodeModules,
    logger: pino({ level: 'silent' }),
  });

  expect(await runner()).toBe(true);

  const pinned = await db.pool.query<{ worker_id: string }>(
    'SELECT worker_id FROM video WHERE id = $1',
    [videoId],
  );
  expect(pinned.rows[0]!.worker_id).toBe(TARGET);
  const copied = join(targetRoot, 'videos', videoId, 'v1', 'jobs', done);
  expect(await readValidCheckpoint(copied)).not.toBeNull();
  expect(await readlink(join(copied, 'episode', 'node_modules'))).toBe(nodeModules);
  // The source keeps its copy (CLAUDE.md §3: nothing is deleted).
  expect(
    await readFile(join(sourceRoot, 'videos', videoId, 'v1', 'jobs', done, 'script.md'), 'utf8'),
  ).toBe(SCRIPT);
  await db.pool.query('SELECT job_promote()');
  const dispatched = await db.pool.query<{ job_id: string; queue: string }>(
    `SELECT job_id, queue FROM dispatch_claim('q:move-it', 5)`,
  );
  expect(dispatched.rows).toEqual([{ job_id: next, queue: `q:move-it:w:${TARGET}` }]);
});
