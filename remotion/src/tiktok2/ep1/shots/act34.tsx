import React from 'react';
import { AbsoluteFill, interpolate, random } from 'remotion';
import { invis } from '../Character';
import { Ban, Bin, bodyCam, clamp, faceCam, hit, Huy, loopFor, ShotDef } from '../kit';
import { livingRoom, minimal, schoolYard } from '../sets';
import { SetStage } from '../SetStage';
import { cutCam, WIDE } from '../Stage';
import { C, FONT } from '../theme';
import { tr, useShot } from '../time';
import { BigText, BreathRing, IconBubble, Lungs, PortraitBox, Pow, SpeechBubble } from '../ui';

const R = { x: 500, y: 1560, s: 1.15 };
const rules = minimal('#4b4159', '#2b2535');

/** Small icon (drawn inside a bubble). */
const IconLungs = () => (
  <path
    d="M-8 -40 L-8 -10 Q-30 -40 -50 -10 Q-60 30 -40 40 Q-15 45 -8 20 Z M8 -40 L8 -10 Q30 -40 50 -10 Q60 30 40 40 Q15 45 8 20 Z"
    fill="#f2b3ad"
  />
);
const IconEyeOff = () => (
  <g>
    <path d="M-50 0 Q0 -40 50 0 Q0 40 -50 0 Z" fill="#f6f1e6" />
    <circle r={14} fill="#3a3346" />
    <line
      x1={-46}
      y1={-40}
      x2={46}
      y2={40}
      stroke="#ff4a3a"
      strokeWidth={10}
      strokeLinecap="round"
    />
  </g>
);
const IconClock = () => (
  <g>
    <circle r={44} fill="#f6f1e6" />
    <line x1={0} y1={0} x2={0} y2={-30} stroke="#3a3346" strokeWidth={8} strokeLinecap="round" />
    <line x1={0} y1={0} x2={22} y2={10} stroke="#3a3346" strokeWidth={8} strokeLinecap="round" />
  </g>
);
const IconTalk = () => (
  <path
    d="M-44 -30 Q-44 -44 -30 -44 L30 -44 Q44 -44 44 -30 L44 10 Q44 24 30 24 L-6 24 L-26 44 L-22 24 L-30 24 Q-44 24 -44 10 Z"
    fill="#f6f1e6"
  />
);

// ───────── 3.1 "Luật thế này" ─────────
const S31: React.FC = () => {
  const { f, dur } = useShot('3.1');
  return (
    <SetStage
      set={rules}
      cam={cutCam(
        f,
        [{ at: 0, a: { ...WIDE, y: 900, z: 1.05 }, b: { ...WIDE, y: 900, z: 1.12 } }],
        dur,
      )}
      f={f}
      actors={
        <>
          <Ban x={R.x} y={R.y} size={R.s} t={f} eyes="normal" pose="shrug" />
          <IconBubble x={180} y={760} from={2} f={f}>
            <IconLungs />
          </IconBubble>
          <IconBubble x={820} y={720} from={6} f={f}>
            <IconEyeOff />
          </IconBubble>
          <IconBubble x={230} y={1180} from={10} f={f}>
            <IconTalk />
          </IconBubble>
          <IconBubble x={790} y={1140} from={14} f={f}>
            <IconClock />
          </IconBubble>
        </>
      }
    />
  );
};

