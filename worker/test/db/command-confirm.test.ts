import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db.js';
import {
  createBatch,
  createJob,
  createVideo,
  jobStatus,
  setVersionStatus,
  versionStatus,
  type VideoFixture,
} from '../helpers/fixtures.js';

// Commands that act on many videos ask for a Confirm button first (D-098): /cancel (owner) and
// /auto all (any approver). The confirmation is bound to the requester, a deadline, and each
// video's version, and every video is handled on its own.

const OWNER = 111;
const APPROVER = 222;
const STRANGER = 999;

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

/** Each test starts with no active video, so `last` and /auto all see only its own. */
beforeEach(async () => {
  await db.pool.query(
    `UPDATE video_version SET status = 'CANCELLED', auto_approve_by = NULL
     WHERE status NOT IN ('COMPLETED', 'SUPERSEDED', 'FAILED', 'CANCELLED')`,
  );
});

interface Item {
  ref?: string;
  video_id: string | null;
  version: number | null;
  title?: string | null;
  status?: string | null;
  result?: string;
  gate?: string | null;
  decided_type?: string | null;
}

interface PromptRow {
  result: string;
  token: string | null;
  expires_at: Date | null;
  items: Item[] | null;
}

interface AutoAllRow extends PromptRow {
  gates: number | null;
  estimates: Record<string, number> | null;
  no_estimate: number | null;
}

interface ConfirmRow {
  result: string;
  action: string | null;
  items: Item[] | null;
}

async function video(name: string): Promise<VideoFixture> {
  return createVideo(db.pool, await createBatch(db.pool, name), 1);
}

async function cancel(refs: string, user = OWNER): Promise<PromptRow> {
  return (await db.pool.query<PromptRow>('SELECT * FROM telegram_cancel($1, $2)', [user, refs]))
    .rows[0]!;
}

async function autoAll(user = APPROVER, enable = true): Promise<AutoAllRow> {
  return (
    await db.pool.query<AutoAllRow>('SELECT * FROM telegram_auto_all($1, $2)', [user, enable])
  ).rows[0]!;
}

async function confirm(token: string, user = OWNER, action = 'A'): Promise<ConfirmRow> {
  return (
    await db.pool.query<ConfirmRow>('SELECT * FROM telegram_confirm($1, $2, $3)', [
      token,
      user,
      action,
    ])
  ).rows[0]!;
}

const short = (id: string) => id.slice(0, 8);

/** Jumps to a status past many steps, without the transition guard. */
async function forceStatus(versionId: string, status: string): Promise<void> {
  await db.pool.query('ALTER TABLE video_version DISABLE TRIGGER USER');
  try {
    await db.pool.query('UPDATE video_version SET status = $2 WHERE id = $1', [versionId, status]);
  } finally {
    await db.pool.query('ALTER TABLE video_version ENABLE TRIGGER USER');
  }
}

async function request(versionId: string, type: string): Promise<string> {
  return (
    await db.pool.query<{ token: string }>(
      `SELECT approval_request($1, $2, 'h1', interval '24 hours') AS token`,
      [versionId, type],
    )
  ).rows[0]!.token;
}

describe('telegram_cancel', () => {
  test.each([
    [APPROVER, 'an approver'],
    [STRANGER, 'a stranger'],
  ])('refuses %i (%s) and asks nothing', async (user) => {
    const { videoId, versionId } = await video('cancel-refuse');
    const before = await versionStatus(db.pool, versionId);

    expect(await cancel(short(videoId), user)).toMatchObject({ result: 'NOT_OWNER', token: null });
    expect(await versionStatus(db.pool, versionId)).toBe(before);
  });

  test('previews each id and changes nothing until confirmed', async () => {
    const a = await video('cancel-a');
    const done = await video('cancel-done');
    await setVersionStatus(db.pool, done.versionId, ['CANCELLED']);
    const before = await versionStatus(db.pool, a.versionId);

    const row = await cancel(`${short(a.videoId)} ffffffff, ${short(done.videoId)} zz`);

    expect(row.result).toBe('OK');
    expect(row.token).toMatch(/^[0-9a-f]{32}$/);
    expect(row.items!.map((item) => [item.ref, item.result])).toEqual([
      [short(a.videoId), 'WOULD_CANCEL'],
      ['ffffffff', 'NOT_FOUND'],
      [short(done.videoId), 'ALREADY_CANCELLED'],
      ['zz', 'NOT_FOUND'],
    ]);
    expect(await versionStatus(db.pool, a.versionId)).toBe(before);
  });

  test('resolves last and lists a video named twice once', async () => {
    const { videoId } = await video('cancel-last');

    const row = await cancel(`last ${short(videoId)}`);

    expect(row.items!.map((item) => [item.video_id, item.result])).toEqual([
      [videoId, 'WOULD_CANCEL'],
    ]);
  });

  test('offers no confirmation when nothing can be cancelled', async () => {
    expect(await cancel('ffffffff')).toMatchObject({ result: 'NOTHING', token: null });
  });

  test('refuses more than 20 ids', async () => {
    const refs = Array.from({ length: 21 }, (_, i) => String(1000 + i)).join(' ');
    expect(await cancel(refs)).toMatchObject({ result: 'TOO_MANY', token: null });
  });
});

