import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db.js';
import { loadCatalog } from '../../src/episode/catalog.js';

// D-092: a video's language comes from its kit (catalog_option.language), and every job input
// that names a language carries the video's language instead of a hardcoded 'vi'.

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
  // An English kit as the whatif-en rollout adds it; the plumbing must not depend on its slug.
  await db.pool.query(
    `INSERT INTO catalog_option (kind, slug, label, sort_order, aspect_ratio, language)
     VALUES ('kit', 'test-en', 'Test (EN)', 90, '16:9', 'en')`,
  );
});

afterAll(async () => {
  await db.drop();
});

interface Submitted {
  videoId: string;
  versionId: string;
  jobId: string;
}

async function submit(id: string, brief: object): Promise<Submitted> {
  const result = await db.pool.query<{ video_id: string; version_id: string; job_id: string }>(
    'SELECT * FROM video_submit($1, $2::jsonb)',
    [id, JSON.stringify(brief)],
  );
  const row = result.rows[0]!;
  return { videoId: row.video_id, versionId: row.version_id, jobId: row.job_id };
}

async function videoLanguage(videoId: string): Promise<string> {
  const result = await db.pool.query<{ language: string }>(
    'SELECT language FROM video WHERE id = $1',
    [videoId],
  );
  return result.rows[0]!.language;
}

async function jobLanguage(jobId: string): Promise<string | undefined> {
  const result = await db.pool.query<{ language: string | null }>(
    `SELECT input->>'language' AS language FROM job WHERE id = $1`,
    [jobId],
  );
  return result.rows[0]!.language ?? undefined;
}

describe('video language by kit', () => {
  test('an episode of an English kit is English, and so is its script job', async () => {
    const video = await submit('lang-en-1', {
      format: 'episode',
      topic: 'What if you could fly?',
      kit: 'test-en',
    });
    expect(await videoLanguage(video.videoId)).toBe('en');
    expect(await jobLanguage(video.jobId)).toBe('en');
  });

  test('the default kit and Shorts stay Vietnamese', async () => {
    const episode = await submit('lang-vi-1', { format: 'episode', topic: 'Nếu bạn bay được?' });
    expect(await videoLanguage(episode.videoId)).toBe('vi');
    expect(await jobLanguage(episode.jobId)).toBe('vi');

    const short = await submit('lang-vi-2', {
      topic: 'Vì sao bầu trời xanh?',
      duration_seconds: 30,
    });
    expect(await videoLanguage(short.videoId)).toBe('vi');
    expect(await jobLanguage(short.jobId)).toBe('vi');
  });

  test('any later job input with a language gets the video language', async () => {
    const video = await submit('lang-en-2', {
      format: 'episode',
      topic: 'What if time stopped?',
      kit: 'test-en',
    });
    // As timing_job_create, tts_job_create and the preview builders write it.
    const created = await db.pool.query<{ id: string }>(
      `SELECT job_create($1, 'timing', 'q:light', '{"language": "vi", "x": 1}'::jsonb, 'h1') AS id`,
      [video.versionId],
    );
    expect(await jobLanguage(created.rows[0]!.id)).toBe('en');

    const plain = await db.pool.query<{ id: string }>(
      `SELECT job_create($1, 'metadata', 'q:light', '{"x": 1}'::jsonb, 'h2') AS id`,
      [video.versionId],
    );
    expect(await jobLanguage(plain.rows[0]!.id)).toBeUndefined();
  });

  test('languages are limited and every catalog option has one', async () => {
    const rows = await db.pool.query<{ slug: string; language: string }>(
      `SELECT slug, language FROM catalog_option WHERE slug <> 'test-en' ORDER BY kind, sort_order`,
    );
    expect(rows.rows.filter((r) => r.language === 'en').map((r) => r.slug)).toEqual([
      'chip-en',
      'whatif-en',
    ]);
    await expect(
      db.pool.query(`UPDATE catalog_option SET language = 'fr' WHERE slug = 'whatif'`),
    ).rejects.toThrow(/catalog_option_language/);
  });

  test('a full English brief is estimated at the English speaking rate', async () => {
    const voice = Array.from({ length: 150 }, () => 'word').join(' ');
    const fullBrief = `# EP\n\n## VOICE\n${voice}\n`;
    const estimate = async (kit: string) =>
      (
        await db.pool.query<{ minutes: string }>(
          `SELECT duration_selection($1::jsonb)->>'voice_minutes' AS minutes`,
          [JSON.stringify({ topic: 'x', full_brief: fullBrief, kit })],
        )
      ).rows[0]!.minutes;
    expect(Number(await estimate('test-en'))).toBe(1);
    expect(Number(await estimate('whatif'))).toBe(0.8);
  });
});

describe('the English kit whatif-en (D-092)', () => {
  test('is English and gets the English cast even when the brief names none', async () => {
    const video = await submit('lang-kit-en-1', {
      format: 'episode',
      topic: 'What if you could stop time?',
      kit: 'whatif-en',
    });
    expect(await videoLanguage(video.videoId)).toBe('en');
    const brief = await db.pool.query<{ cast: string }>(
      `SELECT brief->>'character_set' AS cast FROM video_version WHERE id = $1`,
      [video.versionId],
    );
    expect(brief.rows[0]!.cast).toBe('chip-en');
  });

  test('a cast of the other language is replaced by one of the kit language', async () => {
    const normalized = async (brief: object) =>
      (
        await db.pool.query<{ cast: string }>(
          `SELECT episode_brief_normalize($1::jsonb)->>'character_set' AS cast`,
          [JSON.stringify({ format: 'episode', topic: 'x x x', ...brief })],
        )
      ).rows[0]!.cast;
    expect(await normalized({ kit: 'whatif-en', character_set: 'chip' })).toBe('chip-en');
    expect(await normalized({ kit: 'whatif', character_set: 'chip-en' })).toBe('chip');
    expect(await normalized({ kit: 'science', character_set: 'chip-science' })).toBe(
      'chip-science',
    );
  });

  test('catalog_option mirrors remotion/catalog.json languages', async () => {
    const catalog = loadCatalog();
    const rows = await db.pool.query<{ slug: string; language: string }>(
      `SELECT slug, language FROM catalog_option WHERE kind = 'kit' AND slug <> 'test-en'`,
    );
    expect(Object.fromEntries(rows.rows.map((r) => [r.slug, r.language]))).toEqual(
      Object.fromEntries(Object.entries(catalog.kits).map(([slug, kit]) => [slug, kit.language])),
    );
    const sets = await db.pool.query<{ slug: string }>(
      `SELECT slug FROM catalog_option WHERE kind = 'character_set' ORDER BY slug`,
    );
    expect(sets.rows.map((r) => r.slug)).toEqual(Object.keys(catalog.characterSets).sort());
  });
});
