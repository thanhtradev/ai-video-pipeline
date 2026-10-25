import { diffArrays } from 'diff';
import { wordKeys, type Sentence } from './sentences.js';
import { spellNumbers } from './vi-numbers.js';

// Word timing: the known sentence words aligned with whisper's word timestamps (port of
// build_timing.py step 4, difflib → jsdiff). Whisper decides *when*; the script decides *what*.

/** One word from whisper-cli -ojf -ml 1 -sow: seconds in the transcribed file. */
export interface HeardWord {
  key: string;
  start: number;
  end: number;
}

export interface SpokenWord {
  /** Displayed token (punctuation kept). */
  text: string;
  /** Match key, as the kit's at() compares words. */
  key: string;
  /** Whisper's time when this word was matched, else null. */
  heard: HeardWord | null;
}

interface WhisperSegment {
  offsets?: { from?: number; to?: number };
  text?: string;
}

/** Words of a whisper-cli JSON transcript (-ojf). Invalid UTF-8 from split tokens is tolerated. */
export function parseWhisperJson(bytes: Uint8Array): HeardWord[] {
  const parsed = JSON.parse(new TextDecoder('utf-8').decode(bytes)) as {
    transcription?: WhisperSegment[];
  };
  if (!Array.isArray(parsed.transcription)) throw new Error('whisper transcript has no segments');
  return parsed.transcription.flatMap((segment) => {
    const from = segment.offsets?.from;
    const to = segment.offsets?.to;
    if (typeof from !== 'number' || typeof to !== 'number') return [];
    return wordKeys(spellNumbers(segment.text ?? '')).map((key) => ({
      key,
      start: from / 1000,
      end: to / 1000,
    }));
  });
}

/** Display tokens of a sentence: dashes and ellipses are not words. */
export function displayWords(text: string): string[] {
  return text
    .replace(/[—…]/g, ' ')
    .split(/\s+/)
    .filter((token) => wordKeys(token).length > 0);
}

/** Every sentence's display words, each with whisper's time when the alignment matched it. */
export function alignWords(
  sentences: readonly Sentence[],
  heard: readonly HeardWord[],
): SpokenWord[][] {
  const tokens = sentences.map((sentence) =>
    displayWords(sentence.text).map((text) => ({ text, key: wordKeys(text).join(' ') })),
  );
  const keys = tokens.flat().map((token) => token.key);
  const matched = new Map<number, HeardWord>();
  let a = 0;
  let b = 0;
  for (const change of diffArrays(
    keys,
    heard.map((word) => word.key),
  )) {
    const count = change.count ?? change.value.length;
    if (!change.added && !change.removed) {
      for (let k = 0; k < count; k++) matched.set(a + k, heard[b + k]!);
    }
    if (!change.added) a += count;
    if (!change.removed) b += count;
  }
  let index = 0;
  return tokens.map((words) =>
    words.map((word) => ({ ...word, heard: matched.get(index++) ?? null })),
  );
}
