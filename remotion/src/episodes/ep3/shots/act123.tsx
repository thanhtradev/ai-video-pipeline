import React from 'react';
import { AbsoluteFill, interpolate } from 'remotion';
import { Character } from '../../../rig/Character';
import { minimal } from '../../../kits/whatif/sets';
import { cutCam, WIDE } from '../../../kits/whatif/Stage';
import { C, FONT } from '../../../kits/whatif/theme';
import { BigText, IconBubble, Pow } from '../../../kits/whatif/ui';
import { bedroomDay } from '../../../kits/whatif/sets-home';
import {
  Ban,
  BigClock,
  clamp,
  countRewind,
  Extra,
  faceCam,
  FistECU,
  hit,
  Linh,
  loopFor,
  RewindCounter,
  RewindFX,
  rewindDot,
  rewindTime,
  ShotDef,
  Stage2,
} from '../kit';
import { Mirror, schoolGate } from '../../../kits/whatif/sets-school';
import { useShot } from '../time';

/** School gate: you stand at the right third, Linh walks in from the left. */
export const GB = { x: 820, y: 1580 };
export const linhX = (t: number) => interpolate(t, [0, 160], [-420, 520], clamp);
/** Students walking through the gate (uses world time tw – walks backwards on rewind). */
export const Students: React.FC<{ tw: number; n?: number; y?: number; s?: number }> = ({
  tw,
  n = 6,
  y = 1500,
  s = 0.9,
}) => (
  <>
    {Array.from({ length: n }, (_, i) => {
      const span = 2400;
      const x = ((((i * 397 + tw * (2.2 + (i % 3) * 0.6)) % span) + span) % span) - 1000;
      return (
        <Extra
          key={i}
          k={i}
          x={x}
          y={y + (i % 3) * 26}
          size={s * (0.92 + (i % 2) * 0.08)}
          t={tw + i * 9}
          pose="walk"
          facing={1}
          eyes={i % 2 ? 'half' : 'normal'}
          accessories={['backpack']}
        />
      );
    })}
  </>
);

// ───────── 1.1 HOOK ─────────
const S11: React.FC = () => {
  const { f, dur } = useShot('1.1');
  const fist = 6;
  const rew = 38;
  const tw = rewindTime(f + 300, rew + 300, 40, 6);
  return (
    <AbsoluteFill>
      {f < rew ? (
        <AbsoluteFill style={{ background: '#2b2535' }}>
          <Stage2 set={schoolGate(f)} cam={{ x: 600, y: 900, z: 1.2 }} f={f} blurBg={14} />
          <FistECU f={f} at={fist} />
        </AbsoluteFill>
      ) : (
        <RewindFX f={f} from={rew} dur={40}>
          <Stage2
            set={schoolGate(f, { leafT: tw })}
            cam={cutCam(
              f,
              [{ at: 0, a: { x: 560, y: 940, z: 0.95 }, b: { x: 560, y: 940, z: 1.05 } }],
              dur,
            )}
            f={f}
            actors={
              <>
                <Students tw={tw} n={8} />
                <Ban x={GB.x} y={GB.y} t={f} eyes="squint" pose="hold" handR={{ x: 60, y: -260 }} />
              </>
            }
          />
        </RewindFX>
      )}
      <RewindCounter used={0} f={f} show={interpolate(f, [rew, rew + 8], [0, 1], clamp)} />
      <BigText
        lines={['NẾU BẠN QUAY LẠI ĐƯỢC', '30 GIÂY?']}
        from={2}
        f={f}
        y={300}
        size={110}
        accent={[1]}
      />
    </AbsoluteFill>
  );
};

