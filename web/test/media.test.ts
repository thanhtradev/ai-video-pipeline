import { readFile } from 'node:fs/promises';
import Fastify, { type FastifyInstance } from 'fastify';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../../worker/test/helpers/db.js';
import { createBatch, createVideo } from '../../worker/test/helpers/fixtures.js';
import { buildApp, SESSION_COOKIE } from '../server/app.js';
import { createPgStore } from '../server/store.js';

// The media proxy against a real database and a stand-in worker over HTTP.

const GRANTS_SQL = new URL('../../ops/postgres/grants.sql', import.meta.url);
const ORIGIN = 'https://console.test';
const OWNER = 111;
const TOKEN = 'a'.repeat(32);
const BOARD_TOKEN = 'b'.repeat(32);
const BYTES = Buffer.from('0123456789');

let db: TestDb;
let webPool: pg.Pool;
let app: FastifyInstance;
let worker: FastifyInstance;
let cookie: string;
let videoId: string;
let scriptJob: string;
let boardJob: string;
let workerRequests: { url: string; range: string | undefined }[];
let workerStatus: number;

async function ensureRole(role: string): Promise<void> {
  await db.pool.query(`
    DO $$ BEGIN
      CREATE ROLE ${role} NOLOGIN;
    EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL;
    END $$;`);
}

async function seedJob(versionId: string, step: string, output: unknown): Promise<string> {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL session_replication_role = replica');
    const created = await client.query<{ job_create: string }>(
      `SELECT job_create($1, $2, 'q:light', '{}'::jsonb, $3, '{}'::uuid[], 3)`,
      [versionId, step, `hash-${step}`],
    );
    const id = created.rows[0]!.job_create;
    await client.query(`UPDATE job SET status = 'SUCCEEDED', output = $2::jsonb WHERE id = $1`, [
      id,
      JSON.stringify(output),
    ]);
    await client.query('COMMIT');
    return id;
  } finally {
    client.release();
  }
}

beforeAll(async () => {
  worker = Fastify();
  worker.get('/*', async (request, reply) => {
    workerRequests.push({ url: request.url, range: request.headers.range });
    if (workerStatus !== 200) return reply.code(workerStatus).send({ error: 'token=secret' });
    if (request.headers.range) {
      return reply
        .code(206)
        .type('video/mp4')
        .header('content-range', `bytes 0-1/${BYTES.length}`)
        .header('content-length', '2')
        .send(BYTES.subarray(0, 2));
    }
    return reply.type('video/mp4').header('accept-ranges', 'bytes').send(BYTES);
  });
  const workerUrl = await worker.listen({ host: '127.0.0.1', port: 0 });

  db = await createTestDb();
  for (const role of ['aivideo_n8n', 'aivideo_worker', 'aivideo_web']) await ensureRole(role);
  await db.pool.query(await readFile(GRANTS_SQL, 'utf8'));
  await db.pool.query(`INSERT INTO approver (telegram_user_id, name) VALUES ($1, 'o')`, [OWNER]);
  await db.pool.query(
    `INSERT INTO worker (id, capabilities, last_seen_at, api_url)
     VALUES ('media-worker', '{q:light}', now(), $1)`,
    [workerUrl],
  );
  const fixture = await createVideo(db.pool, await createBatch(db.pool, 'media'), 1);
  videoId = fixture.videoId;
  await db.pool.query(`UPDATE video SET worker_id = 'media-worker' WHERE id = $1`, [videoId]);
  scriptJob = await seedJob(fixture.versionId, 'script', { result: { media_token: TOKEN } });
  boardJob = await seedJob(fixture.versionId, 'episode_code', {
    outputs: [{ path: 'mix.m4a' }],
    result: {
      board_token: BOARD_TOKEN,
      board_pages: ['boards/page-01.jpg'],
      media_token: TOKEN,
    },
  });

  const url = new URL(db.url);
  url.searchParams.set('options', '-c role=aivideo_web');
  webPool = new pg.Pool({ connectionString: url.toString(), max: 3 });
  app = await buildApp({ store: createPgStore(webPool), publicOrigin: ORIGIN });
  const login = await db.pool.query<{ token: string }>(
    'SELECT token FROM telegram_web_login($1, true)',
    [OWNER],
  );
  const session = await db.pool.query<{ session: string }>(
    'SELECT session FROM web_login_consume($1)',
    [login.rows[0]!.token],
  );
  cookie = session.rows[0]!.session;
});

