import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { MUSIC_STYLES, type MusicStyle } from '../../../remotion/src/props.js';
import { resolveInside } from '../storage/workspace.js';

// Shared royalty-free music library (D-021; ~/MediaLibrary/music, its README.md): catalog.json
// lists every track with its license and the exact credit to publish. Only listed tracks are used.

/** Loudness the bed is brought to before the final mix is normalized; ~15-20 dB under the voice. */
export const MUSIC_BED_LUFS = -30;
const DEFAULT_VOLUME = 0.15;
const MIN_VOLUME = 0.02;

const trackSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  style: z.enum(MUSIC_STYLES),
  file: z.string().min(1),
  title: z.string().min(1),
  artist: z.string().min(1),
  source_url: z.url(),
  license: z.string().min(1),
  license_url: z.url(),
  credit: z.string().min(1),
  duration_seconds: z.number().positive(),
  loudness_lufs: z.number().nullable(),
});

const catalogSchema = z.object({ tracks: z.array(trackSchema) });

export type MusicTrack = z.infer<typeof trackSchema>;

export interface MusicChoice {
  track: MusicTrack;
  path: string;
  /** Linear gain for the bed, from the track's measured loudness. */
  volume: number;
}

export interface MusicLibrary {
  pick(style: MusicStyle, seed: string): Promise<MusicChoice | null>;
}

export function bedVolume(loudnessLufs: number | null): number {
  if (loudnessLufs === null) return DEFAULT_VOLUME;
  const gain = 10 ** ((MUSIC_BED_LUFS - loudnessLufs) / 20);
  return Math.round(Math.min(1, Math.max(MIN_VOLUME, gain)) * 1000) / 1000;
}

/** Reads catalog.json on every pick so tracks added to the library need no worker restart. */
export function createMusicLibrary(root: string): MusicLibrary {
  return {
    async pick(style, seed) {
      const catalog = catalogSchema.parse(
        JSON.parse(await readFile(join(root, 'catalog.json'), 'utf8')),
      );
      const candidates = catalog.tracks
        .filter((track) => track.style === style)
        .sort((a, b) => a.id.localeCompare(b.id));
      if (candidates.length === 0) return null;
      // Same video, same track: the choice depends only on the seed.
      const digest = createHash('sha256').update(seed).digest();
      const track = candidates[digest.readUInt32BE(0) % candidates.length]!;
      return {
        track,
        path: await resolveInside(root, track.file),
        volume: bedVolume(track.loudness_lufs),
      };
    },
  };
}
