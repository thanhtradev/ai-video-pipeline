import React from 'react';
import { Side } from '../../kits/whatif/grade';
import { Character, CharacterProps } from '../../rig/Character';
import { Ban, Ba, Clone, Extra, Me, Relative } from '../chip/cast';

/**
 * "Chip (YOU)" cast for the English "What if… (EN)" kit (D-092): the same drawn people as the
 * Chip cast, with English names. Only the teacher changes look: a cardigan over a shirt and round
 * glasses instead of the áo dài, as the reference EN episodes redrew her.
 */
type A = Omit<CharacterProps, 'hoodieColor'> & { readonly hoodieColor?: string };

/** You: the hero in the saturated orange hoodie. */
export const You = Ban;
export { Clone, Extra };
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
