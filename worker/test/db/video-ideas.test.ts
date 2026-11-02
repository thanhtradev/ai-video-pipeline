import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db.js';
import { createBatch } from '../helpers/fixtures.js';

// Video ideas (D-083): /ideas and a daily run queue one idea_request per kit + character pair with
// the pair's video history; the worker claims it (its own lease, outside the video job table),
// Claude proposes series / related / new ideas, ideas_due() hands them to WF-16 once, and a
// button turns an idea into the usual /new draft.

const OWNER = 111;
const STRANGER = 999;
const CHAT = '-100123';
const WORKER = 'mac-mini-m4';

let db: TestDb;
let batchId: string;
let sequence = 0;

beforeAll(async () => {
  db = await createTestDb();
  await db.pool.query(`INSERT INTO approver (telegram_user_id, name) VALUES ($1, 'owner')`, [
    OWNER,
  ]);
  batchId = await createBatch(db.pool);
});

afterAll(async () => {
  await db.drop();
});

beforeEach(async () => {
  await db.pool.query('DELETE FROM idea');
  await db.pool.query('DELETE FROM idea_request');
});

/** An episode video of a pair, as video_submit stores it. */
async function episode(brief: Record<string, unknown>): Promise<string> {
  sequence += 1;
  const result = await db.pool.query<{ video_id: string }>(
    `SELECT video_id FROM video_create($1, $2, '16:9', $3::jsonb)`,
    [batchId, sequence, JSON.stringify({ format: 'episode', ...brief })],
  );
  return result.rows[0]!.video_id;
}

interface CommandRow {
  result: string;
  kit: string | null;
  character_set: string | null;
}

async function command(
  user: number,
  kit: string | null = null,
  characterSet: string | null = null,
): Promise<CommandRow[]> {
  const result = await db.pool.query<CommandRow>(
    'SELECT result, kit, character_set FROM telegram_ideas($1, $2, $3, $4)',
    [user, CHAT, kit, characterSet],
  );
  return result.rows;
}

interface ClaimRow {
  request_id: string;
  attempt_no: number;
  kit: string;
  character_set: string;
  idea_count: number;
  history: { videos: Record<string, unknown>[]; unused_ideas: string[] };
}

async function claim(): Promise<ClaimRow | undefined> {
  const result = await db.pool.query<ClaimRow>('SELECT * FROM idea_claim($1, 600)', [WORKER]);
  return result.rows[0];
}

function idea(topic: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { kind: 'new', topic, hook: `Hook ${topic}`, angle: `Góc ${topic}`, ...extra };
}

/** Completes a request; fewer than 5 ideas are padded with plain new ones (WF-16 shows 5). */
async function complete(requestId: string, ideas: Record<string, unknown>[]): Promise<boolean> {
  const padded = [...ideas];
  while (padded.length < 5) padded.push(idea(`Ý tưởng thêm ${padded.length + 1}`));
  const result = await db.pool.query<{ ok: boolean }>(
    'SELECT idea_complete($1, $2, $3::jsonb) AS ok',
    [requestId, WORKER, JSON.stringify(padded)],
  );
  return result.rows[0]!.ok;
}

interface DueRow {
  kind: string;
  source: string;
  chat_id: string | null;
  kit: string;
  kit_label: string;
  character_label: string;
  ideas: Record<string, unknown>[] | null;
  error: string | null;
}

async function due(): Promise<DueRow[]> {
  return (await db.pool.query<DueRow>('SELECT * FROM ideas_due()')).rows;
}

async function storedIdeas(requestId: string): Promise<Record<string, unknown>[]> {
  const result = await db.pool.query('SELECT * FROM idea WHERE request_id = $1 ORDER BY position', [
    requestId,
  ]);
  return result.rows;
}

