// A single HTTP byte range (RFC 9110 §14), which is what a browser's video player asks for. Multiple
// ranges or a malformed header are ignored, and the whole file is sent, as the RFC allows.

export interface ByteRange {
  start: number;
  end: number;
}

const SINGLE_RANGE = /^bytes=(\d*)-(\d*)$/;

export function parseByteRange(
  header: string | undefined,
  size: number,
): ByteRange | 'unsatisfiable' | null {
  const match = header === undefined ? null : SINGLE_RANGE.exec(header.trim());
  if (!match) return null;
  const [, first = '', last = ''] = match;
  if (first === '' && last === '') return null;
  if (first === '') {
    const length = Number(last);
    if (length === 0 || size === 0) return 'unsatisfiable';
    return { start: Math.max(size - length, 0), end: size - 1 };
  }
  const start = Number(first);
  const end = last === '' ? size - 1 : Math.min(Number(last), size - 1);
  if (last !== '' && Number(last) < start) return null;
  if (start >= size) return 'unsatisfiable';
  return { start, end };
}
