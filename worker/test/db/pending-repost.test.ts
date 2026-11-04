import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db.js';
import { createBatch, createVideo } from '../helpers/fixtures.js';

// /pending on Telegram (D-090) lists the open approval requests and makes the ones with a reminder
// path due now, so WF-05/12/13/14/15 re-post them (same token, same buttons) on their next poll.

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

interface PendingRow {
  allowed: boolean;
  video_id: string | null;
  version: number | null;
  title: string | null;
  type: string | null;
  expires_at: Date | null;
  reminded: boolean | null;
}

async function pending(user: number, prefix = ''): Promise<PendingRow[]> {
  return (await db.pool.query<PendingRow>('SELECT * FROM telegram_pending($1, $2)', [user, prefix]))
    .rows;
}

async function video(): Promise<{ videoId: string; versionId: string }> {
  return createVideo(db.pool, await createBatch(db.pool, 'pending'), 1);
}

async function request(versionId: string, type: string): Promise<string> {
  const result = await db.pool.query<{ token: string }>(
    `SELECT approval_request($1, $2, 'h1', interval '24 hours') AS token`,
    [versionId, type],
  );
  // Just requested: the normal 6 h reminder throttle is not due yet.
  await db.pool.query(`UPDATE approval SET last_reminded_at = now() WHERE token = $1`, [
    result.rows[0]!.token,
  ]);
  return result.rows[0]!.token;
}

async function reminders(fn: string): Promise<string[]> {
  const rows = await db.pool.query<{ kind: string; token: string }>(
    `SELECT kind, token FROM ${fn}()`,
  );
  return rows.rows.filter((r) => r.kind === 'REMINDER').map((r) => r.token);
}

async function clear(): Promise<void> {
  await db.pool.query(`UPDATE approval SET status = 'EXPIRED' WHERE status = 'PENDING'`);
}

describe('telegram_pending', () => {
  test('lists a stopped video with no open request after the requests (D-097)', async () => {
    await clear();
    const open = await video();
    await request(open.versionId, 'SCRIPT');
    const stopped = await video();
    await db.pool.query(`UPDATE video_version SET status = 'NEEDS_DECISION' WHERE id = $1`, [
      stopped.versionId,
    ]);
    const blocked = await video();
    await db.pool.query(`UPDATE video_version SET status = 'BLOCKED_PROVIDER' WHERE id = $1`, [
      blocked.versionId,
    ]);

    const rows = await pending(OWNER);

    expect(rows).toEqual([
      expect.objectContaining({ video_id: open.videoId, type: 'SCRIPT', reminded: true }),
      expect.objectContaining({
        allowed: true,
        video_id: stopped.videoId,
        version: 1,
        type: 'NEEDS_DECISION',
        expires_at: null,
        reminded: false,
      }),
      expect.objectContaining({ video_id: blocked.videoId, type: 'BLOCKED_PROVIDER' }),
    ]);
    expect((await pending(OWNER, stopped.videoId.slice(0, 8))).map((r) => r.type)).toEqual([
      'NEEDS_DECISION',
    ]);
    await db.pool.query(`UPDATE video_version SET status = 'CANCELLED' WHERE id = ANY($1)`, [
      [stopped.versionId, blocked.versionId],
    ]);
  });

  test('a stopped video with an open request is listed once, as the request', async () => {
    await clear();
    const { videoId, versionId } = await video();
    await request(versionId, 'SCRIPT');
    await db.pool.query(`UPDATE video_version SET status = 'NEEDS_DECISION' WHERE id = $1`, [
      versionId,
    ]);

    expect((await pending(OWNER, videoId.slice(0, 8))).map((r) => r.type)).toEqual(['SCRIPT']);
    await db.pool.query(`UPDATE video_version SET status = 'CANCELLED' WHERE id = $1`, [versionId]);
  });

  test('answers strangers with a single refusal row and changes nothing', async () => {
    await clear();
    const { versionId } = await video();
    const token = await request(versionId, 'SCRIPT');

    expect(await pending(STRANGER)).toEqual([
      expect.objectContaining({ allowed: false, video_id: null }),
    ]);
    expect(await reminders('script_approvals_due')).not.toContain(token);
  });

  test('lists open requests and makes them due for a reminder with the same token', async () => {
    await clear();
    const a = await video();
    const b = await video();
    const script = await request(a.versionId, 'SCRIPT');
    const board = await request(b.versionId, 'STORYBOARD');
    const cleanup = await request(b.versionId, 'CLEANUP');

    const rows = await pending(OWNER);

    expect(rows).toEqual([
      expect.objectContaining({
        allowed: true,
        video_id: a.videoId,
        type: 'SCRIPT',
        reminded: true,
      }),
      expect.objectContaining({ video_id: b.videoId, type: 'STORYBOARD', reminded: true }),
      expect.objectContaining({ video_id: b.videoId, type: 'CLEANUP', reminded: false }),
    ]);
    expect(await reminders('script_approvals_due')).toEqual([script]);
    expect(await reminders('storyboard_approvals_due')).toEqual([board]);
    // The next poll is throttled again as usual.
    expect(await reminders('script_approvals_due')).toEqual([]);
    expect(await reminders('storyboard_approvals_due')).toEqual([]);
    const cleanupRow = await db.pool.query(
      `SELECT last_reminded_at > now() - interval '1 minute' AS untouched FROM approval WHERE token = $1`,
      [cleanup],
    );
    expect(cleanupRow.rows[0]).toEqual({ untouched: true });
  });

  test('re-posts voice, preview and metadata requests too', async () => {
    await clear();
    const { versionId } = await video();
    const voice = await request(versionId, 'VOICE');
    const preview = await request(versionId, 'PREVIEW');
    const metadata = await request(versionId, 'METADATA');

    await pending(OWNER);

    expect(await reminders('voice_approvals_due')).toEqual([voice]);
    expect(await reminders('preview_approvals_due')).toEqual([preview]);
    expect(await reminders('final_due')).toEqual([metadata]);
  });

  test('filters by video id prefix', async () => {
    await clear();
    const a = await video();
    const b = await video();
    await request(a.versionId, 'SCRIPT');
    await request(b.versionId, 'SCRIPT');

    const rows = await pending(OWNER, a.videoId.slice(0, 8).toUpperCase());

    expect(rows.map((r) => r.video_id)).toEqual([a.videoId]);
  });

  test('leaves out expired, decided and superseded requests and returns nothing when none are open', async () => {
    await clear();
    const { versionId } = await video();
    const old = await request(versionId, 'SCRIPT');
    await request(versionId, 'SCRIPT'); // supersedes old
    await db.pool.query(`UPDATE approval SET status = 'APPROVED' WHERE status = 'PENDING'`);
    const late = await request(versionId, 'STORYBOARD');
    await db.pool.query(
      `UPDATE approval SET expires_at = now() - interval '1 minute' WHERE token = $1`,
      [late],
    );

    expect(await pending(OWNER)).toEqual([]);
    expect(await reminders('script_approvals_due')).not.toContain(old);
  });

  test('leaves out requests of an older version', async () => {
    await clear();
    const { videoId, versionId } = await video();
    await request(versionId, 'SCRIPT');
    await db.pool.query(`UPDATE video SET current_version = current_version + 1 WHERE id = $1`, [
      videoId,
    ]);

    expect(await pending(OWNER)).toEqual([]);
  });
});
