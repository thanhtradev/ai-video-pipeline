import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const PROBE_TIMEOUT_MS = 30_000;

/** Media duration in seconds; also proves the file is decodable media. */
export type DurationProbe = (path: string) => Promise<number>;

export function createFfprobe(bin: string): DurationProbe {
  return async (path) => {
    const { stdout } = await execFileAsync(
      bin,
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
      { timeout: PROBE_TIMEOUT_MS },
    );
    const seconds = Number.parseFloat(stdout.trim());
    if (!Number.isFinite(seconds) || seconds <= 0) {
      throw new Error(`ffprobe found no duration in ${path}`);
    }
    return seconds;
  };
}
