import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db.js';

// D-080: an episode gets the aspect ratio of its kit (whatif 16:9, science 9:16); Shorts stay 9:16.

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(async () => {
  await db.drop();
});

async function submit(id: string, brief: object): Promise<string> {
  const submitted = await db.pool.query<{ video_id: string }>(
    'SELECT * FROM video_submit($1, $2::jsonb)',
    [id, JSON.stringify(brief)],
  );
  const video = await db.pool.query<{ aspect_ratio: string }>(
    'SELECT aspect_ratio FROM video WHERE id = $1',
    [submitted.rows[0]!.video_id],
  );
  return video.rows[0]!.aspect_ratio;
}

describe('aspect ratio by kit', () => {
  test('an episode takes the frame of its kit', async () => {
    expect(await submit('ar-1', { format: 'episode', topic: 'Nếu bạn bay được?' })).toBe('16:9');
    expect(
      await submit('ar-2', {
        format: 'episode',
        topic: 'Chíp ơi, tại sao nước sôi?',
        kit: 'science',
        character_set: 'chip-science',
      }),
    ).toBe('9:16');
  });

  test('every kit has an aspect ratio and character sets have none', async () => {
    const rows = await db.pool.query<{ kind: string; slug: string; aspect_ratio: string | null }>(
      'SELECT kind, slug, aspect_ratio FROM catalog_option ORDER BY kind, sort_order',
    );
    expect(rows.rows).toEqual([
      { kind: 'character_set', slug: 'chip', aspect_ratio: null },
      { kind: 'character_set', slug: 'chip-science', aspect_ratio: null },
      { kind: 'kit', slug: 'whatif', aspect_ratio: '16:9' },
      { kind: 'kit', slug: 'science', aspect_ratio: '9:16' },
    ]);
    await expect(
      db.pool.query(`UPDATE catalog_option SET aspect_ratio = NULL WHERE slug = 'science'`),
    ).rejects.toThrow(/catalog_option_kit_aspect_ratio/);
  });
});
