import React from 'react';
import { AbsoluteFill, interpolate } from 'remotion';
import { alley, classroom, minimal, SetLayers } from '../../../kits/whatif/sets';
import { cutCam, WIDE } from '../../../kits/whatif/Stage';
import { C, FONT, HAND } from '../../../kits/whatif/theme';
import { BigText, IconBubble, Pow } from '../../../kits/whatif/ui';
import { freezeK } from '../freeze';
import {
  Ban,
  ClapECU,
  clamp,
  Co,
  Dat,
  Extra,
  faceCam,
  hit,
  loopFor,
  Ong,
  ShotDef,
  Stage5,
  Vy,
} from '../kit';
import { home } from '../sets';
import { useShot } from '../time';

/** World time (side people/objects) in a shot: held at the clap frame while stopped. */
export const useWorld = (id: string) => {
  const h = useShot(id);
  const fk = freezeK(h.abs);
  return { ...h, fk };
};
export const tw = (f: number, frozenAt: number, fk: number) =>
  fk >= 0.5 ? Math.min(f, frozenAt) : f;

// ───────── Frozen Saigon alley (hook + 5.4) ─────────
export const Pigeon: React.FC<{ x: number; y: number; t: number; s?: number }> = ({
  x,
  y,
  t,
  s = 1,
}) => {
  const flap = Math.sin(t * 0.8) * 30;
  return (
    <g transform={`translate(${x},${y}) scale(${s})`}>
      <ellipse rx={50} ry={26} fill="#8a8e98" />
      <circle cx={46} cy={-14} r={18} fill="#7a7e88" />
      <path d="M58 -14 l14 4 l-14 4 Z" fill="#c9a46a" />
      <path d={`M-10 -10 Q-30 ${-60 - flap} -80 ${-50 - flap} Q-40 -30 -10 -10`} fill="#9a9ea8" />
      <path d="M-50 0 l-30 -8 l0 16 Z" fill="#6a6e78" />
    </g>
  );
};
export const CoffeeBurst: React.FC<{ x: number; y: number; k: number }> = ({ x, y, k }) => (
  <g transform={`translate(${x},${y})`}>
    <g transform={`rotate(${-40 * k})`}>
      <path d="M-30 -40 L30 -40 L22 40 L-22 40 Z" fill="#e8f0f4" opacity={0.8} />
      <rect x={-24} y={-10} width={48} height={46} fill="#6a4a30" opacity={0.85} />
    </g>
    {Array.from({ length: 14 }, (_, i) => {
      const a = -Math.PI * 0.9 + (i / 13) * Math.PI * 0.8;
      const r = 40 + 140 * k * (0.6 + (i % 3) * 0.2);
      return (
        <circle
          key={i}
          cx={Math.cos(a) * r}
          cy={-40 + Math.sin(a) * r}
          r={8 + (i % 3) * 4}
          fill={i % 4 ? '#7a5236' : '#f0f4f8'}
          opacity={0.9}
        />
      );
    })}
    {Array.from({ length: 5 }, (_, i) => (
      <rect
        key={`i${i}`}
        x={-60 + i * 28}
        y={-120 - k * (40 + i * 18)}
        width={18}
        height={18}
        rx={3}
        fill="#e8f4f8"
        transform={`rotate(${i * 20})`}
      />
    ))}
  </g>
);
export const FrozenAlley: React.FC<{
  f: number;
  fk: number;
  t: number;
  cam: { x: number; y: number; z: number };
}> = ({ f, fk, t, cam }) => (
  <Stage5
    set={alley(t)}
    frozen={fk}
    cam={cam}
    f={f}
    actors={
      <>
        <Extra k={3} x={-200} y={1500} t={t} pose="walk" facing={1} eyes="normal" />
        <Extra k={5} x={1250} y={1520} t={t} pose="sitChair" facing={-1} eyes="happy" />
        <Pigeon x={360} y={520} t={t} s={1.2} />
        <CoffeeBurst x={1150} y={1220} k={Math.min(1, 0.4 + t * 0.03)} />
        <Ban
          x={560}
          y={1560}
          t={f}
          eyes={fk > 0.5 ? 'wide' : 'squint'}
          pose={fk > 0.5 ? 'stand' : 'pray'}
        />
      </>
    }
  />
);
const S11: React.FC = () => {
  const { f, dur, fk } = useWorld('1.1');
  const clap = 14;
  return (
    <AbsoluteFill>
      {f < clap + 6 ? (
        <AbsoluteFill style={{ background: '#2b2535' }}>
          <ClapECU f={f} at={clap} />
        </AbsoluteFill>
      ) : (
        <FrozenAlley
          f={f}
          fk={fk}
          t={tw(f, clap, fk)}
          cam={cutCam(
            f,
            [{ at: clap + 6, a: { x: 640, y: 960, z: 0.95 }, b: { x: 760, y: 940, z: 1.05 } }],
            dur,
          )}
        />
      )}
      <BigText
        lines={['NẾU MỖI LẦN DỪNG THỜI GIAN,', 'BẠN GIÀ THÊM 1 NGÀY?']}
        from={3}
        f={f}
        y={300}
        size={100}
        accent={[1]}
      />
    </AbsoluteFill>
  );
};