describe('telegram_confirm of /cancel', () => {
  test('cancels the videos, their open jobs and approvals, and audits it', async () => {
    const a = await video('confirm-a');
    const b = await video('confirm-b');
    const jobId = await createJob(db.pool, a.versionId, 'script');
    const approval = await request(b.versionId, 'SCRIPT');
    const { token } = await cancel(`${short(a.videoId)} ${short(b.videoId)}`);

    const out = await confirm(token!);

    expect(out.result).toBe('OK');
    expect(out.action).toBe('CANCEL');
    expect(out.items!.map((item) => item.result)).toEqual(['CANCELLED', 'CANCELLED']);
    expect(await versionStatus(db.pool, a.versionId)).toBe('CANCELLED');
    expect(await versionStatus(db.pool, b.versionId)).toBe('CANCELLED');
    expect(await jobStatus(db.pool, jobId)).toBe('CANCELLED');
    const closed = await db.pool.query('SELECT status FROM approval WHERE token = $1', [approval]);
    expect(closed.rows[0]).toEqual({ status: 'SUPERSEDED' });
    const audit = await db.pool.query<{ actor: string }>(
      `SELECT actor FROM audit_log WHERE action = 'video_cancelled' AND object_id = $1`,
      [a.versionId],
    );
    expect(audit.rows[0]!.actor).toBe(`telegram:${OWNER}`);
  });

  test('only the requester can confirm, and the message stays open for them', async () => {
    const { videoId, versionId } = await video('confirm-user');
    const { token } = await cancel(short(videoId));
    const before = await versionStatus(db.pool, versionId);

    expect((await confirm(token!, APPROVER)).result).toBe('NOT_REQUESTER');
    expect((await confirm(token!, STRANGER)).result).toBe('NOT_REQUESTER');
    expect(await versionStatus(db.pool, versionId)).toBe(before);
    expect((await confirm(token!, OWNER)).result).toBe('OK');
  });

  test('works once', async () => {
    const { videoId } = await video('confirm-once');
    const { token } = await cancel(short(videoId));

    expect((await confirm(token!)).result).toBe('OK');
    expect((await confirm(token!)).result).toBe('ALREADY');
  });

  test('Bỏ qua leaves the videos alone and closes the confirmation', async () => {
    const { videoId, versionId } = await video('confirm-reject');
    const { token } = await cancel(short(videoId));
    const before = await versionStatus(db.pool, versionId);

    expect((await confirm(token!, OWNER, 'R')).result).toBe('REJECTED');
    expect(await versionStatus(db.pool, versionId)).toBe(before);
    expect((await confirm(token!)).result).toBe('ALREADY');
  });

  test('refuses after the deadline', async () => {
    const { videoId, versionId } = await video('confirm-late');
    const { token, expires_at: expires } = await cancel(short(videoId));
    expect(expires!.getTime()).toBeLessThanOrEqual(Date.now() + 10 * 60_000 + 1000);
    await db.pool.query(
      `UPDATE command_confirm SET expires_at = now() - interval '1 second' WHERE token = $1`,
      [token],
    );
    const before = await versionStatus(db.pool, versionId);

    expect((await confirm(token!)).result).toBe('EXPIRED');
    expect(await versionStatus(db.pool, versionId)).toBe(before);
    expect((await confirm(token!)).result).toBe('ALREADY');
  });

  test('refuses a requester who is no longer owner', async () => {
    const { videoId, versionId } = await video('confirm-demoted');
    const { token } = await cancel(short(videoId));
    const before = await versionStatus(db.pool, versionId);
    await db.pool.query('UPDATE approver SET is_owner = false WHERE telegram_user_id = $1', [
      OWNER,
    ]);

    try {
      expect((await confirm(token!)).result).toBe('NOT_ALLOWED');
      expect(await versionStatus(db.pool, versionId)).toBe(before);
    } finally {
      await db.pool.query('UPDATE approver SET is_owner = true WHERE telegram_user_id = $1', [
        OWNER,
      ]);
    }
  });

  test('skips a video that got a new version after the preview', async () => {
    const a = await video('confirm-stale');
    const b = await video('confirm-fresh');
    const { token } = await cancel(`${short(a.videoId)} ${short(b.videoId)}`);
    await db.pool.query(
      `UPDATE command_confirm
       SET payload = jsonb_set(payload, '{items,0,version}', '99')
       WHERE token = $1`,
      [token],
    );
    const before = await versionStatus(db.pool, a.versionId);

    const out = await confirm(token!);

    expect(out.items!.map((item) => item.result)).toEqual(['STALE', 'CANCELLED']);
    expect(await versionStatus(db.pool, a.versionId)).toBe(before);
    expect(await versionStatus(db.pool, b.versionId)).toBe('CANCELLED');
  });

  test('one video failing does not stop the others', async () => {
    const bad = await video('confirm-bad');
    const good = await video('confirm-good');
    const { token } = await cancel(`${short(bad.videoId)} ${short(good.videoId)}`);
    const before = await versionStatus(db.pool, bad.versionId);
    await db.pool.query(`
      CREATE FUNCTION test_boom() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'boom'; END; $$`);
    await db.pool.query(`
      CREATE TRIGGER test_boom BEFORE UPDATE ON video_version FOR EACH ROW
      WHEN (OLD.id = '${bad.versionId}') EXECUTE FUNCTION test_boom()`);

    try {
      const out = await confirm(token!);

      expect(out.items!.map((item) => item.result)).toEqual(['ERROR', 'CANCELLED']);
      expect(await versionStatus(db.pool, bad.versionId)).toBe(before);
      expect(await versionStatus(db.pool, good.versionId)).toBe('CANCELLED');
    } finally {
      await db.pool.query('DROP TRIGGER test_boom ON video_version');
      await db.pool.query('DROP FUNCTION test_boom()');
    }
  });

  test('an unknown token is refused', async () => {
    expect((await confirm('f'.repeat(32))).result).toBe('NOT_FOUND');
  });
});

