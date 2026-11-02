import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db.js';
import { createBatch, createJob, createVideo, jobStatus } from '../helpers/fixtures.js';

// D-087: the owner moves a video to another worker with /move. The target worker copies the
// video folder from the source worker's API, then the video is re-pinned. While a move is open
// nothing of that video is dispatched; the copy starts only once the video has no job queued or
// running; three failed copies give up and leave the video where it was.

const OWNER = 111;
const APPROVER = 222;
const SOURCE = 'mac-mini-m4';
const TARGET = 'hp-400-g7';
const LEASE = 600;

let db: TestDb;
let streamCounter = 0;

beforeAll(async () => {
  db = await createTestDb();
  await db.pool.query(
    `INSERT INTO approver (telegram_user_id, name, is_owner) VALUES ($1, 'owner', true), ($2, 'member', false)`,
    [OWNER, APPROVER],
  );
});

afterAll(async () => {
  await db.drop();
});

beforeEach(async () => {
  await online(SOURCE);
  await online(TARGET);
  // Each test claims its own move: close the ones earlier tests left open.
  await db.pool.query(
    `UPDATE video_move SET status = 'CANCELLED' WHERE status IN ('WAITING', 'COPYING')`,
  );
});

async function online(
  id: string,
  seenAgo = '0 seconds',
  apiUrl: string | null = `http://${id}:8787`,
) {
  await db.pool.query(
    `INSERT INTO worker (id, capabilities, last_seen_at, api_url)
     VALUES ($1, '{q:light}', now() - $2::interval, $3)
     ON CONFLICT (id) DO UPDATE SET last_seen_at = excluded.last_seen_at, api_url = excluded.api_url`,
    [id, seenAgo, apiUrl],
  );
}

interface Fixture {
  videoId: string;
  versionId: string;
  prefix: string;
  stream: string;
}

async function pinnedVideo(worker: string | null = SOURCE): Promise<Fixture> {
  const { videoId, versionId } = await createVideo(db.pool, await createBatch(db.pool), 1);
  if (worker)
    await db.pool.query('UPDATE video SET worker_id = $2 WHERE id = $1', [videoId, worker]);
  streamCounter += 1;
  return { videoId, versionId, prefix: videoId.slice(0, 8), stream: `q:move-${streamCounter}` };
}

interface MoveRow {
  result: string;
  video_id: string | null;
  from_worker: string | null;
  to_worker: string | null;
  busy: boolean | null;
}

async function move(prefix: string, target: string | null, user = OWNER): Promise<MoveRow> {
  const result = await db.pool.query<MoveRow>('SELECT * FROM telegram_move($1, $2, $3)', [
    user,
    prefix,
    target,
  ]);
  return result.rows[0]!;
}

interface ClaimRow {
  move_id: string;
  video_id: string;
  source_url: string;
  token: string;
  attempt_no: number;
}

async function claim(worker = TARGET): Promise<ClaimRow | undefined> {
  const result = await db.pool.query<ClaimRow>('SELECT * FROM video_move_claim($1, $2)', [
    worker,
    LEASE,
  ]);
  return result.rows[0];
}

async function complete(moveId: string, worker = TARGET): Promise<string> {
  const result = await db.pool.query<{ r: string }>('SELECT video_move_complete($1, $2) AS r', [
    moveId,
    worker,
  ]);
  return result.rows[0]!.r;
}

async function fail(moveId: string, worker = TARGET): Promise<string> {
  const result = await db.pool.query<{ r: string }>(
    `SELECT video_move_fail($1, $2, 'copy failed') AS r`,
    [moveId, worker],
  );
  return result.rows[0]!.r;
}

async function tokenValid(videoId: string, token: string, worker = SOURCE): Promise<boolean> {
  const result = await db.pool.query<{ ok: boolean }>(
    'SELECT video_move_token_valid($1, $2, $3) AS ok',
    [worker, videoId, token],
  );
  return result.rows[0]!.ok;
}

async function pinnedWorker(videoId: string): Promise<string | null> {
  const result = await db.pool.query<{ worker_id: string | null }>(
    'SELECT worker_id FROM video WHERE id = $1',
    [videoId],
  );
  return result.rows[0]!.worker_id;
}

async function moveStatus(videoId: string): Promise<string> {
  const result = await db.pool.query<{ status: string }>(
    'SELECT status FROM video_move WHERE video_id = $1 ORDER BY created_at DESC LIMIT 1',
    [videoId],
  );
  return result.rows[0]!.status;
}

async function dispatch(stream: string) {
  await db.pool.query('SELECT job_promote()');
  const result = await db.pool.query<{ job_id: string; queue: string }>(
    'SELECT job_id, queue FROM dispatch_claim($1, 5)',
    [stream],
  );
  return result.rows;
}

