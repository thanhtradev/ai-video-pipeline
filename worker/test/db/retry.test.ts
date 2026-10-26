import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db.js';
import {
  createBatch,
  createJob,
  createVideo,
  jobStatus,
  versionStatus,
  type VideoFixture,
} from '../helpers/fixtures.js';

// /retry on Telegram (D-056): an approver gives a permanently failed job one more attempt, and the
// video resumes from NEEDS_DECISION where it was.

const OWNER = 111;
const STRANGER = 999;
const WORKER = 'mac-mini-m4';

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

interface RetryRow {
  result: string;
  video_id: string | null;
  step: string | null;
  attempt: number | null;
}

async function retry(prefix: string, user = OWNER): Promise<RetryRow> {
  const result = await db.pool.query<RetryRow>('SELECT * FROM telegram_retry($1, $2)', [
    user,
    prefix,
  ]);
  return result.rows[0]!;
}

/** Runs the job once and fails it permanently: the video stops at NEEDS_DECISION. */
async function failPermanently(jobId: string): Promise<void> {
  await db.pool.query(`UPDATE job SET status = 'QUEUED', queued_at = now() WHERE id = $1`, [jobId]);
  await db.pool.query('SELECT * FROM job_start($1, $2, 60)', [jobId, WORKER]);
  await db.pool.query(`SELECT job_fail($1, $2, 'EPERM: mkdir node_modules/.remotion', false)`, [
    jobId,
    WORKER,
  ]);
}

async function stoppedVideo(name: string): Promise<VideoFixture & { jobId: string }> {
  const video = await createVideo(db.pool, await createBatch(db.pool, name), 1);
  const jobId = await createJob(db.pool, video.versionId, 'episode_code', {
    stream: 'q:render',
    maxAttempts: 1,
  });
  await failPermanently(jobId);
  return { ...video, jobId };
}

describe('telegram_retry', () => {
  test('gives the failed job one more attempt and resumes the video', async () => {
    const video = await stoppedVideo('retry-ok');
    expect(await versionStatus(db.pool, video.versionId)).toBe('NEEDS_DECISION');

    expect(await retry(video.videoId.slice(0, 8).toUpperCase())).toEqual({
      result: 'RETRIED',
      video_id: video.videoId,
      step: 'episode_code',
      attempt: 2,
    });

    expect(await jobStatus(db.pool, video.jobId)).toBe('READY');
    expect(await versionStatus(db.pool, video.versionId)).toBe('BRIEF_SUBMITTED');
    const job = await db.pool.query<{ attempt_count: number; max_attempts: number }>(
      'SELECT attempt_count, max_attempts FROM job WHERE id = $1',
      [video.jobId],
    );
    expect(job.rows[0]).toEqual({ attempt_count: 1, max_attempts: 2 });
    const audit = await db.pool.query<{ actor: string }>(
      `SELECT actor FROM audit_log WHERE object_id = $1 ORDER BY id DESC LIMIT 1`,
      [video.versionId],
    );
    expect(audit.rows[0]!.actor).toBe(`telegram:${OWNER}`);

    // Retrying again is refused: the video is no longer stopped.
    expect((await retry(video.videoId)).result).toBe('NOT_STOPPED');
  });

  test('refuses strangers, unknown or ambiguous prefixes, and videos stopped for another reason', async () => {
    const video = await stoppedVideo('retry-refusals');
    expect((await retry(video.videoId, STRANGER)).result).toBe('NOT_APPROVER');
    expect((await retry('ffffffff-ffff')).result).toBe('NOT_FOUND');
    expect((await retry('abc')).result).toBe('NOT_FOUND');
    expect((await retry("'; drop table job; --")).result).toBe('NOT_FOUND');
    expect(await jobStatus(db.pool, video.jobId)).toBe('FAILED_PERMANENT');

    const other = await createVideo(db.pool, await createBatch(db.pool, 'retry-decision'), 1);
    await db.pool.query(`UPDATE video_version SET status = 'NEEDS_DECISION' WHERE id = $1`, [
      other.versionId,
    ]);
    expect(await retry(other.videoId)).toMatchObject({
      result: 'NO_FAILED_JOB',
      video_id: other.videoId,
    });
  });

  test('reports a prefix that matches several videos', async () => {
    const batch = await createBatch(db.pool, 'retry-ambiguous');
    for (const [sequence, id] of [
      [1, 'abcd0000-0000-4000-8000-000000000001'],
      [2, 'abcd0000-0000-4000-8000-000000000002'],
    ] as const) {
      await db.pool.query(
        `INSERT INTO video (id, batch_id, sequence, aspect_ratio) VALUES ($1, $2, $3, '16:9')`,
        [id, batch, sequence],
      );
    }
    expect((await retry('abcd0000')).result).toBe('AMBIGUOUS');
  });
});
