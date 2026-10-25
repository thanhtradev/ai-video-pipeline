import { describe, expect, test } from 'vitest';
import {
  buildCues,
  MAX_LINE_CHARS,
  MAX_LINES,
  toSrt,
  toVtt,
  type Cue,
} from '../../src/render/subtitles.js';

const LONG =
  'Ánh sáng mặt trời trông có vẻ trắng, nhưng thật ra nó là hỗn hợp của tất cả các màu ' +
  'trong cầu vồng, từ đỏ, cam, vàng cho tới lam và tím. Khi đi vào bầu khí quyển, ánh sáng ' +
  'gặp vô số phân tử khí nhỏ li ti.';

describe('buildCues', () => {
  test('one short sentence becomes one cue spanning the spoken part of its scene', () => {
    const cues = buildCues([
      { narration: 'Bầu trời màu xanh.', startSeconds: 2, speechSeconds: 1.5 },
    ]);
    expect(cues).toEqual([{ start: 2, end: 3.5, lines: ['Bầu trời màu xanh.'] }]);
  });

  test('long narration is split into cues of at most two lines of 42 characters', () => {
    const cues = buildCues([{ narration: LONG, startSeconds: 0, speechSeconds: 12 }]);

    expect(cues.length).toBeGreaterThan(2);
    for (const cue of cues) {
      expect(cue.lines.length).toBeLessThanOrEqual(MAX_LINES);
      for (const line of cue.lines)
        expect(Array.from(line).length).toBeLessThanOrEqual(MAX_LINE_CHARS);
    }
    // No word is lost or reordered.
    expect(cues.flatMap((cue) => cue.lines).join(' ')).toBe(LONG);
    // A sentence end starts a new cue.
    expect(cues.some((cue) => cue.lines[0]!.startsWith('Khi đi vào'))).toBe(true);
  });

  test('timing is contiguous, proportional to text length, and ends with the speech', () => {
    const cues = buildCues([
      { narration: LONG, startSeconds: 4, speechSeconds: 12 },
      { narration: 'Câu cuối.', startSeconds: 16.5, speechSeconds: 1 },
    ]);

    const scene1 = cues.slice(0, -1);
    expect(scene1[0]!.start).toBe(4);
    expect(scene1.at(-1)!.end).toBeCloseTo(16, 3);
    for (let i = 1; i < scene1.length; i += 1) expect(scene1[i]!.start).toBe(scene1[i - 1]!.end);
    expect(cues.at(-1)).toEqual({ start: 16.5, end: 17.5, lines: ['Câu cuối.'] });
  });

  test('keeps Vietnamese text in NFC', () => {
    const decomposed = 'Bầu trời'.normalize('NFD');
    const [cue] = buildCues([{ narration: decomposed, startSeconds: 0, speechSeconds: 1 }]);
    expect(cue!.lines[0]).toBe('Bầu trời'.normalize('NFC'));
  });
});

describe('subtitle files', () => {
  const cues: Cue[] = [
    { start: 0, end: 1.5, lines: ['Xin chào'] },
    { start: 1.5, end: 3723.0456, lines: ['dòng một', 'dòng hai'] },
  ];

  test('SRT uses numbered blocks and comma milliseconds', () => {
    expect(toSrt(cues)).toBe(
      '1\n00:00:00,000 --> 00:00:01,500\nXin chào\n\n' +
        '2\n00:00:01,500 --> 01:02:03,046\ndòng một\ndòng hai\n',
    );
  });

  test('VTT has the header and dot milliseconds', () => {
    expect(toVtt(cues)).toBe(
      'WEBVTT\n\n00:00:00.000 --> 00:00:01.500\nXin chào\n\n' +
        '00:00:01.500 --> 01:02:03.046\ndòng một\ndòng hai\n',
    );
  });
});
