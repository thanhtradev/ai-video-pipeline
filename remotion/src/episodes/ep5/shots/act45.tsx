import React from 'react';
import { AbsoluteFill, interpolate } from 'remotion';
import { classroom, hallway } from '../../../kits/whatif/sets';
import { cutCam } from '../../../kits/whatif/Stage';
import { C, FONT } from '../../../kits/whatif/theme';
import { BigText, Pow } from '../../../kits/whatif/ui';
import { yardField } from '../../../kits/whatif/sets-home';
import { schoolGate } from '../../../kits/whatif/sets-school';
import { FREEZES } from '../freeze';
import {
  Ban,
  ClapECU,
  clamp,
  Dat,
  faceCam,
  hit,
  loopFor,
  Me,
  Ong,
  ShotDef,
  Stage5,
  Vy,
} from '../kit';
import { home } from '../sets';
import { FrozenAlley, tw, useWorld } from './act123';
import { useShot } from '../time';

// ───────── 4. Relearning everything ─────────
const S41: React.FC = () => {
  const { f, dur } = useShot('4.1');
  const sec = interpolate(f, [0, dur], [30, 0], clamp);
  return (
    <AbsoluteFill style={{ background: '#2b2535', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={600} height={600} viewBox="-300 -300 600 600">
        <circle r={240} fill="none" stroke="#fff" strokeOpacity={0.15} strokeWidth={36} />
        <circle
          r={240}
          fill="none"
          stroke={sec <= 5 ? '#ff4a3a' : '#dfeaff'}
          strokeWidth={36}
          strokeLinecap="round"
          strokeDasharray={`${2 * Math.PI * 240 * (sec / 30)} 2000`}
          transform="rotate(-90)"
        />
        <text
          y={60}
          textAnchor="middle"
          fontFamily={FONT}
          fontWeight={800}
          fontSize={180}
          fill="#fff"
        >
          {Math.ceil(sec)}
        </text>
      </svg>
    </AbsoluteFill>
  );
};
const S42: React.FC = () => {
  const { f, L } = useShot('4.2');
  const right = f >= L('L066') - 2;
  return (
    <AbsoluteFill style={{ background: '#2b2535', flexDirection: 'row', gap: 12, padding: 12 }}>
      {[0, 1].map((side) => (
        <div
          key={side}
          style={{
            flex: 1,
            position: 'relative',
            overflow: 'hidden',
            borderRadius: 18,
            opacity: side === 1 && !right ? 0.35 : 1,
          }}
        >
          <div style={{ position: 'absolute', left: -480, top: 0, width: 1920, height: 1080 }}>
            <Stage5
              set={classroom(f)}
              cam={faceCam(960, 1560, 1, 2.0, 140)}
              f={f}
              actors={
                <Ban
                  x={960}
                  y={1560}
                  t={f}
                  eyes={side ? 'half' : 'squint'}
                  pose={side ? 'shrug' : 'hold'}
                  itemR={side ? undefined : 'paper'}
                />
              }
            />
          </div>
          <div
            style={{
              position: 'absolute',
              left: 30,
              top: 24,
              fontFamily: FONT,
              fontWeight: 800,
              fontSize: 52,
              color: '#fff',
              WebkitTextStroke: '7px #15121a',
              paintOrder: 'stroke fill',
            }}
          >
            {side ? 'HIỂU: 0%' : 'CHÉP: XONG ✓'}
          </div>
        </div>
      ))}
    </AbsoluteFill>
  );
};
const S43: React.FC = () => {
  const { f, dur, L } = useShot('4.3');
  const run = interpolate(f, [0, dur], [-200, 700], clamp);
  return (
    <AbsoluteFill>
      <Stage5
        set={schoolGate(f)}
        frozen={1}
        cam={{ x: run + 200, y: 1060, z: 1.05 }}
        f={f}
        actors={<Ban x={run} y={1580} t={f} pose="run" facing={1} eyes="squint" />}
      />
      {f >= L('L068') && (
        <Pow
          text="HẾT GIỜ – CÒN XA CỔNG"
          x={600}
          y={300}
          from={L('L068')}
          f={f}
          size={90}
          color="#ff7a6a"
        />
      )}
    </AbsoluteFill>
  );
};
/** 4.4 Ten claps to think of one sentence – a different thinking pose each time in the frozen world. */
const S44: React.FC = () => {
  const { f, fk, from } = useWorld('4.4');
  const z = FREEZES[3];
  const claps = z.claps!.map((c) => c - from);
  const n = claps.filter((c) => f >= c).length;
  const poses = [
    'shrug',
    'pray',
    'point',
    'armsUp',
    'hold',
    'coverEyes',
    'reach',
    'shrug',
    'pray',
    'armsUp',
  ] as const;
  const eyes = [
    'squint',
    'half',
    'normal',
    'squint',
    'wide',
    'closed',
    'half',
    'squint',
    'normal',
    'wide',
  ] as const;
  const ecu = claps.some((c) => f >= c - 6 && f < c + 4);
  if (ecu && n <= 2)
    return (
      <AbsoluteFill style={{ background: '#2b2535' }}>
        <ClapECU f={f} at={claps.find((c) => f >= c - 6 && f < c + 4)!} />
      </AbsoluteFill>
    );
  const k = Math.max(0, n - 1);
  const camSet = [
    { x: 560, y: 1040, z: 1.2 },
    faceCam(700, 1560, 1, 2.3),
    { x: 400, y: 1100, z: 1.5 },
    faceCam(700, 1560, 1, 2.8),
    { x: 640, y: 1000, z: 1.0 },
  ];
  return (
    <Stage5
      set={hallway(f)}
      frozen={fk}
      cam={f < claps[0] ? { x: 520, y: 1060, z: 1.15 } : camSet[k % camSet.length]}
      f={f}
      actors={
        <>
          <Vy x={380} y={1560} t={tw(f, claps[0], fk)} facing={1} pose="reach" eyes="normal" />
          <Ban
            x={700}
            y={1560}
            t={f}
            facing={-1}
            pose={f < claps[0] ? 'stand' : poses[k]}
            eyes={f < claps[0] ? 'wide' : eyes[k]}
            age={0.1}
          />
        </>
      }
    />
  );
};
const S45: React.FC = () => {
  const { f, dur } = useShot('4.5');
  return (
    <Stage5
      set={hallway(f)}
      cam={cutCam(
        f,
        [
          { at: 0, a: { x: 540, y: 1100, z: 1.6 }, b: { x: 540, y: 1100, z: 1.7 } },
          { at: 14, a: faceCam(700, 1560, 1, 2.8), b: faceCam(700, 1560, 1, 3.0) },
        ],
        dur,
      )}
      f={f}
      actors={
        <>
          <Vy x={380} y={1560} t={f} facing={1} pose="reach" eyes="happy" />
          <Ban
            x={700}
            y={1560}
            t={f}
            facing={-1}
            pose="reach"
            eyes="squint"
            itemR="chalk"
            age={0.1}
          />
        </>
      }
    />
  );
};
const S46: React.FC = () => {
  const { f, L } = useShot('4.6');
  return (
    <AbsoluteFill>
      <Stage5
        set={hallway(f)}
        cam={faceCam(700, 1560, 1, 2.2 + f * 0.003, 100)}
        f={f}
        actors={<Ban x={700} y={1560} t={f} facing={-1} eyes="half" age={0.1} />}
      />
      <BigText lines={['+10 NGÀY = “NÈ”']} from={L('L079')} f={f} y={160} size={120} accent={[0]} />
    </AbsoluteFill>
  );
};

// ───────── 5. The fun starts ─────────
const EGGS = Array.from({ length: 10 }, (_, i) => ({
  x: 640 + Math.cos(i * 1.7) * (120 + i * 18),
  y: 1050 - Math.abs(Math.sin(i * 2.3)) * 260 - i * 6,
}));
const Egg: React.FC<{ x: number; y: number }> = ({ x, y }) => (
  <ellipse cx={x} cy={y} rx={22} ry={28} fill="#f4ead6" stroke="#d8c8a8" strokeWidth={3} />
);
const S51: React.FC = () => {
  const { f, dur, at, L, fk } = useWorld('5.1');
  const drop = L('L081') + 6;
  const clap = at('L082', 'vỗ tay');
  const tt = tw(f, clap, fk);
  const fly = interpolate(tt, [drop, drop + 40], [0, 1], clamp);
  const pick = interpolate(f, [L('L083'), L('L083') + 110], [0, 10], clamp);
  return (
    <Stage5
      set={home(tt)}
      frozen={fk}
      cam={cutCam(
        f,
        [
          { at: 0, a: { x: 600, y: 1080, z: 1.3 }, b: { x: 600, y: 1080, z: 1.35 } },
          { at: clap + 2, a: { x: 640, y: 1040, z: 1.45 }, b: { x: 700, y: 1030, z: 1.55 } },
        ],
        dur,
      )}
      f={f}
      actors={
        <>
          <Me
            x={420}
            y={1520}
            t={tt}
            facing={1}
            eyes={fly > 0 ? 'wide' : 'normal'}
            pose={fly > 0 ? 'armsUp' : 'carry'}
          />
          <g transform={`translate(${640},${interpolate(fly, [0, 1], [1260, 1440])})`}>
            <path d="M-80 0 L80 0 L60 70 L-60 70 Z" fill="#b08a5a" />
          </g>
          {EGGS.map((e, i) =>
            i < Math.floor(pick) ? null : (
              <Egg
                key={i}
                x={interpolate(fly, [0, 1], [640 + (i % 5) * 12 - 24, e.x])}
                y={interpolate(fly, [0, 1], [1250, e.y])}
              />
            ),
          )}
          {Array.from({ length: Math.floor(pick) }, (_, i) => (
            <Egg key={`b${i}`} x={600 + (i % 4) * 22} y={1430 - Math.floor(i / 4) * 16} />
          ))}
          {f >= clap && (
            <Ban
              x={interpolate(f, [clap, L('L083')], [1000, 760], clamp)}
              y={1560}
              t={f}
              facing={-1}
              pose={f >= L('L083') ? 'reach' : 'walk'}
              eyes="squint"
              age={0.25}
            />
          )}
        </>
      }
    />
  );
};
const S52: React.FC = () => {
  const { f, dur, L } = useShot('5.2');
  return (
    <AbsoluteFill>
      <Stage5
        set={home(f)}
        cam={cutCam(
          f,
          [
            { at: 0, a: faceCam(420, 1520, 1.08, 2.4), b: faceCam(420, 1520, 1.08, 2.6) },
            { at: L('L086') - 2, a: { x: 640, y: 1380, z: 2.6 }, b: { x: 640, y: 1380, z: 2.8 } },
          ],
          dur,
        )}
        f={f}
        actors={
          <>
            <Me x={420} y={1520} t={f} facing={1} eyes="wide" pose="carry" />
            <g transform="translate(640,1440)">
              <path d="M-80 0 L80 0 L60 70 L-60 70 Z" fill="#b08a5a" />
              {Array.from({ length: 10 }, (_, i) => (
                <Egg key={i} x={-40 + (i % 4) * 26} y={-6 - Math.floor(i / 4) * 16} />
              ))}
            </g>
            <Ban x={760} y={1560} t={f} facing={-1} eyes="happy" age={0.25} />
          </>
        }
      />
      {f >= L('L086') && <Pow text="10/10 🥚" x={600} y={300} from={L('L086')} f={f} size={110} />}
    </AbsoluteFill>
  );
};
const GOAL = { x: 200, y: 1440 };
const S53: React.FC = () => {
  const { f, dur, at, L, fk } = useWorld('5.3');
  const clap = at('L090', 'vỗ tay');
  const tt = tw(f, clap, fk);
  const ballK = interpolate(tt, [L('L089'), clap], [0, 0.7], clamp);
  const walk = interpolate(f, [L('L091'), L('L091') + 50], [0, 1], clamp);
  const after = f >= L('L092');
  const bx = 1300 - ballK * 1000;
  const by = 1380 - Math.sin(ballK * Math.PI) * 300;
  return (
    <AbsoluteFill>
      <Stage5
        set={yardField(tt, { score: [2, 2] })}
        frozen={fk}
        cam={cutCam(
          f,
          [
            { at: 0, a: { x: 700, y: 1080, z: 0.95 }, b: { x: 700, y: 1080, z: 1.0 } },
            { at: clap + 2, a: { x: 640, y: 1080, z: 1.15 }, b: { x: 560, y: 1080, z: 1.2 } },
            { at: L('L092') - 2, a: { x: 420, y: 1120, z: 1.4 }, b: { x: 420, y: 1120, z: 1.45 } },
            { at: L('L093') - 2, a: { x: 1100, y: 1200, z: 1.6 }, b: { x: 1100, y: 1200, z: 1.7 } },
          ],
          dur,
        )}
        f={f}
        shake={after && f < L('L092') + 10 ? 6 : 0}
        actors={
          <>
            <Dat
              x={1400}
              y={1520}
              t={tt}
              facing={-1}
              pose={f >= L('L093') ? 'sitGround' : f < clap ? 'run' : 'stand'}
              eyes={f >= L('L093') ? 'wide' : 'normal'}
            />
            <Ban
              x={after ? bx - 20 : interpolate(walk, [0, 1], [GOAL.x, bx - 20])}
              y={1560}
              t={f}
              facing={1}
              pose={after || walk >= 1 ? 'hug' : f >= clap ? 'walk' : 'stand'}
              eyes={after ? 'happy' : 'squint'}
              age={0.3}
            />
            <circle
              cx={bx}
              cy={after || walk >= 1 ? 1300 : by}
              r={24}
              fill="#f2f2f2"
              stroke="#333"
              strokeWidth={4}
            />
          </>
        }
      />
      {f >= L('L093') && (
        <Pow text="ĐỘI TUYỂN!" x={600} y={300} from={L('L093')} f={f} size={120} color={C.orange} />
      )}
    </AbsoluteFill>
  );
};
const S54: React.FC = () => {
  const { f, L } = useShot('5.4');
  const flash = (t: number) => interpolate(f - t, [0, 3, 10], [0, 1, 0], clamp);
  const cam =
    f < L('L095') - 2
      ? { x: 640, y: 960, z: 0.95 }
      : f < L('L096') - 2
        ? { x: 360, y: 560, z: 2.2 }
        : { x: 1150, y: 1180, z: 2.0 };
  return (
    <AbsoluteFill>
      <FrozenAlley f={f} fk={1} t={6} cam={cam} />
      <AbsoluteFill
        style={{ background: '#fff', opacity: 0.7 * Math.max(flash(L('L095')), flash(L('L096'))) }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 30,
          border: '6px solid #fff',
          borderRadius: 20,
          opacity: 0.8,
        }}
      />
    </AbsoluteFill>
  );
};
const S55: React.FC = () => {
  const { f, dur } = useShot('5.5');
  return (
    <Stage5
      set={home(f, { day: 17 })}
      cam={cutCam(
        f,
        [
          { at: 0, a: { x: 560, y: 1080, z: 1.15 }, b: { x: 560, y: 1080, z: 1.25 } },
          { at: 60, a: faceCam(700, 1560, 1, 2.3), b: faceCam(700, 1560, 1, 2.5) },
        ],
        dur,
      )}
      f={f}
      actors={
        <Ban x={700} y={1560} t={f} facing={-1} eyes="half" age={0.4} look={{ x: 0.2, y: 0.4 }} />
      }
    />
  );
};
const S56: React.FC = () => {
  const { f, L } = useShot('5.6');
  return (
    <AbsoluteFill style={{ background: '#262c38', alignItems: 'center', justifyContent: 'center' }}>
      {f < L('L102') - 2 ? (
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
        <div
          style={{
            fontFamily: FONT,
            fontWeight: 800,
            fontSize: 170,
            color: '#fff',
            WebkitTextStroke: '12px #15121a',
            paintOrder: 'stroke fill',
            transform: `scale(${interpolate(f - L('L102'), [0, 6, 10], [0.4, 1.12, 1], clamp)})`,
          }}
        >
          ~1 CM / THÁNG
        </div>
      )}
    </AbsoluteFill>
  );
};
const S57: React.FC = () => {
  const { f, dur, L } = useShot('5.7');
  return (
    <Stage5
      set={hallway(f)}
      cam={cutCam(
        f,
        [
          { at: 0, a: { x: 560, y: 840, z: 1.6 }, b: { x: 560, y: 840, z: 1.7 } },
          { at: L('L104') - 2, a: { x: 620, y: 1260, z: 2.2 }, b: { x: 620, y: 1260, z: 2.3 } },
          { at: L('L105') - 2, a: { x: 520, y: 1080, z: 1.15 }, b: { x: 520, y: 1080, z: 1.2 } },
        ],
        dur,
      )}
      f={f}
      actors={
        <>
          <Dat x={360} y={1560} t={f} facing={1} eyes="half" look={{ x: 1, y: -0.4 }} />
          <Ban x={660} y={1560} t={f} facing={-1} eyes="normal" age={0.55} />
          {f >= L('L104') && (
            <line
              x1={600}
              y1={1380}
              x2={720}
              y2={1380}
              stroke="#ff4a3a"
              strokeWidth={5}
              strokeDasharray="10 8"
            />
          )}
        </>
      }
    />
  );
};
const S58: React.FC = () => {
  const { f, dur, L } = useShot('5.8');
  const rub = f >= L('L107') ? Math.sin(f / 3) * 14 : 0;
  return (
    <Stage5
      set={home(f, { day: 15 })}
      cam={cutCam(
        f,
        [
          { at: 0, a: { x: 560, y: 1060, z: 1.25 }, b: { x: 560, y: 1060, z: 1.35 } },
          { at: L('L108') - 2, a: faceCam(420, 1500, 1, 2.4), b: faceCam(420, 1500, 1, 2.6) },
        ],
        dur,
      )}
      f={f}
      actors={
        <>
          <Ong
            x={420}
            y={1500}
            t={f}
            facing={1}
            eyes="happy"
            pose={f >= L('L107') ? 'reach' : 'stand'}
            handR={f >= L('L107') ? { x: 300 + rub, y: -560 } : undefined}
          />
          <Ban x={760} y={1560} t={f} facing={-1} eyes="happy" age={0.55} />
        </>
      }
    />
  );
};

export const ACT45: Record<string, ShotDef> = {
  '4.1': {
    C: S41,
    amb: 'rules',
    fx: (h) =>
      Array.from({ length: Math.floor(h.dur / 6) }, (_, i) => hit('clock_tick', i * 6, 0.35)),
  },
  '4.2': {
    C: S42,
    amb: 'class',
    fx: (h) => [hit('page_flip', 4, 0.5), hit('whoosh_ui', h.L('L066'), 0.4)],
  },
  '4.3': { C: S43, amb: 'quiet', fx: (h) => [loopFor('steps_run_loop', 0, h.dur, 0.6, 4)] },
  '4.4': { C: S44, amb: 'class' },
  '4.5': { C: S45, amb: 'class' },
  '4.6': { C: S46, amb: 'class', fx: (h) => [hit('whoosh_ui', h.L('L079'), 0.5)] },
  '5.1': {
    C: S51,
    amb: 'home',
    fx: (h) => [
      hit('basket_drop', h.L('L081') + 6, 0.6),
      ...Array.from({ length: 10 }, (_, i) => hit('egg_place', h.L('L083') + 6 + i * 11, 0.5)),
    ],
  },
  '5.2': { C: S52, amb: 'home' },
  '5.3': {
    C: S53,
    amb: 'yard',
    fx: (h) => [
      hit('ball_kick', h.L('L089'), 0.8),
      hit('ball_hug', h.L('L091') + 50, 0.6),
      hit('cheer', h.L('L092') + 4, 0.7),
    ],
  },
  '5.4': {
    C: S54,
    amb: 'alley',
    fx: (h) => [hit('camera_shutter', h.L('L095'), 0.8), hit('camera_shutter', h.L('L096'), 0.8)],
  },
  '5.5': { C: S55, amb: 'home' },
  '5.6': {
    C: S56,
    amb: 'rules',
    fx: (h) => [hit('whoosh_ui', 0, 0.5), hit('whoosh_ui', h.L('L102'), 0.5)],
  },
  '5.7': { C: S57, amb: 'class' },
  '5.8': { C: S58, amb: 'home', fx: (h) => [hit('grandpa_chuckle', h.L('L108'), 0.5)] },
};