// ───────── 2. Maths class ─────────
const BOARD = { x: 300, y: 560 };
const TEACH = { x: -300, y: 1480 };
const ME = { x: 620, y: 1540 };
/** The problem on the board: written directly on the board face (classroom far layer, board at x 540 y 560, face 800×364) so the text moves with the board under camera
 * parallax – drawn on the actor layer, the text drifts off the board and past the frame edge. */
const withBoard = (set: SetLayers, board: 'blank' | 'answer', chalk: number): SetLayers => ({
  ...set,
  far: (
    <>
      {set.far}
      <text x={180} y={622} fontFamily={HAND} fontSize={52} fill="#e8e6dc">
        BÀI 3: x² − 5x + 6 = 0
      </text>
      <text x={180} y={690} fontFamily={HAND} fontSize={52} fill="#e8e6dc" opacity={0.6}>
        BÀI 4: 2x + 7 = 15
      </text>
      {board === 'answer' && (
        <text x={640} y={690} fontFamily={HAND} fontSize={56} fill="#fff8c0" opacity={chalk}>
          → x = 4 ✓
        </text>
      )}
    </>
  ),
});
/** Classroom: the teacher stands left, you at the board, Vy + Đạt seated at desks. */
const ClassRoom: React.FC<{
  f: number;
  t: number;
  fk: number;
  cam: { x: number; y: number; z: number };
  ban?: Partial<React.ComponentProps<typeof Ban>>;
  board?: 'blank' | 'answer';
  chalk?: number;
  teach?: 'arms' | 'blink' | 'look' | 'half';
  focusBoard?: boolean;
}> = ({
  f,
  t,
  fk,
  cam,
  ban = {},
  board = 'blank',
  chalk = 1,
  teach = 'arms',
  focusBoard = false,
}) => (
  <Stage5
    set={withBoard(classroom(t), board, chalk)}
    frozen={fk}
    cam={cam}
    blurFar={focusBoard ? 0 : undefined}
    f={f}
    actors={
      <>
        <Co
          x={TEACH.x}
          y={TEACH.y}
          t={t}
          facing={1}
          pose={teach === 'arms' ? 'pray' : 'stand'}
          eyes={teach === 'blink' ? 'half' : teach === 'half' ? 'half' : 'normal'}
          look={{ x: 0.8, y: 0 }}
        />
        <Vy x={260} y={1720} t={t} facing={0} back pose="sitChair" />
        <Dat x={980} y={1720} t={t} facing={0} back pose="sitChair" />
        <Extra k={2} x={-60} y={1740} size={0.92} t={t} back pose="sitChair" />
        <Extra k={6} x={1240} y={1740} size={0.92} t={t} back pose="sitChair" />
        <Ban x={ME.x} y={ME.y} t={f} facing={-1} itemR="chalk" pose="hold" {...ban} />
        {fk > 0 && (
          <g opacity={fk}>
            {Array.from({ length: 30 }, (_, i) => (
              <circle
                key={i}
                cx={BOARD.x - 300 + ((i * 97) % 700)}
                cy={BOARD.y + 160 + ((i * 53) % 260)}
                r={4}
                fill="#f4f2ea"
              />
            ))}
          </g>
        )}
      </>
    }
  />
);
const S21: React.FC = () => {
  const { f, dur, L } = useShot('2.1');
  return (
    <ClassRoom
      f={f}
      t={f}
      fk={0}
      cam={cutCam(
        f,
        [
          { at: 0, a: { x: 400, y: 1000, z: 0.95 }, b: { x: 400, y: 1000, z: 1.02 } },
          {
            at: L('L004') - 2,
            a: faceCam(TEACH.x, TEACH.y, 1.05, 2.2),
            b: faceCam(TEACH.x, TEACH.y, 1.05, 2.4),
          },
        ],
        dur,
      )}
      ban={{ pose: 'walk', x: interpolate(f, [0, dur], [1100, ME.x], clamp), facing: -1 }}
      teach="look"
    />
  );
};
const S22: React.FC = () => {
  const { f, dur, L } = useShot('2.2');
  return (
    <ClassRoom
      f={f}
      t={f}
      fk={0}
      cam={cutCam(
        f,
        [
          { at: 0, a: faceCam(ME.x, ME.y, 1, 2.4), b: faceCam(ME.x, ME.y, 1, 2.6) },
          {
            at: L('L006') - 2,
            a: { x: ME.x - 120, y: ME.y - 280, z: 3.0 },
            b: { x: ME.x - 120, y: ME.y - 280, z: 3.2 },
          },
          { at: L('L007') - 2, a: faceCam(ME.x, ME.y, 1, 3.0), b: faceCam(ME.x, ME.y, 1, 3.3) },
        ],
        dur,
      )}
      ban={{ eyes: 'squint', shiver: 0.4 }}
    />
  );
};
const S23: React.FC = () => {
  const { f, dur, L } = useShot('2.3');
  return (
    <ClassRoom
      f={f}
      t={f}
      fk={0}
      cam={cutCam(
        f,
        [
          { at: 0, a: { x: 500, y: 1080, z: 0.95 }, b: { x: 500, y: 1080, z: 1.0 } },
          {
            at: L('L009') - 2,
            a: faceCam(TEACH.x, TEACH.y, 1.05, 2.3),
            b: faceCam(TEACH.x, TEACH.y, 1.05, 2.5),
          },
          { at: L('L010') - 2, a: faceCam(ME.x, ME.y, 1, 2.8), b: faceCam(ME.x, ME.y, 1, 3.0) },
        ],
        dur,
      )}
      ban={{ eyes: f >= L('L010') ? 'wide' : 'squint', shiver: f >= L('L010') ? 1 : 0.3 }}
    />
  );
};
/** 2.4 Clap → freeze (hold so it lands). */
const S24: React.FC = () => {
  const { f, dur, at, L, fk } = useWorld('2.4');
  const clap = at('L011', 'vỗ tay');
  const frozenAt = clap;
  if (f >= clap - 14 && f < clap + 8)
    return (
      <AbsoluteFill style={{ background: '#2b2535' }}>
        <ClapECU f={f} at={clap} />
      </AbsoluteFill>
    );
  return (
    <ClassRoom
      f={f}
      t={tw(f, frozenAt, fk)}
      fk={fk}
      cam={cutCam(
        f,
        [
          { at: 0, a: faceCam(ME.x, ME.y, 1, 2.6), b: faceCam(ME.x, ME.y, 1, 2.8) },
          {
            at: clap + 8,
            a: { x: 360, y: 940, z: 1.0 },
            b: { x: 520, y: 900, z: 1.12 },
            hold: true,
          },
          {
            at: L('L014') - 2,
            a: { x: 300, y: 920, z: 1.1 },
            b: { x: 700, y: 900, z: 1.18 },
            hold: true,
          },
        ],
        dur,
      )}
      ban={{ eyes: f > clap ? 'wide' : 'squint', pose: f < clap ? 'pray' : 'hold' }}
    />
  );
};
const S25: React.FC = () => {
  const { f, dur, L, fk } = useWorld('2.5');
  return (
    <ClassRoom
      f={f}
      t={0}
      fk={fk}
      teach="blink"
      focusBoard={f >= L('L017') - 2}
      cam={cutCam(
        f,
        [
          {
            at: 0,
            a: faceCam(TEACH.x, TEACH.y, 1.05, 2.8),
            b: faceCam(TEACH.x + 30, TEACH.y, 1.05, 3.0),
          },
          { at: L('L016') - 2, a: { x: 980, y: 1500, z: 2.2 }, b: { x: 1010, y: 1500, z: 2.35 } },
          {
            at: L('L017') - 2,
            a: { x: BOARD.x, y: BOARD.y + 160, z: 1.5 },
            b: { x: BOARD.x + 80, y: BOARD.y + 150, z: 1.58 },
          },
        ],
        dur,
      )}
      ban={{ eyes: 'wide' }}
    />
  );
};
const S26: React.FC = () => {
  const { f, dur, L, fk } = useWorld('2.6');
  return (
    <ClassRoom
      f={f}
      t={0}
      fk={fk}
      teach="blink"
      cam={cutCam(
        f,
        [
          { at: 0, a: faceCam(ME.x, ME.y, 1, 2.6), b: faceCam(ME.x, ME.y, 1, 2.8) },
          { at: L('L022') - 2, a: faceCam(ME.x, ME.y, 1, 3.2), b: faceCam(ME.x, ME.y, 1, 3.4) },
          { at: L('L023') - 2, a: { x: 560, y: 920, z: 1.15 }, b: { x: 640, y: 920, z: 1.2 } },
        ],
        dur,
      )}
      ban={{ eyes: f >= L('L023') ? 'squint' : 'wide', look: { x: -0.7, y: -0.6 } }}
    />
  );
};
const S27: React.FC = () => {
  const { f, dur, L, fk } = useWorld('2.7');
  const bx = interpolate(f, [0, L('L025')], [ME.x, 300], clamp);
  const back = f >= L('L027');
  return (
    <AbsoluteFill>
      <ClassRoom
        f={f}
        t={0}
        fk={fk}
        teach="blink"
        cam={cutCam(
          f,
          [
            { at: 0, a: { x: 460, y: 1430, z: 1.2 }, b: { x: 380, y: 1430, z: 1.3 } },
            { at: L('L025') - 2, a: { x: 300, y: 1500, z: 2.2 }, b: { x: 300, y: 1500, z: 2.35 } },
            { at: L('L027') - 2, a: { x: 460, y: 1200, z: 1.2 }, b: { x: 560, y: 1200, z: 1.25 } },
          ],
          dur,
        )}
        ban={{
          x: back ? interpolate(f, [L('L027'), dur], [300, ME.x], clamp) : bx,
          y: f < L('L027') && f >= L('L024') + 20 ? 1640 : ME.y,
          pose: f < L('L025') || back ? 'run' : 'reach',
          facing: back ? 1 : -1,
          eyes: 'squint',
          itemR: undefined,
        }}
      />
      {f >= L('L025') && f < L('L027') - 2 && (
        <Pow
          text="ĐÁP ÁN: x = 4"
          x={500}
          y={300}
          from={L('L026')}
          f={f}
          size={96}
          color="#7ad0ff"
        />
      )}
    </AbsoluteFill>
  );
};
const S28: React.FC = () => {
  const { f, dur, L, fk } = useWorld('2.8');
  const after = f >= L('L031');
  return (
    <ClassRoom
      f={f}
      t={after ? f : 0}
      fk={fk}
      teach={after ? 'arms' : 'blink'}
      cam={cutCam(
        f,
        [
          { at: 0, a: { x: 560, y: 1100, z: 1.2 }, b: { x: 580, y: 1100, z: 1.3 } },
          { at: L('L031') - 2, a: { x: 420, y: 1000, z: 0.95 }, b: { x: 420, y: 1000, z: 1.0 } },
        ],
        dur,
      )}
      ban={{
        pose: after ? 'hold' : 'run',
        facing: -1,
        eyes: 'squint',
        x: after ? ME.x : interpolate(f, [0, L('L031')], [500, ME.x], clamp),
      }}
    />
  );
};
const S29: React.FC = () => {
  const { f, dur, L } = useShot('2.9');
  const k = interpolate(f, [0, L('L033')], [0, 1], clamp);
  return (
    <ClassRoom
      f={f}
      t={f}
      fk={0}
      board="answer"
      chalk={k}
      focusBoard={f < L('L034') - 2}
      cam={cutCam(
        f,
        [
          {
            at: 0,
            a: { x: BOARD.x + 260, y: BOARD.y + 50, z: 2.3 },
            b: { x: BOARD.x + 300, y: BOARD.y + 50, z: 2.5 },
          },
          { at: L('L034') - 2, a: { x: 420, y: 900, z: 1.3 }, b: { x: 420, y: 900, z: 1.35 } },
        ],
        dur,
      )}
      ban={{ pose: 'point', facing: -1, eyes: 'happy' }}
    />
  );
};
const S210: React.FC = () => {
  const { f, dur, L } = useShot('2.10');
  return (
    <ClassRoom
      f={f}
      t={f}
      fk={0}
      board="answer"
      teach={f >= L('L036') ? 'half' : 'look'}
      cam={cutCam(
        f,
        [
          {
            at: 0,
            a: faceCam(TEACH.x, TEACH.y, 1.05, 2.5),
            b: faceCam(TEACH.x, TEACH.y, 1.05, 2.7),
          },
        ],
        dur,
      )}
      ban={{ eyes: 'happy' }}
    />
  );
};
const S211: React.FC = () => {
  const { f, dur, L } = useShot('2.11');
  return (
    <AbsoluteFill>
      <ClassRoom
        f={f}
        t={f}
        fk={0}
        board="answer"
        teach="half"
        focusBoard={f >= L('L038') - 2 && f < L('L040') - 2}
        cam={cutCam(
          f,
          [
            {
              at: 0,
              a: faceCam(TEACH.x, TEACH.y, 1.05, 2.4),
              b: faceCam(TEACH.x, TEACH.y, 1.05, 2.6),
            },
            {
              at: L('L038') - 2,
              a: { x: BOARD.x, y: BOARD.y, z: 2.2 },
              b: { x: BOARD.x + 60, y: BOARD.y + 20, z: 2.4 },
            },
            {
              at: L('L040') - 2,
              a: faceCam(ME.x, ME.y, 1, 2.6),
              b: faceCam(ME.x, ME.y, 1, 2.9),
              hold: true,
            },
          ],
          dur,
        )}
        ban={{ eyes: f >= L('L039') ? 'half' : 'happy' }}
      />
      {f >= L('L038') && f < L('L040') - 2 && (
        <svg width={1920} height={1080} style={{ position: 'absolute' }}>
          <ellipse
            cx={1090}
            cy={400}
            rx={540}
            ry={85}
            fill="none"
            stroke="#ff4a3a"
            strokeWidth={10}
          />
        </svg>
      )}
      <BigText
        lines={['−1 NGÀY TUỔI.', 'GIẢI SAI BÀI.']}
        from={L('L040')}
        f={f}
        y={160}
        size={110}
        accent={[0]}
      />
    </AbsoluteFill>
  );
};

