import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, test } from 'vitest';
import {
  readValidCheckpoint,
  sha256File,
  writeCheckpoint,
  writeFileAtomic,
} from '../../src/storage/checkpoint.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cp-'));
});

describe('writeFileAtomic', () => {
  test('writes content and leaves no temp files behind', async () => {
    await writeFileAtomic(join(dir, 'out.txt'), 'hello');
    expect(await readFile(join(dir, 'out.txt'), 'utf8')).toBe('hello');
    expect(await readdir(dir)).toEqual(['out.txt']);
  });
});

describe('sha256File', () => {
  test('hashes file content', async () => {
    await writeFile(join(dir, 'a.txt'), 'abc');
    expect(await sha256File(join(dir, 'a.txt'))).toEqual({
      sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      bytes: 3,
    });
  });
});

describe('checkpoint', () => {
  test('a written checkpoint is valid while outputs are unchanged', async () => {
    await writeFile(join(dir, 'result.json'), '{"ok":true}');
    await writeCheckpoint(dir, ['result.json'], { extra: 1 });

    const checkpoint = await readValidCheckpoint(dir);
    expect(checkpoint?.outputs).toEqual([
      { path: 'result.json', sha256: expect.stringMatching(/^[0-9a-f]{64}$/), bytes: 11 },
    ]);
    expect(checkpoint?.result).toEqual({ extra: 1 });
  });

  test('a modified output invalidates the checkpoint', async () => {
    await writeFile(join(dir, 'result.json'), '{"ok":true}');
    await writeCheckpoint(dir, ['result.json'], {});
    await writeFile(join(dir, 'result.json'), '{"ok":false}');

    expect(await readValidCheckpoint(dir)).toBeNull();
  });

  test('a missing output invalidates the checkpoint', async () => {
    await writeCheckpoint(dir, [], {});
    const manifest = JSON.parse(await readFile(join(dir, 'checkpoint.json'), 'utf8'));
    await writeFile(
      join(dir, 'checkpoint.json'),
      JSON.stringify({
        ...manifest,
        outputs: [{ path: 'gone.txt', sha256: 'a'.repeat(64), bytes: 1 }],
      }),
    );

    expect(await readValidCheckpoint(dir)).toBeNull();
  });

  test('no checkpoint file means no checkpoint', async () => {
    expect(await readValidCheckpoint(dir)).toBeNull();
  });

  test('rejects outputs outside the job directory', async () => {
    await expect(writeCheckpoint(dir, ['../escape.txt'], {})).rejects.toThrow(/outside workspace/);
  });
});
