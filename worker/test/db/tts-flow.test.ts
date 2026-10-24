import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db.js';
import { versionStatus } from '../helpers/fixtures.js';

const OWNER = 111;
const WORKER = 'mac-mini-m4';
const BRIEF = { topic: 'Vì sao bầu trời có màu xanh?', duration_seconds: 30 };
// 10 + 12 characters; "ầ" is one code point after NFC normalization.
const SCENES = [{ narration: 'Bầu trời. ' }, { narration: 'Màu xanh lam' }];
const CHARS = 22;

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

async function modelId(): Promise<string> {
  const result = await db.pool.query<{ id: string }>(
    `SELECT id FROM provider_model WHERE provider_id = 'itera' AND model_id = 'eleven_multilingual_v2'`,
  );
  return result.rows[0]!.id;
}

/** Rollout state: voice set, provider and model enabled, price in credits per character. */
async function configureItera(unitPrice = 1): Promise<void> {
  await db.pool.query(`UPDATE provider SET enabled = true WHERE id = 'itera'`);
  await db.pool.query(
    `UPDATE provider_model SET enabled = true,
       default_params = default_params || '{"voice_id": "voice-1"}'::jsonb
     WHERE provider_id = 'itera'`,
  );
  await db.pool.query('DELETE FROM provider_price');
  await db.pool.query(
    `INSERT INTO provider_price (provider_model_id, unit, unit_price, currency, valid_from, source_note)
     VALUES ($1, 'per_char', $2, 'CRD', now() - interval '1 day', 'test')`,
    [await modelId(), unitPrice],
  );
}

beforeEach(async () => {
  await db.pool.query('DELETE FROM cost_entry');
  await configureItera();
});

interface Approved {
  versionId: string;
  token: string;
  script: Record<string, unknown>;
}

/** Brief -> script job succeeded (with scenes) -> A1 requested. */
async function awaitingApproval(
  submissionId: string,
  scenes: object[] = SCENES,
): Promise<Approved> {
  const submitted = await db.pool.query<{ version_id: string; job_id: string }>(
    'SELECT * FROM video_submit($1, $2::jsonb)',
    [submissionId, JSON.stringify(BRIEF)],
  );
  const { version_id: versionId, job_id: jobId } = submitted.rows[0]!;
  await runAsWorker(jobId);
  await db.pool.query('SELECT job_succeed($1, $2, $3::jsonb)', [
    jobId,
    WORKER,
    JSON.stringify({
      outputs: [{ path: 'script.json', bytes: 100, sha256: 'a'.repeat(64) }],
      result: { title: 'Bầu trời xanh', scene_count: scenes.length, scenes },
    }),
  ]);
  const due = await db.pool.query<{ video_version_id: string; token: string; script: object }>(
    'SELECT * FROM script_approvals_due()',
  );
  const row = due.rows.find((r) => r.video_version_id === versionId)!;
  return { versionId, token: row.token, script: row.script as Record<string, unknown> };
}

async function runAsWorker(jobId: string): Promise<void> {
  await db.pool.query(`UPDATE job SET status = 'QUEUED', queued_at = now() WHERE id = $1`, [jobId]);
  await db.pool.query('SELECT * FROM job_start($1, $2, 60)', [jobId, WORKER]);
}

async function approve(token: string): Promise<void> {
  await db.pool.query(`SELECT * FROM approval_telegram_decide($1, $2, 'APPROVE')`, [token, OWNER]);
}

async function ttsJob(versionId: string): Promise<{ id: string; status: string; input: unknown }> {
  const result = await db.pool.query<{ id: string; status: string; input: unknown }>(
    `SELECT id, status, input FROM job WHERE video_version_id = $1 AND step = 'tts'`,
    [versionId],
  );
  return result.rows[0]!;
}

interface Guard {
  decision: string;
  provider_id: string | null;
  model_id: string | null;
  params: Record<string, unknown> | null;
  amount: number | null;
  budget: number | null;
  spent: number | null;
}

