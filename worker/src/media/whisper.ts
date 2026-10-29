import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

// whisper.cpp word timestamps (docs/episode-pipeline.md §5), as the reference episodes used them:
// model large-v3-turbo, one word per segment (-ml 1 -sow), full JSON (-ojf). Runs locally; free.

const execFileAsync = promisify(execFile);
const WHISPER_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_BUFFER = 16 * 1024 * 1024;
const DEFAULT_THREADS = 8;

export interface WhisperOptions {
  bin: string;
  /** ggml model file, e.g. ggml-large-v3-turbo.bin. */
  model: string;
  /** CPU threads (WHISPER_THREADS); 8 when unset. */
  threads?: number;
}

/** Transcribes a 16 kHz WAV and returns the raw JSON bytes (they may hold invalid UTF-8). */
export type Transcriber = (
  wav: string,
  outputPrefix: string,
  language: string,
  signal: AbortSignal,
) => Promise<Uint8Array>;

export function whisperArgs(
  options: WhisperOptions,
  wav: string,
  outputPrefix: string,
  language: string,
) {
  return [
    '-m',
    options.model,
    '-f',
    wav,
    '-l',
    language,
    '-ojf',
    '-of',
    outputPrefix,
    '-ml',
    '1',
    '-sow',
    '-t',
    String(options.threads ?? DEFAULT_THREADS),
    '-np',
  ];
}

export function createWhisper(options: WhisperOptions): Transcriber {
  return async (wav, outputPrefix, language, signal) => {
    await execFileAsync(options.bin, whisperArgs(options, wav, outputPrefix, language), {
      timeout: WHISPER_TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
      signal,
    });
    return new Uint8Array(await readFile(`${outputPrefix}.json`));
  };
}
