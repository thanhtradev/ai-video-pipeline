import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db.js';
import {
  codeOutput,
  decide as decideWith,
  episodeAwaitingStoryboard,
  jobs as jobsOf,
  OWNER,
  STRANGER,
  storyboardDue,
  succeed as succeedWith,
  timingOutput,
  voiceDue,
} from '../helpers/episode-flow.js';
import { setVersionStatus, versionStatus } from '../helpers/fixtures.js';

// /auto <id> (D-093): every remaining gate of the video (A1, A1b, storyboard, A2, A3) is approved in
// the name of the approver who sent the command; QA WARN is approved too, QA FAIL is not, and the
// CLEANUP of the Mac copy is never automatic.

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

type QaLevel = 'PASS' | 'WARN' | 'FAIL';

interface AutoRow {
  result: string;
  video_id: string | null;
  version: number | null;
  status: string | null;
  decided_type: string | null;
}

interface DueRow {
  kind: string;
  video_version_id: string;
  token: string;
  metadata?: Record<string, unknown> | null;
}

const jobs = (versionId: string) => jobsOf(db.pool, versionId);
const succeed = (jobId: string, output: object) => succeedWith(db.pool, jobId, output);
const decide = (token: string, action: string, note: string | null = null, user?: number) =>
  decideWith(db.pool, token, action, note, user);
const jobOf = async (versionId: string, step: string) =>
  (await jobs(versionId)).filter((job) => job.step === step).at(-1)!;
const out = (path: string, digit: string) => ({ path, bytes: 10, sha256: digit.repeat(64) });
const qaOutput = (level: QaLevel, digit: string) => ({
  outputs: [out('qa-report.json', digit)],
  result: {
    level,
    checks: level === 'PASS' ? [] : [{ name: 'silence', level, detail: '0:10' }],
    media_token: digit.repeat(32),
  },
});

async function auto(prefix: string, enable = true, user = OWNER): Promise<AutoRow> {
  const result = await db.pool.query<AutoRow>('SELECT * FROM telegram_auto($1, $2, $3)', [
    user,
    prefix,
    enable,
  ]);
  return result.rows[0]!;
}

async function dueFor(fn: string, versionId: string): Promise<DueRow[]> {
  const rows = (await db.pool.query<DueRow>(`SELECT * FROM ${fn}()`)).rows;
  return rows.filter((row) => row.video_version_id === versionId);
}

async function approval(token: string) {
  const result = await db.pool.query<{ status: string; decided_by: string | null }>(
    'SELECT status, decided_by FROM approval WHERE token = $1',
    [token],
  );
  return result.rows[0]!;
}

async function submitted(name: string) {
  return (
    await db.pool.query<{ video_id: string; version_id: string; job_id: string }>(
      'SELECT * FROM video_submit($1, $2::jsonb)',
      [name, JSON.stringify({ format: 'episode', topic: `Tập ${name}` })],
    )
  ).rows[0]!;
}

/** Renders the preview of the approved storyboard and runs its QA. */
async function previewChecked(versionId: string, level: QaLevel) {
  await succeed((await jobOf(versionId, 'render_episode')).id, {
    outputs: [out('preview.mp4', 'f')],
    result: {},
  });
  await dueFor('preview_approvals_due', versionId);
  await succeed((await jobOf(versionId, 'qa_preview')).id, qaOutput(level, '2'));
  return dueFor('preview_approvals_due', versionId);
}

/** Renders the final, runs its QA and writes the metadata. */
async function finalChecked(versionId: string, level: QaLevel) {
  await succeed((await jobOf(versionId, 'render_final')).id, {
    outputs: [out('final.mp4', '7')],
    result: {},
  });
  await dueFor('final_due', versionId);
  await succeed((await jobOf(versionId, 'qa_final')).id, qaOutput(level, '9'));
  await succeed((await jobOf(versionId, 'metadata')).id, {
    outputs: [out('metadata.json', '4'), out('thumbnail.jpg', '5')],
    result: {
      metadata: { title: 'Mèo', description: 'Mô tả.', tags: ['mèo'], thumbnail_shot: '1.1' },
      media_token: '6'.repeat(32),
    },
  });
  return dueFor('final_due', versionId);
}

