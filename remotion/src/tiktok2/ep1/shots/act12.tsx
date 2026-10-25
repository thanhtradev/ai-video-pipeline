import React from 'react';
import { AbsoluteFill, interpolate } from 'remotion';
import { invis, Sparkles } from '../Character';
import { Ban, bodyCam, clamp, faceCam, hit, loopFor, Me, ShotDef } from '../kit';
import { livingRoom } from '../sets';
import { SetStage } from '../SetStage';
import { cutCam } from '../Stage';
import { C, FONT, HAND } from '../theme';
import { tr, useShot } from '../time';
import { BigText, PortraitBox, Pow } from '../ui';

/** Living room – fixed positions. */
export const MOM = { x: 300, y: 1470, s: 1.08 };
export const BAN = { x: 760, y: 1530, s: 1 };

// ───────── 1.1 HOOK ─────────
const S11: React.FC = () => {
  const { f, dur, at, L } = useShot('1.1');
  const tWide = at('L001', 'nhưng');
  const tVanish = at('L001', 'nín');
  const iv = invis(f, [[tVanish, 'vanish']]);
  const cam = cutCam(
    f,
    [
      {
        at: 0,
        a: faceCam(BAN.x, BAN.y, 1, 4.4, 6),
        b: faceCam(BAN.x, BAN.y, 1, 4.9, 6),
        hold: true,
      },
      { at: tWide, a: { x: 560, y: 1020, z: 1.08 }, b: { x: 580, y: 1040, z: 1.18 }, hold: true },
      { at: L('L002'), a: bodyCam(BAN.x, BAN.y, 1, 1.75), b: bodyCam(BAN.x, BAN.y, 1, 2.1) },
    ],
    dur,
  );
  const puff =
    interpolate(f, [4, 30], [0, 1], clamp) *
    interpolate(f, [tVanish, tVanish + 8], [1, 0.5], clamp);
  return (
    <AbsoluteFill>
      <SetStage
        set={livingRoom(f, { table: true })}
        cam={cam}
        f={f}
        actors={
          <Ban
            x={BAN.x}
            y={BAN.y}
            t={f}
            eyes={f < 12 ? 'wide' : 'squint'}
            puff={puff}
            shiver={f > tVanish ? 0.6 : 0}
            {...iv}
            px={cam.z}
          />
        }
      />
      <BigText
        lines={tr(
          ['NẾU BẠN TÀNG HÌNH', 'KHI NÍN THỞ?'],
          ['WHAT IF YOU TURNED INVISIBLE', 'WHILE HOLDING YOUR BREATH?'],
        )}
        from={2}
        f={f}
        accent={[1]}
        y={500}
        size={tr(100, 84)}
      />
    </AbsoluteFill>
  );
};

