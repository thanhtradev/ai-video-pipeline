import { describe, expect, test } from 'vitest';
import { chipBeep, CHIP_BEEP_FILE } from '../src/characters/chip-science/sfx/chip-beep.mjs';

const SR = 44100;
const peak = (s: Float32Array) => s.reduce((m, x) => Math.max(m, Math.abs(x)), 0);

describe("Chíp's beep (D-084)", () => {
  test('is the shared two-note chime, about 0.37 s long', () => {
    const s = chipBeep();
    expect(s.length / SR).toBeCloseTo(0.37, 2);
    expect(peak(s)).toBeGreaterThan(0.1);
    expect(CHIP_BEEP_FILE).toBe('chip_beep');
  });

  test('is deterministic, so every episode plays the same sound', () => {
    expect(chipBeep()).toEqual(chipBeep());
  });

  test('starts and ends silent (no click)', () => {
    const s = chipBeep();
    expect(Math.abs(s[0]!)).toBeLessThan(1e-3);
    expect(peak(s.subarray(s.length - 100))).toBeLessThan(1e-3);
  });
});
