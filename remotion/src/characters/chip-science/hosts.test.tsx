import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test, vi } from 'vitest';

// fonts.ts loads web fonts through document.fonts at import time; there is no DOM here.
vi.mock('../ep1/fonts', () => ({ FONT: 'Baloo 2', HAND: 'Patrick Hand' }));
import { Character } from '../../rig/Character';
import { SCIENCE_ACCESSORIES } from '../../rig/accessories-extra';
import { HOSTS, SCIENCE_CHARACTERS } from './hosts';

/** Limits of `characters[]` in the episode script schema (worker/src/handlers/episode-script.ts). */
const NAME_MAX = 40;
const LOOK_MAX = 300;
/** Hero hoodies must read as saturated (side characters in the kit are all below this). */
const HERO_SATURATION_MIN = 0.5;

const saturationOf = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return 0;
  return (max - min) / (l > 0.5 ? 2 - max - min : max + min);
};

describe('science host candidates', () => {
  test('every host has a saturated hero hoodie and a unique name', () => {
    const names = new Set(HOSTS.map((h) => h.name));
    expect(names.size).toBe(HOSTS.length);
    expect(HOSTS.length).toBeGreaterThanOrEqual(5);
    for (const h of HOSTS) {
      expect(saturationOf(h.hoodie), `${h.name} hoodie ${h.hoodie}`).toBeGreaterThanOrEqual(
        HERO_SATURATION_MIN,
      );
    }
  });

  test('brief entries fit the episode script schema limits', () => {
    expect(SCIENCE_CHARACTERS).toHaveLength(HOSTS.length);
    for (const c of SCIENCE_CHARACTERS) {
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.name.length).toBeLessThanOrEqual(NAME_MAX);
      expect(c.look.length).toBeGreaterThan(0);
      expect(c.look.length).toBeLessThanOrEqual(LOOK_MAX);
    }
  });

  test('every host renders with its accessories and item', () => {
    for (const h of HOSTS) {
      const svg = renderToStaticMarkup(
        <svg>
          <h.Host t={12} />
        </svg>,
      );
      expect(svg, h.name).toContain('<g');
    }
  });
});

describe('science accessories on the Character rig', () => {
  test.each(SCIENCE_ACCESSORIES)('%s renders a tagged group in solid and line mode', (acc) => {
    const render = (invisible: number) =>
      renderToStaticMarkup(
        <svg>
          <Character accessories={[acc]} t={5} invisible={invisible} />
        </svg>,
      );
    expect(render(0)).toContain(`data-acc="${acc}"`);
    expect(render(1)).toContain(`data-acc="${acc}"`);
  });

  test('a character without science accessories renders none of them', () => {
    const svg = renderToStaticMarkup(
      <svg>
        <Character accessories={['cap', 'glassesRound']} t={5} />
      </svg>,
    );
    expect(svg).not.toContain('data-acc=');
  });
});
