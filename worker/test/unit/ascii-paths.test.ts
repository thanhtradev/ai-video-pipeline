import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

// File and folder names, and the asset paths code points at, are ASCII (CLAUDE.md §1): Vietnamese
// belongs in video content, never in names that shells, URLs, rclone and staticFile() must carry.

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const NON_ASCII = /[^\x20-\x7e]/;
/** A string literal without spaces that ends in a media or data file extension: an asset path. */
const ASSET_LITERAL = /["'`]([^"'`\s]*\.(?:wav|mp3|png|jpg|jpeg|json|mp4|srt|vtt))["'`]/g;

const tracked = () =>
  execFileSync('git', ['ls-files', '-z'], { cwd: REPO, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);

test('every tracked path is ASCII', () => {
  expect(tracked().filter((path) => NON_ASCII.test(path))).toEqual([]);
});

test('asset paths in the Remotion sources are ASCII', () => {
  const offenders = tracked()
    .filter((path) => /^remotion\/.*\.(ts|tsx|json|mjs)$/.test(path))
    .flatMap((path) => {
      const text = readFileSync(`${REPO}${path}`, 'utf8');
      return [...text.matchAll(ASSET_LITERAL)]
        .map((m) => m[1]!)
        .filter((literal) => NON_ASCII.test(literal))
        .map((literal) => `${path}: ${literal}`);
    });
  expect(offenders).toEqual([]);
});
