import React from 'react';
import { AbsoluteFill, interpolate, random } from 'remotion';
import { Character } from '../../ep1/Character';
import { classroom, livingRoom, minimal } from '../../ep1/sets';
import { cutCam, WIDE } from '../../ep1/Stage';
import { C, FONT, HAND } from '../../ep1/theme';
import { BigText, Pow } from '../../ep1/ui';
import {
  Ban,
  bodyCam,
  ClonerCounter,
  Clone,
  clamp,
  Co,
  Extra,
  faceCam,
  hit,
  loopFor,
  Me,
  PopRing,
  popIn,
  Relative,
  ShotDef,
  snapPop,
  Stage2,
} from '../kit';
import { bedroomDay, dining, PhoneScreen, yardField } from '../sets';
import { useShot } from '../time';
import { LyingKid } from './act123';

// ───────── 4.1 The clone is as lazy as you ─────────
const S41: React.FC = () => {
  const { f, dur, L } = useShot('4.1');
  const lazy = f >= L('L051') - 2;
  return (
    <Stage2
      set={bedroomDay(f)}
      cam={cutCam(
        f,
        [
          { at: 0, a: bodyCam(1080, 1520, 1, 1.5), b: bodyCam(1080, 1520, 1, 1.6) },
          { at: L('L051') - 2, a: { x: 520, y: 1200, z: 1.7 }, b: { x: 520, y: 1200, z: 1.85 } },
          { at: L('L052') - 2, a: { x: 560, y: 1120, z: 1.25 }, b: { x: 560, y: 1120, z: 1.3 } },
        ],
        dur,
      )}
      f={f}
      actors={
        lazy ? (
          <>
            <LyingKid who={1} x={720} y={1305} f={f} eyes="half" />
            {f >= L('L052') - 2 && (
              <Ban x={1040} y={1520} t={f} eyes="half" lean={-6} pose="shrug" />
            )}
          </>
        ) : (
          <Ban x={1080} y={1520} t={f} eyes="squint" itemR="paper" pose="hold" />
        )
      }
    />
  );
};

// ───────── 4.2 Chain of snaps sending each other to school ─────────
const ROW = [300, 560, 820, 1080, 1340, 1600];
const S42: React.FC = () => {
  const { f, dur, L } = useShot('4.2');
  const pops = [L('L053') + 10, L('L054') + 6, L('L056') + 8, L('L057') + 6, L('L057') + 18];
  const n = 1 + pops.filter((p) => f >= p).length;
  const last = pops.filter((p) => f >= p).pop() ?? 0;
  const focus = Math.min(ROW.length - 1, n - 1);
  const cam = { x: interpolate(f, [0, dur], [520, 1180], clamp), y: 1020, z: 1.15 };
  return (
    <AbsoluteFill>
      <Stage2
        set={bedroomDay(f)}
        cam={cam}
        f={f}
        actors={
          <>
            <Ban
              x={ROW[0]}
              y={1520}
              t={f}
              facing={1}
              pose={f < pops[0] + 6 ? 'point' : 'stand'}
              eyes="half"
            />
            {pops.map((p, i) => {
              const q = popIn(f, p);
              const isPointing = i + 1 < pops.length && f >= p + 8 && f < pops[i + 1] + 6;
              return (
                <g key={i}>
                  <PopRing x={ROW[i + 1]} y={1520} u={f - p} />
                  <Clone
                    k={i + 1}
                    x={ROW[i + 1]}
                    y={1520}
                    t={f}
                    opacity={q.opacity}
                    squash={q.squash}
                    sparkle={q.sparkle}
                    facing={isPointing ? 1 : -1}
                    pose={isPointing ? 'point' : 'stand'}
                    eyes={i + 1 === focus ? 'wide' : 'half'}
                  />
                </g>
              );
            })}
          </>
        }
      />
      <ClonerCounter n={n} f={f} changedAt={last} />
    </AbsoluteFill>
  );
};

// ───────── 4.3 Six of them scrolling phones on one bed ─────────
const S43: React.FC = () => {
  const { f, dur, L } = useShot('4.3');
  return (
    <AbsoluteFill>
      <Stage2
        set={bedroomDay(f)}
        cam={cutCam(
          f,
          [
            { at: 0, a: { x: 560, y: 1150, z: 1.2 }, b: { x: 560, y: 1150, z: 1.3 } },
            { at: L('L059') - 2, a: { x: 560, y: 1180, z: 1.55 }, b: { x: 560, y: 1180, z: 1.6 } },
          ],
          dur,
        )}
        f={f}
        actors={
          <>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <g key={i}>
                <LyingKid
                  who={i}
                  x={720 + (i % 2) * 60}
                  y={1305 - i * 42}
                  f={f + i * 5}
                  eyes="half"
                />
                <rect
                  x={300 + (i % 2) * 60}
                  y={1150 - i * 42}
                  width={50}
                  height={80}
                  rx={10}
                  fill="#2b2f38"
                />
                <rect
                  x={304 + (i % 2) * 60}
                  y={1154 - i * 42}
                  width={42}
                  height={72}
                  rx={8}
                  fill="#8ab8ff"
                  opacity={0.85}
                />
              </g>
            ))}
          </>
        }
      />
      <ClonerCounter n={6} f={f} changedAt={-30} />
    </AbsoluteFill>
  );
};

