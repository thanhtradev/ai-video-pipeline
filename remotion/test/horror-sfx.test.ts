import { describe, expect, test } from 'vitest';
import { AMB_PEAK, gen } from '../src/kits/horror/sfx/horror-sfx.mjs';
import { ambienceBeds } from '../scripts/sfx-rules.mjs';

const SR = 44100;
/** Longest event; loops (walking, ambience) stay short too and loop seamlessly. */
const MAX_SECONDS = 9;
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
        'flipflops_slow_loop',
        'breath_near',
        'knock_three',
        'static_burst',
        'tv_hiss_short',
        'amb_drone_low_loop',
        'amb_wind_far_loop',
        'amb_insects_loop',
      ].sort(),
    );
  });

  test('only the three quiet ambiences are ambience beds; the horror kit allows them (D-111)', () => {
    const files = Object.keys(gen).map((n) => `${n}.wav`);
    expect(ambienceBeds(files).sort()).toEqual([
      'amb_drone_low_loop.wav',
      'amb_insects_loop.wav',
      'amb_wind_far_loop.wav',
    ]);
    expect(ambienceBeds(files, { allowAmbience: true })).toEqual([]);
    for (const name of ['amb_drone_low_loop', 'amb_wind_far_loop', 'amb_insects_loop']) {
      expect(peak(gen[name]!()), name).toBeLessThanOrEqual(AMB_PEAK + 1e-6);
    }
  });

  test('every sound is short, finite and audible', () => {
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
