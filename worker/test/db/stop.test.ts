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

// /stop on Telegram (D-067): an approver cancels a video started or approved by mistake. Every
// unfinished job of the current version is cancelled (a running worker aborts at its next
// heartbeat), pending approvals lose their buttons, and the version ends CANCELLED.

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

interface StopRow {
  result: string;
  video_id: string | null;
  cancelled_jobs: number | null;
  running_step: string | null;
}

async function stop(prefix: string, user = OWNER): Promise<StopRow> {
  const result = await db.pool.query<StopRow>('SELECT * FROM telegram_stop($1, $2)', [
    user,
    prefix,
  ]);
  return result.rows[0]!;
}

async function startJob(jobId: string): Promise<void> {
  await db.pool.query(`UPDATE job SET status = 'QUEUED', queued_at = now() WHERE id = $1`, [jobId]);
  await db.pool.query('SELECT * FROM job_start($1, $2, 60)', [jobId, WORKER]);
}

async function runningVideo(
  name: string,
): Promise<VideoFixture & { running: string; next: string }> {
  const video = await createVideo(db.pool, await createBatch(db.pool, name), 1);
  const running = await createJob(db.pool, video.versionId, 'episode_code', { stream: 'q:render' });
  const next = await createJob(db.pool, video.versionId, 'render_episode', {
    stream: 'q:render',
    dependsOn: [running],
  });
  await startJob(running);
  return { ...video, running, next };
}

describe('telegram_stop', () => {
  test('cancels every unfinished job and ends the version', async () => {
    const video = await runningVideo('stop-ok');
    expect(await jobStatus(db.pool, video.running)).toBe('RUNNING');
    expect(await jobStatus(db.pool, video.next)).toBe('PENDING');

    expect(await stop(video.videoId.slice(0, 8).toUpperCase())).toEqual({
      result: 'STOPPED',
      video_id: video.videoId,
      cancelled_jobs: 2,
      running_step: 'episode_code',
    });

    expect(await jobStatus(db.pool, video.running)).toBe('CANCELLED');
    expect(await jobStatus(db.pool, video.next)).toBe('CANCELLED');
    expect(await versionStatus(db.pool, video.versionId)).toBe('CANCELLED');
    // The worker learns it at its next heartbeat and aborts.
    const heartbeat = await db.pool.query<{ status: string }>(
      'SELECT job_heartbeat($1, $2, 60) AS status',
      [video.running, WORKER],
    );
    expect(heartbeat.rows[0]!.status).toBe('CANCELLED');
    const audit = await db.pool.query<{ actor: string }>(
      `SELECT actor FROM audit_log WHERE object_id = $1 ORDER BY id DESC LIMIT 1`,
      [video.versionId],
    );
    expect(audit.rows[0]!.actor).toBe(`telegram:${OWNER}`);

    // Stopping again is refused: the video is already over.
    expect(await stop(video.videoId)).toMatchObject({
      result: 'ALREADY_OVER',
      video_id: video.videoId,
    });
  });

  test('settles pending approvals so their buttons stop working', async () => {
    const video = await createVideo(db.pool, await createBatch(db.pool, 'stop-approval'), 1);
    await db.pool.query(`UPDATE video_version SET status = 'SCRIPTING' WHERE id = $1`, [
      video.versionId,
    ]);
    await db.pool.query(
      `UPDATE video_version SET status = 'AWAITING_SCRIPT_APPROVAL' WHERE id = $1`,
      [video.versionId],
    );
    const token = await db.pool.query<{ approval_request: string }>(
      `SELECT approval_request($1, 'SCRIPT', 'hash')`,
      [video.versionId],
    );

    expect(await stop(video.videoId)).toMatchObject({
      result: 'STOPPED',
      cancelled_jobs: 0,
      running_step: null,
    });

    const decide = await db.pool.query<{ approval_decide: string }>(
      `SELECT approval_decide($1, $2, 'APPROVED', 'hash')`,
      [token.rows[0]!.approval_request, OWNER],
    );
    expect(decide.rows[0]!.approval_decide).toBe('SUPERSEDED');
    expect(await versionStatus(db.pool, video.versionId)).toBe('CANCELLED');
  });

  test('stops a video waiting for a decision', async () => {
    const video = await createVideo(db.pool, await createBatch(db.pool, 'stop-decision'), 1);
    await db.pool.query(`UPDATE video_version SET status = 'NEEDS_DECISION' WHERE id = $1`, [
      video.versionId,
    ]);
    expect((await stop(video.videoId)).result).toBe('STOPPED');
    expect(await versionStatus(db.pool, video.versionId)).toBe('CANCELLED');
  });

  test('without a prefix stops the only active video, else asks for one', async () => {
    const batch = await createBatch(db.pool, 'stop-noprefix');
    // The videos of the earlier tests are over; only this one is active now.
    const only = await createVideo(db.pool, batch, 1);
    expect(await stop('')).toMatchObject({ result: 'STOPPED', video_id: only.videoId });
    expect((await stop('')).result).toBe('NOT_FOUND');

    await createVideo(db.pool, batch, 2);
    await createVideo(db.pool, batch, 3);
    expect((await stop('  ')).result).toBe('AMBIGUOUS');
  });

  test('refuses strangers, unknown or ambiguous prefixes', async () => {
    const video = await runningVideo('stop-refusals');
    expect((await stop(video.videoId, STRANGER)).result).toBe('NOT_APPROVER');
    expect((await stop('ffffffff-ffff')).result).toBe('NOT_FOUND');
    expect((await stop('abc')).result).toBe('NOT_FOUND');
    expect((await stop("'; drop table job; --")).result).toBe('NOT_FOUND');
    expect(await jobStatus(db.pool, video.running)).toBe('RUNNING');

    for (const [sequence, id] of [
      [1, 'abcd0000-0000-4000-8000-000000000011'],
      [2, 'abcd0000-0000-4000-8000-000000000012'],
    ] as const) {
      await db.pool.query(
        `INSERT INTO video (id, batch_id, sequence, aspect_ratio) VALUES ($1, $2, $3, '16:9')`,
        [id, video.batchId, sequence + 10],
      );
    }
    expect((await stop('abcd0000')).result).toBe('AMBIGUOUS');
  });
});
