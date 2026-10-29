import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db.js';
import {
  decide as decideWith,
  jobs as jobsOf,
  STRANGER,
  succeed,
} from '../helpers/episode-flow.js';
import { versionStatus } from '../helpers/fixtures.js';

// A1 notes (D-070): a reply to the script request revises the script into a new version, keeping
// what the notes do not touch. The A1 row also points WF-05 at script.md (job id + media token).

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
  await db.pool.query(`INSERT INTO approver (telegram_user_id, name) VALUES (111, 'owner')`);
});

afterAll(async () => {
  await db.drop();
});

interface ScriptDueRow {
  kind: string;
  version: number;
  video_version_id: string;
  token: string;
  script: { title: string; file: { job_id: string; token: string } | null };
}

const decide = (token: string, action: string, note: string | null = null, user?: number) =>
  decideWith(db.pool, token, action, note, user);
const jobs = (versionId: string) => jobsOf(db.pool, versionId);
const due = async () =>
  (await db.pool.query<ScriptDueRow>('SELECT * FROM script_approvals_due()')).rows;
const mediaToken = (n: number) => String(n).padStart(32, 'f');

let run = 0;
/** Succeeds the version's newest script job and returns its A1 request. */
async function scriptReady(versionId: string, withToken = true) {
  run++;
  const script = (await jobs(versionId)).filter((job) => job.step === 'script').at(-1)!;
  await succeed(db.pool, script.id, {
    outputs: [
      { path: 'script.json', bytes: 1, sha256: String(run).padStart(64, 'a') },
      { path: 'script.md', bytes: 1, sha256: 'b'.repeat(64) },
    ],
    result: {
      format: 'episode',
      title: 'Bíp ơi, tại sao nước sôi?',
      scenes: [{ narration: 'Một.' }],
      ...(withToken ? { media_token: mediaToken(run) } : {}),
    },
  });
  const request = (await due()).find((row) => row.video_version_id === versionId)!;
  return { request, scriptId: script.id };
}

async function episodeAtA1(name: string, withToken = true) {
  const submitted = (
    await db.pool.query<{ video_id: string; version_id: string }>(
      'SELECT * FROM video_submit($1, $2::jsonb)',
      [name, JSON.stringify({ format: 'episode', topic: `Tập ${name}` })],
    )
  ).rows[0]!;
  return { ...submitted, ...(await scriptReady(submitted.version_id, withToken)) };
}

const currentVersionId = async (videoId: string) =>
  (
    await db.pool.query<{ id: string }>(
      `SELECT vv.id FROM video_version vv JOIN video v ON v.id = vv.video_id
       WHERE v.id = $1 AND vv.version = v.current_version`,
      [videoId],
    )
  ).rows[0]!.id;

describe('script_approvals_due', () => {
  test('points at script.md through the script job and its media token', async () => {
    const { request, scriptId } = await episodeAtA1('a1-file');
    expect(request.script.file).toEqual({ job_id: scriptId, token: mediaToken(run) });
  });

  test('has no file for a script written before media tokens', async () => {
    const { request } = await episodeAtA1('a1-no-file', false);
    expect(request.script.file).toBeNull();
  });
});

describe('telegram_decide with notes on A1', () => {
  test('revises the script into a new version with the notes', async () => {
    const { video_id, version_id, request, scriptId } = await episodeAtA1('a1-notes');

    expect(await decide(request.token, 'FEEDBACK', '  Hồi 3 dài quá, cắt bớt.  ')).toMatchObject({
      result: 'OK',
      version: 2,
      round: 1,
    });

    expect(await versionStatus(db.pool, version_id)).toBe('SUPERSEDED');
    const next = await currentVersionId(video_id);
    expect(await versionStatus(db.pool, next)).toBe('SCRIPTING');
    const [revision] = await jobs(next);
    expect(revision).toMatchObject({
      step: 'script',
      status: 'READY',
      input: {
        brief: { format: 'episode', topic: 'Tập a1-notes' },
        revision: {
          previous_job_id: scriptId,
          previous_version: 1,
          feedback: 'Hồi 3 dài quá, cắt bớt.',
          round: 1,
        },
      },
    });
    const note = await db.pool.query<{ status: string; decision_note: string }>(
      'SELECT status, decision_note FROM approval WHERE token = $1',
      [request.token],
    );
    expect(note.rows[0]).toEqual({ status: 'REJECTED', decision_note: 'Hồi 3 dài quá, cắt bớt.' });
    expect((await decide(request.token, 'APPROVE')).result).toBe('NOT_PENDING');
  });

  test('the revised script comes back to A1 as the next round', async () => {
    const { video_id, request } = await episodeAtA1('a1-again');
    await decide(request.token, 'FEEDBACK', 'Ngắn hơn.');
    const next = await currentVersionId(video_id);
    const { request: second, scriptId } = await scriptReady(next);
    expect(second).toMatchObject({ kind: 'REQUEST', version: 2 });

    expect(await decide(second.token, 'FEEDBACK', 'Thêm một câu đùa.')).toMatchObject({
      result: 'OK',
      version: 3,
      round: 2,
    });
    const [revision] = await jobs(await currentVersionId(video_id));
    expect(revision!.input).toMatchObject({
      revision: { previous_job_id: scriptId, previous_version: 2, round: 2 },
    });
  });

  test('a fourth round of notes needs a decision', async () => {
    const { video_id, request } = await episodeAtA1('a1-rounds');
    let token = request.token;
    for (const round of [1, 2, 3]) {
      expect(await decide(token, 'FEEDBACK', `Vòng ${round}`)).toMatchObject({
        result: 'OK',
        round,
      });
      token = (await scriptReady(await currentVersionId(video_id))).request.token;
    }
    const last = await currentVersionId(video_id);

    expect(await decide(token, 'FEEDBACK', 'Vòng 4')).toMatchObject({ result: 'NEEDS_DECISION' });

    expect(await versionStatus(db.pool, last)).toBe('NEEDS_DECISION');
    expect(await currentVersionId(video_id)).toBe(last);
  });

  test('refuses strangers and empty notes, and leaves the request open', async () => {
    const { version_id, request } = await episodeAtA1('a1-refuse');

    expect((await decide(request.token, 'FEEDBACK', 'x', STRANGER)).result).toBe('NOT_ALLOWED');
    expect((await decide(request.token, 'FEEDBACK', '   ')).result).toBe('EMPTY_NOTE');
    expect((await decide('0'.repeat(32), 'FEEDBACK', 'x')).result).toBe('NOT_FOUND');
    expect(await versionStatus(db.pool, version_id)).toBe('AWAITING_SCRIPT_APPROVAL');
    expect((await decide(request.token, 'APPROVE')).result).toBe('OK');
  });

  test('notes on a Shorts script are not supported', async () => {
    const submitted = (
      await db.pool.query<{ version_id: string }>('SELECT * FROM video_submit($1, $2::jsonb)', [
        'a1-shorts',
        JSON.stringify({ topic: 'Mèo', duration_seconds: 30 }),
      ])
    ).rows[0]!;
    const { request } = await scriptReady(submitted.version_id);
    expect((await decide(request.token, 'FEEDBACK', 'x')).result).toBe('NOT_SUPPORTED');
    expect(await versionStatus(db.pool, submitted.version_id)).toBe('AWAITING_SCRIPT_APPROVAL');
  });
});
