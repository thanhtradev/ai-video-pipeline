import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db.js';
import { decide as decideWith, jobs, OWNER, STRANGER, succeed } from '../helpers/episode-flow.js';

// Kit and character set per clip (D-066): the brief keeps both slugs (defaults when absent),
// Telegram buttons cycle them on a pending draft, and the jobs that need them get them.

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
  selection: Record<string, { slug: string; label: string; next_slug: string }> | null;
  error: string | null;
}

async function normalize(brief: object): Promise<Record<string, unknown>> {
  const result = await db.pool.query<{ brief: Record<string, unknown> }>(
    'SELECT brief_normalize($1::jsonb) AS brief',
    [JSON.stringify({ format: 'episode', ...brief })],
  );
  return result.rows[0]!.brief;
}

async function draft(brief: object, user = OWNER): Promise<DraftRow> {
  const result = await db.pool.query<DraftRow>(
    'SELECT * FROM telegram_intake_draft($1, $2, $3::jsonb)',
    [user, '-1001234567890', JSON.stringify(brief)],
  );
  return result.rows[0]!;
}

async function cycle(token: string, kind: string, user = OWNER): Promise<DraftRow> {
  const result = await db.pool.query<DraftRow>('SELECT * FROM telegram_intake_cycle($1, $2, $3)', [
    token,
    user,
    kind,
  ]);
  return result.rows[0]!;
}

describe('episode brief', () => {
  test('fills the default kit and character set', async () => {
    const brief = await normalize({ topic: 'Bíp ơi, tại sao bầu trời màu xanh?' });
    expect(brief).toMatchObject({ kit: 'whatif', character_set: 'chip' });
  });

  test('keeps a chosen kit and character set', async () => {
    const brief = await normalize({
      topic: 'Tại sao?',
      kit: 'science',
      character_set: 'chip-science',
    });
    expect(brief).toMatchObject({ kit: 'science', character_set: 'chip-science' });
  });

  test('rejects unknown or disabled slugs, never falls back', async () => {
    await expect(normalize({ topic: 'Tại sao?', kit: 'anime' })).rejects.toThrow(
      /unknown kit "anime"/,
    );
    await expect(normalize({ topic: 'Tại sao?', character_set: 'Bíp' })).rejects.toThrow(
      /unknown character_set/,
    );
    await db.pool.query(`UPDATE catalog_option SET enabled = false WHERE slug = 'science'`);
    await expect(normalize({ topic: 'Tại sao?', kit: 'science' })).rejects.toThrow(
      /unknown kit "science"/,
    );
    await db.pool.query(`UPDATE catalog_option SET enabled = true WHERE slug = 'science'`);
  });

  test('catalog_selection names the current choice and the next option', async () => {
    const result = await db.pool.query<{ s: DraftRow['selection'] }>(
      `SELECT catalog_selection('{"kit": "science"}'::jsonb) AS s`,
    );
    expect(result.rows[0]!.s).toEqual({
      kit: { slug: 'science', label: 'Khoa học', next_slug: 'whatif', next_label: 'Nếu bạn…' },
      character_set: {
        slug: 'chip',
        label: 'Chíp (BẠN)',
        next_slug: 'chip-science',
        next_label: 'Chíp Khoa học',
      },
    });
  });
});

