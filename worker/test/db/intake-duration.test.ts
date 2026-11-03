import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db.js';
import { decide, OWNER, STRANGER } from '../helpers/episode-flow.js';

// D-091: the /new draft's Thời lượng button cycles the episode length before Tạo. A full brief
// follows its VOICE section, so the draft shows a word-count estimate and the button is refused.

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

interface Duration {
  follows_voice: boolean;
  minutes?: number | null;
  label?: string;
  next_minutes?: number | null;
  next_label?: string;
  voice_words?: number | null;
  voice_minutes?: number | null;
}

interface DraftRow {
  result: string;
  token: string | null;
  brief: { duration_minutes?: number } | null;
  selection: { duration: Duration } | null;
}

async function draft(brief: Record<string, unknown>): Promise<DraftRow> {
  const result = await db.pool.query<DraftRow>(
    'SELECT * FROM telegram_intake_draft($1, $2, $3::jsonb)',
    [OWNER, '-1001234567890', JSON.stringify({ topic: 'Mèo nghĩ gì?', ...brief })],
  );
  return result.rows[0]!;
}

async function cycle(token: string, user = OWNER): Promise<DraftRow> {
  const result = await db.pool.query<DraftRow>(
    `SELECT * FROM telegram_intake_cycle($1, $2, 'duration')`,
    [token, user],
  );
  return result.rows[0]!;
}

const FULL_BRIEF = [
  'EP1 — Mèo nghĩ gì?',
  '',
  '=== NHÂN VẬT ===',
  '- CHÍP: hoodie vàng.',
  '',
  'VOICE',
  '[punchy] Nếu bạn nghe được suy nghĩ của mèo — thì sao?',
  '[short pause] Ba mươi giây… đứng hình.',
  '',
  'Màn hai. Mèo nhìn bạn.',
  '',
  '=== DANH SÁCH SHOT (SFX/foley trong ngoặc) ===',
  '[1. HOOK]',
  '1.1 MỐC "Nếu bạn nghe được": ECU mắt mèo. (tách)',
].join('\n');

describe('the Thời lượng button', () => {
  test('a draft without a length shows Tự động and offers 3 phút next', async () => {
    const row = await draft({});

    expect(row.selection!.duration).toEqual({
      follows_voice: false,
      minutes: null,
      label: 'Tự động (~6 phút)',
      next_minutes: 3,
      next_label: '3 phút',
    });
  });

  test('cycles Tự động → 3 → 4 → 5 → 6 → 8 → 10 → 12 → Tự động and stores the length', async () => {
    const { token } = await draft({});

    const seen: (number | null | undefined)[] = [];
    let last: DraftRow | undefined;
    for (let i = 0; i < 8; i++) {
      last = await cycle(token!);
      seen.push(last.selection!.duration.minutes);
    }

    expect(seen).toEqual([3, 4, 5, 6, 8, 10, 12, null]);
    expect(last!.brief).not.toHaveProperty('duration_minutes');
    const stored = await db.pool.query<{ minutes: number | null }>(
      `SELECT (brief->>'duration_minutes')::int AS minutes FROM intake_draft WHERE token = $1`,
      [token],
    );
    expect(stored.rows[0]!.minutes).toBeNull();
  });

  test('a length from the command that is not a choice moves to the next larger one', async () => {
    const row = await draft({ duration_minutes: 7 });

    expect(row.selection!.duration).toMatchObject({ minutes: 7, label: '7 phút', next_minutes: 8 });
    const next = await cycle(row.token!);
    expect(next.brief!.duration_minutes).toBe(8);
  });

  test('Create submits the chosen length', async () => {
    const { token } = await draft({});
    await cycle(token!);
    await cycle(token!);

    const created = (await decide(db.pool, token!, 'APPROVE')) as unknown as {
      video_id: string;
    };

    const version = await db.pool.query<{ minutes: number }>(
      `SELECT (brief->>'duration_minutes')::int AS minutes FROM video_version WHERE video_id = $1`,
      [created.video_id],
    );
    expect(version.rows[0]!.minutes).toBe(4);
  });

  test('refuses strangers and decided drafts', async () => {
    const { token } = await draft({});
    expect((await cycle(token!, STRANGER)).result).toBe('NOT_APPROVER');
    await decide(db.pool, token!, 'REJECT');
    expect((await cycle(token!)).result).toBe('NOT_PENDING');
  });
});

describe('a full brief', () => {
  test('shows the VOICE estimate instead of a length choice', async () => {
    const row = await draft({ full_brief: FULL_BRIEF, duration_minutes: 6 });

    // 10 + 5 + 5 spoken words; tags, the dash and the ellipsis are not words.
    expect(row.selection!.duration).toEqual({
      follows_voice: true,
      voice_words: 20,
      voice_minutes: 0.1,
    });
  });

  test('refuses the button and leaves the draft unchanged', async () => {
    const row = await draft({ full_brief: FULL_BRIEF });

    expect((await cycle(row.token!)).result).toBe('FULL_BRIEF');
    const stored = await db.pool.query<{ brief: Record<string, unknown> }>(
      'SELECT brief FROM intake_draft WHERE token = $1',
      [row.token],
    );
    expect(stored.rows[0]!.brief).toEqual(row.brief);
  });

  test('has no estimate without a VOICE section', async () => {
    const row = await draft({ full_brief: 'Chỉ có dàn ý, không có lời thoại.' });

    expect(row.selection!.duration).toMatchObject({ follows_voice: true, voice_words: null });
  });

  test('counts a long VOICE section at 3.2 words per second', async () => {
    const line = 'một hai ba bốn năm sáu bảy tám chín mười';
    const voice = Array.from({ length: 192 }, () => line).join('\n');
    const row = await draft({ full_brief: `VOICE\n${voice}\n=== DANH SÁCH SHOT ===\n1.1 x` });

    // 1920 words / 192 words per minute.
    expect(row.selection!.duration).toMatchObject({ voice_words: 1920, voice_minutes: 10 });
  });
});
