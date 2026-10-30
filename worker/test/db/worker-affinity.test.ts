import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db.js';
import {
  createBatch,
  createJob,
  createVideo,
  jobStatus,
  markWorkerIdle,
  type VideoFixture,
} from '../helpers/fixtures.js';

// D-074: every job of a video runs on the worker that started its first job, because steps read
// earlier steps' files from that worker's local WORK_ROOT.

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(async () => {
  await db.drop();
});

let streamCounter = 0;
function uniqueStream(): string {
  streamCounter += 1;
  return `q:affinity-${streamCounter}`;
}

async function newVideo(sequence = 1): Promise<VideoFixture> {
  return createVideo(db.pool, await createBatch(db.pool), sequence);
}

async function pinnedWorker(videoId: string): Promise<string | null> {
  const result = await db.pool.query<{ worker_id: string | null }>(
    'SELECT worker_id FROM video WHERE id = $1',
    [videoId],
  );
  return result.rows[0]!.worker_id;
}

async function pin(videoId: string, workerId: string): Promise<void> {
  await db.pool.query('UPDATE video SET worker_id = $2 WHERE id = $1', [videoId, workerId]);
}

async function claim(stream: string, maxInFlight = 5) {
  const result = await db.pool.query<{ job_id: string; queue: string }>(
    'SELECT job_id, queue FROM dispatch_claim($1, $2)',
    [stream, maxInFlight],
  );
  return result.rows;
}

async function start(jobId: string, workerId: string) {
  const result = await db.pool.query('SELECT * FROM job_start($1, $2, 60)', [jobId, workerId]);
  return result.rows;
}

describe('job_start', () => {
  test('pins the video to the worker that starts its first job', async () => {
    const video = await newVideo();
    const stream = uniqueStream();
    const jobId = await createJob(db.pool, video.versionId, 'first', { stream });
    await claim(stream);

    expect(await start(jobId, 'mac-mini-m4')).toHaveLength(1);

    expect(await pinnedWorker(video.videoId)).toBe('mac-mini-m4');
  });

  test('keeps the existing pin when the same worker starts a later job', async () => {
    const video = await newVideo();
    await pin(video.videoId, 'hp-400-g7');
    const stream = uniqueStream();
    const jobId = await createJob(db.pool, video.versionId, 'later', { stream });
    await claim(stream);

    expect(await start(jobId, 'hp-400-g7')).toHaveLength(1);

    expect(await pinnedWorker(video.videoId)).toBe('hp-400-g7');
  });

  test('returns a job of a video pinned elsewhere to READY instead of starting it', async () => {
    const video = await newVideo();
    await pin(video.videoId, 'mac-mini-m4');
    const stream = uniqueStream();
    const jobId = await createJob(db.pool, video.versionId, 'stray', { stream });
    await claim(stream);

    expect(await start(jobId, 'hp-400-g7')).toHaveLength(0);

    expect(await jobStatus(db.pool, jobId)).toBe('READY');
    const row = await db.pool.query(
      'SELECT claimed_by, queued_at, attempt_count FROM job WHERE id = $1',
      [jobId],
    );
    expect(row.rows[0]).toEqual({ claimed_by: null, queued_at: null, attempt_count: 0 });
    expect(await pinnedWorker(video.videoId)).toBe('mac-mini-m4');
  });
});

describe('dispatch_claim', () => {
  test('routes jobs of pinned videos to the worker queue and others to the shared queue', async () => {
    const stream = uniqueStream();
    const pinned = await newVideo(1);
    await pin(pinned.videoId, 'hp-400-g7');
    const free = await newVideo(2);
    const pinnedJob = await createJob(db.pool, pinned.versionId, 'step', { stream });
    const freeJob = await createJob(db.pool, free.versionId, 'step', { stream });

    const rows = await claim(stream);

    expect(rows).toEqual(
      expect.arrayContaining([
        { job_id: pinnedJob, queue: `${stream}:w:hp-400-g7` },
        { job_id: freeJob, queue: stream },
      ]),
    );
  });

  test('applies the in-flight limit per target queue', async () => {
    const stream = uniqueStream();
    const busy = await newVideo(1);
    await pin(busy.videoId, 'mac-mini-m4');
    const running = await createJob(db.pool, busy.versionId, 'running', { stream });
    await claim(stream, 1);
    await start(running, 'mac-mini-m4');
    await createJob(db.pool, busy.versionId, 'waiting', { stream });
    const other = await newVideo(2);
    await pin(other.videoId, 'hp-400-g7');
    const otherJob = await createJob(db.pool, other.versionId, 'step', { stream });
    const free = await newVideo(3);
    const freeJob = await createJob(db.pool, free.versionId, 'step', { stream });

    const rows = await claim(stream, 1);

    expect(rows.map((row) => row.job_id).sort()).toEqual([otherJob, freeJob].sort());
  });
});

