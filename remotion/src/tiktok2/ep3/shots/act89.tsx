import React from 'react';
import { AbsoluteFill, interpolate, random } from 'remotion';
import { Character } from '../../ep1/Character';
import { alley, minimal } from '../../ep1/sets';
import { cutCam, WIDE } from '../../ep1/Stage';
import { C, FONT } from '../../ep1/theme';
import { BigText, Pow } from '../../ep1/ui';
import { bedroomDay, PhoneScreen } from '../../ep2/sets';
import {
  Ban,
  BigClock,
  clamp,
  faceCam,
  FistECU,
  hit,
  Linh,
  loopFor,
  Notebook,
  Phong,
  RewindCounter,
  ShotDef,
  Stage2,
} from '../kit';
import { busStation, Coach, lake, schoolGate, traffic } from '../sets';
import { useShot } from '../time';
import { GB, Students } from './act123';

// ───────── 8. Bus station ─────────
const S81: React.FC = () => {
  const { f, dur, L } = useShot('8.1');
  return (
    <AbsoluteFill>
      <Stage2
        set={bedroomDay(f, { time: '4:40' })}
        cam={cutCam(
          f,
          [
            { at: 0, a: { x: -20, y: 1170, z: 3.0 }, b: { x: -20, y: 1170, z: 3.2 } },
            { at: L('L155') - 2, a: { x: 420, y: 1080, z: 1.3 }, b: { x: 420, y: 1080, z: 1.4 } },
            { at: L('L156') - 2, a: faceCam(300, 1330, 1, 2.4), b: faceCam(300, 1330, 1, 2.6) },
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
            t={f}
            pose="sitChair"
            facing={-1}
            eyes="sad"
            look={{ x: -1, y: -0.2 }}
          />
        }
      />
      <RewindCounter used={3} f={f} />
    </AbsoluteFill>
  );
};
const S82: React.FC = () => {
  const { f, L } = useShot('8.2');
  const km = interpolate(f, [L('L159'), L('L160')], [0, 200], clamp);
  return (
    <AbsoluteFill style={{ background: '#2b2535', flexDirection: 'row' }}>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: -480, top: 0, width: 1920, height: 1080 }}>
          <BigClock time="0:00" f={f} sub="00:00" />
        </div>
      </div>
      <div style={{ width: 8, background: '#f3e2c2' }} />
      <div style={{ flex: 1, position: 'relative', background: '#3f4a5a' }}>
        <svg width={956} height={1080}>
          <path
            d="M140 900 C300 700 520 760 640 520 S820 200 860 120"
            stroke="#f3e2c2"
            strokeWidth={10}
            fill="none"
            strokeDasharray="22 16"
          />
          <circle cx={140} cy={900} r={22} fill={C.orange} />
          <text x={180} y={960} fontFamily={FONT} fontWeight={800} fontSize={44} fill="#fff">
            BẠN
          </text>
          <g transform={`translate(${140 + (720 * km) / 200},${900 - (780 * km) / 200})`}>
            <rect x={-40} y={-26} width={80} height={44} rx={10} fill="#e8e2d6" />
            <circle cx={-22} cy={20} r={10} fill="#222" />
            <circle cx={22} cy={20} r={10} fill="#222" />
          </g>
          <text
            x={478}
            y={140}
            textAnchor="middle"
            fontFamily={FONT}
            fontWeight={800}
            fontSize={90}
            fill="#ffc83a"
            stroke="#15121a"
            strokeWidth={9}
            paintOrder="stroke"
          >
            {Math.round(km)} KM
          </text>
        </svg>
      </div>
    </AbsoluteFill>
  );
};
/** Running: alley → main road → traffic jam → weaving between two rows of vehicles (handheld camera). */
const S83: React.FC = () => {
  const { f, L } = useShot('8.3');
  const ids = ['L163', 'L164', 'L165', 'L166'];
  const seg = ids.filter((id) => f >= L(id) - 2).length;
  const sets = [alley(f), alley(f), schoolGate(f), traffic(f), traffic(f)];
  const x = 200 + (f % 60) * 12;
  return (
    <Stage2
      set={sets[seg]}
      cam={{ x: x + 60, y: seg >= 3 ? 1200 : 1100, z: seg === 4 ? 1.5 : 1.2 }}
      f={f}
      shake={10}
      actors={
        <Ban
          x={x}
          y={seg >= 3 ? 1560 : 1520}
          t={f}
          pose="run"
          facing={1}
          eyes="squint"
          speed={1.3}
        />
      }
    />
  );
};
const S84: React.FC = () => {
  const { f, dur, L } = useShot('8.4');
  return (
    <Stage2
      set={busStation(f)}
      cam={cutCam(
        f,
        [
          { at: 0, a: { x: 60, y: 260, z: 1.6 }, b: { x: 60, y: 260, z: 1.7 } },
          { at: L('L168') - 2, a: { x: 600, y: 900, z: 0.9 }, b: { x: 600, y: 900, z: 0.95 } },
          { at: L('L169') - 2, a: { x: 900, y: 1160, z: 1.2 }, b: { x: 900, y: 1160, z: 1.25 } },
        ],
        dur,
      )}
      f={f}
      actors={
        <>
          <Coach x={600} y={1500} f={f} running />
          <Ban x={-500} y={1560} t={f} pose="run" facing={1} eyes="squint" />
        </>
      }
    />
  );
};
const WIN = { x: 600 - 820 + 2 * 270 + 115, y: 1500 - 450 };
/** Phong sitting in the coach window frame (coach-local coordinates – drawn via the Coach `inside` prop). */
const PhongInBus: React.FC<{
  f: number;
  eyes: 'sad' | 'happy' | 'half' | 'wide';
  hand?: boolean;
}> = ({ f, eyes }) => (
  <Phong x={-165} y={-200} size={0.62} t={f} facing={0} eyes={eyes} shadow={false} />
);
const S85: React.FC = () => {
  const { f, dur } = useShot('8.5');
  return (
    <Stage2
      set={busStation(f)}
      cam={cutCam(
        f,
        [{ at: 0, a: { x: WIN.x, y: WIN.y - 40, z: 2.6 }, b: { x: WIN.x, y: WIN.y - 40, z: 2.8 } }],
        dur,
      )}
      f={f}
      actors={
        <>
          <Coach
            x={600}
            y={1500}
            f={f}
            running
            window={0}
            inside={<PhongInBus f={f} eyes="sad" />}
          />
        </>
      }
    />
  );
};
const S86: React.FC = () => {
  const { f, dur, L } = useShot('8.6');
  const win = interpolate(f, [L('L172'), L('L172') + 20], [0, 1], clamp);
  return f < L('L172') - 2 ? (
    <AbsoluteFill style={{ background: '#5a6f86' }}>
      <FistECU f={f} at={-100} rings={false} shake={Math.floor(f / 6) % 2 ? 0.6 : 0} />
    </AbsoluteFill>
  ) : (
    <Stage2
      set={busStation(f)}
      cam={cutCam(
        f,
        [{ at: 0, a: { x: WIN.x, y: WIN.y + 60, z: 1.9 }, b: { x: WIN.x, y: WIN.y + 60, z: 2.0 } }],
        dur,
      )}
      f={f}
      actors={
        <>
          <Coach
            x={600}
            y={1500}
            f={f}
            running
            window={win}
            inside={<PhongInBus f={f} eyes="sad" />}
          />
          <Ban x={WIN.x + 330} y={1620} t={f} facing={-1} eyes="squint" pose="raise" />
        </>
      }
    />
  );
};
const S87: React.FC = () => {
  const { f, dur, L } = useShot('8.7');
  return (
    <AbsoluteFill>
      <Stage2
        set={busStation(f)}
        cam={cutCam(
          f,
          [
            { at: 0, a: faceCam(WIN.x + 330, 1620, 1, 2.5), b: faceCam(WIN.x + 330, 1620, 1, 2.7) },
            {
              at: L('L174') - 2,
              a: faceCam(WIN.x + 330, 1620, 1, 3.2),
              b: faceCam(WIN.x + 330, 1620, 1, 3.4),
            },
          ],
          dur,
        )}
        f={f}
        actors={
          <>
            <Coach x={600} y={1500} f={f} running window={1} />
            <Ban
              x={WIN.x + 330}
              y={1620}
              t={f}
              facing={-1}
              eyes={f >= L('L174') ? 'wide' : 'squint'}
              squash={Math.sin(f / 4) * 0.05}
            />
          </>
        }
      />
      {f >= L('L174') && <Pow text="…" x={600} y={260} from={L('L174')} f={f} size={160} />}
    </AbsoluteFill>
  );
};
const S88: React.FC = () => {
  const { f, dur, L } = useShot('8.8');
  const flail = [L('L180'), L('L182'), L('L185'), L('L186')].some((t) => f >= t && f < t + 20);
  return (
    <Stage2
      set={busStation(f)}
      cam={cutCam(
        f,
        [
          {
            at: 0,
            a: { x: WIN.x + 80, y: 1180, z: 1.45 },
            b: { x: WIN.x + 80, y: 1180, z: 1.6 },
            hold: true,
          },
          {
            at: L('L180') - 2,
            a: faceCam(WIN.x + 330, 1620, 1, 2.3),
            b: faceCam(WIN.x + 330, 1620, 1, 2.5),
          },
          {
            at: L('L184') - 2,
            a: { x: WIN.x + 80, y: 1180, z: 1.55 },
            b: { x: WIN.x + 80, y: 1180, z: 1.7 },
            hold: true,
          },
        ],
        dur,
      )}
      f={f}
      actors={
        <>
          <Coach
            x={600}
            y={1500}
            f={f}
            running
            window={1}
            inside={<PhongInBus f={f} eyes="half" />}
          />
          <Ban
            x={WIN.x + 330}
            y={1620}
            t={f}
            facing={-1}
            eyes={f >= L('L186') ? 'squint' : 'sad'}
            pose={flail ? 'flail' : 'shrug'}
          />
        </>
      }
    />
  );
};
const S89: React.FC = () => {
  const { f, dur, L } = useShot('8.9');
  const tear = (f % 40) / 40;
  return (
    <Stage2
      set={busStation(f)}
      cam={cutCam(
        f,
        [{ at: 0, a: { x: WIN.x, y: WIN.y + 20, z: 2.6 }, b: { x: WIN.x, y: WIN.y + 20, z: 2.8 } }],
        dur,
      )}
      f={f}
      actors={
        <>
          <Coach
            x={600}
            y={1500}
            f={f}
            running
            window={1}
            inside={<PhongInBus f={f} eyes={f >= L('L188') ? 'happy' : 'half'} />}
          />
          {f >= L('L188') && (
            <ellipse
              cx={WIN.x + 30}
              cy={WIN.y + 10 + tear * 30}
              rx={6}
              ry={10}
              fill="#bfe6ff"
              opacity={1 - tear}
            />
          )}
        </>
      }
    />
  );
};
const S810: React.FC = () => {
  const { f, dur } = useShot('8.10');
  return (
    <Stage2
      set={busStation(f)}
      cam={{ x: WIN.x, y: WIN.y + 20, z: interpolate(f, [0, dur], [2.8, 3.3]) }}
      f={f}
      actors={
        <>
          <ellipse
            cx={WIN.x}
            cy={WIN.y - 20}
            rx={160}
            ry={180}
            fill="#ffc870"
            opacity={0.35}
            style={{ filter: 'blur(30px)' }}
          />
          <Coach
            x={600}
            y={1500}
            f={f}
            running
            window={1}
            inside={<PhongInBus f={f} eyes="happy" />}
          />
        </>
      }
    />
  );
};
const S811: React.FC = () => {
  const { f, dur, L } = useShot('8.11');
  const dx = interpolate(f, [L('L191'), dur], [0, 2600], { ...clamp, easing: (t) => t * t });
  const run = f >= L('L193') - 2 && f < L('L195');
  const bx = WIN.x + 330 + (run ? Math.min(dx, 600) : f >= L('L195') ? 600 : 0);
  const slap = f >= L('L194') && f < L('L194') + 8;
  const wide = f >= L('L195') - 2;
  return (
    <AbsoluteFill>
      <Stage2
        set={busStation(f)}
        cam={wide ? { x: 1100, y: 900, z: 0.8 } : { x: WIN.x + dx * 0.9, y: 1100, z: 1.4 }}
        f={f}
        shake={run ? 6 : 0}
        actors={
          <>
            <Coach
              x={600}
              y={1500}
              f={f}
              running
              window={1}
              dx={dx}
              inside={<PhongInBus f={f} eyes="happy" />}
              armOut={f >= L('L192')}
            />
            <Ban
              x={bx}
              y={1620}
              t={f}
              facing={1}
              pose={run ? 'run' : slap ? 'raise' : 'stand'}
              eyes="happy"
            />
          </>
        }
      />
      {slap && (
        <Pow text="BỘP!" x={600} y={360} from={L('L194')} f={f} size={120} color="#ffd27a" />
      )}
    </AbsoluteFill>
  );
};
const S812: React.FC = () => {
  const { f, L } = useShot('8.12');
  return (
    <AbsoluteFill>
      <Stage2
        set={busStation(f)}
        cam={{ x: 1100, y: 900, z: 0.8 + f * 0.0008 }}
        f={f}
        actors={<Ban x={1200} y={1620} t={f} back />}
      />
      <AbsoluteFill style={{ background: 'rgba(30,20,20,0.25)' }} />
      <BigText lines={['Câu nói hoàn hảo cần ba lần.']} from={L('L196')} f={f} y={180} size={100} />
      <BigText
        lines={['Câu nói thật chỉ cần một.']}
        from={L('L197')}
        f={f}
        y={480}
        size={110}
        color={C.orange}
      />
    </AbsoluteFill>
  );
};

