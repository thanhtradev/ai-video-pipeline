import { readFile } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../../worker/test/helpers/db.js';
import { prepareWebRoles, webSignIn } from '../../worker/test/helpers/web-console.js';
import { buildApp, SESSION_COOKIE } from '../server/app.js';
import { createPgStore } from '../server/store.js';

// GET /api/library against a real database, with the web role (D-104).

const GRANTS_SQL = new URL('../../ops/postgres/grants.sql', import.meta.url);
const USER = 222;

let db: TestDb;
let webPool: pg.Pool;
let app: FastifyInstance;
let cookie: string;

beforeAll(async () => {
  db = await createTestDb();
  await prepareWebRoles(db.pool, await readFile(GRANTS_SQL, 'utf8'));
  await db.pool.query(`INSERT INTO approver (telegram_user_id, name) VALUES ($1, 'a')`, [USER]);
  cookie = await webSignIn(db.pool, USER);
  const url = new URL(db.url);
  url.searchParams.set('options', '-c role=aivideo_web');
  webPool = new pg.Pool({ connectionString: url.toString(), max: 2 });
  app = await buildApp({ store: createPgStore(webPool), publicOrigin: 'https://console.test' });
});

afterAll(async () => {
  await app.close();
  await webPool.end();
  await db.drop();
});

const get = (url: string, session: string | null = cookie) =>
  app.inject({
    method: 'GET',
    url,
    cookies: session === null ? {} : { [SESSION_COOKIE]: session },
  });

describe('GET /api/library', () => {
  test('needs a session', async () => {
    expect((await get('/api/library', null)).statusCode).toBe(401);
  });

  test('answers in the envelope and is never cached', async () => {
    const response = await get('/api/library?group=character');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      success: true,
      data: { total: 0, groups: [], items: [] },
    });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  test.each([
    ['/api/library?group=year'],
    ['/api/library?limit=0'],
    ['/api/library?limit=501'],
    ['/api/library?limit=abc'],
    ['/api/library?offset=-1'],
    ['/api/library?offset=3000000000'],
    [`/api/library?search=${'x'.repeat(201)}`],
  ])('refuses bad input: %s', async (url) => {
    expect((await get(url)).statusCode).toBe(400);
  });
});
