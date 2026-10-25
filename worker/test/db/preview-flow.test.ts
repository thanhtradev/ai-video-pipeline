import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db.js';
import { jobStatus, versionStatus } from '../helpers/fixtures.js';

const OWNER = 111;
const WORKER = 'mac-mini-m4';
const BRIEF = { topic: 'Vì sao bầu trời có màu xanh?', duration_seconds: 30 };
const SCENES = [
  {
    narration: 'Bầu trời xanh.'.normalize('NFD'),
    on_screen_text: 'Bầu trời',
    emphasis: ['trời'],
  },
  { narration: 'Vì tán xạ.', on_screen_text: 'Tán xạ', emphasis: [] },
];

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

async function runAsWorker(jobId: string): Promise<void> {
  await db.pool.query(`UPDATE job SET status = 'QUEUED', queued_at = now() WHERE id = $1`, [jobId]);
  await db.pool.query('SELECT * FROM job_start($1, $2, 60)', [jobId, WORKER]);
}

async function succeed(jobId: string, output: object): Promise<void> {
  await runAsWorker(jobId);
  await db.pool.query('SELECT job_succeed($1, $2, $3::jsonb)', [
    jobId,
    WORKER,
    JSON.stringify(output),
  ]);
}

/** Brief -> script (with the given result) -> A1 approved. */
async function approved(
  submissionId: string,
  result: object = { title: 'Bầu trời xanh', hook: 'Vì sao?', music_style: 'curious' },
): Promise<string> {
  const submitted = await db.pool.query<{ version_id: string; job_id: string }>(
    'SELECT * FROM video_submit($1, $2::jsonb)',
    [submissionId, JSON.stringify(BRIEF)],
  );
  const { version_id: versionId, job_id: scriptJob } = submitted.rows[0]!;
  await succeed(scriptJob, {
    outputs: [{ path: 'script.json', bytes: 100, sha256: 'a'.repeat(64) }],
    result: { ...result, scenes: SCENES },
  });
  const due = await db.pool.query<{ video_version_id: string; token: string }>(
    'SELECT * FROM script_approvals_due()',
  );
  const token = due.rows.find((row) => row.video_version_id === versionId)!.token;
  await db.pool.query(`SELECT * FROM approval_telegram_decide($1, $2, 'APPROVE')`, [token, OWNER]);
  return versionId;
}

async function job(
  versionId: string,
  step: string,
): Promise<{ id: string; status: string; stream: string; input: Record<string, unknown> }> {
  const result = await db.pool.query(
    `SELECT id, status, stream, input FROM job WHERE video_version_id = $1 AND step = $2`,
    [versionId, step],
  );
  return result.rows[0];
}

describe('render_preview job', () => {
  test('approving A1 creates it on q:render, waiting for the tts job, with the frozen script', async () => {
    const versionId = await approved('preview-create');
    const tts = await job(versionId, 'tts');
    const render = await job(versionId, 'render_preview');

    expect(render).toMatchObject({ status: 'PENDING', stream: 'q:render' });
    expect(render.input).toEqual({
      title: 'Bầu trời xanh',
      hook: 'Vì sao?',
      music_style: 'curious',
      language: 'vi',
      tts_job_id: tts.id,
      scenes: [
        {
          index: 1,
          narration: 'Bầu trời xanh.'.normalize('NFC'),
          on_screen_text: 'Bầu trời',
          emphasis: ['trời'],
        },
        { index: 2, narration: 'Vì tán xạ.', on_screen_text: 'Tán xạ', emphasis: [] },
      ],
    });
    const dependency = await db.pool.query(
      'SELECT depends_on_job_id FROM job_dependency WHERE job_id = $1',
      [render.id],
    );
    expect(dependency.rows).toEqual([{ depends_on_job_id: tts.id }]);
    expect(await versionStatus(db.pool, versionId)).toBe('GENERATING_ASSETS');
  });

  test('becomes READY after the narration and moves the version to RENDERING_PREVIEW', async () => {
    const versionId = await approved('preview-ready');
    const tts = await job(versionId, 'tts');

    await succeed(tts.id, { outputs: [], result: { scenes: [] } });
    await db.pool.query('SELECT job_promote()');

    expect(await jobStatus(db.pool, (await job(versionId, 'render_preview')).id)).toBe('READY');
    expect(await versionStatus(db.pool, versionId)).toBe('RENDERING_PREVIEW');
  });

  test('is idempotent and can be created for a version approved before 2c', async () => {
    const versionId = await approved('preview-again', { title: 'Cũ' });
    const first = await job(versionId, 'render_preview');

    const again = await db.pool.query<{ id: string }>(
      'SELECT render_preview_job_create($1) AS id',
      [versionId],
    );

    expect(again.rows[0]!.id).toBe(first.id);
    // Scripts from before 2c: no hook or music_style.
    expect(first.input).toMatchObject({ hook: 'Cũ', music_style: 'calm' });
  });

  test('a version without a tts job cannot get one', async () => {
    const submitted = await db.pool.query<{ version_id: string }>(
      'SELECT * FROM video_submit($1, $2::jsonb)',
      ['preview-no-tts', JSON.stringify(BRIEF)],
    );
    await expect(
      db.pool.query('SELECT render_preview_job_create($1)', [submitted.rows[0]!.version_id]),
    ).rejects.toThrow(/no scenes/);
  });
});