// ───────── 9. Ending ─────────
const S91: React.FC = () => {
  const { f, dur } = useShot('9.1');
  return (
    <AbsoluteFill>
      <Stage2
        set={schoolGate(f)}
        cam={cutCam(
          f,
          [{ at: 0, a: { x: 560, y: 920, z: 0.92 }, b: { x: 560, y: 920, z: 1.0 } }],
          dur,
        )}
        f={f}
        actors={
          <>
            <Students tw={f} n={6} />
            <Linh
              x={interpolate(f, [0, dur], [-300, 200])}
              y={1500}
              t={f}
              pose="walk"
              facing={1}
              eyes="normal"
              accessories={['backpack']}
            />
            <Ban x={GB.x} y={GB.y} t={f} facing={-1} eyes="normal" />
          </>
        }
      />
      <RewindCounter used={0} f={f} />
    </AbsoluteFill>
  );
};
const S92: React.FC = () => {
  const { f } = useShot('9.2');
  return (
    <AbsoluteFill style={{ background: '#3a3036' }}>
      <AbsoluteFill style={{ transform: `scale(${1.05 + f * 0.002})` }}>
        <Notebook f={f} filled={0} label="THỨ HAI" />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
const S93: React.FC = () => {
  const { f, dur, L } = useShot('9.3');
  return (
    <AbsoluteFill>
      <Stage2
        set={schoolGate(f)}
        cam={cutCam(
          f,
          [
            { at: 0, a: faceCam(GB.x, GB.y, 1, 2.7), b: faceCam(GB.x, GB.y, 1, 2.9) },
            { at: L('L204') - 2, a: { x: 600, y: 1080, z: 1.3 }, b: { x: 600, y: 1080, z: 1.35 } },
          ],
          dur,
        )}
        f={f}
        actors={
          <>
            <Linh x={340} y={1500} t={f} facing={1} eyes="normal" />
            <Ban x={GB.x} y={GB.y} t={f} facing={-1} eyes="squint" pose="raise" />
          </>
        }
      />
      <RewindCounter used={0} f={f} />
    </AbsoluteFill>
  );
};
const S94: React.FC = () => {
  const { f, dur, L } = useShot('9.4');
  const laugh = f >= L('L206');
  return (
    <Stage2
      set={schoolGate(f)}
      cam={cutCam(
        f,
        [
          { at: 0, a: faceCam(340, 1500, 0.97, 2.5), b: faceCam(340, 1500, 0.97, 2.7) },
          {
            at: L('L207') - 2,
            a: faceCam(340, 1500, 0.97, 2.0, 60),
            b: faceCam(340, 1500, 0.97, 2.1, 60),
          },
        ],
        dur,
      )}
      f={f}
      actors={
        <Linh
          x={340}
          y={1500 - (laugh ? Math.abs(Math.sin(f / 4)) * 16 : 0)}
          t={f}
          facing={1}
          eyes={laugh ? 'happy' : 'wide'}
          pose={laugh ? 'hug' : 'stand'}
        />
      }
    />
  );
};
const S95: React.FC = () => {
  const { f, dur } = useShot('9.5');
  return (
    <Stage2
      set={schoolGate(f)}
      cam={cutCam(
        f,
        [{ at: 0, a: { x: 580, y: 1060, z: 1.3 }, b: { x: 580, y: 1060, z: 1.38 } }],
        dur,
      )}
      f={f}
      actors={
        <>
          <Linh x={340} y={1500} t={f} facing={1} eyes="happy" pose="point" />
          <Ban x={GB.x} y={GB.y} t={f} facing={-1} eyes="squint" />
        </>
      }
    />
  );
};
const S96: React.FC = () => {
  const { f, L } = useShot('9.6');
  const fist = L('L210');
  const release = L('L210') + 26;
  return (
    <AbsoluteFill style={{ background: '#2b2535' }}>
      <Stage2 set={schoolGate(f)} cam={{ x: 600, y: 900, z: 1.2 }} f={f} blurBg={14} />
      <FistECU f={f} at={fist} release={release} />
      <RewindCounter used={0} f={f} />
    </AbsoluteFill>
  );
};
const S97: React.FC = () => {
  const { f, dur } = useShot('9.7');
  const w = interpolate(f, [0, dur], [0, 500]);
  return (
    <Stage2
      set={schoolGate(f)}
      cam={{ x: 560 + w * 0.6, y: 1060, z: 1.15 }}
      f={f}
      actors={
        <>
          <Linh x={340 + w} y={1500} t={f} pose="walk" facing={1} eyes="happy" speed={0.6} />
          <Ban x={560 + w} y={1540} t={f} pose="walk" facing={1} eyes="happy" speed={0.6} />
        </>
      }
    />
  );
};
const S98: React.FC = () => {
  const { f, dur } = useShot('9.8');
  const buzz = Math.floor(f / 4) % 2 ? 4 : -4;
  return (
    <Stage2
      set={bedroomDay(f, { dark: true })}
      cam={cutCam(
        f,
        [{ at: 0, a: { x: 1080, y: 1060, z: 2.0 }, b: { x: 1080, y: 1060, z: 2.2 } }],
        dur,
      )}
      f={f}
      actors={
        <g transform={`translate(${1060 + buzz},1150)`}>
          <ellipse rx={160} ry={80} fill="#7ab0ff" opacity={0.3} style={{ filter: 'blur(20px)' }} />
          <rect x={-40} y={-70} width={80} height={140} rx={14} fill="#2b2f38" />
          <rect x={-34} y={-62} width={68} height={124} rx={10} fill="#8ab8ff" />
        </g>
      }
    />
  );
};
const S99: React.FC = () => {
  const { f, dur } = useShot('9.9');
  return (
    <AbsoluteFill style={{ background: '#1e1c24' }}>
      <svg width={1920} height={1080}>
        <g transform={`translate(960,560) scale(${interpolate(f, [0, dur], [1.0, 1.2])})`}>
          <PhoneScreen x={0} y={0} s={1.15} glow="#9ab0c8">
            <foreignObject x={-190} y={-300} width={380} height={600}>
              <div style={{ width: 380, height: 600, overflow: 'hidden', position: 'relative' }}>
                <div
                  style={{
                    width: 1920,
                    height: 1080,
                    transform: 'scale(0.56) translate(-690px,-60px)',
                    transformOrigin: '0 0',
                    position: 'absolute',
                  }}
                >
                  <Stage2
                    set={lake(40)}
                    cam={{ x: 500, y: 1100, z: 1.2 }}
                    f={40}
                    actors={
                      <g>
                        <Phong x={500} y={1520} t={40} eyes="happy" blink={false} />
                        <path
                          d="M420 1060 Q500 1110 580 1060 L590 1110 Q500 1150 410 1110 Z"
                          fill="#b2463a"
                        />
                        <rect
                          x={410}
                          y={1180}
                          width={180}
                          height={160}
                          rx={20}
                          fill="#6a5a4a"
                          opacity={0.9}
                        />
                      </g>
                    }
                  />
                </div>
              </div>
            </foreignObject>
            <text
              x={0}
              y={350}
              textAnchor="middle"
              fontFamily={FONT}
              fontWeight={800}
              fontSize={28}
              fill="#77737a"
            >
              Hồ Gươm · 9°C
            </text>
          </PhoneScreen>
        </g>
      </svg>
    </AbsoluteFill>
  );
};
const S910: React.FC = () => {
  const { f, dur, L } = useShot('9.10');
  const m1 = L('L216');
  const m2 = L('L217');
  const bubble = (from: number, text: string) =>
    f >= from && (
      <div
        style={{
          background: '#fff',
          borderRadius: 26,
          padding: '18px 26px',
          alignSelf: 'flex-start',
          maxWidth: 560,
          fontSize: 38,
          transform: `scale(${interpolate(f - from, [0, 6], [0.6, 1], clamp)})`,
          transformOrigin: '0 50%',
        }}
      >
        {text}
      </div>
    );
  const smile = f >= L('L217') + 20;
  return (
    <AbsoluteFill style={{ background: '#26232c' }}>
      <div
        style={{
          position: 'absolute',
          left: 420,
          top: 70,
          width: 640,
          height: 940,
          borderRadius: 60,
          background: '#1b1a20',
          padding: 18,
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            borderRadius: 44,
            background: '#e9e4dc',
            overflow: 'hidden',
            fontFamily: FONT,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              background: '#3f4f72',
              color: '#fff',
              padding: '50px 30px 22px',
              fontSize: 42,
              fontWeight: 800,
            }}
          >
            ‹ Phong 🚌
          </div>
          <div style={{ padding: 30, display: 'flex', flexDirection: 'column', gap: 22 }}>
            {bubble(m1, 'Tao tới rồi.')}
            {bubble(m2, 'Nói dở như mày mà cũng có bạn, tao nể. 😆')}
          </div>
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 1150,
          top: 160,
          width: 700,
          height: 900,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: 1920,
            height: 1080,
            transform: 'translate(-560px,-200px)',
            position: 'absolute',
          }}
        >
          <Stage2
            set={bedroomDay(f, { dark: true })}
            cam={faceCam(900, 1560, 1, 2.0)}
            f={f}
            actors={<Ban x={900} y={1560} t={f} facing={-1} eyes={smile ? 'happy' : 'normal'} />}
          />
        </div>
      </div>
      {dur && null}
    </AbsoluteFill>
  );
};
const S911: React.FC = () => {
  const { f, dur, L } = useShot('9.11');
  const flip = interpolate(f, [L('L218') + 6, L('L218') + 26], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ background: '#2b2535' }}>
      {f < L('L218') + 4 ? (
        <BigClock time="0:00" f={f} sub="00:00" />
      ) : (
        <AbsoluteFill
          style={{ transform: `scale(${interpolate(f, [L('L218'), dur], [1.25, 0.95], clamp)})` }}
        >
          <Notebook f={f} filled={0} flip={flip} prevFilled={0} label="THỨ BA" />
        </AbsoluteFill>
      )}
      <RewindCounter used={0} f={f} />
    </AbsoluteFill>
  );
};
/** Next-episode teaser: darkening, a faint white whisper of mist drifting across. */
const S912: React.FC = () => {
  const { f, dur } = useShot('9.12');
  const dark = interpolate(f, [0, 14], [0.6, 1], clamp);
  return (
    <AbsoluteFill style={{ background: `rgba(10,8,14,${dark})` }}>
      <svg width={1920} height={1080} style={{ position: 'absolute' }}>
        {Array.from({ length: 5 }, (_, i) => {
          const x = interpolate(f, [0, dur], [-600 + i * 60, 2100 + i * 60]);
          return (
            <path
              key={i}
              d={`M${x - 500} ${520 + i * 18} C${x - 300} ${440 + Math.sin(f / 9 + i) * 40} ${x - 100} ${600} ${x + 100} ${520 + i * 10}`}
              stroke="#ffffff"
              strokeWidth={10 - i * 1.5}
              fill="none"
              opacity={0.18 - i * 0.025}
              style={{ filter: 'blur(6px)' }}
            />
          );
        })}
        {Array.from({ length: 30 }, (_, i) => (
          <circle
            key={i}
            cx={((random(`wp${i}`) * 2400 + f * 14) % 2200) - 140}
            cy={420 + random(`wq${i}`) * 220}
            r={2 + random(`wr${i}`) * 3}
            fill="#fff"
            opacity={0.35}
          />
        ))}
      </svg>
      <BigText
        lines={['TẬP SAU:', 'NẾU BẠN NÓI GÌ CŨNG THÀNH SỰ THẬT?']}
        from={8}
        f={f}
        y={760}
        size={90}
        accent={[0]}
      />
    </AbsoluteFill>
  );
};
const S913: React.FC = () => {
  const { f, dur, L } = useShot('9.13');
  const final = f >= L('L223') - 2;
  return (
    <AbsoluteFill>
      <Stage2
        set={minimal('#5a4050', '#2a2032')}
        cam={cutCam(
          f,
          [
            { at: 0, a: { ...WIDE, z: 1.0 }, b: { ...WIDE, z: 1.05 } },
            { at: L('L222') - 2, a: { ...WIDE, z: 1.05 }, b: { ...WIDE, z: 1.1 } },
            {
              at: L('L223') - 2,
              a: { ...WIDE, y: 1000, z: 1.0 },
              b: { ...WIDE, y: 1000, z: 1.05 },
            },
          ],
          dur,
        )}
        f={f}
        actors={
          <Ban x={final ? 500 : 860} y={1560} t={f} eyes="happy" pose={final ? 'stand' : 'raise'} />
        }
      />
      {!final && f < L('L222') - 2 && (
        <BigText
          lines={['Quay lại được 30 giây,', 'bạn sẽ làm lại khoảnh khắc nào? 👇']}
          from={4}
          f={f}
          y={120}
          size={88}
          accent={[1]}
        />
      )}
      {!final && f >= L('L222') - 2 && (
        <BigText
          lines={['❤️ Thích  ·  🔔 Đăng ký', 'để xem thêm những chữ “nếu”']}
          from={L('L222')}
          f={f}
          y={120}
          size={88}
          accent={[0]}
        />
      )}
      {final && (
        <BigText
          lines={['Một chữ nếu…', 'một cuộc đời khác.']}
          from={L('L223')}
          f={f}
          y={160}
          size={110}
          accent={[1]}
        />
      )}
    </AbsoluteFill>
  );
};

