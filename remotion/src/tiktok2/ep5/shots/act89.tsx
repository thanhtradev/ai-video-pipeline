import React from 'react';
import { AbsoluteFill, interpolate } from 'remotion';
import { alley, minimal } from '../../ep1/sets';
import { cutCam, WIDE } from '../../ep1/Stage';
import { C, FONT } from '../../ep1/theme';
import { BigText, Pow } from '../../ep1/ui';
import { freezeK } from '../freeze';
import {
  Ba,
  BacSi,
  Ban,
  ClapECU,
  clamp,
  Extra,
  faceCam,
  hit,
  loopFor,
  Me,
  Ong,
  ShotDef,
  Stage5,
  Wheelchair,
} from '../kit';
import { bridge, dinner, erGate, erHall, ErSign, mainRoad, nightMarket, ward } from '../sets';
import { useShot } from '../time';

const AGE = 0.8;
/** Wheelchair + grandpa seated + you pushing behind (x = wheelchair centre). */
const Push: React.FC<{
  x: number;
  y: number;
  f: number;
  t?: number;
  rolling?: boolean;
  eyes?: 'squint' | 'wide' | 'sad' | 'normal';
  strain?: number;
  s?: number;
}> = ({ x, y, f, t = 0, rolling = true, eyes = 'squint', strain = 0.6, s = 1 }) => {
  const bx = x - 300 * s;
  const hx = (x - 150 * s - bx) / s;
  const hy = (y - 390 * s - y) / s;
  return (
    <g>
      <Wheelchair x={x} y={y} s={s} f={f} rolling={rolling} />
      <Ong
        x={x + 20 * s}
        y={y - 40 * s}
        size={s}
        t={t}
        facing={1}
        pose="sitChair"
        cane={false}
        eyes="droop"
        lean={4}
        shadow={false}
      />
      <Ban
        x={bx}
        y={y}
        size={s}
        t={f}
        facing={1}
        pose={rolling ? 'walk' : 'stand'}
        speed={0.7}
        handR={{ x: hx, y: hy }}
        handL={{ x: hx - 20, y: hy + 6 }}
        eyes={eyes}
        lean={8 + strain * 6}
        shiver={strain}
        age={AGE}
      />
    </g>
  );
};

