import { describe, expect, test } from 'vitest';
import { ambienceBeds } from '../scripts/sfx-rules.mjs';

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
});