describe('telegram_ideas', () => {
  test('refuses strangers', async () => {
    expect(await command(STRANGER)).toEqual([
      { result: 'NOT_APPROVER', kit: null, character_set: null },
    ]);
  });

  test('queues every enabled pair when no kit or character is given', async () => {
    const rows = await command(OWNER);
    expect(rows).toEqual([
      { result: 'QUEUED', kit: 'whatif', character_set: 'chip' },
      { result: 'QUEUED', kit: 'science', character_set: 'chip-science' },
    ]);
  });

  test('narrows to the given kit, or takes any valid pair', async () => {
    expect(await command(OWNER, 'science')).toEqual([
      { result: 'QUEUED', kit: 'science', character_set: 'chip-science' },
    ]);
    expect(await command(OWNER, 'whatif', 'chip-science')).toEqual([
      { result: 'QUEUED', kit: 'whatif', character_set: 'chip-science' },
    ]);
  });

  test('rejects unknown slugs', async () => {
    expect((await command(OWNER, 'nope'))[0]!.result).toBe('UNKNOWN_KIT');
    expect((await command(OWNER, 'whatif', 'nope'))[0]!.result).toBe('UNKNOWN_CHARACTER');
  });

  test('does not queue a pair twice while its ideas are still being written', async () => {
    await command(OWNER, 'science');
    expect(await command(OWNER, 'science')).toEqual([
      { result: 'BUSY', kit: 'science', character_set: 'chip-science' },
    ]);
  });
});

describe('ideas_daily', () => {
  test('queues one request per pair and day, however often it runs', async () => {
    const first = await db.pool.query<{ n: number }>(`SELECT ideas_daily('2026-11-02') AS n`);
    const again = await db.pool.query<{ n: number }>(`SELECT ideas_daily('2026-11-02') AS n`);
    const next = await db.pool.query<{ n: number }>(`SELECT ideas_daily('2026-11-03') AS n`);
    expect([first.rows[0]!.n, again.rows[0]!.n, next.rows[0]!.n]).toEqual([2, 0, 2]);
  });
});

describe('ideas_history', () => {
  test('lists the pair’s latest videos with title, status and series, plus unused ideas', async () => {
    const seriesId = '6b0c8f8e-1111-4222-8333-444455556666';
    const older = await episode({
      topic: 'Nếu bạn biết bay',
      kit: 'whatif',
      character_set: 'chip',
    });
    const newer = await episode({
      topic: 'Nếu bạn biết bay 2',
      kit: 'whatif',
      character_set: 'chip',
      series: { id: seriesId, title: 'Biết bay', episode: 2 },
    });
    await episode({ topic: 'Vì sao trời xanh', kit: 'science', character_set: 'chip-science' });

    const result = await db.pool.query<{ h: ClaimRow['history'] }>(
      `SELECT ideas_history('whatif', 'chip') AS h`,
    );
    const { videos, unused_ideas } = result.rows[0]!.h;
    expect(videos.map((v) => v.video_id)).toEqual([newer, older]);
    expect(videos[0]).toMatchObject({
      title: 'Nếu bạn biết bay 2',
      status: 'BRIEF_SUBMITTED',
      series: { id: seriesId, title: 'Biết bay', episode: 2 },
    });
    expect(unused_ideas).toEqual([]);
  });
});

