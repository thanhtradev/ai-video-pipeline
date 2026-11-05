import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db.js';
import { createBatch, createJob, createVideo, type VideoFixture } from '../helpers/fixtures.js';
import { callAsWeb, prepareWebRoles, webSignIn } from '../helpers/web-console.js';

// web_dashboard (D-108): the home page's numbers. Whole Asia/Ho_Chi_Minh days, zero-filled; kits
// resolved as the library does; the last failed steps with whether /retry would take them; and
// status totals that match the Videos page.

const GRANTS_SQL = new URL('../../../ops/postgres/grants.sql', import.meta.url);
const APPROVER = 222;
const WORKER = 'dash-worker';
const INVALID_SESSION = 'WB401';
const ZONE = 'Asia/Ho_Chi_Minh';

interface Day {
  day: string;
  started: number;
  completed: number;
  failed: number;
  cost: Record<string, number>;
}

interface Kit {
  slug: string | null;
  label: string | null;
  started: number;
  completed: number;
  cost: Record<string, number>;
}

interface Failure {
  video_id: string;
  version: number;
  title: string | null;
  step: string;
  status: string;
  error: string | null;
  failed_at: string;
  attempts: number;
  can_retry: boolean;
}

interface Dashboard {
  period: string;
  since: string;
  days: Day[];
  kits: Kit[];
  failures: Failure[];
  status_counts: Record<'stopped' | 'approval' | 'running' | 'waiting' | 'done', number>;
}

let db: TestDb;
let session: string;

beforeAll(async () => {
  db = await createTestDb();
  await prepareWebRoles(db.pool, await readFile(GRANTS_SQL, 'utf8'));
  await db.pool.query(`INSERT INTO approver (telegram_user_id, name) VALUES ($1, 'approver')`, [
    APPROVER,
  ]);
  await db.pool.query(`INSERT INTO worker (id) VALUES ($1) ON CONFLICT DO NOTHING`, [WORKER]);
  session = await webSignIn(db.pool, APPROVER);
});

afterAll(async () => {
  await db.drop();
});

