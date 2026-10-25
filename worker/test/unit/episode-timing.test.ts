import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, test } from 'vitest';
import { alignWords, parseWhisperJson, type HeardWord } from '../../src/episode/align.js';
import {
  episodeSentences,
  splitSentences,
  wordKeys,
  type ScriptAct,
} from '../../src/episode/sentences.js';
import { buildTiming, checkCuts, type TimingShot } from '../../src/episode/timing.js';
import { spellNumbers, vietnameseNumber } from '../../src/episode/vi-numbers.js';

describe('vietnameseNumber', () => {
  test.each([
    [0, 'khong'],
    [10, 'muoi'],
    [15, 'muoi lam'],
    [21, 'hai muoi mot'],
    [25, 'hai muoi lam'],
    [28, 'hai muoi tam'],
    [30, 'ba muoi'],
    [81, 'tam muoi mot'],
    [105, 'mot tram linh nam'],
    [120, 'mot tram hai muoi'],
    [1005, 'mot nghin khong tram linh nam'],
    [100_000, 'mot tram nghin'],
    [2_000_000, 'hai trieu'],
  ])('%i → %s', (n, expected) => {
    expect(vietnameseNumber(n).join(' ')).toBe(expected);
  });

  test('spells digit groups with thousands separators', () => {
    expect(wordKeys(spellNumbers('khoảng 100.000 nhịp, 30 giây'))).toEqual(
      'khoang mot tram nghin nhip ba muoi giay'.split(' '),
    );
  });
});

describe('sentences', () => {
  test('split after . ! ? … and :, without audio tags', () => {
    expect(splitSentences('[short pause] [tense] Tiết Toán. Cô gọi tên bạn lên bảng.')).toEqual([
      'Tiết Toán.',
      'Cô gọi tên bạn lên bảng.',
    ]);
    expect(splitSentences('Ba. Hai. Một.')).toEqual(['Ba.', 'Hai.', 'Một.']);
    expect(splitSentences('Bạn bắt đầu thấy… mình lớn nhanh hơn.')).toEqual([
      'Bạn bắt đầu thấy…',
      'mình lớn nhanh hơn.',
    ]);
    expect(splitSentences('Chuyện này là thật: tim bạn đập.')).toEqual([
      'Chuyện này là thật:',
      'tim bạn đập.',
    ]);
    expect(splitSentences('[short pause]')).toEqual([]);
  });

  test('number sentences in speaking order and keep their script line and act', () => {
    const acts: ScriptAct[] = [
      { lines: [{ id: 'L001', text: '[punchy] Một. Hai.' }], shots: [] },
      { lines: [{ id: 'L002', text: 'Ba.' }], shots: [] },
    ];
    expect(episodeSentences(acts)).toEqual([
      { id: 'S001', line: 'L001', act: 1, text: 'Một.' },
      { id: 'S002', line: 'L001', act: 1, text: 'Hai.' },
      { id: 'S003', line: 'L002', act: 2, text: 'Ba.' },
    ]);
  });
});

describe('whisper words', () => {
  test('parse whisper-cli JSON, tolerating invalid UTF-8 and spelling digits', () => {
    const json = JSON.stringify({
      transcription: [
        { offsets: { from: 0, to: 30 }, text: '', tokens: [{ text: '[_BEG_]' }] },
        { offsets: { from: 30, to: 180 }, text: ' Nếu', tokens: [{ text: '@@' }] },
        { offsets: { from: 180, to: 400 }, text: ' 30,' },
      ],
    });
    // whisper splits tokens inside multi-byte characters: '@@' becomes half of "ế".
    const raw = Buffer.from(json);
    const at = raw.indexOf('@@');
    const bytes = Buffer.concat([
      raw.subarray(0, at),
      Buffer.from([0xe1, 0xba]),
      raw.subarray(at + 2),
    ]);

    expect(parseWhisperJson(new Uint8Array(bytes))).toEqual([
      { key: 'neu', start: 0.03, end: 0.18 },
      { key: 'ba', start: 0.18, end: 0.4 },
      { key: 'muoi', start: 0.18, end: 0.4 },
    ]);
  });

  test('align the known words with what whisper heard', () => {
    const sentences = episodeSentences([
      { lines: [{ id: 'L001', text: 'Một hai. Ba bốn.' }], shots: [] },
    ]);
    const heard: HeardWord[] = [
      { key: 'mot', start: 0.5, end: 0.9 },
      { key: 'hai', start: 0.9, end: 1.5 },
      { key: 'bon', start: 2.5, end: 3 },
    ];
    const aligned = alignWords(sentences, heard);
    expect(aligned.map((s) => s.map((w) => [w.text, w.heard?.start ?? null]))).toEqual([
      [
        ['Một', 0.5],
        ['hai.', 0.9],
      ],
      [
        ['Ba', null],
        ['bốn.', 2.5],
      ],
    ]);
  });
});

/** dB per 10 ms: -20 where voiced, -80 elsewhere. */
function envelopeOf(totalSeconds: number, voiced: [number, number][]): number[] {
  return Array.from({ length: Math.round(totalSeconds * 100) }, (_, k) =>
    voiced.some(([a, b]) => k >= a * 100 && k < b * 100) ? -20 : -80,
  );
}

