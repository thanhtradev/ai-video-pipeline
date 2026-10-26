import { mkdir, mkdtemp, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pino from 'pino';
import { beforeEach, describe, expect, test } from 'vitest';
import type { ArchiveTarget } from '../../src/archive/webdav-target.js';
import { createArchiveVideoHandler, srtToVtt } from '../../src/handlers/archive-video.js';
import { ProviderBlockedError, type HandlerContext } from '../../src/runner.js';
import { sha256File, writeCheckpoint } from '../../src/storage/checkpoint.js';

// Archive (D-062): the version folder gets the deliverables as hard links plus a manifest, and the
// archiver uploads and verifies it.

const VIDEO = '679cd22f-d1f8-44fe-a9fd-9cdcbaa6325c';
const id = (n: number) =>
  `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;
const JOBS = {
  script_job_id: id(1),
  timing_job_id: id(2),
  episode_code_job_id: id(3),
  preview_render_job_id: id(4),
  preview_qa_job_id: id(5),
  final_render_job_id: id(6),
  final_qa_job_id: id(7),
  metadata_job_id: id(8),
};
const ARCHIVE_JOB = id(9);
const INPUT = {
  video_id: VIDEO,
  version: 1,
  remote_dir: `2026/10/${VIDEO}/v1`,
  frozen_at: '2026-10-26T10:00:00Z',
  approvals: [{ type: 'SCRIPT' }, { type: 'METADATA' }],
  ...JOBS,
};
const SRT = '1\n00:00:00,100 --> 00:00:01,733\nNếu bạn nghe được suy nghĩ của mèo?\n';

let versionDir: string;
let workDir: string;

async function writeJob(
  jobId: string,
  files: Record<string, string>,
  result: Record<string, unknown> = {},
) {
  const dir = join(versionDir, 'jobs', jobId);
  for (const [name, content] of Object.entries(files)) {
    await mkdir(join(dir, name, '..'), { recursive: true });
    await writeFile(join(dir, name), content);
  }
  await writeCheckpoint(dir, Object.keys(files), result);
}

/** An in-memory WebDAV target with the archiver's semantics. */
function memoryTarget() {
  const files = new Map<string, Buffer>();
  const dirs = new Set<string>();
  const target: ArchiveTarget = {
    exists: async (path) => dirs.has(path),
    ensureDir: async (path) => {
      dirs.add(path);
    },
    upload: async (local, remote) => {
      files.set(remote, await readFile(local));
    },
    putContent: async (remote, content) => {
      files.set(remote, Buffer.from(content));
    },
    list: async (dir) =>
      [...files]
        .filter(([p]) => p.startsWith(`${dir}/`))
        .map(([p, b]) => ({ path: p.slice(dir.length + 1), bytes: b.length })),
    hash: async (remote) => {
      const tmp = join(versionDir, '..', 'hash.tmp');
      await writeFile(tmp, files.get(remote)!);
      return sha256File(tmp);
    },
    move: async (from, to) => {
      for (const [p, b] of [...files]) {
        if (p.startsWith(`${from}/`)) {
          files.delete(p);
          files.set(`${to}/${p.slice(from.length + 1)}`, b);
        }
      }
      dirs.add(to);
    },
  };
  return { target, files };
}

beforeEach(async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'archive-')));
  versionDir = join(root, 'videos', VIDEO, 'v1');
  workDir = join(versionDir, 'jobs', ARCHIVE_JOB);
  await mkdir(workDir, { recursive: true });
  await writeJob(JOBS.script_job_id, { 'script.json': '{}', 'script.md': '# Mèo' });
  await writeJob(JOBS.timing_job_id, {
    'voice.wav': 'RIFF',
    'timing.json': '{}',
    'captions.json': '{}',
  });
  await writeJob(
    JOBS.episode_code_job_id,
    {
      'ws/src/episode/Episode.tsx': 'export {};',
      'ws/board/page-01.jpg': 'jpg',
      'agent-turns.json': '{}',
    },
    { board_token: 'a'.repeat(32), turns: 2 },
  );
  await writeJob(JOBS.preview_render_job_id, { 'preview.mp4': 'p', 'vi.srt': SRT });
  await writeJob(
    JOBS.preview_qa_job_id,
    { 'qa-report.json': '{"level":"PASS"}' },
    { media_token: 'b'.repeat(32) },
  );
  await writeJob(JOBS.final_render_job_id, { 'final.mp4': 'f', 'vi.srt': SRT });
  await writeJob(JOBS.final_qa_job_id, { 'qa-report.json': '{"level":"PASS"}' });
  await writeJob(
    JOBS.metadata_job_id,
    { 'metadata.json': '{"title":"x"}', 'thumbnail.jpg': 'jpg' },
    { media_token: 'c'.repeat(32) },
  );
});

function context(input: unknown = INPUT): HandlerContext {
  return {
    jobId: ARCHIVE_JOB,
    attemptNo: 1,
    input,
    workDir,
    signal: new AbortController().signal,
    logger: pino({ level: 'silent' }),
    progress: async () => undefined,
  };
}

describe('archive handler', () => {
  test('gathers the deliverables with a manifest and archives them verified', async () => {
    const { target, files } = memoryTarget();
    const result = await createArchiveVideoHandler({ target, blockSeconds: 60 })(context());

    const remote = [...files.keys()].map((p) => p.replace(`${INPUT.remote_dir}/`, '')).sort();
    expect(remote).toEqual([
      'audio/voice.wav',
      'checksums.sha256',
      'logs/agent-turns.json',
      'manifest.json',
      'metadata/metadata.json',
      'qa/qa-final.json',
      'qa/qa-preview.json',
      'remotion/board/page-01.jpg',
      'remotion/src/episode/Episode.tsx',
      'renders/final_1080p.mp4',
      'renders/preview_720p.mp4',
      'script/script.json',
      'script/script.md',
      'script/timing.json',
      'subtitles/captions.json',
      'subtitles/vi.srt',
      'subtitles/vi.vtt',
      'thumbnail/thumbnail.jpg',
    ]);
    expect(result.result).toMatchObject({
      target: 'nextcloud',
      path: INPUT.remote_dir,
      file_count: 18,
    });

    // Hard links to the job outputs, not copies.
    const final = await stat(join(versionDir, 'renders/final_1080p.mp4'));
    expect(final.ino).toBe(
      (await stat(join(versionDir, 'jobs', JOBS.final_render_job_id, 'final.mp4'))).ino,
    );
    const manifest = JSON.parse(await readFile(join(versionDir, 'manifest.json'), 'utf8'));
    expect(manifest).toMatchObject({ video_id: VIDEO, version: 1, frozen_at: INPUT.frozen_at });
    expect(JSON.stringify(manifest)).not.toMatch(/_token/);
    expect(files.get(`${INPUT.remote_dir}/subtitles/vi.vtt`)!.toString()).toBe(srtToVtt(SRT));
  });

  test('a retry finds the verified copy instead of uploading another', async () => {
    const { target, files } = memoryTarget();
    const handler = createArchiveVideoHandler({ target, blockSeconds: 60 });
    const first = await handler(context());
    const count = files.size;
    const second = await handler({ ...context(), attemptNo: 2 });

    expect(files.size).toBe(count);
    expect(second.result.manifest_sha256).toBe(first.result.manifest_sha256);
  });

  test('waits while no archive is configured; a changed job output is permanent', async () => {
    await expect(
      createArchiveVideoHandler({ target: null, blockSeconds: 60 })(context()),
    ).rejects.toBeInstanceOf(ProviderBlockedError);
    await writeFile(join(versionDir, 'jobs', JOBS.metadata_job_id, 'metadata.json'), 'changed');
    const { target } = memoryTarget();
    await expect(
      createArchiveVideoHandler({ target, blockSeconds: 60 })(context()),
    ).rejects.toThrow(/metadata job .* is missing or changed/);
  });

  test('SRT becomes WebVTT', () => {
    expect(srtToVtt(SRT)).toBe(
      'WEBVTT\n\n1\n00:00:00.100 --> 00:00:01.733\nNếu bạn nghe được suy nghĩ của mèo?\n',
    );
  });
});
