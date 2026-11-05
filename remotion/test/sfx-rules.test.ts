import { describe, expect, test } from 'vitest';
import { ambienceBeds, ambienceProblems, wavPeak } from '../scripts/sfx-rules.mjs';

/** A 16-bit mono WAV of `samples` scaled to `peak`, as sfx-lib's writeWav writes it. */
function wav(samples: readonly number[], peak: number): Uint8Array {
  const max = Math.max(...samples.map(Math.abs));
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const ascii = (at: number, text: string) =>
    [...text].forEach((c, i) => (bytes[at + i] = c.charCodeAt(0)));
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 44100, true);
  view.setUint32(28, 88200, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => view.setInt16(44 + i * 2, Math.round((s / max) * peak * 32767), true));
  return bytes;
}

const TONE = Array.from({ length: 400 }, (_, i) => Math.sin(i / 7));

describe('SFX rules', () => {
  test('flags ambience beds and room tone, case-insensitively', () => {
    const files = [
      'amb_lab_loop.wav',
      'AMB_class_soft_loop.wav',
      'room_tone_loop.wav',
      'hiss_room_tone.wav',
    ];
    expect(ambienceBeds(files)).toEqual(files);
  });

  test('keeps event SFX and action loops tied to something on screen', () => {
    const files = [
      'whoosh.wav',
      'boil_loop.wav',
      'machine_hum_loop.wav',
      'freeze_hum_loop.wav',
      'lamb_bleat.wav',
    ];
    expect(ambienceBeds(files)).toEqual([]);
  });

  test('reads the peak of a 16-bit WAV', () => {
    expect(wavPeak(wav(TONE, 0.42))).toBeCloseTo(0.42, 2);
    expect(() => wavPeak(new Uint8Array(10))).toThrow(/not a WAV/);
  });

  test('a kit that allows ambience gets no bed refusals, but a count and a peak limit (D-111)', () => {
    const disk: Record<string, Uint8Array> = {
      'amb_drone_low_loop.wav': wav(TONE, 0.3),
      'amb_loud_loop.wav': wav(TONE, 0.9),
    };
    const read = (f: string) => disk[f]!;
    const files = ['amb_drone_low_loop.wav', 'amb_loud_loop.wav', 'door_creak.wav'];
    expect(ambienceBeds(files, { allowAmbience: true })).toEqual([]);
    expect(ambienceBeds(files)).toEqual(['amb_drone_low_loop.wav', 'amb_loud_loop.wav']);
    const problems = ambienceProblems('sfx', files, read);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/amb_loud_loop\.wav peaks at 0\.90/);
    expect(ambienceProblems('sfx', ['amb_drone_low_loop.wav', 'door_creak.wav'], read)).toEqual([]);
    const four = Array(4).fill('amb_drone_low_loop.wav');
    expect(ambienceProblems('sfx', four, read)).toEqual([
      expect.stringMatching(/4 ambience files; at most 3/),
    ]);
  });
});
