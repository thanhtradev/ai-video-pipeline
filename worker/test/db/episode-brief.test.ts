import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db.js';
import { versionStatus } from '../helpers/fixtures.js';

// Intake of 16:9 TikTok 2 episodes (D-050, docs/episode-pipeline.md §3): the same video_submit
// entry point as Shorts, told apart by format "episode".

const FULL_BRIEF = [
  'VOICE',
  '[punchy] Nếu bạn dừng được thời gian ba mươi giây… thì cuộc đời bạn sẽ ra sao?',
  '',
  '[1. HOOK]',
  '1.1 MỐC "Nếu bạn dừng được thời gian": ECU hai bàn tay vỗ vào nhau.',
].join('\n');

const OWNER = 111;
const WORKER = 'mac-mini-m4';

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

interface Submitted {
  video_id: string;
  version_id: string;
  job_id: string;
  created: boolean;
}

async function submit(submissionId: string, brief: object): Promise<Submitted> {
  const result = await db.pool.query<Submitted>('SELECT * FROM video_submit($1, $2::jsonb)', [
    submissionId,
    JSON.stringify(brief),
  ]);
  return result.rows[0]!;
}

async function jobInput(jobId: string): Promise<{ brief: Record<string, unknown> }> {
  const result = await db.pool.query<{ input: { brief: Record<string, unknown> } }>(
    'SELECT input FROM job WHERE id = $1',
    [jobId],
  );
  return result.rows[0]!.input;
}

describe('video_submit with an episode brief', () => {
  test('creates a 16:9 video with a script job for the normalized topic brief', async () => {
    const submitted = await submit('ep-topic', {
      format: 'episode',
      topic: '  Nếu bạn dừng được thời gian 30 giây?  ',
      duration_minutes: 6,
      notes: '',
    });

    expect(await versionStatus(db.pool, submitted.version_id)).toBe('SCRIPTING');
    const video = await db.pool.query<{ aspect_ratio: string }>(
      'SELECT aspect_ratio FROM video WHERE id = $1',
      [submitted.video_id],
    );
    expect(video.rows[0]!.aspect_ratio).toBe('16:9');
    expect((await jobInput(submitted.job_id)).brief).toEqual({
      format: 'episode',
      topic: 'Nếu bạn dừng được thời gian 30 giây?',
      duration_minutes: 6,
    });
  });

  test('keeps a full brief verbatim and needs no duration', async () => {
    const submitted = await submit('ep-full', {
      format: 'episode',
      topic: 'EP5 dừng thời gian',
      full_brief: `\n${FULL_BRIEF}\n\n`,
    });

    expect((await jobInput(submitted.job_id)).brief).toEqual({
      format: 'episode',
      topic: 'EP5 dừng thời gian',
      full_brief: FULL_BRIEF,
    });
  });

  test('Shorts briefs still create 9:16 videos', async () => {
    const submitted = await submit('short-1', { topic: 'Vì sao trời xanh?', duration_seconds: 30 });
    const video = await db.pool.query<{ aspect_ratio: string }>(
      'SELECT aspect_ratio FROM video WHERE id = $1',
      [submitted.video_id],
    );
    expect(video.rows[0]!.aspect_ratio).toBe('9:16');
  });

  test.each([
    ['missing topic', { format: 'episode', duration_minutes: 6 }],
    ['too short', { format: 'episode', topic: 'x'.repeat(10), duration_minutes: 1 }],
    ['too long', { format: 'episode', topic: 'x'.repeat(10), duration_minutes: 13 }],
    ['fractional minutes', { format: 'episode', topic: 'x'.repeat(10), duration_minutes: 6.5 }],
    ['text minutes', { format: 'episode', topic: 'x'.repeat(10), duration_minutes: 'sáu' }],
    [
      'huge full brief',
      { format: 'episode', topic: 'x'.repeat(10), full_brief: 'a'.repeat(30_001) },
    ],
    ['long notes', { format: 'episode', topic: 'x'.repeat(10), notes: 'a'.repeat(2001) }],
  ])('rejects an invalid episode brief: %s', async (name, brief) => {
    await expect(submit(`bad-ep-${name}`, brief)).rejects.toThrow(/invalid brief/);
  });
});