beforeEach(() => {
  workerRequests = [];
  workerStatus = 200;
});

afterAll(async () => {
  await app.close();
  await webPool.end();
  await db.drop();
  await worker.close();
});

function get(url: string, headers: Record<string, string> = {}, session: string | null = cookie) {
  return app.inject({
    method: 'GET',
    url,
    headers,
    cookies: session === null ? {} : { [SESSION_COOKIE]: session },
  });
}

describe('the media list', () => {
  test('names the files and carries no token or worker address', async () => {
    const response = await get(`/api/videos/${videoId}/media`);

    expect(response.statusCode).toBe(200);
    expect(response.json().data.files.map((f: { file: string }) => f.file)).toEqual(
      expect.arrayContaining(['script.md', 'mix.m4a', 'page-01.jpg']),
    );
    expect(response.body).not.toContain(TOKEN);
    expect(response.body).not.toContain(BOARD_TOKEN);
    expect(response.body).not.toContain('127.0.0.1');
  });

  test('needs a session', async () => {
    expect((await get(`/api/videos/${videoId}/media`, {}, null)).statusCode).toBe(401);
  });

  test('is a 404 for an unknown video', async () => {
    const missing = '/api/videos/00000000-0000-4000-8000-000000000000/media';
    expect((await get(missing)).statusCode).toBe(404);
  });
});

describe('fetching a file', () => {
  test('asks the video worker with the token from the database', async () => {
    const response = await get(`/api/videos/${videoId}/media/script.md`);

    expect(response.statusCode).toBe(200);
    expect(response.rawPayload).toEqual(BYTES);
    expect(workerRequests[0]!.url).toBe(`/media/${videoId}/1/${scriptJob}/script.md?t=${TOKEN}`);
    expect(response.body).not.toContain(TOKEN);
  });

  test('asks /boards for a storyboard page, with the board token', async () => {
    await get(`/api/videos/${videoId}/media/page-01.jpg`);

    expect(workerRequests[0]!.url).toBe(
      `/boards/${videoId}/1/${boardJob}/page-01.jpg?t=${BOARD_TOKEN}`,
    );
  });

  test('passes a range on and the partial answer back, so a browser can seek', async () => {
    const response = await get(`/api/videos/${videoId}/media/script.md`, { range: 'bytes=0-1' });

    expect(workerRequests[0]!.range).toBe('bytes=0-1');
    expect(response.statusCode).toBe(206);
    expect(response.headers['content-range']).toBe(`bytes 0-1/${BYTES.length}`);
    expect(response.rawPayload).toEqual(BYTES.subarray(0, 2));
  });

  test('needs a session, and then never asks the worker', async () => {
    const response = await get(`/api/videos/${videoId}/media/script.md`, {}, null);

    expect(response.statusCode).toBe(401);
    expect(workerRequests).toEqual([]);
  });

  test.each([['final.mp4'], ['checkpoint.json'], ['..%2F..%2Fsecret']])(
    'is a 404 for %s, a file this video does not list, without asking the worker',
    async (file) => {
      const response = await get(`/api/videos/${videoId}/media/${file}`);

      expect(response.statusCode).toBe(404);
      expect(workerRequests).toEqual([]);
    },
  );

  test('a worker error does not leak what the worker said', async () => {
    workerStatus = 500;

    const response = await get(`/api/videos/${videoId}/media/script.md`);

    expect(response.statusCode).toBe(502);
    expect(response.body).not.toContain('secret');
  });

  test('ignores the revision the page adds to reload a rewritten file', async () => {
    const response = await get(`/api/videos/${videoId}/media/script.md?v=${scriptJob}`);

    expect(response.statusCode).toBe(200);
    expect(workerRequests[0]!.url).toBe(`/media/${videoId}/1/${scriptJob}/script.md?t=${TOKEN}`);
  });

  test('a file the worker no longer has is a 404', async () => {
    workerStatus = 404;

    expect((await get(`/api/videos/${videoId}/media/script.md`)).statusCode).toBe(404);
  });

  test('a worker that cannot be reached is a 502 with a plain message', async () => {
    await db.pool.query(
      `UPDATE worker SET api_url = 'http://127.0.0.1:9' WHERE id = 'media-worker'`,
    );
    try {
      const response = await get(`/api/videos/${videoId}/media/script.md`);

      expect(response.statusCode).toBe(502);
      expect(response.json()).toMatchObject({ success: false });
      expect(response.body).not.toContain('127.0.0.1');
    } finally {
      const address = worker.server.address() as { port: number };
      await db.pool.query(`UPDATE worker SET api_url = $1 WHERE id = 'media-worker'`, [
        `http://127.0.0.1:${address.port}`,
      ]);
    }
  });
});

