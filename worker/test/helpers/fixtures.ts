import type pg from 'pg';

export interface VideoFixture {
  batchId: string;
  videoId: string;
  versionId: string;
}

export async function createBatch(pool: pg.Pool, projectName = 'test-project'): Promise<string> {
  const project = await pool.query<{ id: string }>(
    'INSERT INTO project (name) VALUES ($1) RETURNING id',
    [projectName],
  );
  const batch = await pool.query<{ id: string }>(
    'INSERT INTO batch (project_id) VALUES ($1) RETURNING id',
    [project.rows[0]!.id],
  );
  return batch.rows[0]!.id;
}

export async function createVideo(
  pool: pg.Pool,
  batchId: string,
  sequence: number,
): Promise<VideoFixture> {
  const result = await pool.query<{ video_id: string; version_id: string }>(
    `SELECT video_id, version_id FROM video_create($1, $2, '9:16', '{"topic":"test"}'::jsonb)`,
    [batchId, sequence],
  );
  const row = result.rows[0]!;
  return { batchId, videoId: row.video_id, versionId: row.version_id };
}

export async function createJob(
  pool: pg.Pool,
  versionId: string,
  step: string,
  options: { stream?: string; inputHash?: string; dependsOn?: string[]; maxAttempts?: number } = {},
): Promise<string> {
  const result = await pool.query<{ job_create: string }>(
    'SELECT job_create($1, $2, $3, $4::jsonb, $5, $6::uuid[], $7)',
    [
      versionId,
      step,
      options.stream ?? 'q:light',
      JSON.stringify({ step }),
      options.inputHash ?? `hash-${step}`,
      options.dependsOn ?? [],
      options.maxAttempts ?? 3,
    ],
  );
  return result.rows[0]!.job_create;
}

export async function jobStatus(pool: pg.Pool, jobId: string): Promise<string> {
  const result = await pool.query<{ status: string }>('SELECT status FROM job WHERE id = $1', [
    jobId,
  ]);
  return result.rows[0]!.status;
}

export async function versionStatus(pool: pg.Pool, versionId: string): Promise<string> {
  const result = await pool.query<{ status: string }>(
    'SELECT status FROM video_version WHERE id = $1',
    [versionId],
  );
  return result.rows[0]!.status;
}

export async function setVersionStatus(
  pool: pg.Pool,
  versionId: string,
  path: string[],
): Promise<void> {
  for (const status of path) {
    await pool.query('UPDATE video_version SET status = $2 WHERE id = $1', [versionId, status]);
  }
}