describe('Telegram draft buttons', () => {
  test('a draft carries its selection; Kit / Nhân vật buttons cycle it', async () => {
    const drafted = await draft({ topic: 'Bíp ơi, tại sao nước sôi?' });
    expect(drafted.result).toBe('DRAFT');
    expect(drafted.brief).toMatchObject({ kit: 'whatif', character_set: 'chip' });
    expect(drafted.selection!.kit).toMatchObject({ slug: 'whatif', next_slug: 'science' });

    const kit = await cycle(drafted.token!, 'kit');
    expect(kit.result).toBe('DRAFT');
    expect(kit.token).toBe(drafted.token);
    expect(kit.brief).toMatchObject({ kit: 'science', character_set: 'chip' });
    expect(kit.selection!.kit).toMatchObject({ slug: 'science', next_slug: 'whatif' });

    const cast = await cycle(drafted.token!, 'character_set');
    expect(cast.brief).toMatchObject({ kit: 'science', character_set: 'chip-science' });

    // the last cycle wraps to the first option
    const wrapped = await cycle(drafted.token!, 'kit');
    expect(wrapped.brief).toMatchObject({ kit: 'whatif', character_set: 'chip-science' });

    // Create submits the brief with the choice
    const created = await decideWith(db.pool, drafted.token!, 'APPROVE', null);
    expect(created.result).toBe('OK');
    const version = await db.pool.query<{ brief: Record<string, unknown> }>(
      `SELECT brief FROM video_version WHERE video_id = $1`,
      [(created as { video_id?: string }).video_id],
    );
    expect(version.rows[0]!.brief).toMatchObject({ kit: 'whatif', character_set: 'chip-science' });

    expect((await cycle(drafted.token!, 'kit')).result).toBe('NOT_PENDING');
  });

  test('a stranger cannot cycle; a bad kind is an error', async () => {
    const drafted = await draft({ topic: 'Bíp ơi, tại sao có mưa?' });
    expect((await cycle(drafted.token!, 'kit', STRANGER)).result).toBe('NOT_APPROVER');
    expect((await cycle('0'.repeat(32), 'kit')).result).toBe('NOT_FOUND');
    await expect(cycle(drafted.token!, 'hero')).rejects.toThrow(/invalid kind/);
  });

  test('/new tokens choose directly', async () => {
    const drafted = await draft({
      topic: 'Tại sao?',
      kit: 'science',
      character_set: 'chip-science',
    });
    expect(drafted.result).toBe('DRAFT');
    expect(drafted.selection!.character_set!.slug).toBe('chip-science');
    const bad = await draft({ topic: 'Tại sao?', kit: 'anime' });
    expect(bad.result).toBe('INVALID');
    expect(bad.error).toMatch(/unknown kit/);
  });
});

describe('job inputs', () => {
  test('episode_code and its revision carry the version selection', async () => {
    const submitted = await db.pool.query<{ version_id: string; job_id: string }>(
      'SELECT * FROM video_submit($1, $2::jsonb)',
      [
        'sel-1',
        JSON.stringify({
          format: 'episode',
          topic: 'Tại sao?',
          kit: 'science',
          character_set: 'chip-science',
        }),
      ],
    );
    const { version_id: versionId, job_id: scriptJob } = submitted.rows[0]!;
    await succeed(db.pool, scriptJob, { act_count: 1 });
    const timing = await db.pool.query<{ job_create: string }>(
      `SELECT job_create($1, 'timing', 'q:heavy', '{}'::jsonb, 't', '{}'::uuid[], 1)`,
      [versionId],
    );
    await succeed(db.pool, timing.rows[0]!.job_create, { ok: true });
    await db.pool.query('SELECT episode_code_job_create($1)', [versionId]);
    const code = (await jobs(db.pool, versionId)).find((j) => j.step === 'episode_code')!;
    expect(code.input).toMatchObject({ kit: 'science', character_set: 'chip-science' });

    await succeed(db.pool, code.id, { ok: true });
    await db.pool.query(`SELECT episode_code_revision_create($1, 'again')`, [versionId]);
    const revision = (await jobs(db.pool, versionId))
      .filter((j) => j.step === 'episode_code')
      .find((j) => j.id !== code.id)!;
    expect(revision.input).toMatchObject({
      kit: 'science',
      character_set: 'chip-science',
      revision: {},
    });
  });

  test('version_selection gives the defaults for a brief made before D-066', async () => {
    const submitted = await db.pool.query<{ version_id: string }>(
      'SELECT * FROM video_submit($1, $2::jsonb)',
      ['sel-2', JSON.stringify({ format: 'episode', topic: 'Tại sao?' })],
    );
    const versionId = submitted.rows[0]!.version_id;
    await db.pool.query(
      `UPDATE video_version SET brief = brief - 'kit' - 'character_set' WHERE id = $1`,
      [versionId],
    );
    const result = await db.pool.query<{ s: object }>('SELECT version_selection($1) AS s', [
      versionId,
    ]);
    expect(result.rows[0]!.s).toEqual({ kit: 'whatif', character_set: 'chip' });
  });
});
