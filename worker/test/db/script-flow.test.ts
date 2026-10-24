import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db.js';
import { jobStatus, versionStatus } from '../helpers/fixtures.js';

const OWNER = 111;
const STRANGER = 999;
const WORKER = 'mac-mini-m4';
const SCRIPT_SHA = 'a'.repeat(64);

const BRIEF = {
  topic: 'Vì sao bầu trời có màu xanh?',
  duration_seconds: 45,
  audience: 'học sinh',
  tone: 'vui vẻ',
};

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

interface Submitted {
  video_id: string;
  version_id: string;
  job_id: string;
  created: boolean;
}

async function submit(submissionId: string, brief: object = BRIEF): Promise<Submitted> {
  const result = await db.pool.query<Submitted>('SELECT * FROM video_submit($1, $2::jsonb)', [
    submissionId,
    JSON.stringify(brief),
  ]);
  return result.rows[0]!;
}

/** Runs the version's READY script job to success as the worker, like the real runner. */
async function completeScript(jobId: string, sha256 = SCRIPT_SHA): Promise<void> {
  await db.pool.query(`UPDATE job SET status = 'QUEUED', queued_at = now() WHERE id = $1`, [jobId]);
  await db.pool.query('SELECT * FROM job_start($1, $2, 60)', [jobId, WORKER]);
  const output = {
    outputs: [{ path: 'script.json', bytes: 100, sha256 }],
    result: {
      title: 'Bầu trời xanh',
      scene_count: 4,
      total_seconds: 44,
      preview: 'Cảnh 1 ...',
      scenes: [{ narration: 'Cảnh một.' }, { narration: 'Cảnh hai.' }],
    },
    fromCheckpoint: false,
  };
  await db.pool.query('SELECT job_succeed($1, $2, $3::jsonb)', [
    jobId,
    WORKER,
    JSON.stringify(output),
  ]);
}

interface DueRow {
  kind: string;
  video_id: string;
  version: number;
  video_version_id: string;
  token: string;
  script: { title: string };
}

async function due(): Promise<DueRow[]> {
  const result = await db.pool.query<DueRow>('SELECT * FROM script_approvals_due()');
  return result.rows;
}

async function decide(
  token: string,
  action: string,
  userId = OWNER,
): Promise<{ result: string; version: number | null }> {
  const result = await db.pool.query<{ result: string; version: number | null }>(
    'SELECT * FROM approval_telegram_decide($1, $2, $3)',
    [token, userId, action],
  );
  return result.rows[0]!;
}

async function awaitingApproval(submissionId: string): Promise<DueRow> {
  const submitted = await submit(submissionId);
  await completeScript(submitted.job_id);
  const rows = (await due()).filter((row) => row.video_version_id === submitted.version_id);
  return rows[0]!;
}

describe('video_submit', () => {
  test('creates a video in SCRIPTING with a READY script job on q:light', async () => {
    const submitted = await submit('form-1');

    expect(submitted.created).toBe(true);
    expect(await versionStatus(db.pool, submitted.version_id)).toBe('SCRIPTING');
    const job = await db.pool.query<{
      step: string;
      stream: string;
      status: string;
      input: object;
    }>('SELECT step, stream, status, input FROM job WHERE id = $1', [submitted.job_id]);
    expect(job.rows[0]).toMatchObject({
      step: 'script',
      stream: 'q:light',
      status: 'READY',
      input: { brief: BRIEF, language: 'vi' },
    });
  });

  test('is idempotent per submission id', async () => {
    const first = await submit('form-dup');
    const second = await submit('form-dup');

    expect(second.created).toBe(false);
    expect(second.video_id).toBe(first.video_id);
    expect(second.job_id).toBe(first.job_id);
  });

  test.each([
    ['missing topic', { duration_seconds: 30 }],
    ['blank topic', { topic: '  ', duration_seconds: 30 }],
    ['too long for a Short', { topic: 'x'.repeat(10), duration_seconds: 60 }],
    ['too short', { topic: 'x'.repeat(10), duration_seconds: 5 }],
    ['non-integer duration', { topic: 'x'.repeat(10), duration_seconds: 'abc' }],
  ])('rejects an invalid brief: %s', async (_name, brief) => {
    await expect(submit(`bad-${_name}`, brief)).rejects.toThrow(/invalid brief/);
  });
});