// ───────── 2.1 Seven in the morning, school gate ─────────
const S21: React.FC = () => {
  const { f, dur, L } = useShot('2.1');
  return (
    <AbsoluteFill>
      <Stage2
        set={schoolGate(f)}
        cam={cutCam(
          f,
          [
            { at: 0, a: { x: 560, y: 900, z: 0.9 }, b: { x: 560, y: 900, z: 0.98 } },
            { at: L('L004') - 2, a: { x: 500, y: 760, z: 1.3 }, b: { x: 500, y: 760, z: 1.36 } },
            { at: L('L005') - 2, a: { x: 300, y: 1150, z: 1.1 }, b: { x: 340, y: 1150, z: 1.15 } },
          ],
          dur,
        )}
        f={f}
        actors={
          <>
            <Students tw={f} n={7} />
            <Linh
              x={linhX(f * 0.35 - 40)}
              y={1500}
              t={f}
              pose="walk"
              facing={1}
              speed={0.7}
              eyes="normal"
              accessories={['backpack']}
            />
            <Ban x={GB.x} y={GB.y} t={f} facing={-1} eyes="wide" shiver={0.3} />
          </>
        }
      />
      <RewindCounter used={0} f={f} />
    </AbsoluteFill>
  );
};
// 2.2 flash: practising in front of the mirror last night
const S22: React.FC = () => {
  const { f, dur } = useShot('2.2');
  return (
    <AbsoluteFill style={{ filter: 'sepia(0.35) saturate(0.9)' }}>
      <Stage2
        set={bedroomDay(f, { dark: true })}
        cam={cutCam(
          f,
          [{ at: 0, a: { x: 560, y: 1000, z: 1.4 }, b: { x: 560, y: 1000, z: 1.55 } }],
          dur,
        )}
        f={f}
        actors={
          <>
            <Mirror x={360} y={1500}>
              <Character
                x={0}
                y={-30}
                size={0.75}
                seed={1}
                hoodieColor={C.orange}
                t={f}
                eyes="happy"
                pose="raise"
                facing={1}
              />
            </Mirror>
            <Ban
              x={760}
              y={1560}
              t={f}
              facing={-1}
              eyes={Math.floor(f / 20) % 2 ? 'happy' : 'squint'}
              pose={Math.floor(f / 20) % 2 ? 'raise' : 'stand'}
            />
          </>
        }
      />
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 50%, rgba(20,10,30,0.7) 100%)',
        }}
      />
    </AbsoluteFill>
  );
};
const S23: React.FC = () => {
  const { f, dur, L } = useShot('2.3');
  const lx = 300;
  return (
    <Stage2
      set={schoolGate(f)}
      cam={cutCam(
        f,
        [
          { at: 0, a: faceCam(lx, 1500, 0.97, 2.4), b: faceCam(lx, 1500, 0.97, 2.6) },
          { at: L('L008') - 2, a: faceCam(lx, 1500, 0.97, 3.0), b: faceCam(lx, 1500, 0.97, 3.2) },
        ],
        dur,
      )}
      f={f}
      actors={
        <Linh
          x={lx}
          y={1500}
          t={f}
          facing={1}
          eyes={f >= L('L008') ? 'happy' : 'normal'}
          pose="walk"
          speed={0.4}
          accessories={['backpack']}
        />
      }
    />
  );
};
const S24: React.FC = () => {
  const { f, dur, L } = useShot('2.4');
  return (
    <AbsoluteFill>
      <Stage2
        set={schoolGate(f)}
        cam={cutCam(
          f,
          [
            { at: 0, a: faceCam(GB.x, GB.y, 1, 2.6), b: faceCam(GB.x, GB.y, 1, 2.8) },
            { at: L('L010') - 2, a: faceCam(GB.x, GB.y, 1, 3.4), b: faceCam(GB.x, GB.y, 1, 3.6) },
          ],
          dur,
        )}
        f={f}
        actors={<Ban x={GB.x} y={GB.y} t={f} facing={-1} eyes="squint" pose="raise" />}
      />
      <RewindCounter used={0} f={f} />
    </AbsoluteFill>
  );
};
const S25: React.FC = () => {
  const { f, dur } = useShot('2.5');
  return (
    <Stage2
      set={schoolGate(f)}
      cam={cutCam(
        f,
        [{ at: 0, a: { x: 560, y: 1080, z: 1.25 }, b: { x: 560, y: 1080, z: 1.45 }, hold: true }],
        dur,
      )}
      f={f}
      actors={
        <>
          <Linh x={340} y={1500} t={f} facing={1} eyes="wide" accessories={['backpack']} />
          <Ban x={GB.x} y={GB.y} t={f} facing={-1} eyes="squint" pose="raise" shiver={0.4} />
        </>
      }
    />
  );
};
const S26: React.FC = () => {
  const { f, dur } = useShot('2.6');
  return (
    <AbsoluteFill>
      <Stage2
        set={schoolGate(f)}
        cam={cutCam(
          f,
          [
            {
              at: 0,
              a: faceCam(340, 1500, 0.97, 2.4),
              b: faceCam(340, 1500, 0.97, 2.6),
              hold: true,
            },
          ],
          dur,
        )}
        f={f}
        actors={<Linh x={340} y={1500} t={f} facing={1} eyes="wide" />}
      />
      <BigText
        lines={['GỌI BẠN CÙNG TUỔI LÀ', '“CÔ”']}
        from={4}
        f={f}
        y={160}
        size={104}
        accent={[1]}
      />
    </AbsoluteFill>
  );
};

