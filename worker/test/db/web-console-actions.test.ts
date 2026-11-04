import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db.js';
import { createBatch, createVideo, versionStatus } from '../helpers/fixtures.js';
import { episodeAtScriptApproval, type ScriptApproval } from '../helpers/web-console.js';

// Web console actions (D-103). Each calls what the bot calls, with the user from the session.

const GRANTS_SQL = new URL('../../../ops/postgres/grants.sql', import.meta.url);
const OWNER = 111;
const APPROVER = 222;

let db: TestDb;
let ownerSession: string;
let approverSession: string;

async function ensureRole(role: string): Promise<void> {
  await db.pool.query(`
    DO $$ BEGIN
      CREATE ROLE ${role} NOLOGIN;
    EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL;
    END $$;`);
}

async function signIn(user: number): Promise<string> {
  const login = await db.pool.query<{ token: string }>(
    'SELECT token FROM telegram_web_login($1, true)',
    [user],
  );
  const session = await db.pool.query<{ session: string }>(
    'SELECT session FROM web_login_consume($1)',
    [login.rows[0]!.token],
  );
  return session.rows[0]!.session;
}

async function callWeb<T>(fn: string, ...args: unknown[]): Promise<T> {
  const client = await db.pool.connect();
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

beforeAll(async () => {
  db = await createTestDb();
  for (const role of ['aivideo_n8n', 'aivideo_worker', 'aivideo_web']) await ensureRole(role);
  await db.pool.query(await readFile(GRANTS_SQL, 'utf8'));
  await db.pool.query(
    `INSERT INTO approver (telegram_user_id, name, is_owner)
     VALUES ($1, 'owner', true), ($2, 'approver', false)`,
    [OWNER, APPROVER],
  );
  ownerSession = await signIn(OWNER);
  approverSession = await signIn(APPROVER);
});

afterAll(async () => {
  await db.drop();
});

async function video(): Promise<{ videoId: string; versionId: string }> {
  return createVideo(db.pool, await createBatch(db.pool, 'web-actions'), 1);
}

let submission = 0;
function scriptRequest(): Promise<ScriptApproval> {
  submission += 1;
  return episodeAtScriptApproval(db.pool, `web-actions-${submission}`, 'Nếu Trái Đất ngừng quay');
}

const BAD_SESSION = '0'.repeat(64);
const NO_ID = '00000000-0000-4000-8000-000000000000';

test.each([
  ['web_decide', BAD_SESSION, NO_ID, 'APPROVE', null],
  ['web_retry', BAD_SESSION, NO_ID],
  ['web_auto', BAD_SESSION, NO_ID, true],
  ['web_cancel', BAD_SESSION, NO_ID],
  ['web_cancel_confirm', BAD_SESSION, 'x', true],
  ['web_video_media', BAD_SESSION, NO_ID],
])('%s refuses a bad session', async (fn, ...args) => {
  await expect(callWeb(fn, ...args)).rejects.toMatchObject({ code: 'WB401' });
});

describe('web_decide', () => {
  test('reaches the same result and state as the Telegram button', async () => {
    const onTelegram = await scriptRequest();
    const onWeb = await scriptRequest();

    const bot = await db.pool.query<{ result: string }>(
      `SELECT result FROM telegram_decide($1, $2, 'REJECT')`,
      [onTelegram.token, APPROVER],
    );
    const web = await callWeb<{ result: string }>(
      'web_decide',
      approverSession,
      onWeb.approvalId,
      'REJECT',
      null,
    );

    expect(web.result).toBe(bot.rows[0]!.result);
    expect(await versionStatus(db.pool, onWeb.versionId)).toBe(
      await versionStatus(db.pool, onTelegram.versionId),
    );
  });

  test('approving gives the same result as the Telegram button', async () => {
    const onTelegram = await scriptRequest();
    const onWeb = await scriptRequest();

    const bot = await db.pool.query<{ result: string }>(
      `SELECT result FROM telegram_decide($1, $2, 'APPROVE')`,
      [onTelegram.token, APPROVER],
    );
    const web = await callWeb<{ result: string }>(
      'web_decide',
      approverSession,
      onWeb.approvalId,
      'APPROVE',
      null,
    );

    expect(web.result).toBe(bot.rows[0]!.result);
    expect(await versionStatus(db.pool, onWeb.versionId)).toBe(
      await versionStatus(db.pool, onTelegram.versionId),
    );
    expect(web.result).toBe('OK');
  });

  test('settles the request once, so the Telegram button then says it was decided', async () => {
    const { approvalId, token } = await scriptRequest();

    const first = await callWeb<{ result: string }>(
      'web_decide',
      approverSession,
      approvalId,
      'REJECT',
      null,
    );
    const button = await db.pool.query<{ result: string }>(
      `SELECT result FROM telegram_decide($1, $2, 'APPROVE')`,
      [token, OWNER],
    );

    expect(first.result).toBe('OK');
    expect(button.rows[0]!.result).toBe('NOT_PENDING');
  });

  test('records the person and that it came from the web', async () => {
    const { approvalId } = await scriptRequest();

    await callWeb('web_decide', approverSession, approvalId, 'REJECT', null);

    const audit = await db.pool.query<{ actor: string; detail: Record<string, unknown> }>(
      `SELECT actor, detail FROM audit_log WHERE action = 'web_decide' AND object_id = $1`,
      [approvalId],
    );
    expect(audit.rows[0]).toMatchObject({
      actor: `telegram:${APPROVER}`,
      detail: { source: 'web', decision: 'REJECT', result: 'OK', type: 'SCRIPT' },
    });
  });

  test('refuses an approval of an older version', async () => {
    const { approvalId, videoId } = await scriptRequest();
    await db.pool.query(`SELECT video_new_version($1, '{"topic":"newer"}'::jsonb)`, [videoId]);

    const result = await callWeb<{ result: string }>(
      'web_decide',
      approverSession,
      approvalId,
      'APPROVE',
      null,
    );

    expect(result.result).toBe('NOT_FOUND');
  });

  test('leaves the Mac cleanup to Telegram, even for the owner', async () => {
    const { versionId } = await video();
    const { rows } = await db.pool.query<{ token: string }>(
      `SELECT approval_request($1, 'CLEANUP', 'h1', interval '24 hours') AS token`,
      [versionId],
    );
    const approval = await db.pool.query<{ id: string; status: string }>(
      `SELECT id, status FROM approval WHERE token = $1`,
      [rows[0]!.token],
    );

    const result = await callWeb<{ result: string }>(
      'web_decide',
      ownerSession,
      approval.rows[0]!.id,
      'APPROVE',
      null,
    );

    expect(result.result).toBe('USE_TELEGRAM');
    const after = await db.pool.query<{ status: string }>(
      `SELECT status FROM approval WHERE token = $1`,
      [rows[0]!.token],
    );
    expect(after.rows[0]!.status).toBe('PENDING');
  });

  test('is not found for an unknown approval', async () => {
    const result = await callWeb<{ result: string }>(
      'web_decide',
      approverSession,
      NO_ID,
      'APPROVE',
      null,
    );

    expect(result.result).toBe('NOT_FOUND');
  });
});

describe('web_retry', () => {
  test('answers as /retry does for a video that is not stopped', async () => {
    const { videoId } = await video();

    const result = await callWeb<{ result: string }>('web_retry', approverSession, videoId);

    expect(result.result).toBe('NOT_STOPPED');
  });
});

describe('web_auto', () => {
  test('turns automatic approval on and off, in the name of the session user', async () => {
    const { videoId, versionId } = await video();
    const by = async (): Promise<string | null> =>
      (
        await db.pool.query<{ auto_approve_by: string | null }>(
          `SELECT auto_approve_by FROM video_version WHERE id = $1`,
          [versionId],
        )
      ).rows[0]!.auto_approve_by;

    const on = await callWeb<{ result: string }>('web_auto', approverSession, videoId, true);
    const whileOn = await by();
    const off = await callWeb<{ result: string }>('web_auto', approverSession, videoId, false);

    expect(on.result).toBe('OK');
    expect(whileOn).toBe(String(APPROVER));
    expect(off.result).toBe('OFF');
    expect(await by()).toBeNull();
  });
});

describe('web_cancel', () => {
  test('an approver cannot cancel', async () => {
    const { videoId, versionId } = await video();

    const result = await callWeb<{ result: string; token: string | null }>(
      'web_cancel',
      approverSession,
      videoId,
    );

    expect(result).toMatchObject({ result: 'NOT_OWNER', token: null });
    expect(await versionStatus(db.pool, versionId)).toBe('BRIEF_SUBMITTED');
  });

  test('the owner gets a preview, and nothing changes until they confirm', async () => {
    const { videoId, versionId } = await video();

    const preview = await callWeb<{ result: string; token: string; items: { video_id: string }[] }>(
      'web_cancel',
      ownerSession,
      videoId,
    );
    expect(preview.token).toMatch(/^[0-9a-f]{32}$/);
    expect(preview.items.map((item) => item.video_id)).toContain(videoId);
    expect(await versionStatus(db.pool, versionId)).toBe('BRIEF_SUBMITTED');

    const confirmed = await callWeb<{ result: string }>(
      'web_cancel_confirm',
      ownerSession,
      preview.token,
      true,
    );

    expect(confirmed.result).toBe('OK');
    expect(await versionStatus(db.pool, versionId)).toBe('CANCELLED');
  });

  test('declining leaves the video alone', async () => {
    const { videoId, versionId } = await video();
    const preview = await callWeb<{ token: string }>('web_cancel', ownerSession, videoId);

    const declined = await callWeb<{ result: string }>(
      'web_cancel_confirm',
      ownerSession,
      preview.token,
      false,
    );

    expect(declined.result).toBe('REJECTED');
    expect(await versionStatus(db.pool, versionId)).toBe('BRIEF_SUBMITTED');
  });

  test('a confirmation is only for the one who asked', async () => {
    const { videoId, versionId } = await video();
    const preview = await callWeb<{ token: string }>('web_cancel', ownerSession, videoId);

    const stranger = await callWeb<{ result: string }>(
      'web_cancel_confirm',
      approverSession,
      preview.token,
      true,
    );

    expect(stranger.result).toBe('NOT_REQUESTER');
    expect(await versionStatus(db.pool, versionId)).toBe('BRIEF_SUBMITTED');
  });

  test('cannot confirm /deploy or /auto all, which stay on Telegram', async () => {
    const { rows } = await db.pool.query<{ token: string }>(
      `INSERT INTO command_confirm (token, action, requested_by, expires_at, payload)
       VALUES (replace(gen_random_uuid()::text, '-', ''), 'AUTO_ALL', $1,
               now() + interval '10 minutes', '[]'::jsonb)
       RETURNING token`,
      [OWNER],
    );

    const result = await callWeb<{ result: string }>(
      'web_cancel_confirm',
      ownerSession,
      rows[0]!.token,
      true,
    );

    expect(result.result).toBe('NOT_FOUND');
  });
});

interface Media {
  language: string;
  files: { file: string; revision: string }[];
  review: {
    qa_level: string | null;
    metadata: { title: string } | null;
    voice: { take: number; max_takes: number; retake_cost: unknown } | null;
  };
}

interface MediaFile {
  file: string;
  kind: string;
  job_id: string;
  token: string;
  version: number;
  base_url: string | null;
}

describe('web_video_media and web_video_media_file', () => {
  async function videoWithScript(): Promise<{ videoId: string; jobId: string }> {
    await db.pool.query(
      `INSERT INTO worker (id, capabilities, last_seen_at, api_url)
       VALUES ('media-worker', '{q:light}', now(), 'http://100.64.0.1:8787')
       ON CONFLICT (id) DO NOTHING`,
    );
    const approval = await scriptRequest();
    await db.pool.query(`UPDATE video SET worker_id = 'media-worker' WHERE id = $1`, [
      approval.videoId,
    ]);
    return { videoId: approval.videoId, jobId: approval.jobId };
  }

  test('are null for an unknown video', async () => {
    expect(await callWeb('web_video_media', approverSession, NO_ID)).toBeNull();
    expect(await callWeb('web_video_media_file', approverSession, NO_ID, 'script.md')).toBeNull();
  });

  test('have nothing to show before any step has finished', async () => {
    const { videoId } = await video();

    const media = await callWeb<Media>('web_video_media', approverSession, videoId);

    expect(media.files).toEqual([]);
    expect(media.language).toBe('vi');
  });

  test('the list names a file and the job that made it, with no token or address', async () => {
    const { videoId, jobId } = await videoWithScript();

    const media = await callWeb<Media>('web_video_media', approverSession, videoId);

    expect(media.files).toEqual([{ file: 'script.md', revision: jobId }]);
    expect(JSON.stringify(media)).not.toContain('a'.repeat(32));
    expect(JSON.stringify(media)).not.toContain('100.64.0.1');
  });

  test('a file lookup gives the service what it needs to fetch it', async () => {
    const { videoId, jobId } = await videoWithScript();

    const file = await callWeb<MediaFile>(
      'web_video_media_file',
      approverSession,
      videoId,
      'script.md',
    );

    expect(file).toMatchObject({
      file: 'script.md',
      kind: 'media',
      job_id: jobId,
      token: 'a'.repeat(32),
      version: 1,
      base_url: 'http://100.64.0.1:8787',
    });
  });

  test('a file the version does not list is null', async () => {
    const { videoId } = await videoWithScript();

    expect(await callWeb('web_video_media_file', approverSession, videoId, 'final.mp4')).toBeNull();
  });

  test('the role cannot read every token at once', async () => {
    await expect(callWeb('web_media_entries', NO_ID)).rejects.toMatchObject({ code: '42501' });
  });
});

describe('the cancellation audit', () => {
  test('ties the preview and the confirmation together without a usable token', async () => {
    const { videoId } = await video();
    const preview = await callWeb<{ token: string }>('web_cancel', ownerSession, videoId);
    await callWeb('web_cancel_confirm', ownerSession, preview.token, false);

    const asked = await db.pool.query<{ detail: { confirm: string; source: string } }>(
      `SELECT detail FROM audit_log WHERE action = 'web_cancel_preview' AND object_id = $1`,
      [videoId],
    );
    const hash = asked.rows[0]!.detail.confirm;
    const answered = await db.pool.query<{ object_id: string; detail: { result: string } }>(
      `SELECT object_id, detail FROM audit_log WHERE action = 'web_cancel' AND object_id = $1`,
      [hash],
    );

    expect(asked.rows[0]!.detail.source).toBe('web');
    expect(hash).not.toBe(preview.token);
    expect(answered.rows[0]!.detail.result).toBe('REJECTED');
  });
});

describe('a cancellation that came too late', () => {
  test('reports the item, because the confirmation itself still succeeds', async () => {
    const { videoId } = await video();
    const preview = await callWeb<{ token: string }>('web_cancel', ownerSession, videoId);
    await db.pool.query(`SELECT video_new_version($1, '{"topic":"newer"}'::jsonb)`, [videoId]);

    const outcome = await callWeb<{ result: string; items: { result: string }[] }>(
      'web_cancel_confirm',
      ownerSession,
      preview.token,
      true,
    );

    expect(outcome.result).toBe('OK');
    expect(outcome.items[0]!.result).toBe('STALE');
  });
});
