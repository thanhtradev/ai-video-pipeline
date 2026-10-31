import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db.js';
import { decide as decideWith, jobs, OWNER, STRANGER } from '../helpers/episode-flow.js';
import { versionStatus } from '../helpers/fixtures.js';

// Intake from Telegram (D-058, the only intake since D-079): /new stores a draft for an approver;
// Create submits it (video + script job), Cancel drops it. Buttons go through telegram_decide().

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
  token: string | null;
  brief: Record<string, unknown> | null;
  has_voice: boolean | null;
  error: string | null;
}

async function draft(brief: object, user = OWNER): Promise<DraftRow> {
  const result = await db.pool.query<DraftRow>(
    'SELECT * FROM telegram_intake_draft($1, $2, $3::jsonb)',
    [user, '-1001234567890', JSON.stringify(brief)],
  );
  return result.rows[0]!;
}

const decide = (token: string, action: string, user?: number) =>
  decideWith(db.pool, token, action, null, user);

describe('telegram_intake_draft', () => {
  test('stores a normalised episode brief and tells whether it has a VOICE section', async () => {
    const plain = await draft({ topic: '  Nếu bạn dừng được thời gian?  ', duration_minutes: 8 });
    expect(plain).toMatchObject({
      result: 'DRAFT',
      brief: { format: 'episode', topic: 'Nếu bạn dừng được thời gian?', duration_minutes: 8 },
      has_voice: null,
      error: null,
    });
    expect(plain.token).toMatch(/^[0-9a-f]{32}$/);

    const voiced = await draft({ topic: 'Mèo', full_brief: '# Tập 1\n\n**VOICE**\n[punchy] Một.' });
    expect(voiced.has_voice).toBe(true);
    const outline = await draft({ topic: 'Mèo', full_brief: 'Dàn ý: mèo biết nói.' });
    expect(outline.has_voice).toBe(false);
  });

  test('refuses strangers and explains an invalid brief', async () => {
    expect((await draft({ topic: 'Mèo nghĩ gì?' }, STRANGER)).result).toBe('NOT_APPROVER');
    expect(await draft({ topic: 'Mèo', duration_minutes: 30 })).toMatchObject({
      result: 'INVALID',
      error: 'invalid brief: duration_minutes must be an integer from 2 to 12',
    });
  });
});

describe('telegram_decide on an intake draft', () => {
  test('Create submits the video once, with its script job', async () => {
    const { token } = await draft({ topic: 'Nếu bạn nghe được suy nghĩ của mèo?' });

    const created = await decide(token!, 'APPROVE');

    expect(created).toMatchObject({ result: 'OK', version: 1 });
    const version = await db.pool.query<{ id: string; brief: object }>(
      'SELECT id, brief FROM video_version WHERE video_id = $1',
      [(created as unknown as { video_id: string }).video_id],
    );
    expect(version.rows[0]!.brief).toMatchObject({
      format: 'episode',
      topic: 'Nếu bạn nghe được suy nghĩ của mèo?',
    });
    expect(await versionStatus(db.pool, version.rows[0]!.id)).toBe('SCRIPTING');
    expect((await jobs(db.pool, version.rows[0]!.id)).map((j) => j.step)).toEqual(['script']);
    expect((await decide(token!, 'APPROVE')).result).toBe('NOT_PENDING');
  });

  test('Cancel drops the draft; strangers, expired drafts and other actions are refused', async () => {
    const first = await draft({ topic: 'Mèo nghĩ gì?' });
    expect((await decide(first.token!, 'APPROVE', STRANGER)).result).toBe('NOT_ALLOWED');
    expect((await decide(first.token!, 'REGENERATE')).result).toBe('NOT_SUPPORTED');
    expect((await decide(first.token!, 'REJECT')).result).toBe('OK');
    expect((await decide(first.token!, 'APPROVE')).result).toBe('NOT_PENDING');

    const late = await draft({ topic: 'Mèo nghĩ gì?' });
    await db.pool.query(
      `UPDATE intake_draft SET expires_at = now() - interval '1 second' WHERE token = $1`,
      [late.token],
    );
    expect((await decide(late.token!, 'APPROVE')).result).toBe('EXPIRED');
    const submitted = await db.pool.query(
      `SELECT count(*)::int AS n FROM intake_draft WHERE status = 'SUBMITTED' AND token = $1`,
      [late.token],
    );
    expect(submitted.rows[0]).toEqual({ n: 0 });
  });
});
