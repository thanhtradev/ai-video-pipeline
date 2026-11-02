import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db.js';
import { decide, jobs, OWNER, STRANGER } from '../helpers/episode-flow.js';

// D-087: the /new draft can name the worker a video runs on (button or worker=<id>). The choice
// pins the video when it is created, so its first job already goes to that worker's own queue
// (D-074). "Tự động" (no choice) keeps today's behaviour: the first worker to start a job wins.

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
  await db.pool.query(`INSERT INTO approver (telegram_user_id, name) VALUES ($1, 'owner')`, [
    OWNER,
  ]);
  await addWorker('mac-mini-m4', '0 seconds');
  await addWorker('hp-400-g7', '0 seconds');
});

afterAll(async () => {
  await db.drop();
});

interface Choice {
  slug: string | null;
  label: string;
  next_slug: string | null;
  next_label: string;
}

interface DraftRow {
  result: string;
  token: string | null;
  selection: { worker: Choice } | null;
  error: string | null;
}

async function addWorker(id: string, seenAgo: string, apiUrl: string | null = 'http://w:8787') {
  await db.pool.query(
    `INSERT INTO worker (id, capabilities, last_seen_at, api_url)
     VALUES ($1, '{q:light}', now() - $2::interval, $3)
     ON CONFLICT (id) DO UPDATE
       SET last_seen_at = excluded.last_seen_at, api_url = excluded.api_url`,
    [id, seenAgo, apiUrl],
  );
}

async function draft(worker: string | null = null, user = OWNER): Promise<DraftRow> {
  const result = await db.pool.query<DraftRow>(
    'SELECT * FROM telegram_intake_draft($1, $2, $3::jsonb, $4)',
    [user, '-1001234567890', JSON.stringify({ topic: 'Mèo nghĩ gì?' }), worker],
  );
  return result.rows[0]!;
}

async function cycle(token: string, user = OWNER): Promise<DraftRow> {
  const result = await db.pool.query<DraftRow>(
    `SELECT * FROM telegram_intake_cycle($1, $2, 'worker')`,
    [token, user],
  );
  return result.rows[0]!;
}

async function create(token: string): Promise<{ videoId: string; versionId: string }> {
  const created = (await decide(db.pool, token, 'APPROVE')) as unknown as {
    result: string;
    video_id: string;
  };
  expect(created.result).toBe('OK');
  const version = await db.pool.query<{ id: string }>(
    'SELECT id FROM video_version WHERE video_id = $1',
    [created.video_id],
  );
  return { videoId: created.video_id, versionId: version.rows[0]!.id };
}

async function pinnedWorker(videoId: string): Promise<string | null> {
  const result = await db.pool.query<{ worker_id: string | null }>(
    'SELECT worker_id FROM video WHERE id = $1',
    [videoId],
  );
  return result.rows[0]!.worker_id;
}

describe('the draft', () => {
  test('defaults to Tự động and offers the first online worker next', async () => {
    const row = await draft();

    expect(row.result).toBe('DRAFT');
    expect(row.selection!.worker).toEqual({
      slug: null,
      label: 'Tự động',
      next_slug: 'hp-400-g7',
      next_label: 'hp-400-g7',
    });
  });

  test('takes worker=<id> of a known worker', async () => {
    const row = await draft('mac-mini-m4');

    expect(row.selection!.worker).toMatchObject({
      slug: 'mac-mini-m4',
      label: 'mac-mini-m4',
      next_slug: null,
      next_label: 'Tự động',
    });
  });

  test('refuses an unknown worker or one n8n cannot reach, never falls back', async () => {
    expect(await draft('raspberry')).toMatchObject({
      result: 'INVALID',
      error: 'unknown worker "raspberry"',
    });
    await addWorker('no-api', '0 seconds', null);
    expect(await draft('no-api')).toMatchObject({
      result: 'INVALID',
      error: 'unknown worker "no-api"',
    });
  });

  test('the worker button cycles Tự động → each worker → Tự động', async () => {
    const { token } = await draft();

    const first = await cycle(token!);
    const second = await cycle(token!);
    const third = await cycle(token!);

    expect(first.selection!.worker.slug).toBe('hp-400-g7');
    expect(second.selection!.worker.slug).toBe('mac-mini-m4');
    expect(third.selection!.worker.slug).toBeNull();
  });

  test('labels a worker without a recent heartbeat as offline and skips long-gone ones', async () => {
    await addWorker('old-mac', '3 days');
    await addWorker('sleepy', '10 minutes');

    const row = await draft('sleepy');

    expect(row.selection!.worker.label).toBe('sleepy (offline)');
    const seen: (string | null)[] = [];
    for (let i = 0; i < 5; i++) seen.push((await cycle(row.token!)).selection!.worker.slug);
    expect(seen).not.toContain('old-mac');
    expect(seen).toContain('sleepy');
    // Out of the way for the next tests.
    await db.pool.query(
      `UPDATE worker SET last_seen_at = now() - interval '3 days' WHERE id IN ('old-mac', 'sleepy')`,
    );
  });

  test('refuses strangers', async () => {
    expect((await draft('mac-mini-m4', STRANGER)).result).toBe('NOT_APPROVER');
    const { token } = await draft();
    expect((await cycle(token!, STRANGER)).result).toBe('NOT_APPROVER');
  });
});

describe('Create', () => {
  test('pins the video to the chosen worker; its first job goes to that worker queue', async () => {
    const { token } = await draft('hp-400-g7');

    const { videoId, versionId } = await create(token!);

    expect(await pinnedWorker(videoId)).toBe('hp-400-g7');
    const [script] = await jobs(db.pool, versionId);
    await db.pool.query('SELECT job_promote()');
    const claimed = await db.pool.query<{ job_id: string; queue: string }>(
      'SELECT job_id, queue FROM dispatch_claim($1, 50)',
      [script!.stream],
    );
    expect(claimed.rows).toContainEqual({
      job_id: script!.id,
      queue: `${script!.stream}:w:hp-400-g7`,
    });
  });

  test('Tự động leaves the video unpinned', async () => {
    const { token } = await draft();

    const { videoId } = await create(token!);

    expect(await pinnedWorker(videoId)).toBeNull();
  });
});
