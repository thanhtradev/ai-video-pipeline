// Whisper writes numbers as digits ("30", "2,000") while an English script spells them out
// ("thirty", "two thousand"), as the reference build_timing.py `spell_numbers` did (D-092). For
// matching only: "and", hyphens and "a hundred" variants are left to the alignment's tolerance.

const ONES = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const SCALES = ['', 'thousand', 'million', 'billion'];
/** Larger numbers are left as digits: whisper rarely writes them, and they would not match anyway. */
const MAX_NUMBER = 999_999_999_999;

function belowThousand(n: number): string[] {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const head = hundreds > 0 ? [ONES[hundreds]!, 'hundred'] : [];
  if (rest === 0) return head;
  if (rest < 20) return [...head, ONES[rest]!];
  const unit = rest % 10;
  return [...head, TENS[Math.floor(rest / 10)]!, ...(unit > 0 ? [ONES[unit]!] : [])];
}

/** English words of a whole number, e.g. 128 → one hundred twenty eight. */
export function englishNumber(n: number): string[] {
  if (!Number.isInteger(n) || n < 0 || n > MAX_NUMBER) return [String(n)];
  if (n === 0) return [ONES[0]!];
  const groups: number[] = [];
  for (let rest = n; rest > 0; rest = Math.floor(rest / 1000)) groups.push(rest % 1000);
  return groups
    .map((group, scale) => ({ group, scale }))
    .reverse()
    .flatMap(({ group, scale }) =>
      group === 0 ? [] : [...belowThousand(group), ...(SCALES[scale] ? [SCALES[scale]!] : [])],
    );
}

/** Replaces digit groups ("30", "2,000") in raw whisper text with spelled-out words. */
export function spellEnglishNumbers(text: string): string {
  return text.replace(
    /\d{1,3}(?:,\d{3})+(?!\d)|\d+/g,
    (match) => ` ${englishNumber(Number(match.replace(/,/g, ''))).join(' ')} `,
  );
}