async function watchdog(): Promise<Record<string, unknown>> {
  const result = await db.pool.query<{ summary: Record<string, unknown> }>(
    'SELECT watchdog_run() AS summary',
  );
  return result.rows[0]!.summary;
}

describe('telegram_move', () => {
  test('owner only', async () => {
    const video = await pinnedVideo();

    expect((await move(video.prefix, TARGET, APPROVER)).result).toBe('NOT_OWNER');
    expect((await move(video.prefix, TARGET, 999)).result).toBe('NOT_OWNER');
  });

  test('answers unknown and finished videos', async () => {
    expect((await move('ffffffff', TARGET)).result).toBe('NOT_FOUND');
    expect((await move('zz', TARGET)).result).toBe('NOT_FOUND');
    const video = await pinnedVideo();
    await db.pool.query(`UPDATE video_version SET status = 'CANCELLED' WHERE id = $1`, [
      video.versionId,
    ]);
    expect((await move(video.prefix, TARGET)).result).toBe('FINISHED');
  });

  test('checks both workers', async () => {
    const video = await pinnedVideo();

    expect((await move(video.prefix, SOURCE)).result).toBe('SAME_WORKER');
    expect((await move(video.prefix, 'raspberry')).result).toBe('UNKNOWN_WORKER');
    await online(TARGET, '10 minutes');
    expect((await move(video.prefix, TARGET)).result).toBe('TARGET_OFFLINE');
    await online(TARGET);
    await online(SOURCE, '10 minutes');
    expect((await move(video.prefix, TARGET)).result).toBe('SOURCE_OFFLINE');
  });

  test('pins an unpinned video at once, nothing to copy', async () => {
    const video = await pinnedVideo(null);

    expect(await move(video.prefix, TARGET)).toMatchObject({
      result: 'PINNED',
      video_id: video.videoId,
      to_worker: TARGET,
    });
    expect(await pinnedWorker(video.videoId)).toBe(TARGET);
  });

  test('opens one move per video and says whether a step is running', async () => {
    const video = await pinnedVideo();
    const job = await createJob(db.pool, video.versionId, 'busy', { stream: video.stream });
    await dispatch(video.stream);
    await db.pool.query('SELECT * FROM job_start($1, $2, 60)', [job, SOURCE]);

    expect(await move(video.prefix, TARGET)).toMatchObject({
      result: 'REQUESTED',
      video_id: video.videoId,
      from_worker: SOURCE,
      to_worker: TARGET,
      busy: true,
    });
    expect((await move(video.prefix, TARGET)).result).toBe('ALREADY_MOVING');
    expect(await moveStatus(video.videoId)).toBe('WAITING');
  });

  test('cancels a waiting move, not a copy in progress', async () => {
    const video = await pinnedVideo();
    expect((await move(video.prefix, null)).result).toBe('NOT_MOVING');
    await move(video.prefix, TARGET);

    expect((await move(video.prefix, null)).result).toBe('CANCELLED');
    expect(await moveStatus(video.videoId)).toBe('CANCELLED');

    await move(video.prefix, TARGET);
    await claim();
    expect((await move(video.prefix, null)).result).toBe('COPYING');
  });
});

describe('while a move is open', () => {
  test('nothing of the video is dispatched; other videos are', async () => {
    const video = await pinnedVideo();
    const other = await pinnedVideo();
    other.stream = video.stream;
    const blocked = await createJob(db.pool, video.versionId, 'next', { stream: video.stream });
    const free = await createJob(db.pool, other.versionId, 'next', { stream: video.stream });
    await move(video.prefix, TARGET);

    const rows = await dispatch(video.stream);

    expect(rows.map((row) => row.job_id)).toEqual([free]);
    expect(await jobStatus(db.pool, blocked)).toBe('READY');
  });

  test('the target claims it only once the video has no job queued or running', async () => {
    const video = await pinnedVideo();
    const job = await createJob(db.pool, video.versionId, 'busy', { stream: video.stream });
    await dispatch(video.stream);
    await db.pool.query('SELECT * FROM job_start($1, $2, 60)', [job, SOURCE]);
    await move(video.prefix, TARGET);

    expect(await claim()).toBeUndefined();
    await db.pool.query(`SELECT job_succeed($1, $2, '{"fromCheckpoint":false}'::jsonb)`, [
      job,
      SOURCE,
    ]);

    expect(await claim(SOURCE)).toBeUndefined();
    const claimed = await claim();
    expect(claimed).toMatchObject({
      video_id: video.videoId,
      source_url: `http://${SOURCE}:8787`,
      attempt_no: 1,
    });
    expect(claimed!.token).toMatch(/^[0-9a-f]{32}$/);
    expect(await moveStatus(video.videoId)).toBe('COPYING');
  });
});