export const ACT89: Record<string, ShotDef> = {
  '8.1': { C: S81, amb: 'bedroom', fx: () => [hit('tick', 0, 0.5)] },
  '8.2': {
    C: S82,
    amb: 'bedroom',
    fx: (h) => [hit('whoosh_ui', 0, 0.4), loopFor('moto_idle_loop', h.L('L159'), h.dur, 0.2, 10)],
  },
  '8.3': {
    C: S83,
    amb: 'street',
    fx: (h) => [
      loopFor('steps_run_loop', 0, h.dur, 0.7, 4),
      hit('horn', h.L('L165'), 0.6),
      hit('horn', h.L('L166'), 0.5),
    ],
  },
  '8.4': {
    C: S84,
    amb: 'station',
    fx: (h) => [
      hit('pa_chime', 0, 0.5),
      hit('coach_start', h.L('L169'), 0.8),
      loopFor('coach_idle_loop', h.L('L169') + 40, h.dur + 6, 0.5, 8),
    ],
  },
  '8.5': { C: S85, amb: 'station', fx: (h) => [loopFor('coach_idle_loop', 0, h.dur + 4, 0.4, 4)] },
  '8.6': {
    C: S86,
    amb: 'station',
    fx: (h) => [
      hit('glass_knock', 2, 0.9),
      hit('glass_knock', 14, 0.8),
      hit('window_slide', h.L('L172'), 0.8),
      loopFor('coach_idle_loop', 0, h.dur + 4, 0.35, 4),
    ],
  },
  '8.7': {
    C: S87,
    amb: 'station',
    fx: (h) => [
      loopFor('panting', 0, h.dur, 0.45, 6),
      loopFor('coach_idle_loop', 0, h.dur + 4, 0.3, 4),
    ],
  },
  '8.8': { C: S88, amb: 'station', fx: (h) => [loopFor('coach_idle_loop', 0, h.dur + 4, 0.3, 4)] },
  '8.9': { C: S89, amb: 'station', fx: (h) => [loopFor('coach_idle_loop', 0, h.dur + 4, 0.3, 4)] },
  '8.10': {
    C: S810,
    amb: 'station',
    fx: (h) => [loopFor('coach_idle_loop', 0, h.dur + 4, 0.25, 4)],
  },
  '8.11': {
    C: S811,
    amb: 'station',
    fx: (h) => [
      hit('coach_start', h.L('L191'), 0.8),
      loopFor('steps_run_loop', h.L('L193') - 2, h.L('L195'), 0.6, 4),
      hit('hand_slap', h.L('L194'), 0.9),
    ],
  },
  '8.12': {
    C: S812,
    amb: 'station',
    fx: (h) => [hit('whoosh_ui', h.L('L196'), 0.4), hit('whoosh_ui', h.L('L197'), 0.4)],
  },
  '9.1': { C: S91, amb: 'gate', fx: (h) => [loopFor('steps_tile_loop', 0, h.dur, 0.35, 8)] },
  '9.2': { C: S92, amb: 'gate', fx: () => [hit('page_flip', 0, 0.5)] },
  '9.3': { C: S93, amb: 'gate' },
  '9.4': { C: S94, amb: 'gate', fx: (h) => [hit('girl_laugh', h.L('L206'), 0.6)] },
  '9.5': { C: S95, amb: 'gate' },
  '9.6': {
    C: S96,
    amb: 'gate',
    fx: (h) => [
      hit('tick', h.L('L210'), 0.6),
      hit('tick', h.L('L210') + 10, 0.5),
      hit('release_air', h.L('L210') + 26, 0.5),
    ],
  },
  '9.7': { C: S97, amb: 'gate', fx: (h) => [loopFor('steps_tile_loop', 0, h.dur, 0.4, 8)] },
  '9.8': { C: S98, amb: 'night', fx: () => [hit('phone_buzz', 0, 0.8)] },
  '9.9': { C: S99, amb: 'night' },
  '9.10': {
    C: S910,
    amb: 'night',
    fx: (h) => [hit('ting', h.L('L216'), 0.6), hit('ting', h.L('L217'), 0.6)],
  },
  '9.11': {
    C: S911,
    amb: 'night',
    fx: (h) => [hit('tick', 0, 0.5), hit('page_flip', h.L('L218') + 6, 0.6)],
  },
  '9.12': {
    C: S912,
    amb: 'none',
    fx: (h) => [
      loopFor('whisper_loop', 0, h.dur, 0.35, 12),
      loopFor('wind_soft_loop', 0, h.dur, 0.4, 12),
    ],
  },
  '9.13': {
    C: S913,
    amb: 'rules',
    fx: (h) => [hit('whoosh_ui', 4, 0.5), hit('ting', h.L('L222'), 0.5)],
  },
};
