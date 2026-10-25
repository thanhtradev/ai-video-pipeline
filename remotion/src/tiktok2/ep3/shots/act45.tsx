import React from 'react';
import { AbsoluteFill, interpolate } from 'remotion';
import { classroom, hallway } from '../../ep1/sets';
import { cutCam } from '../../ep1/Stage';
import { C } from '../../ep1/theme';
import { BigText, Pow } from '../../ep1/ui';
import { dining, stairs, yardField } from '../../ep2/sets';
import {
  Ban,
  BigClock,
  clamp,
  Co,
  Extra,
  faceCam,
  Goalie,
  hit,
  Linh,
  loopFor,
  Notebook,
  RewindCounter,
  RewindFX,
  rewindDot,
  rewindTime,
  ShotDef,
  Stage2,
} from '../kit';
import { schoolGate } from '../sets';
import { useShot } from '../time';
import { GB, Students } from './act123';

const REW = 30;

// ───────── 4.1 Spilled milk → rewind ─────────
const S41: React.FC = () => {
  const { f, dur, L } = useShot('4.1');
  const spill = L('L052') + 14;
  const rew = L('L053');
  const tip = interpolate(rewindTime(f, rew, REW, 3), [spill, spill + 8], [0, 1], clamp);
  return (
    <AbsoluteFill>
      {f < L('L052') - 2 ? (
        <AbsoluteFill style={{ background: '#3a3440' }}>
          <BigClock time="8:00" f={f} sub={f < L('L051') ? 'NGÀY 1 → 2' : '8:00 SÁNG'} />
        </AbsoluteFill>
      ) : (
        <RewindFX f={f} from={rew} dur={REW}>
          <Stage2
            set={dining(f)}
            cam={cutCam(
              f,
              [{ at: 0, a: { x: 620, y: 1160, z: 2.0 }, b: { x: 620, y: 1160, z: 2.1 } }],
              dur,
            )}
            f={f}
            actors={
              <>
                <Ban
                  x={820}
                  y={1560}
                  t={f}
                  facing={-1}
                  eyes={tip > 0.5 && f < rew ? 'wide' : 'normal'}
                  pose="reach"
                />
                <g transform={`translate(620,1250) rotate(${tip * 85})`}>
                  <path d="M-24 0 L24 0 L30 -90 L-30 -90 Z" fill="#f2f2f2" opacity={0.85} />
                  <rect x={-24} y={-70} width={48} height={66} fill="#fffbe8" opacity={1 - tip} />
                </g>
                {tip > 0.5 && <ellipse cx={540} cy={1252} rx={120 * tip} ry={12} fill="#fffbe8" />}
              </>
            }
          />
        </RewindFX>
      )}
      <RewindCounter used={f >= rew + REW ? 1 : 0} f={f} pop={rew + REW} />
    </AbsoluteFill>
  );
};
// ───────── 4.2 Tripping on the stairs → rewind ─────────
const S42: React.FC = () => {
  const { f, L } = useShot('4.2');
  const trip = 20;
  const rew = L('L055');
  const tw = rewindTime(f, rew, REW, 3);
  const fall = interpolate(tw, [trip, trip + 10], [0, 1], clamp);
  return (
    <AbsoluteFill>
      <RewindFX f={f} from={rew} dur={REW}>
        <Stage2
          set={stairs(f)}
          cam={{ x: 600, y: 1000, z: 1.2 }}
          f={f}
          shake={fall > 0.5 && f < rew ? 6 : 0}
          actors={
            <Ban
              x={interpolate(tw, [0, trip], [300, 620], clamp)}
              y={interpolate(tw, [0, trip], [1000, 1260], clamp) + fall * 60}
              t={f}
              pose={fall > 0.3 ? 'flail' : 'walk'}
              facing={1}
              lean={fall * 50}
              eyes={fall > 0.3 ? 'wide' : 'normal'}
              accessories={['backpack']}
            />
          }
        />
      </RewindFX>
      <RewindCounter used={f >= rew + REW ? 2 : 1} f={f} pop={rew + REW} />
    </AbsoluteFill>
  );
};
// ───────── 4.3 "Dạ có" to the wrong name – out of turns ─────────
const S43: React.FC = () => {
  const { f, dur, L } = useShot('4.3');
  const laugh = L('L056') + 40;
  const used = f >= L('L057') ? 3 : 2;
  return (
    <AbsoluteFill>
      {f < L('L058') - 2 ? (
        <Stage2
          set={classroom(f)}
          cam={cutCam(
            f,
            [
              { at: 0, a: faceCam(-200, 1480, 1.05, 2.0), b: faceCam(-200, 1480, 1.05, 2.1) },
              {
                at: L('L056') + 20,
                a: { x: 640, y: 1160, z: 1.15 },
                b: { x: 640, y: 1160, z: 1.2 },
              },
            ],
            dur,
          )}
          f={f}
          actors={
            <>
              <Co
                x={-200}
                y={1480}
                t={f}
                facing={1}
                eyes={f > laugh ? 'half' : 'normal'}
                pose="hold"
                itemR="paper"
              />
              {Array.from({ length: 5 }, (_, i) => (
                <Extra
                  key={i}
                  k={i + 1}
                  x={60 + i * 230}
                  y={1660 + (i % 2) * 30}
                  size={0.9}
                  t={f}
                  back={f < laugh}
                  facing={0}
                  pose="sitChair"
                  eyes="happy"
                  lean={f > laugh ? Math.sin(f / 3 + i) * 6 : 0}
                />
              ))}
              <Ban
                x={1160}
                y={1540}
                t={f}
                facing={-1}
                pose="raise"
                eyes={f > laugh ? 'squint' : 'happy'}
                shiver={f > laugh ? 0.6 : 0}
              />
            </>
          }
        />
      ) : (
        <AbsoluteFill style={{ background: '#3a3440' }}>
          <BigClock time="8:15" f={f} sub="CÒN 16 TIẾNG…" />
        </AbsoluteFill>
      )}
      {f >= L('L056') + 10 && f < laugh && (
        <Pow
          text="DẠ CÓ!"
          x={720}
          y={300}
          from={L('L056') + 10}
          f={f}
          size={110}
          color={C.orange}
        />
      )}
      <RewindCounter
        used={used}
        f={f}
        pop={L('L057')}
        shake={f >= L('L057') && f < L('L057') + 20 ? 1 : 0}
      />
    </AbsoluteFill>
  );
};
// ───────── 4.4 The notebook with three circles ─────────
const S44: React.FC = () => {
  const { f, L } = useShot('4.4');
  const fill = L('L061') + 6;
  return (
    <AbsoluteFill style={{ background: '#3a3036' }}>
      <AbsoluteFill style={{ transform: `scale(${1 + f * 0.0015})` }}>
        <Notebook f={f} filled={f >= fill ? 1 : 0} fillAt={[fill]} label="THỨ BA" />
        <svg width={1920} height={1080} style={{ position: 'absolute' }}>
          <g
            transform={`translate(${interpolate(f, [fill - 10, fill + 10], [1300, 820], clamp)},${interpolate(f, [fill - 10, fill + 10], [800, 570], clamp)}) rotate(35)`}
          >
            <rect x={-12} y={-180} width={24} height={200} rx={8} fill="#3a5a8a" />
            <path d="M-12 20 L12 20 L0 50 Z" fill="#d8c8a8" />
          </g>
        </svg>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
// ───────── 4.5 Spent like coins ─────────
const S45: React.FC = () => {
  const { f, dur } = useShot('4.5');
  const n = Math.min(3, 1 + Math.floor(f / 20));
  return (
    <AbsoluteFill>
      <Stage2
        set={schoolGate(f)}
        cam={cutCam(
          f,
          [
            {
              at: 0,
              a: faceCam(GB.x, GB.y, 1, 1.8, 120),
              b: faceCam(GB.x, GB.y, 1, 2.0, 120),
              hold: true,
            },
          ],
          dur,
        )}
        f={f}
        actors={
          <>
            <Ban
              x={GB.x}
              y={GB.y}
              t={f}
              facing={-1}
              eyes="half"
              pose="hold"
              handR={{ x: -40, y: -280 }}
              handL={{ x: -100, y: -270 }}
              look={{ x: -0.6, y: 0.8 }}
            />
            {Array.from({ length: n }, (_, i) => (
              <circle
                key={i}
                cx={GB.x - 80 + i * 24}
                cy={GB.y - 300 - i * 6}
                r={22}
                fill={C.orange}
                stroke="#ffd27a"
                strokeWidth={5}
              />
            ))}
          </>
        }
      />
      <RewindCounter used={0} f={f} />
    </AbsoluteFill>
  );
};

// ───────── 5.1–5.5 Penalty kick ─────────
const GOAL = { x: 1500, y: 1420 };
const SPOT = { x: 900, y: 1560 };
const Penalty: React.FC<{
  f: number;
  tw: number;
  kick: number;
  dir: number;
  result: 'miss' | 'goal' | null;
  cam: { x: number; y: number; z: number };
}> = ({ f, tw, kick, dir, result, cam }) => {
  const u = tw - kick;
  const k = interpolate(u, [0, 22], [0, 1], clamp);
  const dive = interpolate(u, [2, 14], [0, 1], clamp);
  const bx =
    SPOT.x + 80 + (GOAL.x + dir * 140 - SPOT.x - 80) * k + (result === 'miss' ? k * 240 : 0);
  const by = SPOT.y - 20 - Math.sin(k * Math.PI) * 140 + (GOAL.y - 100 - SPOT.y) * k;
  return (
    <Stage2
      set={yardField(f)}
      cam={cam}
      f={f}
      actors={
        <>
          <Goalie
            x={GOAL.x - dive * 160}
            y={GOAL.y - dive * 60}
            t={tw}
            pose={dive > 0.3 ? 'armsUp' : 'shrug'}
            facing={-1}
            lean={-dive * 70}
            eyes={result === 'goal' && u > 20 ? 'half' : 'wide'}
          />
          <Ban
            x={SPOT.x - 40}
            y={SPOT.y}
            t={f}
            facing={1}
            pose={u > -6 && u < 8 ? 'run' : 'stand'}
            eyes={result === 'goal' && u > 22 ? 'happy' : 'squint'}
          />
          <circle
            cx={u < 0 ? SPOT.x + 80 : bx}
            cy={u < 0 ? SPOT.y - 20 : by}
            r={24}
            fill="#f2f2f2"
            stroke="#333"
            strokeWidth={4}
          />
          {result === 'goal' && u > 20 && (
            <path
              d={`M${GOAL.x + 60} ${GOAL.y - 240} Q${GOAL.x + 120 + Math.sin(f) * 14} ${GOAL.y - 130} ${GOAL.x + 60} ${GOAL.y}`}
              stroke="#fff"
              strokeWidth={4}
              fill="none"
              opacity={0.7}
            />
          )}
        </>
      }
    />
  );
};
const S51: React.FC = () => {
  const { f, dur, L } = useShot('5.1');
  return (
    <Stage2
      set={yardField(f)}
      cam={cutCam(
        f,
        [
          { at: 0, a: faceCam(820, 1560, 1, 1.9, 60), b: faceCam(820, 1560, 1, 2.0, 60) },
          { at: L('L064') - 2, a: { x: 1100, y: 1100, z: 1.0 }, b: { x: 1100, y: 1100, z: 1.05 } },
        ],
        dur,
      )}
      f={f}
      actors={
        <>
          <Goalie x={GOAL.x} y={GOAL.y} t={f} pose="shrug" facing={-1} eyes="normal" />
          <Ban
            x={SPOT.x - 40}
            y={SPOT.y}
            t={f}
            facing={1}
            pose={f > L('L064') ? 'reach' : 'stand'}
            eyes="happy"
          />
          <circle
            cx={SPOT.x + 80}
            cy={SPOT.y - 20}
            r={24}
            fill="#f2f2f2"
            stroke="#333"
            strokeWidth={4}
          />
        </>
      }
    />
  );
};
const S52: React.FC = () => {
  const { f, L } = useShot('5.2');
  const kick = L('L065') + 6;
  const slow = Math.round(kick + (f - kick) * 0.5);
  return (
    <Penalty
      f={f}
      tw={f < kick ? f : slow}
      kick={kick}
      dir={-1}
      result="miss"
      cam={{ x: 1200, y: 1150, z: f < L('L066') ? 1.0 : 1.3 }}
    />
  );
};
const S53: React.FC = () => {
  const { f } = useShot('5.3');
  const tw = 60 - f * 3;
  return (
    <AbsoluteFill>
      <RewindFX f={f} from={0} dur={REW}>
        <Penalty
          f={f}
          tw={Math.max(-10, tw)}
          kick={0}
          dir={-1}
          result="miss"
          cam={{ x: 1200, y: 1150, z: 1.1 }}
        />
      </RewindFX>
      <RewindCounter used={f >= REW ? 1 : 0} f={f} pop={REW} />
    </AbsoluteFill>
  );
};
const S54: React.FC = () => {
  const { f, dur, L } = useShot('5.4');
  const kick = 10;
  return (
    <AbsoluteFill>
      <Penalty
        f={f}
        tw={f}
        kick={kick}
        dir={1}
        result="goal"
        cam={
          f < L('L070') - 2 ? { x: 1200, y: 1150, z: 1.05 } : { x: GOAL.x, y: GOAL.y - 160, z: 1.9 }
        }
      />
      {f >= L('L070') && (
        <Pow text="VÀOOO!" x={600} y={300} from={L('L070')} f={f} size={150} color={C.orange} />
      )}
      <RewindCounter used={1} f={f} />
      {dur && null}
    </AbsoluteFill>
  );
};
const S55: React.FC = () => {
  const { f, dur, L } = useShot('5.5');
  return (
    <Stage2
      set={yardField(f)}
      cam={cutCam(
        f,
        [
          { at: 0, a: { x: 1200, y: 1100, z: 1.1 }, b: { x: 1200, y: 1100, z: 1.15 } },
          {
            at: L('L072') - 2,
            a: faceCam(GOAL.x, GOAL.y, 1, 2.6),
            b: faceCam(GOAL.x, GOAL.y, 1, 3.2),
            hold: true,
          },
        ],
        dur,
      )}
      f={f}
      actors={
        <>
          <Goalie x={GOAL.x} y={GOAL.y} t={f} facing={-1} eyes="half" look={{ x: -0.8, y: 0 }} />
          <Ban x={SPOT.x} y={SPOT.y} t={f} facing={1} eyes="happy" pose="armsUp" />
        </>
      }
    />
  );
};

// ───────── 5.6–5.8 Homeroom period: the joke ─────────
const Class: React.FC<{ f: number; mood: 'silent' | 'cough' | 'laugh' | 'idle'; tw: number }> = ({
  f,
  mood,
  tw,
}) => (
  <>
    <Co x={-260} y={1480} t={tw} facing={1} eyes={mood === 'laugh' ? 'happy' : 'normal'} />
    <Ban
      x={240}
      y={1500}
      t={f}
      facing={0}
      pose={mood === 'laugh' ? 'armsUp' : 'shrug'}
      eyes={mood === 'silent' || mood === 'cough' ? 'squint' : 'happy'}
    />
    {Array.from({ length: 6 }, (_, i) => (
      <Extra
        key={i}
        k={i + 1}
        x={-100 + i * 240}
        y={1700 + (i % 2) * 30}
        size={0.9}
        t={tw + i * 4}
        facing={0}
        pose="sitChair"
        eyes={mood === 'laugh' ? 'happy' : 'half'}
        lean={
          mood === 'laugh'
            ? Math.sin(tw / 3 + i) * 14
            : mood === 'cough' && i === 3
              ? Math.sin(tw * 1.4) * 8
              : 0
        }
      />
    ))}
  </>
);
const S56: React.FC = () => {
  const { f, dur } = useShot('5.6');
  return (
    <Stage2
      set={classroom(f)}
      cam={cutCam(
        f,
        [{ at: 0, a: { x: 500, y: 1040, z: 0.95 }, b: { x: 500, y: 1040, z: 1.02 } }],
        dur,
      )}
      f={f}
      actors={<Class f={f} mood="idle" tw={f} />}
    />
  );
};
const S57: React.FC = () => {
  const { f, dur, L } = useShot('5.7');
  const r1 = L('L078');
  const r2 = L('L081');
  const inR1 = f >= r1 && f < r1 + REW;
  const mood = f < L('L078') ? 'silent' : f >= L('L080') - 2 && f < r2 ? 'cough' : 'idle';
  const used = f >= r2 + REW ? 2 : f >= r1 + REW ? 1 : 0;
  return (
    <AbsoluteFill>
      <RewindFX f={f} from={inR1 ? r1 : r2} dur={REW}>
        <Stage2
          set={classroom(f)}
          cam={cutCam(
            f,
            [
              { at: 0, a: { x: 500, y: 1120, z: 1.15 }, b: { x: 500, y: 1120, z: 1.2 } },
              { at: L('L079') - 2, a: faceCam(240, 1500, 1, 2.2), b: faceCam(240, 1500, 1, 2.4) },
              { at: L('L080') - 2, a: { x: 760, y: 1250, z: 1.5 }, b: { x: 760, y: 1250, z: 1.6 } },
            ],
            dur,
          )}
          f={f}
          actors={
            <Class
              f={f}
              mood={mood}
              tw={inR1 ? rewindTime(f, r1, REW, 3) : rewindTime(f, r2, REW, 3)}
            />
          }
        />
      </RewindFX>
      {f >= L('L080') && f < r2 && (
        <Pow text="E HÈM…" x={1050} y={400} from={L('L080')} f={f} size={90} rot={6} />
      )}
      <RewindCounter used={used} f={f} pop={used === 2 ? r2 + REW : r1 + REW} />
    </AbsoluteFill>
  );
};
const S58: React.FC = () => {
  const { f, dur, L } = useShot('5.8');
  return (
    <AbsoluteFill>
      <Stage2
        set={classroom(f)}
        cam={cutCam(
          f,
          [
            { at: 0, a: { x: 500, y: 1080, z: 1.0 }, b: { x: 500, y: 1080, z: 1.08 } },
            { at: L('L084') - 2, a: faceCam(240, 1500, 1, 2.2), b: faceCam(240, 1500, 1, 2.4) },
            { at: L('L085') - 2, a: { x: 500, y: 1080, z: 1.15 }, b: { x: 500, y: 1080, z: 1.2 } },
          ],
          dur,
        )}
        f={f}
        shake={f >= L('L083') && f < L('L084') ? 4 : 0}
        actors={<Class f={f} mood={f >= L('L083') ? 'laugh' : 'idle'} tw={f} />}
      />
      {f >= L('L083') && f < L('L084') && (
        <Pow text="HAHAHA" x={700} y={300} from={L('L083')} f={f} size={140} color="#ffc83a" />
      )}
      <RewindCounter used={2} f={f} />
    </AbsoluteFill>
  );
};

// ───────── 5.9–5.11 Linh, day five ─────────
const S59: React.FC = () => {
  const { f, dur, L } = useShot('5.9');
  const rew = L('L091');
  const tw = rewindTime(f, rew, REW, 3);
  return (
    <AbsoluteFill>
      <RewindFX f={f} from={rew} dur={REW}>
        <Stage2
          set={schoolGate(f, { leafT: tw })}
          cam={cutCam(
            f,
            [
              { at: 0, a: { x: 560, y: 1000, z: 1.0 }, b: { x: 560, y: 1000, z: 1.05 } },
              { at: L('L090') - 2, a: faceCam(GB.x, GB.y, 1, 2.5), b: faceCam(GB.x, GB.y, 1, 2.7) },
            ],
            dur,
          )}
          f={f}
          actors={
            <>
              <Students tw={tw} n={6} />
              <Linh
                x={Math.min(520, linhLocal(tw))}
                y={1500}
                t={tw}
                pose="walk"
                facing={1}
                eyes={f >= L('L090') && f < rew ? 'wide' : 'normal'}
                accessories={['backpack']}
              />
              <Ban
                x={GB.x}
                y={GB.y}
                t={f}
                facing={-1}
                eyes={f >= L('L090') && f < rew ? 'squint' : 'normal'}
                shiver={f >= L('L090') && f < rew ? 1 : 0}
              />
            </>
          }
        />
      </RewindFX>
      {f >= L('L090') && f < rew && (
        <Pow text="CH-CH-CHÀO…" x={700} y={320} from={L('L090')} f={f} size={110} />
      )}
      <RewindCounter used={f >= rew + REW ? 1 : 0} f={f} pop={rew + REW} />
    </AbsoluteFill>
  );
};
const linhLocal = (t: number) => interpolate(t, [0, 120], [-200, 520], clamp);
const S510: React.FC = () => {
  const { f, dur, L } = useShot('5.10');
  const walk = interpolate(f, [L('L094'), dur], [0, 900], clamp);
  return (
    <AbsoluteFill>
      {f < L('L096') - 2 ? (
        <Stage2
          set={schoolGate(f)}
          cam={cutCam(
            f,
            [
              { at: 0, a: { x: 640, y: 1040, z: 1.2 }, b: { x: 660, y: 1040, z: 1.28 } },
              {
                at: L('L094') - 2,
                a: { x: 700, y: 1060, z: 1.4 },
                b: { x: 720, y: 1060, z: 1.45 },
              },
              {
                at: L('L095') - 2,
                a: faceCam(520, 1500, 0.97, 2.4),
                b: faceCam(520, 1500, 0.97, 2.6),
              },
            ],
            dur,
          )}
          f={f}
          actors={
            <>
              <Linh x={520} y={1500} t={f} facing={1} eyes="happy" accessories={['backpack']} />
              <Ban
                x={GB.x}
                y={GB.y}
                t={f}
                facing={-1}
                eyes="happy"
                pose={f > L('L094') ? 'shrug' : 'stand'}
              />
            </>
          }
        />
      ) : (
        <Stage2
          set={hallway(f)}
          cam={{ x: 300 + walk * 0.5, y: 1040, z: 1.2 }}
          f={f}
          actors={
            <>
              <Linh
                x={150 + walk * 0.5}
                y={1560}
                t={f}
                pose="walk"
                facing={1}
                eyes="happy"
                speed={0.6}
                accessories={['backpack']}
              />
              <Ban
                x={330 + walk * 0.5}
                y={1580}
                t={f}
                pose="walk"
                facing={-1}
                eyes="happy"
                speed={0.6}
              />
            </>
          }
        />
      )}
      <RewindCounter used={1} f={f} />
    </AbsoluteFill>
  );
};
const S511: React.FC = () => {
  const { f, dur, L } = useShot('5.11');
  return (
    <AbsoluteFill>
      <Stage2
        set={hallway(f)}
        cam={{ x: 420, y: 1060, z: 1.1 + f * 0.002 }}
        f={f}
        actors={<Ban x={420} y={1580} t={f} eyes="happy" pose="armsUp" />}
      />
      <BigText
        lines={['HOÀN HẢO…', 'TRONG 30 GIÂY']}
        from={L('L097') + 4}
        f={f}
        y={160}
        size={110}
        accent={[1]}
      />
      {dur && null}
    </AbsoluteFill>
  );
};

export const ACT45: Record<string, ShotDef> = {
  '4.1': {
    C: S41,
    amb: 'gate',
    fx: (h) => [
      hit('tick', 0, 0.4),
      hit('glass_spill', h.L('L052') + 14, 0.8),
      ...rewindDot(h.L('L053'), h.L('L053') + REW, 0.8),
    ],
  },
  '4.2': {
    C: S42,
    amb: 'class',
    fx: (h) => [
      loopFor('steps_stairs_loop', 0, 20, 0.5, 2),
      hit('trip_fall', 22, 0.8),
      ...rewindDot(h.L('L055'), h.L('L055') + REW, 0.8),
    ],
  },
  '4.3': {
    C: S43,
    amb: 'class',
    fx: (h) => [
      hit('class_laugh', h.L('L056') + 40, 0.7),
      hit('dot_bup', h.L('L057'), 0.7),
      hit('tick_dead', h.L('L057') + 6, 0.5),
    ],
  },
  '4.4': {
    C: S44,
    amb: 'bedroom',
    fx: (h) => [hit('pen_scribble', h.L('L061') + 6, 0.8), hit('page_flip', 0, 0.5)],
  },
  '4.5': { C: S45, amb: 'gate', fx: () => [0, 20, 40].map((t) => hit('coin', t, 0.5)) },
  '5.1': { C: S51, amb: 'yard', fx: () => [hit('ball_bounce', 20, 0.5)] },
  '5.2': {
    C: S52,
    amb: 'yard',
    fx: (h) => [
      hit('ball_kick', h.L('L065') + 6, 0.9),
      hit('whoosh', h.L('L065') + 10, 0.5),
      hit('fence_hit', h.L('L067'), 0.8),
    ],
  },
  '5.3': { C: S53, amb: 'yard', fx: () => rewindDot(0, REW, 0.9) },
  '5.4': {
    C: S54,
    amb: 'yard',
    fx: (h) => [
      hit('ball_kick', 10, 0.9),
      hit('net_swish', 32, 0.9),
      hit('cheer', h.L('L070'), 0.8),
    ],
  },
  '5.5': { C: S55, amb: 'yard' },
  '5.6': { C: S56, amb: 'class' },
  '5.7': {
    C: S57,
    amb: 'class',
    fx: (h) => [
      hit('cricket_silence', h.L('L077'), 0.4),
      ...rewindDot(h.L('L078'), h.L('L078') + REW, 0.8),
      hit('cough', h.L('L080'), 0.7),
      ...rewindDot(h.L('L081'), h.L('L081') + REW, 0.8),
    ],
  },
  '5.8': {
    C: S58,
    amb: 'class',
    fx: (h) => [hit('class_laugh', h.L('L083'), 0.9), hit('class_laugh', h.L('L083') + 40, 0.6)],
  },
  '5.9': { C: S59, amb: 'gate', fx: (h) => rewindDot(h.L('L091'), h.L('L091') + REW, 0.8) },
  '5.10': {
    C: S510,
    amb: 'gate',
    fx: (h) => [loopFor('steps_tile_loop', h.L('L096') - 2, h.dur, 0.45, 8)],
  },
  '5.11': { C: S511, amb: 'class', fx: (h) => [hit('whoosh_ui', h.L('L097') + 4, 0.5)] },
};