// ───────── 2.1 the test paper ─────────
const TestPaper: React.FC<{ f: number; three: number; red: number }> = ({ f, three, red }) => (
  <g>
    <rect x={-330} y={-430} width={660} height={860} rx={10} fill="#f4efe4" />
    <rect
      x={-330}
      y={-430}
      width={660}
      height={860}
      rx={10}
      fill="none"
      stroke="#d6cdb8"
      strokeWidth={4}
    />
    <text
      x={0}
      y={-340}
      textAnchor="middle"
      fontFamily={FONT}
      fontWeight={800}
      fontSize={46}
      fill="#4a4652"
    >
      {tr('BÀI KIỂM TRA MÔN TOÁN', 'MATH TEST')}
    </text>
    <text x={-290} y={-270} fontFamily={FONT} fontWeight={600} fontSize={34} fill="#6a6670">
      {tr('Họ tên: ...................... Lớp: 8A3', 'Name: ...................... Class: 8A3')}
    </text>
    {Array.from({ length: 7 }, (_, i) => (
      <g key={i}>
        <line
          x1={-290}
          y1={-180 + i * 70}
          x2={290}
          y2={-180 + i * 70}
          stroke="#cfc8b6"
          strokeWidth={3}
        />
        <path
          d={`M-280 ${-195 + i * 70} q30 -24 60 0 t60 0 t60 0 ${i % 2 ? 't60 0 t60 0' : ''}`}
          stroke="#5a6a8a"
          strokeWidth={4}
          fill="none"
        />
        {i % 3 === 1 && (
          <path
            d={`M${120} ${-205 + i * 70} l20 20 l20 -20 m-40 0 l40 20`}
            stroke="#d23a2a"
            strokeWidth={5}
            fill="none"
            opacity={red}
          />
        )}
      </g>
    ))}
    {/* red circled score 3 */}
    <g transform="translate(200,-300)" opacity={three > 0 ? 1 : 0}>
      <text
        x={0}
        y={40}
        textAnchor="middle"
        fontFamily={FONT}
        fontWeight={800}
        fontSize={150}
        fill="#d23a2a"
        transform={`scale(${interpolate(three, [0, 0.4, 0.6], [0, 1.25, 1], clamp)})`}
      >
        3
      </text>
      <circle
        r={92}
        fill="none"
        stroke="#d23a2a"
        strokeWidth={9}
        strokeDasharray={`${580 * three} 600`}
        transform="rotate(-100)"
      />
    </g>
    <text
      x={-280}
      y={360}
      fontFamily={HAND}
      fontWeight={800}
      fontSize={58}
      fill="#d23a2a"
      opacity={red}
      transform={`rotate(-4) translate(${(1 - red) * -30},0)`}
    >
      {tr('Cần cố gắng nhiều hơn!!', 'Needs more effort!!')}
    </text>
    {/* Mom's hand holding the paper edge */}
    <circle cx={-330} cy={60 + Math.sin(f / 7) * 3} r={52} fill={C.ink} />
    <circle cx={330} cy={40 + Math.sin(f / 7 + 1) * 3} r={52} fill={C.ink} />
  </g>
);
const S21: React.FC = () => {
  const { f, dur, at, L } = useShot('2.1');
  const three = interpolate(f, [at('L004', 'ba'), at('L004', 'ba') + 14], [0, 1], clamp);
  const red = interpolate(f, [L('L005'), L('L005') + 12], [0, 1], clamp);
  const zoom =
    f < L('L004') ? interpolate(f, [0, L('L004')], [0.92, 1.0]) : f < L('L005') ? 1.35 : 1.18;
  const center =
    f < L('L004') ? { x: 0, y: 0 } : f < L('L005') ? { x: -200, y: 300 } : { x: 120, y: -260 };
  return (
    <AbsoluteFill>
      <SetStage
        set={livingRoom(f)}
        cam={{ x: MOM.x + 330, y: MOM.y - 470, z: 1.75 + f * 0.0012 }}
        f={f}
        blurBg={8}
        actors={
          <Me
            x={MOM.x}
            y={MOM.y}
            t={f}
            facing={1}
            eyes={f < L('L004') ? 'half' : 'half'}
            look={{ x: 0.9, y: 0.3 }}
            pose="reach"
            handR={{ x: 230, y: -330 }}
          />
        }
      />
      <PortraitBox s={0.5} dy={30} dx={60}>
        <svg width={1080} height={1920} style={{ position: 'absolute', overflow: 'visible' }}>
          <g
            transform={`translate(${540 + center.x * (zoom - 0.92)},${900 + center.y * (zoom - 0.92)}) scale(${zoom}) rotate(${-3 + Math.sin(f / 30) * 1.2})`}
          >
            <TestPaper f={f} three={three} red={red} />
          </g>
        </svg>
      </PortraitBox>
      {dur && null}
    </AbsoluteFill>
  );
};

