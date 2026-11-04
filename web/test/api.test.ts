import { readFile } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../../worker/test/helpers/db.js';
import { createBatch, createVideo } from '../../worker/test/helpers/fixtures.js';
import { buildApp, SESSION_COOKIE } from '../server/app.js';
import { createPgStore } from '../server/store.js';

// The service against a real database, connected with the web role, so what the role may not do
// fails here as it would in production. Local docker-compose.test.yml only.

const GRANTS_SQL = new URL('../../ops/postgres/grants.sql', import.meta.url);
const ORIGIN = 'https://console.test';
const USER = 222;
const FULL_TOKEN = /^[0-9a-f]{64}$/;

let db: TestDb;
let webPool: pg.Pool;
let app: FastifyInstance;

async function ensureRole(role: string): Promise<void> {
  await db.pool.query(`
    DO $$ BEGIN
      CREATE ROLE ${role} NOLOGIN;
    EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL;
    END $$;`);
}

beforeAll(async () => {
  db = await createTestDb();
  for (const role of ['aivideo_n8n', 'aivideo_worker', 'aivideo_web']) await ensureRole(role);
  await db.pool.query(await readFile(GRANTS_SQL, 'utf8'));
  await db.pool.query(`INSERT INTO approver (telegram_user_id, name) VALUES ($1, 'approver')`, [
    USER,
  ]);
  const url = new URL(db.url);
  url.searchParams.set('options', '-c role=aivideo_web');
  webPool = new pg.Pool({ connectionString: url.toString(), max: 3 });
  // These tests sign in far more often than a person does; the limit has its own test below.
  app = await buildApp({
    store: createPgStore(webPool),
    publicOrigin: ORIGIN,
    loginPerMinute: 10_000,
  });
});

afterAll(async () => {
  await app.close();
  await webPool.end();
  await db.drop();
});

async function loginToken(): Promise<string> {
  const result = await db.pool.query<{ token: string }>(
    'SELECT token FROM telegram_web_login($1, true)',
    [USER],
  );
  return result.rows[0]!.token;
}

function login(token: string, origin: string | null = ORIGIN) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: origin === null ? {} : { origin },
    payload: { token },
  });
}

async function session(): Promise<string> {
  const response = await login(await loginToken());
  const cookie = response.cookies.find((c) => c.name === SESSION_COOKIE);
  return cookie!.value;
}

function get(url: string, cookie?: string) {
  return app.inject({
    method: 'GET',
    url,
    cookies: cookie === undefined ? {} : { [SESSION_COOKIE]: cookie },
  });
}

describe('signing in', () => {
  test('sets a cookie scripts cannot read and never returns the token in the body', async () => {
    const response = await login(await loginToken());

    expect(response.statusCode).toBe(200);
    const cookie = response.cookies.find((c) => c.name === SESSION_COOKIE)!;
    expect(cookie).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
      path: '/',
    });
    expect(cookie.value).toMatch(FULL_TOKEN);
    expect(response.body).not.toContain(cookie.value);
  });

  test('a link works once', async () => {
    const token = await loginToken();

    await login(token);
    const second = await login(token);

    expect(second.statusCode).toBe(401);
    expect(second.json()).toMatchObject({ success: false });
  });

  test('a failed sign-in leaves an existing session alone', async () => {
    const cookie = await session();

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin: ORIGIN },
      cookies: { [SESSION_COOKIE]: cookie },
      payload: { token: '0'.repeat(64) },
    });

    expect(response.statusCode).toBe(401);
    expect(response.cookies.find((c) => c.name === SESSION_COOKIE)).toBeUndefined();
    expect((await get('/api/me', cookie)).statusCode).toBe(200);
  });

  test('signing in again ends the session it replaces', async () => {
    const old = await session();

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin: ORIGIN },
      cookies: { [SESSION_COOKIE]: old },
      payload: { token: await loginToken() },
    });

    expect(response.statusCode).toBe(200);
    expect((await get('/api/me', old)).statusCode).toBe(401);
  });

  test('refuses a malformed token without asking the database', async () => {
    expect((await login('not-a-token')).statusCode).toBe(400);
  });

  test.each([
    ['from another site', 'https://evil.test'],
    ['with no Origin header', null],
  ])('refuses a sign-in %s', async (_name, origin) => {
    const response = await login(await loginToken(), origin);

    expect(response.statusCode).toBe(403);
  });

  test('limits how often sign-in can be tried', async () => {
    const limited = await buildApp({
      store: createPgStore(webPool),
      publicOrigin: ORIGIN,
      loginPerMinute: 2,
    });
    const attempt = () =>
      limited.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: { origin: ORIGIN },
        payload: { token: '0'.repeat(64) },
      });

    await attempt();
    await attempt();
    const third = await attempt();
    await limited.close();

    expect(third.statusCode).toBe(429);
    expect(third.json()).toMatchObject({ success: false });
  });
});

describe('signing out', () => {
  test('ends the session and clears the cookie', async () => {
    const cookie = await session();

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { origin: ORIGIN },
      cookies: { [SESSION_COOKIE]: cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.cookies.find((c) => c.name === SESSION_COOKIE)?.value).toBe('');
    expect((await get('/api/me', cookie)).statusCode).toBe(401);
  });
});

