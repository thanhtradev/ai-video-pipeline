import type { SpokenWord } from './align.js';
import { wordKeys, type Sentence } from './sentences.js';

// Episode timeline from the narration (port of the reference scripts/tiktok2/ep1/build_timing.py and
// check_cuts.py, docs/episode-pipeline.md §5). The reference took rough sentence times from the TTS
// service's SRT; here they come from whisper's aligned word times. Both are refined the same way:
// each cut moves to the real silence nearest the rough boundary, measured on a 10 ms dB envelope.
// Output keeps the reference timing.json / captions.json shapes so the kit's time.ts reads them.

export const FPS = 30;
/** Envelope resolution: one dB value per 10 ms. */
const STEPS_PER_SECOND = 100;
const FLOOR_PERCENTILE = 0.12;
/** Below this the signal is exact zeros, not room noise. */
const DIGITAL_SILENCE_DB = -100;
/** Noisier than any usable recording room (EP5: -65 dB). */
const FLOOR_CEILING_DB = -60;
/** "Voiced" = this many dB above the noise floor (reference thrAbove), never below -52 dB. */
const VOICED_ABOVE_FLOOR_DB = 14;
const VOICED_MIN_DB = -52;
/** Search for a silence this far around a rough sentence boundary (seconds). */
const BOUNDARY_WINDOW = 0.35;
const MIN_SILENCE_STEPS = 6;
/** Silences this far around a rough boundary may be chosen (whisper times are coarse). */
const SILENCE_WINDOW = 2;
/** Cost of cutting without a silence: preferred only when no silence fits. */
const JOIN_COST = 0.6;
/** A silence shorter than this cannot take a cut with its lead-in and tail (seconds). */
const MIN_CUT_SILENCE = 0.2;
/** Cost per second of a sentence's length away from its expected length. */
const DURATION_WEIGHT = 2;
/** Shortest sentence the boundaries may leave (seconds). */
const MIN_SENTENCE = 0.15;
const LEAD_IN = 0.06;
const TAIL = 0.09;
const MIN_GAP = 0.15;
const MAX_GAP = 0.38;
const END_CARD = 1.5;
const FIRST_FRAME = 3;
/** A cut louder than this above the floor is in speech (reference check_cuts.py). */
const CUT_LIMIT_DB = 20;

export interface TimingShot {
  id: string;
  act: number;
  moc: string;
  hold_seconds?: number | undefined;
  fast?: boolean | undefined;
}

export interface TimingInput {
  sentences: readonly Sentence[];
  words: readonly (readonly SpokenWord[])[];
  shots: readonly TimingShot[];
  /** dB per 10 ms of the voice file. */
  db: readonly number[];
  /** Voice file name as the composition loads it (staticFile). */
  voice: string;
}

const sec2f = (seconds: number): number => Math.round(seconds * FPS);
const round3 = (value: number): number => Math.round(value * 1000) / 1000;

/** dB per 10 ms of 16-bit mono PCM (reference envelope()). */
export function envelope(samples: Int16Array, sampleRate: number): number[] {
  const hop = Math.floor(sampleRate / STEPS_PER_SECOND);
  const db: number[] = [];
  for (let i = 0; i + hop < samples.length; i += hop) {
    let sum = 0;
    for (let k = i; k < i + hop; k++) sum += samples[k]! * samples[k]!;
    db.push(20 * Math.log10(Math.sqrt(sum / hop) / 32768 + 1e-9));
  }
  return db;
}

/**
 * Room-noise level: a low percentile of the envelope, ignoring digital silence (the padding between
 * act clips, or a TTS voice with exact zeros), which would put the floor at -180 dB and make every
 * cut look loud. A voice with no room noise at all gets FLOOR_CEILING_DB instead of its own level.
 */
export function noiseFloor(db: readonly number[]): number {
  const sound = db.filter((v) => v > DIGITAL_SILENCE_DB).sort((x, y) => x - y);
  const percentile = sound[Math.floor(sound.length * FLOOR_PERCENTILE)] ?? DIGITAL_SILENCE_DB;
  return Math.min(percentile, FLOOR_CEILING_DB);
}

interface Span {
  start: number;
  end: number;
}

