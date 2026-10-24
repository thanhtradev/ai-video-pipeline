import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db.js';
import { createBatch, createVideo, setVersionStatus } from '../helpers/fixtures.js';

const OWNER = 111;
const STRANGER = 999;

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

async function awaitingScriptApproval(): Promise<{ videoId: string; versionId: string }> {
  const batchId = await createBatch(db.pool);
  const video = await createVideo(db.pool, batchId, 1);
  await setVersionStatus(db.pool, video.versionId, ['SCRIPTING', 'AWAITING_SCRIPT_APPROVAL']);
  return video;
}

async function request(versionId: string, payloadHash = 'h1'): Promise<string> {
  const result = await db.pool.query<{ approval_request: string }>(
    `SELECT approval_request($1, 'SCRIPT', $2)`,
    [versionId, payloadHash],
  );
  return result.rows[0]!.approval_request;
}

async function decide(
  token: string,
  userId: number,
  payloadHash = 'h1',
  decision = 'APPROVED',
): Promise<string> {
  const result = await db.pool.query<{ approval_decide: string }>(
    'SELECT approval_decide($1, $2, $3, $4)',
    [token, userId, decision, payloadHash],
  );
  return result.rows[0]!.approval_decide;
}

describe('approval_decide', () => {
  test('accepts an allowed approver once', async () => {
    const { versionId } = await awaitingScriptApproval();
    const token = await request(versionId);

    expect(await decide(token, OWNER)).toBe('OK');
    expect(await decide(token, OWNER)).toBe('NOT_PENDING');
  });

  test('rejects users not on the allow-list', async () => {
    const { versionId } = await awaitingScriptApproval();
    const token = await request(versionId);

    expect(await decide(token, STRANGER)).toBe('NOT_ALLOWED');
  });

  test('rejects an unknown token', async () => {
    expect(await decide('does-not-exist', OWNER)).toBe('NOT_FOUND');
  });

  test('rejects when content changed after the request', async () => {
    const { versionId } = await awaitingScriptApproval();
    const token = await request(versionId, 'h1');

    expect(await decide(token, OWNER, 'h2')).toBe('HASH_MISMATCH');
  });

  test('rejects an expired approval', async () => {
    const { versionId } = await awaitingScriptApproval();
    const token = await request(versionId);
    await db.pool.query(
      `UPDATE approval SET expires_at = now() - interval '1 second' WHERE token = $1`,
      [token],
    );

    expect(await decide(token, OWNER)).toBe('EXPIRED');
  });

  test('a new video version supersedes approvals of the old one', async () => {
    const { videoId, versionId } = await awaitingScriptApproval();
    const token = await request(versionId);

    const next = await db.pool.query<{ video_new_version: string }>(
      `SELECT video_new_version($1, '{"topic":"revised"}'::jsonb)`,
      [videoId],
    );
    expect(next.rows[0]!.video_new_version).not.toBe(versionId);

    expect(await decide(token, OWNER)).toBe('SUPERSEDED');
    const old = await db.pool.query('SELECT status FROM video_version WHERE id = $1', [versionId]);
    expect(old.rows[0].status).toBe('SUPERSEDED');
  });

  test('approving the script advances the video version', async () => {
    const { versionId } = await awaitingScriptApproval();
    const token = await request(versionId);

    await decide(token, OWNER);

    const row = await db.pool.query('SELECT status FROM video_version WHERE id = $1', [versionId]);
    expect(row.rows[0].status).toBe('GENERATING_ASSETS');
  });
});

describe('approval reminders', () => {
  test('returns pending approvals due for a reminder and marks them reminded', async () => {
    const { versionId } = await awaitingScriptApproval();
    const token = await request(versionId);
    await db.pool.query(
      `UPDATE approval SET requested_at = now() - interval '7 hours' WHERE token = $1`,
      [token],
    );

    const due = await db.pool.query(`SELECT token FROM approval_due_reminders(interval '6 hours')`);
    expect(due.rows.map((row) => row.token)).toContain(token);
    const again = await db.pool.query(
      `SELECT token FROM approval_due_reminders(interval '6 hours')`,
    );
    expect(again.rows.map((row) => row.token)).not.toContain(token);
  });
});
