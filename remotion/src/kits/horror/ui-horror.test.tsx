import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test, vi } from 'vitest';

vi.mock('../whatif/fonts', () => ({ FONT: 'Baloo 2', HAND: 'Patrick Hand' }));
vi.mock('remotion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('remotion')>();
  return { ...actual, useVideoConfig: () => ({ width: 1920, height: 1080, fps: 30 }) };
});
import { Blackout, flickerGain, Glitch, TitleCard, typedChars } from './ui-horror';

const markup = (node: ReactElement): string => renderToStaticMarkup(node);

describe('horror screen pieces (D-111)', () => {
  test('the title card types the text over time and ends complete', () => {
    const text = 'Phòng cuối dãy';
    expect(typedChars(text, 0)).toBe(0);
    expect(typedChars(text, 10)).toBeGreaterThan(0);
    expect(typedChars(text, 10)).toBeLessThan(text.length);
    expect(typedChars(text, 400)).toBe(text.length);
    expect(markup(<TitleCard text={text} f={400} />)).toContain(text);
    expect(markup(<TitleCard text={text} f={0} />)).not.toContain('Phòng');
  });

  test('the black-out fades in and out by frame', () => {
    expect(markup(<Blackout f={0} fadeIn={10} dur={60} />)).toContain('opacity:0');
    expect(markup(<Blackout f={30} fadeIn={10} fadeOut={10} dur={60} />)).toContain('opacity:1');
    expect(markup(<Blackout f={60} fadeOut={10} dur={60} />)).toContain('opacity:0');
  });

  test('the glitch splits the channels only inside its window', () => {
    const child = <div id="shot" />;
    const quiet = markup(
      <Glitch f={3} at={10}>
        {child}
      </Glitch>,
    );
    expect(quiet.split('id="shot"').length - 1).toBe(1);
    const hit = markup(
      <Glitch f={12} at={10} frames={6}>
        {child}
      </Glitch>,
    );
    expect(hit.split('id="shot"').length - 1).toBe(6);
    expect(hit).toContain('glitch-r');
  });

  test('the flicker stays within 0.8 and 1', () => {
    for (let f = 0; f < 200; f++) {
      const g = flickerGain(f);
      expect(g).toBeGreaterThanOrEqual(0.8);
      expect(g).toBeLessThanOrEqual(1);
    }
  });
});
