// SFX rules the gates enforce on the agent's generated sounds (episode-gates.mjs).
// Continuous ambience beds and room tone are filtered noise heard as hiss under the whole episode,
// so episodes play only event SFX and loops tied to an action on screen (D-069). A kit whose style
// allows ambience (the horror kit, D-111) may play `amb_*` files, few and quiet: the gates then
// check their count and peak instead of refusing them.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const AMBIENCE_BED = /^amb_|room_tone/i;
/** Highest sample an allowed ambience may reach (full scale = 1). */
export const AMBIENCE_PEAK_MAX = 0.5;
/** Ambience files an episode may ship when the kit allows them. */
export const AMBIENCE_FILES_MAX = 3;

/**
 * @param {readonly string[]} files generated SFX file names
 * @param {{ allowAmbience?: boolean }} [options] the kit's sound policy
 * @returns {string[]} the ambience beds that are not allowed
 */
export const ambienceBeds = (files, options = {}) =>
  options.allowAmbience ? [] : files.filter((f) => AMBIENCE_BED.test(f));

/** The `amb_*` files among the generated SFX file names. */
export const ambienceFiles = (files) => files.filter((f) => /^amb_/i.test(f));

/**
 * Peak sample (0…1) of a 16-bit or 32-bit float PCM WAV file (mono or stereo).
 * @param {Uint8Array} bytes
 */
export function wavPeak(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (String.fromCharCode(...bytes.subarray(0, 4)) !== 'RIFF') throw new Error('not a WAV file');
  let offset = 12;
  let format = 1;
  let bits = 16;
  while (offset + 8 <= bytes.length) {
    const id = String.fromCharCode(...bytes.subarray(offset, offset + 4));
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === 'fmt ') {
      format = view.getUint16(body, true);
      bits = view.getUint16(body + 14, true);
    } else if (id === 'data') {
      let peak = 0;
      if (format === 3 && bits === 32) {
        for (let i = body; i + 4 <= body + size; i += 4)
          peak = Math.max(peak, Math.abs(view.getFloat32(i, true)));
      } else if (bits === 16) {
        for (let i = body; i + 2 <= body + size; i += 2)
          peak = Math.max(peak, Math.abs(view.getInt16(i, true)) / 32768);
      } else throw new Error(`unsupported WAV: format ${format}, ${bits} bits`);
      return peak;
    }
    offset = body + size + (size % 2);
  }
  throw new Error('WAV without a data chunk');
}

/**
 * Problems with the allowed ambience files of an episode (empty when fine).
 * @param {string} dir the folder holding the generated WAVs
 * @param {readonly string[]} files generated SFX file names
 * @param {(f: string) => Uint8Array} [read] reads one file (tests inject it)
 * @returns {string[]}
 */
export function ambienceProblems(dir, files, read = (f) => readFileSync(join(dir, f))) {
  const amb = ambienceFiles(files);
  const problems = [];
  if (amb.length > AMBIENCE_FILES_MAX)
    problems.push(
      `${amb.length} ambience files; at most ${AMBIENCE_FILES_MAX} (${amb.join(', ')})`,
    );
  for (const f of amb) {
    const peak = wavPeak(read(f));
    if (peak > AMBIENCE_PEAK_MAX)
      problems.push(
        `${f} peaks at ${peak.toFixed(2)}; an ambience stays under ${AMBIENCE_PEAK_MAX}`,
      );
  }
  return problems;
}
