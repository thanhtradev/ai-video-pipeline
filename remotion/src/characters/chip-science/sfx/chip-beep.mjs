// Chíp's beep (D-084): the one robot beep of the "Chíp Khoa học" cast, chosen by the owner from five
// candidates on 2026-11-02 (candidate 5, a soft two-note FM chime). Every episode plays the same
// file; the narration never says "bíp". Episode SFX scripts import chipBeep() and write it as
// sfx/chip_beep.wav. Run alone: node chip-beep.mjs <output dir> → <output dir>/chip_beep.wav
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buffer, SR, writeWav } from '../../../kits/whatif/sfx/sfx-lib.mjs';

const TAU = Math.PI * 2;
const ATTACK_S = 0.006;
const RELEASE_S = 0.012;
const FM_RATIO = 2;
const FM_INDEX = 1.2;
const FM_DECAY = 30;

export const CHIP_BEEP_FILE = 'chip_beep';

/** One bell-like FM note: soft attack, exponential decay, short release (no click at the end). */
const chime = (dur, freq, decay) => {
  const s = buffer(dur);
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    const phase = (TAU * freq * (i + 1)) / SR; // phase after this sample, as the approved take
    const mod = FM_INDEX * Math.exp(-t * FM_DECAY) * Math.sin(phase * FM_RATIO);
    const gain = Math.min(1, t / ATTACK_S) * Math.min(1, (dur - t) / RELEASE_S);
    s[i] = Math.sin(phase + mod) * gain * Math.exp(-t * decay);
  }
  return s;
};

/** "Bíp bíp": A5 then E6, the second note longer. Deterministic: same samples on every run. */
export const chipBeep = () => {
  const notes = [
    [0, chime(0.12, 880, 16)],
    [0.14, chime(0.18, 1320, 11)],
  ];
  const out = buffer(0.14 + 0.18 + 0.05);
  for (const [at, note] of notes) {
    const offset = Math.floor(at * SR);
    note.forEach((x, i) => (out[offset + i] += x));
  }
  return out;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const outDir = process.argv[2] ?? join(process.cwd(), 'sfx-out');
  writeWav(join(outDir, `${CHIP_BEEP_FILE}.wav`), chipBeep(), 0.5);
}
