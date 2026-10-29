import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db.js';
import {
  codeOutput as nextCodeOutput,
  decide as decideWith,
  episodeAwaitingStoryboard as awaitingStoryboard,
  jobs as jobsOf,
  STRANGER,
  storyboardDue,
  succeed as succeedWith,
} from '../helpers/episode-flow.js';
import { versionStatus } from '../helpers/fixtures.js';

// STORYBOARD approval (docs/episode-pipeline.md §7): after episode_code succeeds the storyboard is
// requested on Telegram; Approve starts the episode render, a reply with notes starts a revision
// (at most 3 rounds), Reject cancels. telegram_decide() serves A1 and storyboard buttons alike.

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
  await db.pool.query(`INSERT INTO approver (telegram_user_id, name) VALUES (111, 'owner')`);
});

afterAll(async () => {
  await db.drop();
});

const jobs = (versionId: string) => jobsOf(db.pool, versionId);
const succeed = (jobId: string, output: object) => succeedWith(db.pool, jobId, output);
const codeOutput = nextCodeOutput;
const decide = (token: string, action: string, note: string | null = null, user?: number) =>
  decideWith(db.pool, token, action, note, user);
const due = () => storyboardDue(db.pool);
const episodeAwaitingStoryboard = (name: string) => awaitingStoryboard(db.pool, name);

describe('storyboard_approvals_due', () => {
  test('requests approval once the episode code succeeds, with the board to send', async () => {
    const { version_id, request, codeId, video_id } = await episodeAwaitingStoryboard('sb-1');

    expect(request).toMatchObject({
      kind: 'REQUEST',
      video_id,
      version: 1,
      round: 1,
      title: 'Mèo nghĩ gì?',
      board: { job_id: codeId, token: 'e'.repeat(32), pages: ['ws/board/page-01.jpg'] },
    });
    expect(request.token).toMatch(/^[0-9a-f]{32}$/);
    expect(await versionStatus(db.pool, version_id)).toBe('AWAITING_STORYBOARD_APPROVAL');
    expect((await due()).filter((row) => row.video_version_id === version_id)).toEqual([]);
  });
});

describe('telegram_decide on a storyboard', () => {
  test('approve starts the episode render', async () => {
    const { version_id, request, codeId, timingId } = await episodeAwaitingStoryboard('sb-approve');

    expect(await decide(request.token, 'APPROVE')).toMatchObject({ result: 'OK', version: 1 });

    expect(await versionStatus(db.pool, version_id)).toBe('RENDERING_PREVIEW');
    const render = (await jobs(version_id)).find((job) => job.step === 'render_episode')!;
    expect(render).toMatchObject({
      stream: 'q:render',
      status: 'READY',
      input: { episode_code_job_id: codeId, timing_job_id: timingId },
    });
  });

  test('a reply with notes starts a revision of the latest code, round by round', async () => {
    const { version_id, request, codeId } = await episodeAwaitingStoryboard('sb-feedback');

    expect(await decide(request.token, 'FEEDBACK', 'Shot 1.2 tối quá.')).toMatchObject({
      result: 'OK',
      round: 2,
    });

    expect(await versionStatus(db.pool, version_id)).toBe('GENERATING_ASSETS');
    const revision = (await jobs(version_id)).filter((job) => job.step === 'episode_code').at(-1)!;
    expect(revision).toMatchObject({
      status: 'READY',
      input: { revision: { previous_job_id: codeId, feedback: 'Shot 1.2 tối quá.' } },
    });
    // The old request is settled; the next one comes when the revision succeeds.
    expect((await decide(request.token, 'APPROVE')).result).toBe('NOT_PENDING');
    await succeed(revision.id, codeOutput());
    const next = (await due()).find((row) => row.video_version_id === version_id)!;
    expect(next).toMatchObject({ round: 2, board: { job_id: revision.id } });
  });

  test('a fourth round of notes needs a decision instead of another revision', async () => {
    const { version_id, request } = await episodeAwaitingStoryboard('sb-rounds');
    let token = request.token;
    for (const round of [2, 3, 4]) {
      expect(await decide(token, 'FEEDBACK', `Vòng ${round - 1}`)).toMatchObject({
        result: 'OK',
        round,
      });
      const revision = (await jobs(version_id))
        .filter((job) => job.step === 'episode_code')
        .at(-1)!;
      await succeed(revision.id, codeOutput());
      token = (await due()).find((row) => row.video_version_id === version_id)!.token;
    }

    expect(await decide(token, 'FEEDBACK', 'Vòng 4')).toMatchObject({ result: 'NEEDS_DECISION' });

    expect(await versionStatus(db.pool, version_id)).toBe('NEEDS_DECISION');
    expect((await jobs(version_id)).filter((job) => job.step === 'episode_code')).toHaveLength(4);
  });

  test('reject cancels the episode', async () => {
    const { version_id, request } = await episodeAwaitingStoryboard('sb-reject');
    expect((await decide(request.token, 'REJECT')).result).toBe('OK');
    expect(await versionStatus(db.pool, version_id)).toBe('CANCELLED');
  });

  test('refuses strangers, empty notes, and notes on an already approved script', async () => {
    const { version_id, request } = await episodeAwaitingStoryboard('sb-refuse');

    expect((await decide(request.token, 'APPROVE', null, STRANGER)).result).toBe('NOT_ALLOWED');
    expect((await decide(request.token, 'FEEDBACK', '  ')).result).toBe('EMPTY_NOTE');
    expect((await decide('0'.repeat(32), 'APPROVE')).result).toBe('NOT_FOUND');
    expect(await versionStatus(db.pool, version_id)).toBe('AWAITING_STORYBOARD_APPROVAL');

    const script = (
      await db.pool.query<{ token: string }>(
        `SELECT token FROM approval WHERE video_version_id = $1 AND type = 'SCRIPT'`,
        [version_id],
      )
    ).rows[0]!;
    expect((await decide(script.token, 'FEEDBACK', 'x')).result).toBe('NOT_PENDING');
  });

  test('rejects unknown actions', async () => {
    await expect(decide('0'.repeat(32), 'DELETE')).rejects.toThrow(/invalid action/);
  });
});
