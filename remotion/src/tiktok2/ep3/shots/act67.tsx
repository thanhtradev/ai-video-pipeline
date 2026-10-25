import React from 'react';
import { AbsoluteFill, interpolate } from 'remotion';
import { Character } from '../../ep1/Character';
import { livingRoom, canteen, classroom, hallway, schoolYard } from '../../ep1/sets';
import { Tray } from '../../ep1/props';
import { cutCam } from '../../ep1/Stage';
import { C } from '../../ep1/theme';
import { BigText, Pow } from '../../ep1/ui';
import { dining } from '../../ep2/sets';
import {
  Ban,
  clamp,
  Co,
  Extra,
  faceCam,
  FistECU,
  hit,
  Linh,
  loopFor,
  Me,
  Notebook,
  Phong,
  RewindCounter,
  RewindFX,
  rewindDot,
  rewindTime,
  ShotDef,
  Stage2,
} from '../kit';
import { useShot } from '../time';

const REW = 24;

const S61: React.FC = () => {
  const { f, dur } = useShot('6.1');
  return (
    <Stage2
      set={hallway(f)}
      cam={{ ...faceCam(560, 1580, 1, interpolate(f, [0, dur], [1.4, 2.4])) }}
      f={f}
      actors={<Ban x={560} y={1580} t={f} eyes="half" />}
    />
  );
};
/** Three rewinds in a row, each one smaller. */
const S62: React.FC = () => {
  const { f, L } = useShot('6.2');
  const rs = [L('L102'), L('L104'), L('L106')];
  const i = rs.filter((r) => f >= r).length - 1;
  const used = rs.filter((r) => f >= r + 12).length;
  const scenes = [
    {
      set: hallway(f),
      cam: { x: 520, y: 1100, z: 1.4 },
      a: (
        <>
          <Extra k={2} x={300} y={1560} t={f} facing={1} eyes="wide" />
          <Ban x={620} y={1580} t={f} facing={-1} eyes="squint" pose="shrug" />
        </>
      ),
    },
    {
      set: classroom(f),
      cam: { x: 620, y: 1160, z: 1.5 },
      a: (
        <>
          <Linh x={420} y={1560} t={f} facing={1} eyes="normal" />
          <Ban x={760} y={1580} t={f} facing={-1} eyes="half" look={{ x: 0.8, y: 0.4 }} />
        </>
      ),
    },
    {
      set: hallway(f),
      cam: { x: 520, y: 1100, z: 1.6 },
      a: (
        <>
          <Extra k={4} x={300} y={1560} t={f} facing={1} eyes="half" />
          <Extra k={5} x={160} y={1580} t={f} facing={1} eyes="half" />
          <Ban x={620} y={1580} t={f} facing={-1} eyes="normal" />
        </>
      ),
    },
  ];
  const k = Math.max(0, i);
  const scene = <Stage2 set={scenes[k].set} cam={scenes[k].cam} f={f} actors={scenes[k].a} />;
  return (
    <AbsoluteFill>
      {i >= 0 ? (
        <AbsoluteFill
          style={{ transform: `scale(${1 - k * 0.12})`, borderRadius: k * 20, overflow: 'hidden' }}
        >
          <RewindFX f={f} from={rs[k]} dur={12}>
            {scene}
          </RewindFX>
        </AbsoluteFill>
      ) : (
        scene
      )}
      <RewindCounter used={used} f={f} pop={rs[Math.max(0, used - 1)] + 12} />
    </AbsoluteFill>
  );
};
const S63: React.FC = () => {
  const { f, dur, L } = useShot('6.3');
  const back = interpolate(f, [L('L108'), L('L108') + 30], [0, 1], clamp);
  return (
    <AbsoluteFill>
      <Stage2
        set={hallway(f)}
        cam={cutCam(
          f,
          [
            { at: 0, a: { x: 520, y: 1100, z: 1.2 }, b: { x: 520, y: 1100, z: 1.3 } },
            { at: L('L109') - 2, a: faceCam(160, 1580, 1, 2.4), b: faceCam(160, 1580, 1, 2.6) },
          ],
          dur,
        )}
        f={f}
        actors={
          <Ban
            x={560 - back * 400}
            y={1580}
            t={f}
            facing={-1}
            pose={back > 0 && back < 1 ? 'walk' : 'stand'}
            eyes="sad"
            shiver={0.5}
          />
        }
      />
      <RewindCounter used={3} f={f} shake={f < 24 ? 1 : 0} />
    </AbsoluteFill>
  );
};
const S64: React.FC = () => {
  const { f, L } = useShot('6.4');
  return (
    <AbsoluteFill>
      <Stage2
        set={hallway(f)}
        cam={{ x: 160, y: 1040, z: 1.2 + f * 0.002 }}
        f={f}
        actors={<Ban x={160} y={1580} t={f} eyes="sad" />}
      />
      <BigText
        lines={['HẾT LƯỢT THÌ IM LẶNG']}
        from={L('L111')}
        f={f}
        y={150}
        size={110}
        color="#d8d4e4"
      />
      <RewindCounter used={3} f={f} />
    </AbsoluteFill>
  );
};
const S65: React.FC = () => {
  const { f, dur, L } = useShot('6.5');
  const nod = Math.max(0, Math.sin(f / 7)) * 8;
  return (
    <Stage2
      set={schoolYard(f)}
      cam={cutCam(
        f,
        [
          { at: 0, a: { x: 560, y: 1080, z: 1.15 }, b: { x: 560, y: 1080, z: 1.2 } },
          { at: L('L113') - 2, a: faceCam(980, 1560, 1, 2.4), b: faceCam(980, 1560, 1, 2.6) },
          { at: L('L114') - 2, a: { x: 640, y: 1080, z: 1.25 }, b: { x: 640, y: 1080, z: 1.3 } },
        ],
        dur,
      )}
      f={f}
      actors={
        <>
          {[200, 420, 640].map((x, i) => (
            <Extra
              key={i}
              k={i + 1}
              x={x}
              y={1540}
              t={f}
              facing={i === 2 ? -1 : 1}
              eyes="happy"
              pose={i === 1 ? 'shrug' : 'stand'}
            />
          ))}
          <Ban x={980} y={1560} t={f} facing={-1} eyes="happy" lean={nod} />
        </>
      }
    />
  );
};
const S66: React.FC = () => {
  const { f, dur, L } = useShot('6.6');
  return (
    <AbsoluteFill>
      <Stage2
        set={schoolYard(f)}
        cam={cutCam(
          f,
          [
            { at: 0, a: { x: 640, y: 1060, z: 1.15 }, b: { x: 640, y: 1060, z: 1.2 } },
            {
              at: L('L115') + 40,
              a: faceCam(400, 1540, 1.08, 2.2),
              b: faceCam(400, 1540, 1.08, 2.4),
            },
          ],
          dur,
        )}
        f={f}
        actors={
          <>
            <Phong x={400} y={1540} t={f} facing={1} eyes="half" look={{ x: 0.8, y: 0 }} />
            <Ban x={900} y={1560} t={f} facing={-1} eyes="happy" />
          </>
        }
      />
      <BigText
        lines={['PHONG – BẠN TỪ MẪU GIÁO']}
        from={L('L115') + 6}
        f={f}
        y={150}
        size={96}
        color="#9ab0e0"
      />
    </AbsoluteFill>
  );
};
const S67: React.FC = () => {
  const { f, dur } = useShot('6.7');
  return (
    <Stage2
      set={schoolYard(f)}
      cam={cutCam(
        f,
        [{ at: 0, a: faceCam(400, 1540, 1.08, 2.6), b: faceCam(400, 1540, 1.08, 2.9), hold: true }],
        dur,
      )}
      f={f}
      actors={<Phong x={400} y={1540} t={f} facing={1} eyes="half" look={{ x: 0.6, y: 0.1 }} />}
    />
  );
};
const S68: React.FC = () => {
  const { f, dur, L } = useShot('6.8');
  return (
    <Stage2
      set={dining(f, { night: true })}
      cam={cutCam(
        f,
        [
          { at: 0, a: { x: 660, y: 1100, z: 1.3 }, b: { x: 660, y: 1100, z: 1.38 } },
          { at: L('L118') - 2, a: faceCam(840, 1540, 1.08, 2.4), b: faceCam(840, 1540, 1.08, 2.6) },
        ],
        dur,
      )}
      f={f}
      actors={
        <>
          <Ban x={500} y={1560} t={f} facing={1} eyes="half" look={{ x: 0, y: 0.6 }} />
          <Me x={840} y={1540} t={f} facing={-1} eyes="sad" look={{ x: -1, y: 0.2 }} />
        </>
      }
    />
  );
};
const S69: React.FC = () => {
  const { f, dur } = useShot('6.9');
  return (
    <Stage2
      set={schoolYard(f)}
      cam={{ x: 500, y: 1000, z: interpolate(f, [0, dur], [1.0, 0.85]) }}
      f={f}
      blurBg={10}
      actors={
        <>
          {[-600, -300, 1300, 1600, 100, 900].map((x, i) => (
            <g key={i} style={{ filter: 'blur(6px)' }} opacity={0.75}>
              <Extra
                k={i}
                x={x}
                y={1500 + (i % 2) * 60}
                t={f + i * 9}
                pose="walk"
                facing={x < 500 ? 1 : -1}
              />
            </g>
          ))}
          <Ban x={500} y={1560} t={f} eyes="half" />
        </>
      }
    />
  );
};