describe('script_approvals_due', () => {
  test('requests approval once when the script job succeeds', async () => {
    const submitted = await submit('due-1');
    expect((await due()).some((row) => row.video_version_id === submitted.version_id)).toBe(false);

    await completeScript(submitted.job_id);
    const rows = (await due()).filter((row) => row.video_version_id === submitted.version_id);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: 'REQUEST',
      version: 1,
      script: { title: 'Bầu trời xanh' },
    });
    expect(rows[0]!.token).toMatch(/^[0-9a-f]{32}$/);
    expect(await versionStatus(db.pool, submitted.version_id)).toBe('AWAITING_SCRIPT_APPROVAL');
    expect((await due()).some((row) => row.video_version_id === submitted.version_id)).toBe(false);
  });

  test('sends a reminder for a pending approval after the interval', async () => {
    const row = await awaitingApproval('due-remind');
    await db.pool.query(
      `UPDATE approval SET requested_at = now() - interval '7 hours' WHERE token = $1`,
      [row.token],
    );

    const reminders = (await due()).filter((r) => r.token === row.token);

    expect(reminders).toEqual([expect.objectContaining({ kind: 'REMINDER', version: 1 })]);
  });
});

describe('approval_telegram_decide', () => {
  test('approve moves the version to GENERATING_ASSETS', async () => {
    const row = await awaitingApproval('decide-approve');

    expect(await decide(row.token, 'APPROVE')).toMatchObject({ result: 'OK', version: 1 });
    expect(await versionStatus(db.pool, row.video_version_id)).toBe('GENERATING_ASSETS');
    expect(await decide(row.token, 'APPROVE')).toMatchObject({ result: 'NOT_PENDING' });
  });

  test('reject cancels the version', async () => {
    const row = await awaitingApproval('decide-reject');

    expect(await decide(row.token, 'REJECT')).toMatchObject({ result: 'OK' });
    expect(await versionStatus(db.pool, row.video_version_id)).toBe('CANCELLED');
  });

  test('regenerate supersedes the version and starts a new script job', async () => {
    const row = await awaitingApproval('decide-regen');

    expect(await decide(row.token, 'REGENERATE')).toMatchObject({ result: 'OK', version: 2 });

    expect(await versionStatus(db.pool, row.video_version_id)).toBe('SUPERSEDED');
    const next = await db.pool.query<{ id: string; status: string; job_status: string }>(
      `SELECT vv.id, vv.status, j.status AS job_status
       FROM video_version vv JOIN job j ON j.video_version_id = vv.id AND j.step = 'script'
       WHERE vv.video_id = $1 AND vv.version = 2`,
      [row.video_id],
    );
    expect(next.rows[0]).toMatchObject({ status: 'SCRIPTING', job_status: 'READY' });
  });

  test('a stale token from a superseded version is refused', async () => {
    const row = await awaitingApproval('decide-stale');
    const staleToken = row.token;
    await decide(staleToken, 'REGENERATE');

    expect(await decide(staleToken, 'APPROVE')).toMatchObject({ result: 'NOT_PENDING' });
  });

  test('refuses users who are not approvers and changes nothing', async () => {
    const row = await awaitingApproval('decide-stranger');

    expect(await decide(row.token, 'APPROVE', STRANGER)).toMatchObject({ result: 'NOT_ALLOWED' });
    expect(await versionStatus(db.pool, row.video_version_id)).toBe('AWAITING_SCRIPT_APPROVAL');
  });

  test('refuses approval when the script changed after the request', async () => {
    const row = await awaitingApproval('decide-changed');
    await db.pool.query(
      `UPDATE job SET output = jsonb_set(output, '{outputs,0,sha256}', to_jsonb($2::text))
       WHERE video_version_id = $1 AND step = 'script'`,
      [row.video_version_id, 'b'.repeat(64)],
    );

    expect(await decide(row.token, 'APPROVE')).toMatchObject({ result: 'HASH_MISMATCH' });
  });

  test('rejects unknown actions', async () => {
    const row = await awaitingApproval('decide-unknown');
    await expect(decide(row.token, 'MAYBE')).rejects.toThrow(/invalid action/);
  });
});

