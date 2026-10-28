/** Colours and helpers the Character rig owns. Kits re-export the helpers from their theme. */
export const INK = '#15121a';
export const RIM = '#f3e2c2';
/** Hero hoodie when a character set does not say otherwise (the TikTok 2 orange). */
export const HERO_DEFAULT = '#ff7a1a';

/** Mixes two hex colours. */
export const mix = (a: string, b: string, t: number) => {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return (
    '#' +
    x
      .map((v, i) =>
        Math.round(v + (y[i] - v) * t)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
};
export const shade = (c: string, t: number) =>
  t >= 0 ? mix(c, '#ffffff', t) : mix(c, '#1a1420', -t);
/** Desaturates a colour (t = 0…1). */
export const desat = (c: string, t: number) => {
  const p = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const g = Math.round(p[0] * 0.3 + p[1] * 0.59 + p[2] * 0.11);
  return mix(c, `#${[g, g, g].map((v) => v.toString(16).padStart(2, '0')).join('')}`, t);
};
export const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
