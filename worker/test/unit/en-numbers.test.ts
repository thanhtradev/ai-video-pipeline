import { describe, expect, test } from 'vitest';
import { alignWords, parseWhisperJson, type HeardWord } from '../../src/episode/align.js';
import { englishNumber, spellEnglishNumbers } from '../../src/episode/en-numbers.js';
import { episodeSentences } from '../../src/episode/sentences.js';

// D-092: English episodes align whisper's digits ("2,000") with the spelled-out script words.

describe('englishNumber', () => {
  test.each([
    [0, 'zero'],
    [7, 'seven'],
    [13, 'thirteen'],
    [30, 'thirty'],
    [42, 'forty two'],
    [100, 'one hundred'],
    [128, 'one hundred twenty eight'],
    [2000, 'two thousand'],
    [100_000, 'one hundred thousand'],
    [2_000_000, 'two million'],
    [1_000_000_001, 'one billion one'],
  ])('%d → %s', (n, words) => {
    expect(englishNumber(n).join(' ')).toBe(words);
  });

  test('leaves fractions and huge numbers as digits', () => {
    expect(englishNumber(1.5)).toEqual(['1.5']);
    expect(englishNumber(10 ** 13)).toEqual([String(10 ** 13)]);
  });

  test('spells digit groups with comma thousands', () => {
    expect(spellEnglishNumbers('About 2,000 cells, 63 days')).toBe(
      'About  two thousand  cells,  sixty three  days',
    );
  });
});

describe('English alignment', () => {
  test('whisper digits match the spelled-out script', () => {
    const json = JSON.stringify({
      transcription: [
        { offsets: { from: 0, to: 300 }, text: ' Thirty' },
        { offsets: { from: 300, to: 700 }, text: ' 2,000' },
        { offsets: { from: 700, to: 900 }, text: ' cells.' },
      ],
    });
    const heard = parseWhisperJson(new TextEncoder().encode(json), 'en');
    expect(heard.map((w) => w.key)).toEqual(['thirty', 'two', 'thousand', 'cells']);

    const sentences = episodeSentences([
      { lines: [{ id: 'L001', text: 'Thirty, two thousand cells.' }], shots: [] },
    ]);
    const aligned = alignWords(sentences, heard as HeardWord[], [], 'en');
    expect(aligned[0]!.map((w) => [w.text, w.heard?.start ?? null])).toEqual([
      ['Thirty,', 0],
      ['two', 0.3],
      ['thousand', 0.3],
      ['cells.', 0.7],
    ]);
  });

  test('Vietnamese stays the default', () => {
    const json = JSON.stringify({ transcription: [{ offsets: { from: 0, to: 1 }, text: ' 30' }] });
    expect(parseWhisperJson(new TextEncoder().encode(json)).map((w) => w.key)).toEqual([
      'ba',
      'muoi',
    ]);
  });
});
