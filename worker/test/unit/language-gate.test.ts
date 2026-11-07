import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { describeFailures, type GateReport } from '../../src/episode/gates.js';
import {
  stripComments,
  vietnameseLines,
  withLanguageGate,
} from '../../src/episode/language-gate.js';
import { hasVietnameseLetters } from '../../src/episode/language.js';

const PASSED: GateReport = { ok: true, typecheck: { ok: true, output: '' } };

async function workspace(files: Record<string, string>): Promise<string> {
  const ws = await mkdtemp(join(tmpdir(), 'lang-gate-'));
  for (const [path, text] of Object.entries(files)) {
    await mkdir(join(ws, path, '..'), { recursive: true });
    await writeFile(join(ws, path), text);
  }
  return ws;
}

describe('Vietnamese letters', () => {
  test('flags Vietnamese, not accented English', () => {
    expect(hasVietnameseLetters('Một chữ nếu')).toBe(true);
    expect(hasVietnameseLetters('ĐÃ XONG')).toBe(true);
    expect(hasVietnameseLetters('A café in a naïve town, Pokémon')).toBe(false);
    expect(hasVietnameseLetters('Xin chào')).toBe(true);
    expect(hasVietnameseLetters('What if… you could fly?')).toBe(false);
  });
});

describe('language gate (D-092)', () => {
  test('finds Vietnamese text in the episode code, ignoring comments', async () => {
    const ws = await workspace({
      'src/episode/shots/act1.tsx': [
        '// Cảnh 1: phòng khách (a comment)',
        'const a = <BigText lines={["WHAT IF"]} />;',
        '/* Ghi chú\n nhiều dòng */',
        "const b = 'Nếu bạn';",
        'const url = "https://example.com"; // ok',
      ].join('\n'),
      'src/episode/kit.tsx': '<text>Xin chào</text>',
      'src/time.ts': "throw new Error('không phải của agent');",
    });
    expect(await vietnameseLines(ws)).toEqual([
      { file: 'src/episode/kit.tsx', line: 1, text: '<text>Xin chào</text>' },
      { file: 'src/episode/shots/act1.tsx', line: 5, text: "const b = 'Nếu bạn';" },
    ]);
  });

  test('fails the gates of an English episode and tells the agent where', async () => {
    const ws = await workspace({ 'src/episode/Episode.tsx': "const t = 'Mẹ ơi';" });
    const report = await withLanguageGate(PASSED, ws, 'en');
    expect(report.ok).toBe(false);
    expect(describeFailures(report).join('\n')).toMatch(
      /English episode.*\n- src\/episode\/Episode.tsx:1 const t = 'Mẹ ơi';/,
    );
  });

  test('leaves Vietnamese episodes and clean English ones alone', async () => {
    const vi = await workspace({ 'src/episode/Episode.tsx': "const t = 'Mẹ ơi';" });
    expect(await withLanguageGate(PASSED, vi, 'vi')).toBe(PASSED);
    const en = await workspace({ 'src/episode/Episode.tsx': "const t = 'Mom!';" });
    expect((await withLanguageGate(PASSED, en, 'en')).ok).toBe(true);
  });

  test('keeps the draft mark of a gate report (D-114)', async () => {
    const en = await workspace({ 'src/episode/Episode.tsx': "const t = 'Mom!';" });
    const report = await withLanguageGate({ ...PASSED, mixDeferred: true }, en, 'en');
    expect(report.mixDeferred).toBe(true);
  });

  test('keeps URLs while stripping line comments', () => {
    expect(stripComments('a("https://x.y") // note')).toBe('a("https://x.y") ');
  });
});
