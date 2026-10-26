import { describe, expect, test } from 'vitest';
import { alignWords } from '../../src/episode/align.js';
import type { Sentence } from '../../src/episode/sentences.js';
import {
  NO_RULES,
  pronounce,
  rulesMarkdown,
  rulesPrompt,
  spokenForm,
} from '../../src/rules/channel-rules.js';

// Channel rules (D-059): pronunciation replaces whole, case-sensitive terms in the TTS text only.

const TABLE = [
  { term: 'AI', spoken: 'ây ai' },
  { term: 'TikTok', spoken: 'tích tốc' },
  { term: 'TikTok Shop', spoken: 'tích tốc sốp' },
];

describe('pronounce', () => {
  test('replaces whole words, case-sensitively, longest term first', () => {
    expect(pronounce('AI là gì? Ai biết AI-art, TikTok Shop và TikTok?', TABLE)).toBe(
      'ây ai là gì? Ai biết ây ai-art, tích tốc sốp và tích tốc?',
    );
    expect(pronounce('TikToker, MAIL, aAI', TABLE)).toBe('TikToker, MAIL, aAI');
  });

  test('leaves audio tags alone and returns the text unchanged without a table', () => {
    expect(pronounce('[as AI, calm] AI nói.', TABLE)).toBe('[as AI, calm] ây ai nói.');
    expect(pronounce('Không đổi.', [])).toBe('Không đổi.');
  });

  test('finds the spoken form of a displayed word, ignoring punctuation', () => {
    expect(spokenForm('“TikTok,”', TABLE)).toBe('tích tốc');
    expect(spokenForm('ai', TABLE)).toBeNull();
  });
});

describe('alignment with a pronunciation table', () => {
  test('matches a word by its spoken words and times it at the first', () => {
    const sentences = [{ id: 'S001', text: 'Mở TikTok ra.' }] as unknown as Sentence[];
    const heard = ['mo', 'tich', 'toc', 'ra'].map((key, i) => ({ key, start: i, end: i + 0.5 }));

    const [words] = alignWords(sentences, heard, TABLE);
    expect(words!.map((w) => [w.text, w.heard?.start ?? null])).toEqual([
      ['Mở', 0],
      ['TikTok', 1],
      ['ra.', 3],
    ]);
    // Without the table the word is not heard.
    expect(alignWords(sentences, heard)[0]![1]!.heard).toBeNull();
  });
});

describe('rules text', () => {
  const rules = {
    ...NO_RULES,
    video: [{ id: 1, text: 'Không dùng nhạc nền.' }],
    tts: [],
  };

  test('prompt section only for scopes with rules', () => {
    const prompt = rulesPrompt(rules).join('\n');
    expect(prompt).toContain('- Không dùng nhạc nền.');
    expect(prompt).not.toMatch(/narration lines/);
    expect(rulesPrompt(NO_RULES)).toEqual([]);
  });

  test('rules.md for the agent', () => {
    expect(rulesMarkdown(rules)).toContain('## Every video\n\n- Không dùng nhạc nền.');
    expect(rulesMarkdown(rules)).toContain('## Narration\n\n- (none)');
  });
});