describe('dispatch_all', () => {
  test('returns the queue key in the stream column so WF-02 pushes onto it unchanged', async () => {
    const video = await newVideo();
    await pin(video.videoId, 'hp-400-g7');
    const jobId = await createJob(db.pool, video.versionId, 'dispatched', { stream: 'q:render' });

    const result = await db.pool.query<{ stream: string; job_id: string }>(
      'SELECT stream, job_id FROM dispatch_all()',
    );

    expect(result.rows).toContainEqual({ stream: 'q:render:w:hp-400-g7', job_id: jobId });
  });
});

describe('job_requeue_stale', () => {
  test('waits for the pinned worker to go idle, not any worker serving the stream', async () => {
    const stream = uniqueStream();
    const video = await newVideo();
    await pin(video.videoId, 'mac-mini-m4');
    const jobId = await createJob(db.pool, video.versionId, 'lost', { stream });
    await claim(stream);
    await db.pool.query(`UPDATE job SET queued_at = now() - interval '1 hour' WHERE id = $1`, [
      jobId,
    ]);
    await db.pool.query(`UPDATE worker SET last_idle_at = NULL WHERE id = 'mac-mini-m4'`);
    await markWorkerIdle(db.pool, 'hp-400-g7', [stream]);

    await db.pool.query(`SELECT job_requeue_stale(interval '10 minutes')`);
    expect(await jobStatus(db.pool, jobId)).toBe('QUEUED');

    await markWorkerIdle(db.pool, 'mac-mini-m4', [stream]);
    await db.pool.query(`SELECT job_requeue_stale(interval '10 minutes')`);
    expect(await jobStatus(db.pool, jobId)).toBe('READY');
  });
});

describe('worker_heartbeat with an API URL', () => {
  test('stores the URL that video_worker_url returns for videos pinned to the worker', async () => {
    await db.pool.query(
      `SELECT worker_heartbeat('hp-400-g7', ARRAY['q:light'], 'http://100.64.0.9:8787')`,
    );
    const pinned = await newVideo(1);
    await pin(pinned.videoId, 'hp-400-g7');
    const free = await newVideo(2);

    const result = await db.pool.query<{ pinned: string | null; free: string | null }>(
      'SELECT video_worker_url($1) AS pinned, video_worker_url($2) AS free',
      [pinned.videoId, free.videoId],
    );

    expect(result.rows[0]).toEqual({ pinned: 'http://100.64.0.9:8787', free: null });
  });

  test('rejects a URL that is not http(s)', async () => {
    await expect(
      db.pool.query(`SELECT worker_heartbeat('hp-400-g7', ARRAY['q:light'], 'ftp://x')`),
    ).rejects.toThrow(/check constraint/);
  });
});

describe('watchdog_run', () => {
  test('reports videos waiting on an offline pinned worker', async () => {
    await db.pool.query(
      `INSERT INTO worker (id, last_seen_at) VALUES ('gone-worker', now() - interval '1 day')`,
    );
    const video = await newVideo();
    await pin(video.videoId, 'gone-worker');
    await createJob(db.pool, video.versionId, 'stalled', { stream: uniqueStream() });

    const result = await db.pool.query<{ watchdog_run: { stalled_pinned: unknown[] } }>(
      'SELECT watchdog_run()',
    );

    expect(result.rows[0]!.watchdog_run.stalled_pinned).toEqual([
      { video_id: video.videoId, worker_id: 'gone-worker' },
    ]);
  });
});
