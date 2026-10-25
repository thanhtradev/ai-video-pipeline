import React from 'react';
import { AbsoluteFill, interpolate } from 'remotion';
import { classroom } from '../../ep1/sets';
import { cutCam } from '../../ep1/Stage';
import { C, FONT } from '../../ep1/theme';
import { BigText, Pow } from '../../ep1/ui';
import { yardField } from '../../ep2/sets';
import { Ba, Ban, ClapECU, clamp, Co, Extra, faceCam, hit, Me, Ong, ShotDef, Stage5 } from '../kit';
import { dinner, home } from '../sets';
import { useShot } from '../time';

const AGE = 0.7;

const S61: React.FC = () => {
  const { f, dur } = useShot('6.1');
  return (
    <Stage5
      set={home(f)}
      cam={{ ...faceCam(600, 1560, 1, interpolate(f, [0, dur], [1.6, 2.2]), 80) }}
      f={f}
      actors={<Ban x={600} y={1560} t={f} eyes="half" age={AGE} />}
    />
  );
};
const S62: React.FC = () => {
  const { f } = useShot('6.2');
  const n = Math.min(120, Math.floor(f * 3));
  return (
    <AbsoluteFill style={{ background: '#3a3036' }}>
      <svg width={1920} height={1080}>
        <g transform="translate(960,540) rotate(-2)">
          <rect x={-520} y={-340} width={1040} height={680} rx={10} fill="#f6f0e2" />
          {Array.from({ length: n }, (_, i) => {
            const g = Math.floor(i / 5);
            const k = i % 5;
            const x = -460 + (g % 12) * 78 + (k < 4 ? k * 12 : 0);
            const y = -260 + Math.floor(g / 12) * 120;
            return k < 4 ? (
              <line key={i} x1={x} y1={y} x2={x} y2={y + 70} stroke="#4a4652" strokeWidth={5} />
            ) : (
              <line
                key={i}
                x1={x - 8}
                y1={y + 60}
                x2={x + 46}
                y2={y + 6}
                stroke="#c4473a"
                strokeWidth={5}
              />
            );
          })}
        </g>
      </svg>
    </AbsoluteFill>
  );
};
const S63: React.FC = () => {
  const { f, L } = useShot('6.3');
  const n = Math.round(interpolate(f, [0, L('L112') + 10], [1, 120], clamp));
  return (
    <AbsoluteFill style={{ background: '#2b2535', alignItems: 'center', justifyContent: 'center' }}>
      <div
        style={{
          fontFamily: FONT,
          fontWeight: 800,
          fontSize: 240,
          color: C.orange,
          WebkitTextStroke: '16px #15121a',
          paintOrder: 'stroke fill',
          transform: `scale(${1 + Math.sin(f / 4) * 0.02})`,
        }}
      >
        +{n} NGÀY
      </div>
      {f >= L('L113') && (
        <div
          style={{ fontFamily: FONT, fontWeight: 800, fontSize: 70, color: '#fff', marginTop: 20 }}
        >
          = 4 THÁNG
        </div>
      )}
    </AbsoluteFill>
  );
};
const S64: React.FC = () => {
  const { f, dur, L } = useShot('6.4');
  return (
    <Stage5
      set={classroom(f)}
      cam={cutCam(
        f,
        [
          { at: 0, a: { x: 500, y: 1060, z: 1.0 }, b: { x: 500, y: 1060, z: 1.06 } },
          { at: L('L116') - 2, a: faceCam(560, 1560, 1, 2.4), b: faceCam(560, 1560, 1, 2.7) },
        ],
        dur,
      )}
      f={f}
      actors={
        <>
          {[-300, 0, 1000, 1300].map((x, i) => (
            <Extra
              key={i}
              k={i + 1}
              x={x}
              y={1540}
              t={f + i * 7}
              facing={i < 2 ? 1 : -1}
              eyes="happy"
              lean={Math.sin(f / 5 + i) * 5}
            />
          ))}
          <Ban x={560} y={1560} t={f} eyes="half" age={AGE} />
        </>
      }
    />
  );
};
const S65: React.FC = () => {
  const { f, dur, L } = useShot('6.5');
  const tear = interpolate(f, [12, 36], [0, 1], clamp);
  return (
    <AbsoluteFill>
      <Stage5
        set={home(f, { tear, day: 14 })}
        cam={cutCam(
          f,
          [
            { at: 0, a: { x: 260, y: 820, z: 1.9 }, b: { x: 260, y: 820, z: 2.0 } },
            { at: L('L118') - 2, a: faceCam(420, 1500, 1, 2.3), b: faceCam(420, 1500, 1, 2.5) },
            { at: L('L119') - 2, a: { x: 560, y: 1060, z: 1.25 }, b: { x: 560, y: 1060, z: 1.3 } },
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
              facing={-1}
              pose="reach"
              handR={{ x: -150, y: -560 }}
              cane={false}
              eyes="happy"
            />
            <Ban x={820} y={1560} t={f} facing={-1} eyes="sad" age={AGE} />
          </>
        }
      />
      {f >= L('L118') && f < L('L119') && (
        <Pow text="81 TUỔI" x={520} y={260} from={L('L118')} f={f} size={110} color="#e8d4b0" />
      )}
    </AbsoluteFill>
  );
};
/** Calendar sheets fly from your hands and vanish; flash: eggs, copied notebook, the word "nè". */
const S66: React.FC = () => {
  const { f, L } = useShot('6.6');
  const flash =
    f >= L('L121') - 2
      ? f < L('L122') - 2
        ? '🥚 ĐỠ TRỨNG'
        : f < L('L123') - 2
          ? '📒 CHÉP BÀI'
          : '“NÈ”'
      : null;
  return (
    <AbsoluteFill style={{ background: '#2b2535' }}>
      <Stage5
        set={home(f)}
        cam={faceCam(700, 1560, 1, 1.6, 160)}
        f={f}
        blurBg={14}
        actors={<Ban x={700} y={1560} t={f} eyes="sad" pose="armsUp" age={AGE} />}
      />
      <svg width={1920} height={1080} style={{ position: 'absolute' }}>
        {Array.from({ length: 26 }, (_, i) => {
          const u = (f * 1.4 + i * 9) % 90;
          const x = 900 + Math.sin(i * 2.1) * 120 + u * (4 + (i % 5));
          const y = 520 - u * (3 + (i % 4)) + Math.sin(u / 8 + i) * 20;
          return (
            <g
              key={i}
              transform={`translate(${x},${y}) rotate(${u * 4 + i * 20})`}
              opacity={interpolate(u, [0, 10, 70, 90], [0, 1, 0.6, 0], clamp)}
            >
              <rect x={-30} y={-38} width={60} height={76} rx={4} fill="#efe7d6" />
              <rect x={-30} y={-38} width={60} height={18} rx={4} fill="#b2463a" />
              <text
                y={22}
                textAnchor="middle"
                fontFamily={FONT}
                fontWeight={800}
                fontSize={30}
                fill="#c4473a"
              >
                {((i * 7) % 30) + 1}
              </text>
            </g>
          );
        })}
      </svg>
      {flash && (
        <Pow
          text={flash}
          x={480}
          y={300}
          from={L(f < L('L122') - 2 ? 'L121' : f < L('L123') - 2 ? 'L122' : 'L123')}
          f={f}
          size={110}
          color="#fff"
        />
      )}
    </AbsoluteFill>
  );
};
const S67: React.FC = () => {
  const { f, L } = useShot('6.7');
  return (
    <AbsoluteFill>
      <Stage5
        set={home(f)}
        cam={faceCam(700, 1560, 1, 2.2 + f * 0.003, 100)}
        f={f}
        actors={<Ban x={700} y={1560} t={f} eyes="squint" pose="hold" age={AGE} />}
      />
      <BigText
        lines={['KHÔNG DỪNG NỮA.', 'KHÔNG BAO GIỜ NỮA.']}
        from={L('L125')}
        f={f}
        y={150}
        size={110}
        color="#d8d4e4"
        accent={[1]}
      />
    </AbsoluteFill>
  );
};
const S68: React.FC = () => {
  const { f, L } = useShot('6.8');
  const seg = f < L('L128') - 2 ? 0 : f < L('L129') - 2 ? 1 : f < L('L130') - 2 ? 2 : 3;
  if (seg === 0) {
    const fall = interpolate(f, [6, 24], [0, 1], clamp);
    return (
      <Stage5
        set={home(f)}
        cam={{ x: 640, y: 1200, z: 1.8 }}
        f={f}
        actors={
          <>
            <Ban
              x={820}
              y={1560}
              t={f}
              facing={-1}
              eyes="half"
              pose="hold"
              handR={{ x: 20, y: -250 }}
              handL={{ x: -60, y: -250 }}
              age={AGE}
            />
            {fall < 1 ? (
              <path
                d={`M600 ${1100 + fall * 380} l40 0 l-6 70 l-28 0 Z`}
                fill="#cfe6ee"
                opacity={0.8}
              />
            ) : (
              Array.from({ length: 8 }, (_, i) => (
                <path key={i} d={`M${560 + i * 18} 1500 l12 -16 l10 18 Z`} fill="#cfe6ee" />
              ))
            )}
          </>
        }
      />
    );
  }
  if (seg === 1) {
    const bx = interpolate(f, [L('L128'), L('L129') - 2], [-200, 1500], clamp);
    return (
      <Stage5
        set={yardField(f)}
        cam={{ x: 600, y: 1040, z: 1.1 }}
        f={f}
        actors={
          <>
            <Ban
              x={600}
              y={1560}
              t={f}
              facing={0}
              eyes="half"
              pose="hold"
              handR={{ x: 20, y: -250 }}
              handL={{ x: -60, y: -250 }}
              age={AGE}
            />
            <circle
              cx={bx}
              cy={760 - Math.sin(((bx + 200) / 1700) * Math.PI) * 200}
              r={24}
              fill="#f2f2f2"
              stroke="#333"
              strokeWidth={4}
            />
          </>
        }
      />
    );
  }
  return (
    <AbsoluteFill>
      <Stage5
        set={classroom(f)}
        cam={cutCam(
          f,
          [{ at: 0, a: faceCam(560, 1540, 1, 2.2), b: faceCam(560, 1540, 1, 2.4) }],
          300,
        )}
        f={f}
        actors={
          <>
            <Co x={-200} y={1480} t={f} facing={1} eyes="normal" />
            <Ban
              x={560}
              y={1540}
              t={f}
              facing={-1}
              eyes={seg === 3 ? 'squint' : 'half'}
              pose="hold"
              handR={{ x: 20, y: -250 }}
              handL={{ x: -60, y: -250 }}
              age={AGE}
            />
          </>
        }
      />
      {seg === 2 && <Pow text="EM KHÔNG BIẾT." x={560} y={300} from={L('L129')} f={f} size={100} />}
    </AbsoluteFill>
  );
};
/** Grandpa tears the calendar in early sunlight – long hold. */
const S69: React.FC = () => {
  const { f, dur, L } = useShot('6.9');
  const tear = interpolate(f, [L('L132') + 10, L('L132') + 34], [0, 1], clamp);
  return (
    <Stage5
      set={home(f, { tear, day: 9 })}
      cam={cutCam(
        f,
        [
          { at: 0, a: { x: 300, y: 900, z: 1.4 }, b: { x: 300, y: 900, z: 1.5 } },
          { at: L('L133') - 2, a: faceCam(820, 1560, 1, 2.4), b: faceCam(820, 1560, 1, 2.5) },
          {
            at: L('L134') - 2,
            a: faceCam(420, 1500, 1, 2.2),
            b: faceCam(420, 1500, 1, 3.0),
            hold: true,
          },
        ],
        dur,
      )}
      f={f}
      actors={
        <>
          <ellipse
            cx={300}
            cy={760}
            rx={420}
            ry={360}
            fill="#ffe0a8"
            opacity={0.3}
            style={{ filter: 'blur(40px)' }}
          />
          <Ong
            x={420}
            y={1500}
            t={f}
            facing={f >= L('L134') ? 1 : -1}
            pose={f < L('L133') ? 'reach' : 'stand'}
            handR={f < L('L133') ? { x: -150, y: -560 } : undefined}
            cane={false}
            eyes={f >= L('L134') ? 'happy' : 'normal'}
          />
          <Ban x={820} y={1560} t={f} facing={-1} eyes="normal" age={AGE} />
        </>
      }
    />
  );
};

// ───────── 7. Friday night ─────────
const ONG = { x: 160, y: 1540 };
const S71: React.FC = () => {
  const { f, dur } = useShot('7.1');
  return (
    <Stage5
      set={dinner(f)}
      cam={cutCam(
        f,
        [{ at: 0, a: { x: 360, y: 1000, z: 0.95 }, b: { x: 380, y: 1000, z: 1.02 } }],
        dur,
      )}
      f={f}
      actors={
        <>
          <Ong x={ONG.x} y={ONG.y} t={f} facing={1} pose="pray" cane={false} eyes="happy" />
          <Ba x={840} y={1540} t={f} facing={-1} eyes="happy" />
          <Me x={1080} y={1540} t={f} facing={-1} eyes="normal" />
          <Ban x={500} y={1580} t={f} facing={0} back pose="sitChair" age={AGE} />
        </>
      }
    />
  );
};
const S72: React.FC = () => {
  const { f, dur, L } = useShot('7.2');
  const shake = f >= L('L139') ? Math.sin(f * 2.4) * 6 : 0;
  return (
    <Stage5
      set={dinner(f)}
      cam={cutCam(
        f,
        [
          { at: 0, a: faceCam(ONG.x, ONG.y, 1, 2.2, 60), b: faceCam(ONG.x, ONG.y, 1, 2.3, 60) },
          {
            at: L('L139') - 2,
            a: { x: ONG.x + 170, y: ONG.y - 330, z: 3.2 },
            b: { x: ONG.x + 170, y: ONG.y - 330, z: 3.4 },
          },
        ],
        dur,
      )}
      f={f}
      actors={
        <>
          <Ong
            x={ONG.x}
            y={ONG.y}
            t={f}
            facing={1}
            pose="hold"
            handR={{ x: 170 + shake, y: -360 }}
            handL={{ x: 100, y: -300 }}
            cane={false}
            eyes="normal"
          />
          <path
            d={`M${ONG.x + 140 + shake} ${ONG.y - 350} q30 -40 70 0 Z`}
            fill="#e6dccb"
            transform={`rotate(180 ${ONG.x + 175} ${ONG.y - 352})`}
          />
        </>
      }
    />
  );
};
const S73: React.FC = () => {
  const { f, dur, L } = useShot('7.3');
  const drop = interpolate(f, [4, 16], [0, 1], clamp);
  return (
    <Stage5
      set={dinner(f)}
      cam={cutCam(
        f,
        [
          { at: 0, a: { x: 360, y: 1180, z: 2.0 }, b: { x: 360, y: 1180, z: 2.05 } },
          { at: L('L141') - 2, a: faceCam(ONG.x, ONG.y, 1, 2.4), b: faceCam(ONG.x, ONG.y, 1, 2.6) },
          { at: L('L143') - 2, a: faceCam(ONG.x, ONG.y, 1, 3.2), b: faceCam(ONG.x, ONG.y, 1, 3.4) },
        ],
        dur,
      )}
      f={f}
      shake={f >= 14 && f < 24 ? 5 : 0}
      actors={
        <>
          <Ong
            x={ONG.x}
            y={ONG.y}
            t={f}
            facing={1}
            pose="stand"
            cane={false}
            eyes={f >= L('L143') ? 'droop' : 'wide'}
            shiver={0.6}
            lean={8}
          />
          <path
            d={`M${300 + drop * 60} ${1000 + drop * 230} q30 -40 70 0 Z`}
            fill="#e6dccb"
            transform={`rotate(${drop * 200} ${335 + drop * 60} ${1000 + drop * 230})`}
          />
          {drop >= 1 && <ellipse cx={380} cy={1250} rx={70} ry={10} fill="#f2ead8" />}
        </>
      }
    />
  );
};
const S74: React.FC = () => {
  const { f, dur } = useShot('7.4');
  return (
    <Stage5
      set={dinner(f)}
      cam={cutCam(
        f,
        [{ at: 0, a: faceCam(840, 1540, 1.18, 2.2), b: faceCam(840, 1540, 1.18, 2.4) }],
        dur,
      )}
      f={f}
      shake={6}
      actors={
        <Ba x={840} y={1540 - Math.min(40, f * 6)} t={f} facing={-1} eyes="wide" pose="armsUp" />
      }
    />
  );
};
const S75: React.FC = () => {
  const { f, dur } = useShot('7.5');
  return (
    <Stage5
      set={dinner(f)}
      cam={cutCam(
        f,
        [{ at: 0, a: faceCam(840, 1540, 1.18, 2.5), b: faceCam(840, 1540, 1.18, 2.7) }],
        dur,
      )}
      f={f}
      actors={
        <Ba
          x={840}
          y={1540}
          t={f}
          facing={-1}
          eyes="wide"
          pose="hold"
          itemR="phone"
          handR={{ x: -40, y: -440 }}
          shiver={0.6}
        />
      }
    />
  );
};
const S76: React.FC = () => {
  const { f, L } = useShot('7.6');
  return (
    <AbsoluteFill>
      <Stage5
        set={dinner(f)}
        cam={faceCam(840, 1540, 1.18, 2.2)}
        f={f}
        actors={
          <Ba
            x={840}
            y={1540}
            t={f}
            facing={-1}
            eyes="sad"
            pose="hold"
            itemR="phone"
            handR={{ x: -40, y: -440 }}
          />
        }
      />
      <BigText
        lines={['XE CẤP CỨU: 25 PHÚT']}
        from={L('L149')}
        f={f}
        y={150}
        size={110}
        color="#ff7a6a"
      />
    </AbsoluteFill>
  );
};
const S77: React.FC = () => {
  const { f, L } = useShot('7.7');
  return (
    <AbsoluteFill
      style={{
        background: '#262c38',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 24,
      }}
    >
      {f < L('L151') - 2 ? (
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
          <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 70, color: '#fff' }}>
            Đột quỵ – MỖI PHÚT:
          </div>
          <div
            style={{
              fontFamily: FONT,
              fontWeight: 800,
              fontSize: 150,
              color: '#ff7a6a',
              WebkitTextStroke: '12px #15121a',
              paintOrder: 'stroke fill',
            }}
          >
            ~2 TRIỆU TẾ BÀO NÃO
          </div>
          {f >= L('L152') && (
            <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 90, color: '#ffc83a' }}>
              × 25 PHÚT
            </div>
          )}
        </>
      )}
    </AbsoluteFill>
  );
};
const S78: React.FC = () => {
  const { f } = useShot('7.8');
  const k = interpolate(f, [6, 50], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ background: '#3f4a5a' }}>
      <svg width={1920} height={1080}>
        {Array.from({ length: 12 }, (_, i) => (
          <line
            key={i}
            x1={0}
            y1={90 * i}
            x2={1920}
            y2={90 * i + 120}
            stroke="#55607a"
            strokeWidth={8}
          />
        ))}
        <path
          d="M300 820 C700 760 900 560 1200 500 S1550 300 1620 260"
          stroke="#f3e2c2"
          strokeWidth={12}
          fill="none"
          strokeDasharray={`${1700 * k} 2000`}
        />
        <g transform="translate(300,820)">
          <circle r={40} fill={C.orange} />
          <text
            y={100}
            textAnchor="middle"
            fontFamily={FONT}
            fontWeight={800}
            fontSize={48}
            fill="#fff"
          >
            NHÀ
          </text>
        </g>
        <g transform="translate(1620,260)">
          <rect x={-50} y={-50} width={100} height={100} rx={14} fill="#c4302a" />
          <text
            y={18}
            textAnchor="middle"
            fontFamily={FONT}
            fontWeight={800}
            fontSize={60}
            fill="#fff"
          >
            +
          </text>
          <text
            y={110}
            textAnchor="middle"
            fontFamily={FONT}
            fontWeight={800}
            fontSize={44}
            fill="#fff"
          >
            BỆNH VIỆN
          </text>
        </g>
        <text
          x={960}
          y={560}
          textAnchor="middle"
          fontFamily={FONT}
          fontWeight={800}
          fontSize={120}
          fill="#ffc83a"
          stroke="#15121a"
          strokeWidth={10}
          paintOrder="stroke"
          opacity={k}
        >
          2 KM
        </text>
      </svg>
    </AbsoluteFill>
  );
};
const S79: React.FC = () => {
  const { f, dur, L } = useShot('7.9');
  return (
    <Stage5
      set={dinner(f)}
      cam={cutCam(
        f,
        [
          { at: 0, a: faceCam(500, 1580, 1, 2.6, -40), b: faceCam(500, 1580, 1, 2.8, -40) },
          { at: L('L155') - 2, a: faceCam(ONG.x, ONG.y, 1, 2.8), b: faceCam(ONG.x, ONG.y, 1, 3.0) },
          {
            at: L('L157') - 2,
            a: faceCam(500, 1580, 1, 2.4, -40),
            b: faceCam(500, 1580, 1, 3.0, -40),
            hold: true,
          },
        ],
        dur,
      )}
      f={f}
      actors={
        <>
          <Ong
            x={ONG.x}
            y={ONG.y}
            t={f}
            facing={1}
            cane={false}
            eyes="droop"
            lean={10}
            shiver={0.4}
          />
          <Ban
            x={500}
            y={1580}
            t={f}
            facing={-1}
            eyes={f >= L('L157') ? 'squint' : 'wide'}
            age={AGE}
          />
        </>
      }
    />
  );
};
const S710: React.FC = () => {
  const { f, at } = useShot('7.10');
  return (
    <AbsoluteFill style={{ background: '#2b2535' }}>
      <ClapECU f={f} at={at('L159', 'vỗ tay')} />
    </AbsoluteFill>
  );
};

