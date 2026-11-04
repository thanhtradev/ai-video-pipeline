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
