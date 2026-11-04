import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db.js';
import { callAsWeb, prepareWebRoles, webSignIn } from '../helpers/web-console.js';

// Creating a video from the web console (D-103): a draft, then a confirmation, as /new does on
// Telegram, so a double press or a retry after a dropped connection makes one video.

const GRANTS_SQL = new URL('../../../ops/postgres/grants.sql', import.meta.url);
const OWNER = 111;
const APPROVER = 222;
const NO_TOKEN = '0'.repeat(32);

let db: TestDb;
let ownerSession: string;
let approverSession: string;

const callWeb = <T>(fn: string, ...args: unknown[]): Promise<T> =>
  callAsWeb<T>(db.pool, fn, ...args);
const signIn = (user: number): Promise<string> => webSignIn(db.pool, user);

beforeAll(async () => {
  db = await createTestDb();
  await prepareWebRoles(db.pool, await readFile(GRANTS_SQL, 'utf8'));
  await db.pool.query(
    `INSERT INTO approver (telegram_user_id, name, is_owner)
     VALUES ($1, 'owner', true), ($2, 'approver', false)`,
    [OWNER, APPROVER],
  );
  await db.pool.query(
    `INSERT INTO worker (id, capabilities, last_seen_at, api_url)
     VALUES ('mac-mini-m4', '{q:render}', now(), 'http://100.64.0.1:8787'),
            ('gone-worker', '{q:render}', now() - interval '3 days', 'http://100.64.0.2:8787')`,
  );
  ownerSession = await signIn(OWNER);
  approverSession = await signIn(APPROVER);
});

afterAll(async () => {
  await db.drop();
});

interface Draft {
  result: string;
  token: string | null;
  error: string | null;
  brief: Record<string, unknown> | null;
}

interface Created {
  result: string;
  video_id: string | null;
}

const draft = (brief: object, worker: string | null = null, auto = false, session?: string) =>
  callWeb<Draft>(
    'web_create_draft',
    session ?? approverSession,
    JSON.stringify(brief),
    worker,
    auto,
  );

const decide = (token: string, confirm = true, session?: string) =>
  callWeb<Created>('web_create_decide', session ?? approverSession, token, confirm);

const videoCount = async (): Promise<number> =>
  (await db.pool.query<{ n: number }>('SELECT count(*)::integer AS n FROM video')).rows[0]!.n;

test.each([
  ['web_catalog', 'x'],
  ['web_create_draft', 'x', '{}', null, false],
  ['web_create_decide', 'x', NO_TOKEN, true],
])('%s refuses a bad session', async (fn, ...args) => {
  await expect(callWeb(fn, ...args)).rejects.toMatchObject({ code: 'WB401' });
});

describe('web_catalog', () => {
  test('offers enabled kits and casts with their language, and recent workers', async () => {
    const catalog = await callWeb<{
      kits: { slug: string; language: string; is_default: boolean }[];
      characters: { slug: string; language: string }[];
      workers: { id: string; online: boolean }[];
      minutes: number[];
    }>('web_catalog', approverSession);

    expect(catalog.kits.find((kit) => kit.slug === 'whatif')).toMatchObject({
      language: 'vi',
      is_default: true,
    });
    expect(catalog.kits.find((kit) => kit.slug === 'whatif-en')?.language).toBe('en');
    expect(catalog.characters.find((c) => c.slug === 'chip')?.language).toBe('vi');
    expect(catalog.workers).toEqual([{ id: 'mac-mini-m4', online: true }]);
    expect(catalog.minutes).toContain(6);
  });
});

test('offers the same lengths as the Telegram button, whose list is its own', async () => {
  const catalog = await callWeb<{ minutes: number[] }>('web_catalog', approverSession);
  const cycle: number[] = [];
  let next = (
    await db.pool.query<{ value: { next_minutes: number | null } }>(
      `SELECT duration_selection('{}'::jsonb) AS value`,
    )
  ).rows[0]!.value.next_minutes;
  while (next !== null) {
    cycle.push(next);
    const answer = await db.pool.query<{ value: { next_minutes: number | null } }>(
      `SELECT duration_selection($1::jsonb) AS value`,
      [JSON.stringify({ duration_minutes: next })],
    );
    next = answer.rows[0]!.value.next_minutes;
  }

  expect(catalog.minutes).toEqual(cycle);
});

