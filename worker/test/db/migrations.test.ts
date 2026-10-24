import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { createTestDb, runDbmate, type TestDb } from '../helpers/db.js';

const MIGRATION_COUNT = readdirSync(
  fileURLToPath(new URL('../../../db/migrations', import.meta.url)),
).filter((file) => file.endsWith('.sql')).length;

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(async () => {
  await db.drop();
});

async function publicTableCount(): Promise<number> {
  const result = await db.pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migrations'`,
  );
  return result.rows[0]!.n;
}

test('every migration rolls back cleanly and re-applies', async () => {
  const tablesAfterUp = await publicTableCount();
  expect(tablesAfterUp).toBeGreaterThan(0);

  for (let i = 0; i < MIGRATION_COUNT; i += 1) {
    await runDbmate(db.url, ['rollback']);
  }
  expect(await publicTableCount()).toBe(0);

  await runDbmate(db.url, ['up']);
  expect(await publicTableCount()).toBe(tablesAfterUp);
});