// ───────── 2.2 "Lại." "Đây." ─────────
const S22: React.FC = () => {
  const { f, dur, at, L } = useShot('2.2');
  const slap = at('L007', 'đây');
  const hand =
    f < slap - 4
      ? { x: 110, y: -330 }
      : { x: 120, y: interpolate(f, [slap - 4, slap], [-330, -236], clamp) };
  const cam = cutCam(
    f,
    [
      { at: 0, a: bodyCam(MOM.x, MOM.y, MOM.s, 1.9), b: bodyCam(MOM.x + 20, MOM.y, MOM.s, 2.1) },
      { at: L('L007') - 2, a: { x: 420, y: 1180, z: 2.0 }, b: { x: 420, y: 1170, z: 2.2 } },
    ],
    dur,
  );
  return (
    <SetStage
      set={livingRoom(f)}
      cam={cam}
      f={f}
      shake={f >= slap && f < slap + 8 ? 6 : 0}
      actors={
        <Me
          x={MOM.x}
          y={MOM.y}
          t={f}
          facing={1}
          eyes="half"
          pose="hold"
          handR={hand}
          itemR={f < slap ? 'paper' : undefined}
        />
      }
      front={
        f >= slap ? (
          <rect
            x={360}
            y={1192}
            width={150}
            height={20}
            fill="#f4efe4"
            transform="rotate(-6 430 1200)"
          />
        ) : null
      }
    />
  );
};

// ───────── 2.3 "Bạn sợ." deep breath, hold ─────────
const S23: React.FC = () => {
  const { f, dur, at, L } = useShot('2.3');
  const tNin = at('L010', 'nín');
  const iv = invis(f, [[tNin + 4, 'vanish']]);
  const cam = cutCam(
    f,
    [
      { at: 0, a: faceCam(BAN.x, BAN.y, 1, 4.6, 0), b: faceCam(BAN.x, BAN.y, 1, 4.9, 0) },
      { at: L('L009') - 2, a: faceCam(BAN.x, BAN.y, 1, 2.6), b: faceCam(BAN.x, BAN.y, 1, 3.1) },
      { at: L('L010') - 2, a: bodyCam(BAN.x, BAN.y, 1, 1.55), b: bodyCam(BAN.x, BAN.y, 1, 1.7) },
    ],
    dur,
  );
  const puff = interpolate(f, [L('L009'), L('L009') + 30], [0, 1], clamp);
  return (
    <SetStage
      set={livingRoom(f)}
      cam={cam}
      f={f}
      shake={f < L('L009') ? 2 : 0}
      actors={
        <Ban
          x={BAN.x}
          y={BAN.y}
          t={f}
          eyes={f < L('L009') + 20 ? 'look' : 'squint'}
          look={{ x: -0.6, y: 0.2 }}
          shiver={f < L('L009') ? 1.4 : 0.5}
          puff={puff}
          {...iv}
          px={cam.z}
        />
      }
    />
  );
};

// ───────── 2.4 over-shoulder of Mom: your seat is empty ─────────
const S24: React.FC = () => {
  const { f, dur, L } = useShot('2.4');
  const ua = L('L014');
  const look = f < ua ? { x: 0.6, y: 0 } : { x: Math.sin((f - ua) / 6) > 0 ? 1 : -1, y: 0 };
  const lift = interpolate(f, [0, 10], [0.6, -0.1], clamp);
  const cam = cutCam(
    f,
    [
      { at: 0, a: { x: 540, y: 1040, z: 1.3 }, b: { x: 560, y: 1040, z: 1.42 } },
      { at: ua - 2, a: faceCam(MOM.x, MOM.y, MOM.s, 2.5), b: faceCam(MOM.x, MOM.y, MOM.s, 2.7) },
    ],
    dur,
  );
  return (
    <SetStage
      set={livingRoom(f)}
      cam={cam}
      f={f}
      actors={
        <>
          <Me
            x={MOM.x}
            y={MOM.y}
            t={f}
            facing={f < ua ? 1 : 0}
            eyes={f < ua ? 'normal' : 'wide'}
            look={f < ua ? { x: 0.9, y: lift } : look}
          />
          <Ban
            x={BAN.x}
            y={BAN.y}
            t={f}
            invisible={1}
            eyes="squint"
            puff={1}
            shiver={0.4}
            px={cam.z}
          />
        </>
      }
    />
  );
};

