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
      kit: {
        slug: 'science',
        label: 'Khoa học',
        next_slug: 'whatif-en',
        next_label: 'What if… (EN)',
      },
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
    expect(kit.selection!.kit).toMatchObject({ slug: 'science', next_slug: 'whatif-en' });

    const cast = await cycle(drafted.token!, 'character_set');
    expect(cast.brief).toMatchObject({ kit: 'science', character_set: 'chip-science' });

    // the English kit takes the English cast (D-092)
    const english = await cycle(drafted.token!, 'kit');
    expect(english.brief).toMatchObject({ kit: 'whatif-en', character_set: 'chip-en' });

    // the horror kit is Vietnamese (D-106): the English cast gives way to the first Vietnamese one
    const horror = await cycle(drafted.token!, 'kit');
    expect(horror.brief).toMatchObject({ kit: 'horror', character_set: 'chip' });
    expect(horror.selection!.kit).toMatchObject({ slug: 'horror', next_slug: 'whatif' });

    // the last cycle wraps to the first option, with a Vietnamese cast again
    const wrapped = await cycle(drafted.token!, 'kit');
    expect(wrapped.brief).toMatchObject({ kit: 'whatif', character_set: 'chip' });

    // Create submits the brief with the choice
    const created = await decideWith(db.pool, drafted.token!, 'APPROVE', null);
    expect(created.result).toBe('OK');
    const version = await db.pool.query<{ brief: Record<string, unknown> }>(
      `SELECT brief FROM video_version WHERE video_id = $1`,
      [(created as { video_id?: string }).video_id],
    );
    expect(version.rows[0]!.brief).toMatchObject({ kit: 'whatif', character_set: 'chip' });

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

describe('a button that changes nothing (D-092)', () => {
  test('the English kit offers only English casts, and a no-op press is UNCHANGED', async () => {
    const drafted = await draft({ topic: 'What if you could fly?', kit: 'whatif-en' });
    expect(drafted.brief).toMatchObject({ kit: 'whatif-en', character_set: 'chip-en' });
    // Only one English cast: the button names it instead of a Vietnamese one.
    expect(drafted.selection!.character_set).toMatchObject({
      slug: 'chip-en',
      next_slug: 'chip-en',
    });

    // Telegram refuses to edit a message into the same content ("message is not modified").
    const pressed = await cycle(drafted.token!, 'character_set');
    expect(pressed.result).toBe('UNCHANGED');
    expect(pressed.brief).toMatchObject({ kit: 'whatif-en', character_set: 'chip-en' });

    // The draft is still open and other buttons still work.
    expect((await cycle(drafted.token!, 'kit')).result).toBe('DRAFT');
  });

  test('Vietnamese kits cycle through Vietnamese casts only', async () => {
    const drafted = await draft({ topic: 'Nếu bạn bay được?' });
    expect(drafted.selection!.character_set).toMatchObject({
      slug: 'chip',
      next_slug: 'chip-science',
    });
    const science = await cycle(drafted.token!, 'character_set');
    expect(science.selection!.character_set).toMatchObject({
      slug: 'chip-science',
      next_slug: 'bong',
    });
    // Mùn is disabled (D-111): the cycle skips it and lands on Bóng
    const bong = await cycle(drafted.token!, 'character_set');
    expect(bong.selection!.character_set).toMatchObject({ slug: 'bong', next_slug: 'chip' });
  });
});

// Kit picker (D-109): the Kit button no longer cycles; it opens a message with one button per
// enabled kit (telegram_intake_options), and a tap sets that kit (telegram_intake_pick).
interface OptionsRow {
  result: string;
  options: { slug: string; label: string; current: boolean }[] | null;
}

async function options(token: string, kind: string, user = OWNER): Promise<OptionsRow> {
  const result = await db.pool.query<OptionsRow>(
    'SELECT * FROM telegram_intake_options($1, $2, $3)',
    [token, user, kind],
  );
  return result.rows[0]!;
}

async function pick(token: string, kind: string, slug: string, user = OWNER): Promise<DraftRow> {
  const result = await db.pool.query<DraftRow>(
    'SELECT * FROM telegram_intake_pick($1, $2, $3, $4)',
    [token, user, kind, slug],
  );
  return result.rows[0]!;
}

