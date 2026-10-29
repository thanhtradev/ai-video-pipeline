import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db.js';
import {
  decide as decideWith,
  jobs as jobsOf,
  STRANGER,
  succeed,
  timingOutput,
  voiceDue,
} from '../helpers/episode-flow.js';
import { setVersionStatus, versionStatus } from '../helpers/fixtures.js';

// VOICE approval (A1b, D-071): after the timeline the owner hears the whole narration before the
// agent writes the episode. Duyệt creates episode_code, Từ chối cancels, Đọc lại pays for one more
// TTS take (its estimate raises the version's budget) and builds a new timeline from it.

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
  await db.pool.query(`INSERT INTO approver (telegram_user_id, name) VALUES (111, 'owner')`);
  await db.pool.query(`UPDATE provider SET enabled = true WHERE id = 'itera'`);
  await db.pool.query(`UPDATE provider_model SET enabled = true WHERE provider_id = 'itera'`);
  await db.pool.query('DELETE FROM provider_price');
  await db.pool.query(
    `INSERT INTO provider_price (provider_model_id, unit, unit_price, currency, valid_from, source_note)
     VALUES (tts_provider_model(), 'per_char', 1, 'CRD', now() - interval '1 day', 'test')`,
  );
});

afterAll(async () => {
  await db.drop();
});

const decide = (token: string, action: string, note: string | null = null, user?: number) =>
  decideWith(db.pool, token, action, note, user);
const jobs = (versionId: string) => jobsOf(db.pool, versionId);
const due = () => voiceDue(db.pool);
const steps = async (versionId: string) => (await jobs(versionId)).map((job) => job.step);
const estimates = async (versionId: string) =>
  (
    await db.pool.query<{ n: number; amount: number }>(
      `SELECT count(*)::int AS n, sum(amount)::float AS amount FROM cost_entry
       WHERE video_version_id = $1 AND kind = 'ESTIMATE'`,
      [versionId],
    )
  ).rows[0]!;

/** A new episode through A1 approval (narration "Một hai." = 8 characters, estimate 9 CRD). */
async function episodeApproved(name: string) {
  const submitted = (
    await db.pool.query<{ video_id: string; version_id: string; job_id: string }>(
      'SELECT * FROM video_submit($1, $2::jsonb)',
      [name, JSON.stringify({ format: 'episode', topic: `Tập ${name}` })],
    )
  ).rows[0]!;
  await succeed(db.pool, submitted.job_id, {
    outputs: [{ path: 'script.json', bytes: 1, sha256: 'a'.repeat(64) }],
    result: { format: 'episode', title: 'Bíp ơi?', scenes: [{ narration: 'Một hai.' }] },
  });
  const a1 = (
    await db.pool.query<{ token: string; video_version_id: string }>(
      'SELECT token, video_version_id FROM script_approvals_due()',
    )
  ).rows.find((row) => row.video_version_id === submitted.version_id)!;
  expect((await decide(a1.token, 'APPROVE')).result).toBe('OK');
  return submitted;
}

/** Succeeds the version's newest tts and timing jobs and returns the voice request. */
async function voiceReady(versionId: string) {
  const all = await jobs(versionId);
  const tts = all.filter((job) => job.step === 'tts').at(-1)!;
  const timing = all.filter((job) => job.step === 'timing').at(-1)!;
  await succeed(db.pool, tts.id, { outputs: [], result: { scenes: [] } });
  const output = timingOutput();
  await succeed(db.pool, timing.id, output);
  const request = (await due()).find((row) => row.video_version_id === versionId)!;
  return { request, timingId: timing.id, ttsId: tts.id, mediaToken: output.result.media_token };
}

async function episodeAtVoice(name: string) {
  const submitted = await episodeApproved(name);
  return { ...submitted, ...(await voiceReady(submitted.version_id)) };
}

describe('A1 approval of an episode', () => {
  test('creates the narration and the timeline, and waits for the voice before the code', async () => {
    const { version_id } = await episodeApproved('a1b-a1');
    expect(await steps(version_id)).toEqual(['script', 'tts', 'timing']);
    expect(await versionStatus(db.pool, version_id)).toBe('GENERATING_ASSETS');
  });
});

describe('voice_approvals_due', () => {
  test('requests the voice once its timeline succeeded, with the file and the retake cost', async () => {
    const { video_id, version_id, request, timingId, mediaToken } = await episodeAtVoice('a1b-due');

    expect(request).toMatchObject({
      kind: 'REQUEST',
      video_id,
      version: 1,
      take: 1,
      title: 'Bíp ơi?',
      voice: {
        file: { job_id: timingId, token: mediaToken },
        seconds: 125.4,
        max_takes: 3,
        retake_cost: { amount: 9, currency: 'CRD' },
      },
    });
    expect(request.token).toMatch(/^[0-9a-f]{32}$/);
    expect(await versionStatus(db.pool, version_id)).toBe('AWAITING_VOICE_APPROVAL');
    expect((await due()).some((row) => row.video_version_id === version_id)).toBe(false);
  });

  test('waits while the timeline runs', async () => {
    const { version_id } = await episodeApproved('a1b-wait');
    const tts = (await jobs(version_id)).find((job) => job.step === 'tts')!;
    await succeed(db.pool, tts.id, { outputs: [], result: { scenes: [] } });
    expect((await due()).some((row) => row.video_version_id === version_id)).toBe(false);
  });

  test('skips versions approved before A1b (their episode code already exists)', async () => {
    const { version_id } = await episodeApproved('a1b-old');
    await db.pool.query('SELECT episode_code_job_create($1)', [version_id]);
    await voiceReady(version_id);
    expect(await versionStatus(db.pool, version_id)).toBe('GENERATING_ASSETS');
  });

  test('reminds pending requests without the file', async () => {
    const { request } = await episodeAtVoice('a1b-remind');
    await db.pool.query(
      `UPDATE approval SET requested_at = now() - interval '7 hours' WHERE token = $1`,
      [request.token],
    );
    const reminder = (await due()).find((row) => row.token === request.token)!;
    expect(reminder).toMatchObject({ kind: 'REMINDER', take: 1, voice: { file: null } });
  });
});

