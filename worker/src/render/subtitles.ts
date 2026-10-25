// Vietnamese subtitles (SRT + VTT) from the approved narration and the measured clip of each
// scene (2c, no speech-to-text): a scene's speech time is shared across its cues by text length.
// Limits from D-032: at most 2 lines of ~42 characters per cue.

export const MAX_LINE_CHARS = 42;
export const MAX_LINES = 2;

export interface SubtitleScene {
  narration: string;
  /** When the scene's narration starts, in seconds from the start of the video. */
  startSeconds: number;
  /** Length of the narration clip. */
  speechSeconds: number;
}

export interface Cue {
  start: number;
  end: number;
  lines: string[];
}

const SENTENCE_END = /(?<=[.!?…])\s+/u;

function length(text: string): number {
  return Array.from(text).length;
}

/** Greedy word wrap; a single word longer than the limit gets a line of its own. */
function wrap(words: readonly string[]): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && length(candidate) > MAX_LINE_CHARS) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Text blocks of at most MAX_LINES lines; every sentence starts a new block. */
function blocks(narration: string): string[][] {
  const result: string[][] = [];
  for (const sentence of narration.normalize('NFC').trim().split(SENTENCE_END)) {
    const lines = wrap(sentence.split(/\s+/).filter(Boolean));
    for (let i = 0; i < lines.length; i += MAX_LINES) result.push(lines.slice(i, i + MAX_LINES));
  }
  return result.filter((lines) => lines.length > 0);
}

export function buildCues(scenes: readonly SubtitleScene[]): Cue[] {
  return scenes.flatMap((scene) => {
    const parts = blocks(scene.narration);
    const weights = parts.map((lines) => length(lines.join(' ')));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let elapsed = 0;
    return parts.map((lines, i) => {
      const start = scene.startSeconds + (scene.speechSeconds * elapsed) / total;
      elapsed += weights[i]!;
      const end = scene.startSeconds + (scene.speechSeconds * elapsed) / total;
      return { start, end, lines };
    });
  });
}

function timestamp(seconds: number, separator: ',' | '.'): string {
  const ms = Math.round(seconds * 1000);
  const pad = (value: number, width = 2): string => String(value).padStart(width, '0');
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const secs = Math.floor((ms % 60_000) / 1000);
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)}${separator}${pad(ms % 1000, 3)}`;
}

export function toSrt(cues: readonly Cue[]): string {
  return cues
    .map(
      (cue, i) =>
        `${i + 1}\n${timestamp(cue.start, ',')} --> ${timestamp(cue.end, ',')}\n${cue.lines.join('\n')}\n`,
    )
    .join('\n');
}

export function toVtt(cues: readonly Cue[]): string {
  const body = cues
    .map(
      (cue) =>
        `${timestamp(cue.start, '.')} --> ${timestamp(cue.end, '.')}\n${cue.lines.join('\n')}\n`,
    )
    .join('\n');
  return `WEBVTT\n\n${body}`;
}