describe('actions', () => {
  const post = (url: string, payload: unknown, origin = ORIGIN) =>
    app.inject({
      method: 'POST',
      url,
      headers: { origin },
      cookies: { [SESSION_COOKIE]: cookie },
      payload: payload as object,
    });

  test('refuse another origin before doing anything', async () => {
    const response = await post(
      `/api/videos/${videoId}/auto`,
      { enable: true },
      'https://evil.test',
    );

    expect(response.statusCode).toBe(403);
  });

  test.each([
    ['/api/videos/not-a-uuid/retry', {}],
    [`/api/videos/ID/auto`, { enable: 'yes' }],
    ['/api/approvals/not-a-uuid/decide', { action: 'APPROVE' }],
    ['/api/approvals/00000000-0000-4000-8000-000000000000/decide', { action: 'DELETE_ALL' }],
    ['/api/approvals/00000000-0000-4000-8000-000000000000/decide', { action: 'FEEDBACK' }],
    [
      '/api/approvals/00000000-0000-4000-8000-000000000000/decide',
      { action: 'FEEDBACK', note: '  ' },
    ],
    ['/api/cancel/not-a-token', { confirm: true }],
  ])('refuse bad input: %s %j', async (url, payload) => {
    const response = await post(url.replace('ID', videoId), payload);

    expect(response.statusCode).toBe(400);
  });

  test('answer with the result code, also when it is a refusal', async () => {
    const retry = await post(`/api/videos/${videoId}/retry`, {});
    const decide = await post('/api/approvals/00000000-0000-4000-8000-000000000000/decide', {
      action: 'APPROVE',
    });

    expect(retry.statusCode).toBe(200);
    expect(retry.json().data.result).toBe('NOT_STOPPED');
    expect(decide.json().data.result).toBe('NOT_FOUND');
  });

  test.each([
    [{ auto: false }],
    [{ topic: 'Chủ đề', auto: 'yes' }],
    [{ topic: 'Chủ đề', auto: false, duration_minutes: 2.5 }],
    [{ topic: 'Chủ đề', auto: false, kit: 'BAD KIT' }],
    [{ topic: 'Chủ đề', auto: false, worker: 'x; DROP' }],
    [{ topic: 'Chủ đề', auto: false, full_brief: 'not from this form' }],
  ])('a new video refuses bad input: %j', async (payload) => {
    expect((await post('/api/videos/draft', payload)).statusCode).toBe(400);
  });

  test('a new video is a draft, then one video, however often it is confirmed', async () => {
    const draft = await post('/api/videos/draft', {
      topic: 'Một chủ đề đủ dài',
      notes: 'Ghi chú',
      duration_minutes: 6,
      auto: false,
    });
    const { token } = draft.json().data;

    const first = await post(`/api/videos/draft/${token}`, { confirm: true });
    const second = await post(`/api/videos/draft/${token}`, { confirm: true });

    expect(first.json().data.result).toBe('OK');
    expect(second.json().data).toMatchObject({
      result: 'NOT_PENDING',
      video_id: first.json().data.video_id,
    });
  });

  test('a bad topic comes back as a reason, not an error page', async () => {
    const response = await post('/api/videos/draft', { topic: 'x', auto: false });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.result).toBe('INVALID');
    expect(response.json().data.error).toBeTruthy();
  });

  test('a note is limited in length', async () => {
    const response = await post('/api/approvals/00000000-0000-4000-8000-000000000000/decide', {
      action: 'FEEDBACK',
      note: 'x'.repeat(5000),
    });

    expect(response.statusCode).toBe(400);
  });
});
