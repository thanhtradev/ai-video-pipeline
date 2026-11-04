import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db.js';
import { createBatch, createVideo } from '../helpers/fixtures.js';

// `last` as a video id and the /help gate (D-097).

const APPROVER = 111;
const REVOKED = 222;
const STRANGER = 999;

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
  await db.pool.query(
    `INSERT INTO approver (telegram_user_id, name, active) VALUES ($1, 'a', true), ($2, 'r', false)`,
    [APPROVER, REVOKED],
  );
});

afterAll(async () => {
  await db.drop();
});

async function videoRef(ref: string): Promise<string> {
  const result = await db.pool.query<{ ref: string }>('SELECT video_ref($1) AS ref', [ref]);
  return result.rows[0]!.ref;
}

async function setStatus(versionId: string, status: string): Promise<void> {
  await db.pool.query('UPDATE video_version SET status = $2 WHERE id = $1', [versionId, status]);
}

describe('video_ref', () => {
  test('passes anything but last through unchanged', async () => {
    expect(await videoRef('679cd22f')).toBe('679cd22f');
    expect(await videoRef('')).toBe('');
  });

  test('stays last when no video is active, so the caller answers NOT_FOUND', async () => {
    expect(await videoRef('last')).toBe('last');
  });

  test('resolves last to the newest video that has not finished', async () => {
    const batch = await createBatch(db.pool, 'video-ref');
    const older = await createVideo(db.pool, batch, 1);
    const newer = await createVideo(db.pool, batch, 2);
    expect(await videoRef('last')).toBe(newer.videoId);

    await setStatus(newer.versionId, 'CANCELLED');
    expect(await videoRef('last')).toBe(older.videoId);

    await setStatus(older.versionId, 'CANCELLED');
    expect(await videoRef('last')).toBe('last');
  });

  test('a resolved id works with the commands', async () => {
    const { videoId } = await createVideo(db.pool, await createBatch(db.pool, 'video-ref-2'), 1);
    const rows = await db.pool.query<{ video_id: string }>(
      'SELECT * FROM telegram_status($1, video_ref($2))',
      [APPROVER, 'last'],
    );
    expect(rows.rows[0]!.video_id).toBe(videoId);
  });
});

describe('telegram_can_help', () => {
  test.each([
    [APPROVER, true],
    [REVOKED, false],
    [STRANGER, false],
  ])('user %i: %s', async (user, allowed) => {
    const result = await db.pool.query<{ allowed: boolean }>(
      'SELECT telegram_can_help($1) AS allowed',
      [user],
    );
    expect(result.rows[0]!.allowed).toBe(allowed);
  });
});
