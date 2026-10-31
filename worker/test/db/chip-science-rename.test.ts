import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestDb, runDbmate, type TestDb } from '../helpers/db.js';
import { OWNER } from '../helpers/episode-flow.js';

// D-078: the science character set `bip` becomes `chip-science` ("Chíp Khoa học"); briefs, drafts
// and job inputs made before the migration follow, and the rollback restores them.

const MIGRATION = '20261112000100';
/** Rollbacks that undo this migration and every later one. */
const ROLLBACKS = readdirSync(
  fileURLToPath(new URL('../../../db/migrations', import.meta.url)),
).filter((file) => file.endsWith('.sql') && file >= MIGRATION).length;

let db: TestDb;

async function rollbackRename(): Promise<void> {
  for (let i = 0; i < ROLLBACKS; i += 1) await runDbmate(db.url, ['rollback']);
}

beforeAll(async () => {
  db = await createTestDb();
  await db.pool.query(`INSERT INTO approver (telegram_user_id, name) VALUES ($1, 'owner')`, [
    OWNER,
  ]);
});

afterAll(async () => {
  await db.drop();
});

interface Slugs {
  version: string;
  scriptBrief: string;
  draft: string;
}

async function slugs(versionId: string, draftToken: string): Promise<Slugs> {
  const result = await db.pool.query<Slugs>(
    `SELECT vv.brief->>'character_set' AS version,
            j.input->'brief'->>'character_set' AS "scriptBrief",
            d.brief->>'character_set' AS draft
     FROM video_version vv
     JOIN job j ON j.video_version_id = vv.id AND j.step = 'script'
     CROSS JOIN intake_draft d
     WHERE vv.id = $1 AND d.token = $2`,
    [versionId, draftToken],
  );
  return result.rows[0]!;
}

async function characterSetOption(): Promise<{ slug: string; label: string }[]> {
  const result = await db.pool.query<{ slug: string; label: string }>(
    `SELECT slug, label FROM catalog_option WHERE kind = 'character_set' ORDER BY sort_order`,
  );
  return result.rows;
}

describe('chip-science migration', () => {
  test('renames the option and rewrites existing briefs, drafts and job inputs', async () => {
    await rollbackRename();
    const brief = { format: 'episode', topic: 'Tại sao?', kit: 'science', character_set: 'bip' };
    const submitted = await db.pool.query<{ version_id: string }>(
      'SELECT * FROM video_submit($1, $2::jsonb)',
      ['rename-1', JSON.stringify(brief)],
    );
    const versionId = submitted.rows[0]!.version_id;
    const drafted = await db.pool.query<{ token: string }>(
      'SELECT * FROM telegram_intake_draft($1, $2, $3::jsonb)',
      [OWNER, '-1001234567890', JSON.stringify(brief)],
    );
    const token = drafted.rows[0]!.token;

    await runDbmate(db.url, ['up']);
    expect(await characterSetOption()).toEqual([
      { slug: 'chip', label: 'Chíp (BẠN)' },
      { slug: 'chip-science', label: 'Chíp Khoa học' },
    ]);
    expect(await slugs(versionId, token)).toEqual({
      version: 'chip-science',
      scriptBrief: 'chip-science',
      draft: 'chip-science',
    });

    await rollbackRename();
    expect(await characterSetOption()).toEqual([
      { slug: 'chip', label: 'Chíp (BẠN)' },
      { slug: 'bip', label: 'Bíp' },
    ]);
    expect(await slugs(versionId, token)).toEqual({
      version: 'bip',
      scriptBrief: 'bip',
      draft: 'bip',
    });
    await runDbmate(db.url, ['up']);
  });

  test('the old slug is no longer accepted', async () => {
    await expect(
      db.pool.query('SELECT brief_normalize($1::jsonb)', [
        JSON.stringify({ format: 'episode', topic: 'Tại sao?', character_set: 'bip' }),
      ]),
    ).rejects.toThrow(/unknown character_set "bip"/);
  });
});
