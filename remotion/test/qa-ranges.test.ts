import { describe, expect, test } from 'vitest';
import { isBrowserCrash, renderQaRanges } from '../scripts/qa-ranges.mjs';

const CRASH = new Error('Error: Page crashed!');

/** Records every range; `fails` decides which ranges throw which error. */
function recorder(fails: (from: number, to: number) => Error | null = () => null) {
  const calls: [number, number][] = [];
  const render = async (from: number, to: number) => {
    calls.push([from, to]);
    const error = fails(from, to);
    if (error) throw error;
  };
  return { calls, render };
}

const options = { size: 60, minSize: 20 };

describe('renderQaRanges', () => {
  test('covers every sample once, in ranges of the chunk size', async () => {
    // Arrange
    const { calls, render } = recorder();

    // Act
    await renderQaRanges(130, options, render);

    // Assert
    expect(calls).toEqual([
      [0, 59],
      [60, 119],
      [120, 129],
    ]);
  });

  test('splits a range that crashes Chrome and still covers all of it', async () => {
    // Arrange: more than 20 samples at once crash this episode.
    const { calls, render } = recorder((from, to) => (to - from + 1 > 20 ? CRASH : null));

    // Act
    await renderQaRanges(60, options, render);

    // Assert
    const finished = calls.filter(([from, to]) => to - from + 1 <= 20);
    const covered = new Set(finished.flatMap(([from, to]) => range(from, to)));
    expect([...covered].sort((a, b) => a - b)).toEqual(range(0, 59));
  });

  test('never splits below the minimum size, and then reports the crash', async () => {
    // Arrange: the episode's code crashes Chrome at sample 25, at any chunk size.
    const { calls, render } = recorder((from, to) => (from <= 25 && 25 <= to ? CRASH : null));

    // Act
    const failure = renderQaRanges(60, options, render);

    // Assert
    await expect(failure).rejects.toThrow(/Page crashed/);
    expect(calls).toEqual([
      [0, 59],
      [0, 29],
      [0, 19],
      [20, 29],
    ]);
  });

  test('does not retry an error from the episode code', async () => {
    // Arrange
    const { calls, render } = recorder(() => new TypeError("Cannot read 'x'"));

    // Act
    const failure = renderQaRanges(60, options, render);

    // Assert
    await expect(failure).rejects.toThrow(/Cannot read/);
    expect(calls).toEqual([[0, 59]]);
  });
});

describe('isBrowserCrash', () => {
  test.each(['Page crashed!', 'Target closed', 'browser crashed', 'Session closed'])(
    'knows %s',
    (text) => {
      expect(isBrowserCrash(new Error(`Error: ${text} at x`))).toBe(true);
    },
  );

  test('does not take other errors for a crash', () => {
    expect(isBrowserCrash(new TypeError("Cannot read 'x'"))).toBe(false);
  });
});

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}
