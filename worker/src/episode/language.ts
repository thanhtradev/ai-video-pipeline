import { z } from 'zod';

// The language of a video's content (D-092): the kit decides it (catalog_option.language,
// remotion/catalog.json `language`), and the job trigger job_input_language copies it into every
// job input that names one. Telegram stays Vietnamese whatever the video language (D-061).

export const languageSchema = z.enum(['vi', 'en']);
export type Language = z.infer<typeof languageSchema>;

/**
 * Narration pace, holds included. Vietnamese from the reference episodes (EP5: 1292 words in
 * 400 s); English at about 150 words a minute. duration_selection in SQL uses the same rates.
 */
export const WORDS_PER_SECOND: Readonly<Record<Language, number>> = { vi: 3.2, en: 2.5 };

/**
 * Letters of Vietnamese writing that English text practically never has: breve, circumflex, horn,
 * đ, dot below, hook above, and the grave/tilde vowels (à ã ì ò õ ù ỳ ỹ ý). é á í ó ú è are left
 * out, so an English "café", "Pokémon" or "naïve" is not flagged.
 */
const VIETNAMESE_LETTER = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹàãìĩòõùũý]/iu;

/** True when the text has a letter only Vietnamese uses. */
export function hasVietnameseLetters(text: string): boolean {
  return VIETNAMESE_LETTER.test(text.normalize('NFC'));
}

/** The subtitle file of a render, e.g. `vi.srt` or `en.vtt`. */
export function subtitleFile(language: Language, extension: 'srt' | 'vtt'): string {
  return `${language}.${extension}`;
}
