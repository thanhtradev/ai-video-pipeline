import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test, vi } from 'vitest';

// fonts.ts loads web fonts through document.fonts at import time; there is no DOM here.
vi.mock('../whatif/fonts', () => ({ FONT: 'Baloo 2', HAND: 'Patrick Hand' }));
import { Character } from '../../rig/Character';
import { SceneLightCtx } from '../../rig/scene-light';
import * as baseHome from '../whatif/sets-home';
import * as baseRooms from '../whatif/sets';
import * as baseSchool from '../whatif/sets-school';
import type { SetLayers } from '../whatif/sets';
import * as home from './sets-home';
import * as rooms from './sets';
import * as school from './sets-school';

const FRAME = 40;
const ROOMS = [
  'livingRoom',
  'schoolYard',
  'altarRoom',
  'teacherRoom',
  'bathroom',
  'hallway',
  'canteen',
  'alley',
  'classroom',
  'bedroom',
  'lanternStreet',
] as const;
const HOME = ['bedroomDay', 'dining', 'yardField', 'lot', 'balcony', 'kitchen', 'stairs'] as const;
const SCHOOL = ['schoolGate', 'traffic', 'busStation', 'lake'] as const;

type Build = (f: number, o?: { mood?: 'rain' }) => SetLayers;
const SETS: readonly (readonly [string, Build, Build])[] = [
  ...ROOMS.map((n) => [n, rooms[n] as Build, baseRooms[n] as Build] as const),
  ...HOME.map((n) => [n, home[n] as Build, baseHome[n] as Build] as const),
  ...SCHOOL.map((n) => [n, school[n] as Build, baseSchool[n] as Build] as const),
];

/** Every drawn part of a set but the finish, which needs a real DOM for its grain tile. */
const markup = (set: SetLayers): string =>
  renderToStaticMarkup(
    <svg>
      {set.far}
      {set.bg}
      {set.back}
      {set.front}
      {set.fg}
      {set.atmos?.behind}
      {set.atmos?.over}
    </svg>,
  );

describe('the cinematic kit', () => {
  test.each(SETS)('%s adds the look; its base set stays without one', (_name, cinematic, base) => {
    // Act
    const set = cinematic(FRAME);

    // Assert
    expect(set.atmos?.light).toBeDefined();
    expect(set.atmos?.finish).toBeDefined();
    expect(base(FRAME).atmos).toBeUndefined();
  });

  test.each(SETS)('%s draws the same frame twice and moves over time', (_name, cinematic) => {
    // Arrange, Act
    const first = markup(cinematic(FRAME));

    // Assert
    expect(markup(cinematic(FRAME))).toBe(first);
    expect(markup(cinematic(FRAME + 60))).not.toBe(first);
  });

  test.each(SETS)('%s adds no text and no animated dash of its own', (_name, cinematic, base) => {
    // Arrange
    const count = (html: string, tag: RegExp): number => (html.match(tag) ?? []).length;

    // Act
    const added = markup(cinematic(FRAME));
    const original = markup(base(FRAME));

    // Assert: on-screen text must come from the brief; animated dashes abort Chrome (D-088).
    expect(count(added, /<text/g)).toBe(count(original, /<text/g));
    expect(count(added, /stroke-dasharray/g)).toBe(count(original, /stroke-dasharray/g));
  });

  test('a mood changes the light and filter, and rain removes direct sun', () => {
    // Act
    const sunny = rooms.classroom(FRAME);
    const rainy = rooms.classroom(FRAME, { mood: 'rain' });

    // Assert
    expect(sunny.atmos?.filter).toBeUndefined();
    expect(rainy.atmos?.filter).toContain('brightness');
    expect(rainy.atmos?.light?.color).not.toBe(sunny.atmos?.light?.color);
    expect(markup(sunny)).toContain('cineClRay0');
    expect(markup(rainy)).not.toContain('cineClRay0');
  });

  test('wrapping keeps what the base module exports', () => {
    expect(rooms.FLOOR).toBe(baseRooms.FLOOR);
    expect(home.AlarmClock).toBe(baseHome.AlarmClock);
    expect(school.Coach).toBe(baseSchool.Coach);
    expect(rooms.minimal().atmos?.finish).toBeDefined();
  });
});

describe('the character light', () => {
  test('without a scene light a character draws as before', () => {
    // Act
    const html = renderToStaticMarkup(
      <svg>
        <Character seed={3} t={10} />
      </svg>,
    );

    // Assert
    expect(html).not.toContain('-lit');
    expect(html).not.toContain('-headlit');
  });

  test('a scene light adds gradients and a shadow in its colour', () => {
    // Act
    const html = renderToStaticMarkup(
      <SceneLightCtx.Provider
        value={{ side: 1, color: '#123456', strength: 0.8, wallShadow: true }}
      >
        <svg>
          <Character seed={3} t={10} />
        </svg>
      </SceneLightCtx.Provider>,
    );

    // Assert
    expect(html).toContain('ch3-lit');
    expect(html).toContain('ch3-headlit');
    expect(html).toContain('#123456');
    expect(html).toContain('matrix(1 0 0.85 -0.2 0 0)');
  });
});
