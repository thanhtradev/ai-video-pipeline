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
});