beforeEach(async () => {
  await forced(async () => {
    await db.pool.query(`DELETE FROM cost_entry`);
    await db.pool.query(`DELETE FROM job_attempt`);
    await db.pool.query(`DELETE FROM approval`);
    await db.pool.query(`DELETE FROM job`);
    await db.pool.query(
      `UPDATE video_version SET status = 'CANCELLED', updated_at = '2020-01-01', created_at = '2020-01-01'`,
    );
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

function dashboard(period = 'today'): Promise<Dashboard> {
  return callAsWeb<Dashboard>(db.pool, 'web_dashboard', session, period);
}

/** A local day as YYYY-MM-DD, `offset` days from today in Ho Chi Minh. */
async function localDay(offset = 0): Promise<string> {
  const { rows } = await db.pool.query<{ day: string }>(
    `SELECT to_char(((now() AT TIME ZONE $1)::date + $2::integer), 'YYYY-MM-DD') AS day`,
    [ZONE, offset],
  );
  return rows[0]!.day;
}

/** A timestamp at a local hour on a local day, `dayOffset` days from today. */
function localTime(dayOffset: number, hour: number): string {
  return `(((now() AT TIME ZONE '${ZONE}')::date + ${dayOffset}) + interval '${hour} hours') AT TIME ZONE '${ZONE}'`;
}

async function video(
  status: string,
  options: { createdAt?: string; updatedAt?: string; kit?: string | null } = {},
): Promise<VideoFixture> {
  const fixture = await createVideo(db.pool, await createBatch(db.pool, 'dash'), 1);
  const brief = options.kit === undefined ? { topic: 'test' } : { topic: 'test', kit: options.kit };
  await forced(async () => {
    await db.pool.query(
      `UPDATE video_version
       SET status = $2, brief = $3::jsonb,
           created_at = ${options.createdAt ?? 'now()'},
           updated_at = ${options.updatedAt ?? 'now()'}
       WHERE id = $1`,
      [fixture.versionId, status, JSON.stringify(brief)],
    );
  });
  return fixture;
}

async function cost(
  versionId: string,
  amount: number,
  options: { kind?: string; currency?: string; createdAt?: string } = {},
): Promise<void> {
  await db.pool.query(
    `INSERT INTO cost_entry (video_version_id, kind, units, unit_price, amount, currency, created_at)
     VALUES ($1, $2, 1, $3, $3, $4, ${options.createdAt ?? 'now()'})`,
    [versionId, options.kind ?? 'ACTUAL', amount, options.currency ?? 'CRD'],
  );
}

/**
 * A step that really failed: started by the worker, then failed, as the pipeline does. A retryable
 * failure needs attempts left, or it becomes permanent.
 */
async function failStep(
  versionId: string,
  step: string,
  error: string,
  isRetryable = false,
): Promise<string> {
  const jobId = await createJob(db.pool, versionId, step, { maxAttempts: isRetryable ? 3 : 1 });
  await db.pool.query(`UPDATE job SET status = 'QUEUED', queued_at = now() WHERE id = $1`, [jobId]);
  await db.pool.query('SELECT * FROM job_start($1, $2, 60)', [jobId, WORKER]);
  await db.pool.query('SELECT job_fail($1, $2, $3, $4)', [jobId, WORKER, error, isRetryable]);
  return jobId;
}

describe('access and periods', () => {
  test('refuses a bad session', async () => {
    await expect(
      callAsWeb(db.pool, 'web_dashboard', '0'.repeat(64), 'today'),
    ).rejects.toMatchObject({ code: INVALID_SESSION });
  });

  test('refuses an unknown period', async () => {
    await expect(dashboard('year')).rejects.toThrow(/period/);
  });

  test('today is one zero-filled row for the local day', async () => {
    const result = await dashboard('today');

    expect(result.period).toBe('today');
    expect(result.days).toEqual([
      { day: await localDay(), started: 0, completed: 0, failed: 0, cost: {} },
    ]);
  });

  test.each([
    ['7d', 7],
    ['30d', 30],
  ])('%s is %i consecutive days ending today', async (period, count) => {
    const result = await dashboard(period);

    expect(result.days).toHaveLength(count);
    expect(result.days[count - 1]!.day).toBe(await localDay());
    expect(result.days[0]!.day).toBe(await localDay(1 - count));
    const days = result.days.map((row) => row.day);
    expect([...days].sort()).toEqual(days);
  });
});

describe('days', () => {
  test('counts by the Ho Chi Minh day, not the UTC one', async () => {
    await video('SCRIPTING', { createdAt: localTime(0, 0.5) });
    await video('SCRIPTING', { createdAt: localTime(-1, 23.5) });

    const today = await dashboard('today');
    const week = await dashboard('7d');

    expect(today.days[0]).toMatchObject({ started: 1 });
    expect(week.days[5]).toMatchObject({ day: await localDay(-1), started: 1 });
    expect(week.days[6]).toMatchObject({ day: await localDay(0), started: 1 });
  });

  test('started, completed and failed land on their own days', async () => {
    await video('COMPLETED', { createdAt: localTime(-2, 9), updatedAt: localTime(0, 10) });
    await video('FAILED', { createdAt: localTime(-1, 9), updatedAt: localTime(-1, 12) });
    await video('CANCELLED', { createdAt: localTime(0, 9), updatedAt: localTime(0, 9) });
    await video('SUPERSEDED', { createdAt: localTime(0, 9), updatedAt: localTime(0, 9) });

    const week = await dashboard('7d');
    const byDay = Object.fromEntries(week.days.map((row) => [row.day, row]));

    expect(byDay[await localDay(-2)]).toMatchObject({ started: 1, completed: 0, failed: 0 });
    expect(byDay[await localDay(-1)]).toMatchObject({ started: 1, completed: 0, failed: 1 });
    expect(byDay[await localDay(0)]).toMatchObject({ started: 2, completed: 1, failed: 0 });
  });

  test('sums actual cost per day and currency', async () => {
    const { versionId } = await video('SCRIPTING');
    await cost(versionId, 2.5);
    await cost(versionId, 1.5);
    await cost(versionId, 0.75, { currency: 'USD' });
    await cost(versionId, 100, { kind: 'ESTIMATE' });
    await cost(versionId, 9, { createdAt: "now() - interval '40 days'" });

    const today = await dashboard('today');
    const month = await dashboard('30d');

    expect(today.days[0]!.cost).toEqual({ CRD: 4, USD: 0.75 });
    const total = month.days.reduce((sum, row) => sum + (row.cost['CRD'] ?? 0), 0);
    expect(total).toBe(4);
  });
});

describe('kits', () => {
  test('resolves the kit as the library does and keeps enabled kits with zeros', async () => {
    const science = await video('COMPLETED', { kit: 'science' });
    await video('SCRIPTING');
    await video('SCRIPTING', { kit: 'gone-kit' });
    await cost(science.versionId, 3);

    const { kits } = await dashboard('today');
    const bySlug = Object.fromEntries(kits.map((kit) => [kit.slug ?? 'none', kit]));

    expect(bySlug['science']).toMatchObject({ started: 1, completed: 1, cost: { CRD: 3 } });
    expect(bySlug['whatif']).toMatchObject({ started: 1, completed: 0, cost: {} });
    expect(bySlug['none']).toMatchObject({ label: null, started: 1, completed: 0 });
    expect(bySlug['horror']).toMatchObject({ started: 0, completed: 0, cost: {} });
    expect(kits[kits.length - 1]!.slug).toBeNull();
  });
});

describe('failures', () => {
  test('lists a failed step with what /retry needs, and /retry takes it', async () => {
    const { videoId, versionId } = await video('SCRIPTING');
    await failStep(versionId, 'render', 'render crashed: Page crashed!');

    const { failures } = await dashboard('today');

    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      video_id: videoId,
      version: 1,
      title: 'test',
      step: 'render',
      status: 'FAILED_PERMANENT',
      error: 'render crashed: Page crashed!',
      attempts: 1,
      can_retry: true,
    });
    expect(Date.now() - new Date(failures[0]!.failed_at).getTime()).toBeLessThan(60_000);

    const retried = await callAsWeb<{ result: string; step: string }>(
      db.pool,
      'web_retry',
      session,
      videoId,
    );
    expect(retried).toMatchObject({ result: 'RETRIED', step: 'render' });
  });

  test('can_retry is false when /retry would refuse', async () => {
    const retryable = await video('SCRIPTING');
    await failStep(retryable.versionId, 'tts', 'provider timeout', true);
    const exhausted = await video('SCRIPTING');
    const jobId = await failStep(exhausted.versionId, 'render', 'boom');
    await db.pool.query(`UPDATE job SET manual_retries = 5 WHERE id = $1`, [jobId]);
    const failed = await video('SCRIPTING');
    await failStep(failed.versionId, 'qa', 'bad audio');
    await forced(async () => {
      await db.pool.query(`UPDATE video_version SET status = 'FAILED' WHERE id = $1`, [
        failed.versionId,
      ]);
    });

    const { failures } = await dashboard('today');
    const byStep = Object.fromEntries(failures.map((row) => [row.step, row]));

    expect(byStep['tts']).toMatchObject({ status: 'FAILED_RETRYABLE', can_retry: false });
    expect(byStep['render']).toMatchObject({ can_retry: false });
    expect(byStep['qa']).toMatchObject({ can_retry: false });
  });

  test('skips finished videos and keeps the newest ten', async () => {
    const done = await video('SCRIPTING');
    await failStep(done.versionId, 'old', 'gone');
    await forced(async () => {
      await db.pool.query(`UPDATE video_version SET status = 'COMPLETED' WHERE id = $1`, [
        done.versionId,
      ]);
    });
    const live = await video('SCRIPTING');
    for (let index = 0; index < 12; index += 1) {
      const jobId = await failStep(live.versionId, `step-${index}`, `failure ${index}`);
      await db.pool.query(
        `UPDATE job_attempt SET finished_at = now() - ($2 * interval '1 minute') WHERE job_id = $1`,
        [jobId, 12 - index],
      );
    }

    const { failures } = await dashboard('today');

    expect(failures).toHaveLength(10);
    expect(failures.map((row) => row.step)).not.toContain('old');
    expect(failures[0]!.step).toBe('step-11');
    expect(failures[9]!.step).toBe('step-2');
  });
});

describe('status counts', () => {
  test('match the Videos page totals', async () => {
    await video('NEEDS_DECISION');
    const approval = await video('AWAITING_SCRIPT_APPROVAL');
    await db.pool.query(`SELECT approval_request($1, 'SCRIPT', 'h1', interval '24 hours')`, [
      approval.versionId,
    ]);
    const running = await video('SCRIPTING');
    const jobId = await createJob(db.pool, running.versionId, 'script');
    await db.pool.query(`UPDATE job SET status = 'QUEUED', queued_at = now() WHERE id = $1`, [
      jobId,
    ]);
    await db.pool.query('SELECT * FROM job_start($1, $2, 60)', [jobId, WORKER]);
    await video('SCRIPTING');
    await video('COMPLETED');

    const { status_counts: counts } = await dashboard('today');

    expect(counts).toMatchObject({ stopped: 1, approval: 1, running: 1, waiting: 1 });
    for (const [filter, expected] of Object.entries(counts)) {
      const page = await callAsWeb<{ total: number }>(
        db.pool,
        'web_videos',
        session,
        filter,
        '',
        1,
        0,
      );
      expect(page.total, filter).toBe(expected);
    }
  });
});
