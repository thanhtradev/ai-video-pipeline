import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test, vi } from 'vitest';

// fonts.ts loads web fonts through document.fonts at import time; there is no DOM here.
vi.mock('../../kits/whatif/fonts', () => ({ FONT: 'Baloo 2', HAND: 'Patrick Hand' }));
import { C } from '../../kits/whatif/theme';
import { Ban } from '../chip/cast';
import { Clone, HERO_HOODIE, You } from './cast';

const OWNER_RED = '#e8352c';

const markup = (node: ReactElement): string =>
  renderToStaticMarkup(<svg>{node}</svg>).toLowerCase();

describe('Chip (YOU, EN) hero hoodie', () => {
  test('is the red the owner chose', () => {
    expect(HERO_HOODIE).toBe(OWNER_RED);
  });

  test('You and every Clone wear the red hoodie, not the orange one', () => {
    for (const hero of [<You t={5} />, <Clone k={1} t={5} />]) {
      const svg = markup(hero);
      expect(svg).toContain(HERO_HOODIE);
      expect(svg).not.toContain(C.orange);
    }
  });

  test('a caller can still override the colour', () => {
    expect(markup(<You t={5} hoodieColor="#123456" />)).toContain('#123456');
  });

  test('the Vietnamese hero keeps the orange hoodie', () => {
    const svg = markup(<Ban t={5} />);
    expect(svg).toContain(C.orange);
    expect(svg).not.toContain(HERO_HOODIE);
  });
});
