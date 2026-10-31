import { describe, expect, test, vi } from 'vitest';

// fonts.ts loads web fonts through document.fonts at import time; there is no DOM here.
vi.mock('./whatif/fonts', () => ({ FONT: 'Baloo 2', HAND: 'Patrick Hand' }));
import { camCutFrames, cutCam, WIDE, type CamSeg } from './whatif/Stage';

// D-081: the owner saw zoom in/out on many shots in a row; a camera segment holds its framing
// (or drifts once a → b) instead of pulsing in and out.

const CLOSE = { x: 520, y: 700, z: 2 };
const DUR = 300;

describe('cutCam', () => {
  test('a long segment without b keeps one framing', () => {
    const segs: CamSeg[] = [{ at: 0, a: WIDE }];
    const zooms = new Set(Array.from({ length: DUR }, (_, f) => cutCam(f, segs, DUR).z));
    expect([...zooms]).toEqual([WIDE.z]);
  });

  test('a long push-in only ever zooms in', () => {
    const segs: CamSeg[] = [{ at: 0, a: WIDE, b: CLOSE }];
    const zooms = Array.from({ length: DUR }, (_, f) => cutCam(f, segs, DUR).z);
    zooms.slice(1).forEach((z, i) => expect(z).toBeGreaterThanOrEqual(zooms[i]!));
  });

  test('cuts only where a segment starts', () => {
    const segs: CamSeg[] = [
      { at: 0, a: WIDE },
      { at: 200, a: CLOSE },
    ];
    expect(camCutFrames(segs)).toEqual([0, 200]);
  });
});