describe('telegram_auto_all', () => {
  test('refuses strangers and offers no confirmation', async () => {
    await video('all-stranger');
    expect(await autoAll(STRANGER)).toMatchObject({ result: 'NOT_APPROVER', token: null });
  });

  test('offers no confirmation when no video is active', async () => {
    expect(await autoAll()).toMatchObject({ result: 'NOTHING', token: null });
  });

  test('any approver gets a preview of active videos; nothing changes yet', async () => {
    const waiting = await video('all-waiting');
    await request(waiting.versionId, 'SCRIPT');
    const running = await video('all-running');
    const on = await video('all-on');
    await db.pool.query('UPDATE video_version SET auto_approve_by = $1 WHERE id = $2', [
      OWNER,
      on.versionId,
    ]);
    const archiving = await video('all-archiving');
    await forceStatus(archiving.versionId, 'ARCHIVING');
    const done = await video('all-done');
    await forceStatus(done.versionId, 'COMPLETED');

    const row = await autoAll(APPROVER);

    expect(row.result).toBe('OK');
    expect(row.token).toMatch(/^[0-9a-f]{32}$/);
    expect(row.items!.map((item) => [item.video_id, item.gate])).toEqual([
      [waiting.videoId, 'SCRIPT'],
      [running.videoId, null],
    ]);
    expect(row.gates).toBe(1);
    const flags = await db.pool.query<{ auto_approve_by: string | null }>(
      'SELECT auto_approve_by FROM video_version WHERE id = ANY($1)',
      [[waiting.versionId, running.versionId]],
    );
    expect(flags.rows.every((flag) => flag.auto_approve_by === null)).toBe(true);
  });

  test('sums the recorded estimates and counts videos without one', async () => {
    const priced = await video('all-priced');
    await video('all-unpriced');
    await db.pool.query(
      `INSERT INTO cost_entry (video_version_id, kind, units, unit_price, amount, currency)
       VALUES ($1, 'ESTIMATE', 10, 0.5, 5, 'CRD')`,
      [priced.versionId],
    );

    const row = await autoAll();

    expect(row.estimates).toEqual({ CRD: 5 });
    expect(row.no_estimate).toBe(1);
  });

  test('confirm turns on /auto in the confirmer name and approves a waiting gate', async () => {
    const waiting = await video('all-confirm');
    await db.pool.query(`SELECT set_config('app.actor', 'test', false)`);
    await request(waiting.versionId, 'CLEANUP');
    const running = await video('all-confirm-2');
    const { token } = await autoAll(APPROVER);

    const out = await confirm(token!, APPROVER);

    expect(out.result).toBe('OK');
    expect(out.action).toBe('AUTO_ALL');
    expect(out.items!.map((item) => item.result)).toEqual(['OK', 'OK']);
    const flags = await db.pool.query<{ auto_approve_by: string }>(
      'SELECT auto_approve_by FROM video_version WHERE id = ANY($1)',
      [[waiting.versionId, running.versionId]],
    );
    expect(flags.rows.map((flag) => Number(flag.auto_approve_by))).toEqual([APPROVER, APPROVER]);
    // The Mac cleanup is never automatic.
    const cleanup = await db.pool.query(
      `SELECT status FROM approval WHERE video_version_id = $1 AND type = 'CLEANUP'`,
      [waiting.versionId],
    );
    expect(cleanup.rows[0]).toEqual({ status: 'PENDING' });
  });

  test('only the requester can confirm', async () => {
    await video('all-other');
    const { token } = await autoAll(APPROVER);

    expect((await confirm(token!, OWNER)).result).toBe('NOT_REQUESTER');
  });

  test('a requester who lost approver rights cannot confirm', async () => {
    const { versionId } = await video('all-revoked');
    const { token } = await autoAll(APPROVER);
    await db.pool.query('UPDATE approver SET active = false WHERE telegram_user_id = $1', [
      APPROVER,
    ]);

    try {
      expect((await confirm(token!, APPROVER)).result).toBe('NOT_ALLOWED');
      const flag = await db.pool.query('SELECT auto_approve_by FROM video_version WHERE id = $1', [
        versionId,
      ]);
      expect(flag.rows[0]).toEqual({ auto_approve_by: null });
    } finally {
      await db.pool.query('UPDATE approver SET active = true WHERE telegram_user_id = $1', [
        APPROVER,
      ]);
    }
  });

  test('videos created after the preview stay manual', async () => {
    await video('all-before');
    const { token } = await autoAll();
    const later = await video('all-later');

    await confirm(token!, APPROVER);

    const flag = await db.pool.query('SELECT auto_approve_by FROM video_version WHERE id = $1', [
      later.versionId,
    ]);
    expect(flag.rows[0]).toEqual({ auto_approve_by: null });
  });

  test('off clears every active video at once, with no confirmation', async () => {
    const a = await video('all-off-a');
    const b = await video('all-off-b');
    await db.pool.query('UPDATE video_version SET auto_approve_by = $1 WHERE id = ANY($2)', [
      OWNER,
      [a.versionId, b.versionId],
    ]);

    const row = await autoAll(APPROVER, false);

    expect(row.result).toBe('OFF');
    expect(row.token).toBeNull();
    expect(row.items).toHaveLength(2);
    const flags = await db.pool.query<{ auto_approve_by: string | null }>(
      'SELECT auto_approve_by FROM video_version WHERE id = ANY($1)',
      [[a.versionId, b.versionId]],
    );
    expect(flags.rows.every((flag) => flag.auto_approve_by === null)).toBe(true);
  });
});
