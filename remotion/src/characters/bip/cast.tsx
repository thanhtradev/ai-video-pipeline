import React from 'react';
import { Side } from '../../kits/whatif/grade';
import { CharacterProps } from '../../rig/Character';
import { hostById } from './hosts';

/**
 * "Bíp" cast: the robot host (candidate 3, chosen by the user on 2026-10-26) is the hero in the
 * saturated teal hoodie; the other candidates serve as muted side characters, wrapped in <Side>
 * so the act grade applies to them and never to Bíp.
 */
type A = Omit<CharacterProps, 'hoodieColor'> & { readonly hoodieColor?: string };
const host = (id: number) => {
  const h = hostById(id);
  if (!h) throw new Error(`bip cast: no host candidate ${id}`);
  return h;
};
const BIP = host(3);
const SIDE_IDS = { TiMo: 1, Moc: 2, Neo: 4, HatTieu: 5, Sao: 6, Cu: 7 } as const;
/** Side characters keep the shape of their candidate but a muted hoodie (kit rule: only the hero is saturated). */
const SIDE_HOODIE: Record<keyof typeof SIDE_IDS, string> = {
  TiMo: '#6f7f99',
  Moc: '#6f8a78',
  Neo: '#7f7494',
  HatTieu: '#a39a6f',
  Sao: '#6f948f',
  Cu: '#9a7470',
};

/** The hero. */
export const Bip: React.FC<A> = (p) => <BIP.Host {...p} />;
/** Muted side character derived from another candidate. */
const side = (key: keyof typeof SIDE_IDS): React.FC<A> => {
  const h = host(SIDE_IDS[key]);
  const Side_: React.FC<A> = (p) => (
    <Side>
      <h.Host hoodieColor={SIDE_HOODIE[key]} {...p} />
    </Side>
  );
  Side_.displayName = key;
  return Side_;
};
export const TiMo = side('TiMo');
export const Moc = side('Moc');
export const Neo = side('Neo');
export const HatTieu = side('HatTieu');
export const Sao = side('Sao');
export const Cu = side('Cu');