// ───────── 3.2 Holding breath = vanish – hoodie, sandals, bag too ─────────
const Tag: React.FC<{
  x: number;
  y: number;
  tx: number;
  ty: number;
  text: string;
  from: number;
  f: number;
}> = ({ x, y, tx, ty, text, from, f }) => {
  const k = interpolate(f, [from, from + 8], [0, 1], clamp);
  if (k <= 0) return null;
  return (
    <g opacity={k}>
      <line
        x1={x}
        y1={y}
        x2={x + (tx - x) * k}
        y2={y + (ty - y) * k}
        stroke="#fff"
        strokeWidth={4}
        strokeDasharray="10 8"
      />
      <circle cx={x} cy={y} r={9} fill="#fff" />
      <text
        x={tx}
        y={ty}
        textAnchor="middle"
        fontFamily={FONT}
        fontWeight={800}
        fontSize={56}
        fill="#fff"
        stroke="#15121a"
        strokeWidth={10}
        paintOrder="stroke"
      >
        {text}
      </text>
    </g>
  );
};
const S32: React.FC = () => {
  const { f, dur, at, L } = useShot('3.2');
  const v = at('L033', 'biến');
  const iv = invis(f, [[v, 'vanish']]);
  const cam = cutCam(
    f,
    [
      { at: 0, a: { ...WIDE, y: 920, z: 1.15 }, b: { ...WIDE, y: 920, z: 1.25 } },
      { at: L('L034') - 2, a: faceCam(R.x, R.y, R.s, 2.4), b: faceCam(R.x, R.y, R.s, 2.6) },
      {
        at: L('L035') - 2,
        a: { x: 520, y: 1100, z: 1.3 },
        b: { x: 520, y: 1110, z: 1.4 },
        hold: true,
      },
    ],
    dur,
  );
  const tL = L('L035');
  return (
    <SetStage
      set={rules}
      cam={cam}
      f={f}
      actors={
        <>
          <Ban
            x={R.x}
            y={R.y}
            size={R.s}
            t={f}
            eyes={f < v ? 'squint' : 'squint'}
            puff={interpolate(f, [0, v], [0.3, 1], clamp)}
            itemR="bag"
            pose="hold"
            {...iv}
            px={cam.z}
          />
          <Tag
            x={R.x - 40}
            y={R.y - 300}
            tx={180}
            ty={900}
            text={tr('ÁO', 'HOODIE')}
            from={at('L035', 'quần')}
            f={f}
          />
          <Tag
            x={R.x - 40}
            y={R.y - 10}
            tx={190}
            ty={1380}
            text={tr('DÉP', 'SANDALS')}
            from={at('L035', 'dép')}
            f={f}
          />
          <Tag
            x={R.x + 150}
            y={R.y - 300}
            tx={800}
            ty={980}
            text={tr('CẶP', 'BAG')}
            from={at('L035', 'cặp')}
            f={f}
          />
          {f > tL && null}
        </>
      }
    />
  );
};

// ───────── 3.3 Breathing out = reappear · talking is breathing out too ─────────
const Puff: React.FC<{ x: number; y: number; from: number; f: number; dir?: number }> = ({
  x,
  y,
  from,
  f,
  dir = 1,
}) => {
  const u = f - from;
  if (u < 0 || u > 24) return null;
  return (
    <g opacity={interpolate(u, [0, 6, 24], [0, 0.8, 0], clamp)}>
      {[0, 1, 2].map((i) => (
        <circle
          key={i}
          cx={x + dir * (30 + u * 5 + i * 26)}
          cy={y - i * 10 - u}
          r={14 + i * 6 + u * 0.8}
          fill="#eef3f8"
        />
      ))}
    </g>
  );
};
const S33: React.FC = () => {
  const { f, dur, at, L } = useShot('3.3');
  const p = at('L036', 'thở') + 6;
  const iv = invis(f, [[p, 'appear']], true);
  const talk = L('L037');
  const cam = cutCam(
    f,
    [
      { at: 0, a: bodyCam(R.x, R.y, R.s, 1.35), b: bodyCam(R.x, R.y, R.s, 1.45) },
      { at: talk - 2, a: faceCam(R.x, R.y, R.s, 2.3), b: faceCam(R.x, R.y, R.s, 2.6) },
    ],
    dur,
  );
  const hy = R.y - 470 * R.s;
  return (
    <SetStage
      set={rules}
      cam={cam}
      f={f}
      actors={
        <>
          <Ban
            x={R.x}
            y={R.y}
            size={R.s}
            t={f}
            eyes={f < p ? 'squint' : f < talk ? 'happy' : 'normal'}
            puff={f < p ? 1 : 0}
            itemR="bag"
            pose="hold"
            {...iv}
            px={cam.z}
          />
          <Puff x={R.x + 60} y={hy + 40} from={p - 2} f={f} />
          {[0, 1, 2].map((k) => (
            <Puff key={k} x={R.x + 60} y={hy + 50} from={talk + 4 + k * 12} f={f} />
          ))}
        </>
      }
    />
  );
};

