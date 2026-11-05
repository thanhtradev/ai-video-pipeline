import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test, vi } from 'vitest';

// fonts.ts loads web fonts through document.fonts at import time; there is no DOM here.
vi.mock('../../kits/whatif/fonts', () => ({ FONT: 'Baloo 2', HAND: 'Patrick Hand' }));
import { C } from '../../kits/whatif/theme';
import { INK } from '../../rig/palette';
import { Ba, HERO_HOODIE, Mun, NguoiLa, SIDE_HOODIE, Teo, ThayNam } from './cast';

/** Hero hoodies must read as saturated; side characters in the kit are all below this. */
const HERO_SATURATION_MIN = 0.5;
/** The lamp flame colour drawn by the rig's `oilLamp` item. */
const LAMP_FLAME = '#ffd36a';

const saturationOf = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return 0;
  return (max - min) / (l > 0.5 ? 2 - max - min : max + min);
};

const markup = (node: ReactElement): string =>
  renderToStaticMarkup(<svg>{node}</svg>).toLowerCase();

describe('Mùn cast (D-106)', () => {
  test('the hero hoodie is saturated and every side hoodie is muted', () => {
    expect(saturationOf(HERO_HOODIE)).toBeGreaterThanOrEqual(HERO_SATURATION_MIN);
    for (const [name, hex] of Object.entries(SIDE_HOODIE)) {
      expect(saturationOf(hex), name).toBeLessThan(HERO_SATURATION_MIN);
    }
  });

  test('Mùn wears the violet hoodie and carries the lit oil lamp', () => {
    const svg = markup(<Mun t={5} />);
    expect(svg).toContain(HERO_HOODIE);
    expect(svg).toContain(LAMP_FLAME);
    expect(svg).not.toContain(C.orange);
  });

  test('side characters render with their muted hoodie and item', () => {
    expect(markup(<Ba t={5} />)).toContain(SIDE_HOODIE.Ba);
    expect(markup(<ThayNam t={5} />)).toContain(SIDE_HOODIE.ThayNam);
    expect(markup(<Teo t={5} />)).toContain(SIDE_HOODIE.Teo);
  });

  test('Người lạ is an ink silhouette with no lamp and no hero colour', () => {
    const svg = markup(<NguoiLa t={5} />);
    expect(svg).toContain(INK.toLowerCase());
    expect(svg).toContain('opacity="0.82"');
    expect(svg).not.toContain(HERO_HOODIE);
    expect(svg).not.toContain(LAMP_FLAME);
  });

  test('a caller can still override the hero colour', () => {
    expect(markup(<Mun t={5} hoodieColor="#123456" />)).toContain('#123456');
  });
});