describe('worker lease', () => {
  test('claims the oldest request once and stores the history it was given', async () => {
    await episode({ topic: 'Nếu bạn là cá', kit: 'whatif', character_set: 'chip' });
    await command(OWNER, 'whatif');

    const claimed = await claim();
    expect(claimed).toMatchObject({ attempt_no: 1, kit: 'whatif', idea_count: 5 });
    expect(claimed!.history.videos.map((v) => v.topic)).toContain('Nếu bạn là cá');
    expect(await claim()).toBeUndefined();
  });

  test('a retryable failure waits and runs again; the last attempt fails for good', async () => {
    await command(OWNER, 'science');
    const { request_id } = (await claim())!;
    const status = async (retryable: boolean) =>
      (
        await db.pool.query<{ s: string }>('SELECT idea_fail($1, $2, $3, $4) AS s', [
          request_id,
          WORKER,
          'boom',
          retryable,
        ])
      ).rows[0]!.s;

    expect(await status(true)).toBe('PENDING');
    expect(await claim()).toBeUndefined();
    await db.pool.query('UPDATE idea_request SET next_attempt_at = now() WHERE id = $1', [
      request_id,
    ]);
    expect((await claim())!.attempt_no).toBe(2);
    expect(await status(false)).toBe('FAILED');
    expect(await due()).toEqual([
      expect.objectContaining({ kind: 'FAILED', error: 'boom', chat_id: CHAT }),
    ]);
  });

  test('a usage limit blocks without using an attempt and says so once', async () => {
    await command(OWNER, 'science');
    const { request_id } = (await claim())!;
    await db.pool.query('SELECT idea_block($1, $2, $3, 3600)', [request_id, WORKER, 'usage limit']);
    const row = await db.pool.query(
      'SELECT status, attempt_count FROM idea_request WHERE id = $1',
      [request_id],
    );
    expect(row.rows[0]).toEqual({ status: 'PENDING', attempt_count: 0 });
    expect(await claim()).toBeUndefined();
    expect((await due()).map((d) => d.kind)).toEqual(['BLOCKED']);
    expect(await due()).toEqual([]);
  });

  test('an expired lease returns the request to the queue', async () => {
    await command(OWNER, 'science');
    const { request_id } = (await claim())!;
    await db.pool.query(
      `UPDATE idea_request SET lease_expires_at = now() - interval '1 second' WHERE id = $1`,
      [request_id],
    );
    expect((await claim())!.attempt_no).toBe(2);
  });

  test('refuses fewer ideas than the request asked for', async () => {
    await command(OWNER, 'science');
    const { request_id } = (await claim())!;
    await expect(
      db.pool.query('SELECT idea_complete($1, $2, $3::jsonb)', [
        request_id,
        WORKER,
        JSON.stringify([idea('Chỉ một ý')]),
      ]),
    ).rejects.toThrow(/at least 5 ideas/);
  });

  test('another worker cannot complete a request it did not claim', async () => {
    await command(OWNER, 'science');
    const { request_id } = (await claim())!;
    const result = await db.pool.query<{ ok: boolean }>(
      `SELECT idea_complete($1, 'hp-400-g7', '[]'::jsonb) AS ok`,
      [request_id],
    );
    expect(result.rows[0]!.ok).toBe(false);
  });
});

describe('idea_complete', () => {
  test('keeps links to videos of the history and numbers series episodes in SQL', async () => {
    const seriesId = '0f0e0d0c-1111-4222-8333-444455556666';
    const first = await episode({ topic: 'Nếu bạn là cá', kit: 'whatif', character_set: 'chip' });
    await episode({
      topic: 'Nếu bạn là cá mập',
      kit: 'whatif',
      character_set: 'chip',
      series: { id: seriesId, title: 'Dưới biển', episode: 3 },
    });
    const otherPair = await episode({
      topic: 'Vì sao cá thở',
      kit: 'science',
      character_set: 'chip-science',
    });
    await command(OWNER, 'whatif');
    const { request_id } = (await claim())!;

    const ok = await complete(request_id, [
      idea('Nếu bạn là cá voi', { kind: 'series', series_id: seriesId, episode_no: 9 }),
      idea('Nếu bạn là cá 2', { kind: 'series', related_video_id: first }),
      idea('Nếu bạn sống dưới nước', { kind: 'related', related_video_id: first }),
      idea('Bịa đặt', { kind: 'related', related_video_id: otherPair }),
      idea('Series bịa', { kind: 'series', series_id: '99999999-1111-4222-8333-444455556666' }),
    ]);

    expect(ok).toBe(true);
    const saved = await storedIdeas(request_id);
    expect(
      saved.map((s) => [s.kind, s.series_id, s.series_title, s.episode_no, s.related_video_id]),
    ).toEqual([
      ['series', seriesId, 'Dưới biển', 4, null],
      ['series', first, 'Nếu bạn là cá', 2, first],
      ['related', null, null, null, first],
      ['new', null, null, null, null],
      ['new', null, null, null, null],
    ]);
    expect(saved[2]!.related_title).toBe('Nếu bạn là cá');
    expect(saved.every((s) => /^[0-9a-f]{32}$/.test(String(s.token)))).toBe(true);
  });

  test('ideas_due delivers the ideas once, with labels and the chat to answer in', async () => {
    await command(OWNER, 'science');
    const { request_id } = (await claim())!;
    await complete(request_id, [idea('Vì sao trời xanh'), idea('Vì sao biển mặn')]);

    const rows = await due();
    expect(rows).toEqual([
      expect.objectContaining({
        kind: 'IDEAS',
        source: 'command',
        chat_id: CHAT,
        kit_label: 'Khoa học',
      }),
    ]);
    expect(rows[0]!.ideas!.map((i) => i.topic)).toEqual([
      'Vì sao trời xanh',
      'Vì sao biển mặn',
      'Ý tưởng thêm 3',
      'Ý tưởng thêm 4',
      'Ý tưởng thêm 5',
    ]);
    expect(await due()).toEqual([]);
  });

  test('daily requests have no chat (WF-16 sends them to the approval chat)', async () => {
    await db.pool.query(`SELECT ideas_daily('2026-11-02')`);
    const { request_id } = (await claim())!;
    await complete(request_id, [idea('Một ý tưởng mới')]);
    expect(await due()).toEqual([expect.objectContaining({ source: 'daily', chat_id: null })]);
  });
});

