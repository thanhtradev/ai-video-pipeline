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
} from '../helpers/episode-flow.js';
import { versionStatus } from '../helpers/fixtures.js';

// "Render final" on the storyboard (D-076): A2 and A3 of that storyboard's code are approved in the
// tapper's name when their QA passed without warnings; otherwise the normal requests stay pending.

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

const jobs = (versionId: string) => jobsOf(db.pool, versionId);
const succeed = (jobId: string, output: object) => succeedWith(db.pool, jobId, output);
const decide = (token: string, action: string, note: string | null = null, user?: number) =>
  decideWith(db.pool, token, action, note, user);
const jobOf = async (versionId: string, step: string) =>
  (await jobs(versionId)).filter((job) => job.step === step).at(-1)!;
const out = (path: string, digit: string) => ({ path, bytes: 10, sha256: digit.repeat(64) });
const qaOutput = (level: 'PASS' | 'WARN', digit: string) => ({
  outputs: [out('qa-report.json', digit)],
  result: {
    level,
    checks: level === 'WARN' ? [{ name: 'silence', level: 'WARN', detail: '0:10' }] : [],
    media_token: '3'.repeat(32),
  },
});

interface DueRow {
  kind: string;
  video_version_id: string;
  token: string;
  media?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

async function previewDue(versionId: string): Promise<DueRow[]> {
  const rows = (await db.pool.query<DueRow>('SELECT * FROM preview_approvals_due()')).rows;
  return rows.filter((row) => row.video_version_id === versionId);
}

async function finalDue(versionId: string): Promise<DueRow[]> {
  const rows = (await db.pool.query<DueRow>('SELECT * FROM final_due()')).rows;
  return rows.filter((row) => row.video_version_id === versionId);
}

async function approval(token: string) {
  const result = await db.pool.query<{ status: string; decided_by: string; approve_all: boolean }>(
    'SELECT status, decided_by, approve_all FROM approval WHERE token = $1',
    [token],
  );
  return result.rows[0]!;
}

/** Renders the preview of the approved storyboard and runs its QA. */
async function previewChecked(versionId: string, level: 'PASS' | 'WARN') {
  await succeed((await jobOf(versionId, 'render_episode')).id, {
    outputs: [out('preview.mp4', 'f')],
    result: {},
  });
  expect(await previewDue(versionId)).toEqual([]);
  await succeed((await jobOf(versionId, 'qa_preview')).id, qaOutput(level, '2'));
  return previewDue(versionId);
}

/** Renders the final, runs its QA and writes the metadata. */
async function finalChecked(versionId: string, level: 'PASS' | 'WARN') {
  await succeed((await jobOf(versionId, 'render_final')).id, {
    outputs: [out('final.mp4', '7')],
    result: {},
  });
  expect(await finalDue(versionId)).toEqual([]);
  await succeed((await jobOf(versionId, 'qa_final')).id, qaOutput(level, '9'));
  await succeed((await jobOf(versionId, 'metadata')).id, {
    outputs: [out('metadata.json', '4'), out('thumbnail.jpg', '5')],
    result: {
      metadata: {
        title: 'Mèo nghĩ gì?',
        description: 'Mô tả.',
        tags: ['mèo'],
        thumbnail_shot: '1.1',
      },
      media_token: '6'.repeat(32),
    },
  });
  return finalDue(versionId);
}

describe('telegram_decide APPROVE_ALL', () => {
  test('approves the storyboard like Duyệt and marks it Render final', async () => {
    const { version_id: v, request } = await episodeAwaitingStoryboard(db.pool, 'all-sb');

    expect(await decide(request.token, 'APPROVE_ALL')).toMatchObject({ result: 'OK', version: 1 });

    expect(await versionStatus(db.pool, v)).toBe('RENDERING_PREVIEW');
    expect((await jobOf(v, 'render_episode')).status).toBe('READY');
    expect(await approval(request.token)).toMatchObject({
      status: 'APPROVED',
      decided_by: String(OWNER),
      approve_all: true,
    });
  });

  test('refuses strangers and every other request type', async () => {
    const { request } = await episodeAwaitingStoryboard(db.pool, 'all-refused');

    expect(await decide(request.token, 'APPROVE_ALL', null, STRANGER)).toMatchObject({
      result: 'NOT_ALLOWED',
      version: null,
    });
    expect((await decide('0'.repeat(32), 'APPROVE_ALL')).result).toBe('NOT_FOUND');
    expect((await decide(request.token, 'APPROVE')).result).toBe('OK');
    expect((await decide(request.token, 'APPROVE_ALL')).result).toBe('NOT_PENDING');

    const [a2] = await previewChecked(request.video_version_id, 'PASS');
    expect(a2!.kind).toBe('REQUEST');
    expect((await decide(a2!.token, 'APPROVE_ALL')).result).toBe('NOT_SUPPORTED');
  });
});

describe('after Render final', () => {
  test('clean QA approves A2 and A3 in the approver name, up to the archive', async () => {
    const { version_id: v, request } = await episodeAwaitingStoryboard(db.pool, 'all-clean');
    await decide(request.token, 'APPROVE_ALL');

    const [a2, ...more] = await previewChecked(v, 'PASS');
    expect(more).toEqual([]);
    expect(a2).toMatchObject({ kind: 'AUTO', media: { level: 'PASS' } });
    expect(await approval(a2!.token)).toMatchObject({
      status: 'APPROVED',
      decided_by: String(OWNER),
    });
    expect(await versionStatus(db.pool, v)).toBe('RENDERING_FINAL');
    expect((await jobOf(v, 'render_final')).status).toBe('READY');
    expect(await previewDue(v)).toEqual([]);

    const [a3] = await finalChecked(v, 'PASS');
    expect(a3).toMatchObject({ kind: 'AUTO', metadata: { title: 'Mèo nghĩ gì?' } });
    expect((await approval(a3!.token)).status).toBe('APPROVED');
    expect(await versionStatus(db.pool, v)).toBe('ARCHIVING');
    expect((await jobOf(v, 'archive')).status).toBe('READY');

    const audit = await db.pool.query<{ detail: { type: string } }>(
      `SELECT detail FROM audit_log WHERE actor = 'approve-all' AND action = 'approval_auto'
       AND detail->>'video_version_id' = $1 ORDER BY id`,
      [v],
    );
    expect(audit.rows.map((row) => row.detail.type)).toEqual(['PREVIEW', 'METADATA']);
  });

  test('a QA warning sends the normal request; the next clean step is still automatic', async () => {
    const { version_id: v, request } = await episodeAwaitingStoryboard(db.pool, 'all-warn');
    await decide(request.token, 'APPROVE_ALL');

    const [a2] = await previewChecked(v, 'WARN');
    expect(a2!.kind).toBe('REQUEST');
    expect((await approval(a2!.token)).status).toBe('PENDING');
    expect(await versionStatus(db.pool, v)).toBe('AWAITING_PREVIEW_APPROVAL');
    expect((await decide(a2!.token, 'APPROVE')).result).toBe('OK');

    const [a3] = await finalChecked(v, 'PASS');
    expect(a3!.kind).toBe('AUTO');
    expect(await versionStatus(db.pool, v)).toBe('ARCHIVING');
  });

  test('a warning on the final QA leaves A3 to the approver', async () => {
    const { version_id: v, request } = await episodeAwaitingStoryboard(db.pool, 'all-warn-final');
    await decide(request.token, 'APPROVE_ALL');
    expect((await previewChecked(v, 'PASS'))[0]!.kind).toBe('AUTO');

    const [a3] = await finalChecked(v, 'WARN');
    expect(a3!.kind).toBe('REQUEST');
    expect(await versionStatus(db.pool, v)).toBe('AWAITING_METADATA_APPROVAL');
  });

  test('notes on a preview start a new storyboard round that needs its own Render final', async () => {
    const { version_id: v, request } = await episodeAwaitingStoryboard(db.pool, 'all-notes');
    await decide(request.token, 'APPROVE_ALL');
    const [a2] = await previewChecked(v, 'WARN');
    expect((await decide(a2!.token, 'FEEDBACK', 'Đoạn cuối nhanh quá.')).result).toBe('OK');

    await succeed((await jobOf(v, 'episode_code')).id, codeOutput());
    const storyboard = (await storyboardDue(db.pool)).find((row) => row.video_version_id === v)!;
    expect((await decide(storyboard.token, 'APPROVE')).result).toBe('OK');

    const [next] = await previewChecked(v, 'PASS');
    expect(next!.kind).toBe('REQUEST');
    expect(await versionStatus(db.pool, v)).toBe('AWAITING_PREVIEW_APPROVAL');
  });

  test('plain Duyệt keeps both requests manual', async () => {
    const { version_id: v, request } = await episodeAwaitingStoryboard(db.pool, 'all-plain');
    await decide(request.token, 'APPROVE');
    const [a2] = await previewChecked(v, 'PASS');
    expect(a2!.kind).toBe('REQUEST');
  });

  test('an approver removed since Render final is not used', async () => {
    const OTHER = 222;
    await db.pool.query(`INSERT INTO approver (telegram_user_id, name) VALUES ($1, 'other')`, [
      OTHER,
    ]);
    const { version_id: v, request } = await episodeAwaitingStoryboard(db.pool, 'all-revoked');
    await decide(request.token, 'APPROVE_ALL', null, OTHER);
    await db.pool.query('UPDATE approver SET active = false WHERE telegram_user_id = $1', [OTHER]);

    const [a2] = await previewChecked(v, 'PASS');
    expect(a2!.kind).toBe('REQUEST');
    expect((await approval(a2!.token)).status).toBe('PENDING');
    expect(await versionStatus(db.pool, v)).toBe('AWAITING_PREVIEW_APPROVAL');
  });
});
