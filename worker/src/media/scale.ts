import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Frame } from '../episode/frame.js';

// Scales a rendered episode down for the preview (D-089): the preview is the full-size render made
// smaller, so the final needs no second render. The audio (already loudness normalised) is copied;
// the video is re-encoded with the episode render's settings (H.264, CRF 20, yuv420p).

const execFileAsync = promisify(execFile);
const FFMPEG_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_BUFFER = 16 * 1024 * 1024;
/** Must match remotion/scripts/episode-render.mjs. */
const CRF = 20;

export type VideoScaler = (
  input: string,
  output: string,
  frame: Frame,
  signal: AbortSignal,
) => Promise<void>;

export function scaleArgs(input: string, output: string, frame: Frame): string[] {
  return [
    ...['-hide_banner', '-nostats', '-y', '-i', input],
    ...['-vf', `scale=${frame.width}:${frame.height}:flags=lanczos`],
    ...['-c:v', 'libx264', '-preset', 'medium', '-crf', String(CRF), '-pix_fmt', 'yuv420p'],
    ...['-c:a', 'copy', '-movflags', '+faststart', output],
  ];
}

export function createVideoScaler(ffmpegBin: string): VideoScaler {
  return async (input, output, frame, signal) => {
    await execFileAsync(ffmpegBin, scaleArgs(input, output, frame), {
      timeout: FFMPEG_TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
      signal,
    });
  };
}