describe('kit picker (D-109)', () => {
  test('lists every enabled kit in catalog order and marks the current one', async () => {
    const drafted = await draft({ topic: 'Bíp ơi, tại sao có gió?' });
    const listed = await options(drafted.token!, 'kit');
    expect(listed.result).toBe('DRAFT');
    expect(listed.options).toEqual([
      { slug: 'whatif', label: 'Nếu bạn…', current: true },
      { slug: 'science', label: 'Khoa học', current: false },
      { slug: 'whatif-en', label: 'What if… (EN)', current: false },
      { slug: 'horror', label: 'Kinh dị', current: false },
    ]);

    await db.pool.query(`UPDATE catalog_option SET enabled = false WHERE slug = 'horror'`);
    expect((await options(drafted.token!, 'kit')).options!.map((o) => o.slug)).toEqual([
      'whatif',
      'science',
      'whatif-en',
    ]);
    await db.pool.query(`UPDATE catalog_option SET enabled = true WHERE slug = 'horror'`);
  });

  test('a pick sets the kit and pairs the cast by language; the same kit is UNCHANGED', async () => {
    const drafted = await draft({ topic: 'Bíp ơi, tại sao có sấm?' });

    const horror = await pick(drafted.token!, 'kit', 'horror');
    expect(horror.result).toBe('DRAFT');
    expect(horror.token).toBe(drafted.token);
    expect(horror.brief).toMatchObject({ kit: 'horror', character_set: 'chip' });
    expect(horror.selection!.kit!.slug).toBe('horror');

    const english = await pick(drafted.token!, 'kit', 'whatif-en');
    expect(english.brief).toMatchObject({ kit: 'whatif-en', character_set: 'chip-en' });
    expect((await options(drafted.token!, 'kit')).options).toContainEqual({
      slug: 'whatif-en',
      label: 'What if… (EN)',
      current: true,
    });

    const same = await pick(drafted.token!, 'kit', 'whatif-en');
    expect(same.result).toBe('UNCHANGED');
    expect(same.brief).toMatchObject({ kit: 'whatif-en' });

    // the Nhân vật cycle button still works after a pick
    expect((await cycle(drafted.token!, 'character_set')).result).toBe('UNCHANGED');
    const created = await decideWith(db.pool, drafted.token!, 'APPROVE', null);
    expect(created.result).toBe('OK');
    expect((await pick(drafted.token!, 'kit', 'whatif')).result).toBe('NOT_PENDING');
    expect((await options(drafted.token!, 'kit')).result).toBe('NOT_PENDING');
  });

  test('refuses strangers, unknown drafts, bad kinds and unknown or disabled slugs', async () => {
    const drafted = await draft({ topic: 'Bíp ơi, tại sao có cầu vồng?' });
    expect((await options(drafted.token!, 'kit', STRANGER)).result).toBe('NOT_APPROVER');
    expect((await pick(drafted.token!, 'kit', 'horror', STRANGER)).result).toBe('NOT_APPROVER');
    expect((await options('0'.repeat(32), 'kit')).result).toBe('NOT_FOUND');
    expect((await pick('0'.repeat(32), 'kit', 'horror')).result).toBe('NOT_FOUND');
    await expect(options(drafted.token!, 'worker')).rejects.toThrow(/invalid kind/);
    await expect(pick(drafted.token!, 'worker', 'huy')).rejects.toThrow(/invalid kind/);

    const unknown = await pick(drafted.token!, 'kit', 'anime');
    expect(unknown.result).toBe('INVALID');
    expect(unknown.error).toMatch(/unknown kit "anime"/);
    await db.pool.query(`UPDATE catalog_option SET enabled = false WHERE slug = 'horror'`);
    expect((await pick(drafted.token!, 'kit', 'horror')).result).toBe('INVALID');
    await db.pool.query(`UPDATE catalog_option SET enabled = true WHERE slug = 'horror'`);
    expect((await pick(drafted.token!, 'kit', 'whatif')).result).toBe('UNCHANGED');
  });

  test('the picker also lists casts of the kit language', async () => {
    const drafted = await draft({ topic: 'What if the sun went out?', kit: 'whatif-en' });
    expect((await options(drafted.token!, 'character_set')).options).toEqual([
      { slug: 'chip-en', label: expect.any(String), current: true },
    ]);
    const vi = await pick(drafted.token!, 'kit', 'science');
    expect(vi.brief).toMatchObject({ kit: 'science', character_set: 'chip' });
    expect((await options(drafted.token!, 'character_set')).options!.map((o) => o.slug)).toEqual([
      'chip',
      'chip-science',
      'bong',
    ]);
    expect((await pick(drafted.token!, 'character_set', 'bong')).brief).toMatchObject({
      character_set: 'bong',
    });
  });
});