/** Runs the script job to success with an episode result (one scene per act), like the worker. */
async function completeEpisodeScript(jobId: string, acts: string[]): Promise<void> {
  await db.pool.query(`UPDATE job SET status = 'QUEUED', queued_at = now() WHERE id = $1`, [jobId]);
  await db.pool.query('SELECT * FROM job_start($1, $2, 60)', [jobId, WORKER]);
  const output = {
    outputs: [{ path: 'script.json', bytes: 100, sha256: 'b'.repeat(64) }],
    result: {
      format: 'episode',
      title: 'Nếu bạn dừng được thời gian 30 giây?',
      act_count: acts.length,
      scenes: acts.map((narration) => ({ narration })),
    },
    fromCheckpoint: false,
  };
  await db.pool.query('SELECT job_succeed($1, $2, $3::jsonb)', [
    jobId,
    WORKER,
    JSON.stringify(output),
  ]);
}

describe('A1 approval of an episode', () => {
  test('creates one TTS request per act, the timeline, the episode code, and no typography preview', async () => {
    const acts = ['[punchy] Nếu bạn dừng được thời gian…', '[explaining] Luật thế này.\nVỗ tay.'];
    const submitted = await submit('ep-approve', { format: 'episode', topic: 'Dừng thời gian' });
    await completeEpisodeScript(submitted.job_id, acts);
    const due = await db.pool.query<{ video_version_id: string; token: string }>(
      'SELECT video_version_id, token FROM script_approvals_due()',
    );
    const { token } = due.rows.find((row) => row.video_version_id === submitted.version_id)!;

    const decided = await db.pool.query<{ result: string }>(
      `SELECT * FROM approval_telegram_decide($1, $2, 'APPROVE')`,
      [token, OWNER],
    );

    expect(decided.rows[0]!.result).toBe('OK');
    expect(await versionStatus(db.pool, submitted.version_id)).toBe('GENERATING_ASSETS');
    const jobs = await db.pool.query<{
      id: string;
      step: string;
      stream: string;
      status: string;
      input: Record<string, unknown>;
    }>(
      `SELECT id, step, stream, status, input FROM job
       WHERE video_version_id = $1 AND step <> 'script' ORDER BY created_at`,
      [submitted.version_id],
    );
    expect(jobs.rows.map((job) => job.step)).toEqual(['tts', 'timing', 'episode_code']);
    const [tts, timing, code] = jobs.rows;
    expect(tts!.input.scenes).toEqual([
      { index: 1, text: acts[0] },
      { index: 2, text: acts[1] },
    ]);
    // The timeline waits for the narration, reads the approved script, and runs on q:heavy.
    expect(timing).toMatchObject({
      stream: 'q:heavy',
      status: 'PENDING',
      input: { script_job_id: submitted.job_id, tts_job_id: tts!.id, language: 'vi' },
    });
    const deps = await db.pool.query<{ depends_on_job_id: string }>(
      'SELECT depends_on_job_id FROM job_dependency WHERE job_id = $1',
      [timing!.id],
    );
    expect(deps.rows.map((row) => row.depends_on_job_id)).toEqual([tts!.id]);
    // The agent writes the episode code once the timeline exists (docs/episode-pipeline.md §6).
    expect(code).toMatchObject({
      stream: 'q:render',
      status: 'PENDING',
      input: { script_job_id: submitted.job_id, timing_job_id: timing!.id },
    });
    const codeDeps = await db.pool.query<{ depends_on_job_id: string }>(
      'SELECT depends_on_job_id FROM job_dependency WHERE job_id = $1',
      [code!.id],
    );
    expect(codeDeps.rows.map((row) => row.depends_on_job_id)).toEqual([timing!.id]);
  });
});