/** Rough sentence spans from whisper; unmatched sentences are interpolated by text length. */
function roughSpans(sentences: readonly Sentence[], words: TimingInput['words']): Span[] {
  const heard = words.map((sentence) => sentence.flatMap((w) => (w.heard ? [w.heard] : [])));
  const known: (Span | null)[] = heard.map((list) =>
    list.length > 0 ? { start: list[0]!.start, end: list.at(-1)!.end } : null,
  );
  return known.map((span, i) => {
    if (span) return span;
    const prev = known.slice(0, i).findLastIndex(Boolean);
    const next = known.findIndex((s, k) => k > i && s !== null);
    const from = prev >= 0 ? known[prev]!.end : 0;
    const to = next >= 0 ? known[next]!.start : from + sentences[i]!.text.length / 15;
    const chars = (k: number) => sentences[k]!.text.length;
    const lo = prev + 1;
    const hi = next >= 0 ? next : sentences.length;
    const total = sentences.slice(lo, hi).reduce((sum, _, k) => sum + chars(lo + k), 0);
    const before = sentences.slice(lo, i).reduce((sum, _, k) => sum + chars(lo + k), 0);
    return {
      start: from + ((to - from) * before) / total,
      end: from + ((to - from) * (before + chars(i))) / total,
    };
  });
}

interface Cut {
  onset: number;
  offset: number;
  /** Read in one breath with the next sentence: cut at the quietest point, no gap or hold. */
  joinNext: number | null;
  /** A pause too short for padding: both sentences meet at its quietest point (seconds). */
  meet: number | null;
}

interface Boundary {
  /** End of the earlier sentence's speech and start of the next one (seconds). */
  start: number;
  end: number;
  /** silence: cut with padding; tight: a short pause, cut exactly at its quietest step;
   * join: no pause at all, read in one breath. */
  kind: 'silence' | 'tight' | 'join';
  cost: number;
}

function silencesIn(db: readonly number[], voiced: (k: number) => boolean): Span[] {
  const out: Span[] = [];
  let start: number | null = null;
  for (let k = 0; k <= db.length; k++) {
    if (k < db.length && !voiced(k)) {
      start ??= k;
    } else {
      if (start !== null && k - start >= MIN_SILENCE_STEPS) out.push({ start, end: k });
      start = null;
    }
  }
  return out.map((s) => ({ start: s.start / STEPS_PER_SECOND, end: s.end / STEPS_PER_SECOND }));
}

/** Loudest dB within ±20 ms of a video frame: what a cut at that frame lets through. */
function frameLevel(db: readonly number[], frame: number): number {
  const k = Math.floor((frame / FPS) * STEPS_PER_SECOND);
  return Math.max(...db.slice(Math.max(0, k - 2), k + 2));
}

/** Time (seconds) of the quietest 10 ms step in [from, to). */
function quietest(db: readonly number[], from: number, to: number): number {
  const first = Math.max(0, Math.floor(from * STEPS_PER_SECOND));
  const last = Math.min(db.length, Math.ceil(to * STEPS_PER_SECOND));
  let k = first;
  for (let j = first; j < last; j++) if (db[j]! < db[k]!) k = j;
  return k / STEPS_PER_SECOND;
}

/** Silences that could separate sentences i and i+1, plus a one-breath cut, with their costs. */
function boundaryCandidates(
  rough: { end: number; start: number },
  silences: readonly Span[],
  db: readonly number[],
  cutLimit: number,
): Boundary[] {
  const mid = (rough.end + rough.start) / 2;
  const lo = Math.min(rough.end, rough.start);
  const hi = Math.max(rough.end, rough.start);
  // Silences are kept whole: whisper often gives a pause to a neighbouring word, so clipping a
  // silence at the window would leave part of the pause in a sentence.
  // A pause too short for the lead-in and tail (they would reach into the words) is cut exactly at
  // its quietest step instead; gaps and holds are still inserted there.
  const options: Boundary[] = silences
    .filter((s) => s.end > lo - SILENCE_WINDOW && s.start < hi + SILENCE_WINDOW)
    .map((s) => {
      const cost = Math.abs((s.start + s.end) / 2 - mid) - 0.5 * (s.end - s.start);
      if (s.end - s.start >= MIN_CUT_SILENCE) return { ...s, kind: 'silence' as const, cost };
      let frame = Math.floor(s.start * FPS);
      for (let f = frame; f <= Math.ceil(s.end * FPS); f++) {
        if (frameLevel(db, f) < frameLevel(db, frame)) frame = f;
      }
      const at = frame / FPS;
      const kind = frameLevel(db, frame) <= cutLimit ? ('tight' as const) : ('join' as const);
      return { start: at, end: at + 1 / STEPS_PER_SECOND, kind, cost };
    });
  const at = quietest(db, lo - BOUNDARY_WINDOW, hi + BOUNDARY_WINDOW);
  return [
    ...options,
    {
      start: at,
      end: at + 1 / STEPS_PER_SECOND,
      kind: 'join',
      cost: Math.abs(at - mid) + JOIN_COST,
    },
  ];
}

