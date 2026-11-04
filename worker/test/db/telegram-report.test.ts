import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db.js';
import { createBatch, createJob, createVideo, type VideoFixture } from '../helpers/fixtures.js';

// /report (D-099) from the database, and `<id>@<version>` in video_ref, which binds a /v button to
// the version its card showed.

const APPROVER = 111;
const STRANGER = 999;
const WORKER = 'mac-mini-m4';

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
  await db.pool.query(`INSERT INTO approver (telegram_user_id, name) VALUES ($1, 'a')`, [APPROVER]);
  await db.pool.query(`INSERT INTO worker (id) VALUES ($1) ON CONFLICT DO NOTHING`, [WORKER]);
});

afterAll(async () => {
  await db.drop();
});

beforeEach(async () => {
  await forced(async () => {
    await db.pool.query(`DELETE FROM cost_entry`);
    await db.pool.query(`DELETE FROM job_attempt`);
    await db.pool.query(`DELETE FROM approval`);
    await db.pool.query(`UPDATE video_version SET status = 'CANCELLED', updated_at = '2020-01-01'`);
  });
});

/** Writes past the status guards, to set up a state many steps away. */
async function forced(work: () => Promise<void>): Promise<void> {
  await db.pool.query('ALTER TABLE video_version DISABLE TRIGGER USER');
  await db.pool.query('ALTER TABLE job DISABLE TRIGGER USER');
  try {
    await work();
  } finally {
    await db.pool.query('ALTER TABLE video_version ENABLE TRIGGER USER');
    await db.pool.query('ALTER TABLE job ENABLE TRIGGER USER');
  }
}

async function video(status: string, age = '1 minute'): Promise<VideoFixture> {
  const fixture = await createVideo(db.pool, await createBatch(db.pool, 'report'), 1);
  await forced(async () => {
    await db.pool.query(
      `UPDATE video_version SET status = $2, updated_at = now() - $3::interval WHERE id = $1`,
      [fixture.versionId, status, age],
    );
  });
  return fixture;
}

async function cost(versionId: string, amount: number, kind = 'ACTUAL', age = '1 minute') {
  await db.pool.query(
    `INSERT INTO cost_entry (video_version_id, kind, units, unit_price, amount, currency, created_at)
     VALUES ($1, $2, 1, $3, $3, 'CRD', now() - $4::interval)`,
    [versionId, kind, amount, age],
  );
}

/** Gives a version the final render and QA that /report reads the duration from. */
async function finalQa(versionId: string, seconds: number): Promise<void> {
  const render = await createJob(db.pool, versionId, 'render_final', { stream: 'q:render' });
  const qa = await createJob(db.pool, versionId, 'qa_final', { stream: 'q:render' });
  await forced(async () => {
    await db.pool.query(`UPDATE job SET status = 'SUCCEEDED' WHERE id = $1`, [render]);
    await db.pool.query(
      `UPDATE job SET status = 'SUCCEEDED', input = $2, output = $3 WHERE id = $1`,
      [
        qa,
        JSON.stringify({ render_job_id: render }),
        JSON.stringify({ result: { duration_seconds: seconds } }),
      ],
    );
  });
}

interface ReportRow {
  allowed: boolean;
  period: string | null;
  since: Date | null;
  created: number;
  completed: number;
  failed: number;
  cancelled: number;
  active: number;
  stopped: number;
  cost: Record<string, number>;
  minutes: number;
  minutes_videos: number;
  completed_cost: Record<string, number>;
  steps: { step: string; runs: number; median_seconds: number }[];
  approvals: { decided: number; median_seconds: number | null };
}

async function report(period = 'today', user = APPROVER): Promise<ReportRow> {
  return (await db.pool.query<ReportRow>('SELECT * FROM telegram_report($1, $2)', [user, period]))
    .rows[0]!;
}