async function guard(jobId: string, units: number): Promise<Guard> {
  const result = await db.pool.query<Guard>(
    `SELECT decision, provider_id, model_id, params,
            amount::float8 AS amount, budget::float8 AS budget, spent::float8 AS spent
     FROM cost_guard($1, $2, $3)`,
    [jobId, WORKER, units],
  );
  return result.rows[0]!;
}

async function record(jobId: string, ref: string, units: number, amount: number): Promise<boolean> {
  const result = await db.pool.query<{ cost_record: boolean }>(
    'SELECT cost_record($1, $2, $3, $4, $5)',
    [jobId, WORKER, ref, units, amount],
  );
  return result.rows[0]!.cost_record;
}

/** Approved video with its tts job running on the worker. */
async function runningTts(submissionId: string): Promise<{ versionId: string; jobId: string }> {
  const { versionId, token } = await awaitingApproval(submissionId);
  await approve(token);
  const job = await ttsJob(versionId);
  await runAsWorker(job.id);
  return { versionId, jobId: job.id };
}

describe('A1 estimate', () => {
  test('records an ESTIMATE of the narration characters plus 10% and shows it in A1', async () => {
    const { versionId, script } = await awaitingApproval('est-1');

    expect(script.tts_estimate).toEqual({ units: CHARS, amount: 25, currency: 'CRD' });
    expect(script).not.toHaveProperty('scenes');
    const entries = await db.pool.query(
      `SELECT kind, units::int, amount::int, currency FROM cost_entry WHERE video_version_id = $1`,
      [versionId],
    );
    expect(entries.rows).toEqual([{ kind: 'ESTIMATE', units: CHARS, amount: 25, currency: 'CRD' }]);
  });

  test('has no estimate when no price is configured', async () => {
    await db.pool.query('DELETE FROM provider_price');
    const { script } = await awaitingApproval('est-none');
    expect(script.tts_estimate).toBeNull();
  });
});

describe('approving a script', () => {
  test('creates one READY tts job on q:light with the scene texts and the TTS model', async () => {
    const { versionId, token } = await awaitingApproval('approve-1');
    await approve(token);

    expect(await versionStatus(db.pool, versionId)).toBe('GENERATING_ASSETS');
    const job = await ttsJob(versionId);
    expect(job.status).toBe('READY');
    expect(job.input).toEqual({
      scenes: [
        { index: 1, text: 'Bầu trời. ' },
        { index: 2, text: 'Màu xanh lam' },
      ],
      provider_model_id: await modelId(),
      language: 'vi',
    });
  });

  test('fails for a script written before Phase 2b (no scenes) and changes nothing', async () => {
    const { versionId, token } = await awaitingApproval('approve-old', []);

    await expect(approve(token)).rejects.toThrow(/has no scenes; regenerate it/);
    expect(await versionStatus(db.pool, versionId)).toBe('AWAITING_SCRIPT_APPROVAL');
  });
});