/**
 * Sentence boundaries, chosen together: in order, one per pair of sentences, each sentence at least
 * MIN_SENTENCE long, at the lowest total cost (dynamic programming over the candidates). Besides
 * each boundary's own cost, a sentence whose length is far from its expected length (its words at
 * the voice's speaking rate) costs DURATION_WEIGHT per second: this keeps a run of short sentences
 * from sliding one pause early when whisper's times are coarse.
 */
function chooseBoundaries(
  options: readonly Boundary[][],
  expected: readonly number[],
  onset: number,
  offset: number,
): Boundary[] {
  const misfit = (i: number, from: number, to: number) =>
    DURATION_WEIGHT * Math.abs(to - from - expected[i]!);
  const best: { cost: number; prev: number }[][] = [];
  options.forEach((list, i) => {
    best.push(
      list.map((option) => {
        const own =
          option.cost + (i + 1 === options.length ? misfit(i + 1, option.end, offset) : 0);
        if (i === 0) return { cost: own + misfit(0, onset, option.start), prev: -1 };
        let choice = { cost: Infinity, prev: -1 };
        best[i - 1]!.forEach((entry, p) => {
          const before = options[i - 1]![p]!;
          if (option.start - before.end < MIN_SENTENCE) return;
          const cost = entry.cost + own + misfit(i, before.end, option.start);
          if (cost < choice.cost) choice = { cost, prev: p };
        });
        return choice;
      }),
    );
  });
  const last = best.at(-1)!;
  let index = last.reduce((b, entry, k) => (entry.cost < last[b]!.cost ? k : b), 0);
  if (!Number.isFinite(last[index]!.cost)) {
    throw new Error('no ordered set of sentence boundaries fits the narration');
  }
  const chosen: Boundary[] = [];
  for (let i = options.length - 1; i >= 0; i--) {
    chosen.unshift(options[i]![index]!);
    index = best[i]![index]!.prev;
  }
  return chosen;
}

/** Seconds of speech per word: voiced time without pauses, over the words of the script. */
function secondsPerWord(
  sentences: readonly Sentence[],
  silences: readonly Span[],
  onset: number,
  offset: number,
): number {
  const pauses = silences
    .filter((s) => s.end - s.start >= MIN_CUT_SILENCE && s.start >= onset && s.end <= offset)
    .reduce((sum, s) => sum + s.end - s.start, 0);
  const words = sentences.reduce((sum, s) => sum + wordKeys(s.text).length, 0);
  return Math.max(offset - onset - pauses, 0) / Math.max(words, 1);
}

function findCuts(
  sentences: readonly Sentence[],
  spans: readonly Span[],
  db: readonly number[],
  threshold: number,
  cutLimit: number,
): Cut[] {
  const voiced = (k: number) => k >= 0 && k < db.length && db[k]! > threshold;
  const onset =
    Math.max(
      db.findIndex((_, k) => voiced(k) && voiced(k + 1)),
      0,
    ) / STEPS_PER_SECOND;
  const offset = (db.findLastIndex((_, k) => voiced(k)) + 1) / STEPS_PER_SECOND;
  const silences = silencesIn(db, voiced);
  const rate = secondsPerWord(sentences, silences, onset, offset);
  const expected = sentences.map((s) => wordKeys(s.text).length * rate);
  const boundaries =
    spans.length > 1
      ? chooseBoundaries(
          spans
            .slice(1)
            .map((span, i) =>
              boundaryCandidates({ end: spans[i]!.end, start: span.start }, silences, db, cutLimit),
            ),
          expected,
          onset,
          offset,
        )
      : [];
  return spans.map((_, i) => ({
    onset: i === 0 ? onset : boundaries[i - 1]!.end,
    offset: i + 1 < spans.length ? boundaries[i]!.start : offset,
    joinNext: boundaries[i]?.kind === 'join' ? boundaries[i]!.start : null,
    meet: boundaries[i]?.kind === 'tight' ? boundaries[i]!.start : null,
  }));
}