// ───────── 3. Rules ─────────
const R = { x: 500, y: 1560, s: 1.1 };
const rules = minimal('#4b4159', '#2b2535');
const S31: React.FC = () => {
  const { f, dur } = useShot('3.1');
  return (
    <Stage5
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
          {[
            ['👏', 120, 820],
            ['⏸', 880, 780],
            ['⏱', 160, 1240],
            ['📅', 850, 1200],
          ].map(([e, x, y], i) => (
            <IconBubble key={i} x={x as number} y={y as number} from={2 + i * 4} f={f}>
              <text y={26} textAnchor="middle" fontSize={70}>
                {e}
              </text>
            </IconBubble>
          ))}
        </>
      }
    />
  );
};
const S32: React.FC = () => {
  const { f, dur, at, fk } = useWorld('3.2');
  const clap = at('L043', 'vỗ tay');
  if (f >= clap - 14 && f < clap + 8)
    return (
      <AbsoluteFill style={{ background: '#2b2535' }}>
        <ClapECU f={f} at={clap} />
      </AbsoluteFill>
    );
  const t = tw(f, clap, fk);
  return (
    <Stage5
      set={rules}
      frozen={fk}
      cam={cutCam(
        f,
        [
          { at: 0, a: { ...WIDE, y: 960, z: 1.0 }, b: { ...WIDE, y: 960, z: 1.06 } },
          { at: clap + 8, a: { x: 520, y: 1000, z: 1.05 }, b: { x: 560, y: 1000, z: 1.12 } },
        ],
        dur,
      )}
      f={f}
      actors={
        <>
          {[-300, 120, 900, 1300].map((x, i) => (
            <Extra key={i} k={i + 1} x={x} y={1540} t={t} pose="walk" facing={i % 2 ? -1 : 1} />
          ))}
          <Ban
            x={R.x}
            y={R.y}
            size={R.s}
            t={f}
            pose={f < clap ? 'pray' : 'stand'}
            eyes={f > clap ? 'wide' : 'squint'}
          />
        </>
      }
    />
  );
};
const S33: React.FC = () => {
  const { f, dur, L, fk } = useWorld('3.3');
  const carry = f >= L('L048') - 2;
  const chair = f >= L('L047') - 2 && !carry;
  return (
    <Stage5
      set={rules}
      frozen={fk}
      cam={cutCam(
        f,
        [
          { at: 0, a: { x: 520, y: 1000, z: 1.05 }, b: { x: 600, y: 1000, z: 1.1 } },
          { at: L('L047') - 2, a: { x: 700, y: 1120, z: 1.4 }, b: { x: 700, y: 1120, z: 1.5 } },
          {
            at: L('L048') - 2,
            a: faceCam(600, 1560, 1, 2.0, 120),
            b: faceCam(600, 1560, 1, 2.2, 120),
          },
        ],
        dur,
      )}
      f={f}
      actors={
        <>
          {[-300, 120, 1100, 1400].map((x, i) => (
            <Extra key={i} k={i + 1} x={x} y={1540} t={0} pose="walk" facing={i % 2 ? -1 : 1} />
          ))}
          {chair && (
            <rect
              x={660}
              y={1180}
              width={140}
              height={160}
              rx={16}
              fill="#b0605a"
              transform={`rotate(-10 730 1260)`}
            />
          )}
          {carry && <Extra k={5} x={560} y={1330} t={0} facing={1} pose="flail" shadow={false} />}
          <Ban
            x={600}
            y={1560}
            t={f}
            pose={chair ? 'armsUp' : carry ? 'carry' : 'walk'}
            facing={1}
            eyes={carry ? 'squint' : 'normal'}
            shiver={carry ? 1 : 0}
            speed={0.6}
            lean={carry ? 8 : 0}
          />
        </>
      }
    />
  );
};
const S34: React.FC = () => {
  const { f, dur } = useShot('3.4');
  return (
    <AbsoluteFill>
      <Stage5
        set={rules}
        cam={cutCam(
          f,
          [{ at: 0, a: faceCam(R.x, R.y, R.s, 2.0, 80), b: faceCam(R.x, R.y, R.s, 2.2, 80) }],
          dur,
        )}
        f={f}
        actors={<Ban x={R.x} y={R.y} size={R.s} t={f} eyes="half" />}
      />
      <Pow text="+1 NGÀY" x={520} y={260} from={20} f={f} size={130} color={C.orange} />
    </AbsoluteFill>
  );
};
const S35: React.FC = () => {
  const { f, L } = useShot('3.5');
  const k = interpolate(f, [6, 40], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ background: '#2b2535' }}>
      <svg width={1920} height={1080} style={{ position: 'absolute' }}>
        <g
          transform={`translate(${760 + k * 900},${420 - k * 300}) rotate(${k * 160}) scale(${1 - k * 0.5})`}
          opacity={1 - k * 0.8}
        >
          <rect x={-120} y={-150} width={240} height={300} rx={8} fill="#efe7d6" />
          <text
            x={0}
            y={50}
            textAnchor="middle"
            fontFamily={FONT}
            fontWeight={800}
            fontSize={140}
            fill="#c4473a"
          >
            18
          </text>
        </g>
        {f > 40 && (
          <text x={760} y={560} textAnchor="middle" fontSize={140}>
            🔒
          </text>
        )}
      </svg>
      <BigText
        lines={['NHỚ CHI TIẾT NÀY']}
        from={L('L053')}
        f={f}
        y={150}
        size={110}
        color={C.orange}
        tilt={-3}
      />
    </AbsoluteFill>
  );
};
const S36: React.FC = () => {
  const { f, L } = useShot('3.6');
  const beat = Math.exp(-((f % 22) / 22) * 6);
  return (
    <AbsoluteFill
      style={{
        background: '#262c38',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 30,
      }}
    >
      {f < L('L056') - 2 ? (
        <div
          style={{
            fontFamily: FONT,
            fontWeight: 800,
            fontSize: 130,
            color: '#ff7a1a',
            transform: 'rotate(-6deg)',
            WebkitTextStroke: '10px #15121a',
            paintOrder: 'stroke fill',
          }}
        >
          CHUYỆN THẬT
        </div>
      ) : (
        <>
          <div style={{ fontSize: 200, transform: `scale(${1 + beat * 0.18})` }}>❤️</div>
          <div
            style={{
              fontFamily: FONT,
              fontWeight: 800,
              fontSize: 120,
              color: '#fff',
              WebkitTextStroke: '10px #15121a',
              paintOrder: 'stroke fill',
            }}
          >
            ~100.000 NHỊP / NGÀY
          </div>
          {f >= L('L057') && (
            <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 70, color: C.orange }}>
              👏 = 100.000 nhịp tim → 30 giây
            </div>
          )}
        </>
      )}
    </AbsoluteFill>
  );
};
const S37: React.FC = () => {
  const { f, dur, L } = useShot('3.7');
  const tear = interpolate(f, [L('L060') + 20, L('L060') + 44], [0, 1], clamp);
  return (
    <AbsoluteFill>
      <Stage5
        set={home(f, { tear, day: 18 })}
        cam={cutCam(
          f,
          [
            { at: 0, a: { x: 360, y: 1000, z: 1.05 }, b: { x: 380, y: 1000, z: 1.12 } },
            { at: L('L060') - 2, a: { x: 260, y: 820, z: 1.9 }, b: { x: 260, y: 820, z: 2.0 } },
            { at: L('L061') - 2, a: faceCam(420, 1500, 1, 2.2), b: faceCam(420, 1500, 1, 2.4) },
          ],
          dur,
        )}
        f={f}
        actors={
          <Ong
            x={420}
            y={1500}
            t={f}
            facing={-1}
            pose={f >= L('L060') ? 'reach' : 'stand'}
            handR={f >= L('L060') ? { x: -150, y: -560 } : undefined}
            eyes="normal"
            cane={f < L('L060')}
          />
        }
      />
      <BigText
        lines={['ÔNG NỘI – 81 TUỔI']}
        from={8}
        f={f}
        y={160}
        size={100}
        color="#e8d4b0"
        out={L('L060') - 4}
      />
    </AbsoluteFill>
  );
};
const S38: React.FC = () => {
  const { f, dur } = useShot('3.8');
  const nod = Math.max(0, Math.sin(f / 6)) * 10;
  return (
    <Stage5
      set={home(f, { day: 17 })}
      cam={cutCam(
        f,
        [{ at: 0, a: faceCam(420, 1500, 1, 2.8), b: faceCam(420, 1500, 1, 3.0), hold: true }],
        dur,
      )}
      f={f}
      actors={<Ong x={420} y={1500} t={f} facing={0} eyes="happy" lean={6 + nod} />}
    />
  );
};

