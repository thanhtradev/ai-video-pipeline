import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db.js';
import { createBatch, createJob, createVideo, jobStatus } from '../helpers/fixtures.js';

// /deploy (D-100): the owner rolls origin/main out to the workers and n8n, one target at a time,
// only when the database already has every migration on that commit, and each worker only once it
// has nothing running. All state is here; the deployer process only runs the commands.

const OWNER = 111;
const APPROVER = 222;
const STRANGER = 999;
const A = 'worker-a';
const B = 'worker-b';
const OFFLINE = 'worker-off';
const SHA = 'a'.repeat(40);
const SHA2 = 'b'.repeat(40);

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
  await db.pool.query(
    `INSERT INTO approver (telegram_user_id, name, is_owner) VALUES ($1, 'owner', true), ($2, 'a', false)`,
    [OWNER, APPROVER],
  );
});

afterAll(async () => {
  await db.drop();
});

beforeEach(async () => {
  await db.pool.query(`DELETE FROM deploy_target`);
  await db.pool.query(`DELETE FROM deploy_request`);
  await db.pool.query(`DELETE FROM command_confirm`);
  await db.pool.query(
    `UPDATE job SET status = 'CANCELLED', lease_expires_at = NULL
     WHERE status NOT IN ('SUCCEEDED', 'CANCELLED')`,
  );
  await db.pool.query(`DELETE FROM worker`);
  await db.pool.query(
    `INSERT INTO worker (id, last_seen_at) VALUES ($1, now()), ($2, now()), ($3, now() - interval '1 hour')`,
    [A, B, OFFLINE],
  );
});

interface PollRow {
  action: string;
  request_id: string | null;
  sha: string | null;
  last_sha: string | null;
  target: string | null;
}

interface NoticeRow {
  kind: string;
  request_id: string;
  status: string;
  sha: string | null;
  commits: string | null;
  detail: string | null;
  missing: string[] | null;
  targets: { target: string; status: string; detail: string | null }[] | null;
  token: string | null;
}

const deploy = async (user = OWNER) =>
  (
    await db.pool.query<{
      result: string;
      status: string | null;
      sha: string | null;
      targets: { target: string; status: string }[] | null;
    }>('SELECT * FROM telegram_deploy($1)', [user])
  ).rows[0]!;

const poll = async (worker: string, canN8n = false) =>
  (await db.pool.query<PollRow>('SELECT * FROM deploy_poll($1, $2)', [worker, canN8n])).rows[0]!;

const preflight = async (
  request: string,
  { sha = SHA, migrations = [] as string[], error = null as string | null } = {},
) =>
  (
    await db.pool.query<{ status: string }>(
      `SELECT deploy_preflight_report($1, $2, $3, 'abc feat: x', $4, $5) AS status`,
      [A, request, sha, migrations, error],
    )
  ).rows[0]!.status;

const report = async (worker: string, request: string, target: string, ok = true, detail = '') =>
  (
    await db.pool.query<{ accepted: boolean }>(
      'SELECT deploy_target_report($1, $2, $3, $4, $5) AS accepted',
      [worker, request, target, ok, detail],
    )
  ).rows[0]!.accepted;

const notices = async () =>
  (await db.pool.query<NoticeRow>('SELECT * FROM deploy_notices_due()')).rows;

const confirm = async (token: string, user = OWNER, action = 'A') =>
  (
    await db.pool.query<{ result: string; action: string }>(
      'SELECT * FROM telegram_confirm($1, $2, $3)',
      [token, user, action],
    )
  ).rows[0]!;

const requestStatus = async (id: string) =>
  (await db.pool.query<{ status: string }>('SELECT status FROM deploy_request WHERE id = $1', [id]))
    .rows[0]!.status;

const targets = async (id: string) =>
  (
    await db.pool.query<{ target: string; status: string }>(
      'SELECT target, status FROM deploy_target WHERE request_id = $1 ORDER BY position',
      [id],
    )
  ).rows.map((row) => [row.target, row.status]);

/** /deploy up to the point where the rollout runs; returns the request id. */
async function running(sha = SHA): Promise<string> {
  await deploy();
  const { request_id: id } = await poll(A, true);
  await preflight(id!, { sha });
  const notice = (await notices()).find((row) => row.kind === 'CONFIRM')!;
  await confirm(notice.token!);
  return id!;
}

async function queuedJob(): Promise<string> {
  const video = await createVideo(db.pool, await createBatch(db.pool, 'deploy'), 1);
  const job = await createJob(db.pool, video.versionId, 'script');
  await db.pool.query(`UPDATE job SET status = 'QUEUED', queued_at = now() WHERE id = $1`, [job]);
  return job;
}

