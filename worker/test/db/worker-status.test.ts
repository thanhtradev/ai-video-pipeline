import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db.js';
import { createBatch, createJob, createVideo } from '../helpers/fixtures.js';

// /workers on Telegram (D-082) reads telegram_workers(): one row per worker with whether it is
// online, the jobs it is running (which clip, which step, progress) and how many wait for it.

const OWNER = 111;
const STRANGER = 999;

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

async function seenAgo(workerId: string, seconds: number): Promise<void> {
  await db.pool.query(
    `INSERT INTO worker (id, capabilities, last_seen_at)
     VALUES ($1, '{q:render}', now() - make_interval(secs => $2))
     ON CONFLICT (id) DO UPDATE SET last_seen_at = excluded.last_seen_at`,
    [workerId, seconds],
  );
}

async function start(jobId: string, workerId: string): Promise<void> {
  await db.pool.query(`UPDATE job SET status = 'QUEUED', queued_at = now() WHERE id = $1`, [jobId]);
  await db.pool.query('SELECT * FROM job_start($1, $2, 60)', [jobId, workerId]);
}

interface WorkerRow {
  allowed: boolean;
  worker_id: string | null;
  online: boolean | null;
  last_seen_at: Date | null;
  jobs: Record<string, unknown>[] | null;
  waiting: number | null;
}

async function workers(user: number): Promise<WorkerRow[]> {
  return (await db.pool.query<WorkerRow>('SELECT * FROM telegram_workers($1)', [user])).rows;
}

describe('telegram_workers', () => {
  test('answers strangers with a single refusal row', async () => {
    expect(await workers(STRANGER)).toEqual([
      expect.objectContaining({ allowed: false, worker_id: null }),
    ]);
  });

  test('shows the clip, step and progress each worker is running', async () => {
    await seenAgo('mac-mini-m4', 10);
    await seenAgo('hp-400-g7', 600);
    const video = await createVideo(db.pool, await createBatch(db.pool, 'workers'), 1);
    const script = await createJob(db.pool, video.versionId, 'script');
    await start(script, 'mac-mini-m4');
    await db.pool.query(
      `SELECT job_succeed($1, 'mac-mini-m4', '{"result":{"title":"Mèo nghĩ gì?"}}'::jsonb)`,
      [script],
    );
    const render = await createJob(db.pool, video.versionId, 'render_episode', {
      stream: 'q:render',
    });
    await start(render, 'mac-mini-m4');
    await db.pool.query(`SELECT job_report_progress($1, 'mac-mini-m4', $2::jsonb)`, [
      render,
      JSON.stringify({ stage: 'render', frames: 1800 }),
    ]);
    await createJob(db.pool, video.versionId, 'qa_final'); // no dependencies: READY

    const rows = await workers(OWNER);

    expect(rows.map((r) => r.worker_id)).toEqual(['hp-400-g7', 'mac-mini-m4']);
    expect(rows[0]).toMatchObject({ allowed: true, online: false, jobs: [], waiting: 0 });
    expect(rows[1]).toMatchObject({
      allowed: true,
      online: true,
      waiting: 1,
      jobs: [
        expect.objectContaining({
          video_id: video.videoId,
          version: 1,
          title: 'Mèo nghĩ gì?',
          video_status: 'BRIEF_SUBMITTED',
          step: 'render_episode',
          attempts: 1,
          progress: { stage: 'render', frames: 1800 },
          started: expect.any(String),
        }),
      ],
    });
  });
});
