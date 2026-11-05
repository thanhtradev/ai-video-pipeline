import React from 'react';
import { Side } from '../../kits/whatif/grade';
import { Character, CharacterProps } from '../../rig/Character';
import { INK } from '../../rig/palette';

/**
 * "Mùn" cast of the "Kinh dị" kit (D-106): the kid with the oil lamp is the hero in the saturated
 * deep violet hoodie; the elder, the thầy cúng, the sceptical friend and the faceless silhouette
 * are muted side characters wrapped in <Side>, so the act grade applies to them and never to Mùn.
 */
type A = Omit<CharacterProps, 'hoodieColor'> & { readonly hoodieColor?: string };

/** Mùn's hoodie: deep indigo-violet ("tím than"), chosen by the owner on 2026-11-05. */
export const HERO_HOODIE = '#45279e';
/** Muted hoodies of the fixed side characters (kit rule: only the hero is saturated). */
export const SIDE_HOODIE = {
  Ba: '#6b6460',
  ThayNam: '#7d6a45',
  Teo: '#4f6f6f',
} as const;

export { Extra, Relative } from '../chip/cast';

/** The hero: small, lamp in the right hand. */
export const Mun: React.FC<A> = (p) => (
  <Character seed={300} hoodieColor={HERO_HOODIE} size={0.92} itemR="oilLamp" {...p} />
);

/** Bà: the village elder, bun and cane, half-lidded eyes. */
export const Ba: React.FC<A> = (p) => (
  <Side>
    <Character
      seed={301}
      hoodieColor={SIDE_HOODIE.Ba}
      size={0.95}
      itemR="cane"
      eyes="half"
      {...p}
      accessories={['bun', ...(p.accessories ?? [])]}
    />
  </Side>
);

/** Thầy Năm: the thầy cúng, a shirt under the hoodie, incense in hand. */
export const ThayNam: React.FC<A> = (p) => (
  <Side>
    <Character
      seed={302}
      hoodieColor={SIDE_HOODIE.ThayNam}
      shirtColor="#8a7a58"
      size={1.06}
      itemR="incense"
      {...p}
      accessories={['shirt', ...(p.accessories ?? [])]}
    />
  </Side>
);

/** Tèo: Mùn's sceptical friend, cap and phone, narrowed eyes. */
export const Teo: React.FC<A> = (p) => (
  <Side>
    <Character
      seed={303}
      hoodieColor={SIDE_HOODIE.Teo}
      size={0.96}
      itemR="phone"
      eyes="squint"
      {...p}
      accessories={['cap', ...(p.accessories ?? [])]}
    />
  </Side>
);

/** Người lạ: the faceless silhouette, ink hoodie with the hood up, eyes closed, a little see-through. */
export const NguoiLa: React.FC<A> = (p) => (
  <Side>
    <g opacity={0.82}>
      <Character
        seed={304}
        hoodieColor={INK}
        size={1.15}
        eyes="closed"
        {...p}
        accessories={['hoodUp', ...(p.accessories ?? [])]}
      />
    </g>
  </Side>
);
