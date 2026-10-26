import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';

// Facts about a rendered video for QA (docs/quality-and-approval.md §3): container and streams from
// ffprobe; black and silent stretches from one ffmpeg decode (video scaled down, it only needs
// brightness).

const execFileAsync = promisify(execFile);
const PROBE_TIMEOUT_MS = 30_000;
const DETECT_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_BUFFER = 16 * 1024 * 1024;
/** Black: at least 1 s with nearly every pixel dark. Silence: at least 3 s below -50 dB. */
const BLACK_FILTER = 'scale=320:-2,blackdetect=d=1:pix_th=0.10';
const SILENCE_FILTER = 'silencedetect=n=-50dB:d=3';

export interface MediaInfo {
  formatName: string;
  durationSeconds: number;
  video: { codec: string; width: number; height: number; fps: number } | null;
  audio: { codec: string } | null;
}

export interface Segment {
  start: number;
  end: number;
}

export interface Gaps {
  black: Segment[];
  silence: Segment[];
}

export type MediaInspector = (path: string) => Promise<MediaInfo>;
export type GapDetector = (path: string, signal: AbortSignal) => Promise<Gaps>;

const probeSchema = z.object({
  streams: z.array(
    z.object({
      codec_type: z.string(),
      codec_name: z.string(),
      width: z.number().optional(),
      height: z.number().optional(),
      avg_frame_rate: z.string().optional(),
    }),
  ),
  format: z.object({ format_name: z.string(), duration: z.string() }),
});

function frameRate(value = '0/1'): number {
  const [num, den] = value.split('/').map(Number);
  return num && den ? num / den : 0;
}

/** ffprobe's JSON for one file, reduced to what QA checks. */
export function parseProbe(json: string): MediaInfo {
  const probe = probeSchema.parse(JSON.parse(json));
  const video = probe.streams.find((s) => s.codec_type === 'video');
  const audio = probe.streams.find((s) => s.codec_type === 'audio');
  return {
    formatName: probe.format.format_name,
    durationSeconds: Number.parseFloat(probe.format.duration),
    video: video
      ? {
          codec: video.codec_name,
          width: video.width ?? 0,
          height: video.height ?? 0,
          fps: frameRate(video.avg_frame_rate),
        }
      : null,
    audio: audio ? { codec: audio.codec_name } : null,
  };
}

/** blackdetect and silencedetect lines from ffmpeg's stderr. */
export function parseGaps(stderr: string): Gaps {
  const black = [...stderr.matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)].map((m) => ({
    start: Number(m[1]),
    end: Number(m[2]),
  }));
  const starts = [...stderr.matchAll(/silence_start: (-?[\d.]+)/g)].map((m) => Number(m[1]));
  const ends = [...stderr.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
  // A silence running to the end of the file has a start and no end.
  const silence = starts.map((start, i) => ({ start: Math.max(0, start), end: ends[i] ?? NaN }));
  return { black, silence };
}

export function createMediaInspector(ffprobeBin: string): MediaInspector {
  return async (path) => {
    const { stdout } = await execFileAsync(
      ffprobeBin,
      [
        '-v',
        'error',
        '-show_entries',
        'format=format_name,duration:stream=codec_type,codec_name,width,height,avg_frame_rate',
        '-of',
        'json',
        path,
      ],
      { timeout: PROBE_TIMEOUT_MS, maxBuffer: MAX_BUFFER },
    );
    return parseProbe(stdout);
  };
}

export function createGapDetector(ffmpegBin: string): GapDetector {
  return async (path, signal) => {
    const { stderr } = await execFileAsync(
      ffmpegBin,
      [
        '-hide_banner',
        '-nostats',
        '-i',
        path,
        '-vf',
        BLACK_FILTER,
        '-af',
        SILENCE_FILTER,
        '-f',
        'null',
        '-',
      ],
      { timeout: DETECT_TIMEOUT_MS, maxBuffer: MAX_BUFFER, signal },
    );
    return parseGaps(stderr);
  };
}