// ───────── 4.4 The tutor texts Mom ─────────
const S44: React.FC = () => {
  const { f } = useShot('4.4');
  return (
    <Stage2
      set={livingRoom(f, { table: false })}
      cam={{ x: 560, y: 900, z: 1.0 }}
      f={f}
      blurBg={14}
      actors={
        <PhoneScreen x={560} y={880} s={1.05}>
          <rect x={-190} y={-380} width={380} height={110} fill="#8b8a96" />
          <text x={-160} y={-310} fontFamily={FONT} fontWeight={800} fontSize={34} fill="#fff">
            Cô dạy thêm Toán
          </text>
          <g
            transform={`translate(0,${interpolate(f, [0, 8], [30, 0], clamp)})`}
            opacity={interpolate(f, [0, 6], [0, 1], clamp)}
          >
            <rect x={-170} y={-200} width={320} height={150} rx={26} fill="#fff" />
            <text x={-150} y={-150} fontFamily={FONT} fontWeight={600} fontSize={28} fill="#333">
              Chị ơi, hôm nay
            </text>
            <text x={-150} y={-112} fontFamily={FONT} fontWeight={600} fontSize={28} fill="#333">
              cháu không đi học ạ? 🙏
            </text>
          </g>
        </PhoneScreen>
      }
    />
  );
};

// ───────── 4.5 Mom opens the door – six heads turn at once ─────────
const S45: React.FC = () => {
  const { f, dur, L } = useShot('4.5');
  const turn = L('L062') + 4;
  const open = interpolate(f, [4, 18], [0, 1], clamp);
  return f < L('L062') - 2 ? (
    <Stage2
      set={bedroomDay(f, { doorOpen: open })}
      cam={cutCam(
        f,
        [{ at: 0, a: bodyCam(1420, 1500, 1.08, 1.3), b: bodyCam(1420, 1500, 1.08, 1.4) }],
        dur,
      )}
      f={f}
      actors={<Me x={1460} y={1520} t={f} facing={-1} eyes="normal" pose="reach" />}
    />
  ) : (
    <Stage2
      set={bedroomDay(f, { doorOpen: 1 })}
      cam={cutCam(
        f,
        [{ at: 0, a: { x: 560, y: 1150, z: 1.3 }, b: { x: 560, y: 1150, z: 1.6 }, hold: true }],
        dur,
      )}
      f={f}
      actors={
        <>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <g key={i}>
              <Character
                x={140 + i * 170}
                y={1330}
                seed={i === 0 ? 1 : 100 + i}
                hoodieColor={C.orange}
                hair
                t={f}
                pose="sitChair"
                facing={f < turn ? (i % 2 ? 1 : -1) : 0}
                eyes={f < turn ? 'half' : 'wide'}
                squash={f >= turn && f < turn + 4 ? 0.1 : 0}
              />
            </g>
          ))}
        </>
      }
    />
  );
};

// ───────── 4.6 Mom closes the door, makes tea, comes back ─────────
const S46: React.FC = () => {
  const { f, dur, L } = useShot('4.6');
  const tea = f >= L('L065') - 2 && f < L('L066') - 2;
  return tea ? (
    <Stage2
      set={dining(f)}
      cam={cutCam(
        f,
        [{ at: 0, a: faceCam(560, 1500, 1.08, 2.0, 120), b: faceCam(560, 1500, 1.08, 2.1, 120) }],
        dur,
      )}
      f={f}
      actors={<Me x={560} y={1500} t={f} facing={1} eyes="half" pose="hold" itemR="teapot" />}
    />
  ) : (
    <Stage2
      set={bedroomDay(f, {
        doorOpen:
          f < L('L065')
            ? interpolate(f, [4, 16], [1, 0], clamp)
            : interpolate(f, [L('L066'), L('L066') + 12], [0, 1], clamp),
      })}
      cam={cutCam(
        f,
        [{ at: 0, a: bodyCam(1420, 1500, 1.08, 1.3), b: bodyCam(1420, 1500, 1.08, 1.35) }],
        dur,
      )}
      f={f}
      actors={
        f >= L('L066') - 2 ? (
          <Me x={1460} y={1520} t={f} facing={-1} eyes="normal" itemR="cup" pose="hold" />
        ) : null
      }
    />
  );
};

