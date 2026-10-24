import { readFile } from 'node:fs/promises';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db.js';
import { createBatch, createJob, createVideo } from '../helpers/fixtures.js';

const GRANTS_SQL = new URL('../../../ops/postgres/grants.sql', import.meta.url);

let db: TestDb;
let jobId: string;

async function ensureRole(role: string): Promise<void> {
  // Roles are cluster-wide and other test files may create them concurrently.
  await db.pool.query(`
    DO $$ BEGIN
      CREATE ROLE ${role} NOLOGIN;
    EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL;
    END $$;`);
}

async function asRole<T>(role: string, work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL ROLE ${role}`);
    return await work(client);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

beforeAll(async () => {
  db = await createTestDb();
  await ensureRole('aivideo_n8n');
  await ensureRole('aivideo_worker');
  await db.pool.query(await readFile(GRANTS_SQL, 'utf8'));

  const batchId = await createBatch(db.pool);
  const { versionId } = await createVideo(db.pool, batchId, 1);
  jobId = await createJob(db.pool, versionId, 'simulate', { stream: 'q:grants' });
  await db.pool.query(`SELECT * FROM dispatch_claim('q:grants', 1)`);
});

afterAll(async () => {
  await db.drop();
});

describe('worker role', () => {
  test('can run the job lifecycle functions', async () => {
    const started = await asRole('aivideo_worker', (client) =>
      client.query(`SELECT * FROM job_start($1, 'mac-mini-m4', 60)`, [jobId]),
    );
    expect(started.rows).toHaveLength(1);
  });

  test('cannot read tables directly', async () => {
    await expect(
      asRole('aivideo_worker', (client) => client.query('SELECT * FROM job')),
    ).rejects.toThrow(/permission denied/);
  });

  test('cannot dispatch or cancel jobs', async () => {
    await expect(
      asRole('aivideo_worker', (client) => client.query('SELECT * FROM dispatch_all()')),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asRole('aivideo_worker', (client) => client.query(`SELECT job_cancel($1, 'x')`, [jobId])),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('n8n role', () => {
  test('can dispatch and run the watchdog', async () => {
    await asRole('aivideo_n8n', async (client) => {
      await client.query('SELECT * FROM dispatch_all()');
      await client.query('SELECT watchdog_run()');
    });
  });

  test('cannot delete pipeline data or rewrite the audit log', async () => {
    await expect(
      asRole('aivideo_n8n', (client) => client.query('DELETE FROM job')),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asRole('aivideo_n8n', (client) => client.query(`UPDATE audit_log SET actor = 'x'`)),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('public', () => {
  test('has no access to functions', async () => {
    const result = await db.pool.query(`
      SELECT count(*)::int AS n
      FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
      WHERE ns.nspname = 'public' AND has_function_privilege('public', p.oid, 'EXECUTE')`);
    expect(result.rows[0].n).toBe(0);
  });
});
