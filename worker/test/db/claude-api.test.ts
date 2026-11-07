import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db.js';
import { createBatch, createJob, createVideo } from '../helpers/fixtures.js';

// Claude API as owner-approved overflow (D-118): a Claude step blocked by the Max usage limit is
// offered once per block (WF-08); the owner's tap grants one job a USD cap; the worker reserves
// before every CLI run and records the CLI's cost after it. Nothing spends without a grant.

const OWNER = 111;
const APPROVER = 222;
const WORKER = 'mac-mini-m4';
const LIMIT_REASON = 'claude-code usage limit: Claude AI usage limit reached|1761400800';

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
  await db.pool.query(
    `INSERT INTO approver (telegram_user_id, name, is_owner) VALUES ($1, 'owner', true), ($2, 'a', false)`,
    [OWNER, APPROVER],
  );
});

afterAll(async () => {
  await db.drop();
});

beforeEach(async () => {
  // Each test starts with the API on, a $45 month, caps for the text steps, and no earlier spend.
  await db.pool.query(`UPDATE provider SET enabled = true WHERE id = 'anthropic-api'`);
  await db.pool.query(
    `UPDATE provider_model SET enabled = true WHERE provider_id = 'anthropic-api'`,
  );
  await db.pool.query(
    `UPDATE provider_quota SET limit_value = 45
     WHERE provider_model_id = (SELECT id FROM provider_model WHERE provider_id = 'anthropic-api')`,
  );
  await db.pool.query(`DELETE FROM claude_api_step`);
  await db.pool.query(
    `INSERT INTO claude_api_step (step, cap_usd) VALUES ('script', 2), ('metadata', 1)`,
  );
  await db.pool.query(`UPDATE claude_api_spend SET created_at = now() - interval '62 days'`);
  await db.pool.query(
    `UPDATE command_confirm SET status = 'EXPIRED' WHERE action = 'CLAUDE_API' AND status = 'PENDING'`,
  );
});

let sequence = 0;

/** A job of `step` that is running on WORKER. */
async function running(step = 'script'): Promise<{ jobId: string; versionId: string }> {
  sequence += 1;
  const { versionId } = await createVideo(
    db.pool,
    await createBatch(db.pool, `api-${sequence}`),
    1,
  );
  const jobId = await createJob(db.pool, versionId, step, { inputHash: `api-${sequence}` });
  await db.pool.query('SELECT job_promote()');
  await db.pool.query(`UPDATE job SET status = 'QUEUED', queued_at = now() WHERE id = $1`, [jobId]);
  await db.pool.query('SELECT * FROM job_start($1, $2, 60)', [jobId, WORKER]);
  return { jobId, versionId };
}

async function block(jobId: string, reason = LIMIT_REASON): Promise<void> {
  await db.pool.query('SELECT job_block($1, $2, $3, 3600)', [jobId, WORKER, reason]);
}

/** A job blocked by the Max usage limit. */
async function blocked(step = 'script') {
  const job = await running(step);
  await block(job.jobId);
  return job;
}

interface Offer {
  token: string;
  job_id: string;
  step: string;
  cap_usd: string;
  month_spent_usd: string;
  month_limit_usd: string;
}

async function offers(): Promise<Offer[]> {
  return (await db.pool.query<Offer>('SELECT * FROM claude_api_offers_due()')).rows;
}

async function offerFor(jobId: string): Promise<Offer | undefined> {
  return (await offers()).find((offer) => offer.job_id === jobId);
}

async function tap(token: string, user = OWNER) {
  return (
    await db.pool.query<{ result: string; action: string; items: Record<string, unknown>[] }>(
      `SELECT * FROM telegram_confirm($1, $2::bigint, 'A')`,
      [token, user],
    )
  ).rows[0]!;
}

async function restart(jobId: string): Promise<void> {
  await db.pool.query('SELECT job_promote()');
  await db.pool.query(`UPDATE job SET status = 'QUEUED', queued_at = now() WHERE id = $1`, [jobId]);
  await db.pool.query('SELECT * FROM job_start($1, $2, 60)', [jobId, WORKER]);
}

interface Begin {
  decision: string;
  spend_id: string | null;
  max_usd: string | null;
  reason: string | null;
}

async function begin(jobId: string): Promise<Begin> {
  return (await db.pool.query<Begin>('SELECT * FROM claude_api_begin($1, $2)', [jobId, WORKER]))
    .rows[0]!;
}

async function record(spendId: string, usd: number): Promise<boolean> {
  return (
    await db.pool.query<{ claude_api_record: boolean }>(
      `SELECT claude_api_record($1, $2, $3, '{"models":["claude-sonnet-5-5"]}'::jsonb)`,
      [spendId, WORKER, usd],
    )
  ).rows[0]!.claude_api_record;
}

/** Blocked, offered, tapped by the owner, and running again: the worker may now begin. */
async function granted(step = 'script') {
  const job = await blocked(step);
  const offer = (await offerFor(job.jobId))!;
  expect((await tap(offer.token)).result).toBe('OK');
  await restart(job.jobId);
  return job;
}