describe('the copy', () => {
  test('the source accepts the token only for that video, from itself, while copying', async () => {
    const video = await pinnedVideo();
    await move(video.prefix, TARGET);
    const claimed = (await claim())!;

    expect(await tokenValid(video.videoId, claimed.token)).toBe(true);
    expect(await tokenValid(video.videoId, 'f'.repeat(32))).toBe(false);
    expect(await tokenValid(video.videoId, claimed.token, TARGET)).toBe(false);
    const other = await pinnedVideo();
    expect(await tokenValid(other.videoId, claimed.token)).toBe(false);

    await complete(claimed.move_id);
    expect(await tokenValid(video.videoId, claimed.token)).toBe(false);
  });

  test('completing re-pins the video and its waiting jobs go to the new worker', async () => {
    const video = await pinnedVideo();
    const next = await createJob(db.pool, video.versionId, 'next', { stream: video.stream });
    await move(video.prefix, TARGET);
    const claimed = (await claim())!;

    expect(await complete(claimed.move_id, SOURCE)).toBe('LOST');
    expect(await complete(claimed.move_id)).toBe('DONE');

    expect(await pinnedWorker(video.videoId)).toBe(TARGET);
    expect(await moveStatus(video.videoId)).toBe('DONE');
    expect(await dispatch(video.stream)).toEqual([
      { job_id: next, queue: `${video.stream}:w:${TARGET}` },
    ]);
    const audit = await db.pool.query(
      `SELECT count(*)::int AS n FROM audit_log WHERE action = 'video_moved' AND object_type = 'video' AND object_id = $1`,
      [video.videoId],
    );
    expect(audit.rows[0]).toEqual({ n: 1 });
  });

  test('a failed copy is retried, then given up after 3 attempts; dispatch resumes', async () => {
    const video = await pinnedVideo();
    const next = await createJob(db.pool, video.versionId, 'next', { stream: video.stream });
    await move(video.prefix, TARGET);

    for (const expected of ['WAITING', 'WAITING', 'FAILED']) {
      const claimed = (await claim())!;
      expect(await fail(claimed.move_id)).toBe(expected);
    }

    expect(await claim()).toBeUndefined();
    expect(await pinnedWorker(video.videoId)).toBe(SOURCE);
    expect(await dispatch(video.stream)).toEqual([
      { job_id: next, queue: `${video.stream}:w:${SOURCE}` },
    ]);
  });

  test('an expired copy lease counts as a failed attempt', async () => {
    const video = await pinnedVideo();
    await move(video.prefix, TARGET);
    const claimed = (await claim())!;
    await db.pool.query(
      `UPDATE video_move SET lease_expires_at = now() - interval '1 second' WHERE id = $1`,
      [claimed.move_id],
    );

    await watchdog();

    expect(await moveStatus(video.videoId)).toBe('WAITING');
    expect(await complete(claimed.move_id)).toBe('LOST');
    expect((await claim())!.attempt_no).toBe(2);
  });

  test('a waiting move fails when its target goes offline', async () => {
    const video = await pinnedVideo();
    await move(video.prefix, TARGET);
    await online(TARGET, '10 minutes');

    await watchdog();

    expect(await moveStatus(video.videoId)).toBe('FAILED');
  });
});

describe('watchdog_run', () => {
  test('announces each finished or failed move once', async () => {
    await watchdog();
    const done = await pinnedVideo();
    await move(done.prefix, TARGET);
    await complete((await claim())!.move_id);
    const failed = await pinnedVideo();
    await move(failed.prefix, TARGET);
    for (let i = 0; i < 3; i++) await fail((await claim())!.move_id);

    const first = await watchdog();
    const second = await watchdog();

    expect(first.moves).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          video_id: done.videoId,
          status: 'DONE',
          from_worker: SOURCE,
          to_worker: TARGET,
        }),
        expect.objectContaining({
          video_id: failed.videoId,
          status: 'FAILED',
          error: 'copy failed',
        }),
      ]),
    );
    expect(second.moves).toEqual([]);
  });
});

describe('telegram_workers', () => {
  test('lists open moves per worker', async () => {
    const video = await pinnedVideo();
    await move(video.prefix, TARGET);

    const result = await db.pool.query<{ worker_id: string; moves: { video_id: string }[] }>(
      'SELECT worker_id, moves FROM telegram_workers($1)',
      [OWNER],
    );

    const target = result.rows.find((row) => row.worker_id === TARGET)!;
    expect(target.moves).toContainEqual(
      expect.objectContaining({ video_id: video.videoId, from_worker: SOURCE, status: 'WAITING' }),
    );
  });
});
