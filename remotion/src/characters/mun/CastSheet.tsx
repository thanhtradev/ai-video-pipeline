import React from 'react';
import { AbsoluteFill } from 'remotion';
import { FONT } from '../../kits/whatif/theme';
import { Ba, Mun, NguoiLa, Teo, ThayNam } from './cast';

/**
 * Review still of the "Mùn" cast (D-106) for the owner's approval: the five fixed characters on a
 * night background with their names (video content, so Vietnamese).
 * `npx remotion still src/channels.ts HorrorCast out.png`
 */
const CAST = [
  { name: 'MÙN', Who: Mun },
  { name: 'BÀ', Who: Ba },
  { name: 'THẦY NĂM', Who: ThayNam },
  { name: 'TÈO', Who: Teo },
  { name: 'NGƯỜI LẠ', Who: NguoiLa },
] as const;

export const HorrorCastSheet: React.FC = () => (
  <AbsoluteFill style={{ background: '#0f1220' }}>
    <svg viewBox="0 0 1920 1080" width={1920} height={1080}>
      <rect width={1920} height={1080} fill="#0f1220" />
      <rect y={860} width={1920} height={220} fill="#1b1a22" />
      {CAST.map(({ name, Who }, i) => {
        const x = 260 + i * 350;
        return (
          <g key={name}>
            <Who x={x} y={860} t={0} />
            <text
              x={x}
              y={960}
              textAnchor="middle"
              fontFamily={FONT}
              fontSize={44}
              fontWeight={700}
              fill="#e8e4da"
            >
              {name}
            </text>
          </g>
        );
      })}
    </svg>
  </AbsoluteFill>
);
