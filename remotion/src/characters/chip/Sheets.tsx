import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Character } from '../../rig/Character';
import { livingRoom, lanternStreet } from '../../kits/whatif/sets';
import { SetStage } from '../../kits/whatif/SetStage';
import { WIDE } from '../../kits/whatif/Stage';
import { C, FONT } from '../../kits/whatif/theme';

/** EP1 character / set review sheets (Still). */
export const T2E1CharacterSheet: React.FC = () => {
  const f = useCurrentFrame() + 40;
  const row1 = [
    { n: 'BẠN', c: C.orange, eyes: 'normal' as const },
    { n: '> <', c: C.orange, eyes: 'squint' as const },
    { n: 'nửa mí', c: C.orange, eyes: 'half' as const },
    { n: 'sốc', c: C.orange, eyes: 'wide' as const },
    { n: 'vui', c: C.orange, eyes: 'happy' as const },
  ];
  return (
    <AbsoluteFill style={{ background: '#5a5262' }}>
      <svg width={1080} height={1920}>
        {row1.map((r, i) => (
          <Character
            key={i}
            x={110 + i * 215}
            y={560}
            size={0.55}
            hoodieColor={r.c}
            eyes={r.eyes}
            t={f}
            seed={i + 1}
            blink={false}
          />
        ))}
        <Character
          x={130}
          y={1180}
          size={0.8}
          hoodieColor={C.mom}
          accessories={['bun']}
          eyes="half"
          t={f}
          seed={7}
          facing={1}
          itemR="duster"
          pose="hold"
        />
        <Character x={340} y={1180} size={0.5} hoodieColor={C.bin} eyes="happy" t={f} seed={8} />
        <Character
          x={540}
          y={1180}
          size={0.8}
          hoodieColor={C.huy}
          accessories={['hoodUp']}
          t={f}
          seed={9}
          pose="raise"
        />
        <Character
          x={760}
          y={1180}
          size={0.8}
          hoodieColor={C.aodai}
          accessories={['aodai', 'glassesRound', 'bun']}
          t={f}
          seed={10}
          facing={-1}
        />
        <Character
          x={960}
          y={1180}
          size={0.8}
          hoodieColor={C.principal}
          accessories={['glassesSquare']}
          t={f}
          seed={11}
          itemR="teapot"
          pose="hold"
          facing={-1}
        />
        <Character
          x={150}
          y={1820}
          size={0.8}
          hoodieColor={C.kidnap}
          accessories={['cap']}
          eyes="half"
          t={f}
          seed={12}
          facing={1}
          pose="walk"
        />
        <Character
          x={380}
          y={1820}
          size={0.8}
          hoodieColor={C.orange}
          invisible={1}
          eyes="squint"
          t={f}
          seed={13}
          itemR="bag"
        />
        <Character
          x={600}
          y={1820}
          size={0.8}
          hoodieColor={C.orange}
          pose="run"
          facing={1}
          t={f}
          seed={14}
        />
        <Character
          x={820}
          y={1820}
          size={0.8}
          hoodieColor={C.orange}
          pose="sitGround"
          facing={1}
          eyes="closed"
          t={f}
          seed={15}
          flush={1}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          top: 40,
          width: '100%',
          textAlign: 'center',
          fontFamily: FONT,
          fontWeight: 800,
          fontSize: 60,
          color: '#fff',
        }}
      >
        TikTok 2 · EP1 · nhân vật
      </div>
    </AbsoluteFill>
  );
};

export const T2E1SetSheet: React.FC<{ which: number }> = ({ which }) => {
  const f = useCurrentFrame() + 40;
  const set = which === 0 ? livingRoom(f) : lanternStreet(f);
  return (
    <SetStage
      set={set}
      cam={WIDE}
      f={f}
      actors={
        <>
          <Character
            x={300}
            y={1470}
            size={1.1}
            hoodieColor={C.mom}
            accessories={['bun']}
            t={f}
            seed={2}
            facing={1}
            eyes="half"
          />
          <Character x={700} y={1520} size={1.1} t={f} seed={3} facing={-1} />
        </>
      }
    />
  );
};
