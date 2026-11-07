/** Dashes, quotes, brackets and markdown-like symbols never show in a caption. */
const DROPPED = /[—–"“”«»()[\]{}*_#~`|<>]/g;
/** Single quotes only at a word's edges, so "don't" keeps its apostrophe. */
const EDGE_QUOTES = /^['‘’]+|['‘’]+$/g;
/** A word that is only a hyphen (a dash typed as "-"). */
const LONE_HYPHEN = /^-+$/;
/**
 * A trailing ":" or ";" or a single trailing "." reads as a label ("WORK:") on screen, so it goes.
 * "," and "..." / "…" stay: they make the caption read like a sentence. "?" and "!" stay too.
 * Punctuation inside a word ("10:30", "3.5", "don't") is left alone.
 */
const TRAILING = /(?:[:;]|(?<!\.)\.)+$/;

/** One narration word as the caption shows it. */
export const captionWord = (raw: string): string =>
  raw
    .replace(DROPPED, '')
    .replace(EDGE_QUOTES, '')
    .replace(LONE_HYPHEN, '')
    .replace(TRAILING, '')
    .toUpperCase();