/** Source frames [trimBefore, trimAfter] of each sentence in the voice file. */
function sourceFrames(cuts: readonly Cut[]): [number, number][] {
  const n = cuts.length;
  const frames = cuts.map((cut, i): [number, number] => {
    let a = cut.onset - LEAD_IN;
    let b = cut.offset + TAIL;
    if (i > 0) a = Math.max(a, cuts[i - 1]!.offset + 0.02);
    if (i + 1 < n) b = Math.min(b, cuts[i + 1]!.onset - 0.03);
    return [Math.max(0, Math.floor(a * FPS)), Math.ceil(b * FPS)];
  });
  for (let i = 0; i + 1 < n; i++) {
    const join = cuts[i]!.joinNext ?? cuts[i]!.meet;
    if (join !== null) {
      const frame = Math.round(join * FPS);
      frames[i] = [frames[i]![0], frame];
      frames[i + 1] = [frame, frames[i + 1]![1]];
    }
    if (frames[i]![1] > frames[i + 1]![0]) frames[i] = [frames[i]![0], frames[i + 1]![0]];
  }
  return frames;
}

/** Word start/end seconds: whisper's times where matched, spread by length elsewhere. */
function wordTimes(words: readonly SpokenWord[], cut: Cut): Span[] {
  const { onset: on, offset: off } = cut;
  const weights = words.map((w) => Math.max(1, w.key.split(' ')[0]!.length) + 2);
  const total = weights.reduce((x, y) => x + y, 0);
  const prop = weights.map(
    (_, j) => on + ((off - on) * weights.slice(0, j).reduce((x, y) => x + y, 0)) / total,
  );
  const known = words.flatMap((w, j) => (w.heard ? [{ j, t: w.heard.start }] : []));
  let starts = prop;
  if (known.length >= 2 && known.at(-1)!.t > known[0]!.t) {
    const { j: ja, t: ta } = known[0]!;
    const { j: jb, t: tb } = known.at(-1)!;
    const [wa, wb] = [prop[ja]!, prop[jb]!];
    starts = prop.map((p, j) => {
      const heard = words[j]!.heard;
      if (!heard) return p;
      const mapped = wa + ((heard.start - ta) * (wb - wa)) / (tb - ta);
      return Math.min(Math.max(mapped, on), off - 0.05);
    });
    starts = starts.reduce<number[]>(
      (acc, s, j) => [...acc, j ? Math.max(s, acc[j - 1]! + 0.06) : s],
      [],
    );
  }
  return starts.map((start, j) => ({
    start,
    end: Math.max(j + 1 < starts.length ? starts[j + 1]! : off, start + 0.08),
  }));
}

/** First sentence of each shot: where its MỐC starts, in order (reference step 5). */
function shotStarts(sentences: readonly Sentence[], shots: readonly TimingShot[]): number[] {
  const tokens = sentences.flatMap((s, i) => wordKeys(s.text).map((key) => ({ key, i })));
  let cur = 0;
  return shots.map((shot) => {
    const key = wordKeys(shot.moc);
    const from = tokens.findIndex((t) => t.i >= cur);
    for (let k = Math.max(from, 0); k + key.length <= tokens.length; k++) {
      if (key.every((word, m) => tokens[k + m]!.key === word)) {
        cur = tokens[k]!.i + 1;
        return tokens[k]!.i;
      }
    }
    throw new Error(`shot ${shot.id}: MỐC "${shot.moc}" not found after sentence ${cur}`);
  });
}