// ───────── 3.4 Cannot talk · "NHỚ CHI TIẾT NÀY" ─────────
const S34: React.FC = () => {
  const { f, dur, at, L } = useShot('3.4');
  const iv = invis(f, [[4, 'vanish']]);
  const cross = interpolate(f, [at('L038', 'không'), at('L038', 'không') + 14], [0, 1], clamp);
  const cam = cutCam(
    f,
    [
      { at: 0, a: { x: 560, y: 900, z: 1.3 }, b: { x: 560, y: 900, z: 1.4 } },
      { at: L('L039') - 2, a: { x: 640, y: 760, z: 1.75 }, b: { x: 640, y: 760, z: 1.9 } },
      { at: L('L040') - 2, a: { x: 520, y: 980, z: 1.15 }, b: { x: 520, y: 980, z: 1.2 } },
    ],
    dur,
  );
  return (
    <AbsoluteFill>
      <SetStage
        set={rules}
        cam={cam}
        f={f}
        shake={f >= at('L038', 'không') && f < at('L038', 'không') + 10 ? 5 : 0}
        actors={
          <>
            <Ban x={R.x - 80} y={R.y} size={R.s} t={f} eyes="squint" puff={1} {...iv} px={cam.z} />
            <SpeechBubble x={800} y={1000} s={1} crossed={cross} text="..." />
          </>
        }
      />
      <BigText
        lines={[tr('NHỚ CHI TIẾT NÀY', 'REMEMBER THIS')]}
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

// ───────── 3.5 "Chuyện này là thật" · 30 s – 60 s ─────────
const S35: React.FC = () => {
  const { f, dur, at, L } = useShot('3.5');
  const a = at('L043', 'ba mươi');
  const b = at('L043', 'một phút');
  const k = interpolate(f, [a, b + 10], [0, 1], clamp);
  const st = interpolate(f, [0, 6, 10], [2.2, 0.9, 1], clamp);
  return (
    <AbsoluteFill>
      <SetStage
        set={minimal('#3f4a5a', '#262c38')}
        cam={cutCam(
          f,
          [
            { at: 0, a: { ...WIDE, z: 1 }, b: { ...WIDE, z: 1.06 } },
            { at: L('L043') - 2, a: { ...WIDE, z: 1.08 }, b: { ...WIDE, z: 1.12 } },
          ],
          dur,
        )}
        f={f}
        actors={<Ban x={260} y={1640} size={0.9} t={f} eyes="normal" look={{ x: 0.6, y: -0.4 }} />}
      />
      <PortraitBox s={1} dy={420}>
        <svg width={1080} height={1920} style={{ position: 'absolute', overflow: 'visible' }}>
          <g
            transform={`translate(470,330) scale(${st}) rotate(-6)`}
            opacity={f < L('L043') + 30 ? 1 : 0.0}
          >
            <rect
              x={-250}
              y={-60}
              width={500}
              height={120}
              rx={20}
              fill="none"
              stroke="#ff7a1a"
              strokeWidth={10}
            />
            <text
              y={22}
              textAnchor="middle"
              fontFamily={FONT}
              fontWeight={800}
              fontSize={68}
              fill="#ff7a1a"
            >
              {tr('CHUYỆN THẬT', 'TRUE FACT')}
            </text>
          </g>
          <g transform="translate(110,720)">
            <text x={0} y={-40} fontFamily={FONT} fontWeight={800} fontSize={50} fill="#fff">
              {tr('Người bình thường nín thở', 'Most people hold their breath')}
            </text>
            <rect x={0} y={0} width={760} height={80} rx={40} fill="#ffffff" opacity={0.12} />
            <rect x={760 * 0.33} y={0} width={760 * 0.67 * k} height={80} rx={40} fill="#ffc83a" />
            {[0, 30, 60, 90].map((s, i) => (
              <g key={s} transform={`translate(${(i / 3) * 760},0)`}>
                <line x1={0} y1={90} x2={0} y2={120} stroke="#fff" strokeWidth={4} />
                <text
                  y={170}
                  textAnchor="middle"
                  fontFamily={FONT}
                  fontWeight={800}
                  fontSize={44}
                  fill="#fff"
                >
                  {s}s
                </text>
              </g>
            ))}
            <text
              x={760 * 0.66}
              y={56}
              textAnchor="middle"
              fontFamily={FONT}
              fontWeight={800}
              fontSize={46}
              fill="#2b2535"
              opacity={k}
            >
              30s – 60s
            </text>
          </g>
        </svg>
      </PortraitBox>
    </AbsoluteFill>
  );
};

// ───────── 3.6 Lungs – CO2 rising – warning ─────────
const S36: React.FC = () => {
  const { f, dur, at, L } = useShot('3.6');
  const level = interpolate(f, [L('L045'), L('L046')], [0.05, 0.85], clamp);
  const alarm = f >= at('L046', 'la') ? 1 : 0;
  const hero = L('L047');
  return (
    <AbsoluteFill>
      <SetStage
        set={minimal(alarm && Math.floor(f / 6) % 2 === 0 ? '#5a3a48' : '#4b4159', '#2b2535')}
        cam={cutCam(
          f,
          [
            { at: 0, a: { ...WIDE, z: 1 }, b: { ...WIDE, z: 1.05 } },
            { at: L('L045') - 2, a: { x: 500, y: 760, z: 1.2 }, b: { x: 500, y: 760, z: 1.28 } },
            { at: L('L046') - 2, a: { ...WIDE, z: 1.05 }, b: { ...WIDE, z: 1.1 } },
            { at: hero - 2, a: { ...WIDE, y: 940, z: 1.1 }, b: { ...WIDE, y: 920, z: 1.2 } },
          ],
          dur,
        )}
        f={f}
        shake={alarm && f < hero ? 3 : 0}
        actors={
          f < hero ? (
            <g transform="translate(500,820)">
              <Lungs f={f} level={level} alarm={alarm} />
              {f < L('L045') && (
                <text
                  x={0}
                  y={330}
                  textAnchor="middle"
                  fontFamily={FONT}
                  fontWeight={800}
                  fontSize={58}
                  fill="#fff"
                >
                  {tr('O₂ vẫn còn đủ ✓', 'O₂ still plenty ✓')}
                </text>
              )}
            </g>
          ) : (
            <>
              <Ban x={R.x} y={R.y} size={R.s} t={f} eyes="happy" pose="armsUp" />
              {Array.from({ length: 8 }, (_, i) => (
                <path
                  key={i}
                  d="M0 -30 L8 -8 L30 0 L8 8 L0 30 L-8 8 L-30 0 L-8 -8 Z"
                  fill="#ffd27a"
                  transform={`translate(${R.x + Math.cos(i) * 330},${R.y - 500 + Math.sin(i * 1.7) * 330}) scale(${0.6 + 0.4 * Math.sin(f / 5 + i)})`}
                />
              ))}
            </>
          )
        }
      />
      {f >= hero && (
        <BigText
          lines={[tr('SIÊU NĂNG LỰC', 'SUPERPOWER')]}
          from={hero + 2}
          f={f}
          y={330}
          size={100}
          color={C.orange}
        />
      )}
    </AbsoluteFill>
  );
};

// ───────── 3.7 has an expiry: 0:40 ring big in the centre ─────────
const S37: React.FC = () => {
  const { f, dur, L } = useShot('3.7');
  const sec = interpolate(f, [0, L('L049'), dur], [0, 32, 40], clamp);
  return (
    <AbsoluteFill>
      <SetStage
        set={minimal('#4b4159', '#2b2535')}
        cam={cutCam(f, [{ at: 0, a: { ...WIDE, z: 1 }, b: { ...WIDE, z: 1.1 } }], dur)}
        f={f}
        actors={<Ban x={R.x} y={1720} size={0.75} t={f} eyes="squint" puff={1} />}
      />
      <BreathRing sec={sec} cap={40} show={interpolate(f, [0, 8], [0, 1], clamp)} big f={f} />
      <Pow
        text={tr('HẠN DÙNG: ~40 GIÂY', 'EXPIRES: ~40 SEC')}
        x={500}
        y={1330}
        from={L('L049')}
        f={f}
        size={80}
        color="#ffc83a"
        rot={-3}
      />
    </AbsoluteFill>
  );
};

// ───────── Schoolyard + Huy ─────────
const HUY = { x: 420, y: 1500 };
const BAG = (x: number, y: number, rot = 0) => (
  <g transform={`translate(${x},${y}) rotate(${rot})`}>
    <path d="M-40 -60 Q-50 20 -30 40 L30 40 Q50 20 40 -60 Z" fill="#eef2f4" opacity={0.6} />
    <path d="M-34 -10 Q-40 30 -24 36 L24 36 Q40 30 34 -10 Z" fill="#e0904a" />
    {[-14, 4, 18].map((k) => (
      <circle key={k} cx={k} cy={6 + (k % 3)} r={6} fill="#c25a3a" />
    ))}
    <rect x={-6} y={-90} width={4} height={60} fill="#d8c8a8" transform="rotate(12)" />
  </g>
);

const S41: React.FC = () => {
  const { f, dur, at, L } = useShot('4.1');
  const drop = at('L052', 'đánh rơi');
  const laugh = at('L052', 'bật cười');
  const fall = interpolate(f, [drop, drop + 12], [0, 1], clamp);
  const cam = cutCam(
    f,
    [
      { at: 0, a: { x: 520, y: 900, z: 0.95 }, b: { x: 500, y: 920, z: 1.02 } },
      {
        at: L('L051') - 2,
        a: faceCam(HUY.x + 230, HUY.y - 40, 1, 2.6),
        b: faceCam(HUY.x + 230, HUY.y - 40, 1, 2.9),
      },
      {
        at: L('L052') - 2,
        a: bodyCam(HUY.x + 80, HUY.y, 1, 1.45),
        b: bodyCam(HUY.x + 80, HUY.y, 1, 1.55),
      },
      {
        at: drop - 2,
        a: { x: HUY.x + 60, y: HUY.y - 200, z: 2.2 },
        b: { x: HUY.x + 60, y: HUY.y - 160, z: 2.3 },
        hold: true,
      },
      {
        at: laugh - 2,
        a: faceCam(HUY.x + 230, HUY.y - 40, 1, 2.7),
        b: faceCam(HUY.x + 230, HUY.y - 40, 1, 3.1),
        hold: true,
      },
    ],
    dur,
  );
  const shaking = f >= laugh;
  return (
    <SetStage
      set={schoolYard(f)}
      cam={cam}
      f={f}
      actors={
        <>
          <Ban
            x={HUY.x + 230}
            y={HUY.y - 40}
            size={0.96}
            t={f}
            pose="sitChair"
            facing={-1}
            invisible={1}
            eyes={shaking || f < L('L052') ? 'happy' : 'normal'}
            shiver={shaking ? 2 : 0}
            px={cam.z}
          />
          <Huy
            x={HUY.x}
            y={HUY.y}
            t={f}
            pose="sitChair"
            facing={-1}
            eyes={f > drop ? 'wide' : 'happy'}
            handR={f < drop ? { x: -90, y: -260 } : { x: -110, y: -200 }}
          />
          {f < drop
            ? BAG(HUY.x - 90, HUY.y - 290)
            : BAG(HUY.x - 110 - fall * 30, HUY.y - 290 + fall * 280, fall * 80)}
          {fall >= 1 && (
            <g>
              {Array.from({ length: 9 }, (_, i) => (
                <circle
                  key={i}
                  cx={HUY.x - 160 + random(`btt${i}`) * 140}
                  cy={HUY.y + 6 - random(`btty${i}`) * 10}
                  r={7}
                  fill={i % 2 ? '#e0904a' : '#c25a3a'}
                />
              ))}
            </g>
          )}
        </>
      }
    />
  );
};

const S42: React.FC = () => {
  const { f, dur, L } = useShot('4.2');
  const pop = 4;
  const iv = invis(f, [[pop, 'appear']], true);
  const scream = L('L055');
  const jump = f >= scream ? Math.max(0, Math.sin(Math.min(Math.PI, (f - scream) / 7))) * 140 : 0;
  const cam = cutCam(
    f,
    [
      {
        at: 0,
        a: { x: HUY.x + 120, y: HUY.y - 420, z: 1.7 },
        b: { x: HUY.x + 120, y: HUY.y - 420, z: 1.85 },
      },
      {
        at: L('L054') - 2,
        a: { x: HUY.x + 110, y: HUY.y - 380, z: 2.2 },
        b: { x: HUY.x + 110, y: HUY.y - 380, z: 2.35 },
      },
      {
        at: scream - 2,
        a: { x: HUY.x, y: HUY.y - 380, z: 1.25 },
        b: { x: HUY.x, y: HUY.y - 380, z: 1.3 },
        hold: true,
      },
    ],
    dur,
  );
  return (
    <AbsoluteFill>
      <SetStage
        set={schoolYard(f)}
        cam={cam}
        f={f}
        shake={f >= scream && f < scream + 24 ? 9 : 0}
        actors={
          <>
            <Ban
              x={HUY.x + 230}
              y={HUY.y - 40}
              size={0.96}
              t={f}
              pose="sitChair"
              facing={-1}
              eyes={f < scream ? 'happy' : 'wide'}
              {...iv}
              px={cam.z}
            />
            <Huy
              x={HUY.x - (f >= scream ? 40 : 0)}
              y={HUY.y - jump}
              t={f}
              pose={f >= scream ? 'flail' : 'sitChair'}
              facing={f >= scream ? 0 : -1}
              eyes={f >= L('L054') ? 'wide' : 'normal'}
            />
          </>
        }
      />
      <Pow
        text={tr('ÁÁÁ!!', 'AAAH!!')}
        x={330}
        y={430}
        from={scream + 2}
        f={f}
        size={150}
        color={C.huy}
        rot={-10}
      />
    </AbsoluteFill>
  );
};

// ───────── 4.3 sneeze / yawn (quick cuts) ─────────
const S43: React.FC = () => {
  const { f, L } = useShot('4.3');
  const sneeze = L('L056');
  const p1 = L('L057');
  const yawn = L('L058');
  const p2 = L('L059');
  const worst = L('L060');
  const inYard = f < yawn - 2;
  const iv = invis(
    f,
    [
      [0, 'vanish'],
      [p1, 'appear'],
      [yawn - 2, 'vanish'],
      [p2, 'appear'],
    ],
    true,
  );
  const cam = inYard
    ? faceCam(500, 1520, 1.1, 2.3, 10)
    : f < worst - 2
      ? faceCam(560, 1520, 1.1, 2.0, 40)
      : faceCam(560, 1520, 1.1, 3.4, 10);
  const jerk =
    f >= sneeze + 8 && f < p1 + 4 ? interpolate(f, [sneeze + 8, p1, p1 + 4], [0, 14, 0], clamp) : 0;
  return (
    <AbsoluteFill>
      <SetStage
        set={inYard ? schoolYard(f) : livingRoom(f, { table: false })}
        cam={cam}
        f={f}
        shake={f >= p1 && f < p1 + 6 ? 6 : f >= p2 && f < p2 + 6 ? 6 : 0}
        actors={
          <Ban
            x={inYard ? 500 : 560}
            y={1520}
            size={1.1}
            t={f}
            lean={jerk}
            eyes={
              inYard ? (f < p1 ? 'squint' : 'wide') : f < p2 ? 'closed' : f < worst ? 'half' : 'sad'
            }
            pose={!inYard && f < p2 + 10 ? 'armsUp' : 'stand'}
            {...iv}
            px={cam.z}
          />
        }
      />
      {f >= p1 && f < yawn - 2 && (
        <Pow text={tr('HẮT XÌ!', 'ACHOO!')} x={480} y={420} from={p1} f={f} size={120} rot={-8} />
      )}
      {f >= p2 && f < worst && (
        <Pow text={tr('OÁP~', 'YAWN~')} x={480} y={420} from={p2} f={f} size={120} rot={6} />
      )}
    </AbsoluteFill>
  );
};

// ───────── 4.4 hiccups – blinking like Tết lights ─────────
const S44: React.FC = () => {
  const { f, dur, L, H } = useShot('4.4');
  const marks = ['L062', 'L063', 'L064', 'L065', 'L066'].map((id) => L(id));
  const hold = H('L067');
  const toggles: [number, 'vanish' | 'appear'][] = [[L('L061') + 6, 'vanish']];
  marks.forEach((m, i) => toggles.push([m, i % 2 === 0 ? 'appear' : 'vanish']));
  // in the hold: hiccups continue with the light rhythm
  for (let t = hold + 6, i = 0; t < dur - 4; t += 9, i++)
    toggles.push([t, i % 2 === 0 ? 'vanish' : 'appear']);
  toggles.sort((a, b) => a[0] - b[0]);
  const iv = invis(f, toggles);
  const visible = iv.invisible < 0.5;
  const cam = cutCam(
    f,
    [
      { at: 0, a: bodyCam(560, 1520, 1.1, 1.5), b: bodyCam(560, 1520, 1.1, 1.6) },
      { at: marks[2] - 2, a: { x: 520, y: 900, z: 1.05 }, b: { x: 520, y: 900, z: 1.1 } },
      {
        at: hold - 2,
        a: faceCam(560, 1520, 1.1, 2.4),
        b: faceCam(560, 1520, 1.1, 2.7),
        hold: true,
      },
    ],
    dur,
  );
  return (
    <SetStage
      set={livingRoom(f, { table: false, lights: (i) => (visible ? i % 2 === 0 : i % 2 === 1) })}
      cam={cam}
      f={f}
      actors={
        <Ban
          x={560}
          y={1520}
          size={1.1}
          t={f}
          eyes={visible ? 'wide' : 'squint'}
          {...iv}
          squash={iv.squash + (f % 9 < 2 ? 0.08 : 0)}
          px={cam.z}
        />
      }
    />
  );
};

// ───────── 4.5 Only one person: Bin ─────────
const S45: React.FC = () => {
  const { f, dur, L } = useShot('4.5');
  const cam = cutCam(
    f,
    [
      { at: 0, a: { x: 520, y: 980, z: 1.05 }, b: { x: 520, y: 990, z: 1.12 } },
      {
        at: L('L069') - 2,
        a: faceCam(560, 1520, 0.58, 2.6, -10),
        b: faceCam(560, 1520, 0.58, 2.9, -10),
      },
      { at: L('L070') - 2, a: bodyCam(560, 1520, 0.58, 1.9), b: bodyCam(560, 1520, 0.58, 2.05) },
    ],
    dur,
  );
  return (
    <AbsoluteFill>
      <SetStage
        set={livingRoom(f, { table: false })}
        cam={cam}
        f={f}
        actors={
          <>
            <Ban
              x={f < L('L069') - 2 ? 260 : -200}
              y={1490}
              size={1}
              t={f}
              invisible={f < L('L069') ? 1 : 0}
              eyes="half"
            />
            <Bin
              x={560}
              y={1520}
              t={f}
              eyes={f > L('L069') ? 'happy' : 'normal'}
              look={{ x: -0.5, y: 0 }}
              pose={f > L('L070') ? 'raise' : 'stand'}
            />
          </>
        }
      />
      <BigText
        lines={[tr('BIN – 5 TUỔI', 'BIN – 5 YEARS OLD')]}
        from={L('L070')}
        f={f}
        y={330}
        size={104}
        color={C.bin}
      />
    </AbsoluteFill>
  );
};

// ───────── 4.6 Hide and seek ─────────
const S46: React.FC = () => {
  const { f, dur, L } = useShot('4.6');
  const v = 8;
  const pop = L('L076');
  const iv = invis(f, [
    [v, 'vanish'],
    [pop, 'appear'],
  ]);
  const count = L('L073');
  const go = L('L074');
  const grab = L('L075');
  const binX = f < go ? 240 : interpolate(f, [go, grab - 4], [240, 640], clamp);
  const cam = cutCam(
    f,
    [
      { at: 0, a: { x: 540, y: 980, z: 1.0 }, b: { x: 540, y: 990, z: 1.08 } },
      {
        at: count - 2,
        a: faceCam(240, 1520, 0.58, 2.6, -20),
        b: faceCam(240, 1520, 0.58, 2.8, -20),
      },
      { at: go - 2, a: { x: 470, y: 1180, z: 1.3 }, b: { x: 560, y: 1180, z: 1.45 } },
      { at: grab - 2, a: { x: 680, y: 1180, z: 1.9 }, b: { x: 680, y: 1180, z: 2.0 } },
      { at: pop - 2, a: { x: 700, y: 1060, z: 1.5 }, b: { x: 700, y: 1060, z: 1.6 } },
    ],
    dur,
  );
  const n = Math.min(
    10,
    Math.max(1, Math.floor(interpolate(f, [count + 6, go - 4], [1, 10.9], clamp))),
  );
  return (
    <AbsoluteFill>
      <SetStage
        set={livingRoom(f, { table: false })}
        cam={cam}
        f={f}
        actors={
          <>
            <Ban
              x={760}
              y={1530}
              t={f}
              eyes={f >= pop ? 'wide' : 'squint'}
              puff={f < pop ? 1 : 0}
              {...iv}
              px={cam.z}
            />
            <Bin
              x={binX}
              y={1520}
              t={f}
              facing={f >= go ? 1 : 0}
              pose={f < go ? (f >= count ? 'coverEyes' : 'stand') : f < grab - 4 ? 'walk' : 'reach'}
              eyes={f >= grab ? 'happy' : 'closed'}
              handR={f >= grab - 4 ? { x: 150, y: -330 } : undefined}
            />
          </>
        }
      />
      {f >= count + 6 && f < go && (
        <Pow
          text={`${n}…`}
          x={330}
          y={520}
          from={count + 6}
          f={f}
          size={110}
          color={C.bin}
          rot={-4}
        />
      )}
      {f >= grab && f < pop && (
        <Pow
          text={tr('BẮT ĐƯỢC RỒI!', 'GOT YOU!')}
          x={470}
          y={460}
          from={grab}
          f={f}
          size={96}
          color={C.bin}
          rot={-5}
        />
      )}
    </AbsoluteFill>
  );
};

// ───────── 4.7 "Em đâu có thấy" · "anh nín thở to lắm" ─────────
const S47: React.FC = () => {
  const { f, dur, L, H } = useShot('4.7');
  const hold = H('L078');
  const cam = cutCam(
    f,
    [
      { at: 0, a: faceCam(560, 1520, 0.58, 3.0, -10), b: faceCam(560, 1520, 0.58, 3.4, -10) },
      { at: L('L078') - 2, a: { x: 640, y: 1150, z: 1.6 }, b: { x: 640, y: 1150, z: 1.7 } },
      { at: hold, a: faceCam(760, 1530, 1, 2.6), b: faceCam(760, 1530, 1, 2.9), hold: true },
    ],
    dur,
  );
  return (
    <SetStage
      set={livingRoom(f, { table: false })}
      cam={cam}
      f={f}
      actors={
        <>
          <Ban
            x={760}
            y={1530}
            t={f}
            facing={-1}
            eyes={f >= hold ? 'half' : 'normal'}
            look={{ x: -0.6, y: 0.4 }}
          />
          <Bin
            x={560}
            y={1520}
            t={f}
            facing={1}
            eyes="happy"
            pose={f > L('L078') ? 'point' : 'stand'}
            lean={-3}
          />
        </>
      }
    />
  );
};

export const ACT34: Record<string, ShotDef> = {
  '3.1': {
    C: S31,
    amb: 'rules',
    fx: () => [
      hit('whoosh_ui', 2, 0.6),
      hit('whoosh_ui', 6, 0.5),
      hit('whoosh_ui', 10, 0.5),
      hit('whoosh_ui', 14, 0.5),
    ],
  },
  '3.2': {
    C: S32,
    amb: 'rules',
    fx: (h) => [
      hit('inhale', h.at('L033', 'biến') - 18, 0.6),
      hit('shimmer', h.at('L033', 'biến'), 0.9),
      hit('whoosh_ui', h.at('L035', 'quần'), 0.4),
      hit('whoosh_ui', h.at('L035', 'dép'), 0.4),
      hit('whoosh_ui', h.at('L035', 'cặp'), 0.4),
    ],
  },
  '3.3': {
    C: S33,
    amb: 'rules',
    fx: (h) => [
      hit('pop', h.at('L036', 'thở') + 6, 1),
      hit('exhale', h.at('L036', 'thở') + 4, 0.5),
    ],
  },
  '3.4': {
    C: S34,
    amb: 'rules',
    fx: (h) => [
      hit('shimmer', 4, 0.6),
      hit('buzz', h.at('L038', 'không'), 0.8),
      hit('whoosh_ui', h.L('L040'), 0.6),
    ],
    capY: 950,
  },
  '3.5': {
    C: S35,
    amb: 'rules',
    fx: (h) => [
      hit('whoosh_ui', 0, 0.6),
      hit('tick', h.at('L043', 'ba mươi'), 0.6),
      hit('tick', h.at('L043', 'một phút'), 0.6),
    ],
    capY: 950,
  },
  '3.6': {
    C: S36,
    amb: 'rules',
    fx: (h) => [
      hit('bubbles', h.L('L045'), 0.7),
      hit('bubbles', h.L('L045') + 40, 0.6),
      loopFor('beep', h.at('L046', 'la'), h.L('L047'), 0.6, 2),
      hit('whoosh', h.L('L047'), 0.6),
      hit('sparkle', h.L('L047') + 4, 0.6),
    ],
  },
  '3.7': {
    C: S37,
    amb: 'rules',
    fx: (h) => [
      hit('whoosh_ui', 0, 0.6),
      ...Array.from({ length: Math.floor(h.dur / 30) }, (_, i) => hit('tick', 10 + i * 30, 0.6)),
    ],
    capY: 950,
  },
  '4.1': {
    C: S41,
    amb: 'yard',
    fx: (h) => [
      hit('bag_drop', h.at('L052', 'đánh rơi') + 10, 0.9),
      hit('cloth', h.at('L052', 'bật cười'), 0.4),
    ],
  },
  '4.2': {
    C: S42,
    amb: 'yard',
    fx: (h) => [
      hit('pop', 4, 1),
      hit('startle', h.L('L055') - 2, 0.8),
      hit('clatter', h.L('L055') + 4, 0.5),
    ],
  },
  '4.3': {
    C: S43,
    amb: 'yard',
    fx: (h) => [
      hit('pop', h.L('L057'), 1),
      hit('shimmer', h.L('L058') - 2, 0.4),
      hit('pop', h.L('L059'), 1),
    ],
  },
  '4.4': {
    C: S44,
    amb: 'living',
    fx: (h) => {
      const out = [hit('shimmer', h.L('L061') + 6, 0.5)];
      ['L062', 'L063', 'L064', 'L065', 'L066'].forEach((id, i) =>
        out.push(hit(i % 2 === 0 ? 'pop' : 'sparkle', h.L(id), 0.8)),
      );
      for (let t = h.H('L067') + 6, i = 0; t < h.dur - 4; t += 9, i++)
        out.push(hit(i % 2 === 0 ? 'sparkle' : 'pop', t, 0.6));
      return out;
    },
  },
  '4.5': { C: S45, amb: 'living', fx: (h) => [hit('whoosh_ui', h.L('L070'), 0.5)] },
  '4.6': {
    C: S46,
    amb: 'living',
    fx: (h) => [
      hit('shimmer', 8, 0.6),
      loopFor('steps_small_loop', h.L('L074'), h.L('L075') - 4, 0.7, 3),
      hit('cloth', h.L('L075'), 0.8),
      hit('pop', h.L('L076'), 1),
    ],
  },
  '4.7': { C: S47, amb: 'living' },
};
