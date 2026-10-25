import { useCurrentFrame } from 'remotion';
import TIMING_VI from './data/timing.json';
import TIMING_EN from './data/timing.en.json';

/**
 * EP1 timeline queries. EVERY time comes from the voice (scripts/tiktok2/ep1/build_timing.py → data/timing.json) – NEVER type seconds in a scene.
 * at("L57","thương") = absolute frame when that word is spoken.
 */
export const FPS = 30;
/** The ONLY seconds → frames conversion. */
export const sec2f = (s: number) => Math.round(s * FPS);

export type Line = (typeof TIMING_VI.lines)[number];
export type Shot = (typeof TIMING_VI.shots)[number];

/**
 * Timeline language: "vi" (default, Tiktok2Ep1) · "en" (Tiktok2Ep1En – English voice, data/timing.en.json).
 * Same sentence ids L001…L270 and shot ids; at(sentence, Vietnamese word) in "en" looks up the precomputed anchors (data/anchors.en.json).
 * The composition calls setLang() at render start; every export below is a live binding and follows it.
 */
export type Lang = 'vi' | 'en';
type Timing = typeof TIMING_VI & { lang?: string; anchors?: Record<string, number[]> };
const BOOK: Record<Lang, Timing> = { vi: TIMING_VI, en: TIMING_EN as unknown as Timing };
export const totalOf = (l: Lang) => BOOK[l].totalFrames;
export const shotsOf = (l: Lang): readonly Shot[] => BOOK[l].shots;

export let LANG: Lang = 'vi';
export let TIMING: Timing = BOOK.vi;
export let LINES: readonly Line[] = TIMING.lines;
export let SHOTS: readonly Shot[] = TIMING.shots;
export let TOTAL = TIMING.totalFrames;
export let END_CARD_FROM = TIMING.endCardFrom;
export let VOICE = TIMING.voice;
let BY_ID = new Map(LINES.map((l) => [l.id, l]));
const listeners: (() => void)[] = [];
/** Registers cache invalidation for timeline-dependent data on language change. */
export const onLang = (fn: () => void) => listeners.push(fn);
export const setLang = (l: Lang) => {
  if (l === LANG) return;
  LANG = l;
  TIMING = BOOK[l];
  LINES = TIMING.lines;
  SHOTS = TIMING.shots;
  TOTAL = TIMING.totalFrames;
  END_CARD_FROM = TIMING.endCardFrom;
  VOICE = TIMING.voice;
  BY_ID = new Map(LINES.map((x) => [x.id, x]));
  for (const fn of listeners) fn();
};
/** On-screen text for the current language. */
export const tr = <T>(vi: T, en: T): T => (LANG === 'en' ? en : vi);

const strip = (s: string) =>
  s
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

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
  if (TIMING.anchors) {
    const k = TIMING.anchors[`${id}|${word}|${nth}`];
    if (!k) throw new Error(`Thiếu mốc ${id}|${word}|${nth} trong data/anchors.${LANG}.json`);
    return edge === 'start' ? k[0] : k[1];
  }
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