describe('buildTiming', () => {
  // Three sentences: a clear pause after the first, a 0.1 s pause after the second.
  const acts: ScriptAct[] = [
    {
      lines: [
        { id: 'L001', text: 'Một hai.' },
        { id: 'L002', text: 'Ba bốn năm. Sáu.' },
      ],
      shots: [],
    },
  ];
  const sentences = episodeSentences(acts);
  const heard: HeardWord[] = [
    ['mot', 0.5, 0.9],
    ['hai', 0.9, 1.5],
    ['ba', 2.1, 2.5],
    ['bon', 2.5, 3.0],
    ['nam', 3.0, 3.5],
    ['sau', 3.6, 4.2],
  ].map(([key, start, end]) => ({
    key: key as string,
    start: start as number,
    end: end as number,
  }));
  const db = envelopeOf(5, [
    [0.5, 1.5],
    [2.1, 3.5],
    [3.6, 4.2],
  ]);
  const shots: TimingShot[] = [
    { id: '1.1', act: 1, moc: 'Một hai' },
    { id: '1.2', act: 1, moc: 'Ba bốn', hold_seconds: 1 },
    { id: '1.3', act: 1, moc: 'Sáu' },
  ];
  const run = (overrides: Partial<Parameters<typeof buildTiming>[0]> = {}) =>
    buildTiming({
      sentences,
      words: alignWords(sentences, heard),
      shots,
      db,
      voice: 'voice.wav',
      ...overrides,
    });

  test('cuts each sentence at the real silences around it', () => {
    const { timing } = run();
    expect(timing.lines.map((l) => [l.id, l.line, l.src])).toEqual([
      ['S001', 'L001', [13, 48]],
      ['S002', 'L002', [61, 106]],
      ['S003', 'L002', [106, 129]],
    ]);
    expect(timing.lines.every((l) => !l.joinNext)).toBe(true);
    expect(checkCuts(timing, db)).toEqual([]);
  });

  test('places sentences with bounded gaps and the shot hold after its last sentence', () => {
    const { timing } = run();
    expect(timing.lines.map((l) => [l.from, l.to, l.gap, l.hold, l.holdFrom, l.holdTo])).toEqual([
      [3, 38, 0.2, 0, 44, 44],
      [44, 89, 0.133, 1, 93, 123],
      [123, 146, 0, 0, 146, 146],
    ]);
    expect(timing).toMatchObject({
      fps: 30,
      endCardFrom: 146,
      totalFrames: 191,
      voice: 'voice.wav',
    });
  });

  test('starts shots on their MỐC sentence and spans acts', () => {
    const { timing } = run();
    expect(timing.shots.map((s) => [s.id, s.firstLine, s.lastLine, s.from, s.to])).toEqual([
      ['1.1', 'S001', 'S001', 0, 42],
      ['1.2', 'S002', 'S002', 42, 121],
      ['1.3', 'S003', 'S003', 121, 191],
    ]);
    expect(timing.acts).toEqual([{ act: 1, from: 0, to: 191 }]);
  });

  test('gives every word increasing frames and a caption', () => {
    const { timing, captions } = run();
    const frames = timing.lines.flatMap((l) => l.words.map((w) => w[2]));
    expect(frames).toEqual([...frames].sort((a, b) => a - b));
    expect(timing.lines[1]!.words.map((w) => w[1])).toEqual(['ba', 'bon', 'nam']);
    expect(captions.captions).toHaveLength(6);
    expect(captions.captions[0]).toMatchObject({ line: 'S001', text: 'Một', confidence: 1 });
  });

  test('keeps only the minimum gap inside fast shots', () => {
    // The 0.6 s pause after S001 normally becomes 0.38 s; in a fast shot only the 0.15 s minimum,
    // which the cut's own lead-in and tail already cover.
    const fast = shots.map((s) => (s.id === '1.1' ? { ...s, fast: true } : s));
    expect(run().timing.lines[0]!.gap).toBe(0.2);
    expect(run({ shots: fast }).timing.lines[0]!.gap).toBe(0);
  });

  test('fails when a MỐC is not spoken', () => {
    expect(() => run({ shots: [{ id: '1.1', act: 1, moc: 'Bảy tám' }] })).toThrow(
      /shot 1.1: MỐC "Bảy tám" not found/,
    );
  });

  test('checkCuts reports a cut that lands in speech', () => {
    const { timing } = run();
    const moved = {
      ...timing,
      lines: timing.lines.map((l, i) =>
        i === 0 ? { ...l, src: [13, 40] as [number, number] } : l,
      ),
    };
    expect(checkCuts(moved, db)).toEqual([expect.stringMatching(/^S001 start .* end \+60\.0 dB/)]);
  });
});

describe('EP5 regression (reference episode)', () => {
  const fixture = JSON.parse(
    gunzipSync(readFileSync(new URL('../fixtures/ep5-timing.json.gz', import.meta.url))).toString(),
  ) as {
    acts: ScriptAct[];
    heard: [string, number, number][];
    db: number[];
    reference: { totalSec: number; src: [number, number][] };
  };

  test('matches the hand-built reference timeline with no cut in speech', () => {
    const sentences = episodeSentences(fixture.acts);
    const heard = fixture.heard.map(([key, start, end]) => ({ key, start, end }));
    const shots = fixture.acts.flatMap((act, a) => act.shots.map((s) => ({ ...s, act: a + 1 })));
    const { timing } = buildTiming({
      sentences,
      words: alignWords(sentences, heard),
      shots,
      db: fixture.db,
      voice: 'voice.wav',
    });

    expect(timing.lines).toHaveLength(fixture.reference.src.length);
    const close = timing.lines.filter((line, i) => {
      const [a, b] = fixture.reference.src[i]!;
      return Math.abs(line.src[0] - a) <= 3 && Math.abs(line.src[1] - b) <= 3;
    });
    expect(close.length).toBeGreaterThanOrEqual(235);
    expect(checkCuts(timing, fixture.db)).toEqual([]);
    expect(Math.abs(timing.totalSec - fixture.reference.totalSec)).toBeLessThan(4);
  });
});
