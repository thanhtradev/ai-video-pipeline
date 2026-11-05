import { readFile } from 'node:fs/promises';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db.js';
import { createBatch, createVideo, setVersionStatus } from '../helpers/fixtures.js';

// Web console (D-103). A login link comes from the bot, in a private chat, and works once. Every
// web_* function takes the session token, not a user id, and is all the web role can call.

const GRANTS_SQL = new URL('../../../ops/postgres/grants.sql', import.meta.url);
const OWNER = 111;
const APPROVER = 222;
const STRANGER = 999;
// Not 28000: Postgres raises that for connection failures, which are no one's expired session.
const INVALID_SESSION = 'WB401';

let db: TestDb;

async function ensureRole(role: string): Promise<void> {
  await db.pool.query(`
    DO $$ BEGIN
      CREATE ROLE ${role} NOLOGIN;
    EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL;
    END $$;`);
}

beforeAll(async () => {
  db = await createTestDb();
  await ensureRole('aivideo_n8n');
  await ensureRole('aivideo_worker');
  await ensureRole('aivideo_web');
  await db.pool.query(await readFile(GRANTS_SQL, 'utf8'));
  await db.pool.query(
    `INSERT INTO approver (telegram_user_id, name, is_owner)
     VALUES ($1, 'owner', true), ($2, 'approver', false)`,
    [OWNER, APPROVER],
  );
});

afterAll(async () => {
  await db.drop();
});

