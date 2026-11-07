import { describe, expect, test } from 'vitest';
import { captionWord } from './caption-text';

describe('captionWord', () => {
  test('drops a trailing colon, semicolon or full stop', () => {
    expect(captionWord('work:')).toBe('WORK');
    expect(captionWord('word.')).toBe('WORD');
    expect(captionWord('xong;')).toBe('XONG');
  });

  test('keeps commas and ellipses so the caption still reads like a sentence', () => {
    expect(captionWord('rồi,')).toBe('RỒI,');
    expect(captionWord('và...')).toBe('VÀ...');
    expect(captionWord('và…')).toBe('VÀ…');
  });

  test('keeps question and exclamation marks', () => {
    expect(captionWord('sao?')).toBe('SAO?');
    expect(captionWord('chạy!')).toBe('CHẠY!');
  });

  test('keeps punctuation inside a word (times, decimals)', () => {
    expect(captionWord('10:30')).toBe('10:30');
    expect(captionWord('3.5')).toBe('3.5');
  });

  test('drops dashes and quotes, including a full stop left behind by a closing quote', () => {
    expect(captionWord('“thật”')).toBe('THẬT');
    expect(captionWord('nói:”')).toBe('NÓI');
    expect(captionWord('đi.”')).toBe('ĐI');
    expect(captionWord('—')).toBe('');
  });

  test('drops brackets, guillemets, en dashes and markdown-like symbols', () => {
    expect(captionWord('(nhỏ)')).toBe('NHỎ');
    expect(captionWord('«đây»')).toBe('ĐÂY');
    expect(captionWord('–')).toBe('');
    expect(captionWord('*bùm*')).toBe('BÙM');
    expect(captionWord('#1')).toBe('1');
  });

  test('drops single quotes at the edges but keeps an apostrophe inside a word', () => {
    expect(captionWord('‘thật’')).toBe('THẬT');
    expect(captionWord("'yes'")).toBe('YES');
    expect(captionWord("don't")).toBe("DON'T");
  });

  test('drops a lone hyphen but keeps one inside a word', () => {
    expect(captionWord('-')).toBe('');
    expect(captionWord('Wi-Fi')).toBe('WI-FI');
  });
});
