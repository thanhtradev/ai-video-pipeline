import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db.js';
import {
  decide as decideWith,
  episodeAwaitingStoryboard,
  jobs as jobsOf,
  OWNER,
  STRANGER,
  succeed as succeedWith,
} from '../helpers/episode-flow.js';
import { versionStatus } from '../helpers/fixtures.js';

// After the final render (D-062): QA and metadata, A3 on Telegram, then the archive job's verified
// copy completes the video.

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

interface FinalRow {
  kind: string;
  video_id: string;
  video_version_id: string;
  token: string | null;
  round: number | null;
  metadata: Record<string, unknown> | null;
  report: Record<string, unknown> | null;
}

async function due(versionId: string): Promise<FinalRow[]> {
  const rows = (await db.pool.query<FinalRow>('SELECT * FROM final_due()')).rows;
  return rows.filter((row) => row.video_version_id === versionId);
}

const ARCHIVED = (videoId: string) => ({
  target: 'gdrive',
  path: `2026/10/${videoId}/v1`,
  file_count: 42,
  total_bytes: 123456789,
  local_bytes: 987654321,
  manifest_sha256: 'a'.repeat(64),
  verified_at: '2026-10-26T10:00:00Z',
});
const out = (path: string, digit: string) => ({ path, bytes: 10, sha256: digit.repeat(64) });
const METADATA = (title: string) => ({
  outputs: [out('metadata.json', '4'), out('thumbnail.jpg', '5')],
  result: {
    metadata: {
      title,
      description: 'Mô tả.',
      tags: ['mèo', 'nếu bạn'],
      thumbnail_shot: '1.1',
    },
    media_token: '6'.repeat(32),
  },
});

/** An episode through storyboard, preview, QA and A2 approval, with its 1080p render done. */
async function episodeWithFinal(name: string) {
  const episode = await episodeAwaitingStoryboard(db.pool, name);
  await decide(episode.request.token, 'APPROVE');
  const v = episode.version_id;
  await succeed((await jobOf(v, 'render_episode')).id, {
    outputs: [out('preview.mp4', 'f')],
    result: {},
  });
  await db.pool.query('SELECT * FROM preview_approvals_due()');
  await succeed((await jobOf(v, 'qa_preview')).id, {
    outputs: [out('qa-report.json', '2')],
    result: { level: 'PASS', checks: [], media_token: '3'.repeat(32) },
  });
  const a2 = (
    await db.pool.query<{ token: string; video_version_id: string }>(
      'SELECT token, video_version_id FROM preview_approvals_due()',
    )
  ).rows.find((row) => row.video_version_id === v)!;
  expect((await decide(a2.token, 'APPROVE')).result).toBe('OK');
  const final = await jobOf(v, 'render_final');
  await succeed(final.id, { outputs: [out('final.mp4', '7'), out('vi.srt', '8')], result: {} });
  return { ...episode, finalId: final.id };
}

/** Through final QA and metadata to the A3 request. */
async function episodeAwaitingMetadata(name: string) {
  const episode = await episodeWithFinal(name);
  const v = episode.version_id;
  expect(await due(v)).toEqual([]);
  await succeed((await jobOf(v, 'qa_final')).id, {
    outputs: [out('qa-report.json', '9')],
    result: { level: 'PASS', checks: [] },
  });
  await succeed((await jobOf(v, 'metadata')).id, METADATA('Nếu bạn nghe được mèo nghĩ gì?'));
  const [request] = await due(v);
  return { ...episode, a3: request! };
}

