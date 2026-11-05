/** The ambience beds among the generated SFX file names that the kit does not allow (sfx-rules.mjs). */
export function ambienceBeds(
  files: readonly string[],
  options?: { allowAmbience?: boolean },
): string[];
export const AMBIENCE_PEAK_MAX: number;
export const AMBIENCE_FILES_MAX: number;
export function ambienceFiles(files: readonly string[]): string[];
export function wavPeak(bytes: Uint8Array): number;
export function ambienceProblems(
  dir: string,
  files: readonly string[],
  read?: (f: string) => Uint8Array,
): string[];