const start = async (job: string, worker: string) =>
  (await db.pool.query('SELECT * FROM job_start($1, $2, 60)', [job, worker])).rows;

describe('telegram_deploy', () => {
  test.each([
    [APPROVER, 'an approver'],
    [STRANGER, 'a stranger'],
  ])('refuses %i (%s)', async (user) => {
    expect((await deploy(user)).result).toBe('NOT_OWNER');
    expect((await poll(A, true)).action).toBe('NONE');
  });

  test('opens one request; a second answers with the open one', async () => {
    expect((await deploy()).result).toBe('OK');
    expect(await deploy()).toMatchObject({ result: 'OPEN', status: 'PREFLIGHT' });
  });
});

describe('preflight', () => {
  test('only the deployer that can reach n8n runs it, once', async () => {
    await deploy();
    expect((await poll(B, false)).action).toBe('NONE');
    expect((await poll(A, true)).action).toBe('PREFLIGHT');
    expect((await poll(A, true)).action).toBe('NONE');
  });

  test('refuses when main has a migration the database lacks, and names it', async () => {
    await deploy();
    const { request_id: id } = await poll(A, true);
    const applied = (
      await db.pool.query<{ version: string }>(
        'SELECT max(version) AS version FROM schema_migrations',
      )
    ).rows[0]!.version;

    const status = await preflight(id!, { migrations: [applied, '29990101000100'] });

    expect(status).toBe('REFUSED');
    const [notice] = await notices();
    expect(notice).toMatchObject({ kind: 'FINISHED', status: 'REFUSED', token: null });
    expect(notice!.missing).toEqual(['29990101000100']);
  });

  test('asks for Confirm when every migration is applied, once', async () => {
    await deploy();
    const { request_id: id } = await poll(A, true);
    const applied = (
      await db.pool.query<{ version: string }>(
        'SELECT max(version) AS version FROM schema_migrations',
      )
    ).rows[0]!.version;

    expect(await preflight(id!, { migrations: [applied] })).toBe('AWAITING_CONFIRM');

    const [notice] = await notices();
    expect(notice).toMatchObject({ kind: 'CONFIRM', sha: SHA, commits: 'abc feat: x' });
    expect(notice!.token).toMatch(/^[0-9a-f]{32}$/);
    expect(await notices()).toEqual([]);
  });

  test('a preflight error refuses with the detail', async () => {
    await deploy();
    const { request_id: id } = await poll(A, true);

    expect(await preflight(id!, { error: 'ssh pve failed' })).toBe('REFUSED');
    expect((await notices())[0]).toMatchObject({ status: 'REFUSED', detail: 'ssh pve failed' });
  });

  test('refuses a malformed commit id', async () => {
    await deploy();
    const { request_id: id } = await poll(A, true);
    expect(await preflight(id!, { sha: 'main; rm -rf /' })).toBe('REFUSED');
  });

  test('a refused request lets a new /deploy open', async () => {
    await deploy();
    const { request_id: id } = await poll(A, true);
    await preflight(id!, { error: 'x' });

    expect((await deploy()).result).toBe('OK');
  });

  test('times out when no deployer answers', async () => {
    await deploy();
    await db.pool.query(`UPDATE deploy_request SET state_since = now() - interval '6 minutes'`);

    const [notice] = await notices();

    expect(notice).toMatchObject({ kind: 'FINISHED', status: 'REFUSED' });
    expect(notice!.detail).toContain('deployer');
  });
});

