import { describe, expect, test, vi } from 'vitest';

// fonts.ts loads web fonts through document.fonts at import time; there is no DOM here.
vi.mock('./whatif/fonts', () => ({ FONT: 'Baloo 2', HAND: 'Patrick Hand' }));
import { CATALOG } from '../catalog';
import * as science from './science/theme';
import { frameSpec, LANDSCAPE, PORTRAIT } from './whatif/theme';
import * as whatif from './whatif/theme';

// D-080: the frame is a kit property; catalog.json (worker: render size) and the kit theme
// (episode code: W/H/SAFE/PX) must agree.

const THEMES: Record<string, { W: number; H: number }> = { whatif, science };

describe('kit frames', () => {
  test('every kit theme exports the frame its catalog entry declares', () => {
    for (const [id, kit] of Object.entries(CATALOG.kits)) {
      const theme = THEMES[id];
      expect(theme, `theme of kit ${id}`).toBeDefined();
      expect({ width: theme!.W, height: theme!.H }, id).toEqual(kit.frame);
    }
  });

  test('a composition size picks the landscape or the portrait spec', () => {
    expect(frameSpec(1920, 1080)).toBe(LANDSCAPE);
    expect(frameSpec(1080, 1920)).toBe(PORTRAIT);
  });

  test('portrait maps portrait-design coordinates 1:1 and keeps text above the app UI', () => {
    expect(PORTRAIT.PX(500, 480)).toEqual({ x: 500, y: 480 });
    expect(PORTRAIT.CAPTION_Y).toBeLessThan(PORTRAIT.SAFE.bottom);
    expect(LANDSCAPE.CAPTION_Y).toBeLessThan(LANDSCAPE.SAFE.bottom);
    expect(science.SAFE).toBe(PORTRAIT.SAFE);
    expect(whatif.PX(500, 0)).toEqual({ x: 960, y: 0 });
  });
});