describe('reads', () => {
  const ROUTES = [
    '/api/me',
    '/api/attention',
    '/api/videos',
    '/api/videos/00000000-0000-4000-8000-000000000000',
    '/api/workers',
    '/api/workers/mac-mini-m4',
    '/api/report',
  ];

  test.each(ROUTES)('%s needs a session', async (url) => {
    const response = await get(url);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ success: false });
  });

  test.each(ROUTES)('%s refuses a session that does not exist', async (url) => {
    expect((await get(url, '0'.repeat(64))).statusCode).toBe(401);
  });

  test('a revoked approver gets a 401 and the cookie is cleared', async () => {
    const user = 333;
    await db.pool.query(`INSERT INTO approver (telegram_user_id, name) VALUES ($1, 'temp')`, [
      user,
    ]);
    const { rows } = await db.pool.query<{ token: string }>(
      'SELECT token FROM telegram_web_login($1, true)',
      [user],
    );
    const signedIn = await login(rows[0]!.token);
    const cookie = signedIn.cookies.find((c) => c.name === SESSION_COOKIE)!.value;
    await db.pool.query(`UPDATE approver SET active = false WHERE telegram_user_id = $1`, [user]);

    const response = await get('/api/me', cookie);

    expect(response.statusCode).toBe(401);
    expect(response.cookies.find((c) => c.name === SESSION_COOKIE)?.value).toBe('');
  });

  test('answers in the envelope and is never cached', async () => {
    const response = await get('/api/me', await session());

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      success: true,
      data: { user_id: USER, name: 'approver', is_owner: false },
    });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  test('lists and shows videos, with the step strip', async () => {
    const cookie = await session();
    const { videoId, versionId } = await createVideo(
      db.pool,
      await createBatch(db.pool, 'web-api'),
      1,
    );
    await db.pool.query(`SELECT approval_request($1, 'SCRIPT', 'h1', interval '24 hours')`, [
      versionId,
    ]);

    const list = await get('/api/videos?state=approval&limit=10', cookie);
    const detail = await get(`/api/videos/${videoId}`, cookie);

    expect(list.statusCode).toBe(200);
    expect(list.json().data.items.map((v: { video_id: string }) => v.video_id)).toContain(videoId);
    expect(detail.json().data).toMatchObject({
      video_id: videoId,
      state_group: 'APPROVAL',
      strip: [],
    });
  });

  test.each([
    ['/api/videos?state=nonsense'],
    ['/api/videos?limit=0'],
    ['/api/videos?limit=abc'],
    ['/api/videos?offset=-1'],
    ['/api/videos/not-a-uuid'],
    ['/api/workers/bad%20worker'],
    ['/api/report?period=year'],
  ])('refuses bad input: %s', async (url) => {
    expect((await get(url, await session())).statusCode).toBe(400);
  });

  test.each([
    ['/api/videos/00000000-0000-4000-8000-000000000000'],
    ['/api/workers/no-such-worker'],
  ])('%s is a 404 when it does not exist', async (url) => {
    const response = await get(url, await session());

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ success: false });
  });

  test('an unknown API path is a JSON 404, not the page', async () => {
    const response = await get('/api/nope', await session());

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ success: false });
  });

  test('a database failure reports no detail to the browser', async () => {
    const broken = await buildApp({
      store: {
        ...createPgStore(webPool),
        me: () => Promise.reject(new Error('connection to 192.168.1.102 refused')),
      },
      publicOrigin: ORIGIN,
    });

    const response = await broken.inject({
      method: 'GET',
      url: '/api/me',
      cookies: { [SESSION_COOKIE]: '0'.repeat(64) },
    });
    await broken.close();

    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('192.168');
  });
});

test('a database refusing the connection is an outage, not a signed-out user', async () => {
  const refused = Object.assign(new Error('no pg_hba.conf entry'), { code: '28000' });
  const broken = await buildApp({
    store: createPgStore({ query: () => Promise.reject(refused) } as unknown as pg.Pool),
    publicOrigin: ORIGIN,
  });

  const response = await broken.inject({
    method: 'GET',
    url: '/api/me',
    cookies: { [SESSION_COOKIE]: '0'.repeat(64) },
  });
  await broken.close();

  expect(response.statusCode).toBe(500);
  expect(response.cookies.find((c) => c.name === SESSION_COOKIE)).toBeUndefined();
});

test('the rate limit trusts only the last proxy, so a client cannot forge a new address', async () => {
  const limited = await buildApp({
    store: createPgStore(webPool),
    publicOrigin: ORIGIN,
    loginPerMinute: 1,
  });
  const attempt = (forged: string) =>
    limited.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin: ORIGIN, 'x-forwarded-for': `${forged}, 100.64.0.9` },
      payload: { token: '0'.repeat(64) },
    });

  await attempt('1.1.1.1');
  const second = await attempt('2.2.2.2');
  await limited.close();

  expect(second.statusCode).toBe(429);
});

test('/health needs no session, for Uptime Kuma', async () => {
  const response = await get('/health');

  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({ status: 'ok' });
});

test('every response carries a strict content security policy', async () => {
  const response = await get('/health');

  expect(response.headers['content-security-policy']).toContain("default-src 'self'");
  expect(response.headers['content-security-policy']).not.toContain('unsafe-inline');
  expect(response.headers['referrer-policy']).toBe('no-referrer');
});