describe('telegram_decide on a voice request', () => {
  test('Duyệt hands the timeline to the episode code', async () => {
    const { version_id, request, timingId } = await episodeAtVoice('a1b-approve');

    expect(await decide(request.token, 'APPROVE')).toMatchObject({
      result: 'OK',
      version: 1,
      round: 1,
    });

    expect(await versionStatus(db.pool, version_id)).toBe('GENERATING_ASSETS');
    const code = (await jobs(version_id)).find((job) => job.step === 'episode_code')!;
    expect(code.input).toMatchObject({ timing_job_id: timingId });
    expect((await decide(request.token, 'APPROVE')).result).toBe('NOT_PENDING');
  });

  test('Từ chối cancels the video', async () => {
    const { version_id, request } = await episodeAtVoice('a1b-reject');
    expect((await decide(request.token, 'REJECT')).result).toBe('OK');
    expect(await versionStatus(db.pool, version_id)).toBe('CANCELLED');
    expect(await steps(version_id)).not.toContain('episode_code');
  });

  test('Đọc lại records one more estimate and reads the same texts again as a new take', async () => {
    const { version_id, request, ttsId } = await episodeAtVoice('a1b-retake');
    expect(await estimates(version_id)).toEqual({ n: 1, amount: 9 });

    expect(await decide(request.token, 'REGENERATE')).toMatchObject({ result: 'OK', round: 2 });

    expect(await versionStatus(db.pool, version_id)).toBe('GENERATING_ASSETS');
    expect(await estimates(version_id)).toEqual({ n: 2, amount: 18 });
    const all = await jobs(version_id);
    const [first, second] = all.filter((job) => job.step === 'tts');
    expect(second!.id).not.toBe(ttsId);
    expect(second!.input).toEqual({ ...first!.input, take: 2 });
    const timing = all.filter((job) => job.step === 'timing').at(-1)!;
    expect(timing.input).toMatchObject({ tts_job_id: second!.id });
    expect(all.map((job) => job.step)).not.toContain('episode_code');

    const { request: again } = await voiceReady(version_id);
    expect(again).toMatchObject({ kind: 'REQUEST', take: 2 });
    expect((await decide(again.token, 'APPROVE')).result).toBe('OK');
    const code = (await jobs(version_id)).find((job) => job.step === 'episode_code')!;
    expect(code.input).toMatchObject({ timing_job_id: timing.id });
  });

  test('a fourth take needs a decision', async () => {
    const { version_id, request } = await episodeAtVoice('a1b-takes');
    let token = request.token;
    for (const take of [2, 3]) {
      expect(await decide(token, 'REGENERATE')).toMatchObject({ result: 'OK', round: take });
      token = (await voiceReady(version_id)).request.token;
    }

    expect((await decide(token, 'REGENERATE')).result).toBe('NEEDS_DECISION');
    expect(await versionStatus(db.pool, version_id)).toBe('NEEDS_DECISION');
    expect((await jobs(version_id)).filter((job) => job.step === 'tts')).toHaveLength(3);
    expect(await estimates(version_id)).toMatchObject({ n: 3 });
  });

  test('the last take offers no retake cost', async () => {
    const { version_id, request } = await episodeAtVoice('a1b-last');
    await decide(request.token, 'REGENERATE');
    const { request: second } = await voiceReady(version_id);
    await decide(second.token, 'REGENERATE');
    const { request: third } = await voiceReady(version_id);
    expect(third).toMatchObject({ take: 3, voice: { retake_cost: null } });
  });

  test('refuses strangers, notes and a changed timeline, and leaves the request open', async () => {
    const { version_id, request, timingId } = await episodeAtVoice('a1b-refuse');

    expect((await decide(request.token, 'APPROVE', null, STRANGER)).result).toBe('NOT_ALLOWED');
    expect((await decide(request.token, 'FEEDBACK', 'chậm lại')).result).toBe('NOT_SUPPORTED');
    await db.pool.query(
      `UPDATE job SET output = jsonb_set(output, '{outputs,0,sha256}', to_jsonb($2::text))
       WHERE id = $1`,
      [timingId, 'f'.repeat(64)],
    );
    expect((await decide(request.token, 'APPROVE')).result).toBe('HASH_MISMATCH');
    expect(await versionStatus(db.pool, version_id)).toBe('AWAITING_VOICE_APPROVAL');
  });

  test('a version that left the voice step cannot be approved from an old message', async () => {
    const { version_id, request } = await episodeAtVoice('a1b-stale');
    await setVersionStatus(db.pool, version_id, ['CANCELLED']);
    expect((await decide(request.token, 'APPROVE')).result).toBe('SUPERSEDED');
  });
});