// ───────── 4.7 Only one left · the wardrobe shakes ─────────
const S47: React.FC = () => {
  const { f, dur, L } = useShot('4.7');
  return (
    <Stage2
      set={bedroomDay(f, { ajar: 0.35, shake: f >= L('L068') ? 1 : 0.3, doorOpen: 1 })}
      cam={cutCam(
        f,
        [
          { at: 0, a: { x: 300, y: 1080, z: 1.15 }, b: { x: 300, y: 1080, z: 1.25 } },
          { at: L('L068') - 2, a: { x: -330, y: 900, z: 1.6 }, b: { x: -330, y: 900, z: 1.75 } },
        ],
        dur,
      )}
      f={f}
      actors={
        <Character
          x={300}
          y={1330}
          seed={1}
          hoodieColor={C.orange}
          hair
          t={f}
          pose="sitChair"
          facing={0}
          eyes="normal"
          shiver={0.3}
        />
      }
    />
  );
};
const S48: React.FC = () => {
  const { f, dur } = useShot('4.8');
  return (
    <Stage2
      set={bedroomDay(f, { doorOpen: 1 })}
      cam={cutCam(
        f,
        [
          {
            at: 0,
            a: faceCam(1460, 1520, 1.08, 2.5),
            b: faceCam(1460, 1520, 1.08, 2.8),
            hold: true,
          },
        ],
        dur,
      )}
      f={f}
      actors={
        <Me x={1460} y={1520} t={f} facing={-1} eyes="half" itemR="cup" pose="hold" lean={-3} />
      }
    />
  );
};

// ───────── 4.9 Hand-drawn chore chart ─────────
const S49: React.FC = () => {
  const { f, dur, L } = useShot('4.9');
  const rows = [
    ['BẠN GỐC', 'ra lệnh', L('L071')],
    ['BẢN SAO', 'làm', L('L072')],
  ] as const;
  return (
    <AbsoluteFill>
      <Stage2
        set={bedroomDay(f)}
        cam={cutCam(
          f,
          [
            { at: 0, a: { x: 290, y: 600, z: 2.1 }, b: { x: 290, y: 600, z: 2.25 } },
            { at: L('L073') - 2, a: { x: 420, y: 900, z: 1.25 }, b: { x: 420, y: 900, z: 1.3 } },
          ],
          dur,
        )}
        f={f}
        actors={
          <g>
            <rect
              x={60}
              y={380}
              width={480}
              height={420}
              rx={8}
              fill="#f4efe4"
              transform="rotate(-2 300 590)"
            />
            <text
              x={300}
              y={450}
              textAnchor="middle"
              fontFamily={HAND}
              fontSize={52}
              fill="#3a3346"
              transform="rotate(-2 300 590)"
            >
              BẢNG PHÂN CÔNG
            </text>
            {rows.map(([a, b, t], i) => (
              <g
                key={i}
                opacity={interpolate(f, [t, t + 6], [0, 1], clamp)}
                transform="rotate(-2 300 590)"
              >
                <text x={90} y={540 + i * 90} fontFamily={HAND} fontSize={46} fill="#3a3346">
                  {a}
                </text>
                <text x={340} y={540 + i * 90} fontFamily={HAND} fontSize={46} fill={C.orange}>
                  → {b}
                </text>
              </g>
            ))}
            <Ban x={700} y={1520} t={f} facing={-1} pose="point" eyes="happy" />
          </g>
        }
      />
      <BigText
        lines={['ĐỨA NÀO CÃI — RỬA CHÉN']}
        from={L('L073')}
        f={f}
        y={1180}
        size={100}
        color={C.orange}
      />
    </AbsoluteFill>
  );
};

// ───────── 5.1 The fun starts ─────────
const S51: React.FC = () => {
  const { f } = useShot('5.1');
  return (
    <AbsoluteFill style={{ filter: 'saturate(1.25) brightness(1.06)' }}>
      <Stage2
        set={minimal('#ff9a4a', '#c8503a')}
        cam={{ ...WIDE, y: 960, z: 1.0 + f * 0.004 }}
        f={f}
        actors={
          <>
            {[200, 500, 800].map((x, i) => (
              <Character
                key={i}
                x={x}
                y={1560 - Math.abs(Math.sin((f + i * 5) / 5)) * 60}
                seed={i ? 100 + i : 1}
                hoodieColor={C.orange}
                hair
                t={f}
                pose="armsUp"
                eyes="happy"
              />
            ))}
            {Array.from({ length: 30 }, (_, i) => (
              <rect
                key={i}
                x={-300 + random(`cf${i}`) * 1600}
                y={((f * (6 + random(`cv${i}`) * 6) + random(`cy${i}`) * 1800) % 1800) - 200}
                width={18}
                height={30}
                fill={['#fff3d0', '#7ad0ff', '#ffd27a', '#b7a6ff'][i % 4]}
                transform={`rotate(${f * 8 + i * 30})`}
              />
            ))}
          </>
        }
      />
    </AbsoluteFill>
  );
};

