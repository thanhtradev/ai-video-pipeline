import React from 'react';
import { Side } from '../../kits/whatif/grade';
import { EYE_PALE, Figure, FigureProps, INK, RIM_WARM } from './figure';

/**
 * "Bóng" cast of the "Kinh dị" kit (style v2, D-111): black silhouettes, no rig. TÔI is the witness
 * (variant C chosen by the owner on 2026-11-05: tall, pale round eyes); NÓ is the entity (variant G:
 * arms past the knees, head tilted, shivering). Side people are smaller, dimmer silhouettes wrapped
 * in <Side>, so the act grade applies to them and never to TÔI.
 */
export type CastProps = Omit<FigureProps, 'seed'> & { readonly seed?: number };

/** The rim light on TÔI: the only warm thing on the hero besides the lamp. */
export const HERO_RIM = RIM_WARM;
/** The entity's eyes. */
export const ENTITY_EYES = '#e8eef8';
export { INK };

/** TÔI: the narrator of this episode, whoever they are; tall, pale eyes, lamp by default. */
export const Toi: React.FC<CastProps> = (p) => (
  <Figure
    seed={300}
    rim={0.6}
    eyes="hollow"
    eyeColor={EYE_PALE}
    stretch={1.18}
    prop="lamp"
    {...p}
  />
);

/** NÓ: never explained. `far` shows only the glowing eyes, as the kit rules ask for a distant beat. */
export const No: React.FC<CastProps & { readonly far?: boolean }> = ({ far = false, ...p }) => (
  <Side>
    <Figure
      seed={304}
      rim={far ? 0 : 0.2}
      eyes={far ? 'glow' : 'hollow'}
      eyeColor={ENTITY_EYES}
      longArms
      tilt={22}
      stretch={1.35}
      jitter={0.3}
      opacity={far ? 0.8 : 1}
      rimSide={-1}
      {...p}
    />
  </Side>
);

/** Another person of the story, number k: a smaller, dimmer silhouette with eye slits. */
export const Nguoi: React.FC<CastProps & { readonly k: number }> = ({ k, ...p }) => (
  <Side>
    <Figure seed={320 + k} rim={0.3} eyes="slits" size={0.92 + ((k * 7) % 3) * 0.04} {...p} />
  </Side>
);

/** A row of n faceless silhouettes between x0 and x1 (a crowd at a funeral, a market closing). */
export const DamDong: React.FC<{
  readonly y: number;
  readonly x0: number;
  readonly x1: number;
  readonly n: number;
  readonly t?: number;
}> = ({ y, x0, x1, n, t = 0 }) => (
  <Side>
    <g opacity={0.75}>
      {Array.from({ length: n }, (_, i) => (
        <Figure
          key={i}
          seed={340 + i}
          x={x0 + ((x1 - x0) * (i + 0.5)) / n}
          y={y}
          t={t}
          rim={0.15}
          eyes="none"
          size={0.86 + (i % 3) * 0.05}
          facing={i % 2 ? -1 : 1}
        />
      ))}
    </g>
  </Side>
);
