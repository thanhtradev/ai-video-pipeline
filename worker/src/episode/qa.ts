import type { Gaps, MediaInfo, Segment } from '../media/inspect.js';
import { TARGET_LUFS } from '../media/loudness.js';

// QA of an episode preview (docs/quality-and-approval.md §3, D-057). FAIL means the file is not
// what the pipeline promised (format, size, length, loudness, subtitles); WARN is shown in A2 for a
// person to judge (black or silent stretches can be intended).

export type Level = 'PASS' | 'WARN' | 'FAIL';

export interface Check {
  name: string;
  level: Level;
  detail: string;
}

export interface PreviewFacts {
  info: MediaInfo;
  gaps: Gaps;
  expected: { width: number; height: number; fps: number; seconds: number };
  loudness: { output_lufs: number; output_true_peak: number };
  srt: string;
}

const DURATION_TOLERANCE_SECONDS = 0.5;
const LUFS_TOLERANCE = 1;
const MAX_TRUE_PEAK = -1;
const SRT_TIME = /^(\d{2}):(\d{2}):(\d{2}),(\d{3}) --> (\d{2}):(\d{2}):(\d{2}),(\d{3})$/;

const check = (name: string, ok: boolean, detail: string, failLevel: Level = 'FAIL'): Check => ({
  name,
  level: ok ? 'PASS' : failLevel,
  detail,
});

function clock(seconds: number): string {
  const s = Math.max(0, seconds);
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
}

const spans = (segments: Segment[], end: number) =>
  segments
    .map((g) => `${clock(g.start)}–${clock(Number.isFinite(g.end) ? g.end : end)}`)
    .join(', ');

/** Problems with an SRT file: numbering, timestamps, order, overlaps, length. */
export function srtProblems(srt: string, durationSeconds: number): string[] {
  const blocks = srt
    .replace(/\r/g, '')
    .trim()
    .split(/\n{2,}/);
  if (blocks.length === 0 || blocks[0] === '') return ['no cues'];
  const problems: string[] = [];
  let previousEnd = 0;
  blocks.forEach((block, i) => {
    const [index, times, ...text] = block.split('\n');
    const m = SRT_TIME.exec(times ?? '');
    if (index !== String(i + 1) || !m || text.join('').trim() === '') {
      problems.push(`cue ${i + 1} is malformed`);
      return;
    }
    const t = m.slice(1).map(Number);
    const start = t[0]! * 3600 + t[1]! * 60 + t[2]! + t[3]! / 1000;
    const end = t[4]! * 3600 + t[5]! * 60 + t[6]! + t[7]! / 1000;
    if (end <= start) problems.push(`cue ${i + 1} ends before it starts`);
    if (start < previousEnd) problems.push(`cue ${i + 1} overlaps the previous cue`);
    if (end > durationSeconds + DURATION_TOLERANCE_SECONDS)
      problems.push(`cue ${i + 1} ends after the video`);
    previousEnd = end;
  });
  return problems.slice(0, 5);
}

export function previewChecks(facts: PreviewFacts): Check[] {
  const { info, gaps, expected, loudness } = facts;
  const v = info.video;
  const seconds = info.durationSeconds;
  const subtitles = srtProblems(facts.srt, seconds);
  return [
    check(
      'format',
      info.formatName.includes('mp4') && v?.codec === 'h264' && info.audio?.codec === 'aac',
      `${info.formatName.split(',').includes('mp4') ? 'MP4' : info.formatName}, ` +
        `${v?.codec ?? 'no video'}/${info.audio?.codec ?? 'no audio'}`,
    ),
    check(
      'size',
      v?.width === expected.width &&
        v.height === expected.height &&
        Math.abs(v.fps - expected.fps) < 0.01,
      v ? `${v.width}×${v.height} at ${Math.round(v.fps * 100) / 100} fps` : 'no video stream',
    ),
    check(
      'duration',
      Math.abs(seconds - expected.seconds) <= DURATION_TOLERANCE_SECONDS,
      `${seconds.toFixed(1)} s (timeline ${expected.seconds.toFixed(1)} s)`,
    ),
    check(
      'loudness',
      Math.abs(loudness.output_lufs - TARGET_LUFS) <= LUFS_TOLERANCE &&
        loudness.output_true_peak <= MAX_TRUE_PEAK,
      `${loudness.output_lufs} LUFS, true peak ${loudness.output_true_peak} dBTP`,
    ),
    check(
      'subtitles',
      subtitles.length === 0,
      subtitles.length === 0 ? 'SRT valid' : subtitles.join('; '),
    ),
    check(
      'black frames',
      gaps.black.length === 0,
      gaps.black.length === 0 ? 'none' : spans(gaps.black, seconds),
      'WARN',
    ),
    check(
      'silence',
      gaps.silence.length === 0,
      gaps.silence.length === 0 ? 'none' : spans(gaps.silence, seconds),
      'WARN',
    ),
  ];
}

export function overallLevel(checks: readonly Check[]): Level {
  if (checks.some((c) => c.level === 'FAIL')) return 'FAIL';
  return checks.some((c) => c.level === 'WARN') ? 'WARN' : 'PASS';
}