// ───────── 5.2 Class cleaning duty (time-lapse) ─────────
const S52: React.FC = () => {
  const { f, L } = useShot('5.2');
  const sp = 2.6;
  return (
    <AbsoluteFill>
      <Stage2
        set={classroom(f)}
        cam={{
          x: 560,
          y: 1080,
          z: 1.05 + (f >= L('L077') ? 0.15 : 0) + (f >= L('L078') ? 0.1 : 0),
        }}
        f={f}
        actors={
          <>
            {[0, 1, 2, 3, 4].map((i) => {
              const x = 120 + i * 220 + Math.sin((f * sp) / 10 + i) * 70;
              return (
                <Clone
                  key={i}
                  k={i + 1}
                  x={x}
                  y={1560 + (i % 2) * 40}
                  t={f * sp}
                  pose={i % 2 ? 'walk' : 'reach'}
                  facing={Math.cos((f * sp) / 10 + i) > 0 ? 1 : -1}
                  speed={2}
                  itemR={i === 0 || i === 3 ? 'duster' : undefined}
                  eyes="squint"
                />
              );
            })}
            {f >= L('L078') &&
              Array.from({ length: 10 }, (_, i) => (
                <path
                  key={i}
                  d="M0 -30 L8 -8 L30 0 L8 8 L0 30 L-8 8 L-30 0 L-8 -8 Z"
                  fill="#fff"
                  transform={`translate(${100 + random(`sb${i}`) * 900},${700 + random(`sby${i}`) * 900}) scale(${0.6 + 0.4 * Math.sin(f / 3 + i)})`}
                />
              ))}
          </>
        }
      />
      {f >= L('L077') && f < L('L078') && (
        <Pow text="⏱ 2 PHÚT" x={480} y={300} from={L('L077')} f={f} size={120} />
      )}
      {f >= L('L078') && (
        <Pow
          text="SẠCH BÓNG ✨"
          x={480}
          y={300}
          from={L('L078')}
          f={f}
          size={120}
          color="#7ad0ff"
        />
      )}
    </AbsoluteFill>
  );
};
const S53: React.FC = () => {
  const { f, dur, L } = useShot('5.3');
  const slide = interpolate(f, [L('L080'), L('L080') + 20], [0, 1], clamp);
  return (
    <Stage2
      set={classroom(f)}
      cam={cutCam(
        f,
        [
          { at: 0, a: bodyCam(-200, 1480, 1.05, 1.3), b: bodyCam(-200, 1480, 1.05, 1.4) },
          {
            at: L('L080') - 2,
            a: faceCam(-200, 1480, 1.05, 3.0, 20),
            b: faceCam(-200, 1480, 1.05, 3.3, 20),
            hold: true,
          },
        ],
        dur,
      )}
      f={f}
      actors={
        <g>
          <Co
            x={-200}
            y={1480}
            t={f}
            facing={1}
            eyes="wide"
            accessories={[]}
            look={{ x: 0.6, y: 0 }}
          />
          <g stroke="#d8cfbd" strokeWidth={4} fill="none" transform={`translate(0,${slide * 56})`}>
            {[-1, 1].map((s) => (
              <circle
                key={s}
                cx={-200 + 34 * 1.05 + s * 38 * 1.05}
                cy={1480 - 462 * 1.05}
                r={31 * 1.05}
              />
            ))}
          </g>
        </g>
      }
    />
  );
};

// ───────── 5.4 Neighbourhood football: 11 orange hoodies, 12–0 ─────────
const S54: React.FC = () => {
  const { f, dur, L } = useShot('5.4');
  const score = Math.min(
    12,
    Math.max(0, Math.floor(interpolate(f, [L('L084'), L('L084') + 30], [0, 12.9], clamp))),
  );
  const ballX = 500 + Math.sin(f / 6) * 700;
  return (
    <Stage2
      set={yardField(f, { score: [score, 0] })}
      cam={cutCam(
        f,
        [
          { at: 0, a: { x: 500, y: 980, z: 0.85 }, b: { x: 500, y: 980, z: 0.9 } },
          { at: L('L083') - 2, a: { x: 300, y: 1150, z: 1.4 }, b: { x: 400, y: 1150, z: 1.45 } },
          { at: L('L084') - 2, a: { x: 500, y: 1000, z: 2.2 }, b: { x: 500, y: 1000, z: 2.3 } },
        ],
        dur,
      )}
      f={f}
      actors={
        <>
          {Array.from({ length: 11 }, (_, i) => (
            <Clone
              key={`o${i}`}
              k={i + 1}
              x={-700 + i * 230 + Math.sin(f / 8 + i) * 60}
              y={1420 + (i % 3) * 70}
              size={0.8}
              t={f + i * 3}
              pose="run"
              facing={1}
              eyes="happy"
              speed={1.4}
            />
          ))}
          {Array.from({ length: 6 }, (_, i) => (
            <Extra
              key={`e${i}`}
              k={i}
              x={-500 + i * 380 + Math.cos(f / 9 + i) * 50}
              y={1460 + (i % 2) * 60}
              size={0.78}
              t={f}
              pose="walk"
              facing={-1}
              eyes="wide"
            />
          ))}
          <circle
            cx={ballX}
            cy={1500 - Math.abs(Math.sin(f / 4)) * 60}
            r={22}
            fill="#f2f2f2"
            stroke="#333"
            strokeWidth={4}
          />
        </>
      }
    />
  );
};
const S55: React.FC = () => {
  const { f, dur } = useShot('5.5');
  return (
    <Stage2
      set={yardField(f, { score: [12, 0] })}
      cam={cutCam(
        f,
        [
          {
            at: 0,
            a: bodyCam(interpolate(f, [0, dur], [700, 900]), 1520, 0.72, 2.0),
            b: bodyCam(900, 1520, 0.72, 2.1),
          },
        ],
        dur,
      )}
      f={f}
      actors={
        <Extra
          k={9}
          x={interpolate(f, [0, dur], [700, 900])}
          y={1520}
          size={0.72}
          t={f}
          pose="walk"
          facing={1}
          eyes="sad"
          look={{ x: 0, y: 0.8 }}
          speed={0.5}
        />
      }
    />
  );
};

