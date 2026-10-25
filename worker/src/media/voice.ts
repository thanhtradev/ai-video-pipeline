import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

// The episode voice track: the act clips of the tts job joined in order with a short silence
// between acts (docs/episode-pipeline.md §5). voice.wav (48 kHz) is what the composition plays;
// the 16 kHz mono copy is what whisper transcribes and what the cut finder measures.

const execFileAsync = promisify(execFile);
const FFMPEG_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_BUFFER = 16 * 1024 * 1024;
/** Silence after every act clip but the last, so act boundaries are always clean cuts. */
export const ACT_PAUSE_SECONDS = 0.6;
const VOICE_RATE = 48_000;
export const ANALYSIS_RATE = 16_000;

export type VoiceBuilder = (
  clips: readonly string[],
  outputs: { voice: string; analysis: string },
  signal: AbortSignal,
) => Promise<void>;

/** ffmpeg filter that resamples each clip to mono and pads all but the last with silence. */
export function concatFilter(count: number): string {
  const inputs = Array.from({ length: count }, (_, i) => {
    const pad = i + 1 < count ? `,apad=pad_dur=${ACT_PAUSE_SECONDS}` : '';
    return `[${i}:a]aresample=${VOICE_RATE},aformat=sample_fmts=s16:channel_layouts=mono${pad}[a${i}]`;
  });
  const labels = Array.from({ length: count }, (_, i) => `[a${i}]`).join('');
  return `${inputs.join(';')};${labels}concat=n=${count}:v=0:a=1[voice]`;
}

export function createVoiceBuilder(ffmpegBin: string): VoiceBuilder {
  const run = (args: string[], signal: AbortSignal) =>
    execFileAsync(ffmpegBin, ['-hide_banner', '-nostats', '-v', 'error', '-y', ...args], {
      timeout: FFMPEG_TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
      signal,
    });
  return async (clips, outputs, signal) => {
    if (clips.length === 0) throw new Error('no narration clips to join');
    const inputs = clips.flatMap((clip) => ['-i', clip]);
    await run(
      [
        ...inputs,
        '-filter_complex',
        concatFilter(clips.length),
        '-map',
        '[voice]',
        '-c:a',
        'pcm_s16le',
        outputs.voice,
      ],
      signal,
    );
    await run(
      [
        '-i',
        outputs.voice,
        '-ar',
        String(ANALYSIS_RATE),
        '-ac',
        '1',
        '-c:a',
        'pcm_s16le',
        outputs.analysis,
      ],
      signal,
    );
  };
}

/** Samples of a 16-bit PCM mono WAV file (any chunk layout, as ffmpeg writes them). */
export async function readPcm16(
  path: string,
): Promise<{ samples: Int16Array; sampleRate: number }> {
  const bytes = await readFile(path);
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`${path} is not a WAV file`);
  }
  let sampleRate = 0;
  for (let at = 12; at + 8 <= bytes.length;) {
    const id = bytes.toString('ascii', at, at + 4);
    const size = bytes.readUInt32LE(at + 4);
    const body = at + 8;
    if (id === 'fmt ') {
      const format = bytes.readUInt16LE(body);
      const channels = bytes.readUInt16LE(body + 2);
      const bits = bytes.readUInt16LE(body + 14);
      if (format !== 1 || channels !== 1 || bits !== 16) {
        throw new Error(`${path} is not 16-bit PCM mono`);
      }
      sampleRate = bytes.readUInt32LE(body + 4);
    }
    if (id === 'data') {
      if (!sampleRate) throw new Error(`${path} has no fmt chunk before its data`);
      const length = Math.min(size, bytes.length - body) & ~1;
      const copy = new Uint8Array(bytes.subarray(body, body + length));
      return { samples: new Int16Array(copy.buffer), sampleRate };
    }
    at = body + size + (size % 2);
  }
  throw new Error(`${path} has no data chunk`);
}