describe('claude_api_offers_due', () => {
  test('offers a usage-limit block once, with the step cap and the month so far', async () => {
    const { jobId } = await blocked();

    const offer = await offerFor(jobId);
    expect(offer).toMatchObject({ step: 'script', cap_usd: '2.00', month_limit_usd: '45.00' });
    expect(offer!.token).toMatch(/^[0-9a-f]{32}$/);
    expect(await offerFor(jobId)).toBeUndefined();
  });

  test('offers nothing for a login failure, a step without a cap, or with the API off', async () => {
    const login = await running();
    await block(login.jobId, 'claude-code login failed (see ops/phase-2a.md §2): not logged in');
    const uncapped = await blocked('episode_code');
    expect(await offerFor(login.jobId)).toBeUndefined();
    expect(await offerFor(uncapped.jobId)).toBeUndefined();

    await db.pool.query(`UPDATE provider SET enabled = false WHERE id = 'anthropic-api'`);
    const off = await blocked();
    expect(await offerFor(off.jobId)).toBeUndefined();
  });

  test('caps the offer at what is left of the month, and offers nothing when too little is left', async () => {
    const first = await granted();
    const spend = await begin(first.jobId);
    await record(spend.spend_id!, 44.5);

    const { jobId } = await blocked();
    expect(await offerFor(jobId)).toBeUndefined();
    await db.pool.query(`UPDATE provider_quota SET limit_value = 46
      WHERE provider_model_id = (SELECT id FROM provider_model WHERE provider_id = 'anthropic-api')`);
    const late = await blocked();
    expect(await offerFor(late.jobId)).toMatchObject({ cap_usd: '1.50', month_spent_usd: '44.50' });
  });
});

describe('the owner tap (telegram_confirm CLAUDE_API)', () => {
  test('grants the job its cap and wakes it now', async () => {
    const { jobId } = await blocked();
    const offer = (await offerFor(jobId))!;

    const reply = await tap(offer.token);

    expect(reply).toMatchObject({ result: 'OK', action: 'CLAUDE_API' });
    expect(reply.items).toEqual([expect.objectContaining({ result: 'OK', cap_usd: 2 })]);
    const job = await db.pool.query<{ due: boolean }>(
      'SELECT next_attempt_at <= now() AS due FROM job WHERE id = $1',
      [jobId],
    );
    expect(job.rows[0]!.due).toBe(true);
  });

  test('only the owner can tap, and only once', async () => {
    const { jobId } = await blocked();
    const offer = (await offerFor(jobId))!;

    expect((await tap(offer.token, APPROVER)).result).toBe('NOT_ALLOWED');
    expect((await tap(offer.token)).result).toBe('OK');
    expect((await tap(offer.token)).result).toBe('ALREADY');
  });

  test('a job that left the block (Max reset first) is stale and gets no grant', async () => {
    const { jobId } = await blocked();
    const offer = (await offerFor(jobId))!;
    await db.pool.query(`UPDATE job SET next_attempt_at = now() WHERE id = $1`, [jobId]);
    await restart(jobId);

    const reply = await tap(offer.token);

    expect(reply.items).toEqual([expect.objectContaining({ result: 'STALE' })]);
    expect((await begin(jobId)).decision).toBe('SUBSCRIPTION');
  });
});

describe('claude_api_begin and claude_api_record', () => {
  test('without a grant the job stays on the subscription', async () => {
    const { jobId } = await running();
    expect(await begin(jobId)).toMatchObject({ decision: 'SUBSCRIPTION', spend_id: null });
  });

  test('a grant reserves the cap; the record writes the cost and frees the rest', async () => {
    const { jobId, versionId } = await granted();

    const first = await begin(jobId);
    expect(first).toMatchObject({ decision: 'ALLOW', max_usd: '2.0000' });
    expect(await record(first.spend_id!, 0.75)).toBe(true);
    expect(await record(first.spend_id!, 0.75)).toBe(false);

    expect(await begin(jobId)).toMatchObject({ decision: 'ALLOW', max_usd: '1.2500' });
    const cost = await db.pool.query(
      `SELECT kind, amount::float8 AS amount, currency, is_derived FROM cost_entry
       WHERE video_version_id = $1`,
      [versionId],
    );
    expect(cost.rows).toEqual([
      { kind: 'ACTUAL', amount: 0.75, currency: 'USD', is_derived: true },
    ]);
  });

  test('a reservation that was never recorded (a crash) counts as fully spent', async () => {
    const { jobId } = await granted();
    await begin(jobId);

    const next = await begin(jobId);

    expect(next).toMatchObject({ decision: 'DENIED', reason: 'BUDGET' });
  });

  test('the job leaving RUNNING ends the grant: a block never resumes on the API by itself', async () => {
    const { jobId } = await granted();
    const spend = await begin(jobId);
    await record(spend.spend_id!, 0.5);
    await block(jobId, 'claude api: Credit balance is too low');

    await db.pool.query(`UPDATE job SET next_attempt_at = now() WHERE id = $1`, [jobId]);
    await restart(jobId);

    expect((await begin(jobId)).decision).toBe('SUBSCRIPTION');
  });

  test('the API switched off after the tap denies and ends the grant', async () => {
    const { jobId } = await granted();
    await db.pool.query(`UPDATE provider SET enabled = false WHERE id = 'anthropic-api'`);

    expect(await begin(jobId)).toMatchObject({ decision: 'DENIED', reason: 'DISABLED' });
    await db.pool.query(`UPDATE provider SET enabled = true WHERE id = 'anthropic-api'`);
    expect((await begin(jobId)).decision).toBe('SUBSCRIPTION');
  });

  test('a job not running for this worker is LOST', async () => {
    const { jobId } = await blocked();
    expect((await begin(jobId)).decision).toBe('LOST');
  });
});