// ───────── 2.7 The first rewind ─────────
const S27: React.FC = () => {
  const { f, at, L } = useShot('2.7');
  const fist = L('L014') - 4;
  const rew = at('L016', 'tua');
  const back = L('L020') - 2;
  const rd = back - rew;
  const tw = rewindTime(f, rew, rd, 3);
  const seg =
    f < fist ? 0 : f < rew ? 1 : f < L('L018') - 2 ? 2 : f < L('L019') - 2 ? 3 : f < back ? 4 : 5;
  const cams = [
    faceCam(GB.x, GB.y, 1, 3.0),
    { x: 0, y: 0, z: 1 },
    { x: 400, y: 1080, z: 1.3 },
    { x: -215, y: 600, z: 1.4 },
    { x: 900, y: 1300, z: 1.6 },
    { x: 560, y: 980, z: 1.0 },
  ];
  const lx =
    seg >= 2 && seg <= 4 ? 340 - (f - rew) * 6 : seg === 5 ? linhX((f - back) * 0.35 + 40) : 340;
  const world = (
    <Stage2
      set={schoolGate(f, { leafT: tw })}
      cam={{ ...cams[seg], z: cams[seg].z * (1 + (f % 40) * 0.002) }}
      f={f}
      actors={
        <>
          <Students tw={tw} n={7} />
          {seg === 4 && (
            <g transform={`translate(${1100 + (f - L('L019')) * 10},0)`}>
              <Extra k={3} x={0} y={1480} t={tw} pose="sitChair" facing={1} />
            </g>
          )}
          <Linh
            x={lx}
            y={1500}
            t={tw}
            pose={seg === 0 ? 'stand' : 'walk'}
            facing={1}
            eyes={seg === 0 ? 'wide' : 'normal'}
            accessories={['backpack']}
          />
          <Ban x={GB.x} y={GB.y} t={f} facing={-1} eyes="closed" />
        </>
      }
    />
  );
  return (
    <AbsoluteFill>
      {seg === 1 ? (
        <AbsoluteFill style={{ background: '#2b2535' }}>
          <Stage2 set={schoolGate(f)} cam={{ x: 600, y: 900, z: 1.2 }} f={f} blurBg={14} />
          <FistECU f={f} at={fist} />
        </AbsoluteFill>
      ) : (
        <RewindFX f={f} from={rew} dur={rd}>
          {world}
        </RewindFX>
      )}
      {f >= L('L020') - 2 && f < L('L021') && (
        <Pow text="−30 GIÂY" x={500} y={300} from={L('L020')} f={f} size={120} color="#7ad0ff" />
      )}
      <RewindCounter used={f >= back ? 1 : 0} f={f} pop={back} />
    </AbsoluteFill>
  );
};
const S28: React.FC = () => {
  const { f, dur, L } = useShot('2.8');
  const turn = L('L023');
  return (
    <AbsoluteFill>
      <Stage2
        set={schoolGate(f)}
        cam={cutCam(
          f,
          [
            { at: 0, a: faceCam(GB.x, GB.y, 1, 2.4), b: faceCam(GB.x, GB.y, 1, 2.6) },
            { at: turn - 2, a: { x: 560, y: 960, z: 0.92 }, b: { x: 560, y: 960, z: 0.98 } },
          ],
          dur,
        )}
        f={f}
        shake={f < turn ? 5 : 0}
        actors={
          <>
            {Array.from({ length: 7 }, (_, i) => (
              <Extra
                key={i}
                k={i}
                x={-900 + i * 340}
                y={1480 + (i % 3) * 30}
                size={0.9}
                t={f}
                facing={f >= turn + i * 2 ? 1 : 0}
                back={f < turn + i * 2}
                eyes="wide"
                accessories={['backpack']}
              />
            ))}
            <Linh x={400} y={1500} t={f} facing={1} eyes="wide" />
            <Ban x={GB.x} y={GB.y} t={f} facing={-1} eyes="squint" pose="armsUp" />
          </>
        }
      />
      {f < turn && (
        <Pow
          text="CHÀO LINH!!!"
          x={560}
          y={320}
          from={0}
          f={f}
          size={140}
          color={C.orange}
          rot={-6}
        />
      )}
      <RewindCounter used={1} f={f} />
    </AbsoluteFill>
  );
};
const S29: React.FC = () => {
  const { f, dur } = useShot('2.9');
  const rew = 2;
  const tw = rewindTime(f + 100, rew + 100, 30, 5);
  return (
    <AbsoluteFill>
      <RewindFX f={f} from={rew} dur={30}>
        <Stage2
          set={schoolGate(f, { leafT: tw })}
          cam={{ x: 560, y: 960, z: 0.95 }}
          f={f}
          actors={
            <>
              <Students tw={tw} n={7} />
              <Linh x={400 - (f - rew) * 8} y={1500} t={tw} pose="walk" facing={1} />
              <Ban x={GB.x} y={GB.y} t={f} facing={-1} eyes="squint" />
            </>
          }
        />
      </RewindFX>
      <RewindCounter used={f >= rew + 30 ? 2 : 1} f={f} pop={rew + 30} />
      {dur && null}
    </AbsoluteFill>
  );
};
const S210: React.FC = () => {
  const { f, dur, L } = useShot('2.10');
  const lx = interpolate(f, [0, dur], [200, 1400], clamp);
  return (
    <AbsoluteFill>
      <Stage2
        set={schoolGate(f)}
        cam={cutCam(
          f,
          [
            { at: 0, a: { x: 640, y: 1040, z: 1.1 }, b: { x: 640, y: 1040, z: 1.18 } },
            { at: L('L026') - 2, a: faceCam(GB.x, GB.y, 1, 2.3), b: faceCam(GB.x, GB.y, 1, 2.5) },
            { at: L('L028') - 2, a: { x: 800, y: 1060, z: 1.2 }, b: { x: 900, y: 1060, z: 1.25 } },
          ],
          dur,
        )}
        f={f}
        actors={
          <>
            <Linh
              x={lx}
              y={1500}
              t={f}
              pose={f >= L('L028') && f < L('L029') ? 'raise' : 'walk'}
              facing={1}
              eyes="happy"
              accessories={['backpack']}
            />
            <Ban
              x={GB.x}
              y={GB.y}
              t={f}
              facing={-1}
              eyes={f >= L('L029') ? 'half' : 'happy'}
              pose={f >= L('L026') ? 'raise' : 'stand'}
            />
          </>
        }
      />
      <RewindCounter used={f >= 6 ? 3 : 2} f={f} pop={6} />
    </AbsoluteFill>
  );
};
const S211: React.FC = () => {
  const { f, dur, L } = useShot('2.11');
  return (
    <AbsoluteFill>
      {f < L('L031') - 2 ? (
        <AbsoluteFill style={{ background: '#3a3440' }}>
          <BigClock time="7:05" f={f} sub="7:05 SÁNG" />
        </AbsoluteFill>
      ) : (
        <Stage2
          set={schoolGate(f)}
          cam={cutCam(
            f,
            [
              {
                at: 0,
                a: { x: 700, y: 1000, z: 1.05 },
                b: { x: 700, y: 1000, z: 1.2 },
                hold: true,
              },
            ],
            dur,
          )}
          f={f}
          actors={<Ban x={GB.x} y={GB.y} t={f} facing={0} eyes="half" />}
        />
      )}
      <RewindCounter used={3} f={f} />
    </AbsoluteFill>
  );
};

