// Spoken sentences of an episode script: the timing unit of docs/episode-pipeline.md §5. A script
// line (what one TTS request reads, with audio tags) may hold several sentences; each sentence gets
// its own cut, gap and hold on the timeline, like the SRT blocks of the reference episodes.

export interface ScriptLine {
  id: string;
  text: string;
}

export interface ScriptShot {
  id: string;
  moc: string;
  hold_seconds?: number | undefined;
}

export interface ScriptAct {
  lines: ScriptLine[];
  shots: ScriptShot[];
}

export interface Sentence {
  /** S001… in speaking order. */
  id: string;
  /** Script line it comes from (L001…). */
  line: string;
  /** 1-based act number. */
  act: number;
  /** Displayed text: audio tags removed, punctuation kept. */
  text: string;
}

const AUDIO_TAG = /\[[^\]]*\]/g;
// Where the reference TTS service's SRT broke the narration: after . ! ? … and : (the reader pauses).
const SENTENCE_END = /[.!?…:]+["”’)]*$/;

/** Match key of a word, as the kit's at() compares them: no case, accents or punctuation. */
export function wordKeys(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(' ')
    .filter(Boolean);
}

/** Splits a script line into spoken sentences (audio tags removed). */
export function splitSentences(text: string): string[] {
  const words = text.replace(AUDIO_TAG, ' ').split(/\s+/).filter(Boolean);
  const sentences: string[][] = [];
  let current: string[] = [];
  words.forEach((word, i) => {
    current.push(word);
    const next = words[i + 1];
    if (next !== undefined && SENTENCE_END.test(word)) {
      sentences.push(current);
      current = [];
    }
  });
  if (current.length > 0) sentences.push(current);
  return sentences.map((s) => s.join(' ')).filter((s) => wordKeys(s).length > 0);
}

export function episodeSentences(acts: readonly ScriptAct[]): Sentence[] {
  let next = 1;
  return acts.flatMap((act, a) =>
    act.lines.flatMap((line) =>
      splitSentences(line.text).map((text) => ({
        id: `S${String(next++).padStart(3, '0')}`,
        line: line.id,
        act: a + 1,
        text,
      })),
    ),
  );
}
