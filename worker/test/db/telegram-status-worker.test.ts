import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db.js';
import { createBatch, createJob, createVideo, type VideoFixture } from '../helpers/fixtures.js';

// D-102: /status groups videos by what they need and names each video's worker; /worker <id> shows
// one worker's live state, the videos pinned to it and its last 24 hours.

const OWNER = 111;
const STRANGER = 999;
const WORKER = 'hp-400-g7';
const OTHER_WORKER = 'mac-mini-m4';

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

beforeEach(async () => {
  await forced(async () => {
    await db.pool.query(`DELETE FROM job_attempt`);
    await db.pool.query(`DELETE FROM approval`);
    await db.pool.query(`UPDATE video_version SET status = 'CANCELLED'`);
    await db.pool.query(`UPDATE job SET status = 'CANCELLED'`);
  });
  await seen(WORKER);
  await seen(OTHER_WORKER);
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

async function seen(workerId: string, secondsAgo = 5): Promise<void> {
  await db.pool.query(
    `INSERT INTO worker (id, capabilities, last_seen_at, last_idle_at)
     VALUES ($1, '{q:render,q:light}', now() - make_interval(secs => $2), now() - interval '1 hour')
     ON CONFLICT (id) DO UPDATE SET last_seen_at = excluded.last_seen_at`,
    [workerId, secondsAgo],
  );
}

async function newVideo(): Promise<VideoFixture> {
  return createVideo(db.pool, await createBatch(db.pool, 'status-worker'), 1);
}

async function start(jobId: string, workerId = WORKER): Promise<void> {
  await db.pool.query(`UPDATE job SET status = 'QUEUED', queued_at = now() WHERE id = $1`, [jobId]);
  await db.pool.query('SELECT * FROM job_start($1, $2, 60)', [jobId, workerId]);
}

async function fail(jobId: string, workerId = WORKER): Promise<void> {
  await start(jobId, workerId);
  await db.pool.query(`SELECT job_fail($1, $2, 'boom', false)`, [jobId, workerId]);
}

async function succeed(jobId: string, workerId = WORKER): Promise<void> {
  await start(jobId, workerId);
  await db.pool.query(`SELECT job_succeed($1, $2, '{}'::jsonb)`, [jobId, workerId]);
}

/** A video stopped at NEEDS_DECISION, with a later step still PENDING. */
async function stoppedVideo(workerId = WORKER): Promise<VideoFixture> {
  const video = await newVideo();
  const failed = await createJob(db.pool, video.versionId, 'episode_code', {
    stream: 'q:render',
    maxAttempts: 1,
  });
  await createJob(db.pool, video.versionId, 'render_episode', {
    stream: 'q:render',
    dependsOn: [failed],
  });
  await fail(failed, workerId);
  return video;
}

async function waitingForApproval(video: VideoFixture): Promise<void> {
  await db.pool.query(
    `INSERT INTO approval (video_version_id, type, token, payload_hash, expires_at)
     VALUES ($1, 'SCRIPT', $2, 'h', now() + interval '1 day')`,
    [video.versionId, `tok-${video.versionId}`],
  );
}

interface StatusRow {
  allowed: boolean;
  video_id: string | null;
  status: string | null;
  step: string | null;
  step_status: string | null;
  worker_id: string | null;
  worker_online: boolean | null;
  state_group: string | null;
  total: number | null;
}

async function status(prefix = '', user = OWNER): Promise<StatusRow[]> {
  return (await db.pool.query<StatusRow>('SELECT * FROM telegram_status($1, $2)', [user, prefix]))
    .rows;
}

interface WorkerDetailRow {
  allowed: boolean;
  worker_id: string | null;
  online: boolean | null;
  last_seen_at: Date | null;
  last_idle_at: Date | null;
  capabilities: string[] | null;
  jobs: { video_id: string; step: string }[] | null;
  waiting: number | null;
  moves: unknown[] | null;
  videos: { video_id: string; version: number; status: string; approval: string | null }[] | null;
  videos_total: number | null;
  stats: {
    succeeded: number;
    failed: number;
    completed: number;
    slowest: { step: string; median_seconds: number }[];
  } | null;
}

async function detail(workerId: string, user = OWNER): Promise<WorkerDetailRow[]> {
  return (
    await db.pool.query<WorkerDetailRow>('SELECT * FROM telegram_worker_detail($1, $2)', [
      user,
      workerId,
    ])
  ).rows;
}

describe('telegram_status with worker and groups (D-102)', () => {
  test('names the pinned worker and whether it is online', async () => {
    const pinned = await newVideo();
    await start(await createJob(db.pool, pinned.versionId, 'script'));
    const offline = await newVideo();
    await start(await createJob(db.pool, offline.versionId, 'script'), OTHER_WORKER);
    await seen(OTHER_WORKER, 600);
    const unpinned = await newVideo();

    const rows = await status();
    const row = (id: string) => rows.find((r) => r.video_id === id)!;

    expect(row(pinned.videoId)).toMatchObject({ worker_id: WORKER, worker_online: true });
    expect(row(offline.videoId)).toMatchObject({ worker_id: OTHER_WORKER, worker_online: false });
    expect(row(unpinned.videoId)).toMatchObject({ worker_id: null, worker_online: null });
  });

  test('orders stopped, then waiting for approval, then running, then waiting', async () => {
    const stopped = await stoppedVideo();
    const running = await newVideo();
    await start(await createJob(db.pool, running.versionId, 'script'));
    const approval = await newVideo();
    await waitingForApproval(approval);
    const queued = await newVideo();
    await createJob(db.pool, queued.versionId, 'script');

    const rows = await status();

    expect(rows.map((r) => [r.video_id, r.state_group])).toEqual([
      [stopped.videoId, 'STOPPED'],
      [approval.videoId, 'APPROVAL'],
      [running.videoId, 'RUNNING'],
      [queued.videoId, 'WAITING'],
    ]);
    expect(rows.map((r) => r.total)).toEqual([4, 4, 4, 4]);
  });

  test('a stopped video stays in the list when more than 20 are active', async () => {
    const stopped = await stoppedVideo();
    for (let i = 0; i < 21; i += 1) {
      const video = await newVideo();
      await start(await createJob(db.pool, video.versionId, 'script'));
    }

    const rows = await status();

    expect(rows).toHaveLength(20);
    expect(rows[0]).toMatchObject({ video_id: stopped.videoId, state_group: 'STOPPED', total: 22 });
  });

  test('a stopped video shows the step that failed, not a later pending one', async () => {
    const stopped = await stoppedVideo();

    expect((await status())[0]).toMatchObject({
      video_id: stopped.videoId,
      status: 'NEEDS_DECISION',
      step: 'episode_code',
      step_status: 'FAILED_PERMANENT',
    });
  });

  test('one video by prefix carries the worker too; strangers get only a refusal', async () => {
    const stopped = await stoppedVideo();

    expect((await status(stopped.videoId.slice(0, 8)))[0]).toMatchObject({
      worker_id: WORKER,
      worker_online: true,
    });
    expect(await status('', STRANGER)).toEqual([
      expect.objectContaining({ allowed: false, video_id: null, worker_id: null, total: null }),
    ]);
  });
});

describe('telegram_worker_detail (D-102)', () => {
  test('answers strangers with a single refusal row and unknown ids with no rows', async () => {
    expect(await detail(WORKER, STRANGER)).toEqual([
      expect.objectContaining({ allowed: false, worker_id: null, videos: null, stats: null }),
    ]);
    expect(await detail('raspberry')).toEqual([]);
  });

  test('matches the exact id only, in any case', async () => {
    await seen('mac-mini-m4-02');

    expect((await detail('mac-mini-m4')).map((r) => r.worker_id)).toEqual(['mac-mini-m4']);
    expect((await detail('MAC-MINI-M4-02')).map((r) => r.worker_id)).toEqual(['mac-mini-m4-02']);
    expect(await detail('mac-mini')).toEqual([]);
  });

  test('shows live state and the running job', async () => {
    const video = await newVideo();
    await start(
      await createJob(db.pool, video.versionId, 'render_episode', { stream: 'q:render' }),
    );

    const [row] = await detail(WORKER);

    expect(row).toMatchObject({
      allowed: true,
      worker_id: WORKER,
      online: true,
      capabilities: ['q:render', 'q:light'],
      moves: [],
    });
    expect(row!.last_idle_at).toBeInstanceOf(Date);
    expect(row!.jobs).toEqual([
      expect.objectContaining({ video_id: video.videoId, step: 'render_episode' }),
    ]);
  });

  test('lists active videos pinned to this worker only, with the approval they wait for', async () => {
    const mine = await newVideo();
    await succeed(await createJob(db.pool, mine.versionId, 'script'));
    await waitingForApproval(mine);
    const theirs = await newVideo();
    await succeed(await createJob(db.pool, theirs.versionId, 'script'), OTHER_WORKER);
    const finished = await newVideo();
    await succeed(await createJob(db.pool, finished.versionId, 'script'));
    await db.pool.query(`UPDATE video_version SET status = 'CANCELLED' WHERE id = $1`, [
      finished.versionId,
    ]);

    const [row] = await detail(WORKER);

    expect(row!.videos_total).toBe(1);
    expect(row!.videos).toEqual([
      expect.objectContaining({ video_id: mine.videoId, version: 1, approval: 'SCRIPT' }),
    ]);
  });

  test('caps the video list at 15 and still counts them all', async () => {
    for (let i = 0; i < 16; i += 1) {
      const video = await newVideo();
      await succeed(await createJob(db.pool, video.versionId, 'script'));
    }

    const [row] = await detail(WORKER);

    expect(row!.videos).toHaveLength(15);
    expect(row!.videos_total).toBe(16);
  });

  test('counts only this worker and only the last 24 hours', async () => {
    const video = await newVideo();
    const script = await createJob(db.pool, video.versionId, 'script');
    await succeed(script);
    await db.pool.query(
      `UPDATE job_attempt
       SET started_at = now() - interval '10 minutes', finished_at = now() - interval '5 minutes'
       WHERE job_id = $1`,
      [script],
    );
    const old = await createJob(db.pool, video.versionId, 'timing');
    await succeed(old);
    await db.pool.query(
      `UPDATE job_attempt
       SET started_at = now() - interval '26 hours', finished_at = now() - interval '25 hours'
       WHERE job_id = $1`,
      [old],
    );
    await fail(await createJob(db.pool, video.versionId, 'tts', { maxAttempts: 1 }));
    const other = await newVideo();
    await succeed(await createJob(db.pool, other.versionId, 'script'), OTHER_WORKER);

    const [row] = await detail(WORKER);

    expect(row!.stats).toMatchObject({ succeeded: 1, failed: 1, completed: 0 });
    expect(row!.stats!.slowest).toEqual([{ step: 'script', median_seconds: 300 }]);
  });

  test('counts videos completed on this worker in the last 24 hours', async () => {
    const recent = await newVideo();
    await start(await createJob(db.pool, recent.versionId, 'script'));
    const old = await newVideo();
    await start(await createJob(db.pool, old.versionId, 'script'));
    await forced(async () => {
      await db.pool.query(
        `UPDATE video_version SET status = 'COMPLETED', updated_at = now() WHERE id = $1`,
        [recent.versionId],
      );
      await db.pool.query(
        `UPDATE video_version SET status = 'COMPLETED', updated_at = now() - interval '2 days'
         WHERE id = $1`,
        [old.versionId],
      );
    });

    expect((await detail(WORKER))[0]!.stats!.completed).toBe(1);
  });

  test('keeps at most three slowest steps, slowest first', async () => {
    const video = await newVideo();
    for (const [step, minutes] of [
      ['a_step', 1],
      ['b_step', 4],
      ['c_step', 3],
      ['d_step', 2],
    ] as const) {
      const job = await createJob(db.pool, video.versionId, step);
      await succeed(job);
      await db.pool.query(
        `UPDATE job_attempt SET finished_at = started_at + make_interval(mins => $2)
         WHERE job_id = $1`,
        [job, minutes],
      );
    }

    const { slowest } = (await detail(WORKER))[0]!.stats!;

    expect(slowest.map((s) => s.step)).toEqual(['b_step', 'c_step', 'd_step']);
  });
});
