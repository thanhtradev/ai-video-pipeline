import type pg from 'pg';

// An episode driven through the pipeline the way the dispatcher, the worker and Telegram would,
// for the storyboard (C3) and preview (A2) flow tests.

export const OWNER = 111;
export const STRANGER = 999;
export const WORKER = 'mac-mini-m4';

export interface JobRow {
  id: string;
  step: string;
  stream: string;
  status: string;
  input: Record<string, unknown>;
}

export async function jobs(pool: pg.Pool, versionId: string): Promise<JobRow[]> {
  const result = await pool.query<JobRow>(
    'SELECT id, step, stream, status, input FROM job WHERE video_version_id = $1 ORDER BY created_at',
    [versionId],
  );
  return result.rows;
}

/** Promotes, queues, starts and succeeds a job like the dispatcher and the worker. */
export async function succeed(pool: pg.Pool, jobId: string, output: object): Promise<void> {
  await pool.query('SELECT job_promote()');
  await pool.query(
    `UPDATE job SET status = 'QUEUED', queued_at = now() WHERE id = $1 AND status = 'READY'`,
    [jobId],
  );
  await pool.query('SELECT * FROM job_start($1, $2, 60)', [jobId, WORKER]);
  await pool.query('SELECT job_succeed($1, $2, $3::jsonb)', [
    jobId,
    WORKER,
    JSON.stringify({ fromCheckpoint: false, ...output }),
  ]);
}

let codeRun = 0;
/** episode_code output as the worker writes it: hashed files, board pages and a board token. */
export function codeOutput() {
  codeRun++;
  return {
    outputs: [
      { path: 'ws/src/episode/Episode.tsx', bytes: 10, sha256: String(codeRun).padStart(64, 'c') },
      { path: 'ws/board/page-01.jpg', bytes: 10, sha256: 'd'.repeat(64) },
    ],
    result: { board_pages: ['ws/board/page-01.jpg'], board_token: 'e'.repeat(32), turns: 2 },
  };
}

export async function decide(
  pool: pg.Pool,
  token: string,
  action: string,
  note: string | null = null,
  user = OWNER,
) {
  const result = await pool.query<{ result: string; version: number; round: number | null }>(
    'SELECT * FROM telegram_decide($1, $2, $3, $4)',
    [token, user, action, note],
  );
  return result.rows[0]!;
}

export interface StoryboardDueRow {
  kind: string;
  video_id: string;
  version: number;
  video_version_id: string;
  token: string;
  round: number;
  title: string;
  board: { job_id: string; token: string; pages: string[] };
}

export async function storyboardDue(pool: pg.Pool): Promise<StoryboardDueRow[]> {
  return (await pool.query<StoryboardDueRow>('SELECT * FROM storyboard_approvals_due()')).rows;
}

/** A new episode through A1 approval, narration, timeline and episode code. */
export async function episodeAwaitingStoryboard(pool: pg.Pool, name: string) {
  const submitted = (
    await pool.query<{ video_id: string; version_id: string; job_id: string }>(
      'SELECT * FROM video_submit($1, $2::jsonb)',
      [name, JSON.stringify({ format: 'episode', topic: `Tập ${name}` })],
    )
  ).rows[0]!;
  await succeed(pool, submitted.job_id, {
    outputs: [{ path: 'script.json', bytes: 1, sha256: 'a'.repeat(64) }],
    result: { format: 'episode', title: 'Mèo nghĩ gì?', scenes: [{ narration: 'Một.' }] },
  });
  const a1 = (
    await pool.query<{ token: string; video_version_id: string }>(
      'SELECT token, video_version_id FROM script_approvals_due()',
    )
  ).rows.find((row) => row.video_version_id === submitted.version_id)!;
  if ((await decide(pool, a1.token, 'APPROVE')).result !== 'OK') throw new Error('A1 refused');

  const [, tts, timing, code] = await jobs(pool, submitted.version_id);
  await succeed(pool, tts!.id, { outputs: [], result: { scenes: [] } });
  await succeed(pool, timing!.id, { outputs: [], result: {} });
  await succeed(pool, code!.id, codeOutput());
  const request = (await storyboardDue(pool)).find(
    (row) => row.video_version_id === submitted.version_id,
  )!;
  return { ...submitted, request, timingId: timing!.id, codeId: code!.id };
}