// ───────── 5.6 First day of Tết: 6 greeting panels ─────────
const TetCell: React.FC<{ f: number; i: number }> = ({ f, i }) => (
  <Stage2
    set={livingRoom(f, { table: false, lights: (k) => (Math.floor(f / 8) + k + i) % 2 === 0 })}
    cam={{ x: 500, y: 1080, z: 1.3 }}
    f={f}
    actors={
      <>
        <Relative k={i} x={300} y={1520} t={f + i * 7} facing={1} eyes="happy" />
        <Clone
          k={i + 1}
          x={680}
          y={1540}
          t={f + i * 5}
          facing={-1}
          eyes="happy"
          pose="pray"
          lean={Math.max(0, Math.sin(f / 8)) * 14}
        />
      </>
    }
  />
);
const S56: React.FC = () => {
  const { f, dur, L } = useShot('5.6');
  const split = f >= L('L088') - 2;
  const snaps = Array.from({ length: 6 }, (_, k) => L('L087') + 4 + k * 7);
  const n = 1 + snaps.filter((s) => f >= s).length;
  if (!split)
    return (
      <AbsoluteFill>
        <Stage2
          set={livingRoom(f, { table: false, lights: (k) => (Math.floor(f / 8) + k) % 2 === 0 })}
          cam={cutCam(
            f,
            [
              { at: 0, a: { x: 560, y: 960, z: 1.0 }, b: { x: 560, y: 960, z: 1.06 } },
              {
                at: L('L087') - 2,
                a: { x: 640, y: 1080, z: 1.2 },
                b: { x: 640, y: 1080, z: 1.25 },
              },
            ],
            dur,
          )}
          f={f}
          actors={
            <>
              <Ban x={500} y={1540} t={f} pose="raise" eyes="happy" />
              {snaps.map((s, k) => {
                const q = popIn(f, s);
                const x = [-200, 160, 840, 1180, -500, 1500][k];
                return (
                  <g key={k}>
                    <PopRing x={x} y={1520} u={f - s} />
                    <Clone
                      k={k + 1}
                      x={x}
                      y={1520}
                      t={f}
                      opacity={q.opacity}
                      squash={q.squash}
                      sparkle={q.sparkle}
                      eyes="happy"
                    />
                  </g>
                );
              })}
            </>
          }
        />
        <ClonerCounter
          n={n}
          f={f}
          changedAt={snaps.filter((s) => f >= s).pop() ?? -30}
          show={f >= L('L087') ? 1 : 0}
        />
      </AbsoluteFill>
    );
  return (
    <AbsoluteFill
      style={{
        background: '#2b2230',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gridTemplateRows: '1fr 1fr',
        gap: 10,
        padding: 10,
      }}
    >
      {Array.from({ length: 6 }, (_, i) => (
        <div
          key={i}
          style={{
            position: 'relative',
            overflow: 'hidden',
            borderRadius: 16,
            opacity: interpolate(f - (L('L088') + i * 3), [0, 6], [0, 1], clamp),
          }}
        >
          <div
            style={{
              width: 1920,
              height: 1080,
              transform: 'translate(-170px,-10px) scale(0.5)',
              transformOrigin: '0 0',
              position: 'absolute',
            }}
          >
            <TetCell f={f} i={i} />
          </div>
        </div>
      ))}
    </AbsoluteFill>
  );
};