// ───────── 2.5 Mom looks under the table (low angle) ─────────
const S25: React.FC = () => {
  const { f, dur, L } = useShot('2.5');
  const peek = interpolate(f, [L('L017'), L('L017') + 14], [0, 1], clamp);
  const cam = cutCam(
    f,
    [{ at: 0, a: { x: 470, y: 1330, z: 1.55 }, b: { x: 460, y: 1350, z: 1.75 } }],
    dur,
  );
  return (
    <SetStage
      set={livingRoom(f)}
      cam={cam}
      f={f}
      actors={
        <>
          <Me
            x={MOM.x + 60}
            y={MOM.y - 20}
            t={f}
            facing={1}
            lean={peek * 34}
            eyes="wide"
            look={{ x: 0.8, y: 0.6 }}
            pose="reach"
          />
          <Ban
            x={BAN.x}
            y={BAN.y}
            t={f}
            invisible={1}
            eyes="squint"
            puff={1}
            shiver={0.4}
            px={cam.z}
          />
        </>
      }
    />
  );
};

// ───────── 2.6 Mom opens the fridge ─────────
const S26: React.FC = () => {
  const { f, dur, at, L, H } = useShot('2.6');
  const open = interpolate(f, [at('L019', 'mở'), at('L019', 'mở') + 10], [0, 1], clamp);
  const turn = f > H('L020') + 6;
  const cam = cutCam(
    f,
    [
      { at: 0, a: { x: 720, y: 1080, z: 1.25 }, b: { x: 740, y: 1080, z: 1.35 } },
      { at: L('L020') - 2, a: { x: 800, y: 1020, z: 2.1 }, b: { x: 800, y: 1010, z: 2.3 } },
      {
        at: H('L020'),
        a: faceCam(700, 1470, MOM.s, 2.7),
        b: faceCam(700, 1470, MOM.s, 3.0),
        hold: true,
      },
    ],
    dur,
  );
  return (
    <SetStage
      set={{
        ...livingRoom(f, { fridgeOpen: open }),
        glow:
          open > 0
            ? { x: 820, y: 1100, r: 520, color: '#e8f4ff', a: 0.55 * open }
            : livingRoom(f).glow,
      }}
      cam={cam}
      f={f}
      actors={
        <>
          <Ban
            x={BAN.x - 560}
            y={BAN.y}
            t={f}
            invisible={1}
            eyes="squint"
            puff={1}
            shiver={0.5}
            px={cam.z}
          />
          <Me
            x={700}
            y={1470}
            t={f}
            facing={turn ? 0 : 1}
            eyes={turn ? 'half' : 'normal'}
            look={turn ? { x: -0.2, y: 0 } : { x: 1, y: 0.4 }}
            pose={open > 0.5 && !turn ? 'reach' : 'stand'}
          />
        </>
      }
    />
  );
};

// ───────── 2.7 ECU faint outline puffing cheeks ─────────
const S27: React.FC = () => {
  const { f, dur, L } = useShot('2.7');
  const cam = cutCam(
    f,
    [
      { at: 0, a: faceCam(BAN.x, BAN.y, 1, 4.2, 10), b: faceCam(BAN.x, BAN.y, 1, 4.6, 10) },
      { at: L('L022') - 2, a: faceCam(BAN.x, BAN.y, 1, 3.0), b: faceCam(BAN.x, BAN.y, 1, 3.3) },
    ],
    dur,
  );
  return (
    <SetStage
      set={livingRoom(f)}
      cam={cam}
      f={f}
      shake={2.5}
      actors={
        <>
          <Ban
            x={BAN.x}
            y={BAN.y}
            t={f}
            invisible={1}
            eyes="squint"
            puff={1.25}
            shiver={1.6}
            px={cam.z}
          />
          <g opacity={0.5 + 0.3 * Math.sin(f / 4)}>
            <ellipse
              cx={BAN.x}
              cy={BAN.y - 430}
              rx={110}
              ry={70}
              fill="#ff6a4a"
              opacity={0.25}
              style={{ filter: 'blur(18px)' }}
            />
          </g>
        </>
      }
    />
  );
};

