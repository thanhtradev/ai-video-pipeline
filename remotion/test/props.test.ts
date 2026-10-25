import { describe, expect, test } from 'vitest';
import { fontSizeFor, splitWords } from '../src/props';

describe('splitWords', () => {
  test('marks emphasized words and phrases, ignoring case, punctuation and Unicode form', () => {
    const words = splitWords('Vì sao bầu trời màu xanh?', ['Màu Xanh'.normalize('NFD')]);
    expect(words).toEqual([
      { text: 'Vì', emphasized: false },
      { text: 'sao', emphasized: false },
      { text: 'bầu', emphasized: false },
      { text: 'trời', emphasized: false },
      { text: 'màu', emphasized: true },
      { text: 'xanh?', emphasized: true },
    ]);
  });

  test('a phrase only matches as a whole sequence', () => {
    const words = splitWords('xanh lam và lam xanh', ['lam xanh', '', 'không có']);
    expect(words.map((w) => w.emphasized)).toEqual([false, false, false, true, true]);
  });
});

describe('fontSizeFor', () => {
  test('shrinks as the text gets longer', () => {
    const sizes = ['Ngắn', 'x'.repeat(30), 'x'.repeat(45), 'x'.repeat(70)].map(fontSizeFor);
    expect(sizes).toEqual([128, 108, 92, 78]);
  });
});
