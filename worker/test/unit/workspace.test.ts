import { mkdtemp, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, test } from 'vitest';
import { jobWorkspace, resolveInside } from '../../src/storage/workspace.js';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'ws-'));
});

describe('resolveInside', () => {
  test('resolves a normal relative path', async () => {
    expect(await resolveInside(root, 'a/b.txt')).toBe(join(root, 'a/b.txt'));
  });

  test('rejects parent traversal', async () => {
    await expect(resolveInside(root, '../etc/passwd')).rejects.toThrow(/outside workspace/);
  });

  test('rejects absolute paths', async () => {
    await expect(resolveInside(root, '/etc/passwd')).rejects.toThrow(/outside workspace/);
  });

  test('rejects a symlink that escapes the root', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'outside-'));
    await symlink(outside, join(root, 'link'));
    await expect(resolveInside(root, 'link/secret.txt')).rejects.toThrow(/outside workspace/);
  });

  test('allows a symlink that stays inside the root', async () => {
    await mkdir(join(root, 'real'));
    await symlink(join(root, 'real'), join(root, 'alias'));
    expect(await resolveInside(root, 'alias/file.txt')).toBe(join(root, 'alias/file.txt'));
  });
});

describe('jobWorkspace', () => {
  test('creates videos/{video_id}/v{n}/jobs/{job_id}', async () => {
    const dir = await jobWorkspace(root, {
      videoId: '11111111-1111-1111-1111-111111111111',
      version: 2,
      jobId: '22222222-2222-2222-2222-222222222222',
    });
    expect(dir).toBe(
      join(
        root,
        'videos/11111111-1111-1111-1111-111111111111/v2/jobs/22222222-2222-2222-2222-222222222222',
      ),
    );
  });

  test('rejects ids that are not UUIDs', async () => {
    await expect(
      jobWorkspace(root, { videoId: '../../x', version: 1, jobId: 'y' }),
    ).rejects.toThrow(/invalid id/);
  });
});