describe('telegram_auto', () => {
  test('refuses strangers, unknown ids and finished videos', async () => {
    const { video_id: id, version_id: v } = await submitted('auto-refused');

    expect(await auto(id.slice(0, 8), true, STRANGER)).toMatchObject({ result: 'NOT_APPROVER' });
    expect(await auto('zzzz')).toMatchObject({ result: 'NOT_FOUND' });
    expect(await auto('00000000-0000')).toMatchObject({ result: 'NOT_FOUND' });

    await setVersionStatus(db.pool, v, ['CANCELLED']);
    expect(await auto(id.slice(0, 8))).toMatchObject({
      result: 'NOT_ACTIVE',
      video_id: id,
      status: 'CANCELLED',
    });
  });

  test('on, then off, recorded on the current version with an audit entry', async () => {
    const { video_id: id, version_id: v } = await submitted('auto-toggle');

    expect(await auto(id.slice(0, 8))).toMatchObject({
      result: 'OK',
      video_id: id,
      version: 1,
      decided_type: null,
    });
    const on = await db.pool.query<{ auto_approve_by: string | null }>(
      'SELECT auto_approve_by FROM video_version WHERE id = $1',
      [v],
    );
    expect(on.rows[0]!.auto_approve_by).toBe(String(OWNER));

    expect(await auto(id.slice(0, 8), false)).toMatchObject({ result: 'OFF', video_id: id });
    const off = await db.pool.query<{ auto_approve_by: string | null }>(
      'SELECT auto_approve_by FROM video_version WHERE id = $1',
      [v],
    );
    expect(off.rows[0]!.auto_approve_by).toBeNull();

    const audit = await db.pool.query<{ action: string }>(
      `SELECT action FROM audit_log WHERE object_id = $1 AND action LIKE 'auto_approve_%'
       ORDER BY id`,
      [v],
    );
    expect(audit.rows.map((row) => row.action)).toEqual(['auto_approve_on', 'auto_approve_off']);
  });

  test('approves the gate the video is already waiting at', async () => {
    const {
      video_id: id,
      version_id: v,
      request,
    } = await episodeAwaitingStoryboard(db.pool, 'auto-waiting');

    expect(await auto(id.slice(0, 8))).toMatchObject({
      result: 'OK',
      decided_type: 'STORYBOARD',
      status: 'RENDERING_PREVIEW',
    });
    expect(await approval(request.token)).toMatchObject({
      status: 'APPROVED',
      decided_by: String(OWNER),
    });
  });
});