// ───────── 3. RULES ─────────
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
          {[
            ['✊', 120, 820],
            ['⏪', 880, 780],
            ['3️⃣', 160, 1240],
            ['🔒', 850, 1200],
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
  const { f, dur } = useShot('3.2');
  const back = interpolate(f, [34, dur - 6], [0, 30], clamp);
  return (
    <AbsoluteFill style={{ background: '#2b2535' }}>
      {f < 34 ? (
        <FistECU f={f} at={2} />
      ) : (
        <RewindFX f={f} from={34} dur={dur - 40}>
          <AbsoluteFill style={{ background: '#3a3448' }}>
            <BigClock time="7:00" f={f} sub={`−${Math.round(back)} GIÂY`} />
          </AbsoluteFill>
        </RewindFX>
      )}
    </AbsoluteFill>
  );
};
const S33: React.FC = () => {
  const { f, dur } = useShot('3.3');
  return (
    <Stage2
      set={rules}
      cam={cutCam(
        f,
        [{ at: 0, a: { x: 600, y: 1000, z: 1.05 }, b: { x: 600, y: 1000, z: 1.12 } }],
        dur,
      )}
      f={f}
      actors={
        <>
          {[-300, 0, 1200, 1500].map((x, i) => (
            <Extra key={i} k={i + 2} x={x} y={1540} t={f} eyes="normal" facing={x < 500 ? 1 : -1} />
          ))}
          <ellipse
            cx={R.x}
            cy={R.y - 420}
            rx={260}
            ry={340}
            fill="#ffd27a"
            opacity={0.18}
            style={{ filter: 'blur(30px)' }}
          />
          <Character
            x={R.x + 40}
            y={R.y}
            size={R.s}
            seed={1}
            hoodieColor="#fff3d0"
            t={f - 20}
            opacity={0.3}
            shadow={false}
            eyes="normal"
          />
          <Ban x={R.x} y={R.y} size={R.s} t={f} eyes="happy" />
        </>
      }
    />
  );
};
const S34: React.FC = () => {
  const { f, dur, L } = useShot('3.4');
  const night = f >= L('L037') - 2;
  const reset = interpolate(f, [L('L037') + 10, L('L037') + 30], [3, 0], clamp);
  return (
    <AbsoluteFill style={{ background: '#2b2535' }}>
      {night && <BigClock time="0:00" f={f} sub="00:00" />}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: night ? 860 : 380,
          display: 'flex',
          justifyContent: 'center',
          gap: 60,
        }}
      >
        {[0, 1, 2].map((i) => {
          const filled = night ? i < Math.ceil(reset) : f > 10 + i * 12;
          return (
            <div
              key={i}
              style={{
                width: 150,
                height: 150,
                borderRadius: 75,
                border: `12px solid ${filled ? C.orange : '#f3e2c2'}`,
                background: filled ? C.orange : 'transparent',
                transform: `scale(${night ? 0.6 : 1})`,
              }}
            />
          );
        })}
      </div>
      {f >= L('L038') - 2 && (
        <Pow
          text="KHÔNG ĐỂ DÀNH ĐƯỢC"
          x={500}
          y={1500}
          from={L('L038')}
          f={f}
          size={90}
          color="#ffc83a"
          rot={-3}
        />
      )}
      {dur && null}
    </AbsoluteFill>
  );
};
const S35: React.FC = () => {
  const { f, L } = useShot('3.5');
  return (
    <AbsoluteFill style={{ background: '#2b2535' }}>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 420,
          display: 'flex',
          justifyContent: 'center',
          gap: 60,
          transform: `translateX(${f >= L('L039') + 20 ? Math.sin(f * 2.4) * 6 : 0}px)`,
        }}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              width: 150,
              height: 150,
              borderRadius: 75,
              border: `12px solid ${C.orange}`,
              background: C.orange,
            }}
          />
        ))}
      </div>
      {f >= L('L039') + 10 && (
        <div style={{ position: 'absolute', left: 900, top: 600, fontSize: 140 }}>🔒</div>
      )}
      <BigText
        lines={['NHỚ CHI TIẾT NÀY']}
        from={L('L040')}
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
  const n = Math.round(interpolate(f, [L('L043'), L('L044') + 10], [0, 16000], clamp));
  return (
    <AbsoluteFill
      style={{
        background: '#262c38',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 40,
      }}
    >
      {f < L('L043') - 2 ? (
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
          <div
            style={{
              fontFamily: FONT,
              fontWeight: 800,
              fontSize: 150,
              color: '#fff',
              WebkitTextStroke: '12px #15121a',
              paintOrder: 'stroke fill',
            }}
          >
            {n.toLocaleString('vi-VN')} TỪ / NGÀY
          </div>
          {f >= L('L045') - 2 && (
            <div
              style={{
                fontFamily: FONT,
                fontWeight: 800,
                fontSize: 120,
                color: C.orange,
                WebkitTextStroke: '10px #15121a',
                paintOrder: 'stroke fill',
                transform: `scale(${interpolate(f - L('L045'), [0, 6, 10], [0.4, 1.15, 1], clamp)})`,
              }}
            >
              vs 3 LẦN SỬA
            </div>
          )}
        </>
      )}
    </AbsoluteFill>
  );
};
const S37: React.FC = () => {
  const { f, dur, L } = useShot('3.7');
  const flash = f >= L('L048') - 2;
  return (
    <AbsoluteFill>
      {flash ? (
        <Stage2
          set={schoolGate(f)}
          cam={faceCam(GB.x, GB.y, 1, 2.6 + (f - L('L048')) * 0.004)}
          f={f}
          actors={<Ban x={GB.x} y={GB.y} t={f} facing={-1} eyes="squint" pose="raise" />}
        />
      ) : (
        <AbsoluteFill
          style={{ background: '#262c38', alignItems: 'center', justifyContent: 'center' }}
        >
          <div
            style={{
              fontFamily: FONT,
              fontWeight: 800,
              fontSize: 220,
              color: '#7ad0ff',
              WebkitTextStroke: '14px #15121a',
              paintOrder: 'stroke fill',
            }}
          >
            0,1 GIÂY
          </div>
          <div
            style={{
              fontFamily: FONT,
              fontWeight: 800,
              fontSize: 60,
              color: '#fff',
              marginTop: 20,
            }}
          >
            để hình thành ấn tượng đầu tiên
          </div>
        </AbsoluteFill>
      )}
      {flash && f >= L('L049') && (
        <Pow
          text="× 3 LẦN"
          x={500}
          y={300}
          from={L('L049')}
          f={f}
          size={130}
          color={C.orange}
          rot={-6}
        />
      )}
      {dur && null}
    </AbsoluteFill>
  );
};

