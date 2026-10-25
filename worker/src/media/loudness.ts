import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// Two-pass EBU R128 normalisation of a rendered video's audio (D-032: -14 LUFS integrated,
// true peak at most -1 dBTP; -1.5 leaves room for AAC encoding). The video stream is copied.

const execFileAsync = promisify(execFile);
const FFMPEG_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_BUFFER = 16 * 1024 * 1024;

export const TARGET_LUFS = -14;
export const TARGET_TRUE_PEAK = -1.5;
const TARGET_LRA = 11;

export interface LoudnessReport {
  input_lufs: number;
  input_true_peak: number;
  output_lufs: number;
  output_true_peak: number;
}

export type LoudnessNormalizer = (
  input: string,
  output: string,
  signal: AbortSignal,
) => Promise<LoudnessReport>;

interface Measured {
  input_i: string;
  input_tp: string;
  input_lra: string;
  input_thresh: string;
  target_offset: string;
}

/** loudnorm prints its JSON report as the last {...} block on stderr. */
function lastJson(stderr: string): Record<string, string> {
  const start = stderr.lastIndexOf('{');
  const end = stderr.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('ffmpeg loudnorm printed no measurement');
  return JSON.parse(stderr.slice(start, end + 1)) as Record<string, string>;
}

function target(): string {
  return `I=${TARGET_LUFS}:TP=${TARGET_TRUE_PEAK}:LRA=${TARGET_LRA}`;
}

export function createLoudnessNormalizer(ffmpegBin: string): LoudnessNormalizer {
  const run = (args: string[], signal: AbortSignal): Promise<{ stderr: string }> =>
    execFileAsync(ffmpegBin, ['-hide_banner', '-nostats', ...args], {
      timeout: FFMPEG_TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
      signal,
    });

  const measure = async (file: string, signal: AbortSignal): Promise<Measured> => {
    const { stderr } = await run(
      ['-i', file, '-vn', '-af', `loudnorm=${target()}:print_format=json`, '-f', 'null', '-'],
      signal,
    );
    return lastJson(stderr) as unknown as Measured;
  };

  return async (input, output, signal) => {
    const first = await measure(input, signal);
    const filter =
      `loudnorm=${target()}:measured_I=${first.input_i}:measured_TP=${first.input_tp}` +
      `:measured_LRA=${first.input_lra}:measured_thresh=${first.input_thresh}` +
      `:offset=${first.target_offset}:linear=true`;
    await run(
      [
        ...['-y', '-i', input, '-c:v', 'copy', '-af', filter, '-ar', '48000'],
        ...['-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', output],
      ],
      signal,
    );
    const result = await measure(output, signal);
    return {
      input_lufs: Number(first.input_i),
      input_true_peak: Number(first.input_tp),
      output_lufs: Number(result.input_i),
      output_true_peak: Number(result.input_tp),
    };
  };
}