export function buildTiming(input: TimingInput) {
  const { sentences, words, shots, db } = input;
  const n = sentences.length;
  const floor = noiseFloor(db);
  const threshold = Math.max(floor + VOICED_ABOVE_FLOOR_DB, VOICED_MIN_DB);
  const cuts = findCuts(
    sentences,
    roughSpans(sentences, words),
    db,
    threshold,
    floor + CUT_LIMIT_DB,
  );
  const src = sourceFrames(cuts);

  const firsts = shotStarts(sentences, shots);
  const holds = new Map<number, number>();
  const fast = new Set<number>();
  shots.forEach((shot, k) => {
    const last = k + 1 < shots.length ? firsts[k + 1]! - 1 : n - 1;
    if (shot.hold_seconds) holds.set(last, shot.hold_seconds);
    if (shot.fast) for (let i = firsts[k]!; i <= last; i++) fast.add(i);
  });

  let cursor = FIRST_FRAME;
  const placed = sentences.map((sentence, i) => {
    const [trimBefore, trimAfter] = src[i]!;
    const from = cursor;
    const to = from + trimAfter - trimBefore;
    let hold = holds.get(i) ?? 0;
    let gapFrames = 0;
    if (i + 1 < n) {
      const natural = cuts[i + 1]!.onset - cuts[i]!.offset;
      const pads = trimAfter / FPS - cuts[i]!.offset + (cuts[i + 1]!.onset - src[i + 1]![0] / FPS);
      const target = fast.has(i) ? MIN_GAP : Math.min(Math.max(natural, MIN_GAP), MAX_GAP);
      gapFrames = Math.max(sec2f(Math.max(0, target - pads)), 0);
      if (cuts[i]!.joinNext !== null) [gapFrames, hold] = [0, 0];
    }
    const holdFrom = to + gapFrames;
    const holdTo = holdFrom + sec2f(hold);
    cursor = holdTo;
    const offset = from - trimBefore;
    const spoken = words[i]!;
    const times = wordTimes(spoken, cuts[i]!);
    return {
      id: sentence.id,
      line: sentence.line,
      act: sentence.act,
      text: sentence.text,
      src: [trimBefore, trimAfter] as [number, number],
      from,
      to,
      start: round3(from / FPS),
      end: round3(to / FPS),
      gap: round3(gapFrames / FPS),
      hold,
      holdFrom,
      holdTo,
      joinNext: cuts[i]!.joinNext !== null,
      words: spoken.map((w, j) => [
        w.text,
        w.key,
        Math.round(times[j]!.start * FPS) + offset,
        Math.round(times[j]!.end * FPS) + offset,
      ]) as [string, string, number, number][],
      captions: spoken.map((w, j) => ({
        line: sentence.id,
        text: w.text,
        startMs: Math.round(times[j]!.start * 1000),
        endMs: Math.round(times[j]!.end * 1000),
        timestampMs: Math.round((times[j]!.start + times[j]!.end) * 500),
        confidence: w.heard ? 1 : 0.5,
      })),
    };
  });

  const endCardFrom = placed.at(-1)!.holdTo;
  const totalFrames = endCardFrom + sec2f(END_CARD);
  const shotFrom = (k: number) => (k === 0 ? 0 : placed[firsts[k]!]!.from - 2);
  const timedShots = shots.map((shot, k) => {
    const from = shotFrom(k);
    const to = k + 1 < shots.length ? shotFrom(k + 1) : totalFrames;
    const last = k + 1 < shots.length ? firsts[k + 1]! - 1 : n - 1;
    return {
      id: shot.id,
      act: shot.act,
      moc: shot.moc,
      firstLine: placed[firsts[k]!]!.id,
      lastLine: placed[last]!.id,
      from,
      to,
      start: round3(from / FPS),
      end: round3(to / FPS),
    };
  });
  const actNumbers = [...new Set(timedShots.map((s) => s.act))].sort((x, y) => x - y);

  const timing = {
    _doc: 'Generated by the worker timing step from the narration; do not edit.',
    fps: FPS,
    voice: input.voice,
    totalFrames,
    totalSec: round3(totalFrames / FPS),
    endCardFrom,
    lines: placed.map(({ captions: _captions, ...line }) => line),
    shots: timedShots,
    acts: actNumbers.map((act) => {
      const inAct = timedShots.filter((s) => s.act === act);
      return {
        act,
        from: Math.min(...inAct.map((s) => s.from)),
        to: Math.max(...inAct.map((s) => s.to)),
      };
    }),
  };
  const captions = {
    _doc: 'Word times (ms in the voice file), whisper large-v3-turbo aligned with the script.',
    voice: input.voice,
    captions: placed.flatMap((line) => line.captions),
  };
  return { timing, captions, floor, threshold };
}

export type EpisodeTiming = ReturnType<typeof buildTiming>['timing'];

/** Cuts that land in speech: level around each cut > floor + 20 dB (reference check_cuts.py). */
export function checkCuts(timing: EpisodeTiming, db: readonly number[]): string[] {
  const floor = noiseFloor(db);
  const level = (frame: number) => frameLevel(db, frame);
  return timing.lines.flatMap((line, i) => {
    const prev = timing.lines[i - 1];
    // The start of the file and a one-breath join are not cuts.
    const head = prev?.joinNext || line.src[0] === 0 ? floor : level(line.src[0]);
    const tail = line.joinNext ? floor : level(line.src[1]);
    if (head <= floor + CUT_LIMIT_DB && tail <= floor + CUT_LIMIT_DB) return [];
    const fmt = (v: number) => `${v - floor >= 0 ? '+' : ''}${(v - floor).toFixed(1)}`;
    return [`${line.id} start ${fmt(head)} dB, end ${fmt(tail)} dB above floor: ${line.text}`];
  });
}
