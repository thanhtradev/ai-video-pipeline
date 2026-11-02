import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import {
  link,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  readlink,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { Header } from 'tar';
import { beforeEach, describe, expect, test } from 'vitest';
import { exportVideo } from '../../src/move/export-video.js';
import { importVideo, VideoImportError } from '../../src/move/import-video.js';

// D-087: a moved video arrives as a tar of the source worker's WORK_ROOT/videos/<id>. The target
// accepts only what a video folder holds (files, directories, hard links inside it and the
// workspaces' node_modules symlink, re-pointed at its own repo), checks every checkpoint, and
// only then puts the folder in place. Anything else rejects the whole copy.

const VIDEO = '5b0c7a8e-1111-4c2d-9e3f-000000000001';
const JOB = '5b0c7a8e-2222-4c2d-9e3f-000000000002';
const JOB_DIR = `${VIDEO}/v1/jobs/${JOB}`;

let sourceRoot: string;
let targetRoot: string;
let nodeModules: string;

beforeEach(async () => {
  sourceRoot = await mkdtemp(join(tmpdir(), 'move-src-'));
  targetRoot = await mkdtemp(join(tmpdir(), 'move-dst-'));
  nodeModules = await mkdtemp(join(tmpdir(), 'move-nm-'));
});

const sha256 = (data: string) => createHash('sha256').update(data).digest('hex');

async function writeJob(root: string, files: Record<string, string>, checkpointed: string[]) {
  const dir = join(root, 'videos', JOB_DIR);
  await mkdir(join(dir, 'episode', 'src'), { recursive: true });
  for (const [name, text] of Object.entries(files)) await writeFile(join(dir, name), text);
  await writeFile(
    join(dir, 'checkpoint.json'),
    JSON.stringify({
      version: 1,
      completedAt: '2026-11-02T00:00:00Z',
      outputs: checkpointed.map((path) => ({
        path,
        sha256: sha256(files[path]!),
        bytes: Buffer.byteLength(files[path]!),
      })),
      result: {},
    }),
  );
  return dir;
}

async function sourceVideo(): Promise<void> {
  const dir = await writeJob(sourceRoot, { 'voice.wav': 'RIFF....', 'script.md': '# Mèo' }, [
    'voice.wav',
    'script.md',
  ]);
  await symlink('/Users/someone/aivideo/repo/node_modules', join(dir, 'episode', 'node_modules'));
  await writeFile(join(dir, 'episode', 'src', 'Episode.tsx'), 'export {};');
  // The archive step hard-links deliverables into the version folder (D-062).
  await link(join(dir, 'voice.wav'), join(sourceRoot, 'videos', VIDEO, 'v1', 'voice.wav'));
}

async function exported(): Promise<Readable> {
  const stream = await exportVideo(sourceRoot, VIDEO);
  if (!stream) throw new Error('no export');
  return stream;
}

function rawTar(entries: { path: string; type?: string; linkpath?: string; body?: string }[]) {
  const blocks: Buffer[] = [];
  for (const entry of entries) {
    const body = Buffer.from(entry.body ?? '');
    const header = Buffer.alloc(512);
    new Header({
      path: entry.path,
      type: (entry.type ?? 'File') as never,
      size: entry.type && entry.type !== 'File' ? 0 : body.length,
      mode: entry.type === 'Directory' ? 0o755 : 0o644,
      mtime: new Date('2026-11-02T00:00:00Z'),
      ...(entry.linkpath ? { linkpath: entry.linkpath } : {}),
    }).encode(header);
    blocks.push(header);
    if (body.length > 0) {
      blocks.push(body, Buffer.alloc((512 - (body.length % 512)) % 512));
    }
  }
  blocks.push(Buffer.alloc(1024));
  return Readable.from([Buffer.concat(blocks)]);
}

async function run(source: Readable) {
  return importVideo({ workRoot: targetRoot, videoId: VIDEO, source, nodeModules });
}

async function incomingLeftovers(): Promise<string[]> {
  const dir = join(targetRoot, 'videos', '.incoming');
  return existsSync(dir) ? readdir(dir) : [];
}

describe('importVideo', () => {
  test('puts the copied folder in place with every file, hard link and checkpoint', async () => {
    await sourceVideo();

    const result = await run(await exported());

    const dir = join(targetRoot, 'videos', JOB_DIR);
    expect(await readFile(join(dir, 'script.md'), 'utf8')).toBe('# Mèo');
    expect(await readFile(join(dir, 'episode', 'src', 'Episode.tsx'), 'utf8')).toBe('export {};');
    expect(await readFile(join(targetRoot, 'videos', VIDEO, 'v1', 'voice.wav'), 'utf8')).toBe(
      'RIFF....',
    );
    expect(result).toEqual({ checkpoints: 1, relinked: 1, movedAside: null });
    expect(await incomingLeftovers()).toEqual([]);
  });

  test("re-points each workspace's node_modules at this worker's own", async () => {
    await sourceVideo();

    await run(await exported());

    const linkPath = join(targetRoot, 'videos', JOB_DIR, 'episode', 'node_modules');
    expect((await lstat(linkPath)).isSymbolicLink()).toBe(true);
    expect(await readlink(linkPath)).toBe(nodeModules);
  });

  test('moves an older copy of the video aside instead of overwriting or deleting it', async () => {
    await sourceVideo();
    await mkdir(join(targetRoot, 'videos', VIDEO), { recursive: true });
    await writeFile(join(targetRoot, 'videos', VIDEO, 'old.txt'), 'earlier stay');

    const result = await run(await exported());

    expect(result.movedAside).toMatch(new RegExp(`videos/\\.moved-away/${VIDEO}-\\d+$`));
    expect(await readFile(join(result.movedAside!, 'old.txt'), 'utf8')).toBe('earlier stay');
    expect(existsSync(join(targetRoot, 'videos', VIDEO, 'old.txt'))).toBe(false);
  });

  test('rejects a copy whose checkpointed file changed, and leaves nothing behind', async () => {
    const dir = await writeJob(sourceRoot, { 'script.md': '# Mèo' }, ['script.md']);
    await writeFile(join(dir, 'script.md'), '# Chó');

    await expect(run(await exported())).rejects.toThrow(
      new VideoImportError(`checkpoint does not match its files: v1/jobs/${JOB}`),
    );

    expect(existsSync(join(targetRoot, 'videos', VIDEO))).toBe(false);
    expect(await incomingLeftovers()).toEqual([]);
  });

  test.each([
    [{ path: '../evil.txt', body: 'x' }, 'outside the video'],
    [{ path: '/etc/evil.txt', body: 'x' }, 'outside the video'],
    [{ path: 'other-video/a.txt', body: 'x' }, 'outside the video'],
    [{ path: `${VIDEO}/v1/../../evil.txt`, body: 'x' }, 'outside the video'],
    [{ path: `${VIDEO}/v1/evil`, type: 'SymbolicLink', linkpath: '/etc' }, 'symbolic link'],
    [{ path: `${VIDEO}/v1/x/node_modules/pkg/index.js`, body: 'x' }, 'inside a node_modules link'],
    [{ path: `${VIDEO}/v1/l`, type: 'Link', linkpath: '/etc/passwd' }, 'hard link'],
    [{ path: `${VIDEO}/v1/l`, type: 'Link', linkpath: `${VIDEO}/../x` }, 'hard link'],
    [{ path: `${VIDEO}/v1/dev`, type: 'CharacterDevice' }, 'entry type'],
  ])('rejects %j (%s)', async (entry, reason) => {
    const source = rawTar([{ path: `${VIDEO}/`, type: 'Directory' }, entry]);

    const error = await run(source).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(VideoImportError);
    expect((error as Error).message).toContain(reason);

    expect(existsSync(join(targetRoot, 'videos', VIDEO))).toBe(false);
    expect(existsSync(join(targetRoot, 'evil.txt'))).toBe(false);
    expect(await incomingLeftovers()).toEqual([]);
  });

  test('rejects an empty archive and an invalid video id', async () => {
    await expect(run(rawTar([]))).rejects.toThrow('the copy is not a valid archive');
    await expect(
      importVideo({ workRoot: targetRoot, videoId: '../x', source: rawTar([]), nodeModules }),
    ).rejects.toThrow('invalid video id');
  });
});

describe('exportVideo', () => {
  test('returns null for an unknown video or an invalid id', async () => {
    expect(await exportVideo(sourceRoot, VIDEO)).toBeNull();
    expect(await exportVideo(sourceRoot, '../etc')).toBeNull();
  });
});