export const ACT67: Record<string, ShotDef> = {
  '6.1': { C: S61, amb: 'home' },
  '6.2': { C: S62, amb: 'home', fx: () => [hit('pencil_marks', 2, 0.6)] },
  '6.3': {
    C: S63,
    amb: 'rules',
    fx: () => Array.from({ length: 12 }, (_, i) => hit('day_tick', i * 4, 0.3)),
  },
  '6.4': { C: S64, amb: 'class' },
  '6.5': { C: S65, amb: 'home', fx: () => [hit('calendar_tear', 12, 0.9)] },
  '6.6': {
    C: S66,
    amb: 'home',
    fx: () => [hit('paper_flutter', 0, 0.6), hit('paper_flutter', 40, 0.5)],
  },
  '6.7': { C: S67, amb: 'home', fx: (h) => [hit('whoosh_ui', h.L('L125'), 0.4)] },
  '6.8': {
    C: S68,
    amb: 'home',
    fx: (h) => [hit('glass_break', 24, 0.7), hit('whoosh', h.L('L128'), 0.5)],
  },
  '6.9': { C: S69, amb: 'home', fx: (h) => [hit('calendar_tear', h.L('L132') + 10, 0.9)] },
  '7.1': { C: S71, amb: 'dinner' },
  '7.2': { C: S72, amb: 'dinner' },
  '7.3': { C: S73, amb: 'dinner', fx: () => [hit('bowl_drop', 14, 0.9)] },
  '7.4': { C: S74, amb: 'dinner', fx: () => [hit('chair_scrape', 0, 0.7)] },
  '7.5': { C: S75, amb: 'dinner', fx: () => [hit('phone_dial', 4, 0.6)] },
  '7.6': { C: S76, amb: 'dinner', fx: (h) => [hit('whoosh_ui', h.L('L149'), 0.4)] },
  '7.7': { C: S77, amb: 'rules', fx: () => [hit('whoosh_ui', 0, 0.5)] },
  '7.8': { C: S78, amb: 'dinner', fx: () => [hit('whoosh_ui', 6, 0.4)] },
  '7.9': { C: S79, amb: 'dinner' },
  '7.10': { C: S710, amb: 'dinner' },
};