// ───────── 2.8 Mom turns back and looks straight ahead ─────────
const S28: React.FC = () => {
  const { f, dur, at, L } = useShot('2.8');
  const turn = at('L024', 'quay');
  const cam = cutCam(
    f,
    [
      { at: 0, a: { x: 640, y: 1080, z: 1.3 }, b: { x: 620, y: 1070, z: 1.4 } },
      {
        at: L('L025') - 2,
        a: faceCam(560, 1470, MOM.s, 2.3),
        b: faceCam(560, 1470, MOM.s, 3.2),
        hold: true,
      },
    ],
    dur,
  );
  return (
    <SetStage
      set={livingRoom(f, { fridgeOpen: 0 })}
      cam={cam}
      f={f}
      actors={
        <>
          <Me
            x={interpolate(f, [0, turn], [700, 560], clamp)}
            y={1470}
            t={f}
            facing={f < turn ? -1 : 0}
            pose={f < turn ? 'walk' : 'stand'}
            eyes={f > L('L025') ? 'half' : 'normal'}
            look={{ x: 0, y: 0.1 }}
          />
          <Ban
            x={BAN.x + 80}
            y={BAN.y + 20}
            size={1.0}
            t={f}
            invisible={1}
            eyes="squint"
            puff={1.2}
            shiver={1}
            px={cam.z}
          />
        </>
      }
    />
  );
};

// ───────── 2.9 "Phù!" right in front of Mom ─────────
const S29: React.FC = () => {
  const { f, dur, at, L } = useShot('2.9');
  const pop = at('L026', 'thở');
  const iv = invis(f, [[pop, 'appear']], true);
  const cam = cutCam(
    f,
    [
      { at: 0, a: { x: 640, y: 960, z: 2.2 }, b: { x: 640, y: 960, z: 2.4 } },
      { at: L('L028') - 2, a: { x: 610, y: 940, z: 1.7 }, b: { x: 610, y: 940, z: 1.85 } },
    ],
    dur,
  );
  return (
    <AbsoluteFill>
      <SetStage
        set={livingRoom(f)}
        cam={cam}
        f={f}
        actors={
          <>
            <Me x={500} y={1470} t={f} facing={1} eyes="normal" look={{ x: 1, y: 0 }} />
            <Ban
              x={760}
              y={1530}
              size={1.02}
              t={f}
              facing={-1}
              eyes={f < pop + 10 ? 'squint' : 'happy'}
              puff={f < pop ? 1.2 : 0}
              {...iv}
              px={cam.z}
            />
          </>
        }
      />
      <Pow text={tr('PHÙ!', 'PHEW!')} x={650} y={560} from={L('L027')} f={f} size={170} rot={-8} />
    </AbsoluteFill>
  );
};

// ───────── 2.10 "Á!" ─────────
const S210: React.FC = () => {
  const { f, dur } = useShot('2.10');
  const cam = cutCam(
    f,
    [{ at: 0, a: faceCam(500, 1470, MOM.s, 2.8), b: faceCam(500, 1470, MOM.s, 3.1), hold: true }],
    dur,
  );
  return (
    <AbsoluteFill>
      <SetStage
        set={livingRoom(f)}
        cam={cam}
        f={f}
        shake={interpolate(f, [0, 20], [18, 4], clamp)}
        actors={
          <Me
            x={500}
            y={1470 - Math.max(0, 30 - f * 4)}
            t={f}
            facing={0}
            eyes="wide"
            pose="armsUp"
          />
        }
      />
      <Pow
        text={tr('Á!', 'AH!')}
        x={300}
        y={400}
        from={2}
        f={f}
        size={190}
        color={C.mom}
        rot={10}
      />
    </AbsoluteFill>
  );
};

