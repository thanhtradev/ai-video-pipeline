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
  WORKER,
} from '../helpers/episode-flow.js';
import { versionStatus } from '../helpers/fixtures.js';

// A2 of an episode (D-057): a succeeded preview gets its QA job; passed QA requests A2 with the
// media to send. Approve starts the 1080p render, notes revise the code (storyboard rounds), Reject
// cancels, a failed QA needs a decision.

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

interface PreviewDueRow {
  kind: string;
  video_id: string;
  version: number;
  video_version_id: string;
  token: string;
  round: number;
  title: string;
  cost: Record<string, number> | null;
  media: {
    job_id: string;
    token: string;
    level: string;
    checks: { name: string; level: string }[];
    duration_seconds: number;
  } | null;
}

async function due(): Promise<PreviewDueRow[]> {
  return (await db.pool.query<PreviewDueRow>('SELECT * FROM preview_approvals_due()')).rows;
}

const RENDER_OUTPUT = {
  outputs: [
    { path: 'preview.mp4', bytes: 100, sha256: 'f'.repeat(64) },
    { path: 'vi.srt', bytes: 10, sha256: '1'.repeat(64) },
  ],
  result: { width: 1280, height: 720, duration_seconds: 178.6 },
};
const QA_OUTPUT = {
  outputs: [{ path: 'qa-report.json', bytes: 10, sha256: '2'.repeat(64) }],
  result: {
    level: 'WARN',
    checks: [{ name: 'black frames', level: 'WARN', detail: '1.2 s at 0:42' }],
    media_token: '3'.repeat(32),
    duration_seconds: 178.6,
    loudness: { output_lufs: -14.2, output_true_peak: -1.31 },
  },
};

/** An episode whose storyboard was approved and whose preview rendered. */
async function episodeWithPreview(name: string) {
  const episode = await episodeAwaitingStoryboard(db.pool, name);
  expect((await decide(episode.request.token, 'APPROVE')).result).toBe('OK');
  const render = (await jobs(episode.version_id)).find((job) => job.step === 'render_episode')!;
  await succeed(render.id, RENDER_OUTPUT);
  return { ...episode, renderId: render.id };
}

/** Through QA to the A2 request. */
async function episodeAwaitingPreview(name: string) {
  const episode = await episodeWithPreview(name);
  expect((await due()).some((row) => row.video_version_id === episode.version_id)).toBe(false);
  const qa = (await jobs(episode.version_id)).find((job) => job.step === 'qa_preview')!;
  await succeed(qa.id, QA_OUTPUT);
  const request = (await due()).find((row) => row.video_version_id === episode.version_id)!;
  return { ...episode, qaId: qa.id, preview: request };
}

describe('preview_approvals_due', () => {
  test('checks a new preview, then requests A2 with the media and the QA report', async () => {
    const episode = await episodeWithPreview('a2-due');

    expect(await due()).toEqual([]);
    expect(await versionStatus(db.pool, episode.version_id)).toBe('QA_RUNNING');
    const qa = (await jobs(episode.version_id)).find((job) => job.step === 'qa_preview')!;
    expect(qa).toMatchObject({
      stream: 'q:light',
      status: 'READY',
      input: { render_job_id: episode.renderId, timing_job_id: episode.timingId },
    });
    // The QA job is created once.
    await due();
    expect((await jobs(episode.version_id)).filter((j) => j.step === 'qa_preview')).toHaveLength(1);

    await succeed(qa.id, QA_OUTPUT);
    await db.pool.query(
      `INSERT INTO cost_entry (video_version_id, kind, units, unit_price, amount, currency)
       VALUES ($1, 'ACTUAL', 2817, 1, 2817, 'CRD')`,
      [episode.version_id],
    );
    const [request, ...rest] = (await due()).filter(
      (row) => row.video_version_id === episode.version_id,
    );

    expect(rest).toEqual([]);
    expect(request).toMatchObject({
      kind: 'REQUEST',
      video_id: episode.video_id,
      version: 1,
      round: 1,
      title: 'Mèo nghĩ gì?',
      cost: { CRD: 2817 },
      media: {
        job_id: qa.id,
        token: '3'.repeat(32),
        level: 'WARN',
        checks: [{ name: 'black frames', level: 'WARN' }],
        duration_seconds: 178.6,
      },
    });
    expect(request!.token).toMatch(/^[0-9a-f]{32}$/);
    expect(await versionStatus(db.pool, episode.version_id)).toBe('AWAITING_PREVIEW_APPROVAL');
    expect((await due()).filter((row) => row.video_version_id === episode.version_id)).toEqual([]);
  });

  test('a failed QA job leaves the version needing a decision, without a request', async () => {
    const episode = await episodeWithPreview('a2-qa-fail');
    await due();
    const qa = (await jobs(episode.version_id)).find((job) => job.step === 'qa_preview')!;
    await db.pool.query('SELECT job_promote()');
    await db.pool.query(`UPDATE job SET status = 'QUEUED', queued_at = now() WHERE id = $1`, [
      qa.id,
    ]);
    await db.pool.query('SELECT * FROM job_start($1, $2, 60)', [qa.id, WORKER]);
    await db.pool.query(`SELECT job_fail($1, $2, 'QA failed: duration', false)`, [qa.id, WORKER]);

    expect(await versionStatus(db.pool, episode.version_id)).toBe('NEEDS_DECISION');
    expect((await due()).filter((row) => row.video_version_id === episode.version_id)).toEqual([]);
  });
});