const S81: React.FC = () => {
  const { f, dur, L, abs } = useShot('8.1');
  const fk = freezeK(abs);
  return (
    <Stage5
      set={dinner(0)}
      frozen={fk}
      cam={cutCam(
        f,
        [
          { at: 0, a: { x: 300, y: 1040, z: 1.0 }, b: { x: 520, y: 1020, z: 1.08 }, hold: true },
          { at: L('L161') - 2, a: faceCam(840, 1540, 1.18, 2.2), b: faceCam(870, 1540, 1.18, 2.3) },
          {
            at: L('L162') - 2,
            a: faceCam(1080, 1540, 1.08, 2.2),
            b: faceCam(1050, 1540, 1.08, 2.3),
          },
          { at: L('L163') - 2, a: { x: 260, y: 1180, z: 2.2 }, b: { x: 300, y: 1180, z: 2.35 } },
        ],
        dur,
      )}
      f={f}
      actors={
        <>
          <Ong
            x={160}
            y={1540}
            t={0}
            facing={1}
            cane={false}
            eyes="droop"
            lean={10}
            pose="reach"
            handR={{ x: 140, y: -230 }}
          />
          <Ba
            x={840}
            y={1540}
            t={0}
            facing={-1}
            eyes="wide"
            pose="hold"
            itemR="phone"
            handR={{ x: -40, y: -440 }}
          />
          <Me x={1080} y={1540} t={0} facing={-1} eyes="wide" pose="hold" itemR="paper" />
          <Ban x={560} y={1580} t={f} facing={-1} eyes="squint" age={AGE} />
        </>
      }
    />
  );
};
const S82: React.FC = () => {
  const { f, dur, L } = useShot('8.2');
  const pull = interpolate(f, [0, L('L165')], [-260, 300], clamp);
  const lifted = f >= L('L165');
  return (
    <Stage5
      set={dinner(0, { chair: false })}
      frozen={1}
      cam={cutCam(
        f,
        [
          { at: 0, a: { x: 0, y: 1100, z: 1.2 }, b: { x: 160, y: 1100, z: 1.28 } },
          { at: L('L165') - 2, a: { x: 260, y: 1080, z: 1.4 }, b: { x: 260, y: 1080, z: 1.5 } },
          { at: L('L166') - 2, a: faceCam(420, 1560, 1, 2.4), b: faceCam(420, 1560, 1, 2.6) },
        ],
        dur,
      )}
      f={f}
      actors={
        <>
          <Wheelchair x={pull} y={1540} f={f} rolling={!lifted} />
          {!lifted ? (
            <Ong x={160} y={1540} t={0} facing={1} cane={false} eyes="droop" lean={10} />
          ) : (
            <Ong
              x={pull + 20}
              y={1500}
              t={0}
              facing={1}
              pose="sitChair"
              cane={false}
              eyes="droop"
              shadow={false}
            />
          )}
          <Ban
            x={lifted ? pull + 200 : pull - 280}
            y={1560}
            t={f}
            facing={lifted ? -1 : 1}
            pose={lifted ? 'carry' : 'walk'}
            eyes="squint"
            shiver={lifted ? 1.2 : 0.4}
            age={AGE}
          />
          <Ba
            x={840}
            y={1540}
            t={0}
            facing={-1}
            eyes="wide"
            pose="hold"
            itemR="phone"
            handR={{ x: -40, y: -440 }}
          />
        </>
      }
    />
  );
};
const S83: React.FC = () => {
  const { f, dur } = useShot('8.3');
  const x = interpolate(f, [0, dur], [200, 900]);
  return (
    <Stage5
      set={alley(0)}
      frozen={1}
      cam={{ x: x - 100, y: 1120, z: 1.15 }}
      f={f}
      actors={
        <>
          <Extra k={3} x={1300} y={1520} t={0} pose="walk" facing={-1} />
          <Push x={x} y={1560} f={f} />
        </>
      }
    />
  );
};
const S84: React.FC = () => {
  const { f, dur, L, abs } = useShot('8.4');
  const fk = freezeK(abs);
  const live = f >= L('L174');
  const x = interpolate(f, [0, dur], [700, 1000]);
  return (
    <AbsoluteFill>
      <Stage5
        set={alley(live ? f : 0)}
        frozen={fk}
        cam={cutCam(
          f,
          [
            { at: 0, a: { x: x - 200, y: 1140, z: 1.25 }, b: { x: x - 160, y: 1140, z: 1.3 } },
            {
              at: L('L171') - 2,
              a: faceCam(x - 300, 1560, 1, 2.6),
              b: faceCam(x - 300, 1560, 1, 2.9),
            },
            {
              at: L('L174') - 2,
              a: { x: x - 100, y: 1040, z: 1.0 },
              b: { x: x - 100, y: 1040, z: 1.05 },
            },
          ],
          dur,
        )}
        f={f}
        shake={live ? 4 : 0}
        actors={
          <>
            <Extra
              k={3}
              x={live ? 1300 - (f - L('L174')) * 12 : 1300}
              y={1520}
              t={live ? f : 0}
              pose="walk"
              facing={-1}
            />
            <Push x={x} y={1560} f={f} rolling={!live} eyes={live ? 'wide' : 'squint'} />
          </>
        }
      />
    </AbsoluteFill>
  );
};
const S85: React.FC = () => {
  const { f, abs } = useShot('8.5');
  const fk = freezeK(abs);
  return f < 10 ? (
    <AbsoluteFill style={{ background: '#2b2535' }}>
      <ClapECU f={f} at={4} />
    </AbsoluteFill>
  ) : (
    <Stage5
      set={alley(0)}
      frozen={fk}
      cam={{ x: 800, y: 1100, z: 1.2 }}
      f={f}
      actors={<Push x={1000} y={1560} f={f} />}
    />
  );
};
const S86: React.FC = () => {
  const { f, dur } = useShot('8.6');
  const x = interpolate(f, [0, dur], [0, 1100]);
  return (
    <Stage5
      set={nightMarket(0)}
      frozen={1}
      cam={{ x: x - 60, y: 1120, z: 1.15 }}
      f={f}
      actors={
        <>
          {Array.from({ length: 8 }, (_, i) => (
            <Extra
              key={i}
              k={i}
              x={-700 + i * 330}
              y={1480 + (i % 2) * 60}
              t={i * 9}
              pose={i % 3 ? 'walk' : 'stand'}
              facing={i % 2 ? 1 : -1}
            />
          ))}
          <Push x={x} y={1600} f={f} />
        </>
      }
    />
  );
};
const S87: React.FC = () => {
  const { f, dur } = useShot('8.7');
  const x = interpolate(f, [0, dur], [200, 900]);
  return (
    <Stage5
      set={mainRoad(0)}
      frozen={1}
      cam={{ x: x - 80, y: 1140, z: 1.25 }}
      f={f}
      actors={<Push x={x} y={1600} f={f} s={0.9} />}
    />
  );
};
/** Rapid clap sequence – one set per beat. */
const S88: React.FC = () => {
  const { f, L } = useShot('8.8');
  const beats = [0, L('L189'), L('L190'), L('L191'), L('L192')];
  const i = beats.filter((b) => f >= b).length - 1;
  const sets = [alley(0), nightMarket(0), mainRoad(0), bridge(0), mainRoad(0, { buses: false })];
  const ecu = beats.some((b) => f >= b && f < b + 5);
  return ecu ? (
    <AbsoluteFill style={{ background: '#2b2535' }}>
      <ClapECU f={f} at={beats.filter((b) => f >= b).pop()! + 3} />
    </AbsoluteFill>
  ) : (
    <Stage5
      set={sets[i]}
      frozen={1}
      cam={{ x: 620 + i * 40, y: 1140, z: 1.2 + (i % 2) * 0.2 }}
      f={f}
      actors={<Push x={800} y={1600} f={f} strain={0.6 + i * 0.1} />}
    />
  );
};
const S89: React.FC = () => {
  const { f, L } = useShot('8.9');
  const ecu = f < L('L195') - 2;
  return ecu ? (
    <Stage5
      set={mainRoad(0)}
      frozen={1}
      cam={f < L('L194') - 2 ? { x: 500, y: 1500, z: 2.4 } : { x: 650, y: 1180, z: 3.6 }}
      f={f}
      actors={
        <>
          <Push x={800} y={1600} f={f} strain={1.4} />
          {f >= L('L194') - 2 &&
            [0, 1, 2].map((k) => (
              <circle
                key={k}
                cx={640 + k * 16}
                cy={1196 + (k % 2) * 8}
                r={8}
                fill="#e86a5a"
                opacity={0.8}
              />
            ))}
        </>
      }
    />
  ) : (
    <Stage5
      set={mainRoad(0)}
      frozen={1}
      cam={faceCam(500, 1600, 1.05, 2.4)}
      f={f}
      actors={<Push x={800} y={1600} f={f} strain={1.2} eyes="sad" />}
    />
  );
};
const S810: React.FC = () => {
  const { f, dur, L } = useShot('8.10');
  const k = interpolate(f, [0, dur], [0, 1]);
  const x = -400 + k * 1500;
  const y = 1700 - ((x + 1300) / 3700) * 600;
  return (
    <AbsoluteFill>
      <Stage5
        set={bridge(0)}
        frozen={1}
        cam={f < L('L199') - 2 ? { x: 500, y: 1000, z: 0.85 } : { x: x - 120, y: y - 300, z: 1.5 }}
        f={f}
        actors={
          <g transform={`rotate(-9 ${x} ${y})`}>
            <Push x={x} y={y} f={f} strain={1.4} />
          </g>
        }
      />
      {f >= L('L198') && f < L('L199') && (
        <Pow text="CÂY CẦU" x={500} y={300} from={L('L198')} f={f} size={110} />
      )}
    </AbsoluteFill>
  );
};
const S811: React.FC = () => {
  const { f, dur } = useShot('8.11');
  return (
    <Stage5
      set={erGate(0, { sign: false })}
      frozen={1}
      cam={{ x: 500, y: 860, z: interpolate(f, [0, dur], [0.9, 1.3]) }}
      f={f}
      actors={
        <>
          <g transform="translate(0,0)">
            <ErSign glow={1 + Math.sin(f / 4) * 0.3} />
          </g>
          <Push x={-200} y={1700} f={f} s={0.7} />
        </>
      }
    />
  );
};
const DOC = { x: 820, y: 1560 };
const S812: React.FC = () => {
  const { f, dur, L } = useShot('8.12');
  const inside = f >= L('L205') - 2;
  const x = inside
    ? interpolate(f, [L('L205'), dur], [-400, 420], clamp)
    : interpolate(f, [0, L('L205')], [-200, 400], clamp);
  return inside ? (
    <Stage5
      set={erHall(0, { time: '21:04' })}
      frozen={1}
      cam={{ x: 400, y: 1080, z: 1.05 }}
      f={f}
      actors={
        <>
          <BacSi x={DOC.x} y={DOC.y} t={0} facing={-1} pose="walk" eyes="normal" />
          <Push x={x} y={1600} f={f} strain={1.4} />
        </>
      }
    />
  ) : (
    <Stage5
      set={erGate(0)}
      frozen={1}
      cam={{ x: 480, y: 1100, z: 1.1 }}
      f={f}
      actors={<Push x={x} y={1650} f={f} strain={1.4} />}
    />
  );
};
const S813: React.FC = () => {
  const { f, L } = useShot('8.13');
  const clap = 6;
  return f < L('L210') - 2 ? (
    <AbsoluteFill style={{ background: '#2b2535' }}>
      <ClapECU f={f} at={clap} />
      {f >= L('L208') && (
        <Pow
          text={f >= L('L209') ? '…MÀ ĐỂ THẢ.' : 'KHÔNG PHẢI ĐỂ DỪNG…'}
          x={500}
          y={250}
          from={f >= L('L209') ? L('L209') : L('L208')}
          f={f}
          size={90}
          color="#fff"
        />
      )}
    </AbsoluteFill>
  ) : (
    <Stage5
      set={erHall(f, { time: '21:04' })}
      cam={{ x: 560, y: 1080, z: 1.0 }}
      f={f}
      actors={
        <>
          <BacSi x={DOC.x} y={DOC.y} t={f} facing={-1} eyes="wide" />
          <Push x={420} y={1600} f={f} rolling={false} strain={0} eyes="wide" />
        </>
      }
    />
  );
};
const S814: React.FC = () => {
  const { f, dur, L } = useShot('8.14');
  return (
    <Stage5
      set={erHall(f, { time: '21:04' })}
      cam={cutCam(
        f,
        [
          { at: 0, a: faceCam(DOC.x, DOC.y, 1.04, 2.4), b: faceCam(DOC.x, DOC.y, 1.04, 2.6) },
          { at: L('L212') - 2, a: { x: 420, y: 1200, z: 1.5 }, b: { x: 420, y: 1200, z: 1.6 } },
          {
            at: L('L213') - 2,
            a: faceCam(160, 1600, 1, 2.0, 120),
            b: faceCam(160, 1600, 1, 2.3, 120),
            hold: true,
          },
        ],
        dur,
      )}
      f={f}
      actors={
        <>
          <BacSi x={DOC.x} y={DOC.y} t={f} facing={-1} eyes="wide" />
          <Wheelchair x={420} y={1600} f={f} />
          <Ong
            x={440}
            y={1560}
            t={f}
            facing={1}
            pose="sitChair"
            cane={false}
            eyes="droop"
            shadow={false}
          />
          <Ban
            x={160}
            y={1600}
            t={f}
            facing={1}
            pose="sitGround"
            eyes="squint"
            shiver={0.8}
            age={AGE}
          />
          {[0, 1].map((i) => (
            <ellipse
              key={i}
              cx={120 + i * 70}
              cy={1010 + ((f * 3 + i * 25) % 50)}
              rx={6}
              ry={10}
              fill="#bfe6ff"
            />
          ))}
        </>
      }
    />
  );
};
const S815: React.FC = () => {
  const { f, dur, L } = useShot('8.15');
  const go = interpolate(f, [L('L220'), dur], [0, 1], clamp);
  return (
    <AbsoluteFill>
      <Stage5
        set={erHall(f, { doors: go, time: '21:05' })}
        cam={cutCam(
          f,
          [
            { at: 0, a: faceCam(DOC.x, DOC.y, 1.04, 2.3), b: faceCam(DOC.x, DOC.y, 1.04, 2.5) },
            { at: L('L220') - 2, a: { x: 200, y: 1060, z: 1.0 }, b: { x: 160, y: 1060, z: 1.05 } },
          ],
          dur,
        )}
        f={f}
        shake={f >= L('L220') ? 4 : 0}
        actors={
          <>
            {[0, 1, 2].map((i) => (
              <Extra
                key={i}
                k={i + 4}
                x={900 - go * 1300 + i * 140}
                y={1560}
                t={f}
                pose="run"
                facing={-1}
                hoodieColor="#5f9a9a"
              />
            ))}
            <g transform={`translate(${-go * 700},0)`}>
              <Wheelchair x={420} y={1600} f={f} rolling={go > 0} />
              <Ong
                x={440}
                y={1560}
                t={f}
                facing={1}
                pose="sitChair"
                cane={false}
                eyes="droop"
                shadow={false}
              />
            </g>
            <BacSi
              x={DOC.x - go * 1100}
              y={DOC.y}
              t={f}
              facing={-1}
              pose={go > 0 ? 'run' : 'point'}
              eyes="wide"
            />
            <Ban x={160} y={1600} t={f} facing={1} pose="sitGround" eyes="wide" age={AGE} />
          </>
        }
      />
      {f >= L('L220') && f < L('L221') + 20 && (
        <Pow
          text="ĐỘT QUỴ! KÍP CẤP CỨU!"
          x={600}
          y={300}
          from={L('L220')}
          f={f}
          size={100}
          color="#ff7a6a"
        />
      )}
    </AbsoluteFill>
  );
};
const S816: React.FC = () => {
  const { f } = useShot('8.16');
  const close = interpolate(f, [16, 40], [1, 0], clamp);
  return (
    <Stage5
      set={erHall(f, { doors: close, time: '21:05' })}
      cam={{ x: -300, y: 1080, z: 1.4 + f * 0.002 }}
      f={f}
      actors={null}
    />
  );
};
const S817: React.FC = () => {
  const { f, dur, L } = useShot('8.17');
  return (
    <AbsoluteFill>
      <Stage5
        set={erHall(f, { time: '21:06' })}
        cam={{ x: 500, y: 1180, z: interpolate(f, [0, dur], [1.1, 1.35]) }}
        f={f}
        actors={
          <Ban
            x={500}
            y={1600}
            t={f}
            pose="sitGround"
            facing={1}
            eyes="closed"
            squash={Math.sin(f / 5) * 0.05}
            age={1}
          />
        }
      />
      {f >= L('L226') - 2 && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 220,
            textAlign: 'center',
            fontFamily: FONT,
            fontWeight: 800,
            fontSize: 200,
            color: C.orange,
            WebkitTextStroke: '16px #15121a',
            paintOrder: 'stroke fill',
            transform: `scale(${interpolate(f - L('L226'), [0, 6, 12], [0.4, 1.1, 1], clamp)})`,
          }}
        >
          +63 NGÀY
        </div>
      )}
    </AbsoluteFill>
  );
};
const S818: React.FC = () => {
  const { f } = useShot('8.18');
  return (
    <AbsoluteFill>
      <Stage5
        set={erHall(f, { time: '21:04' })}
        cam={{ x: 1200, y: 600, z: 2.6 + f * 0.003 }}
        f={f}
      />
      <BigText lines={['4 PHÚT']} from={20} f={f} y={760} size={140} color="#fff" />
    </AbsoluteFill>
  );
};

