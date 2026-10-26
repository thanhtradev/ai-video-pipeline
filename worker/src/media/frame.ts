import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// One full-size JPEG frame of a video, for the thumbnail (D-062).

const execFileAsync = promisify(execFile);
const FRAME_TIMEOUT_MS = 60_000;

export type FrameGrabber = (
  video: string,
  seconds: number,
  output: string,
  signal: AbortSignal,
) => Promise<void>;

export function createFrameGrabber(ffmpegBin: string): FrameGrabber {
  return async (video, seconds, output, signal) => {
    await execFileAsync(
      ffmpegBin,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-ss',
        seconds.toFixed(3),
        '-i',
        video,
        '-frames:v',
        '1',
        '-q:v',
        '2',
        '-y',
        output,
      ],
      { timeout: FRAME_TIMEOUT_MS, signal },
    );
  };
}
