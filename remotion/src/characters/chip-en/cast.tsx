import React from 'react';
import { Side } from '../../kits/whatif/grade';
import { Character, CharacterProps } from '../../rig/Character';
import { Ban, Ba, Clone as ChipClone, Extra, Me, Relative } from '../chip/cast';

/**
 * "Chip (YOU)" cast for the English "What if… (EN)" kit (D-092): the same drawn people as the
 * Chip cast, with English names. The hero wears red (D-105) and the teacher changes look: a
 * cardigan over a shirt and round glasses instead of the áo dài, as the reference EN episodes
 * redrew her.
 */
type A = Omit<CharacterProps, 'hoodieColor'> & { readonly hoodieColor?: string };

/** The hero's hoodie: red, chosen by the owner for the English channel. */
export const HERO_HOODIE = '#e8352c';

/** You: the hero in the saturated red hoodie. */
export const You: React.FC<A> = (p) => <Ban hoodieColor={HERO_HOODIE} {...p} />;
/** Clone number k: identical to You (only blink/breath timing differs). */
export const Clone: React.FC<A & { k: number }> = (p) => (
  <ChipClone hoodieColor={HERO_HOODIE} {...p} />
);
export { Extra };
/** Mom, Dad and the grandparents / relatives. */
export const Mom = Me;
export const Dad = Ba;
export const Elder = Relative;

/** Teacher: grey-blue cardigan over a light shirt, round glasses, bun. */
export const Teacher: React.FC<A> = (p) => (
  <Side>
    <Character
      seed={5}
      hoodieColor="#e3dccd"
      size={1.05}
      shirtColor="#7d8b99"
      {...p}
      accessories={['shirt', 'glassesRound', 'bun', ...(p.accessories ?? [])]}
    />
  </Side>
);