describe('final_due', () => {
  test('a finished final render gets QA and metadata once, then A3 with both', async () => {
    const { version_id: v, finalId, timingId } = await episodeWithFinal('final-due');

    await due(v);
    await due(v);
    const qa = (await jobs(v)).filter((job) => job.step === 'qa_final');
    const meta = (await jobs(v)).filter((job) => job.step === 'metadata');
    expect(qa).toHaveLength(1);
    expect(meta).toHaveLength(1);
    expect(qa[0]).toMatchObject({
      stream: 'q:light',
      input: { render_job_id: finalId, timing_job_id: timingId, quality: 'final' },
    });
    expect(meta[0]!.input).toMatchObject({ render_job_id: finalId, round: 1 });
    expect(meta[0]!.input).not.toHaveProperty('revision');

    await succeed(qa[0]!.id, {
      outputs: [out('qa-report.json', '9')],
      result: { level: 'WARN', checks: [] },
    });
    expect(await due(v)).toEqual([]);
    await succeed(meta[0]!.id, METADATA('Tiêu đề'));
    const [request, ...rest] = await due(v);

    expect(rest).toEqual([]);
    expect(request).toMatchObject({
      kind: 'REQUEST',
      round: 1,
      metadata: {
        job_id: meta[0]!.id,
        token: '6'.repeat(32),
        title: 'Tiêu đề',
        tags: ['mèo', 'nếu bạn'],
        thumbnail_shot: '1.1',
        qa_level: 'WARN',
      },
    });
    expect(await versionStatus(db.pool, v)).toBe('AWAITING_METADATA_APPROVAL');
  });
});