// ───────── 9. Hospital room ─────────
const BED = { x: 300, y: 1310 };
/** Grandpa sitting on the mattress, leaning on a pillow, blanket over the legs. */
const OngBed: React.FC<{
  f: number;
  eyes?: 'happy' | 'normal' | 'half';
  hand?: { x: number; y: number };
}> = ({ f, eyes = 'normal', hand }) => (
  <g>
    <Ong
      x={BED.x - 120}
      y={BED.y + 170}
      t={f}
      facing={1}
      pose={hand ? 'reach' : 'sitChair'}
      handR={hand}
      cane={false}
      eyes={eyes}
      lean={-10}
      shadow={false}
    />
    <path
      d={`M${BED.x - 200} ${BED.y + 30} Q${BED.x + 150} ${BED.y - 20 + Math.sin(f / 50) * 3} ${BED.x + 470} ${BED.y + 30} L${BED.x + 470} ${BED.y + 140} L${BED.x - 210} ${BED.y + 140} Z`}
      fill="#a8bcd0"
    />
  </g>
);
const S91: React.FC = () => {
  const { f, dur, L } = useShot('9.1');
  return (
    <Stage5
      set={ward(f)}
      cam={cutCam(
        f,
        [
          { at: 0, a: { x: 520, y: 1000, z: 0.95 }, b: { x: 520, y: 1000, z: 1.02 } },
          {
            at: L('L232') - 2,
            a: faceCam(BED.x - 120, BED.y + 170, 1, 2.2),
            b: faceCam(BED.x - 120, BED.y + 170, 1, 2.4),
          },
          {
            at: L('L235') - 2,
            a: faceCam(BED.x - 120, BED.y + 170, 1, 2.8),
            b: faceCam(BED.x - 120, BED.y + 170, 1, 3.0),
          },
        ],
        dur,
      )}
      f={f}
      actors={<OngBed f={f} eyes={f >= L('L235') ? 'happy' : 'half'} />}
    />
  );
};
const S92: React.FC = () => {
  const { f, dur, L } = useShot('9.2');
  return (
    <AbsoluteFill>
      <Stage5
        set={ward(f)}
        cam={cutCam(
          f,
          [{ at: 0, a: { x: 900, y: 1060, z: 1.2 }, b: { x: 900, y: 1060, z: 1.28 } }],
          dur,
        )}
        f={f}
        actors={
          <>
            <OngBed f={f} eyes="half" />
            <BacSi
              x={720}
              y={1560}
              t={f}
              facing={1}
              eyes="happy"
              lean={Math.max(0, Math.sin(f / 8)) * 8}
            />
            <Ba x={1080} y={1560} t={f} facing={-1} eyes="normal" />
            <Me x={1300} y={1560} t={f} facing={-1} eyes="happy" />
          </>
        }
      />
      <BigText
        lines={['GIỜ VÀNG']}
        from={L('L236') + 10}
        f={f}
        y={160}
        size={120}
        color="#ffd27a"
      />
    </AbsoluteFill>
  );
};
const S93: React.FC = () => {
  const { f, dur, L } = useShot('9.3');
  return (
    <Stage5
      set={ward(f)}
      cam={cutCam(
        f,
        [
          { at: 0, a: faceCam(1080, 1560, 1.18, 2.2), b: faceCam(1080, 1560, 1.18, 2.4) },
          { at: L('L240') - 2, a: { x: 900, y: 1080, z: 1.3 }, b: { x: 900, y: 1080, z: 1.35 } },
        ],
        dur,
      )}
      f={f}
      actors={
        <>
          <Ba x={1080} y={1560} t={f} facing={-1} eyes="half" pose="shrug" />
          <Ban x={780} y={1560} t={f} facing={1} eyes="normal" age={1} />
        </>
      }
    />
  );
};
const S94: React.FC = () => {
  const { f, dur } = useShot('9.4');
  return (
    <Stage5
      set={ward(f)}
      cam={cutCam(
        f,
        [{ at: 0, a: faceCam(780, 1560, 1, 2.6), b: faceCam(780, 1560, 1, 2.8) }],
        dur,
      )}
      f={f}
      actors={<Ban x={780} y={1560} t={f} facing={1} eyes="happy" age={1} />}
    />
  );
};
const S95: React.FC = () => {
  const { f, dur } = useShot('9.5');
  return (
    <Stage5
      set={ward(f)}
      cam={{ ...faceCam(BED.x - 120, BED.y + 170, 1, interpolate(f, [0, dur], [2.4, 3.0])) }}
      f={f}
      actors={<OngBed f={f} eyes="normal" />}
    />
  );
};
const S96: React.FC = () => {
  const { f, dur, L } = useShot('9.6');
  const rub = Math.sin(f / 3) * 14;
  return (
    <Stage5
      set={ward(f)}
      cam={cutCam(
        f,
        [
          { at: 0, a: { x: 420, y: 1040, z: 1.4 }, b: { x: 420, y: 1040, z: 1.5 } },
          {
            at: L('L247') - 2,
            a: faceCam(BED.x - 120, BED.y + 170, 1, 2.4),
            b: faceCam(BED.x - 120, BED.y + 170, 1, 2.8),
            hold: true,
          },
        ],
        dur,
      )}
      f={f}
      actors={
        <>
          <OngBed f={f} eyes="happy" hand={{ x: 330 + rub, y: -500 }} />
          <Ban x={560} y={1560} t={f} facing={-1} eyes="happy" age={1} lean={-6} />
        </>
      }
    />
  );
};
const S97: React.FC = () => {
  const { f, dur } = useShot('9.7');
  return (
    <Stage5
      set={ward(f, { calendar: 1 })}
      cam={cutCam(
        f,
        [{ at: 0, a: { x: -140, y: 820, z: 1.8 }, b: { x: -140, y: 820, z: 1.9 } }],
        dur,
      )}
      f={f}
      actors={<Ban x={60} y={1560} t={f} facing={-1} eyes="happy" pose="raise" age={1} />}
    />
  );
};
const S98: React.FC = () => {
  const { f, dur, L } = useShot('9.8');
  const tear = interpolate(f, [L('L251') + 4, L('L251') + 28], [0, 1], clamp);
  return (
    <Stage5
      set={ward(f, { calendar: 1, tear })}
      cam={cutCam(
        f,
        [
          { at: 0, a: { x: 100, y: 1000, z: 1.2 }, b: { x: 100, y: 1000, z: 1.28 } },
          { at: L('L251') - 2, a: { x: -140, y: 800, z: 2.0 }, b: { x: -140, y: 800, z: 2.1 } },
        ],
        dur,
      )}
      f={f}
      actors={
        <>
          <OngBed f={f} eyes="happy" hand={{ x: -100, y: -560 }} />
          <Ban x={60} y={1560} t={f} facing={-1} eyes="happy" pose="reach" age={1} />
        </>
      }
    />
  );
};
const S99: React.FC = () => {
  const { f, dur } = useShot('9.9');
  return (
    <Stage5
      set={ward(f, { calendar: 1, tear: 1 })}
      cam={{ ...faceCam(BED.x - 120, BED.y + 170, 1, interpolate(f, [0, dur], [2.6, 3.1])) }}
      f={f}
      actors={<OngBed f={f} eyes="happy" />}
    />
  );
};
const S910: React.FC = () => {
  const { f, dur } = useShot('9.10');
  return (
    <Stage5
      set={ward(f, { calendar: 1, tear: 1 })}
      cam={{ x: 520, y: 1000, z: interpolate(f, [0, dur], [1.3, 0.9]) }}
      f={f}
      actors={
        <>
          <OngBed f={f} eyes="happy" />
          <Ban x={620} y={1560} t={f} facing={-1} pose="sitChair" eyes="happy" age={1} />
        </>
      }
    />
  );
};
const S911: React.FC = () => {
  const { f, L } = useShot('9.11');
  return (
    <AbsoluteFill>
      <Stage5
        set={ward(f, { calendar: 1, tear: 1 })}
        cam={{ x: 520, y: 1000, z: 0.9 }}
        f={f}
        actors={
          <>
            <OngBed f={f} eyes="happy" />
            <Ban x={620} y={1560} t={f} facing={-1} pose="sitChair" eyes="happy" age={1} />
          </>
        }
      />
      <AbsoluteFill style={{ background: 'rgba(30,20,20,0.25)' }} />
      <BigText
        lines={['Có những ngày không phải để giữ.']}
        from={L('L255')}
        f={f}
        y={180}
        size={100}
      />
      <BigText lines={['Mà để cho.']} from={L('L256')} f={f} y={480} size={130} color={C.orange} />
    </AbsoluteFill>
  );
};
const S912: React.FC = () => {
  const { f, dur, L } = useShot('9.12');
  const final = f >= L('L260') - 2;
  return (
    <AbsoluteFill>
      <Stage5
        set={minimal('#5a4050', '#2a2032')}
        cam={cutCam(
          f,
          [
            { at: 0, a: { ...WIDE, z: 1.0 }, b: { ...WIDE, z: 1.05 } },
            { at: L('L259') - 2, a: { ...WIDE, z: 1.05 }, b: { ...WIDE, z: 1.1 } },
            {
              at: L('L260') - 2,
              a: { ...WIDE, y: 1000, z: 1.0 },
              b: { ...WIDE, y: 1000, z: 1.05 },
            },
          ],
          dur,
        )}
        f={f}
        actors={
          <Ban
            x={final ? 500 : 860}
            y={1560}
            t={f}
            eyes="happy"
            pose={final ? 'stand' : 'raise'}
            age={1}
          />
        }
      />
      {!final && f < L('L259') - 2 && (
        <BigText
          lines={['Mỗi lần dừng = 1 ngày tuổi.', 'Bạn sẽ dùng cho điều gì? 👇']}
          from={4}
          f={f}
          y={120}
          size={88}
          accent={[1]}
        />
      )}
      {!final && f >= L('L259') - 2 && (
        <BigText
          lines={['❤️ Thích  ·  🔔 Đăng ký', 'để xem thêm những chữ “nếu”']}
          from={L('L259')}
          f={f}
          y={120}
          size={88}
          accent={[0]}
        />
      )}
      {final && (
        <BigText
          lines={['Một chữ nếu…', 'một cuộc đời khác.']}
          from={L('L260')}
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
  '8.1': { C: S81, amb: 'dinner' },
  '8.2': {
    C: S82,
    amb: 'dinner',
    fx: (h) => [
      loopFor('wheel_tile', 0, h.L('L165'), 0.5, 4),
      hit('breath', h.L('L165') + 4, 0.6),
      hit('breath', h.L('L166'), 0.6),
    ],
  },
  '8.3': { C: S83, amb: 'alley', fx: (h) => [loopFor('wheel_road', 0, h.dur, 0.5, 4)] },
  '8.4': {
    C: S84,
    amb: 'alley',
    fx: (h) => [
      loopFor('wheel_road', 0, h.L('L174'), 0.45, 4),
      hit('horn', h.L('L175'), 0.7),
      loopFor('street_burst', h.L('L174'), h.dur + 4, 0.6, 2),
    ],
  },
  '8.5': { C: S85, amb: 'street' },
  '8.6': {
    C: S86,
    amb: 'street',
    fx: (h) => [loopFor('wheel_road', 0, h.dur, 0.5, 4), loopFor('breath_loop', 0, h.dur, 0.4, 6)],
  },
  '8.7': { C: S87, amb: 'street', fx: (h) => [loopFor('wheel_road', 0, h.dur, 0.5, 4)] },
  '8.8': { C: S88, amb: 'street', fx: (h) => [loopFor('breath_loop', 0, h.dur, 0.45, 4)] },
  '8.9': { C: S89, amb: 'street', fx: (h) => [loopFor('breath_loop', 0, h.dur, 0.55, 4)] },
  '8.10': {
    C: S810,
    amb: 'street',
    fx: (h) => [
      loopFor('wheel_road', 0, h.dur, 0.45, 4),
      loopFor('breath_loop', 0, h.dur, 0.55, 4),
    ],
  },
  '8.11': { C: S811, amb: 'street', fx: (h) => [loopFor('breath_loop', 0, h.dur, 0.5, 4)] },
  '8.12': {
    C: S812,
    amb: 'er',
    fx: (h) => [
      loopFor('wheel_hospital', 0, h.dur, 0.5, 4),
      loopFor('breath_loop', 0, h.dur, 0.5, 4),
    ],
  },
  '8.13': { C: S813, amb: 'er' },
  '8.14': {
    C: S814,
    amb: 'er',
    fx: (h) => [hit('startle', 0, 0.5), loopFor('breath_loop', 0, h.dur, 0.6, 6)],
  },
  '8.15': {
    C: S815,
    amb: 'er',
    fx: (h) => [
      loopFor('steps_run_loop', h.L('L220'), h.dur, 0.6, 4),
      hit('door_swing', h.L('L222') - 10 > 0 ? h.L('L220') + 10 : h.L('L220') + 10, 0.6),
      loopFor('wheel_hospital', h.L('L220'), h.dur, 0.5, 4),
    ],
  },
  '8.16': {
    C: S816,
    amb: 'er',
    fx: () => [hit('door_swing', 16, 0.7), hit('door_close_heavy', 38, 0.7)],
  },
  '8.17': {
    C: S817,
    amb: 'er',
    fx: (h) => [loopFor('breath_loop', 0, h.dur, 0.35, 10), hit('day_tick', h.L('L226'), 0.6)],
  },
  '8.18': { C: S818, amb: 'er', fx: () => [hit('clock_tick', 0, 0.5), hit('clock_tick', 30, 0.5)] },
  '9.1': { C: S91, amb: 'ward', fx: (h) => [loopFor('monitor_beep', 0, h.dur, 0.25, 10)] },
  '9.2': { C: S92, amb: 'ward', fx: (h) => [loopFor('monitor_beep', 0, h.dur, 0.2, 10)] },
  '9.3': { C: S93, amb: 'ward' },
  '9.4': { C: S94, amb: 'ward' },
  '9.5': { C: S95, amb: 'ward', fx: (h) => [loopFor('monitor_beep', 0, h.dur, 0.2, 10)] },
  '9.6': { C: S96, amb: 'ward', fx: () => [hit('cloth', 6, 0.4)] },
  '9.7': { C: S97, amb: 'ward', fx: () => [hit('nail_tap', 10, 0.6), hit('paper', 24, 0.5)] },
  '9.8': { C: S98, amb: 'ward', fx: (h) => [hit('calendar_tear', h.L('L251') + 4, 0.9)] },
  '9.9': { C: S99, amb: 'ward' },
  '9.10': { C: S910, amb: 'ward', fx: (h) => [loopFor('monitor_beep', 0, h.dur, 0.18, 10)] },
  '9.11': {
    C: S911,
    amb: 'ward',
    fx: (h) => [hit('whoosh_ui', h.L('L255'), 0.4), hit('whoosh_ui', h.L('L256'), 0.4)],
  },
  '9.12': {
    C: S912,
    amb: 'rules',
    fx: (h) => [hit('whoosh_ui', 4, 0.5), hit('ting', h.L('L259'), 0.5)],
  },
};
