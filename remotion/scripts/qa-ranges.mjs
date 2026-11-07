// How the text-bounds QA divides an episode's samples among fresh browsers (episode-gates.mjs, D-115).

/** Chrome itself dying, as in worker/src/episode/gates.ts, not an error from the episode's code. */
const BROWSER_CRASH = /Page crashed!|Target closed|browser crashed|Session closed/i;

export const isBrowserCrash = (error) => BROWSER_CRASH.test(String(error?.stack ?? error));

async function renderRange(from, to, size, minSize, render) {
  for (let start = from; start <= to; start += size) {
    const end = Math.min(to, start + size - 1);
    try {
      await render(start, end);
    } catch (error) {
      const length = end - start + 1;
      if (!isBrowserCrash(error) || length <= minSize) throw error;
      await renderRange(start, end, Math.max(minSize, Math.ceil(length / 2)), minSize, render);
    }
  }
}

/**
 * Renders samples 0..samples-1 in ranges of `size`. A range that crashes Chrome is split and tried
 * again, down to `minSize`; a crash at that size, or any other error, reaches the caller.
 */
export function renderQaRanges(samples, { size, minSize }, render) {
  return renderRange(0, samples - 1, size, minSize, render);
}