// ───────── 2.11 Mom chases around the table with a feather duster ─────────
const S211: React.FC = () => {
  const { f, dur, L } = useShot('2.11');
  const run = (lag: number) => {
    const th = (f - lag) / 26;
    const x = 430 + Math.cos(th) * 360;
    const y = 1450 + Math.sin(th) * 90;
    const s = 0.9 + Math.sin(th) * 0.08;
    return { x, y, s, facing: -Math.sin(th) > 0 ? 1 : -1, behind: Math.sin(th) < 0 };
  };
  const b = run(0);
  const m = run(26);
  const actor = (who: 'b' | 'm') => {
    const p = who === 'b' ? b : m;
    return who === 'b' ? (
      <Ban
        key="b"
        x={p.x}
        y={p.y}
        size={p.s}
        t={f}
        pose="run"
        facing={p.facing}
        eyes="squint"
        speed={1.1}
      />
    ) : (
      <Me
        key="m"
        x={p.x}
        y={p.y}
        size={p.s * MOM.s}
        t={f}
        pose="run"
        facing={p.facing}
        eyes="half"
        itemR="duster"
        handR={{ x: p.facing * 120, y: -470 + Math.sin(f / 3) * 60 }}
        speed={1.1}
      />
    );
  };
  const cam = cutCam(
    f,
    [
      { at: 0, a: { x: 470, y: 1040, z: 0.95 }, b: { x: 470, y: 1040, z: 1.05 } },
      { at: L('L031') - 2, a: { x: 470, y: 1100, z: 1.25 }, b: { x: 470, y: 1100, z: 1.15 } },
    ],
    dur,
  );
  const behind = [b, m].map((p, i) => (p.behind ? actor(i ? 'm' : 'b') : null));
  const inFront = [b, m].map((p, i) => (!p.behind ? actor(i ? 'm' : 'b') : null));
  return (
    <SetStage
      set={{ ...livingRoom(f), back: null }}
      cam={cam}
      f={f}
      shake={1.5}
      behind={<>{behind}</>}
      actors={
        <>
          {inFront}
          <Sparkles amount={0} seed={1} t={f} />
        </>
      }
    />
  );
};

export const ACT12: Record<string, ShotDef> = {
  '1.1': {
    C: S11,
    amb: 'living',
    fx: (h) => [
      hit('inhale', 2, 0.9),
      hit('shimmer', h.at('L001', 'nín'), 0.9),
      hit('sparkle', h.at('L001', 'nín') + 6, 0.5),
    ],
  },
  '2.1': {
    C: S21,
    amb: 'living',
    fx: (h) => [hit('paper', 0, 0.7), hit('paper', h.L('L004'), 0.4)],
    capY: 950,
  },
  '2.2': { C: S22, amb: 'living', fx: (h) => [hit('paper_slap', h.at('L007', 'đây'), 0.9)] },
  '2.3': {
    C: S23,
    amb: 'living',
    fx: (h) => [hit('inhale', h.L('L009'), 0.9), hit('shimmer', h.at('L010', 'nín') + 4, 0.8)],
  },
  '2.4': { C: S24, amb: 'living', fx: (h) => [hit('shimmer', 6, 0.35)] },
  '2.5': { C: S25, amb: 'living', fx: (h) => [hit('chair', h.L('L017') - 6, 0.7)] },
  '2.6': {
    C: S26,
    amb: 'living',
    fx: (h) => [
      hit('fridge_open', h.at('L019', 'mở'), 0.8),
      loopFor('fridge_hum_loop', h.at('L019', 'mở') + 10, h.dur, 0.35),
    ],
  },
  '2.7': { C: S27, amb: 'living' },
  '2.8': {
    C: S28,
    amb: 'living',
    fx: (h) => [loopFor('steps_tile_loop', 0, h.at('L024', 'quay') + 4, 0.6, 4)],
  },
  '2.9': {
    C: S29,
    amb: 'living',
    fx: (h) => [hit('pop', h.at('L026', 'thở'), 1), hit('phu', h.L('L027'), 0.5)],
  },
  '2.10': { C: S210, amb: 'living', fx: () => [hit('startle', 0, 0.8), hit('clatter', 4, 0.9)] },
  '2.11': {
    C: S211,
    amb: 'living',
    fx: (h) => [
      loopFor('slipper_run_loop', 0, h.dur, 0.7, 6),
      hit('whoosh', 12, 0.6),
      hit('whoosh', h.L('L031'), 0.5),
      hit('whoosh', h.H('L031') + 10, 0.7),
    ],
  },
};