export const ACT123: Record<string, ShotDef> = {
  '1.1': { C: S11 },
  '2.1': { C: S21, fx: (h) => [loopFor('steps_tile_loop', 0, h.dur, 0.4, 6)] },
  '2.2': { C: S22 },
  '2.3': { C: S23 },
  '2.4': { C: S24 },
  '2.5': { C: S25 },
  '2.6': { C: S26 },
  '2.7': {
    C: S27,
    fx: (h) => [
      loopFor('steps_run_loop', 0, h.L('L025'), 0.6, 4),
      hit('page_flip', h.L('L025'), 0.7),
      loopFor('steps_run_loop', h.L('L027'), h.dur, 0.6, 4),
      hit('breath', h.L('L026'), 0.4),
    ],
  },
  '2.8': {
    C: S28,
    fx: (h) => [loopFor('steps_run_loop', 0, h.L('L031') - 4, 0.5, 4)],
  },
  '2.9': { C: S29, fx: () => [hit('chalk', 2, 0.8), hit('chalk', 22, 0.7)] },
  '2.10': { C: S210 },
  '2.11': { C: S211, fx: (h) => [hit('whoosh_ui', h.L('L040'), 0.5)] },
  '3.1': { C: S31, fx: () => [2, 6, 10, 14].map((t) => hit('whoosh_ui', t, 0.5)) },
  '3.2': { C: S32 },
  '3.3': {
    C: S33,
    fx: (h) => [hit('chair_lift', h.L('L047'), 0.5), hit('breath', h.L('L048') + 10, 0.5)],
  },
  '3.4': { C: S34, fx: () => [hit('day_tick', 20, 0.7)] },
  '3.5': {
    C: S35,
    fx: (h) => [
      hit('paper_flutter', 6, 0.6),
      hit('buzz', 40, 0.6),
      hit('whoosh_ui', h.L('L053'), 0.5),
    ],
  },
  '3.6': {
    C: S36,
    fx: (h) => [hit('whoosh_ui', 0, 0.5), loopFor('heartbeat_loop', h.L('L056'), h.dur, 0.35, 10)],
  },
  '3.7': { C: S37, fx: (h) => [hit('calendar_tear', h.L('L060') + 20, 0.9)] },
  '3.8': { C: S38 },
};
