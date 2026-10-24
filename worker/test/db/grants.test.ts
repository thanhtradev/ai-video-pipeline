import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db.js';
import { createBatch, createJob, createVideo } from '../helpers/fixtures.js';

const GRANTS_SQL = new URL('../../../ops/postgres/grants.sql', import.meta.url);
// Test-only login for the per-machine worker role (ops/postgres/bootstrap.sql naming).
const WORKER_LOGIN = 'aivideo_worker_mac_mini_m4';
const WORKER_LOGIN_PASSWORD = 'local-test-only';

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

async function ensureWorkerLogin(): Promise<void> {
  await db.pool.query(`
    DO $$ BEGIN
      CREATE ROLE ${WORKER_LOGIN} LOGIN IN ROLE aivideo_worker;
    EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL;
    END $$;`);
  await db.pool.query(`ALTER ROLE ${WORKER_LOGIN} PASSWORD '${WORKER_LOGIN_PASSWORD}'`);
}

/** Connects with the real worker login, so session_user is the worker role (not a superuser). */
async function asWorkerLogin<T>(work: (client: pg.Client) => Promise<T>): Promise<T> {
  const url = new URL(db.url);
  url.username = WORKER_LOGIN;
  url.password = WORKER_LOGIN_PASSWORD;
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

async function queuedJob(stream: string): Promise<string> {
  const batchId = await createBatch(db.pool);
  const { versionId } = await createVideo(db.pool, batchId, 1);
  const id = await createJob(db.pool, versionId, 'simulate', { stream });
  await db.pool.query('SELECT * FROM dispatch_claim($1, 1)', [stream]);
  return id;
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
  await ensureWorkerLogin();
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

  test('can hand a job back when a provider is blocked', async () => {
    const id = await queuedJob('q:block');
    const status = await asRole('aivideo_worker', async (client) => {
      await client.query(`SELECT * FROM job_start($1, 'mac-mini-m4', 60)`, [id]);
      return client.query<{ job_block: string }>(
        `SELECT job_block($1, 'mac-mini-m4', 'usage limit', 3600)`,
        [id],
      );
    });
    expect(status.rows[0]!.job_block).toBe('BLOCKED');
  });

  test('can ask the cost guard but not change prices', async () => {
    const id = await queuedJob('q:cost');
    const guard = await asRole('aivideo_worker', async (client) => {
      await client.query(`SELECT * FROM job_start($1, 'mac-mini-m4', 60)`, [id]);
      return client.query<{ decision: string }>(
        `SELECT decision FROM cost_guard($1, 'mac-mini-m4', 10)`,
        [id],
      );
    });
    expect(guard.rows[0]!.decision).toBe('DISABLED');
    await expect(
      asRole('aivideo_worker', (client) =>
        client.query('UPDATE provider_price SET unit_price = 0'),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  test('cannot submit briefs or decide approvals', async () => {
    await expect(
      asRole('aivideo_worker', (client) =>
        client.query(`SELECT * FROM video_submit('w', '{"topic":"abc","duration_seconds":30}')`),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asRole('aivideo_worker', (client) =>
        client.query(`SELECT * FROM approval_telegram_decide('t', 1, 'APPROVE')`),
      ),
    ).rejects.toThrow(/permission denied/);
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

describe('worker login identity (D-010)', () => {
  test('may act as its own worker id', async () => {
    const id = await queuedJob('q:identity-ok');
    const started = await asWorkerLogin((client) =>
      client.query(`SELECT * FROM job_start($1, 'mac-mini-m4', 60)`, [id]),
    );
    expect(started.rows).toHaveLength(1);
  });

  test('cannot act as another worker', async () => {
    const id = await queuedJob('q:identity-bad');
    await expect(
      asWorkerLogin((client) =>
        client.query(`SELECT * FROM job_start($1, 'macbook-pro-m1', 60)`, [id]),
      ),
    ).rejects.toThrow(/worker identity mismatch/);
    await expect(
      asWorkerLogin((client) =>
        client.query(`SELECT job_succeed($1, 'macbook-pro-m1', '{}'::jsonb)`, [id]),
      ),
    ).rejects.toThrow(/worker identity mismatch/);
  });
});

describe('n8n role', () => {
  test('can dispatch and run the watchdog', async () => {
    await asRole('aivideo_n8n', async (client) => {
      await client.query('SELECT * FROM dispatch_all()');
      await client.query('SELECT watchdog_run()');
    });
  });

  test('can run the Phase 2a intake and approval entry points', async () => {
    await asRole('aivideo_n8n', async (client) => {
      await client.query(
        `SELECT * FROM video_submit('grants-form', '{"topic":"abc","duration_seconds":30}')`,
      );
      await client.query('SELECT * FROM script_approvals_due()');
      await client.query(`SELECT * FROM approval_telegram_decide('none', 1, 'APPROVE')`);
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

  test('cannot change the state machine or stream limits', async () => {
    await expect(
      asRole('aivideo_n8n', (client) =>
        client.query(
          `INSERT INTO video_status_transition VALUES ('AWAITING_PREVIEW_APPROVAL', 'ARCHIVING')`,
        ),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asRole('aivideo_n8n', (client) =>
        client.query(`UPDATE job_status_transition SET to_status = 'READY'`),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asRole('aivideo_n8n', (client) =>
        client.query('UPDATE stream_config SET max_in_flight = 99'),
      ),
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
