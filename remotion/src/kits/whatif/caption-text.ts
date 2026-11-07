/** Dashes and quotes never show in a caption. */
const DROPPED = /[—"“”]/g;
/**
 * A trailing ":" or ";" or a single trailing "." reads as a label ("WORK:") on screen, so it goes.
 * "," and "..." / "…" stay: they make the caption read like a sentence. "?" and "!" stay too.
 * Punctuation inside a word ("10:30", "3.5") is left alone.
 */
const TRAILING = /(?:[:;]|(?<!\.)\.)+$/;

/** One narration word as the caption shows it. */
export const captionWord = (raw: string): string =>
  raw.replace(DROPPED, '').replace(TRAILING, '').toUpperCase();