async function asWeb<T>(work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE aivideo_web');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

interface LoginRow {
  result: string;
  token: string | null;
  expires_at: Date | null;
}

async function requestLogin(user: number, isPrivate = true): Promise<LoginRow> {
  const result = await db.pool.query<LoginRow>('SELECT * FROM telegram_web_login($1, $2)', [
    user,
    isPrivate,
  ]);
  return result.rows[0]!;
}

interface ConsumeRow {
  result: string;
  session: string | null;
  expires_at: Date | null;
}

async function consume(token: string): Promise<ConsumeRow> {
  return asWeb(async (client) => {
    const result = await client.query<ConsumeRow>('SELECT * FROM web_login_consume($1)', [token]);
    return result.rows[0]!;
  });
}

async function signIn(user: number): Promise<string> {
  const login = await requestLogin(user);
  const consumed = await consume(login.token!);
  return consumed.session!;
}

async function callWeb<T>(fn: string, ...args: unknown[]): Promise<T> {
  const placeholders = args.map((_, i) => `$${i + 1}`).join(', ');
  return asWeb(async (client) => {
    const result = await client.query<{ value: T }>(`SELECT ${fn}(${placeholders}) AS value`, args);
    return result.rows[0]!.value;
  });
}

async function video(topic = 'test'): Promise<{ videoId: string; versionId: string }> {
  const fixture = await createVideo(db.pool, await createBatch(db.pool, `web-${topic}`), 1);
  await db.pool.query(
    `UPDATE video_version SET brief = jsonb_set(brief, '{topic}', to_jsonb($2::text)) WHERE id = $1`,
    [fixture.versionId, topic],
  );
  return fixture;
}

async function requestApproval(versionId: string, type: string): Promise<string> {
  const result = await db.pool.query<{ token: string }>(
    `SELECT approval_request($1, $2, 'h1', interval '24 hours') AS token`,
    [versionId, type],
  );
  return result.rows[0]!.token;
}

describe('login link from the bot', () => {
  test('gives an approver a token in a private chat', async () => {
    const login = await requestLogin(APPROVER);

    expect(login.result).toBe('OK');
    expect(login.token).toMatch(/^[0-9a-f]{64}$/);
    expect(login.expires_at!.getTime()).toBeLessThanOrEqual(Date.now() + 5 * 60_000 + 1000);
  });

  test('never issues a token in a group, where anyone could open it', async () => {
    const login = await requestLogin(APPROVER, false);

    expect(login).toMatchObject({ result: 'NOT_PRIVATE', token: null });
  });

  test('refuses someone who is not an approver', async () => {
    const login = await requestLogin(STRANGER);

    expect(login).toMatchObject({ result: 'NOT_APPROVER', token: null });
  });

  test('stores only a hash of the token', async () => {
    const login = await requestLogin(APPROVER);

    const stored = await db.pool.query(`SELECT 1 FROM web_login WHERE token_hash = $1`, [
      login.token,
    ]);
    expect(stored.rowCount).toBe(0);
  });

  test('a newer link replaces an unused older one', async () => {
    const first = await requestLogin(APPROVER);
    const second = await requestLogin(APPROVER);

    expect((await consume(first.token!)).result).toBe('INVALID');
    expect((await consume(second.token!)).result).toBe('OK');
  });
});

describe('signing in with the link', () => {
  test('works once', async () => {
    const login = await requestLogin(OWNER);

    const first = await consume(login.token!);
    const second = await consume(login.token!);

    expect(first.result).toBe('OK');
    expect(first.session).toMatch(/^[0-9a-f]{64}$/);
    expect(second).toMatchObject({ result: 'INVALID', session: null });
  });

  test('refuses an expired link', async () => {
    const login = await requestLogin(OWNER);
    await db.pool.query(
      `UPDATE web_login SET expires_at = now() - interval '1 second'
       WHERE telegram_user_id = $1 AND used_at IS NULL`,
      [OWNER],
    );

    expect((await consume(login.token!)).result).toBe('INVALID');
  });

  test('refuses a link when the approver was revoked after asking for it', async () => {
    const user = 333;
    await db.pool.query(`INSERT INTO approver (telegram_user_id, name) VALUES ($1, 'temp')`, [
      user,
    ]);
    const login = await requestLogin(user);
    await db.pool.query(`UPDATE approver SET active = false WHERE telegram_user_id = $1`, [user]);

    expect((await consume(login.token!)).result).toBe('INVALID');
  });

  test('records the sign-in in the audit log', async () => {
    await signIn(APPROVER);

    const audit = await db.pool.query<{ actor: string; detail: { source: string } }>(
      `SELECT actor, detail FROM audit_log WHERE action = 'web_login' ORDER BY id DESC LIMIT 1`,
    );
    expect(audit.rows[0]).toMatchObject({
      actor: `telegram:${APPROVER}`,
      detail: { source: 'web' },
    });
  });
});

describe('sessions', () => {
  const expectUnauthorized = async (session: string): Promise<void> => {
    await expect(callWeb('web_me', session)).rejects.toMatchObject({ code: INVALID_SESSION });
  };

  test('web_me names the user and their role', async () => {
    expect(await callWeb('web_me', await signIn(OWNER))).toMatchObject({
      user_id: OWNER,
      name: 'owner',
      is_owner: true,
    });
    expect(await callWeb('web_me', await signIn(APPROVER))).toMatchObject({
      user_id: APPROVER,
      is_owner: false,
    });
  });

  test('an unknown session is refused', async () => {
    await expectUnauthorized('0'.repeat(64));
  });

  test('an expired session is refused', async () => {
    const session = await signIn(APPROVER);
    await db.pool.query(
      `UPDATE web_session SET expires_at = now() - interval '1 second' WHERE token_hash = web_token_hash($1)`,
      [session],
    );

    await expectUnauthorized(session);
  });

  test('a session lasts 12 hours', async () => {
    const consumed = await consume((await requestLogin(APPROVER)).token!);

    const hours = (consumed.expires_at!.getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(11.9);
    expect(hours).toBeLessThanOrEqual(12);
  });

  test('a revoked approver loses access at once', async () => {
    const user = 444;
    await db.pool.query(`INSERT INTO approver (telegram_user_id, name) VALUES ($1, 'temp')`, [
      user,
    ]);
    const session = await signIn(user);
    await callWeb('web_me', session);

    await db.pool.query(`UPDATE approver SET active = false WHERE telegram_user_id = $1`, [user]);

    await expectUnauthorized(session);
  });

  test('approving someone again does not bring their old sessions back', async () => {
    const user = 445;
    await db.pool.query(`INSERT INTO approver (telegram_user_id, name) VALUES ($1, 'temp')`, [
      user,
    ]);
    const session = await signIn(user);
    const unusedLink = await requestLogin(user);

    await db.pool.query(`UPDATE approver SET active = false WHERE telegram_user_id = $1`, [user]);
    await db.pool.query(`UPDATE approver SET active = true WHERE telegram_user_id = $1`, [user]);

    await expectUnauthorized(session);
    expect((await consume(unusedLink.token!)).result).toBe('INVALID');
  });

  test('revoking works as n8n, which cannot touch the session tables itself', async () => {
    const user = 446;
    await db.pool.query(`INSERT INTO approver (telegram_user_id, name) VALUES ($1, 'temp')`, [
      user,
    ]);
    const session = await signIn(user);
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE aivideo_n8n');
      await client.query(`UPDATE approver SET active = false WHERE telegram_user_id = $1`, [user]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    await db.pool.query(`UPDATE approver SET active = true WHERE telegram_user_id = $1`, [user]);

    await expectUnauthorized(session);
  });

  test('logging out ends the session', async () => {
    const session = await signIn(APPROVER);

    await callWeb('web_logout', session);

    await expectUnauthorized(session);
  });

  test('every read function refuses a bad session', async () => {
    const bad = '0'.repeat(64);
    const calls: [string, ...unknown[]][] = [
      ['web_attention', bad],
      ['web_videos', bad, 'all', '', 50, 0],
      ['web_video', bad, '00000000-0000-4000-8000-000000000000'],
      ['web_workers', bad],
      ['web_worker', bad, 'mac-mini-m4'],
      ['web_report', bad, 'today'],
      ['web_dashboard', bad, 'today'],
    ];
    for (const [fn, ...args] of calls) {
      await expect(callWeb(fn, ...args), fn).rejects.toMatchObject({ code: INVALID_SESSION });
    }
  });
});

describe('what the web role can reach', () => {
  test('cannot read tables', async () => {
    for (const table of ['video', 'approval', 'approver', 'web_session', 'web_login']) {
      await expect(
        asWeb((c) => c.query(`SELECT 1 FROM ${table}`)),
        table,
      ).rejects.toMatchObject({
        code: '42501',
      });
    }
  });

  test('cannot call telegram functions or issue itself a login', async () => {
    await expect(
      asWeb((c) => c.query('SELECT * FROM telegram_web_login($1, true)', [OWNER])),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      asWeb((c) => c.query('SELECT * FROM telegram_status($1)', [OWNER])),
    ).rejects.toMatchObject({ code: '42501' });
  });

  test('cannot resolve a session on its own', async () => {
    await expect(
      asWeb((c) => c.query('SELECT web_session_user($1)', ['0'.repeat(64)])),
    ).rejects.toMatchObject({ code: '42501' });
  });

  test('n8n can issue a login but cannot read the session tables', async () => {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE aivideo_n8n');
      const login = await client.query<LoginRow>('SELECT * FROM telegram_web_login($1, true)', [
        APPROVER,
      ]);
      expect(login.rows[0]!.result).toBe('OK');
      await expect(client.query('SELECT 1 FROM web_session')).rejects.toMatchObject({
        code: '42501',
      });
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});

interface AttentionItem {
  approval_id?: string;
  video_id: string;
  type?: string;
  status?: string;
}

interface Attention {
  approvals: AttentionItem[];
  stopped: AttentionItem[];
}

describe('web_attention', () => {
  test('lists open approvals and stopped videos', async () => {
    const session = await signIn(APPROVER);
    const waiting = await video('waiting');
    await requestApproval(waiting.versionId, 'SCRIPT');
    const stopped = await video('stopped');
    await setVersionStatus(db.pool, stopped.versionId, ['NEEDS_DECISION']);

    const attention = await callWeb<Attention>('web_attention', session);

    expect(attention.approvals.map((a) => a.video_id)).toContain(waiting.videoId);
    expect(attention.approvals.find((a) => a.video_id === waiting.videoId)).toMatchObject({
      type: 'SCRIPT',
      approval_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
    expect(attention.stopped.map((s) => s.video_id)).toContain(stopped.videoId);
  });

  test('changes nothing, unlike telegram_pending, which makes reminders due', async () => {
    const session = await signIn(APPROVER);
    const { versionId } = await video('no-side-effect');
    await requestApproval(versionId, 'SCRIPT');
    const stamp = `SELECT last_reminded_at FROM approval WHERE video_version_id = $1`;
    const before = (await db.pool.query(stamp, [versionId])).rows[0];

    await callWeb('web_attention', session);

    expect((await db.pool.query(stamp, [versionId])).rows[0]).toEqual(before);
  });

  test('shows the owner-only Mac cleanup to the owner only', async () => {
    const { videoId, versionId } = await video('cleanup');
    await requestApproval(versionId, 'CLEANUP');

    const asOwner = await callWeb<Attention>('web_attention', await signIn(OWNER));
    const asApprover = await callWeb<Attention>('web_attention', await signIn(APPROVER));

    expect(asOwner.approvals.map((a) => a.video_id)).toContain(videoId);
    expect(asApprover.approvals.map((a) => a.video_id)).not.toContain(videoId);
  });

  test('never hands out an approval token', async () => {
    const session = await signIn(APPROVER);
    const { versionId } = await video('token');
    const token = await requestApproval(versionId, 'SCRIPT');

    const attention = await callWeb<Attention>('web_attention', session);

    expect(JSON.stringify(attention)).not.toContain(token);
  });
});

interface VideoSummary {
  video_id: string;
  title: string;
  status: string;
  state_group: string;
  worker_id: string | null;
  approval_type: string | null;
}

interface VideoPage {
  items: VideoSummary[];
  total: number;
}

describe('web_videos', () => {
  test('finds more than the 20 videos telegram_status stops at, a page at a time', async () => {
    const session = await signIn(APPROVER);
    const batchId = await createBatch(db.pool, 'web-paging');
    for (let sequence = 1; sequence <= 22; sequence += 1) {
      await createVideo(db.pool, batchId, sequence);
    }

    const firstPage = await callWeb<VideoPage>('web_videos', session, 'all', '', 10, 0);
    const lastPage = await callWeb<VideoPage>('web_videos', session, 'all', '', 10, 20);

    expect(firstPage.total).toBeGreaterThanOrEqual(22);
    expect(firstPage.items).toHaveLength(10);
    expect(lastPage.items.length).toBeGreaterThan(0);
    expect(lastPage.items[0]!.video_id).not.toBe(firstPage.items[0]!.video_id);
  });

  test('filters by state', async () => {
    const session = await signIn(APPROVER);
    const stopped = await video('filter-stopped');
    await setVersionStatus(db.pool, stopped.versionId, ['NEEDS_DECISION']);
    const waiting = await video('filter-approval');
    await requestApproval(waiting.versionId, 'SCRIPT');

    const onlyStopped = await callWeb<VideoPage>('web_videos', session, 'stopped', '', 200, 0);
    const onlyApproval = await callWeb<VideoPage>('web_videos', session, 'approval', '', 200, 0);

    expect(onlyStopped.items.every((v) => v.state_group === 'STOPPED')).toBe(true);
    expect(onlyStopped.items.map((v) => v.video_id)).toContain(stopped.videoId);
    expect(onlyApproval.items.map((v) => v.video_id)).toContain(waiting.videoId);
    expect(onlyApproval.items.find((v) => v.video_id === waiting.videoId)?.approval_type).toBe(
      'SCRIPT',
    );
  });

  test('searches by id prefix and by title, treating % as a plain character', async () => {
    const session = await signIn(APPROVER);
    const target = await video('searchable-needle');

    const byId = await callWeb<VideoPage>(
      'web_videos',
      session,
      'all',
      target.videoId.slice(0, 13),
      10,
      0,
    );
    const byTitle = await callWeb<VideoPage>('web_videos', session, 'all', 'NEEDLE', 10, 0);
    const wildcard = await callWeb<VideoPage>('web_videos', session, 'all', '%', 10, 0);

    expect(byId.items.map((v) => v.video_id)).toEqual([target.videoId]);
    expect(byTitle.items.map((v) => v.video_id)).toEqual([target.videoId]);
    expect(wildcard.total).toBe(0);
  });

  test('refuses an unknown filter', async () => {
    const session = await signIn(APPROVER);

    await expect(callWeb('web_videos', session, 'nonsense', '', 10, 0)).rejects.toThrow(/filter/);
  });

  test('caps the page size', async () => {
    const session = await signIn(APPROVER);

    const page = await callWeb<VideoPage>('web_videos', session, 'all', '', 100_000, 0);

    expect(page.items.length).toBeLessThanOrEqual(200);
  });
});

describe('web_video', () => {
  test('shows a video with its open approval, without the token', async () => {
    const session = await signIn(APPROVER);
    const { videoId, versionId } = await video('detail');
    const token = await requestApproval(versionId, 'SCRIPT');

    const detail = await callWeb<{
      video_id: string;
      title: string;
      brief: { topic: string };
      approvals: { approval_id: string; type: string }[];
    }>('web_video', session, videoId);

    expect(detail).toMatchObject({
      video_id: videoId,
      title: 'detail',
      brief: { topic: 'detail' },
    });
    expect(detail.approvals[0]).toMatchObject({ type: 'SCRIPT' });
    expect(JSON.stringify(detail)).not.toContain(token);
  });

  test('is null for an unknown video', async () => {
    const session = await signIn(APPROVER);

    expect(await callWeb('web_video', session, '00000000-0000-4000-8000-000000000000')).toBeNull();
  });
});

describe('web_workers, web_worker and web_report', () => {
  test('return what the bot shows', async () => {
    const session = await signIn(APPROVER);
    await db.pool.query(
      `INSERT INTO worker (id, capabilities, last_seen_at) VALUES ('web-test-worker', '{q:light}', now())`,
    );

    const workers = await callWeb<{ worker_id: string; online: boolean }[]>('web_workers', session);
    const worker = await callWeb<{ worker_id: string; capabilities: string[] }>(
      'web_worker',
      session,
      'web-test-worker',
    );
    const report = await callWeb<{ period: string; active: number }>('web_report', session, '7d');

    expect(workers.find((w) => w.worker_id === 'web-test-worker')).toMatchObject({ online: true });
    expect(worker).toMatchObject({ worker_id: 'web-test-worker', capabilities: ['q:light'] });
    expect(report.period).toBe('7d');
    expect(report.active).toEqual(expect.any(Number));
  });

  test('web_worker is null for an unknown worker', async () => {
    const session = await signIn(APPROVER);

    expect(await callWeb('web_worker', session, 'no-such-worker')).toBeNull();
  });
});

// web_video_summary repeats how telegram_status picks a video's step and group. Rewriting that live
// function to share the code is not worth the risk, so this catches the two drifting apart.
describe('the page and the bot agree on a video', () => {
  const STATES: { name: string; jobs: string[]; version?: string; approval?: string }[] = [
    { name: 'nothing started', jobs: ['PENDING', 'PENDING'] },
    { name: 'running', jobs: ['SUCCEEDED', 'RUNNING', 'PENDING'] },
    { name: 'queued', jobs: ['SUCCEEDED', 'QUEUED'] },
    { name: 'failed before pending', jobs: ['PENDING', 'FAILED_RETRYABLE'] },
    { name: 'failed permanently', jobs: ['FAILED_PERMANENT', 'PENDING'] },
    { name: 'blocked', jobs: ['BLOCKED', 'READY'] },
    { name: 'waiting for approval', jobs: ['SUCCEEDED', 'PENDING'], approval: 'SCRIPT' },
    { name: 'stopped', jobs: ['FAILED_PERMANENT'], version: 'NEEDS_DECISION' },
  ];

  test.each(STATES)('$name', async ({ name, jobs, version, approval }) => {
    const session = await signIn(APPROVER);
    const fixture = await video(`agree ${name}`);
    await db.pool.query(
      `INSERT INTO worker (id, capabilities, last_seen_at)
       VALUES ('agree-worker', '{q:light}', now()) ON CONFLICT (id) DO NOTHING`,
    );
    await db.pool.query(`UPDATE video SET worker_id = 'agree-worker' WHERE id = $1`, [
      fixture.videoId,
    ]);
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL session_replication_role = replica');
      for (const [index, status] of jobs.entries()) {
        const step = `step${index}`;
        const created = await client.query<{ job_create: string }>(
          `SELECT job_create($1, $2, 'q:light', '{}'::jsonb, $3, '{}'::uuid[], 3)`,
          [fixture.versionId, step, `hash-${step}`],
        );
        await client.query(`UPDATE job SET status = $2 WHERE id = $1`, [
          created.rows[0]!.job_create,
          status,
        ]);
      }
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    if (version) await setVersionStatus(db.pool, fixture.versionId, [version]);
    if (approval) await requestApproval(fixture.versionId, approval);

    const bot = (
      await db.pool.query<{
        title: string;
        status: string;
        step: string | null;
        step_status: string | null;
        steps_done: number;
        steps_total: number;
        worker_id: string | null;
        worker_online: boolean | null;
        state_group: string;
      }>('SELECT * FROM telegram_status($1, $2)', [APPROVER, fixture.videoId])
    ).rows[0]!;
    const page = await callWeb<Record<string, unknown>>('web_video', session, fixture.videoId);

    expect(page).toMatchObject({
      title: bot.title,
      status: bot.status,
      step: bot.step,
      step_status: bot.step_status,
      steps_done: bot.steps_done,
      steps_total: bot.steps_total,
      worker_id: bot.worker_id,
      worker_online: bot.worker_online,
      state_group: bot.state_group,
    });
  });
});
