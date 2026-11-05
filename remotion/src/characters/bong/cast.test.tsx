import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test, vi } from 'vitest';

// fonts.ts loads web fonts through document.fonts at import time; there is no DOM here.
vi.mock('../../kits/whatif/fonts', () => ({ FONT: 'Baloo 2', HAND: 'Patrick Hand' }));
import { DamDong, ENTITY_EYES, HERO_RIM, INK, Nguoi, No, Toi } from './cast';
import { EYE_PALE, Figure } from './figure';

/** Colours of the old Mùn cast and the rig that must never appear on a silhouette. */
const MUN_HOODIE = '#45279e';
const LAMP_FLAME_RIG = '#ffd36a';

const markup = (node: ReactElement): string =>
  renderToStaticMarkup(<svg>{node}</svg>).toLowerCase();

describe('Bóng cast (D-111)', () => {
  test('does not draw the rig (no rig ids, no hoodie drawstrings)', () => {
    for (const node of [<Toi t={5} />, <No t={5} />, <Nguoi k={1} t={5} />]) {
      const svg = markup(node);
      expect(svg).not.toMatch(/id="ch\d+/);
      expect(svg).toContain('id="fig');
    }
  });

  test('TÔI is an ink silhouette with the warm rim, pale eyes and the lamp', () => {
    const svg = markup(<Toi t={5} />);
    expect(svg).toContain(INK);
    expect(svg).toContain(HERO_RIM.toLowerCase());
    expect(svg).toContain(EYE_PALE.toLowerCase());
    expect(svg).toContain('#fff1c0'); // the lamp flame
    expect(svg).not.toContain(MUN_HOODIE);
    expect(svg).not.toContain(LAMP_FLAME_RIG);
  });

  test('NÓ has the pale eyes, a tilted head and no lamp; far shows glowing eyes only', () => {
    const near = markup(<No t={5} />);
    expect(near).toContain(ENTITY_EYES.toLowerCase());
    expect(near).toMatch(/rotate\(22 /);
    expect(near).not.toContain('#fff1c0');
    const far = markup(<No t={5} far />);
    expect(far).toContain('eyeglow');
    expect(far).toContain('opacity="0.8"');
  });

  test('a figure without eyes draws no eye shapes; the walk cycle moves with t', () => {
    const blind = markup(<Figure eyes="none" />);
    expect(blind).not.toContain(EYE_PALE.toLowerCase());
    const a = markup(<Figure pose="walk" t={0} rim={0} />);
    const b = markup(<Figure pose="walk" t={11} rim={0} />);
    expect(a).not.toEqual(b);
    expect(markup(<Figure pose="stand" t={0} rim={0} />)).toEqual(
      markup(<Figure pose="stand" t={0} rim={0} />),
    );
  });

  test('side people and the crowd render inside the grade wrapper', () => {
    expect(markup(<Nguoi k={2} t={1} />)).toContain(INK);
    const crowd = markup(<DamDong y={1500} x0={0} x1={1000} n={4} />);
    expect(crowd.split('<ellipse').length).toBeGreaterThan(8);
  });
});