export const ACT123: Record<string, ShotDef> = {
  '1.1': { C: S11, amb: 'gate', fx: () => [...countRewind(6, 38, 0.9)] },
  '2.1': { C: S21, amb: 'gate', fx: (h) => [loopFor('steps_tile_loop', 0, h.dur, 0.35, 10)] },
  '2.2': { C: S22, amb: 'night' },
  '2.3': { C: S23, amb: 'gate' },
  '2.4': { C: S24, amb: 'gate' },
  '2.5': { C: S25, amb: 'quiet' },
  '2.6': { C: S26, amb: 'quiet', fx: () => [hit('whoosh_ui', 4, 0.5)] },
  '2.7': {
    C: S27,
    amb: 'gate',
    fx: (h) => [
      ...countRewind(h.L('L014') - 4, h.at('L016', 'tua'), 0.9),
      hit('dot_bup', h.L('L020') - 2, 0.7),
    ],
  },
  '2.8': {
    C: S28,
    amb: 'gate',
    fx: (h) => [
      hit('startle', h.L('L023'), 0.6),
      hit('moto_brake', h.L('L023') + 6, 0.6),
      hit('cloth', h.L('L023') + 4, 0.5),
    ],
  },
  '2.9': { C: S29, amb: 'gate', fx: () => rewindDot(2, 32, 0.9) },
  '2.10': {
    C: S210,
    amb: 'gate',
    fx: (h) => [hit('dot_bup', 6, 0.7), loopFor('steps_tile_loop', 0, h.dur, 0.45, 8)],
  },
  '2.11': { C: S211, amb: 'gate', fx: () => [hit('tick', 0, 0.5)] },
  '3.1': { C: S31, amb: 'rules', fx: () => [2, 6, 10, 14].map((t) => hit('whoosh_ui', t, 0.5)) },
  '3.2': { C: S32, amb: 'rules', fx: () => countRewind(2, 34, 0.8) },
  '3.3': { C: S33, amb: 'rules', fx: () => [hit('shimmer', 4, 0.4)] },
  '3.4': {
    C: S34,
    amb: 'rules',
    fx: (h) => [
      hit('dot_bup', 10, 0.5),
      hit('dot_bup', 22, 0.5),
      hit('dot_bup', 34, 0.5),
      hit('tick', h.L('L037'), 0.5),
    ],
  },
  '3.5': {
    C: S35,
    amb: 'rules',
    fx: (h) => [hit('buzz', h.L('L039') + 10, 0.7), hit('whoosh_ui', h.L('L040'), 0.5)],
  },
  '3.6': {
    C: S36,
    amb: 'rules',
    fx: (h) => [hit('whoosh_ui', 0, 0.5), hit('whoosh_ui', h.L('L045'), 0.5)],
  },
  '3.7': {
    C: S37,
    amb: 'rules',
    fx: (h) => [hit('whoosh_ui', 0, 0.5), hit('whoosh', h.L('L048'), 0.4)],
  },
};
