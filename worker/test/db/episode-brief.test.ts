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

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
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
