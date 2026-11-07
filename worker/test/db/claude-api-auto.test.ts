import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db.js';
import { decide } from '../helpers/episode-flow.js';

// /new … api=on (D-119): an owner sets it on the draft; Tạo keeps it on the video. When one of the
// video's Claude steps is then blocked by the Max usage limit, the watchdog grants the job the
// step cap by itself (no button) and wakes it; the guard, the caps and the month limit of D-118
// still apply. Other videos keep the owner's button.

const OWNER = 111;
const APPROVER = 222;
const WORKER = 'mac-mini-m4';
const CHAT = '-1001234567890';
const LIMIT_REASON = 'claude-code usage limit: Claude AI usage limit reached|1761400800';

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
  await db.pool.query(
    `INSERT INTO approver (telegram_user_id, name, is_owner) VALUES ($1, 'owner', true), ($2, 'a', false)`,
    [OWNER, APPROVER],
  );
});

afterAll(async () => {
  await db.drop();
});

beforeEach(async () => {
  await db.pool.query(`UPDATE provider SET enabled = true WHERE id = 'anthropic-api'`);
  await db.pool.query(
    `UPDATE provider_model SET enabled = true WHERE provider_id = 'anthropic-api'`,
  );
  await db.pool.query(`DELETE FROM claude_api_step`);
  await db.pool.query(`INSERT INTO claude_api_step (step, cap_usd) VALUES ('script', 3)`);
  await db.pool.query(`UPDATE claude_api_spend SET created_at = now() - interval '62 days'`);
});

interface DraftRow {
  result: string;
  token: string;
  selection: { auto: boolean; api: boolean } | null;
}

let sequence = 0;

async function draft(api: boolean, user = OWNER): Promise<DraftRow> {
  sequence += 1;
  const result = await db.pool.query<DraftRow>(
    'SELECT * FROM telegram_intake_draft($1, $2, $3::jsonb, NULL, false, $4)',
    [user, CHAT, JSON.stringify({ topic: `Mèo nghĩ gì? ${sequence}` }), api],
  );
  return result.rows[0]!;
}

/** Tạo on a draft: the new video and its script job. */
async function created(token: string) {
  expect((await decide(db.pool, token, 'APPROVE')).result).toBe('OK');
  const result = await db.pool.query<{ video_id: string; auto_by: string | null; job_id: string }>(
    `SELECT v.id AS video_id, v.claude_api_auto_by AS auto_by, j.id AS job_id
     FROM intake_draft d JOIN video v ON v.id = d.video_id
     JOIN video_version vv ON vv.video_id = v.id AND vv.version = v.current_version
     JOIN job j ON j.video_version_id = vv.id AND j.step = 'script'
     WHERE d.token = $1`,
    [token],
  );
  return result.rows[0]!;
}

/** The video's script job, run on WORKER and blocked by the Max usage limit. */
async function blockedOnMax(jobId: string): Promise<void> {
  await db.pool.query('SELECT job_promote()');
  await db.pool.query(`UPDATE job SET status = 'QUEUED', queued_at = now() WHERE id = $1`, [jobId]);
  await db.pool.query('SELECT * FROM job_start($1, $2, 60)', [jobId, WORKER]);
  await db.pool.query('SELECT job_block($1, $2, $3, 3600)', [jobId, WORKER, LIMIT_REASON]);
}

interface Due {
  kind: string;
  token: string | null;
  job_id: string;
  cap_usd: string;
}

async function due(jobId: string): Promise<Due[]> {
  return (await db.pool.query<Due>('SELECT * FROM claude_api_offers_due()')).rows.filter(
    (row) => row.job_id === jobId,
  );
}

async function begin(jobId: string) {
  await db.pool.query('SELECT job_promote()');
  await db.pool.query(`UPDATE job SET status = 'QUEUED', queued_at = now() WHERE id = $1`, [jobId]);
  await db.pool.query('SELECT * FROM job_start($1, $2, 60)', [jobId, WORKER]);
  return (
    await db.pool.query<{ decision: string; max_usd: string }>(
      'SELECT * FROM claude_api_begin($1, $2)',
      [jobId, WORKER],
    )
  ).rows[0]!;
}

describe('/new api=on', () => {
  test('the draft shows it, and Tạo keeps it on the video in the owner name', async () => {
    const row = await draft(true);
    expect(row).toMatchObject({ result: 'DRAFT', selection: { api: true } });

    const video = await created(row.token);

    expect(video.auto_by).toBe(String(OWNER));
  });

  test('only an owner can set it, because it spends money', async () => {
    expect((await draft(true, APPROVER)).result).toBe('API_NOT_OWNER');
    expect((await draft(false, APPROVER)).result).toBe('DRAFT');
  });

  test('the buttons keep the choice', async () => {
    const row = await draft(true);
    const cycled = await db.pool.query<DraftRow>(
      `SELECT * FROM telegram_intake_cycle($1, $2, 'worker')`,
      [row.token, OWNER],
    );
    expect(cycled.rows[0]!.selection).toMatchObject({ api: true });
  });
});

describe('the watchdog with api=on', () => {
  test('a Max block is granted by itself: no button, the job wakes on the API', async () => {
    const video = await created((await draft(true)).token);
    await blockedOnMax(video.job_id);

    expect(await due(video.job_id)).toEqual([
      expect.objectContaining({ kind: 'AUTO', token: null, cap_usd: '3.00' }),
    ]);
    expect(await due(video.job_id)).toEqual([]);
    expect(await begin(video.job_id)).toMatchObject({ decision: 'ALLOW', max_usd: '3.0000' });
  });

  test('a video without it still gets the owner button', async () => {
    const video = await created((await draft(false)).token);
    await blockedOnMax(video.job_id);

    const rows = await due(video.job_id);

    expect(rows).toEqual([expect.objectContaining({ kind: 'OFFER' })]);
    expect(rows[0]!.token).toMatch(/^[0-9a-f]{32}$/);
  });

  test('nothing is granted for a step without a cap, or with the API off', async () => {
    await db.pool.query(`DELETE FROM claude_api_step`);
    const uncapped = await created((await draft(true)).token);
    await blockedOnMax(uncapped.job_id);
    expect(await due(uncapped.job_id)).toEqual([]);

    await db.pool.query(`INSERT INTO claude_api_step (step, cap_usd) VALUES ('script', 3)`);
    await db.pool.query(`UPDATE provider SET enabled = false WHERE id = 'anthropic-api'`);
    const off = await created((await draft(true)).token);
    await blockedOnMax(off.job_id);
    expect(await due(off.job_id)).toEqual([]);
  });

  test('a setter who is no longer an owner falls back to the button', async () => {
    const video = await created((await draft(true)).token);
    await db.pool.query(`UPDATE approver SET is_owner = false WHERE telegram_user_id = $1`, [
      OWNER,
    ]);
    try {
      await blockedOnMax(video.job_id);
      expect(await due(video.job_id)).toEqual([expect.objectContaining({ kind: 'OFFER' })]);
    } finally {
      await db.pool.query(`UPDATE approver SET is_owner = true WHERE telegram_user_id = $1`, [
        OWNER,
      ]);
    }
  });
});
