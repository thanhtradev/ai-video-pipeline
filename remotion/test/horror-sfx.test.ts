import { describe, expect, test } from 'vitest';
import { gen } from '../src/kits/horror/sfx/horror-sfx.mjs';
import { ambienceBeds } from '../scripts/sfx-rules.mjs';

const SR = 44100;
/** Longest event; only the walking loop may be longer than a sting and it is still short. */
const MAX_SECONDS = 6;
const peak = (s: Float32Array) => s.reduce((m, x) => Math.max(m, Math.abs(x)), 0);

describe('horror SFX library (D-106)', () => {
  test('has every sound the kit rules name', () => {
    expect(Object.keys(gen).sort()).toEqual(
      [
        'bell_far',
        'door_creak',
        'floorboard',
        'footsteps_slow_loop',
        'heartbeat_slow',
        'lamp_flicker',
        'sting_low',
        'water_drip',
        'whisper',
        'wind_gust',
      ].sort(),
    );
  });

  test('every sound is short, finite, audible and not an ambience bed (D-069)', () => {
    expect(ambienceBeds(Object.keys(gen).map((n) => `${n}.wav`))).toEqual([]);
    for (const [name, make] of Object.entries(gen)) {
      const s = make();
      expect(s.length / SR, name).toBeLessThanOrEqual(MAX_SECONDS);
      expect(s.length, name).toBeGreaterThan(SR * 0.2);
      expect(
        s.every((x) => Number.isFinite(x)),
        name,
      ).toBe(true);
      expect(peak(s), name).toBeGreaterThan(0.02);
    }
  });

  test('is deterministic', () => {
    expect(gen.whisper!()).toEqual(gen.whisper!());
    expect(gen.door_creak!()).toEqual(gen.door_creak!());
  });
});
