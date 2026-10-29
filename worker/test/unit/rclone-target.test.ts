import { describe, expect, test } from 'vitest';
import {
  createRcloneTarget,
  RcloneError,
  type RcloneRunner,
} from '../../src/archive/rclone-target.js';

// Google Drive through rclone (D-063): the archive target maps to rclone commands under one root.

const ROOT = 'aivideo-drive:AI Video Archive';
const HASH = 'a'.repeat(64);

function fake(responses: (args: readonly string[], input?: string) => string) {
  const calls: { args: readonly string[]; input?: string }[] = [];
  const run: RcloneRunner = async (args, input) => {
    calls.push({ args, ...(input === undefined ? {} : { input }) });
    return responses(args, input);
  };
  return { calls, target: createRcloneTarget({ run, root: ROOT }) };
}

describe('rclone target', () => {
  test('maps the archive operations to rclone commands under the root', async () => {
    const { calls, target } = fake((args) => {
      if (args[0] === 'lsjson' && args[1] === '-R')
        return JSON.stringify([
          { Path: 'renders/final.mp4', Size: 10, Hashes: { sha256: HASH } },
          { Path: 'logs/a.json', Size: 2, Hashes: { sha256: '' } },
        ]);
      if (args[0] === 'lsjson') throw new RcloneError('not found', 3);
      return '';
    });
    await target.ensureDir('2026/10/v.partial');
    await target.upload('/tmp/final.mp4', '2026/10/v.partial/renders/final.mp4');
    await target.putContent('2026/10/x.txt', 'hello');
    expect(await target.list('2026/10/v.partial')).toEqual([
      { path: 'renders/final.mp4', bytes: 10, sha256: HASH },
      { path: 'logs/a.json', bytes: 2 },
    ]);
    expect(await target.exists('2026/10/v')).toBe(false);
    await target.move('2026/10/v.partial', '2026/10/v');

    expect(calls.map((c) => c.args)).toEqual([
      ['mkdir', `${ROOT}/2026/10/v.partial`],
      ['copyto', '/tmp/final.mp4', `${ROOT}/2026/10/v.partial/renders/final.mp4`],
      ['rcat', `${ROOT}/2026/10/x.txt`],
      ['lsjson', '-R', '--files-only', '--hash-type', 'sha256', `${ROOT}/2026/10/v.partial`],
      ['lsjson', '--stat', `${ROOT}/2026/10/v`],
      ['lsjson', '--stat', `${ROOT}/2026/10/v`],
      ['moveto', `${ROOT}/2026/10/v.partial`, `${ROOT}/2026/10/v`],
    ]);
    expect(calls[2]!.input).toBe('hello');
  });

  test('uploads many files with one copy, the paths on stdin', async () => {
    const { calls, target } = fake(() => '');

    await target.uploadFiles!('/w/v1', '2026/10/v.partial', ['manifest.json', 'renders/final.mp4']);

    expect(calls).toEqual([
      {
        args: ['copy', '--files-from-raw', '-', '/w/v1', `${ROOT}/2026/10/v.partial`],
        input: 'manifest.json\nrenders/final.mp4\n',
      },
    ]);
  });

  test("uses Drive's SHA-256, and downloads to hash when Drive has none", async () => {
    let drive = true;
    const { calls, target } = fake((args) => {
      if (args[0] === 'lsjson') return JSON.stringify({ Path: 'f', Size: 7 });
      if (args.includes('--download')) return `${HASH}  f\n`;
      return drive ? `${HASH}  f\n` : '';
    });
    expect(await target.hash('a/f')).toEqual({ sha256: HASH, bytes: 7 });
    drive = false;
    expect(await target.hash('a/f')).toEqual({ sha256: HASH, bytes: 7 });
    expect(calls.filter((c) => c.args.includes('--download'))).toHaveLength(1);
  });

  test('refuses to move onto an existing folder and reports other errors', async () => {
    const { target } = fake((args) => {
      if (args[0] === 'lsjson') return JSON.stringify({ Path: 'v', Size: 0, IsDir: true });
      return '';
    });
    await expect(target.move('a.partial', 'a')).rejects.toThrow(/already exists/);
    const broken = fake(() => {
      throw new RcloneError('rclone lsjson failed (1): token expired', 1);
    });
    await expect(broken.target.exists('x')).rejects.toThrow(/token expired/);
  });
});
