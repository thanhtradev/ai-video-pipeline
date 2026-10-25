// Whisper writes numbers as digits ("30", "100.000") while the script spells them out ("ba mươi").
// For matching only, digits are read the usual Vietnamese way (keys carry no accents).

const DIGITS = ['khong', 'mot', 'hai', 'ba', 'bon', 'nam', 'sau', 'bay', 'tam', 'chin'];
const SCALES = ['', 'nghin', 'trieu', 'ty'];
/** Larger numbers are left as digits: whisper rarely writes them, and they would not match anyway. */
const MAX_NUMBER = 999_999_999_999;

function belowHundred(n: number, afterHundred: boolean): string[] {
  const tens = Math.floor(n / 10);
  const unit = n % 10;
  if (tens === 0) return afterHundred && unit > 0 ? ['linh', DIGITS[unit]!] : [DIGITS[unit]!];
  const head = tens === 1 ? ['muoi'] : [DIGITS[tens]!, 'muoi'];
  if (unit === 0) return head;
  if (unit === 5) return [...head, 'lam'];
  if (unit === 1 && tens > 1) return [...head, 'mot'];
  return [...head, DIGITS[unit]!];
}

function belowThousand(n: number, full: boolean): string[] {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds === 0 && !full) return belowHundred(rest, false);
  const head = [DIGITS[hundreds]!, 'tram'];
  return rest === 0 ? head : [...head, ...belowHundred(rest, true)];
}

/** Accent-free Vietnamese words of a whole number, e.g. 128 → mot tram hai muoi tam. */
export function vietnameseNumber(n: number): string[] {
  if (!Number.isInteger(n) || n < 0 || n > MAX_NUMBER) return [String(n)];
  if (n === 0) return [DIGITS[0]!];
  const groups: number[] = [];
  for (let rest = n; rest > 0; rest = Math.floor(rest / 1000)) groups.push(rest % 1000);
  return groups
    .map((group, scale) => ({ group, scale }))
    .reverse()
    .flatMap(({ group, scale }, i) =>
      group === 0
        ? []
        : [...belowThousand(group, i > 0), ...(SCALES[scale] ? [SCALES[scale]!] : [])],
    );
}

/** Replaces digit groups ("30", "100.000", "1,5") in raw whisper text with spelled-out words. */
export function spellNumbers(text: string): string {
  return text.replace(
    /\d{1,3}(?:[.,]\d{3})+(?!\d)|\d+/g,
    (match) => ` ${vietnameseNumber(Number(match.replace(/[.,]/g, ''))).join(' ')} `,
  );
}