// ───────── 5.7 Handing in lucky money – one envelope short ─────────
const Envelope: React.FC<{ x: number; y: number; r?: number }> = ({ x, y, r = 0 }) => (
  <g transform={`translate(${x},${y}) rotate(${r})`}>
    <rect x={-30} y={-44} width={60} height={88} rx={6} fill="#d23a2a" />
    <circle cx={0} cy={-6} r={14} fill="#e8c45a" />
  </g>
);
const S57: React.FC = () => {
  const { f, dur, L } = useShot('5.7');
  const handed = Math.min(5, Math.floor(interpolate(f, [8, L('L091') - 4], [0, 5.9], clamp)));
  return (
    <AbsoluteFill>
      <Stage2
        set={livingRoom(f, { table: false, night: true, lights: (k) => k % 2 === 0 })}
        cam={cutCam(
          f,
          [
            { at: 0, a: { x: 640, y: 1080, z: 1.05 }, b: { x: 640, y: 1080, z: 1.12 } },
            { at: L('L091') - 2, a: { x: 160, y: 1200, z: 2.0 }, b: { x: 160, y: 1200, z: 2.15 } },
          ],
          dur,
        )}
        f={f}
        actors={
          <>
            <Ban x={160} y={1540} t={f} facing={1} pose="hold" itemR="tray" eyes="normal" />
            {Array.from({ length: handed }, (_, i) => (
              <Envelope key={i} x={180 + i * 22} y={1210 - i * 6} r={(i - 2) * 8} />
            ))}
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Clone
                key={i}
                k={i + 1}
                x={420 + i * 220}
                y={1540}
                t={f + i * 4}
                facing={-1}
                eyes="happy"
                pose={i === handed ? 'reach' : 'stand'}
              />
            ))}
          </>
        }
      />
      <BigText lines={['THIẾU 1 BAO']} from={L('L091')} f={f} y={130} size={120} color="#ff4a3a" />
    </AbsoluteFill>
  );
};
const S58: React.FC = () => {
  const { f, dur, L } = useShot('5.8');
  const toOrig = f >= L('L093');
  return (
    <Stage2
      set={livingRoom(f, { table: false, night: true, lights: (k) => k % 2 === 0 })}
      cam={cutCam(
        f,
        [
          { at: 0, a: { x: 900, y: 1060, z: 1.25 }, b: { x: 900, y: 1060, z: 1.35 } },
          { at: L('L093') - 2, a: { x: 640, y: 1060, z: 1.05 }, b: { x: 640, y: 1060, z: 1.12 } },
        ],
        dur,
      )}
      f={f}
      actors={
        <>
          <Ban
            x={160}
            y={1540}
            t={f}
            facing={1}
            pose="hold"
            itemR="tray"
            eyes={toOrig ? 'wide' : 'normal'}
            shiver={toOrig ? 0.6 : 0}
          />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Clone
              key={i}
              k={i + 1}
              x={420 + i * 220}
              y={1540}
              t={f + i * 4}
              facing={toOrig ? -1 : Math.sin(f / 10 + i) > 0 ? 1 : -1}
              eyes="half"
            />
          ))}
        </>
      }
    />
  );
};

// ───────── 5.9 Three clones give the presentation, you nap ─────────
const S59: React.FC = () => {
  const { f, at, L } = useShot('5.9');
  const cuts = [L('L096'), at('L096', 'làm slide'), at('L096', 'tập nói'), L('L097')];
  const seg = cuts.filter((c) => f >= c - 2).length;
  const cams = [
    { x: 640, y: 1080, z: 1.0 },
    { x: -330, y: 1100, z: 1.8 },
    { x: 1080, y: 1060, z: 2.0 },
    { x: 220, y: 1100, z: 1.8 },
    { x: 500, y: 1200, z: 1.7 },
  ];
  return (
    <Stage2
      set={bedroomDay(f)}
      cam={{ ...cams[seg], z: cams[seg].z * (1 + (f % 60) * 0.001) }}
      f={f}
      actors={
        <>
          <Clone k={1} x={-330} y={1540} t={f} facing={1} pose="hold" itemR="paper" eyes="squint" />
          <Clone k={2} x={1080} y={1440} t={f} facing={0} back pose="sitChair" />
          <g>
            <rect
              x={140}
              y={700}
              width={180}
              height={300}
              rx={20}
              fill="#d4dcdc"
              stroke="#8a9a9c"
              strokeWidth={8}
            />
            <Clone k={3} x={230} y={1540} t={f} facing={-1} pose="point" eyes="normal" />
          </g>
          <LyingKid x={720} y={1305} f={f} eyes="closed" />
          {[0, 1, 2].map((i) => {
            const u = (f + i * 30) % 90;
            return (
              <text
                key={i}
                x={300 + u}
                y={1180 - u * 1.4}
                fontFamily={FONT}
                fontWeight={800}
                fontSize={44}
                fill="#fff"
                opacity={interpolate(u, [0, 20, 70, 90], [0, 0.8, 0.8, 0], clamp)}
              >
                z
              </text>
            );
          })}
        </>
      }
    />
  );
};