describe('a video with /auto on', () => {
  test('goes from the script to the archive on its own, WARN included', async () => {
    const { video_id: id, version_id: v, job_id: scriptJob } = await submitted('auto-all');
    expect((await auto(id.slice(0, 8))).result).toBe('OK');

    await succeed(scriptJob, {
      outputs: [{ path: 'script.json', bytes: 1, sha256: 'a'.repeat(64) }],
      result: { format: 'episode', title: 'Mèo nghĩ gì?', scenes: [{ narration: 'Một.' }] },
    });
    const [a1] = await dueFor('script_approvals_due', v);
    expect(a1!.kind).toBe('AUTO');
    expect(await versionStatus(db.pool, v)).toBe('GENERATING_ASSETS');

    const [, tts, timing] = await jobs(v);
    await succeed(tts!.id, { outputs: [], result: { scenes: [] } });
    await succeed(timing!.id, timingOutput());
    const [voice] = (await voiceDue(db.pool)).filter((row) => row.video_version_id === v);
    expect(voice!.kind).toBe('AUTO');

    await succeed((await jobOf(v, 'episode_code')).id, codeOutput());
    const [board] = (await storyboardDue(db.pool)).filter((row) => row.video_version_id === v);
    expect(board!.kind).toBe('AUTO');
    expect(await versionStatus(db.pool, v)).toBe('RENDERING_PREVIEW');

    const [a2] = await previewChecked(v, 'WARN');
    expect(a2!.kind).toBe('AUTO');
    expect(await versionStatus(db.pool, v)).toBe('RENDERING_FINAL');

    const [a3] = await finalChecked(v, 'WARN');
    expect(a3).toMatchObject({ kind: 'AUTO', metadata: { final: { token: '9'.repeat(32) } } });
    expect(await versionStatus(db.pool, v)).toBe('ARCHIVING');

    const decided = await db.pool.query<{ type: string; decided_by: string }>(
      `SELECT type, decided_by FROM approval WHERE video_version_id = $1 ORDER BY requested_at`,
      [v],
    );
    expect(decided.rows).toEqual(
      ['SCRIPT', 'VOICE', 'STORYBOARD', 'PREVIEW', 'METADATA'].map((type) => ({
        type,
        decided_by: String(OWNER),
      })),
    );
    const audit = await db.pool.query<{ detail: { type: string } }>(
      `SELECT detail FROM audit_log WHERE action = 'approval_auto'
       AND detail->>'video_version_id' = $1 ORDER BY id`,
      [v],
    );
    expect(audit.rows.map((row) => row.detail.type)).toEqual([
      'SCRIPT',
      'VOICE',
      'STORYBOARD',
      'PREVIEW',
      'METADATA',
    ]);
  });

  test('a failed QA stops at the normal request', async () => {
    const { video_id: id, version_id: v } = await episodeAwaitingStoryboard(db.pool, 'auto-fail');
    expect((await auto(id.slice(0, 8))).decided_type).toBe('STORYBOARD');

    const [a2] = await previewChecked(v, 'FAIL');
    expect(a2!.kind).toBe('REQUEST');
    expect((await approval(a2!.token)).status).toBe('PENDING');
  });

  test('an approver removed since /auto is not used', async () => {
    const OTHER = 333;
    await db.pool.query(`INSERT INTO approver (telegram_user_id, name) VALUES ($1, 'other')`, [
      OTHER,
    ]);
    const {
      video_id: id,
      version_id: v,
      request,
    } = await episodeAwaitingStoryboard(db.pool, 'auto-revoked');
    await auto(id.slice(0, 8), true, OTHER);
    expect((await approval(request.token)).status).toBe('APPROVED');
    await db.pool.query('UPDATE approver SET active = false WHERE telegram_user_id = $1', [OTHER]);

    const [a2] = await previewChecked(v, 'PASS');
    expect(a2!.kind).toBe('REQUEST');
  });

  test('/auto off brings the buttons back', async () => {
    const {
      video_id: id,
      version_id: v,
      request,
    } = await episodeAwaitingStoryboard(db.pool, 'auto-off');
    await auto(id.slice(0, 8));
    await auto(id.slice(0, 8), false);
    expect((await approval(request.token)).status).toBe('APPROVED');

    const [a2] = await previewChecked(v, 'PASS');
    expect(a2!.kind).toBe('REQUEST');
  });

  test('never approves the cleanup of the Mac copy', async () => {
    const {
      video_id: id,
      version_id: v,
      request,
    } = await episodeAwaitingStoryboard(db.pool, 'auto-cleanup');
    await auto(id.slice(0, 8));
    expect((await approval(request.token)).status).toBe('APPROVED');
    expect((await previewChecked(v, 'PASS'))[0]!.kind).toBe('AUTO');
    expect((await finalChecked(v, 'PASS'))[0]!.kind).toBe('AUTO');
    await succeed((await jobOf(v, 'archive')).id, {
      outputs: [],
      result: {
        target: 'gdrive',
        path: `2026/11/${id}/v1`,
        file_count: 3,
        total_bytes: 30,
        local_bytes: 30,
        manifest_sha256: 'a'.repeat(64),
        verified_at: '2026-11-03T10:00:00Z',
      },
    });
    const [done] = await dueFor('final_due', v);
    expect(done!.kind).toBe('DONE');
    expect((await approval(done!.token)).status).toBe('PENDING');

    // /auto again while the cleanup waits: the video is past the gates it may decide.
    expect(await auto(id.slice(0, 8))).toMatchObject({ result: 'NOT_ACTIVE' });
    expect((await approval(done!.token)).status).toBe('PENDING');
  });

  test('Render final (D-076) still needs a clean QA without /auto', async () => {
    const { version_id: v, request } = await episodeAwaitingStoryboard(db.pool, 'auto-d076');
    await decide(request.token, 'APPROVE_ALL');
    const [a2] = await previewChecked(v, 'WARN');
    expect(a2!.kind).toBe('REQUEST');
  });
});