describe('Confirm', () => {
  async function awaiting(): Promise<{ id: string; token: string }> {
    await deploy();
    const { request_id: id } = await poll(A, true);
    await preflight(id!);
    return { id: id!, token: (await notices())[0]!.token! };
  }

  test('nothing rolls out before it', async () => {
    await awaiting();
    expect((await poll(A, true)).action).toBe('NONE');
    expect((await poll(B)).action).toBe('NONE');
  });

  test('only the owner who asked can confirm', async () => {
    const { id, token } = await awaiting();
    expect((await confirm(token, APPROVER)).result).toBe('NOT_REQUESTER');
    expect(await requestStatus(id)).toBe('AWAITING_CONFIRM');
  });

  test('a requester who is no longer owner cannot confirm', async () => {
    const { id, token } = await awaiting();
    await db.pool.query('UPDATE approver SET is_owner = false WHERE telegram_user_id = $1', [
      OWNER,
    ]);
    try {
      expect((await confirm(token)).result).toBe('NOT_ALLOWED');
      expect(await requestStatus(id)).toBe('AWAITING_CONFIRM');
    } finally {
      await db.pool.query('UPDATE approver SET is_owner = true WHERE telegram_user_id = $1', [
        OWNER,
      ]);
    }
  });

  test('Bỏ qua cancels the request and frees the slot', async () => {
    const { id, token } = await awaiting();
    expect((await confirm(token, OWNER, 'R')).result).toBe('REJECTED');
    expect(await requestStatus(id)).toBe('CANCELLED');
    expect((await deploy()).result).toBe('OK');
  });

  test('pressing it late cancels the request', async () => {
    const { id, token } = await awaiting();
    await db.pool.query(
      `UPDATE command_confirm SET expires_at = now() - interval '1 second' WHERE token = $1`,
      [token],
    );
    expect((await confirm(token)).result).toBe('EXPIRED');
    expect(await requestStatus(id)).toBe('CANCELLED');
  });

  test('not pressing it cancels the request too', async () => {
    const { id, token } = await awaiting();
    await db.pool.query(
      `UPDATE command_confirm SET expires_at = now() - interval '1 second' WHERE token = $1`,
      [token],
    );
    await notices();
    expect(await requestStatus(id)).toBe('CANCELLED');
  });

  test('it builds the rollout: online workers in order, offline skipped, n8n last', async () => {
    const { id, token } = await awaiting();

    expect(await confirm(token)).toMatchObject({ result: 'OK', action: 'DEPLOY' });

    expect(await requestStatus(id)).toBe('RUNNING');
    expect(await targets(id)).toEqual([
      [A, 'WAITING'],
      [B, 'WAITING'],
      ['n8n', 'WAITING'],
      [OFFLINE, 'SKIPPED'],
    ]);
  });
});