describe('telegram_decide on a preview', () => {
  test('approve starts the 1080p render of the approved code', async () => {
    const { version_id, preview, codeId, timingId } = await episodeAwaitingPreview('a2-approve');

    expect(await decide(preview.token, 'APPROVE')).toMatchObject({ result: 'OK', version: 1 });

    expect(await versionStatus(db.pool, version_id)).toBe('RENDERING_FINAL');
    const final = (await jobs(version_id)).find((job) => job.step === 'render_final')!;
    expect(final).toMatchObject({
      stream: 'q:render',
      status: 'READY',
      input: { episode_code_job_id: codeId, timing_job_id: timingId, quality: 'final' },
    });
  });

  test('notes revise the code; the new storyboard and preview follow', async () => {
    const { version_id, preview, codeId } = await episodeAwaitingPreview('a2-notes');

    expect(await decide(preview.token, 'FEEDBACK', 'Đoạn cuối nhanh quá.')).toMatchObject({
      result: 'OK',
      round: 2,
    });

    expect(await versionStatus(db.pool, version_id)).toBe('GENERATING_ASSETS');
    const revision = (await jobs(version_id)).filter((job) => job.step === 'episode_code').at(-1)!;
    expect(revision.input).toMatchObject({
      revision: { previous_job_id: codeId, feedback: 'Đoạn cuối nhanh quá.' },
    });
    await succeed(revision.id, codeOutput());
    const storyboard = (await storyboardDue(db.pool)).find(
      (row) => row.video_version_id === version_id,
    )!;
    expect(storyboard).toMatchObject({ round: 2, board: { job_id: revision.id } });

    // The old preview no longer counts: the next render of the revision gets its own QA.
    expect((await decide(storyboard.token, 'APPROVE')).result).toBe('OK');
    const renders = (await jobs(version_id)).filter((job) => job.step === 'render_episode');
    expect(renders).toHaveLength(2);
    await succeed(renders[1]!.id, RENDER_OUTPUT);
    await due();
    const qas = (await jobs(version_id)).filter((job) => job.step === 'qa_preview');
    expect(qas.map((job) => job.input.render_job_id)).toEqual([renders[0]!.id, renders[1]!.id]);
  });

  test('reject cancels; strangers, stale hashes and regenerate are refused', async () => {
    const { version_id, preview } = await episodeAwaitingPreview('a2-reject');

    expect((await decide(preview.token, 'APPROVE', null, STRANGER)).result).toBe('NOT_ALLOWED');
    expect((await decide(preview.token, 'REGENERATE')).result).toBe('NOT_SUPPORTED');
    expect((await decide(preview.token, 'FEEDBACK', ' ')).result).toBe('EMPTY_NOTE');
    expect((await decide(preview.token, 'REJECT')).result).toBe('OK');
    expect(await versionStatus(db.pool, version_id)).toBe('CANCELLED');
  });

  test('a preview that changed after the request is refused', async () => {
    const { preview, renderId } = await episodeAwaitingPreview('a2-hash');
    await db.pool.query(
      `UPDATE job SET output = jsonb_set(output, '{outputs,0,sha256}', to_jsonb($2::text))
       WHERE id = $1`,
      [renderId, '9'.repeat(64)],
    );
    expect((await decide(preview.token, 'APPROVE')).result).toBe('HASH_MISMATCH');
  });
});
