import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db.js';
import { createBatch, createJob, createVideo } from '../helpers/fixtures.js';

// Progress check (P-017): workers report what a long step is doing; /status on Telegram reads
// telegram_status() — a list of active videos, or one video's jobs and cost — for approvers only.

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

async function start(jobId: string): Promise<void> {
  await db.pool.query(`UPDATE job SET status = 'QUEUED', queued_at = now() WHERE id = $1`, [jobId]);
  await db.pool.query('SELECT * FROM job_start($1, $2, 60)', [jobId, WORKER]);
}

async function report(jobId: string, progress: object, worker = WORKER): Promise<boolean> {
  const result = await db.pool.query<{ ok: boolean }>(
    'SELECT job_report_progress($1, $2, $3::jsonb) AS ok',
    [jobId, worker, JSON.stringify(progress)],
  );
  return result.rows[0]!.ok;
}

interface StatusRow {
  allowed: boolean;
  video_id: string | null;
  version: number | null;
  title: string | null;
  status: string | null;
  step: string | null;
  step_status: string | null;
  progress: Record<string, unknown> | null;
  steps_done: number | null;
  steps_total: number | null;
  approval: string | null;
  cost: Record<string, number> | null;
  jobs: { step: string; status: string; attempts: number }[] | null;
}

async function status(user: number, prefix = ''): Promise<StatusRow[]> {
  return (await db.pool.query<StatusRow>('SELECT * FROM telegram_status($1, $2)', [user, prefix]))
    .rows;
}

describe('job_report_progress', () => {
  test('stores progress only for a job this worker is running', async () => {
    const { versionId } = await createVideo(db.pool, await createBatch(db.pool), 1);
    const jobId = await createJob(db.pool, versionId, 'episode_code', { stream: 'q:render' });

    expect(await report(jobId, { stage: 'agent' })).toBe(false);
    await start(jobId);
    expect(await report(jobId, { stage: 'agent', turn: 1, of: 3 })).toBe(true);
    expect(await report(jobId, { x: 'y'.repeat(5000) })).toBe(false);

    const row = await db.pool.query<{ progress: object }>(
      'SELECT progress FROM job WHERE id = $1',
      [jobId],
    );
    expect(row.rows[0]!.progress).toEqual({ stage: 'agent', turn: 1, of: 3 });
  });
});

describe('telegram_status', () => {
  test('answers strangers with a single refusal row', async () => {
    expect(await status(STRANGER)).toEqual([
      expect.objectContaining({ allowed: false, video_id: null }),
    ]);
  });

  test('lists active videos with their current step and progress', async () => {
    const batch = await createBatch(db.pool, 'status-list');
    const active = await createVideo(db.pool, batch, 1);
    const done = await createVideo(db.pool, batch, 2);
    const script = await createJob(db.pool, active.versionId, 'script');
    await start(script);
    await db.pool.query(
      `SELECT job_succeed($1, $2, '{"result":{"title":"Mèo nghĩ gì?"}}'::jsonb)`,
      [script, WORKER],
    );
    const code = await createJob(db.pool, active.versionId, 'episode_code', { stream: 'q:render' });
    await start(code);
    await report(code, { stage: 'agent', turn: 2, of: 3 });
    await db.pool.query(`UPDATE video_version SET status = 'CANCELLED' WHERE id = $1`, [
      done.versionId,
    ]);

    const rows = (await status(OWNER)).filter((r) =>
      [active.videoId, done.videoId].includes(r.video_id!),
    );

    expect(rows).toEqual([
      expect.objectContaining({
        allowed: true,
        video_id: active.videoId,
        version: 1,
        title: 'Mèo nghĩ gì?',
        status: 'BRIEF_SUBMITTED',
        step: 'episode_code',
        step_status: 'RUNNING',
        progress: { stage: 'agent', turn: 2, of: 3 },
        steps_done: 1,
        steps_total: 2,
        jobs: null,
      }),
    ]);
  });

  test('shows one video by id prefix with its jobs, cost and pending approval', async () => {
    const video = await createVideo(db.pool, await createBatch(db.pool, 'status-one'), 1);
    const tts = await createJob(db.pool, video.versionId, 'tts');
    await start(tts);
    await db.pool.query(
      `INSERT INTO cost_entry (video_version_id, job_id, kind, units, unit_price, amount, currency)
       VALUES ($1, $2, 'ACTUAL', 2817, 1, 2817, 'CRD'), ($1, $2, 'ESTIMATE', 3000, 1, 3000, 'CRD')`,
      [video.versionId, tts],
    );
    await db.pool.query(`SELECT approval_request($1, 'STORYBOARD', 'h')`, [video.versionId]);

    const [row] = await status(OWNER, video.videoId.slice(0, 8).toUpperCase());

    expect(row).toMatchObject({
      video_id: video.videoId,
      step: 'tts',
      cost: { CRD: 2817 },
      approval: expect.stringMatching(/^STORYBOARD until /),
      jobs: [expect.objectContaining({ step: 'tts', status: 'RUNNING', attempts: 1 })],
    });
    expect(await status(OWNER, 'ffffffff')).toEqual([]);
  });
});
