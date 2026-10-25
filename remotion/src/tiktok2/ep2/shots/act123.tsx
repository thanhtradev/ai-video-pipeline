import React from 'react';
import { AbsoluteFill, interpolate, random } from 'remotion';
import { Character } from '../../ep1/Character';
import { minimal } from '../../ep1/sets';
import { cutCam, WIDE } from '../../ep1/Stage';
import { C, FONT } from '../../ep1/theme';
import { BigText, IconBubble, Pow } from '../../ep1/ui';
import {
  Ban,
  ClonerCounter,
  Clone,
  clamp,
  Dust,
  faceCam,
  hit,
  loopFor,
  Me,
  PopRing,
  popIn,
  ShotDef,
  snapPop,
  SnapHand,
  Stage2,
} from '../kit';
import { bedroomDay } from '../sets';
import { useShot } from '../time';

/** Lying on a bed (rotated horizontal around the heels). headLeft: head on the left. */
export const LyingKid: React.FC<{
  who?: number;
  x: number;
  y: number;
  f: number;
  eyes?: 'normal' | 'closed' | 'half' | 'happy' | 'wide';
  headLeft?: boolean;
  lean?: number;
  opacity?: number;
  squash?: number;
}> = ({ who = 0, x, y, f, eyes = 'normal', headLeft = true, lean, opacity, squash }) => (
  <Character
    x={x}
    y={y}
    size={1}
    seed={who === 0 ? 1 : 100 + who}
    hoodieColor={C.orange}
    hair
    t={f}
    lean={lean ?? (headLeft ? -90 : 90)}
    eyes={eyes}
    shadow={false}
    blink={eyes !== 'closed'}
    opacity={opacity}
    squash={squash}
  />
);
const Blanket: React.FC<{ x0: number; x1: number; y: number; f: number }> = ({ x0, x1, y, f }) => (
  <path
    d={`M${x0} ${y} Q${(x0 + x1) / 2} ${y - 46 + Math.sin(f / 40) * 5} ${x1} ${y} L${x1 + 30} ${y + 130} L${x0 - 20} ${y + 130} Z`}
    fill="#d08a5a"
  />
);

// ───────── 1.1 HOOK: snap → 5 clones in a row ─────────
const S11: React.FC = () => {
  const { f, dur } = useShot('1.1');
  const snap = 10;
  const wide = 18;
  const pops = [24, 29, 33, 37, 40];
  const n = 1 + pops.filter((p) => f >= p).length;
  const xs = [-120, 160, 840, 1120, 1400];
  return (
    <AbsoluteFill>
      {f < wide ? (
        <Stage2
          set={bedroomDay(f)}
          cam={{ x: 500, y: 980, z: 1.6 }}
          f={f}
          blurBg={12}
          actors={<SnapHand x={560} y={1020} f={f} at={snap} s={1.1} />}
        />
      ) : (
        <Stage2
          set={bedroomDay(f)}
          cam={cutCam(
            f,
            [{ at: 0, a: { x: 640, y: 1000, z: 0.95 }, b: { x: 640, y: 1000, z: 1.05 } }],
            dur,
          )}
          f={f}
          actors={
            <>
              {xs.map((x, i) => {
                const p = popIn(f, pops[i]);
                return (
                  <g key={i}>
                    <PopRing x={x} y={1480} u={f - pops[i]} />
                    <Clone
                      k={i + 1}
                      x={x}
                      y={1480}
                      t={f}
                      opacity={p.opacity}
                      squash={p.squash}
                      sparkle={p.sparkle}
                      eyes={f > 50 ? 'happy' : 'normal'}
                    />
                  </g>
                );
              })}
              <Ban x={500} y={1540} t={f} pose="raise" eyes="happy" />
            </>
          }
        />
      )}
      <ClonerCounter
        n={n}
        f={f}
        changedAt={f >= pops[0] ? pops[n - 2] : 0}
        show={f >= wide ? 1 : 0}
      />
      <BigText
        lines={['NẾU BẠN NHÂN BẢN ĐƯỢC', 'CHÍNH MÌNH?']}
        from={2}
        f={f}
        accent={[1]}
        y={300}
        size={110}
      />
    </AbsoluteFill>
  );
};