describe('rolling update', () => {
  test('runs one target at a time, bound to the confirmed commit', async () => {
    const id = await running();

    expect((await poll(B)).action).toBe('NONE');
    expect(await poll(A, true)).toMatchObject({ action: 'UPDATE_WORKER', sha: SHA, target: A });
    expect((await poll(B)).action).toBe('NONE');
    expect((await poll(A, true)).action).toBe('NONE');
    expect(await report(A, id, A)).toBe(true);

    expect((await poll(A, true)).action).toBe('NONE');
    expect(await poll(B)).toMatchObject({ action: 'UPDATE_WORKER', sha: SHA, target: B });
    expect(await report(B, id, B)).toBe(true);

    expect((await poll(B, false)).action).toBe('NONE');
    expect(await poll(A, true)).toMatchObject({ action: 'UPDATE_N8N', sha: SHA, last_sha: null });
    expect(await report(A, id, 'n8n')).toBe(true);

    expect(await requestStatus(id)).toBe('SUCCEEDED');
    const [notice] = await notices();
    expect(notice).toMatchObject({ kind: 'FINISHED', status: 'SUCCEEDED', sha: SHA });
    expect(notice!.targets!.map((t) => [t.target, t.status])).toEqual([
      [A, 'DONE'],
      [B, 'DONE'],
      ['n8n', 'DONE'],
      [OFFLINE, 'SKIPPED'],
    ]);
    expect(await notices()).toEqual([]);
  });

  test('tells n8n the last commit that went out, to skip it when unchanged', async () => {
    const first = await running(SHA);
    for (const [worker, target] of [
      [A, A],
      [B, B],
      [A, 'n8n'],
    ] as const) {
      await poll(worker, worker === A);
      await report(worker, first, target);
    }
    await notices();

    const second = await running(SHA2);
    await poll(A, true);
    await report(A, second, A);
    await poll(B);
    await report(B, second, B);

    expect(await poll(A, true)).toMatchObject({ action: 'UPDATE_N8N', sha: SHA2, last_sha: SHA });
  });

  test('a worker waits for its running job and takes no new one meanwhile', async () => {
    const busy = await queuedJob();
    expect(await start(busy, A)).toHaveLength(1);
    const id = await running();

    expect((await poll(A, true)).action).toBe('NONE');
    expect(await targets(id)).toContainEqual([A, 'DRAINING']);

    // A new job for this worker goes back unspent; another worker can still take it.
    const next = await queuedJob();
    expect(await start(next, A)).toEqual([]);
    expect(await jobStatus(db.pool, next)).toBe('READY');
    const attempts = await db.pool.query<{ attempt_count: number }>(
      'SELECT attempt_count FROM job WHERE id = $1',
      [next],
    );
    expect(attempts.rows[0]!.attempt_count).toBe(0);
    const other = await queuedJob();
    expect(await start(other, B)).toHaveLength(1);

    await db.pool.query(`SELECT job_succeed($1, $2, '{"outputs":[]}'::jsonb)`, [busy, A]);
    expect(await poll(A, true)).toMatchObject({ action: 'UPDATE_WORKER', target: A });
  });

  test('a worker waits for a video move it is part of', async () => {
    const id = await running();
    const video = await createVideo(db.pool, await createBatch(db.pool, 'deploy-move'), 1);
    await db.pool.query(
      `INSERT INTO video_move (video_id, from_worker, to_worker, status, requested_by)
       VALUES ($1, $2, $3, 'COPYING', $4)`,
      [video.videoId, B, A, OWNER],
    );

    expect((await poll(A, true)).action).toBe('NONE');
    expect(await targets(id)).toContainEqual([A, 'DRAINING']);

    await db.pool.query(`UPDATE video_move SET status = 'DONE' WHERE video_id = $1`, [
      video.videoId,
    ]);
    expect((await poll(A, true)).action).toBe('UPDATE_WORKER');
  });

  test('takes jobs again once its update is done', async () => {
    const id = await running();
    await poll(A, true);
    await report(A, id, A);

    const job = await queuedJob();
    expect(await start(job, A)).toHaveLength(1);
  });

  test('a failure stops the rollout, ends draining and reports the detail', async () => {
    const id = await running();
    await poll(A, true);

    expect(await report(A, id, A, false, 'npm ci failed')).toBe(true);

    expect(await requestStatus(id)).toBe('FAILED');
    expect(await targets(id)).toEqual([
      [A, 'FAILED'],
      [B, 'CANCELLED'],
      ['n8n', 'CANCELLED'],
      [OFFLINE, 'SKIPPED'],
    ]);
    expect((await poll(B)).action).toBe('NONE');
    const job = await queuedJob();
    expect(await start(job, A)).toHaveLength(1);
    const [notice] = await notices();
    expect(notice).toMatchObject({ kind: 'FINISHED', status: 'FAILED' });
    expect(notice!.targets![0]).toMatchObject({ target: A, detail: 'npm ci failed' });
    expect((await deploy()).result).toBe('OK');
  });

  test('ignores a report from the wrong worker or for a target not updating', async () => {
    const id = await running();
    await poll(A, true);

    expect(await report(B, id, A)).toBe(false);
    expect(await report(B, id, B)).toBe(false);
    expect(await report(A, id, 'n8n')).toBe(false);
    expect(await targets(id)).toContainEqual([A, 'UPDATING']);
  });

  test('a worker without n8n rights never gets the n8n target', async () => {
    const id = await running();
    await poll(A, true);
    await report(A, id, A);
    await poll(B);
    await report(B, id, B);

    expect((await poll(B, false)).action).toBe('NONE');
    expect(await targets(id)).toContainEqual(['n8n', 'WAITING']);
  });
});

describe('timeouts', () => {
  async function aged(status: string, age: string): Promise<string> {
    const id = await running();
    await db.pool.query(
      `UPDATE deploy_target SET status = $2, state_since = now() - $3::interval
       WHERE request_id = $1 AND target = $4`,
      [id, status, age, A],
    );
    return id;
  }

  test.each([
    ['WAITING', '11 minutes', 'no deployer'],
    ['DRAINING', '121 minutes', 'still busy'],
    ['UPDATING', '31 minutes', 'no result'],
  ])('%s older than %s fails the rollout', async (status, age, detail) => {
    const id = await aged(status, age);

    const notice = (await notices()).find((row) => row.status === 'FAILED')!;

    expect(await requestStatus(id)).toBe('FAILED');
    expect(notice.targets![0]!.detail).toContain(detail);
    expect(await targets(id)).toContainEqual([B, 'CANCELLED']);
  });

  test.each([
    ['WAITING', '9 minutes'],
    ['DRAINING', '119 minutes'],
    ['UPDATING', '29 minutes'],
  ])('%s at %s keeps going', async (status, age) => {
    const id = await aged(status, age);
    await notices();
    expect(await requestStatus(id)).toBe('RUNNING');
  });

  test('a late report after a timeout changes nothing', async () => {
    const id = await aged('UPDATING', '31 minutes');
    await notices();

    expect(await report(A, id, A)).toBe(false);
    expect(await requestStatus(id)).toBe('FAILED');
  });
});