describe('idea_to_draft', () => {
  async function pick(token: string, user = OWNER) {
    const result = await db.pool.query(
      'SELECT result, token, brief, selection, error FROM idea_to_draft($1, $2, $3)',
      [token, user, CHAT],
    );
    return result.rows[0] as {
      result: string;
      token: string | null;
      brief: Record<string, unknown> | null;
      selection: Record<string, unknown> | null;
    };
  }

  async function oneIdea(extra: Record<string, unknown> = {}): Promise<string> {
    await command(OWNER, 'whatif');
    const { request_id } = (await claim())!;
    await complete(request_id, [idea('Nếu bạn là cá heo', extra)]);
    return String((await storedIdeas(request_id))[0]!.token);
  }

  test('opens a /new draft with topic, kit, character, notes and the series link', async () => {
    const first = await episode({ topic: 'Nếu bạn là cá', kit: 'whatif', character_set: 'chip' });
    const token = await oneIdea({ kind: 'series', related_video_id: first });

    const draft = await pick(token);

    expect(draft.result).toBe('DRAFT');
    expect(draft.brief).toMatchObject({
      format: 'episode',
      topic: 'Nếu bạn là cá heo',
      kit: 'whatif',
      character_set: 'chip',
      series: { id: first, title: 'Nếu bạn là cá', episode: 2 },
      related_to: { video_id: first, title: 'Nếu bạn là cá' },
    });
    expect(String(draft.brief!.notes)).toContain('Hook Nếu bạn là cá heo');
  });

  test('refuses an idea whose draft is still open, but allows it again after a cancel', async () => {
    const token = await oneIdea();
    const draft = await pick(token);
    expect((await pick(token)).result).toBe('IDEA_USED');

    await db.pool.query(`UPDATE intake_draft SET status = 'CANCELLED' WHERE token = $1`, [
      draft.token,
    ]);
    expect((await pick(token)).result).toBe('DRAFT');
  });

  test('refuses unknown and expired ideas and strangers', async () => {
    const token = await oneIdea();
    expect((await pick('0'.repeat(32))).result).toBe('IDEA_NOT_FOUND');
    expect((await pick(token, STRANGER)).result).toBe('NOT_APPROVER');
    await db.pool.query(`UPDATE idea SET expires_at = now() - interval '1 second'`);
    expect((await pick(token)).result).toBe('IDEA_EXPIRED');
  });
});

describe('episode briefs keep the series link', () => {
  test('brief_normalize keeps a valid series and related_to and rejects a bad one', async () => {
    const id = '6b0c8f8e-1111-4222-8333-444455556666';
    const normalize = async (extra: Record<string, unknown>) =>
      (
        await db.pool.query<{ b: Record<string, unknown> }>(
          'SELECT brief_normalize($1::jsonb) AS b',
          [JSON.stringify({ format: 'episode', topic: 'Nếu bạn là cá', ...extra })],
        )
      ).rows[0]!.b;

    expect(
      await normalize({
        series: { id, title: 'Dưới biển', episode: 2 },
        related_to: { video_id: id, title: 'Cá' },
      }),
    ).toMatchObject({
      series: { id, title: 'Dưới biển', episode: 2 },
      related_to: { video_id: id, title: 'Cá' },
    });
    expect(await normalize({})).not.toHaveProperty('series');
    await expect(normalize({ series: { id: 'x', title: 'a', episode: 2 } })).rejects.toThrow(
      /series/,
    );
    await expect(normalize({ series: { id, title: 'a', episode: 0 } })).rejects.toThrow(/series/);
  });
});
