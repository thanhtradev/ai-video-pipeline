import React from 'react';
import { Side } from '../../kits/whatif/grade';
import { C } from '../../kits/whatif/theme';
import { Character, CharacterProps } from '../../rig/Character';

/**
 * "Chíp" cast (the TikTok 2 "Nếu bạn…" episodes): the hero BẠN in the saturated ORANGE hoodie, everyone
 * else muted and wrapped in <Side> so the act grade applies to them. Episodes add their own people in
 * their kit.tsx (same pattern) and may override the hero (EP5 ages him).
 */
type A = Omit<CharacterProps, 'hoodieColor'> & { readonly hoodieColor?: string };
/** You (EP2 look: messy hair). */
export const Ban: React.FC<A> = (p) => <Character seed={1} hoodieColor={C.orange} hair {...p} />;
/** Clone number k – identical to the original (only blink/breath timing differs). */
export const Clone: React.FC<A & { k: number }> = ({ k, ...p }) => (
  <Character seed={100 + k} hoodieColor={C.orange} hair {...p} />
);
export const Me: React.FC<A> = (p) => (
  <Side>
    <Character
      seed={2}
      hoodieColor={C.mom}
      size={1.08}
      {...p}
      accessories={['bun', ...(p.accessories ?? [])]}
    />
  </Side>
);
export const Ba: React.FC<A> = (p) => (
  <Side>
    <Character
      seed={8}
      hoodieColor="#8e9096"
      size={1.18}
      {...p}
      accessories={['shirt', ...(p.accessories ?? [])]}
      shirtColor="#a9c4dc"
    />
  </Side>
);
export const Co: React.FC<A> = (p) => (
  <Side>
    <Character
      seed={5}
      hoodieColor={C.aodai}
      size={1.05}
      {...p}
      accessories={['aodai', 'glassesRound', 'bun', ...(p.accessories ?? [])]}
    />
  </Side>
);
export const Extra: React.FC<A & { k: number }> = ({ k, ...p }) => (
  <Side>
    <Character
      seed={30 + k}
      hoodieColor={
        ['#7d7486', '#7a8270', '#8a7f70', '#6f7884', '#8a7684', '#6a6f62', '#857a6a', '#7a6a62'][
          k % 8
        ]
      }
      size={0.85 + ((k * 37) % 30) / 100}
      accessories={k % 3 === 0 ? ['hoodUp'] : []}
      {...p}
    />
  </Side>
);
/** Elderly relatives (muted colours, bun/glasses). */
export const Relative: React.FC<A & { k: number }> = ({ k, ...p }) => (
  <Side>
    <Character
      seed={60 + k}
      hoodieColor={['#8a6f62', '#6f7a6a', '#7a7090', '#8d8676', '#6a7280', '#90806a'][k % 6]}
      size={1.02}
      accessories={k % 2 ? ['bun', 'glassesRound'] : ['glassesSquare']}
      {...p}
    />
  </Side>
);