// ───────── 5.10 Best presentation in class ─────────
const S510: React.FC = () => {
  const { f, dur, L } = useShot('5.10');
  const clap = f >= L('L100') - 2;
  return (
    <Stage2
      set={classroom(f)}
      cam={cutCam(
        f,
        [
          { at: 0, a: { x: 540, y: 900, z: 1.0 }, b: { x: 540, y: 900, z: 1.06 } },
          {
            at: L('L099') - 2,
            a: faceCam(-200, 1480, 1.05, 2.3),
            b: faceCam(-200, 1480, 1.05, 2.5),
          },
          { at: L('L100') - 2, a: { x: 560, y: 1160, z: 1.15 }, b: { x: 560, y: 1160, z: 1.2 } },
        ],
        dur,
      )}
      f={f}
      actors={
        <>
          <g>
            <rect x={160} y={380} width={760} height={420} rx={10} fill="#fffbe8" />
            <text
              x={540}
              y={470}
              textAnchor="middle"
              fontFamily={FONT}
              fontWeight={800}
              fontSize={56}
              fill="#3a3346"
            >
              THUYẾT TRÌNH
            </text>
            {[0.5, 0.8, 0.65, 0.95].map((k, i) => (
              <rect
                key={i}
                x={260 + i * 130}
                y={760 - k * 220}
                width={90}
                height={k * 220}
                fill={[C.orange, '#7ad0ff', '#ffc83a', '#5cd48a'][i]}
              />
            ))}
            <ellipse
              cx={540}
              cy={590}
              rx={520}
              ry={320}
              fill="#fff8d0"
              opacity={0.25}
              style={{ filter: 'blur(30px)' }}
            />
          </g>
          <Co x={-200} y={1480} t={f} facing={1} eyes="happy" />
          <Ban x={1060} y={1500} t={f} facing={-1} eyes="happy" pose="armsUp" />
          {[0, 1, 2, 3, 4].map((i) => (
            <Extra
              key={i}
              k={i + 1}
              x={60 + i * 230}
              y={1700 + (i % 2) * 30}
              size={0.9}
              t={f + i * 3}
              back
              pose={clap && Math.floor((f + i * 4) / 5) % 2 ? 'pray' : 'stand'}
            />
          ))}
        </>
      }
    />
  );
};
const S511: React.FC = () => {
  const { f, dur, L } = useShot('5.11');
  const sweat = (f % 40) / 40;
  return (
    <AbsoluteFill>
      <Stage2
        set={classroom(f)}
        cam={cutCam(
          f,
          [
            { at: 0, a: faceCam(-200, 1480, 1.05, 2.4), b: faceCam(-200, 1480, 1.05, 2.6) },
            {
              at: L('L102') - 2,
              a: faceCam(1060, 1500, 1, 2.8),
              b: faceCam(1060, 1500, 1, 3.6),
              hold: true,
            },
          ],
          dur,
        )}
        f={f}
        actors={
          <>
            <Co x={-200} y={1480} t={f} facing={1} eyes="normal" />
            <Ban x={1060} y={1500} t={f} facing={-1} eyes="wide" shiver={0.8} />
            <ellipse
              cx={1150}
              cy={1000 + sweat * 80}
              rx={14}
              ry={22}
              fill="#bfe6ff"
              opacity={1 - sweat}
            />
            <ellipse
              cx={970}
              cy={980 + ((sweat + 0.5) % 1) * 80}
              rx={10}
              ry={16}
              fill="#bfe6ff"
              opacity={1 - ((sweat + 0.5) % 1)}
            />
          </>
        }
      />
    </AbsoluteFill>
  );
};