describe('telegram_report', () => {
  test('refuses strangers', async () => {
    const row = await report('today', STRANGER);
    expect(row.allowed).toBe(false);
    expect(row.period).toBeNull();
  });

  test('counts videos by outcome in the period, and what is active now', async () => {
    await video('COMPLETED');
    await video('COMPLETED', '10 days');
    await video('FAILED');
    await video('CANCELLED');
    await video('SCRIPTING');
    await video('NEEDS_DECISION');

    const row = await report('7d');

    expect(row).toMatchObject({
      allowed: true,
      period: '7d',
      completed: 1,
      failed: 1,
      cancelled: 1,
    });
    expect(row.active).toBe(2);
    expect(row.stopped).toBe(1);
    expect(row.created).toBeGreaterThanOrEqual(6);
  });

  test('sums actual costs in the period, never estimates', async () => {
    const { versionId } = await video('SCRIPTING');
    await cost(versionId, 5);
    await cost(versionId, 2.5);
    await cost(versionId, 100, 'ESTIMATE');
    await cost(versionId, 100, 'ACTUAL', '10 days');

    expect((await report('7d')).cost).toEqual({ CRD: 7.5 });
    expect((await report('30d')).cost).toEqual({ CRD: 107.5 });
  });

  test('today starts at midnight in Vietnam, not 24 hours ago', async () => {
    const row = await report('today');
    const vietnam = new Date(row.since!.getTime() + 7 * 3_600_000);
    expect(vietnam.getUTCHours()).toBe(0);
    expect(vietnam.getUTCMinutes()).toBe(0);
    expect(Date.now() - row.since!.getTime()).toBeLessThan(24 * 3_600_000);
  });

  test('cost per minute uses only completed videos with a known duration', async () => {
    const measured = await video('COMPLETED');
    await finalQa(measured.versionId, 120);
    await cost(measured.versionId, 10);
    const unknown = await video('COMPLETED');
    await cost(unknown.versionId, 50);

    const row = await report('7d');

    expect(row.minutes).toBe(2);
    expect(row.minutes_videos).toBe(1);
    expect(row.completed_cost).toEqual({ CRD: 10 });
    expect(row.cost).toEqual({ CRD: 60 });
  });

  test('reports the slowest steps by median run time, at most 5', async () => {
    const { versionId } = await video('SCRIPTING');
    for (const [index, step] of ['a', 'b', 'c', 'd', 'e', 'f'].entries()) {
      const job = await createJob(db.pool, versionId, step);
      await db.pool.query(
        `INSERT INTO job_attempt (job_id, attempt_no, worker_id, status, started_at, finished_at)
         VALUES ($1, 1, $2, 'SUCCEEDED', now() - interval '1 hour',
                 now() - interval '1 hour' + make_interval(secs => $3))`,
        [job, WORKER, (index + 1) * 60],
      );
    }

    const row = await report('7d');

    expect(row.steps.map((s) => s.step)).toEqual(['f', 'e', 'd', 'c', 'b']);
    expect(row.steps[0]).toMatchObject({ runs: 1, median_seconds: 360 });
  });

  test('reports the median wait of decided approvals', async () => {
    const { versionId } = await video('SCRIPTING');
    await db.pool.query(
      `INSERT INTO approval (video_version_id, type, payload_hash, token, status, requested_at, decided_at, expires_at)
       VALUES ($1, 'SCRIPT', 'h', 'tok-report-1', 'APPROVED', now() - interval '2 hours',
               now() - interval '1 hour', now() + interval '1 day')`,
      [versionId],
    );

    expect((await report('7d')).approvals).toEqual({ decided: 1, median_seconds: 3600 });
  });

  test('an empty period answers zeros, not nulls', async () => {
    const row = await report('today');
    expect(row).toMatchObject({ completed: 0, cost: {}, minutes: 0, minutes_videos: 0, steps: [] });
    expect(row.approvals).toEqual({ decided: 0, median_seconds: null });
  });
});

describe('video_ref with a version', () => {
  const ref = async (value: string) =>
    (await db.pool.query<{ ref: string }>('SELECT video_ref($1) AS ref', [value])).rows[0]!.ref;

  test('resolves to the id while that version is current', async () => {
    const { videoId } = await video('SCRIPTING');
    expect(await ref(`${videoId}@1`)).toBe(videoId);
  });

  test('answers stale for another version, which the commands treat as not found', async () => {
    const { videoId } = await video('SCRIPTING');
    expect(await ref(`${videoId}@2`)).toBe('stale');
    const row = await db.pool.query<{ result: string }>(
      'SELECT * FROM telegram_auto($1, video_ref($2), true)',
      [APPROVER, `${videoId}@2`],
    );
    expect(row.rows[0]!.result).toBe('NOT_FOUND');
  });

  test('answers stale for an unknown video', async () => {
    expect(await ref('00000000-0000-4000-8000-000000000000@1')).toBe('stale');
  });

  test('still passes prefixes through and resolves last', async () => {
    const { videoId } = await video('SCRIPTING');
    expect(await ref('abcd1234')).toBe('abcd1234');
    expect(await ref('last')).toBe(videoId);
  });
});
