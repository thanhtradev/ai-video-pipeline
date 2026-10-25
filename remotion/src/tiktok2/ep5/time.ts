import { useCurrentFrame } from 'remotion';
import TIMING from './data/timing.json';

/**
 * EP5 timeline queries. EVERY time comes from the voice (python3 scripts/tiktok2/ep1/build_timing.py ep5 → data/timing.json) – NEVER type seconds in a scene.
 * at("L57","thương") = absolute frame when that word is spoken.
 */
export const FPS = 30;
/** The ONLY seconds → frames conversion. */
export const sec2f = (s: number) => Math.round(s * FPS);

export type Line = (typeof TIMING.lines)[number];
export type Shot = (typeof TIMING.shots)[number];
export const LINES: readonly Line[] = TIMING.lines;
export const SHOTS: readonly Shot[] = TIMING.shots;
export const TOTAL = TIMING.totalFrames;
export const END_CARD_FROM = TIMING.endCardFrom;
export const VOICE = TIMING.voice;
export { TIMING };

const strip = (s: string) =>
  s
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const BY_ID = new Map(LINES.map((l) => [l.id, l]));
export const line = (id: string) => {
  const l = BY_ID.get(id);
  if (!l) throw new Error(`Không có câu ${id}`);
  return l;
};
/** Absolute frame of the start / end of a sentence. */
export const L = (id: string) => line(id).from;
export const Lend = (id: string) => line(id).to;
/** Absolute frame when a word/phrase in the sentence is spoken (accent-insensitive match). */
export const at = (id: string, word: string, nth = 1, edge: 'start' | 'end' = 'start') => {
  const l = line(id);
  const target = strip(word).split(' ');
  const ws = l.words.map((w) => w[1] as string);
  let seen = 0;
  for (let i = 0; i + target.length <= ws.length; i++) {
    if (target.every((t, k) => ws[i + k] === t) && ++seen === nth)
      return edge === 'start'
        ? (l.words[i][2] as number)
        : (l.words[i + target.length - 1][3] as number);
  }
  throw new Error(`Không thấy "${word}" trong ${id}`);
};
export const shot = (id: string) => {
  const s = SHOTS.find((x) => x.id === id);
  if (!s) throw new Error(`Không có shot ${id}`);
  return s;
};
/** Sentence being spoken at an absolute frame (null in silence / holds). */
export const speakingAt = (abs: number) => LINES.find((l) => abs >= l.from && abs < l.to) ?? null;
export const actAt = (abs: number) =>
  TIMING.acts.find((a) => abs >= a.from && abs < a.to)?.act ?? 9;

/** Local times of a shot (usable outside React – for audio cues). */
export const shotHelpers = (id: string) => {
  const s = shot(id);
  return {
    id,
    dur: s.to - s.from,
    from: s.from,
    L: (lid: string) => L(lid) - s.from,
    E: (lid: string) => Lend(lid) - s.from,
    at: (lid: string, w: string, nth = 1, edge: 'start' | 'end' = 'start') =>
      at(lid, w, nth, edge) - s.from,
    /** local frame where the hold after the sentence starts / ends */
    H: (lid: string) => line(lid).holdFrom - s.from,
    HE: (lid: string) => line(lid).holdTo - s.from,
  };
};
export type ShotH = ReturnType<typeof shotHelpers>;
/** Inside a shot: local frame + local times. */
export const useShot = (id: string) => {
  const f = useCurrentFrame();
  const h = shotHelpers(id);
  return { ...h, f, abs: h.from + f };
};