describe('telegram_decide on metadata (A3)', () => {
  test('notes or Viết lại write the metadata again; the new version comes back as A3', async () => {
    const { version_id: v, a3 } = await episodeAwaitingMetadata('a3-notes');

    expect(await decide(a3.token!, 'FEEDBACK', 'Tiêu đề ngắn hơn.')).toMatchObject({
      result: 'OK',
      round: 2,
    });
    expect(await versionStatus(db.pool, v)).toBe('RENDERING_FINAL');
    const second = await jobOf(v, 'metadata');
    expect(second.input).toMatchObject({ round: 2, revision: { feedback: 'Tiêu đề ngắn hơn.' } });
    await succeed(second.id, METADATA('Mèo nghĩ gì?'));
    const [again] = await due(v);
    expect(again).toMatchObject({ kind: 'REQUEST', round: 2, metadata: { title: 'Mèo nghĩ gì?' } });

    expect(await decide(again!.token!, 'REGENERATE')).toMatchObject({ result: 'OK', round: 3 });
    expect((await jobOf(v, 'metadata')).input).toMatchObject({ revision: { feedback: '' } });
  });

  test('approve archives; the verified archive asks the owner about the Mac copy', async () => {
    const { version_id: v, video_id, a3, codeId, finalId } = await episodeAwaitingMetadata('a3-ok');
    expect((await decide(a3.token!, 'REJECT')).result).toBe('NOT_SUPPORTED');
    expect((await decide(a3.token!, 'APPROVE', null, STRANGER)).result).toBe('NOT_ALLOWED');

    expect((await decide(a3.token!, 'APPROVE')).result).toBe('OK');
    expect(await versionStatus(db.pool, v)).toBe('ARCHIVING');
    const archive = await jobOf(v, 'archive');
    expect(archive).toMatchObject({
      stream: 'q:heavy',
      input: { video_id, version: 1, episode_code_job_id: codeId, final_render_job_id: finalId },
    });
    expect(archive.input.remote_dir).toMatch(new RegExp(`^\\d{4}/\\d{2}/${video_id}/v1$`));
    expect(archive.input.frozen_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect((archive.input.approvals as { type: string }[]).map((a) => a.type)).toEqual([
      'SCRIPT',
      'STORYBOARD',
      'PREVIEW',
      'METADATA',
    ]);

    await db.pool.query(
      `INSERT INTO cost_entry (video_version_id, kind, units, unit_price, amount, currency)
       VALUES ($1, 'ACTUAL', 2817, 1, 2817, 'CRD')`,
      [v],
    );
    await succeed(archive.id, {
      outputs: [],
      result: ARCHIVED(video_id),
    });
    const [done, ...rest] = await due(v);

    expect(rest).toEqual([]);
    expect(done).toMatchObject({
      kind: 'DONE',
      metadata: { title: 'Nếu bạn nghe được mèo nghĩ gì?' },
      report: {
        cost: { CRD: 2817 },
        target: 'gdrive',
        path: `2026/10/${video_id}/v1`,
        file_count: 42,
        total_bytes: 123456789,
        local_bytes: 987654321,
      },
    });
    expect(done!.token).toMatch(/^[0-9a-f]{32}$/);
    expect(await versionStatus(db.pool, v)).toBe('ARCHIVE_VERIFIED');
    const record = await db.pool.query(
      'SELECT path, file_count FROM archive_record WHERE video_version_id = $1',
      [v],
    );
    expect(record.rows[0]).toEqual({ path: `2026/10/${video_id}/v1`, file_count: 42 });
    expect(await due(v)).toEqual([]);
  });

  test('a metadata that changed after the request is refused', async () => {
    const { a3, version_id: v } = await episodeAwaitingMetadata('a3-hash');
    const meta = await jobOf(v, 'metadata');
    await db.pool.query(
      `UPDATE job SET output = jsonb_set(output, '{outputs,0,sha256}', to_jsonb($2::text)) WHERE id = $1`,
      [meta.id, 'b'.repeat(64)],
    );
    expect((await decide(a3.token!, 'APPROVE')).result).toBe('HASH_MISMATCH');
  });
});

describe('cleanup of the Mac copy (D-063)', () => {
  /** Through A3 and a verified archive to the CLEANUP request. */
  async function archived(name: string) {
    const episode = await episodeAwaitingMetadata(name);
    await decide(episode.a3.token!, 'APPROVE');
    await succeed((await jobOf(episode.version_id, 'archive')).id, {
      outputs: [],
      result: ARCHIVED(episode.video_id),
    });
    const [done] = await due(episode.version_id);
    return { ...episode, cleanup: done!.token! };
  }

  test('only the owner approves; the cleanup job then completes the video', async () => {
    const { version_id: v, video_id, cleanup } = await archived('cleanup-ok');
    await db.pool.query(`INSERT INTO approver (telegram_user_id, name) VALUES (222, 'An')`);

    expect((await decide(cleanup, 'APPROVE', null, 222)).result).toBe('NOT_OWNER');
    expect((await decide(cleanup, 'APPROVE', null, STRANGER)).result).toBe('NOT_ALLOWED');
    await db.pool.query(`UPDATE approver SET is_owner = true WHERE telegram_user_id = $1`, [OWNER]);
    expect((await decide(cleanup, 'APPROVE')).result).toBe('OK');

    const job = await jobOf(v, 'cleanup');
    expect(job).toMatchObject({
      stream: 'q:heavy',
      input: {
        video_id,
        version: 1,
        target: 'gdrive',
        remote_dir: `2026/10/${video_id}/v1`,
        manifest_sha256: 'a'.repeat(64),
      },
    });
    expect(await due(v)).toEqual([]);
    expect(await versionStatus(db.pool, v)).toBe('ARCHIVE_VERIFIED');

    await succeed(job.id, { outputs: [], result: { freed_bytes: 987654321 } });
    const [cleaned] = await due(v);
    expect(cleaned).toMatchObject({ kind: 'CLEANED', report: { freed_bytes: 987654321 } });
    expect(await versionStatus(db.pool, v)).toBe('COMPLETED');
  });

  test('Giữ lại, or no answer before expiry, keeps the copy and completes', async () => {
    const kept = await archived('cleanup-keep');
    expect((await decide(kept.cleanup, 'REJECT')).result).toBe('OK');
    expect(await versionStatus(db.pool, kept.version_id)).toBe('COMPLETED');
    expect((await jobs(kept.version_id)).some((j) => j.step === 'cleanup')).toBe(false);

    const silent = await archived('cleanup-expire');
    await db.pool.query(
      `UPDATE approval SET expires_at = now() - interval '1 second' WHERE token = $1`,
      [silent.cleanup],
    );
    await db.pool.query('SELECT approval_expire()');
    await due(silent.version_id);
    expect(await versionStatus(db.pool, silent.version_id)).toBe('COMPLETED');
  });
});
