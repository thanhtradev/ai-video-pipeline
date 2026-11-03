import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db.js';
import { decide, OWNER } from '../helpers/episode-flow.js';

// /new … auto=on (D-096): the draft remembers it, shows it, keeps it through the buttons, and Tạo
// turns /auto (D-093) on for the new video in the name of the approver who pressed Tạo.

const CHAT = '-1001234567890';
let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
  await db.pool.query(`INSERT INTO approver (telegram_user_id, name) VALUES ($1, 'owner')`, [
    OWNER,
  ]);
});

afterAll(async () => {
  await db.drop();
});

interface DraftRow {
  result: string;
  token: string;
  selection: { auto: boolean };
}

async function draft(auto?: boolean): Promise<DraftRow> {
  const args = [OWNER, CHAT, JSON.stringify({ topic: 'Mèo nghĩ gì?' }), null];
  const sql =
    auto === undefined
      ? 'SELECT * FROM telegram_intake_draft($1, $2, $3::jsonb, $4)'
      : 'SELECT * FROM telegram_intake_draft($1, $2, $3::jsonb, $4, $5)';
  const result = await db.pool.query<DraftRow>(sql, auto === undefined ? args : [...args, auto]);
  return result.rows[0]!;
}

async function created(token: string) {
  const decided = await decide(db.pool, token, 'APPROVE');
  expect(decided.result).toBe('OK');
  const result = await db.pool.query<{
    auto_approve_by: string | null;
    auto_approve_at: Date | null;
    version_id: string;
  }>(
    `SELECT vv.auto_approve_by, vv.auto_approve_at, vv.id AS version_id
     FROM intake_draft d JOIN video v ON v.id = d.video_id
     JOIN video_version vv ON vv.video_id = v.id AND vv.version = v.current_version
     WHERE d.token = $1`,
    [token],
  );
  return result.rows[0]!;
}

describe('/new auto=on', () => {
  test('Tạo turns /auto on for the new video, in the name of who pressed it', async () => {
    const row = await draft(true);
    expect(row).toMatchObject({ result: 'DRAFT', selection: { auto: true } });

    const video = await created(row.token);
    expect(video.auto_approve_by).toBe(String(OWNER));
    expect(video.auto_approve_at).not.toBeNull();
    const audit = await db.pool.query<{ actor: string }>(
      `SELECT actor FROM audit_log WHERE action = 'auto_approve_on' AND object_id = $1`,
      [video.version_id],
    );
    expect(audit.rows.map((r) => r.actor)).toEqual([`telegram:${OWNER}`]);
  });

  test('without it, or with auto=false, the video stays manual', async () => {
    for (const auto of [undefined, false]) {
      const row = await draft(auto);
      expect(row.selection.auto).toBe(false);
      expect((await created(row.token)).auto_approve_by).toBeNull();
    }
  });

  test('the Kit, Nhân vật and Worker buttons keep the choice', async () => {
    const row = await draft(true);
    const cycled = await db.pool.query<DraftRow>(
      `SELECT * FROM telegram_intake_cycle($1, $2, 'kit')`,
      [row.token, OWNER],
    );
    expect(cycled.rows[0]).toMatchObject({ result: 'DRAFT', selection: { auto: true } });
    expect((await created(row.token)).auto_approve_by).toBe(String(OWNER));
  });

  test('Hủy creates nothing', async () => {
    const row = await draft(true);
    expect((await decide(db.pool, row.token, 'REJECT')).result).toBe('OK');
    const status = await db.pool.query<{ status: string; video_id: string | null }>(
      'SELECT status, video_id FROM intake_draft WHERE token = $1',
      [row.token],
    );
    expect(status.rows[0]).toEqual({ status: 'CANCELLED', video_id: null });
  });
});
