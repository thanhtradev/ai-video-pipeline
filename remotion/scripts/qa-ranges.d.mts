/** True when the error shows Chrome itself dying, not the episode's code (qa-ranges.mjs). */
export function isBrowserCrash(error: unknown): boolean;
/** Renders samples 0..samples-1 in ranges, splitting a range that crashes Chrome (qa-ranges.mjs). */
export function renderQaRanges(
  samples: number,
  options: { size: number; minSize: number },
  render: (from: number, to: number) => Promise<void>,
): Promise<void>;