// ───────── 2.1 Six in the morning: alarm clock ─────────
const S21: React.FC = () => {
  const { f, dur, L } = useShot('2.1');
  const cam = cutCam(
    f,
    [
      { at: 0, a: { x: -20, y: 1170, z: 3.0 }, b: { x: -20, y: 1170, z: 3.3 } },
      { at: L('L005') - 2, a: { x: 160, y: 1240, z: 1.9 }, b: { x: 160, y: 1240, z: 2.0 } },
    ],
    dur,
  );
  const reach = f >= L('L005');
  return (
    <Stage2
      set={bedroomDay(f, { ring: true })}
      cam={cam}
      f={f}
      actors={
        <>
          <LyingKid x={720} y={1305} f={f} eyes="closed" />
          <Blanket x0={360} x1={980} y={1250} f={f} />
          {reach && (
            <path
              d={`M300 1270 Q160 ${1200 - Math.sin(f / 3) * 10} 40 1210`}
              stroke={C.orange}
              strokeWidth={34}
              fill="none"
              strokeLinecap="round"
            />
          )}
          {reach && <circle cx={30} cy={1206} r={19} fill={C.ink} />}
        </>
      }
    />
  );
};

// ───────── 2.2 Today's to-do list ─────────
const TODO = [
  'Học chính – sáng',
  'Học thêm Toán – chiều',
  'Học thêm Anh – tối',
  'Thuyết trình: 0 chữ',
];
const S22: React.FC = () => {
  const { f, dur, L } = useShot('2.2');
  const at = ['L007', 'L008', 'L009', 'L010'].map((id) => L(id));
  const cam = cutCam(
    f,
    [
      { at: 0, a: { x: 480, y: 1410, z: 1.9 }, b: { x: 490, y: 1410, z: 2.05 } },
      { at: at[2] - 2, a: { x: 410, y: 1300, z: 2.3 }, b: { x: 418, y: 1300, z: 2.45 } },
    ],
    dur,
  );
  return (
    <AbsoluteFill>
      <Stage2
        set={bedroomDay(f)}
        cam={cam}
        f={f}
        actors={
          <>
            <LyingKid x={720} y={1305} f={f} eyes="half" />
            <Blanket x0={360} x1={980} y={1250} f={f} />
          </>
        }
      />
      <div
        style={{
          position: 'absolute',
          left: 980,
          top: 170,
          width: 780,
          background: 'rgba(246,241,230,0.94)',
          borderRadius: 28,
          padding: '28px 40px',
          boxShadow: '0 20px 40px rgba(0,0,0,0.35)',
          transform: `rotate(2deg) scale(${interpolate(f, [0, 8], [0.6, 1], clamp)})`,
          opacity: interpolate(f, [0, 6], [0, 1], clamp),
        }}
      >
        <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 52, color: '#3a3346' }}>
          HÔM NAY:
        </div>
        {TODO.map((t, i) => (
          <div
            key={i}
            style={{
              fontFamily: FONT,
              fontWeight: 800,
              fontSize: 46,
              color: i === 3 ? '#d23a2a' : '#4a4652',
              opacity: interpolate(f, [at[i], at[i] + 6], [0, 1], clamp),
              transform: `translateX(${interpolate(f, [at[i], at[i] + 8], [30, 0], clamp)}px)`,
              marginTop: 10,
            }}
          >
            ☐ {t}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

// ───────── 2.3–2.4 Lying looking at the ceiling (top-down) · snap ─────────
const TopDown: React.FC<{
  f: number;
  eyes?: 'half' | 'normal' | 'wide';
  look?: { x: number; y: number };
  hand?: number;
}> = ({ f, eyes = 'half', look = { x: 0, y: -0.6 }, hand }) => (
  <svg width={1920} height={1080} style={{ position: 'absolute' }}>
    <rect width={1920} height={1080} fill="#b49a80" />
    {Array.from({ length: 14 }, (_, i) => (
      <line key={i} x1={0} y1={i * 80} x2={1920} y2={i * 80} stroke="#00000018" strokeWidth={3} />
    ))}
    <rect x={560} y={-200} width={800} height={1500} rx={30} fill="#7a604e" />
    <rect x={590} y={-180} width={740} height={1440} rx={24} fill="#e3dccd" />
    <ellipse cx={960} cy={150} rx={260} ry={110} fill="#efe8da" />
    <g transform={`translate(960,${780})`}>
      <Character
        x={0}
        y={0}
        size={1.05}
        seed={1}
        hoodieColor={C.orange}
        hair
        t={f}
        eyes={eyes}
        look={look}
        shadow={false}
      />
    </g>
    <path
      d={`M590 ${700 + Math.sin(f / 40) * 6} Q960 ${640} 1330 ${700} L1330 1300 L590 1300 Z`}
      fill="#d08a5a"
    />
    {hand !== undefined && <SnapHand x={1240} y={470} f={f} at={hand} s={0.7} />}
  </svg>
);
const S23: React.FC = () => {
  const { f } = useShot('2.3');
  return (
    <AbsoluteFill style={{ transform: `scale(${1 + f * 0.0015}) rotate(${f * 0.02}deg)` }}>
      <TopDown f={f} />
    </AbsoluteFill>
  );
};
const S24: React.FC = () => {
  const { f, L } = useShot('2.4');
  const snap = L('L016') + 2;
  const ecu = f >= L('L014') - 2;
  return ecu ? (
    <AbsoluteFill>
      <Stage2
        set={bedroomDay(f)}
        cam={{ x: 500, y: 1100, z: 1.7 + (f - L('L014')) * 0.003 }}
        f={f}
        blurBg={12}
        actors={<SnapHand x={540} y={1060} f={f} at={snap} s={1.1} />}
      />
      {f >= snap && <Pow text="TÁCH!" x={700} y={420} from={snap} f={f} size={150} rot={-8} />}
    </AbsoluteFill>
  ) : (
    <AbsoluteFill style={{ transform: `scale(${1.35 + f * 0.002})` }}>
      <TopDown f={f} eyes="normal" look={{ x: 0.4, y: -0.8 }} />
    </AbsoluteFill>
  );
};

// ───────── 2.5 Someone sits up at the end of the bed ─────────
const S25: React.FC = () => {
  const { f, dur, at, L } = useShot('2.5');
  const rise = interpolate(f, [at('L018', 'ngồi'), at('L018', 'ngồi') + 18], [86, 0], clamp);
  const cx = 880;
  const cam = cutCam(
    f,
    [
      { at: 0, a: { x: 600, y: 1080, z: 1.25 }, b: { x: 620, y: 1080, z: 1.35 } },
      { at: L('L019') - 2, a: { x: cx, y: 1160, z: 2.2 }, b: { x: cx, y: 1160, z: 2.35 } },
      { at: L('L020') - 2, a: { x: cx, y: 760, z: 3.4 }, b: { x: cx, y: 760, z: 3.6 } },
      { at: L('L021') - 2, a: faceCam(cx, 1330, 1, 2.8), b: faceCam(cx, 1330, 1, 3.1) },
    ],
    dur,
  );
  return (
    <Stage2
      set={bedroomDay(f)}
      cam={cam}
      f={f}
      actors={
        <>
          <Character
            x={300}
            y={1330}
            size={1}
            seed={1}
            hoodieColor={C.orange}
            hair
            t={f}
            pose="sitChair"
            facing={1}
            eyes="wide"
          />
          <Blanket x0={420} x1={980} y={1270} f={f} />
          <Clone
            k={1}
            x={cx}
            y={1330}
            t={f}
            pose="sitChair"
            facing={-1}
            lean={rise}
            eyes={rise > 40 ? 'closed' : 'half'}
          />
          <PopRing x={cx} y={1330} u={f} />
        </>
      }
    />
  );
};

// ───────── 2.6 Two identical faces ─────────
const S26: React.FC = () => {
  const { f, dur, L } = useShot('2.6');
  const cam = cutCam(
    f,
    [
      { at: 0, a: faceCam(880, 1330, 1, 2.7), b: faceCam(880, 1330, 1, 2.9) },
      { at: L('L023') - 2, a: faceCam(300, 1330, 1, 2.7), b: faceCam(300, 1330, 1, 2.9) },
      { at: L('L023') + 22, a: { x: 590, y: 920, z: 1.6 }, b: { x: 590, y: 920, z: 1.7 } },
    ],
    dur,
  );
  return (
    <Stage2
      set={bedroomDay(f)}
      cam={cam}
      f={f}
      actors={
        <>
          <Character
            x={300}
            y={1330}
            size={1}
            seed={1}
            hoodieColor={C.orange}
            hair
            t={f}
            pose="sitChair"
            facing={1}
            eyes="wide"
          />
          <Clone k={1} x={880} y={1330} t={f} pose="sitChair" facing={-1} eyes="wide" />
        </>
      }
    />
  );
};
const S27: React.FC = () => {
  const { f, dur, L } = useShot('2.7');
  return (
    <Stage2
      set={bedroomDay(f)}
      cam={cutCam(
        f,
        [
          { at: 0, a: faceCam(880, 1330, 1, 3.0), b: faceCam(880, 1330, 1, 3.2) },
          { at: L('L025') - 2, a: faceCam(880, 1330, 1, 2.3), b: faceCam(880, 1330, 1, 2.5) },
        ],
        dur,
      )}
      f={f}
      actors={
        <Clone
          k={1}
          x={880}
          y={1330}
          t={f}
          pose="sitChair"
          facing={-1}
          eyes="half"
          lean={Math.sin(f / 10) * 3}
          look={{ x: -0.5, y: 0.2 }}
        />
      }
    />
  );
};

// ───────── 2.8 Rock-paper-scissors ─────────
const RpsHand: React.FC<{
  x: number;
  y: number;
  shape: 'rock' | 'scissors' | 'paper';
  pump: number;
  flip?: boolean;
}> = ({ x, y, shape, pump, flip }) => (
  <g transform={`translate(${x},${y + pump}) scale(${flip ? -1 : 1},1)`}>
    <path
      d="M-600 260 Q-300 160 -60 20"
      stroke={C.orange}
      strokeWidth={150}
      fill="none"
      strokeLinecap="round"
    />
    {shape === 'paper' ? (
      <ellipse rx={120} ry={80} fill={C.ink} stroke={C.rim} strokeWidth={4} />
    ) : (
      <circle r={95} fill={C.ink} stroke={C.rim} strokeWidth={4} />
    )}
    {shape === 'scissors' &&
      [-22, 22].map((d) => (
        <ellipse
          key={d}
          cx={110}
          cy={-50 + d * 2}
          rx={70}
          ry={24}
          fill={C.ink}
          stroke={C.rim}
          strokeWidth={4}
          transform={`rotate(${d} 110 ${-50 + d * 2})`}
        />
      ))}
  </g>
);
const S28: React.FC = () => {
  const { f, dur, L, H } = useShot('2.8');
  const reveal = H('L026');
  const pump = f < reveal ? Math.abs(Math.sin((f / 9) * Math.PI)) * -80 : 0;
  const lose = L('L027');
  const dive = interpolate(f, [lose + 6, lose + 22], [0, 1], clamp);
  return f < lose - 2 ? (
    <AbsoluteFill>
      <Stage2
        set={bedroomDay(f)}
        cam={{ x: 590, y: 1000, z: 1.3 }}
        f={f}
        blurBg={14}
        actors={
          <>
            <RpsHand x={430} y={1050} shape={f < reveal ? 'rock' : 'scissors'} pump={pump} />
            <RpsHand x={760} y={1050} shape="rock" pump={pump} flip />
          </>
        }
      />
      {f >= reveal && (
        <Pow text="✌ vs ✊" x={500} y={300} from={reveal} f={f} size={110} rot={-4} />
      )}
    </AbsoluteFill>
  ) : (
    <Stage2
      set={bedroomDay(f)}
      cam={cutCam(
        f,
        [
          { at: 0, a: { x: 600, y: 1080, z: 1.25 }, b: { x: 600, y: 1080, z: 1.3 } },
          { at: L('L028') - 2, a: faceCam(300, 1330, 1, 2.5), b: faceCam(300, 1330, 1, 2.8) },
        ],
        dur,
      )}
      f={f}
      actors={
        <>
          <Character
            x={300}
            y={1330}
            size={1}
            seed={1}
            hoodieColor={C.orange}
            hair
            t={f}
            pose="sitChair"
            facing={1}
            eyes={f >= L('L028') ? 'half' : 'sad'}
          />
          {dive < 1 ? (
            <Clone
              k={1}
              x={880}
              y={1330}
              t={f}
              pose="sitChair"
              facing={-1}
              lean={dive * 86}
              eyes="happy"
            />
          ) : (
            <LyingKid who={1} x={600} y={1300} f={f} eyes="closed" headLeft={false} />
          )}
          <Blanket x0={460} x1={1000} y={1262} f={f} />
        </>
      }
    />
  );
};

// ───────── 3. RULES (minimal backdrop) ─────────
const R = { x: 500, y: 1560, s: 1.1 };
const rules = minimal('#4b4159', '#2b2535');
const S31: React.FC = () => {
  const { f, dur } = useShot('3.1');
  return (
    <Stage2
      set={rules}
      cam={cutCam(
        f,
        [{ at: 0, a: { ...WIDE, y: 940, z: 1.05 }, b: { ...WIDE, y: 940, z: 1.1 } }],
        dur,
      )}
      f={f}
      actors={
        <>
          <Ban x={R.x} y={R.y} size={R.s} t={f} pose="shrug" />
          <IconBubble x={120} y={820} from={2} f={f}>
            <text y={26} textAnchor="middle" fontSize={70}>
              🫰
            </text>
          </IconBubble>
          <IconBubble x={880} y={780} from={6} f={f}>
            <text y={26} textAnchor="middle" fontSize={70}>
              👥
            </text>
          </IconBubble>
          <IconBubble x={160} y={1240} from={10} f={f}>
            <text y={26} textAnchor="middle" fontSize={70}>
              🕛
            </text>
          </IconBubble>
          <IconBubble x={850} y={1200} from={14} f={f}>
            <text y={26} textAnchor="middle" fontSize={70}>
              🧠
            </text>
          </IconBubble>
        </>
      }
    />
  );
};
const S32: React.FC = () => {
  const { f, dur, at, L } = useShot('3.2');
  const pop = at('L030', 'một bản sao');
  const p = popIn(f, pop);
  return (
    <AbsoluteFill>
      <Stage2
        set={rules}
        cam={cutCam(
          f,
          [
            { at: 0, a: { x: 640, y: 1040, z: 1.15 }, b: { x: 640, y: 1040, z: 1.22 } },
            { at: L('L031') - 2, a: { x: 640, y: 1020, z: 1.4 }, b: { x: 640, y: 1020, z: 1.5 } },
          ],
          dur,
        )}
        f={f}
        actors={
          <>
            <Ban
              x={R.x}
              y={R.y}
              size={R.s}
              t={f}
              pose={f < pop ? 'raise' : 'stand'}
              eyes={f > pop ? 'wide' : 'normal'}
              look={{ x: f > pop ? 1 : 0, y: 0 }}
            />
            <PopRing x={800} y={R.y} u={f - pop} />
            <Clone
              k={1}
              x={800}
              y={R.y}
              size={R.s}
              t={f}
              opacity={p.opacity}
              squash={p.squash}
              sparkle={p.sparkle}
              eyes={f > pop ? 'wide' : 'normal'}
              look={{ x: -1, y: 0 }}
            />
          </>
        }
      />
      <ClonerCounter n={f < pop ? 1 : 2} f={f} changedAt={pop} />
    </AbsoluteFill>
  );
};
/** Side-by-side extreme close-up comparison. */
const Split: React.FC<{ children: (side: 0 | 1) => React.ReactNode; label?: string }> = ({
  children,
  label,
}) => (
  <AbsoluteFill style={{ background: '#2b2535', flexDirection: 'row', gap: 16, padding: 16 }}>
    {[0, 1].map((s) => (
      <div
        key={s}
        style={{
          flex: 1,
          borderRadius: 24,
          overflow: 'hidden',
          background: '#4b4159',
          position: 'relative',
        }}
      >
        <svg width="100%" height="100%" viewBox="0 0 940 1048">
          {children(s as 0 | 1)}
        </svg>
        <div
          style={{
            position: 'absolute',
            left: 30,
            top: 24,
            fontFamily: FONT,
            fontWeight: 800,
            fontSize: 44,
            color: '#fff',
          }}
        >
          {s ? 'BẢN SAO' : 'BẠN'}
        </div>
      </div>
    ))}
    {label && (
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 70,
          textAlign: 'center',
          fontFamily: FONT,
          fontWeight: 800,
          fontSize: 64,
          color: '#ffc83a',
          WebkitTextStroke: '9px #15121a',
          paintOrder: 'stroke fill',
        }}
      >
        {label}
      </div>
    )}
  </AbsoluteFill>
);
const S33: React.FC = () => {
  const { f, L } = useShot('3.3');
  const scar = f >= 0 && f < L('L033') - 2;
  const hairPhase = f < (L('L032') + L('L033')) / 2;
  if (scar)
    return hairPhase ? (
      <Split label="CỌNG TÓC">
        {() => (
          <Character
            x={470}
            y={1650}
            size={2.4}
            seed={1}
            hoodieColor={C.orange}
            hair
            t={f}
            shadow={false}
            blink={false}
          />
        )}
      </Split>
    ) : (
      <Split label="VẾT SẸO ĐẦU GỐI">
        {() => (
          <g>
            <line
              x1={470}
              y1={-100}
              x2={470}
              y2={1200}
              stroke={C.ink}
              strokeWidth={90}
              strokeLinecap="round"
            />
            <path
              d="M430 520 l20 -12 l20 12 l20 -12 l20 12"
              stroke="#c98a8a"
              strokeWidth={8}
              fill="none"
            />
            <ellipse cx={500} cy={1100} rx={120} ry={50} fill="#1d1a22" />
          </g>
        )}
      </Split>
    );
  return (
    <Split label={f < L('L034') - 2 ? 'TRÍ NHỚ GIỐNG HỆT' : 'TỚI ĐÚNG GIÂY XUẤT HIỆN'}>
      {() => (
        <g transform="translate(470,560)">
          <path
            d="M-160 0 Q-200 -170 -40 -200 Q60 -260 150 -170 Q240 -100 180 30 Q160 140 40 150 L-60 150 Q-190 120 -160 0 Z"
            fill="#e8b6c0"
          />
          {Array.from({ length: 6 }, (_, i) => (
            <circle
              key={i}
              cx={-100 + i * 50}
              cy={-60 + (i % 2) * 70}
              r={16}
              fill="#ffd27a"
              opacity={0.5 + 0.5 * Math.sin(f / 4 + i)}
            />
          ))}
        </g>
      )}
    </Split>
  );
};
const S34: React.FC = () => {
  const { f, dur, at, L } = useShot('3.4');
  const t = at('L035', 'tan biến');
  const k = interpolate(f, [t, t + 60], [0, 1], clamp);
  return (
    <AbsoluteFill>
      <Stage2
        set={minimal('#2e2a46', '#1a1828')}
        cam={cutCam(
          f,
          [
            { at: 0, a: { x: 640, y: 1000, z: 1.1 }, b: { x: 640, y: 1000, z: 1.18 } },
            { at: L('L036') - 2, a: { x: 800, y: 1080, z: 1.6 }, b: { x: 800, y: 1080, z: 1.7 } },
          ],
          dur,
        )}
        f={f}
        actors={
          <>
            <Ban
              x={R.x}
              y={R.y}
              size={R.s}
              t={f}
              eyes={k > 0.3 ? 'sad' : 'normal'}
              look={{ x: 1, y: 0 }}
            />
            <Clone
              k={1}
              x={800}
              y={R.y}
              size={R.s}
              t={f}
              opacity={1 - Math.min(1, k * 1.3)}
              eyes="happy"
            />
            <Dust x={800} y={R.y} size={R.s} k={k} f={f} seed={3} />
            <g transform="translate(640,560)">
              <circle r={120} fill="#efe7d6" stroke="#6b5140" strokeWidth={14} />
              <line
                x1={0}
                y1={0}
                x2={0}
                y2={-80}
                stroke="#333"
                strokeWidth={10}
                strokeLinecap="round"
              />
              <line
                x1={0}
                y1={0}
                x2={0}
                y2={-100}
                stroke="#b2463a"
                strokeWidth={5}
                transform={`rotate(${interpolate(f, [0, t], [-30, 0], clamp)})`}
              />
              <text
                y={170}
                textAnchor="middle"
                fontFamily={FONT}
                fontWeight={800}
                fontSize={60}
                fill="#fff"
              >
                12:00
              </text>
            </g>
          </>
        }
      />
    </AbsoluteFill>
  );
};
const S35: React.FC = () => {
  const { f, dur, L } = useShot('3.5');
  const cross = interpolate(f, [L('L039'), L('L039') + 14], [0, 1], clamp);
  const flow = (f % 30) / 30;
  return (
    <AbsoluteFill>
      <Stage2
        set={rules}
        cam={cutCam(
          f,
          [
            { at: 0, a: { x: 650, y: 1020, z: 1.1 }, b: { x: 650, y: 1020, z: 1.18 } },
            { at: L('L040') - 2, a: { x: 650, y: 1080, z: 1.0 }, b: { x: 650, y: 1080, z: 1.05 } },
          ],
          dur,
        )}
        f={f}
        shake={f >= L('L039') && f < L('L039') + 10 ? 5 : 0}
        actors={
          <>
            <Ban x={300} y={R.y} size={R.s} t={f} eyes="normal" look={{ x: 1, y: 0 }} />
            <Clone k={1} x={1000} y={R.y} size={R.s} t={f} eyes="happy" />
            <g>
              <path
                d="M900 860 Q650 700 420 860"
                stroke="#ffd27a"
                strokeWidth={14}
                fill="none"
                strokeDasharray="30 22"
                strokeDashoffset={-flow * 52}
                markerEnd=""
              />
              <path d="M440 840 L400 870 L450 890 Z" fill="#ffd27a" />
              {[0, 1, 2].map((i) => (
                <text
                  key={i}
                  x={880 - ((flow + i / 3) % 1) * 440}
                  y={760 - Math.sin(((flow + i / 3) % 1) * Math.PI) * 120}
                  fontSize={64}
                  textAnchor="middle"
                >
                  {['🎈', '🍜', '⚽'][i]}
                </text>
              ))}
              {cross > 0 && (
                <g stroke="#ff4a3a" strokeWidth={26} strokeLinecap="round">
                  <line
                    x1={560}
                    y1={640}
                    x2={560 + 220 * Math.min(1, cross * 2)}
                    y2={640 + 220 * Math.min(1, cross * 2)}
                  />
                  {cross > 0.5 && (
                    <line
                      x1={780}
                      y1={640}
                      x2={780 - 220 * Math.min(1, (cross - 0.5) * 2)}
                      y2={640 + 220 * Math.min(1, (cross - 0.5) * 2)}
                    />
                  )}
                </g>
              )}
            </g>
          </>
        }
      />
      <BigText
        lines={['NHỚ CHI TIẾT NÀY']}
        from={L('L040')}
        f={f}
        y={130}
        size={110}
        color={C.orange}
        tilt={-3}
      />
    </AbsoluteFill>
  );
};

/** Fingerprint (different seed → different print). */
const Print: React.FC<{ x: number; y: number; seed: number; color?: string; s?: number }> = ({
  x,
  y,
  seed,
  color = '#f2e6d6',
  s = 1,
}) => (
  <g
    transform={`translate(${x},${y}) scale(${s})`}
    fill="none"
    stroke={color}
    strokeWidth={7}
    strokeLinecap="round"
  >
    {Array.from({ length: 9 }, (_, i) => {
      const r = 26 + i * 22;
      const off = random(`fp${seed}${i}`) * 1.2 - 0.6;
      const gap = 0.4 + random(`fg${seed}${i}`) * 0.8;
      const a0 = -Math.PI * 0.95 + off;
      const a1 = Math.PI * 0.95 - gap + off;
      return (
        <path
          key={i}
          d={`M${Math.cos(a0) * r} ${Math.sin(a0) * r * 1.25} A${r} ${r * 1.25} 0 1 1 ${Math.cos(a1) * r} ${Math.sin(a1) * r * 1.25}`}
        />
      );
    })}
  </g>
);
const S36: React.FC = () => {
  const { f, L } = useShot('3.6');
  const stamp = f < L('L043') - 2;
  const twins = f < L('L044') - 2;
  const clones = f < L('L046') - 2;
  const merge = interpolate(f, [L('L045'), L('L045') + 20], [0, 1], clamp);
  return (
    <AbsoluteFill>
      <Stage2
        set={minimal('#3f4a5a', '#262c38')}
        cam={{ ...WIDE, y: 900, z: 1.0 + f * 0.0008 }}
        f={f}
        actors={
          stamp ? null : twins ? (
            <g>
              <Print x={250} y={820} seed={1} />
              <Print x={750} y={820} seed={2} />
              <text
                x={500}
                y={1260}
                textAnchor="middle"
                fontFamily={FONT}
                fontWeight={800}
                fontSize={56}
                fill="#fff"
              >
                Song sinh cùng trứng: KHÁC
              </text>
            </g>
          ) : clones ? (
            <g>
              <Print x={500 - 250 * (1 - merge)} y={820} seed={7} color={C.orange} />
              <Print x={500 + 250 * (1 - merge)} y={820} seed={7} color="#fff3d0" />
              <text
                x={500}
                y={1260}
                textAnchor="middle"
                fontFamily={FONT}
                fontWeight={800}
                fontSize={56}
                fill="#fff"
              >
                {merge > 0.9 ? 'Bạn & bản sao: CHỒNG KHÍT' : 'Bạn & bản sao'}
              </text>
            </g>
          ) : (
            <g fontFamily="Patrick Hand, cursive" fontSize={72} fill="#f2e6d6">
              <text x={120} y={760}>
                Bài tập về nhà ✍
              </text>
              <text x={120} y={940} fill={C.orange}>
                Bài tập về nhà ✍
              </text>
            </g>
          )
        }
      />
      {stamp && (
        <Pow
          text="CHUYỆN THẬT"
          x={500}
          y={900}
          from={0}
          f={f}
          size={130}
          color="#ff7a1a"
          rot={-6}
        />
      )}
    </AbsoluteFill>
  );
};
const S37: React.FC = () => {
  const { f, dur } = useShot('3.7');
  const tap = Math.abs(Math.sin(f / 3)) * 26;
  return (
    <Stage2
      set={minimal('#4b4159', '#2b2535')}
      cam={cutCam(
        f,
        [{ at: 0, a: { x: 640, y: 1380, z: 2.0 }, b: { x: 640, y: 1380, z: 2.15 } }],
        dur,
      )}
      f={f}
      actors={
        <>
          <Character
            x={420}
            y={1560}
            seed={1}
            hoodieColor={C.orange}
            hair
            t={f}
            pose="sitChair"
            facing={1}
            handR={{ x: 120, y: -170 - tap }}
          />
          <Character
            x={860}
            y={1560}
            seed={101}
            hoodieColor={C.orange}
            hair
            t={f}
            pose="sitChair"
            facing={1}
            handR={{ x: 120, y: -170 - tap }}
          />
          {[420, 860].map((x) => (
            <g key={x}>
              <line
                x1={x + 100}
                y1={1410}
                x2={x + 110}
                y2={1556 - tap}
                stroke={C.ink}
                strokeWidth={15}
                strokeLinecap="round"
              />
              <ellipse cx={x + 120} cy={1550 - tap} rx={28} ry={13} fill="#1d1a22" />
            </g>
          ))}
        </>
      }
    />
  );
};
const S38: React.FC = () => {
  const { f, dur, L } = useShot('3.8');
  const look = Math.sin(f / 8) > 0 ? 1 : -1;
  return (
    <AbsoluteFill>
      <Stage2
        set={bedroomDay(f)}
        cam={cutCam(
          f,
          [
            { at: 0, a: { x: 560, y: 1040, z: 1.15 }, b: { x: 560, y: 1040, z: 1.25 } },
            {
              at: L('L049') - 2,
              a: faceCam(560, 1500, 1.08, 2.6),
              b: faceCam(560, 1500, 1.08, 2.9),
            },
          ],
          dur,
        )}
        f={f}
        actors={
          <>
            <Ban x={260} y={1540} t={f} facing={1} eyes="happy" />
            <Me
              x={560}
              y={1500}
              t={f}
              eyes={f > L('L049') ? 'half' : 'normal'}
              look={{ x: look, y: 0 }}
            />
            <Clone k={1} x={860} y={1540} t={f} facing={-1} eyes="happy" />
          </>
        }
      />
      {f >= L('L049') && (
        <Pow text="?!" x={560} y={360} from={L('L049')} f={f} size={140} rot={6} color={C.mom} />
      )}
    </AbsoluteFill>
  );
};

export const ACT123: Record<string, ShotDef> = {
  '1.1': {
    C: S11,
    amb: 'bedroom',
    fx: () => [
      hit('snap', 10, 1),
      ...[24, 29, 33, 37, 40].flatMap((t, i) => [hit(`pop_${i + 2}`, t, 0.9)]),
      hit('pop_ring', 24, 0.4),
    ],
  },
  '2.1': {
    C: S21,
    amb: 'bedroom',
    fx: (h) => [
      hit('alarm', 0, 0.55),
      hit('alarm_rattle', 0, 0.45),
      hit('blanket', h.L('L005'), 0.6),
    ],
  },
  '2.2': {
    C: S22,
    amb: 'bedroom',
    fx: (h) => ['L007', 'L008', 'L009', 'L010'].map((id) => hit('tick', h.L(id), 0.6)),
  },
  '2.3': { C: S23, amb: 'bedroom' },
  '2.4': { C: S24, amb: 'bedroom', fx: (h) => [hit('snap', h.L('L016') + 2, 1)] },
  '2.5': {
    C: S25,
    amb: 'bedroom',
    fx: (h) => [
      hit('pop_2', 0, 0.9),
      hit('pop_ring', 0, 0.4),
      hit('blanket', h.at('L018', 'ngồi'), 0.8),
    ],
  },
  '2.6': { C: S26, amb: 'bedroom' },
  '2.7': { C: S27, amb: 'bedroom' },
  '2.8': {
    C: S28,
    amb: 'bedroom',
    fx: (h) => [hit('clap_rhythm', 0, 0.8), hit('blanket', h.L('L027') + 6, 0.8)],
  },
  '3.1': { C: S31, amb: 'rules', fx: () => [2, 6, 10, 14].map((t) => hit('whoosh_ui', t, 0.5)) },
  '3.2': { C: S32, amb: 'rules', fx: (h) => snapPop(h.at('L030', 'một bản sao'), 2) },
  '3.3': {
    C: S33,
    amb: 'rules',
    fx: (h) => [
      hit('whoosh_ui', 0, 0.4),
      hit('whoosh_ui', h.L('L033'), 0.4),
      hit('whoosh_ui', h.L('L034'), 0.4),
    ],
  },
  '3.4': { C: S34, amb: 'rules', fx: (h) => [hit('sparkle_chime', h.at('L035', 'tan biến'), 0.9)] },
  '3.5': {
    C: S35,
    amb: 'rules',
    fx: (h) => [hit('buzz', h.L('L039'), 0.8), hit('whoosh_ui', h.L('L040'), 0.5)],
  },
  '3.6': {
    C: S36,
    amb: 'rules',
    fx: (h) => [
      hit('whoosh_ui', 0, 0.6),
      hit('whoosh', h.L('L045'), 0.4),
      hit('paper', h.L('L046'), 0.5),
    ],
  },
  '3.7': { C: S37, amb: 'rules', fx: (h) => [loopFor('steps_small_loop', 0, h.dur, 0.35, 6)] },
  '3.8': { C: S38, amb: 'bedroom' },
};