describe('cost_guard', () => {
  test('allows spending within the approved estimate and returns the model settings', async () => {
    const { jobId } = await runningTts('guard-allow');

    expect(await guard(jobId, 10)).toMatchObject({
      decision: 'ALLOW',
      provider_id: 'itera',
      model_id: 'eleven_multilingual_v2',
      params: { provider: 'elevenlabs', language_code: 'vi', voice_id: 'voice-1' },
      amount: 10,
      budget: 25,
      spent: 0,
    });
  });

  test('refuses a call that would exceed the approved estimate', async () => {
    const { jobId } = await runningTts('guard-over');
    await record(jobId, 'task-1', 20, 20);

    expect(await guard(jobId, 5)).toMatchObject({ decision: 'ALLOW', spent: 20 });
    expect(await guard(jobId, 6)).toMatchObject({ decision: 'OVER_BUDGET' });
  });

  test('blocks when the provider or model is disabled, or the quota is exhausted', async () => {
    const { jobId } = await runningTts('guard-disabled');

    await db.pool.query(`UPDATE provider SET enabled = false WHERE id = 'itera'`);
    expect((await guard(jobId, 1)).decision).toBe('DISABLED');

    await db.pool.query(`UPDATE provider SET enabled = true WHERE id = 'itera'`);
    await db.pool.query(
      `INSERT INTO provider_quota (provider_model_id, period, status) VALUES ($1, 'month', 'EXHAUSTED')`,
      [await modelId()],
    );
    try {
      expect((await guard(jobId, 1)).decision).toBe('EXHAUSTED');
    } finally {
      await db.pool.query('DELETE FROM provider_quota');
    }
  });

  test('needs a price', async () => {
    const { jobId } = await runningTts('guard-price');
    await db.pool.query(`UPDATE provider_price SET valid_to = now()`);

    expect((await guard(jobId, 1)).decision).toBe('NO_PRICE');
  });

  test('has no budget when no estimate was approved', async () => {
    await db.pool.query('DELETE FROM provider_price');
    const { versionId, token } = await awaitingApproval('guard-nobudget');
    await configureItera();
    await approve(token);
    const job = await ttsJob(versionId);
    await runAsWorker(job.id);

    expect(await guard(job.id, 1)).toMatchObject({ decision: 'OVER_BUDGET', budget: 0 });
  });

  test('answers LOST for a job this worker is not running and audits every answer', async () => {
    const { versionId, token } = await awaitingApproval('guard-lost');
    await approve(token);
    const job = await ttsJob(versionId);

    expect((await guard(job.id, 1)).decision).toBe('LOST');
    const audit = await db.pool.query(
      `SELECT detail->>'decision' AS decision FROM audit_log
       WHERE action = 'cost_guard' AND object_id = $1`,
      [job.id],
    );
    expect(audit.rows).toEqual([]);

    await runAsWorker(job.id);
    await guard(job.id, 1);
    const after = await db.pool.query(
      `SELECT detail->>'decision' AS decision FROM audit_log
       WHERE action = 'cost_guard' AND object_id = $1`,
      [job.id],
    );
    expect(after.rows).toEqual([{ decision: 'ALLOW' }]);
  });
});

describe('cost_record', () => {
  test('records the provider charge once per provider task', async () => {
    const { versionId, jobId } = await runningTts('record-1');

    expect(await record(jobId, 'task-a', 10, 12)).toBe(true);
    expect(await record(jobId, 'task-a', 10, 12)).toBe(false);

    const entries = await db.pool.query(
      `SELECT units::int, unit_price::int, amount::int, currency, external_ref, attempt_id IS NOT NULL AS has_attempt
       FROM cost_entry WHERE video_version_id = $1 AND kind = 'ACTUAL'`,
      [versionId],
    );
    expect(entries.rows).toEqual([
      {
        units: 10,
        unit_price: 1,
        amount: 12,
        currency: 'CRD',
        external_ref: 'task-a',
        has_attempt: true,
      },
    ]);
  });

  test('still records after the job was cancelled, but not for a worker that never ran it', async () => {
    const { jobId } = await runningTts('record-cancelled');
    await db.pool.query(`SELECT job_cancel($1, 'test')`, [jobId]);

    expect(await record(jobId, 'task-late', 5, 5)).toBe(true);
    await expect(
      db.pool.query(`SELECT cost_record($1, 'macbook-pro-m1', 'x', 1, 1)`, [jobId]),
    ).rejects.toThrow(/was not run by worker/);
  });

  test('rejects negative amounts and a missing task id', async () => {
    const { jobId } = await runningTts('record-bad');
    await expect(record(jobId, '', 1, 1)).rejects.toThrow(/external_ref is required/);
    await expect(record(jobId, 'x', 1, -1)).rejects.toThrow(/non-negative/);
  });
});