describe('job_block (provider usage limit)', () => {
  async function runningScript(submissionId: string): Promise<Submitted> {
    const submitted = await submit(submissionId);
    await db.pool.query(`UPDATE job SET status = 'QUEUED', queued_at = now() WHERE id = $1`, [
      submitted.job_id,
    ]);
    await db.pool.query('SELECT * FROM job_start($1, $2, 60)', [submitted.job_id, WORKER]);
    return submitted;
  }

  async function block(jobId: string, retryAfterSeconds: number): Promise<string> {
    const result = await db.pool.query<{ job_block: string }>('SELECT job_block($1, $2, $3, $4)', [
      jobId,
      WORKER,
      'usage limit reached',
      retryAfterSeconds,
    ]);
    return result.rows[0]!.job_block;
  }

  test('blocks the job and the video without spending an attempt', async () => {
    const submitted = await runningScript('block-1');

    expect(await block(submitted.job_id, 3600)).toBe('BLOCKED');

    expect(await jobStatus(db.pool, submitted.job_id)).toBe('BLOCKED');
    expect(await versionStatus(db.pool, submitted.version_id)).toBe('BLOCKED_PROVIDER');
    // The attempt row stays (attempt numbers are unique), but the job gets one more attempt.
    const job = await db.pool.query<{
      attempt_count: number;
      max_attempts: number;
      last_error: string;
    }>('SELECT attempt_count, max_attempts, last_error FROM job WHERE id = $1', [submitted.job_id]);
    expect(job.rows[0]).toEqual({
      attempt_count: 1,
      max_attempts: 4,
      last_error: 'usage limit reached',
    });
  });

  test('returns LOST for a job this worker is not running', async () => {
    const submitted = await submit('block-lost');
    expect(await block(submitted.job_id, 60)).toBe('LOST');
  });

  test('job_promote resumes the job and the video after the retry time', async () => {
    const submitted = await runningScript('block-resume');
    await block(submitted.job_id, 3600);

    await db.pool.query('SELECT job_promote()');
    expect(await jobStatus(db.pool, submitted.job_id)).toBe('BLOCKED');

    await db.pool.query(
      `UPDATE job SET next_attempt_at = now() - interval '1 second' WHERE id = $1`,
      [submitted.job_id],
    );
    await db.pool.query('SELECT job_promote()');

    expect(await jobStatus(db.pool, submitted.job_id)).toBe('READY');
    expect(await versionStatus(db.pool, submitted.version_id)).toBe('SCRIPTING');
  });

  test('watchdog reports videos that need a decision after a permanent failure', async () => {
    const submitted = await runningScript('needs-decision');
    await db.pool.query('SELECT job_fail($1, $2, $3, false)', [
      submitted.job_id,
      WORKER,
      'invalid script input',
    ]);

    const result = await db.pool.query<{ summary: { needs_decision: object[] } }>(
      'SELECT watchdog_run() AS summary',
    );

    expect(result.rows[0]!.summary.needs_decision).toContainEqual({
      video_id: submitted.video_id,
      version: 1,
      step: 'script',
      error: 'invalid script input',
    });
  });

  test('watchdog reports videos blocked by a provider', async () => {
    const submitted = await runningScript('block-watchdog');
    await block(submitted.job_id, 3600);

    const result = await db.pool.query<{ summary: { blocked_videos: string[] } }>(
      'SELECT watchdog_run() AS summary',
    );

    expect(result.rows[0]!.summary.blocked_videos).toContain(submitted.video_id);
  });
});