// ───────── 7. Friday – three turns, Phong ─────────
const S71: React.FC = () => {
  const { f, dur, L } = useShot('7.1');
  const rew = L('L123') + 30;
  return (
    <AbsoluteFill>
      <RewindFX f={f} from={rew} dur={REW}>
        <Stage2
          set={classroom(f)}
          cam={cutCam(
            f,
            [
              { at: 0, a: { x: 500, y: 1040, z: 1.0 }, b: { x: 500, y: 1040, z: 1.05 } },
              { at: L('L123') - 2, a: faceCam(240, 1500, 1, 2.3), b: faceCam(240, 1500, 1, 2.5) },
            ],
            dur,
          )}
          f={f}
          actors={
            <>
              <Co x={-260} y={1480} t={rewindTime(f, rew, REW, 3)} facing={1} eyes="half" />
              <Ban x={240} y={1500} t={f} facing={-1} eyes="squint" />
            </>
          }
        />
      </RewindFX>
      {f < L('L123') - 2 && <Pow text="THỨ SÁU" x={500} y={320} from={0} f={f} size={130} />}
      <RewindCounter used={f >= rew + REW ? 1 : 0} f={f} pop={rew + REW} />
    </AbsoluteFill>
  );
};
const S72: React.FC = () => {
  const { f, L } = useShot('7.2');
  const rew = L('L125') + 26;
  const tw = rewindTime(f, rew, REW, 3);
  const tilt = interpolate(tw, [L('L125'), L('L125') + 24], [0, 30], clamp);
  return (
    <AbsoluteFill>
      <RewindFX f={f} from={rew} dur={REW}>
        <Stage2
          set={canteen(f)}
          cam={{ x: 600, y: 1160, z: 1.35 }}
          f={f}
          actors={
            <>
              <Linh x={360} y={1560} t={f} facing={1} eyes={tilt > 15 ? 'wide' : 'normal'} />
              <Ban
                x={760}
                y={1580}
                t={f}
                facing={-1}
                eyes={tilt > 15 ? 'wide' : 'normal'}
                pose="carry"
              />
              <g transform={`translate(640,${1250 + tilt * 2}) rotate(${-tilt})`}>
                <Tray x={0} y={0} />
              </g>
            </>
          }
        />
      </RewindFX>
      <RewindCounter used={f >= rew + REW ? 2 : 1} f={f} pop={rew + REW} />
    </AbsoluteFill>
  );
};
const S73: React.FC = () => {
  const { f, L } = useShot('7.3');
  const rew = L('L128') + 4;
  return (
    <AbsoluteFill>
      <RewindFX f={f} from={rew} dur={REW}>
        <Stage2
          set={canteen(f)}
          cam={{ x: 560, y: 1200, z: 1.5 }}
          f={f}
          actors={
            <>
              <Extra k={3} x={360} y={1560} t={f} facing={1} eyes="happy" pose="reach" />
              <Ban x={760} y={1580} t={f} facing={-1} eyes="squint" pose="reach" />
              <g transform="translate(560,1240)">
                <path d="M-40 0 Q-44 -40 0 -44 Q44 -40 40 0 Z" fill="#e6dccb" />
                <ellipse cx={0} cy={-40} rx={34} ry={8} fill="#c9a46a" />
              </g>
            </>
          }
        />
      </RewindFX>
      <RewindCounter used={f >= rew + REW ? 3 : 2} f={f} pop={rew + REW} />
    </AbsoluteFill>
  );
};
const S74: React.FC = () => {
  const { f, L } = useShot('7.4');
  return (
    <AbsoluteFill style={{ background: '#3a3036' }}>
      <AbsoluteFill style={{ transform: `scale(${1 + f * 0.002})` }}>
        <Notebook f={f} filled={3} label="THỨ SÁU · 4:00" />
      </AbsoluteFill>
      {f < L('L130') - 2 && <Pow text="4 GIỜ CHIỀU" x={500} y={160} from={0} f={f} size={100} />}
    </AbsoluteFill>
  );
};
const S75: React.FC = () => {
  const { f, dur, L } = useShot('7.5');
  const px = interpolate(f, [0, L('L132')], [-500, 320], clamp);
  return (
    <AbsoluteFill>
      <Stage2
        set={schoolYard(f)}
        cam={cutCam(
          f,
          [
            { at: 0, a: { x: 500, y: 1060, z: 1.05 }, b: { x: 500, y: 1060, z: 1.1 } },
            {
              at: L('L132') - 2,
              a: faceCam(320, 1540, 1.08, 2.4),
              b: faceCam(320, 1540, 1.08, 2.6),
            },
          ],
          dur,
        )}
        f={f}
        shake={f < L('L132') ? 4 : 0}
        actors={
          <>
            <Phong
              x={px}
              y={1540}
              t={f}
              facing={1}
              pose={f < L('L132') ? 'run' : 'stand'}
              eyes={f < L('L132') ? 'squint' : 'sad'}
              lean={f >= L('L132') ? 8 : 0}
            />
            <Ban x={900} y={1560} t={f} facing={-1} eyes="normal" />
          </>
        }
      />
      <RewindCounter used={3} f={f} />
    </AbsoluteFill>
  );
};
const S76: React.FC = () => {
  const { f, dur, L } = useShot('7.6');
  return (
    <Stage2
      set={schoolYard(f)}
      cam={cutCam(
        f,
        [
          { at: 0, a: faceCam(320, 1540, 1.08, 2.5), b: faceCam(320, 1540, 1.08, 2.7) },
          {
            at: L('L136') - 2,
            a: faceCam(900, 1560, 1, 2.6),
            b: faceCam(900, 1560, 1, 3.0),
            hold: true,
          },
        ],
        dur,
      )}
      f={f}
      actors={
        <>
          <Phong x={320} y={1540} t={f} facing={1} eyes="sad" />
          <Ban x={900} y={1560} t={f} facing={-1} eyes="wide" blink={false} />
        </>
      }
    />
  );
};
/** Three memories (afraid of dogs, crying at a cartoon, second grade). */
const S77: React.FC = () => {
  const { f, dur, L } = useShot('7.7');
  const m = f < L('L138') - 2 ? 0 : f < L('L139') - 2 ? 1 : f < L('L140') - 2 ? 2 : 3;
  const tone = { filter: 'sepia(0.5) saturate(0.9) brightness(1.05)' };
  if (m === 3)
    return (
      <Stage2
        set={schoolYard(f)}
        cam={cutCam(
          f,
          [{ at: 0, a: faceCam(320, 1540, 1.08, 2.4), b: faceCam(320, 1540, 1.08, 2.6) }],
          dur,
        )}
        f={f}
        actors={<Phong x={320} y={1540} t={f} facing={1} eyes="sad" />}
      />
    );
  return (
    <AbsoluteFill style={tone}>
      {m === 0 && (
        <Stage2
          set={schoolYard(f)}
          cam={{ x: 560, y: 1180, z: 1.3 }}
          f={f}
          actors={
            <>
              <g transform={`translate(${200 + Math.sin(f / 3) * 10},1560)`}>
                <ellipse cx={0} cy={-90} rx={110} ry={60} fill="#b07a40" />
                <circle cx={90} cy={-150} r={50} fill="#b07a40" />
                <path
                  d="M70 -195 L84 -235 L100 -195 Z M108 -195 L122 -232 L134 -192 Z"
                  fill="#8a5a30"
                />
                {[-60, -20, 40, 70].map((x) => (
                  <rect key={x} x={x} y={-50} width={14} height={50} fill="#8a5a30" />
                ))}
              </g>
              <Character
                x={700}
                y={1560}
                size={0.6}
                seed={13}
                hoodieColor="#3f4f72"
                hair
                t={f}
                facing={-1}
                pose="armsUp"
                eyes="normal"
              />
              <Character
                x={820}
                y={1560}
                size={0.58}
                seed={1}
                hoodieColor={C.orange}
                t={f}
                facing={-1}
                eyes="squint"
                shiver={2}
              />
            </>
          }
        />
      )}
      {m === 1 && (
        <Stage2
          set={livingRoom(f, { table: false, night: true })}
          cam={{ x: 400, y: 1250, z: 1.6 }}
          f={f}
          actors={
            <>
              <Character
                x={300}
                y={1500}
                size={0.6}
                seed={1}
                hoodieColor={C.orange}
                t={f}
                facing={-1}
                pose="sitGround"
                eyes="sad"
              />
              <Character
                x={480}
                y={1500}
                size={0.62}
                seed={13}
                hoodieColor="#3f4f72"
                hair
                t={f}
                facing={-1}
                pose="sitGround"
                eyes="happy"
              />
              {[0, 1].map((i) => (
                <ellipse
                  key={i}
                  cx={280 + i * 30}
                  cy={1260 + ((f * 4 + i * 30) % 60)}
                  rx={6}
                  ry={10}
                  fill="#bfe6ff"
                />
              ))}
            </>
          }
        />
      )}
      {m === 2 && (
        <Stage2
          set={classroom(f)}
          cam={{ x: 500, y: 1150, z: 1.4 }}
          f={f}
          actors={
            <>
              <Character
                x={380}
                y={1560}
                size={0.6}
                seed={1}
                hoodieColor={C.orange}
                t={f}
                facing={1}
                eyes="sad"
              />
              <Character
                x={600}
                y={1560}
                size={0.62}
                seed={13}
                hoodieColor="#3f4f72"
                hair
                t={f}
                facing={-1}
                eyes="happy"
                pose="hug"
              />
              <ellipse cx={380} cy={1570} rx={70} ry={14} fill="#bfe0f0" opacity={0.8} />
            </>
          }
        />
      )}
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(ellipse 70% 65% at 50% 50%, rgba(255,210,140,0) 45%, rgba(255,200,120,0.7) 100%)',
        }}
      />
      {m === 2 && <Pow text="LỚP 2" x={500} y={200} from={L('L139')} f={f} size={90} />}
    </AbsoluteFill>
  );
};
const S78: React.FC = () => {
  const { f, dur, L } = useShot('7.8');
  return (
    <AbsoluteFill>
      <Stage2
        set={schoolYard(f)}
        cam={cutCam(
          f,
          [
            { at: 0, a: faceCam(900, 1560, 1, 2.5), b: faceCam(900, 1560, 1, 2.7) },
            { at: L('L143') - 2, a: faceCam(900, 1560, 1, 3.2), b: faceCam(900, 1560, 1, 3.4) },
            { at: L('L144') - 2, a: { x: 620, y: 1060, z: 1.25 }, b: { x: 620, y: 1060, z: 1.3 } },
          ],
          dur,
        )}
        f={f}
        shake={f >= L('L143') && f < L('L144') ? 7 : 0}
        actors={
          <>
            <Phong x={320} y={1540} t={f} facing={1} eyes={f >= L('L143') ? 'wide' : 'sad'} />
            <Ban
              x={900}
              y={1560}
              t={f}
              facing={-1}
              eyes={f >= L('L144') ? 'sad' : 'squint'}
              pose={f >= L('L143') && f < L('L144') ? 'point' : 'stand'}
            />
          </>
        }
      />
      {f >= L('L143') && f < L('L144') && (
        <Pow
          text="VẬY MÀY ĐI LUÔN ĐI!"
          x={600}
          y={300}
          from={L('L143')}
          f={f}
          size={110}
          color="#ff4a3a"
          rot={-4}
        />
      )}
    </AbsoluteFill>
  );
};
/** Fist – NO light rings; the three dots shake then go still; audio muffled. */
const S79: React.FC = () => {
  const { f, dur, L, H } = useShot('7.9');
  const fist = L('L146');
  const after = f >= L('L147') - 2;
  return (
    <AbsoluteFill>
      {!after ? (
        <AbsoluteFill
          style={{
            background: '#2b2535',
            filter: f >= H('L146') ? 'saturate(0.5) brightness(0.85)' : undefined,
          }}
        >
          <Stage2 set={schoolYard(f)} cam={{ x: 600, y: 900, z: 1.2 }} f={f} blurBg={14} />
          <FistECU f={f} at={fist} rings={false} shake={f >= fist && f < fist + 30 ? 0.6 : 0} />
        </AbsoluteFill>
      ) : (
        <Stage2
          set={schoolYard(f)}
          cam={cutCam(
            f,
            [{ at: 0, a: { x: 620, y: 1060, z: 1.2 }, b: { x: 620, y: 1060, z: 1.25 } }],
            dur,
          )}
          f={f}
          actors={
            <>
              <Phong x={320} y={1540} t={f} facing={1} eyes="sad" />
              <Ban x={900} y={1560} t={f} facing={-1} eyes="squint" pose="hold" />
            </>
          }
        />
      )}
      <RewindCounter used={3} f={f} shake={f >= fist && f < fist + 24 ? 1.4 : 0} />
    </AbsoluteFill>
  );
};
const S710: React.FC = () => {
  const { f, dur, L } = useShot('7.10');
  const away = interpolate(f, [L('L149'), dur], [0, 1], clamp);
  return (
    <Stage2
      set={schoolYard(f)}
      cam={cutCam(
        f,
        [
          { at: 0, a: faceCam(320, 1540, 1.08, 2.4), b: faceCam(320, 1540, 1.08, 2.5) },
          { at: L('L149') - 2, a: { x: 500, y: 960, z: 0.9 }, b: { x: 500, y: 960, z: 0.85 } },
        ],
        dur,
      )}
      f={f}
      actors={
        <>
          <Phong
            x={320 - away * 900}
            y={1540 - away * 120}
            size={1.08 - away * 0.3}
            t={f}
            facing={away > 0 ? -1 : 1}
            back={away > 0}
            pose={away > 0 ? 'walk' : 'stand'}
            eyes="sad"
            speed={0.6}
          />
          <Ban x={900} y={1560} t={f} facing={-1} eyes="sad" />
        </>
      }
    />
  );
};
const S711: React.FC = () => {
  const { f } = useShot('7.11');
  return (
    <AbsoluteFill style={{ background: '#3a3036' }}>
      <AbsoluteFill style={{ transform: `scale(${1.1 + f * 0.002})` }}>
        <Notebook f={f} filled={3} label="THỨ SÁU" />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const ACT67: Record<string, ShotDef> = {
  '6.1': { C: S61, amb: 'class' },
  '6.2': {
    C: S62,
    amb: 'class',
    fx: (h) =>
      ['L102', 'L104', 'L106'].flatMap((id, i) => rewindDot(h.L(id), h.L(id) + 12, 0.7 - i * 0.15)),
  },
  '6.3': {
    C: S63,
    amb: 'class',
    fx: (h) => [loopFor('steps_tile_loop', h.L('L108'), h.L('L108') + 30, 0.3, 4)],
  },
  '6.4': { C: S64, amb: 'class', fx: (h) => [hit('whoosh_ui', h.L('L111'), 0.5)] },
  '6.5': { C: S65, amb: 'yard' },
  '6.6': { C: S66, amb: 'yard', fx: (h) => [hit('whoosh_ui', h.L('L115') + 6, 0.5)] },
  '6.7': { C: S67, amb: 'yard' },
  '6.8': { C: S68, amb: 'quiet', fx: () => [hit('chopsticks', 10, 0.4)] },
  '6.9': { C: S69, amb: 'yard' },
  '7.1': {
    C: S71,
    amb: 'class',
    fx: (h) => rewindDot(h.L('L123') + 30, h.L('L123') + 30 + REW, 0.8),
  },
  '7.2': {
    C: S72,
    amb: 'canteen',
    fx: (h) => [
      hit('tray_rattle', h.L('L125'), 0.6),
      ...rewindDot(h.L('L125') + 26, h.L('L125') + 26 + REW, 0.8),
    ],
  },
  '7.3': {
    C: S73,
    amb: 'canteen',
    fx: (h) => [
      hit('clap_rhythm', 0, 0.6),
      hit('cup', h.L('L128'), 0.5),
      ...rewindDot(h.L('L128') + 4, h.L('L128') + 4 + REW, 0.8),
    ],
  },
  '7.4': { C: S74, amb: 'class', fx: () => [hit('page_flip', 0, 0.5)] },
  '7.5': {
    C: S75,
    amb: 'yard',
    fx: (h) => [
      loopFor('steps_run_loop', 0, h.L('L132'), 0.6, 4),
      hit('panting', h.L('L132'), 0.5),
    ],
  },
  '7.6': { C: S76, amb: 'yard' },
  '7.7': {
    C: S77,
    amb: 'yard',
    fx: (h) => [
      hit('dog_bark', 6, 0.5),
      hit('whoosh', h.L('L138') - 2, 0.3),
      hit('whoosh', h.L('L139') - 2, 0.3),
    ],
  },
  '7.8': { C: S78, amb: 'yard' },
  '7.9': {
    C: S79,
    amb: 'none',
    fx: (h) => [
      loopFor('amb_yard_muffled_loop', 0, h.dur + 6, 0.5, 6),
      hit('tick_dead', h.L('L146'), 0.7),
      hit('tick_dead', h.L('L146') + 10, 0.55),
      hit('tick_dead', h.L('L146') + 20, 0.4),
    ],
  },
  '7.10': {
    C: S710,
    amb: 'yard',
    fx: (h) => [loopFor('steps_tile_loop', h.L('L149'), h.dur, 0.3, 10)],
  },
  '7.11': { C: S711, amb: 'quiet' },
};