describe('a draft', () => {
  test('creates no video until it is confirmed', async () => {
    const before = await videoCount();

    const made = await draft({ topic: 'Nếu Trái Đất ngừng quay', duration_minutes: 6 });

    expect(made.result).toBe('DRAFT');
    expect(made.token).toMatch(/^[0-9a-f]{32}$/);
    expect(made.brief).toMatchObject({ topic: 'Nếu Trái Đất ngừng quay', duration_minutes: 6 });
    expect(await videoCount()).toBe(before);
  });

  test.each([
    ['too short a topic', { topic: 'x' }],
    ['too long a video', { topic: 'Một chủ đề đủ dài', duration_minutes: 13 }],
    ['a kit that does not exist', { topic: 'Một chủ đề đủ dài', kit: 'nope' }],
  ])('refuses %s, saying why', async (_name, brief) => {
    const made = await draft(brief);

    expect(made.result).toBe('INVALID');
    expect(made.error).toBeTruthy();
    expect(made.token).toBeNull();
  });

  test("swaps a cast in another language for the kit's own, as /new does (D-092)", async () => {
    const made = await draft({
      topic: 'A long enough topic',
      kit: 'whatif-en',
      character_set: 'chip',
    });

    expect(made.result).toBe('DRAFT');
    expect(made.brief).toMatchObject({ kit: 'whatif-en', character_set: 'chip-en' });
  });

  test('refuses an unknown worker', async () => {
    const made = await draft({ topic: 'Một chủ đề đủ dài' }, 'no-such-worker');

    expect(made.result).toBe('INVALID');
  });
});

describe('confirming a draft', () => {
  test('creates the video, pinned as asked, with automatic approval as asked', async () => {
    const made = await draft({ topic: 'Một chủ đề đủ dài' }, 'mac-mini-m4', true);

    const created = await decide(made.token!);

    expect(created.result).toBe('OK');
    const row = await db.pool.query<{ worker_id: string; auto_approve_by: string; topic: string }>(
      `SELECT v.worker_id, vv.auto_approve_by, vv.brief->>'topic' AS topic
       FROM video v JOIN video_version vv ON vv.video_id = v.id WHERE v.id = $1`,
      [created.video_id],
    );
    expect(row.rows[0]).toMatchObject({
      worker_id: 'mac-mini-m4',
      auto_approve_by: String(APPROVER),
      topic: 'Một chủ đề đủ dài',
    });
  });

  test('twice makes one video, and the second answer names it', async () => {
    const made = await draft({ topic: 'Bấm hai lần liền' });
    const before = await videoCount();

    const first = await decide(made.token!);
    const second = await decide(made.token!);

    expect(first.result).toBe('OK');
    expect(second).toMatchObject({ result: 'NOT_PENDING', video_id: first.video_id });
    expect(await videoCount()).toBe(before + 1);
  });

  test('declining creates nothing', async () => {
    const made = await draft({ topic: 'Đổi ý rồi' });
    const before = await videoCount();

    const declined = await decide(made.token!, false);

    expect(declined.result).toBe('OK');
    expect(declined.video_id).toBeNull();
    expect(await videoCount()).toBe(before);
  });

  test("cannot use someone else's draft", async () => {
    const made = await draft({ topic: 'Của người khác' }, null, false, ownerSession);

    const result = await decide(made.token!);

    expect(result.result).toBe('NOT_FOUND');
  });

  test('records the person and that it came from the web', async () => {
    const made = await draft({ topic: 'Ghi lại nguồn' }, 'mac-mini-m4', true);

    const created = await decide(made.token!);

    const audit = await db.pool.query<{ actor: string; detail: Record<string, unknown> }>(
      `SELECT actor, detail FROM audit_log WHERE action = 'web_create' AND object_id = $1`,
      [created.video_id],
    );
    expect(audit.rows[0]).toMatchObject({
      actor: `telegram:${APPROVER}`,
      detail: { source: 'web', auto: true, worker_id: 'mac-mini-m4' },
    });
  });

  test('a brief that no longer passes says why and can be left behind', async () => {
    const made = await draft({ topic: 'Kit vừa bị tắt', kit: 'science' });
    await db.pool.query(`UPDATE catalog_option SET enabled = false WHERE slug = 'science'`);
    try {
      const result = await callWeb<{ result: string; error: string }>(
        'web_create_decide',
        approverSession,
        made.token!,
        true,
      );

      expect(result.result).toBe('INVALID');
      expect(result.error).toContain('invalid brief');
    } finally {
      await db.pool.query(`UPDATE catalog_option SET enabled = true WHERE slug = 'science'`);
    }
  });

  test('is not found for an unknown token', async () => {
    expect((await decide(NO_TOKEN)).result).toBe('NOT_FOUND');
  });
});