// ───────── 5.12 The forgetting curve ─────────
const S512: React.FC = () => {
  const { f, dur, L } = useShot('5.12');
  const stamp = f < L('L106') - 2;
  const k = interpolate(f, [L('L106'), L('L106') + 60], [0, 1], clamp);
  const pts = Array.from({ length: 40 }, (_, i) => {
    const x = (i / 39) * 900;
    const y = 100 + (1 - Math.exp(-i / 6)) * 0.5 * 500;
    return `${i ? 'L' : 'M'}${x} ${y}`;
  }).join(' ');
  return (
    <AbsoluteFill>
      <Stage2
        set={minimal('#3f4a5a', '#262c38')}
        cam={cutCam(
          f,
          [{ at: 0, a: { ...WIDE, y: 900, z: 1 }, b: { ...WIDE, y: 900, z: 1.05 } }],
          dur,
        )}
        f={f}
        actors={
          stamp ? null : (
            <g transform="translate(60,480)">
              <line x1={0} y1={0} x2={0} y2={620} stroke="#fff" strokeWidth={5} />
              <line x1={0} y1={620} x2={940} y2={620} stroke="#fff" strokeWidth={5} />
              <text
                x={-20}
                y={110}
                textAnchor="end"
                fontFamily={FONT}
                fontWeight={800}
                fontSize={40}
                fill="#fff"
              >
                100%
              </text>
              <text
                x={-20}
                y={360}
                textAnchor="end"
                fontFamily={FONT}
                fontWeight={800}
                fontSize={40}
                fill="#fff"
              >
                50%
              </text>
              <path
                d={pts}
                stroke="#7ad0ff"
                strokeWidth={12}
                fill="none"
                strokeDasharray={`${1400 * k} 1400`}
              />
              <text
                x={900}
                y={680}
                textAnchor="end"
                fontFamily={FONT}
                fontWeight={800}
                fontSize={40}
                fill="#fff"
              >
                1 ngày
              </text>
              {f >= L('L107') && (
                <line
                  x1={0}
                  y1={610}
                  x2={900 * interpolate(f, [L('L107'), L('L107') + 20], [0, 1], clamp)}
                  y2={610}
                  stroke={C.orange}
                  strokeWidth={12}
                />
              )}
              {f >= L('L107') && (
                <text
                  x={460}
                  y={580}
                  textAnchor="middle"
                  fontFamily={FONT}
                  fontWeight={800}
                  fontSize={44}
                  fill={C.orange}
                >
                  bạn: 0% – chưa từng học
                </text>
              )}
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
      {!stamp && (
        <BigText
          lines={['-50% SAU 1 NGÀY']}
          from={L('L106') + 30}
          f={f}
          y={120}
          size={110}
          color="#7ad0ff"
        />
      )}
    </AbsoluteFill>
  );
};

export const ACT45: Record<string, ShotDef> = {
  '4.1': {
    C: S41,
    amb: 'bedroom',
    fx: (h) => [hit('paper', 4, 0.5), hit('blanket', h.L('L051'), 0.5)],
  },
  '4.2': {
    C: S42,
    amb: 'bedroom',
    fx: (h) =>
      [
        h.L('L053') + 10,
        h.L('L054') + 6,
        h.L('L056') + 8,
        h.L('L057') + 6,
        h.L('L057') + 18,
      ].flatMap((t, i) => snapPop(t, i + 2, 0.8)),
  },
  '4.3': { C: S43, amb: 'bedroom', fx: (h) => [0, 30, 60].map((t) => hit('phone_swipe', t, 0.3)) },
  '4.4': { C: S44, amb: 'quiet', fx: () => [hit('ting', 0, 0.8)] },
  '4.5': {
    C: S45,
    amb: 'bedroom',
    fx: (h) => [hit('door_open', 4, 0.8), hit('cloth', h.L('L062') + 4, 0.6)],
  },
  '4.6': {
    C: S46,
    amb: 'bedroom',
    fx: (h) => [
      hit('door_close', 4, 0.8),
      hit('tea_pour', h.L('L065'), 0.7),
      loopFor('steps_tile_loop', h.L('L066') - 14, h.L('L066') + 4, 0.5, 4),
      hit('door_open', h.L('L066'), 0.6),
    ],
  },
  '4.7': {
    C: S47,
    amb: 'bedroom',
    fx: (h) => [hit('wardrobe', h.L('L068'), 0.6), hit('wardrobe', h.L('L068') + 30, 0.4)],
  },
  '4.8': { C: S48, amb: 'bedroom', fx: () => [hit('cup', 6, 0.6)] },
  '4.9': {
    C: S49,
    amb: 'bedroom',
    fx: (h) => [
      hit('paper', h.L('L071'), 0.5),
      hit('paper', h.L('L072'), 0.5),
      hit('whoosh_ui', h.L('L073'), 0.6),
    ],
  },
  '5.1': { C: S51, amb: 'bedroom', fx: () => [hit('confetti', 0, 0.8)] },
  '5.2': {
    C: S52,
    amb: 'class',
    fx: (h) => [
      hit('broom', 0, 0.8),
      hit('rag', 20, 0.6),
      hit('desk_drag', h.L('L077'), 0.7),
      hit('shimmer', h.L('L078'), 0.6),
    ],
  },
  '5.3': { C: S53, amb: 'class', fx: (h) => [hit('whoosh', h.L('L080') + 4, 0.3)] },
  '5.4': {
    C: S54,
    amb: 'yard',
    fx: (h) => [
      hit('whistle', 0, 0.7),
      hit('ball_kick', 18, 0.8),
      hit('ball_kick', h.L('L083'), 0.8),
      hit('cheer', h.L('L084'), 0.8),
      hit('ball_roll', 30, 0.5),
    ],
  },
  '5.5': { C: S55, amb: 'yard', fx: (h) => [loopFor('steps_small_loop', 0, h.dur, 0.4, 6)] },
  '5.6': {
    C: S56,
    amb: 'tet',
    fx: (h) => [
      ...Array.from({ length: 6 }, (_, k) => snapPop(h.L('L087') + 4 + k * 7, k + 1, 0.7)).flat(),
      hit('confetti', h.L('L088'), 0.8),
      hit('confetti', h.L('L089'), 0.6),
    ],
  },
  '5.7': {
    C: S57,
    amb: 'tet',
    fx: (h) =>
      [0, 12, 24, 36, 48]
        .map((t) => hit('envelope', 8 + t, 0.6))
        .concat([hit('buzz', h.L('L091'), 0.5)]),
  },
  '5.8': { C: S58, amb: 'tet' },
  '5.9': {
    C: S59,
    amb: 'bedroom',
    fx: (h) => [
      hit('page_flip', h.L('L096'), 0.6),
      hit('typing', h.at('L096', 'làm slide'), 0.6),
      hit('mouse_click', h.at('L096', 'làm slide') + 20, 0.6),
    ],
  },
  '5.10': { C: S510, amb: 'class', fx: (h) => [hit('applause', h.L('L100'), 0.9)] },
  '5.11': {
    C: S511,
    amb: 'none',
    fx: (h) => [
      loopFor('cicadas_loop', 0, h.dur + 6, 0.2, 10),
      loopFor('amb_room_tone_loop', 0, h.dur + 6, 0.5, 10),
    ],
  },
  '5.12': {
    C: S512,
    amb: 'rules',
    fx: (h) => [hit('whoosh_ui', 0, 0.6), hit('whoosh', h.L('L106'), 0.5)],
  },
};
