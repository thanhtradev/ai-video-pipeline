import type pg from 'pg';

export interface ScriptApproval {
  videoId: string;
  versionId: string;
  jobId: string;
  approvalId: string;
  token: string;
}

/** A real episode at A1: submitted, its script written as the worker does, the request created. */
export async function episodeAtScriptApproval(
  pool: pg.Pool,
  submissionId: string,
  title: string,
  worker = 'mac-mini-m4',
): Promise<ScriptApproval> {
  const brief = { format: 'episode', topic: title };
  const submitted = await pool.query<{ video_id: string; version_id: string; job_id: string }>(
    'SELECT video_id, version_id, job_id FROM video_submit($1, $2::jsonb)',
    [submissionId, JSON.stringify(brief)],
  );
  const { video_id: videoId, version_id: versionId, job_id: jobId } = submitted.rows[0]!;
  await pool.query(`UPDATE job SET status = 'QUEUED', queued_at = now() WHERE id = $1`, [jobId]);
  await pool.query('SELECT * FROM job_start($1, $2, 60)', [jobId, worker]);
  await pool.query('SELECT job_succeed($1, $2, $3::jsonb)', [
    jobId,
    worker,
    JSON.stringify({
      outputs: [{ path: 'script.json', bytes: 100, sha256: 'b'.repeat(64) }],
      result: {
        format: 'episode',
        title,
        act_count: 1,
        scenes: [{ narration: `[punchy] ${title}` }],
        media_token: 'a'.repeat(32),
      },
      fromCheckpoint: false,
    }),
  ]);
  const due = await pool.query<{ video_version_id: string; token: string }>(
    'SELECT video_version_id, token FROM script_approvals_due()',
  );
  const { token } = due.rows.find((row) => row.video_version_id === versionId)!;
  const approval = await pool.query<{ id: string }>('SELECT id FROM approval WHERE token = $1', [
    token,
  ]);
  return { videoId, versionId, jobId, approvalId: approval.rows[0]!.id, token };
}

export async function prepareWebRoles(pool: pg.Pool, grantsSql: string): Promise<void> {
  for (const role of ['aivideo_n8n', 'aivideo_worker', 'aivideo_web']) {
    // Roles are cluster-wide and other test files may create them concurrently.
    await pool.query(`
      DO $$ BEGIN
        CREATE ROLE ${role} NOLOGIN;
      EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL;
      END $$;`);
  }
  await pool.query(grantsSql);
}

export async function webSignIn(pool: pg.Pool, user: number): Promise<string> {
  const login = await pool.query<{ token: string }>(
    'SELECT token FROM telegram_web_login($1, true)',
    [user],
  );
  const session = await pool.query<{ session: string }>(
    'SELECT session FROM web_login_consume($1)',
    [login.rows[0]!.token],
  );
  return session.rows[0]!.session;
}

/** Calls a function as the web role, as the service does. */
export async function callAsWeb<T>(pool: pg.Pool, fn: string, ...args: unknown[]): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE aivideo_web');
    const placeholders = args.map((_, i) => `$${i + 1}`).join(', ');
    const result = await client.query<{ value: T }>(`SELECT ${fn}(${placeholders}) AS value`, args);
    await client.query('COMMIT');
    return result.rows[0]!.value;
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
