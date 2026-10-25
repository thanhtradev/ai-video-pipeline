import React from 'react';
import { interpolate, random } from 'remotion';
import { C, clamp, desat, mix, shade } from './theme';

/**
 * TikTok 2 character: glossy black round head (~43% of height), radial gradient + thin cream rim light; the face is only two white eyes.
 * Hoodie with drawstrings, thin black tube arms/legs, round hands. Local coordinates: heels at (0,0), an adult is 600 tall (size = 1).
 */
export type Eyes =
  'normal' | 'squint' | 'half' | 'wide' | 'happy' | 'closed' | 'sad' | 'look' | 'droop';
export type Pose =
  | 'stand'
  | 'walk'
  | 'run'
  | 'sitChair'
  | 'sitGround'
  | 'lie'
  | 'raise'
  | 'armsUp'
  | 'coverEyes'
  | 'reach'
  | 'hold'
  | 'pray'
  | 'hug'
  | 'point'
  | 'shrug'
  | 'carry'
  | 'flail';
export type Item =
  | 'teapot'
  | 'duster'
  | 'starLantern'
  | 'bag'
  | 'paper'
  | 'phone'
  | 'detector'
  | 'cup'
  | 'lighter'
  | 'incense'
  | 'tray'
  | 'corn'
  | 'thumb'
  | 'cane'
  | 'chalk';
type P = { x: number; y: number };

export type CharacterProps = {
  readonly x?: number;
  readonly y?: number;
  readonly size?: number;
  readonly hoodieColor?: string;
  readonly eyes?: Eyes;
  /** 0 = fully visible · 1 = invisible (only a faint white outline) */
  readonly invisible?: number;
  readonly accessories?: readonly (
    | 'bun'
    | 'glassesRound'
    | 'glassesSquare'
    | 'cap'
    | 'aodai'
    | 'hoodUp'
    | 'backpack'
    | 'shirt'
    | 'ponytail'
    | 'clip'
    | 'gloves'
    | 'bob'
    | 'stetho'
  )[];
  /** messy hair: a few strands on top of the head (EP2) */
  readonly hair?: boolean;
  /** sleeve length (0…1, default 0.84 – smaller: shorter sleeve, wrist shows) */
  readonly sleeve?: number;
  /** shirt colour when the "shirt" accessory is worn */
  readonly shirtColor?: string;
  readonly pose?: Pose;
  /** -1 left · 0 front · 1 right */
  readonly facing?: number;
  readonly back?: boolean;
  /** frame used for breathing/blinking/walking */
  readonly t?: number;
  readonly seed?: number;
  readonly look?: P;
  readonly itemR?: Item;
  readonly itemL?: Item;
  readonly handR?: P;
  readonly handL?: P;
  /** squash and stretch (pop-in) */
  readonly squash?: number;
  readonly puff?: number;
  readonly flush?: number;
  /** 0…1: fades the hoodie colour */
  readonly fade?: number;
  readonly lean?: number;
  readonly speed?: number;
  readonly shadow?: boolean;
  readonly blink?: boolean;
  readonly shiver?: number;
  readonly rimSide?: number;
  readonly opacity?: number;
  readonly sparkle?: number;
  readonly lantern?: number;
  /** camera zoom factor (keeps outlines thin in close-ups) */
  readonly px?: number;
};

const HIP = -150;
const SHOULDER = -338;
const HEAD_Y = -468;
const HEAD_R = 130;

const handFor = (pose: Pose, side: 1 | -1, facing: number, ph: number): P => {
  const fx = facing === 0 ? side : facing;
  switch (pose) {
    case 'walk':
      return { x: side * 82 + Math.sin(ph + (side > 0 ? 0 : Math.PI)) * 34, y: -180 };
    case 'run':
      return {
        x: side * 70 + Math.sin(ph + (side > 0 ? 0 : Math.PI)) * 80,
        y: -230 - Math.cos(ph + (side > 0 ? 0 : Math.PI)) * 40,
      };
    case 'flail':
      return {
        x: side * 150 + Math.sin(ph * 1.5 + side) * 30,
        y: -470 + Math.cos(ph * 1.5 + side) * 60,
      };
    case 'raise':
      return side === 1 ? { x: 178, y: -620 } : { x: -84, y: -180 };
    case 'armsUp':
      return { x: side * 185, y: -590 };
    case 'coverEyes':
      return { x: side * 46, y: -470 };
    case 'reach':
      return side * fx > 0 || facing === 0 ? { x: fx * 215, y: -360 } : { x: side * 80, y: -190 };
    case 'hold':
      return { x: fx * 70 + side * 32, y: -275 };
    case 'pray':
      return { x: side * 10, y: -330 };
    case 'hug':
      return { x: side * 60, y: -250 };
    case 'point':
      return side * fx > 0 || facing === 0 ? { x: fx * 200, y: -420 } : { x: side * 80, y: -190 };
    case 'shrug':
      return { x: side * 130, y: -300 };
    case 'carry':
      return { x: fx * 60 + side * 40, y: -300 };
    case 'sitChair':
      return { x: side * 60 + fx * 40, y: -170 };
    case 'sitGround':
      return { x: side * 34 + fx * 100, y: -200 };
    case 'lie':
      return { x: side * 85, y: -190 };
    default:
      return { x: side * 88, y: -172 };
  }
};

const Item: React.FC<{ item: Item; p: P; fx: number; mode: 'solid' | 'line' }> = ({
  item,
  p,
  fx,
  mode,
}) => {
  const line = mode === 'line';
  const st = line ? { fill: 'none', stroke: '#fff', strokeWidth: 4 } : {};
  const f = (c: string) => (line ? 'none' : c);
  const g = (children: React.ReactNode) => (
    <g transform={`translate(${p.x},${p.y}) scale(${fx < 0 ? -1 : 1},1)`}>{children}</g>
  );
  switch (item) {
    case 'teapot':
      return g(
        <g {...st}>
          <ellipse cx={34} cy={10} rx={46} ry={38} fill={f('#d9d2c2')} />
          <path
            d="M78 0 Q104 -18 112 -30"
            stroke={line ? '#fff' : '#d9d2c2'}
            strokeWidth={12}
            fill="none"
            strokeLinecap="round"
          />
          <rect x={20} y={-34} width={28} height={10} rx={5} fill={f('#c7bfae')} />
          <ellipse cx={34} cy={-36} rx={8} ry={6} fill={f('#b5ad9b')} />
          {line ? null : (
            <path d="M8 -6 Q34 -14 60 -6" stroke="#8aa0a0" strokeWidth={5} fill="none" />
          )}
        </g>,
      );
    case 'cup':
      return g(<path d="M-6 -18 L30 -18 L26 14 Q12 22 -2 14 Z" fill={f('#e8e1d2')} {...st} />);
    case 'duster':
      return g(
        <g {...st}>
          <rect
            x={-5}
            y={-150}
            width={10}
            height={170}
            rx={5}
            fill={f('#a57a50')}
            transform="rotate(25)"
          />
          <g transform="rotate(25) translate(0,-150)">
            {Array.from({ length: 9 }, (_, i) => (
              <ellipse
                key={i}
                cx={(i - 4) * 9}
                cy={-40 - Math.abs(i - 4) * -4}
                rx={14}
                ry={46}
                fill={f(['#8b6f5c', '#6f5a4c', '#9c7f63'][i % 3])}
                transform={`rotate(${(i - 4) * 9})`}
              />
            ))}
          </g>
        </g>,
      );
    case 'starLantern':
      return g(
        <g {...st}>
          <line
            x1={0}
            y1={0}
            x2={40}
            y2={-120}
            stroke={line ? '#fff' : '#7a5a3a'}
            strokeWidth={6}
          />
          <g transform="translate(40,-60)">
            <path
              d="M0 -50 L14 -16 L50 -14 L22 8 L32 44 L0 24 L-32 44 L-22 8 L-50 -14 L-14 -16 Z"
              fill={f('#e8463a')}
              stroke={line ? '#fff' : '#ffd27a'}
              strokeWidth={3}
            />
            {line ? null : <circle r={14} fill="#ffe7a0" opacity={0.9} />}
          </g>
        </g>,
      );
    case 'bag':
      return g(
        <g {...st}>
          <rect x={-10} y={0} width={86} height={70} rx={14} fill={f('#5f6b7a')} />
          <path
            d="M14 0 Q34 -26 54 0"
            stroke={line ? '#fff' : '#4a5462'}
            strokeWidth={7}
            fill="none"
          />
          <rect x={0} y={22} width={66} height={14} rx={6} fill={f('#4f5967')} />
        </g>,
      );
    case 'paper':
      return g(
        <g {...st}>
          <rect
            x={-10}
            y={-70}
            width={90}
            height={118}
            rx={4}
            fill={f('#f4efe4')}
            transform="rotate(-8)"
          />
          {line ? null : (
            <circle
              cx={46}
              cy={-20}
              r={20}
              fill="none"
              stroke="#d23a2a"
              strokeWidth={4}
              transform="rotate(-8)"
            />
          )}
        </g>,
      );
    case 'phone':
      return g(<rect x={-6} y={-58} width={48} height={86} rx={10} fill={f('#2b2f38')} {...st} />);
    case 'detector':
      return g(
        <g {...st}>
          <rect x={-10} y={-40} width={64} height={46} rx={8} fill={f('#c9c19d')} />
          <circle cx={22} cy={-17} r={14} fill={f('#f2eedf')} />
          <line x1={22} y1={-17} x2={22} y2={-29} stroke="#333" strokeWidth={3} />
          <line x1={46} y1={-40} x2={60} y2={-90} stroke={line ? '#fff' : '#777'} strokeWidth={5} />
        </g>,
      );
    case 'lighter':
      return g(<rect x={-6} y={-30} width={22} height={40} rx={5} fill={f('#c44a3a')} {...st} />);
    case 'incense':
      return g(
        <g {...st}>
          {[-8, 0, 8].map((dx) => (
            <line
              key={dx}
              x1={dx}
              y1={0}
              x2={dx * 2}
              y2={-120}
              stroke={line ? '#fff' : '#b0603c'}
              strokeWidth={4}
            />
          ))}
        </g>,
      );
    case 'tray':
      return g(<rect x={-40} y={-10} width={130} height={16} rx={6} fill={f('#c9cdd2')} {...st} />);
    case 'corn':
      return g(
        <g {...st}>
          <ellipse cx={16} cy={-36} rx={14} ry={36} fill={f('#e2b64e')} />
          <path d="M4 -6 L16 20 L28 -6" fill={f('#7f8a4a')} />
        </g>,
      );
    case 'thumb':
      return g(<rect x={-6} y={-46} width={18} height={40} rx={9} fill={f(C.ink)} {...st} />);
    case 'cane':
      return g(
        <path
          d="M0 0 L8 170 M0 0 Q-4 -30 -30 -26"
          stroke={line ? '#fff' : '#6b5140'}
          strokeWidth={10}
          fill="none"
          strokeLinecap="round"
        />,
      );
    case 'chalk':
      return g(<rect x={-4} y={-30} width={10} height={34} rx={4} fill={f('#f4f2ea')} {...st} />);
    default:
      return null;
  }
};

/** Eyelid closure (blink) – every 3–5 s by seed. */
const blinkAmt = (t: number, seed: number) => {
  let k = 0;
  let start = 20 + random(`b${seed}-0`) * 60;
  while (start + 6 < t && k < 400) {
    k++;
    start += 90 + random(`b${seed}-${k}`) * 60;
  }
  const u = t - start;
  return u >= 0 && u < 6 ? Math.sin((u / 6) * Math.PI) : 0;
};

const EyesG: React.FC<{
  eyes: Eyes;
  blink: number;
  look: P;
  fx: number;
  line: boolean;
  scale: number;
  aodaiGlasses?: 'round' | 'square';
}> = ({ eyes, blink, look, fx, line, scale }) => {
  const ex = 38;
  const cy = HEAD_Y + 6 + look.y * 12;
  const cx = fx * 34 + look.x * 16;
  const white = line ? 'rgba(255,255,255,0.95)' : '#fbf8f1';
  const sw = 10 * scale;
  const pts = [-1, 1].map((s) => cx + s * ex);
  const open = 1 - blink * 0.92;
  switch (eyes) {
    case 'squint':
      return (
        <g stroke={white} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d={`M${pts[0] - 18} ${cy - 16} L${pts[0] + 8} ${cy} L${pts[0] - 18} ${cy + 16}`} />
          <path d={`M${pts[1] + 18} ${cy - 16} L${pts[1] - 8} ${cy} L${pts[1] + 18} ${cy + 16}`} />
        </g>
      );
    case 'happy':
      return (
        <g stroke={white} strokeWidth={sw} fill="none" strokeLinecap="round">
          {pts.map((x, i) => (
            <path key={i} d={`M${x - 18} ${cy + 6} Q${x} ${cy - 22} ${x + 18} ${cy + 6}`} />
          ))}
        </g>
      );
    case 'closed':
      return (
        <g stroke={white} strokeWidth={sw * 0.8} fill="none" strokeLinecap="round">
          {pts.map((x, i) => (
            <path key={i} d={`M${x - 17} ${cy + 2} Q${x} ${cy + 12} ${x + 17} ${cy + 2}`} />
          ))}
        </g>
      );
    case 'half':
    case 'sad':
      return (
        <g fill={white}>
          {pts.map((x, i) => {
            const tilt = eyes === 'sad' ? (i === 0 ? 1 : -1) * 6 : 0;
            const h = 22 * open;
            return (
              <path
                key={i}
                d={`M${x - 19} ${cy - 2 + tilt} L${x + 19} ${cy - 2 - tilt} Q${x + 19} ${cy + h} ${x} ${cy + h} Q${x - 19} ${cy + h} ${x - 19} ${cy - 2 + tilt} Z`}
              />
            );
          })}
        </g>
      );
    case 'wide':
      return (
        <g fill={white}>
          {pts.map((x, i) => (
            <ellipse key={i} cx={x + (i ? 4 : -4)} cy={cy - 4} rx={27} ry={38 * open} />
          ))}
          {line
            ? null
            : pts.map((x, i) => (
                <circle
                  key={`p${i}`}
                  cx={x + (i ? 4 : -4) + look.x * 6}
                  cy={cy - 4 + look.y * 8}
                  r={6}
                  fill={C.ink}
                />
              ))}
        </g>
      );
    case 'droop':
      return (
        <g fill={white}>
          <ellipse cx={pts[0]} cy={cy} rx={19} ry={27 * open} />
          <path
            d={`M${pts[1] - 19} ${cy + 6} L${pts[1] + 19} ${cy + 12} Q${pts[1] + 19} ${cy + 22} ${pts[1]} ${cy + 22} Q${pts[1] - 19} ${cy + 22} ${pts[1] - 19} ${cy + 6} Z`}
          />
        </g>
      );
    default:
      return (
        <g fill={white}>
          {pts.map((x, i) => (
            <ellipse key={i} cx={x} cy={cy} rx={eyes === 'look' ? 17 : 19} ry={27 * open} />
          ))}
        </g>
      );
  }
};

export const Character: React.FC<CharacterProps> = (p) => {
  const {
    x = 0,
    y = 0,
    size = 1,
    hoodieColor = C.orange,
    eyes = 'normal',
    invisible = 0,
    accessories = [],
    pose = 'stand',
    facing = 0,
    back = false,
    t = 0,
    seed = 1,
    look = { x: 0, y: 0 },
    squash = 0,
    puff = 0,
    flush = 0,
    fade = 0,
    lean = 0,
    speed = 1,
    shadow = true,
    blink = true,
    shiver = 0,
    rimSide = -1,
    opacity = 1,
    sparkle = 0,
    itemL,
    itemR,
    px = 1,
    hair = false,
    shirtColor = '#a9c4dc',
    sleeve = 0.84,
  } = p;
  const uid = `ch${seed}`;
  const fx = facing === 0 ? 0 : facing > 0 ? 1 : -1;
  const ph = (t / 30) * Math.PI * 2 * (pose === 'run' ? 2.6 : pose === 'flail' ? 2.2 : 1.7) * speed;
  const moving = pose === 'walk' || pose === 'run';
  const breath = Math.sin((t / 30) * Math.PI * 2 * 0.32 + seed) * 3.2;
  const bob = moving ? -Math.abs(Math.sin(ph)) * (pose === 'run' ? 26 : 10) : breath;
  const sh = shiver ? Math.sin(t * 2.7) * shiver * 3 : 0;
  const sit = pose === 'sitGround' ? 110 : 0;
  const color = desat(fade ? mix(hoodieColor, '#b9b2a8', fade * 0.55) : hoodieColor, fade * 0.5);
  const light = shade(color, 0.18);
  const dark = shade(color, -0.22);
  const bl = blink && eyes !== 'closed' ? blinkAmt(t, seed) : 0;
  const isAodai = accessories.includes('aodai');
  const shirt = accessories.includes('shirt');
  const hoodUp = accessories.includes('hoodUp');
  const sx = 1 + squash * 0.18 - puff * 0;
  const sy = 1 - squash * 0.22;

  // Leg: hip → knee → foot
  const legs = ([-1, 1] as const).map((s) => {
    const hip = { x: s * 24, y: HIP + sit + bob * 0.3 };
    let foot: P;
    let knee: P;
    if (pose === 'sitChair') {
      knee = { x: s * 22 + (fx || 1) * 95, y: HIP + 4 };
      foot = { x: s * 22 + (fx || 1) * 104, y: 0 };
    } else if (pose === 'sitGround') {
      knee = { x: s * 20 + (fx || 1) * 110, y: -175 };
      foot = { x: s * 20 + (fx || 1) * 175, y: 0 };
    } else if (moving) {
      const a = ph + (s > 0 ? 0 : Math.PI);
      const stride = pose === 'run' ? 60 : 30;
      foot = {
        x: s * 14 + (fx || 1) * Math.sin(a) * stride,
        y: -Math.max(0, Math.cos(a)) * (pose === 'run' ? 46 : 20),
      };
      knee = { x: (hip.x + foot.x) / 2 + (fx || 1) * 16, y: (hip.y + foot.y) / 2 };
    } else {
      foot = { x: s * 30, y: 0 };
      knee = { x: s * 28, y: (HIP + sit) / 2 };
    }
    return { s, hip, knee, foot };
  });

  const yOff = sit + bob + sh * 0;
  const shoulder = (s: 1 | -1): P => ({ x: s * 66, y: SHOULDER + yOff });
  const hand = (s: 1 | -1): P => {
    const o = s === 1 ? p.handR : p.handL;
    if (o) return o;
    const h = handFor(pose, s, fx, ph);
    return { x: h.x, y: h.y + yOff };
  };
  const arms = ([-1, 1] as const).map((s) => {
    const sp = shoulder(s);
    const hp = hand(s);
    const mx = (sp.x + hp.x) / 2;
    const my = (sp.y + hp.y) / 2;
    const dx = hp.x - sp.x;
    const dy = hp.y - sp.y;
    const len = Math.hypot(dx, dy) || 1;
    const bend = Math.max(0, 150 - len) * 0.5 * s;
    const el = { x: mx + (-dy / len) * bend * 0.6 + s * 6, y: my + (dx / len) * bend * 0.2 };
    const k = sleeve;
    const wrist = {
      x: sp.x + (hp.x - sp.x) * k + (el.x - mx) * 0.3,
      y: sp.y + (hp.y - sp.y) * k + (el.y - my) * 0.3,
    };
    return { s, sp, hp, el, wrist };
  });
  const frontSide: 1 | -1 = fx >= 0 ? 1 : -1;

  const draw = (mode: 'solid' | 'line') => {
    const line = mode === 'line';
    const lw = 4.2 / size;
    const S = (fill: string) =>
      line ? { fill: 'none', stroke: '#fff', strokeWidth: lw } : { fill };
    const limb = line ? '#fff' : C.ink;
    const torsoTop = SHOULDER - 14 + yOff;
    const hem = isAodai ? -40 : HIP + 12 + yOff * (sit ? 0.6 : 1);
    const torso = isAodai
      ? `M${-62} ${torsoTop + 10} Q0 ${torsoTop - 12} 62 ${torsoTop + 10} Q84 ${(torsoTop + hem) / 2} 88 ${hem} L-88 ${hem} Q-84 ${(torsoTop + hem) / 2} -62 ${torsoTop + 10} Z`
      : `M${-70} ${torsoTop + 22} Q-72 ${torsoTop} -40 ${torsoTop - 4} L40 ${torsoTop - 4} Q72 ${torsoTop} 70 ${torsoTop + 22} L86 ${hem - 18} Q88 ${hem} 70 ${hem} L-70 ${hem} Q-88 ${hem} -86 ${hem - 18} Z`;
    const armPath = (a: (typeof arms)[number]) =>
      `M${a.sp.x} ${a.sp.y} Q${a.el.x} ${a.el.y} ${a.wrist.x} ${a.wrist.y}`;
    const backArm = arms.find((a) => a.s !== frontSide)!;
    const frontArm = arms.find((a) => a.s === frontSide)!;
    const armG = (a: (typeof arms)[number], far: boolean) => (
      <g key={`arm${a.s}`}>
        <path
          d={armPath(a)}
          stroke={
            line
              ? '#fff'
              : shirt
                ? far
                  ? shade(shirtColor, -0.2)
                  : shirtColor
                : far
                  ? dark
                  : color
          }
          strokeWidth={line ? lw : 34}
          fill="none"
          strokeLinecap="round"
          opacity={line ? 1 : 1}
        />
        {sleeve < 0.8 && (
          <line
            x1={a.wrist.x}
            y1={a.wrist.y}
            x2={a.hp.x}
            y2={a.hp.y}
            stroke={limb}
            strokeWidth={line ? lw : 15}
            strokeLinecap="round"
          />
        )}
        <circle
          cx={a.hp.x}
          cy={a.hp.y}
          r={accessories.includes('gloves') ? 34 : 19}
          {...S(accessories.includes('gloves') ? '#d8d4c8' : C.ink)}
        />
        {!line && <circle cx={a.hp.x - 6} cy={a.hp.y - 6} r={6} fill="#3a3440" opacity={0.6} />}
      </g>
    );
    return (
      <g>
        {/* legs */}
        {legs.map((l) => (
          <g key={`leg${l.s}`}>
            <path
              d={`M${l.hip.x} ${l.hip.y} Q${l.knee.x} ${l.knee.y} ${l.foot.x} ${l.foot.y - 8}`}
              stroke={limb}
              strokeWidth={line ? lw : 15}
              fill="none"
              strokeLinecap="round"
            />
            <ellipse
              cx={l.foot.x + (fx || 0) * 10}
              cy={l.foot.y - 6}
              rx={27}
              ry={13}
              {...S('#1d1a22')}
            />
          </g>
        ))}
        {/* tay sau */}
        {fx !== 0 && armG(backArm, true)}
        {/* hood behind the head */}
        {!isAodai && !hoodUp && (
          <ellipse cx={-fx * 10} cy={torsoTop - 6} rx={78} ry={30} {...S(dark)} />
        )}
        {hoodUp && <circle cx={fx * 4} cy={HEAD_Y + yOff + 6} r={HEAD_R + 22} {...S(dark)} />}
        {/* body */}
        <path d={torso} {...(line ? S('') : { fill: `url(#${uid}-hd)` })} />
        {!line && !isAodai && (
          <rect x={-80} y={hem - 22} width={160} height={20} rx={10} fill={dark} opacity={0.65} />
        )}
        {!line && !isAodai && !back && (
          <path
            d={`M-44 ${hem - 70} Q0 ${hem - 84} 44 ${hem - 70} L50 ${hem - 34} L-50 ${hem - 34} Z`}
            fill={dark}
            opacity={0.45}
          />
        )}
        {!line && isAodai && (
          <path
            d={`M0 ${torsoTop} L0 ${hem}`}
            stroke={shade(color, -0.15)}
            strokeWidth={3}
            opacity={0.6}
          />
        )}
        {!line && !isAodai && !back && (
          <g stroke="#f4efe6" strokeWidth={5} strokeLinecap="round" opacity={0.92}>
            <path
              d={`M-20 ${torsoTop + 6} Q-22 ${torsoTop + 40} -18 ${torsoTop + 66 + Math.sin(t / 9) * 2}`}
              fill="none"
            />
            <path
              d={`M20 ${torsoTop + 6} Q22 ${torsoTop + 40} 18 ${torsoTop + 62 + Math.cos(t / 9) * 2}`}
              fill="none"
            />
          </g>
        )}
        {shirt && !line && (
          <g>
            <path
              d={`M-74 ${torsoTop + 18} Q-76 ${torsoTop} -42 ${torsoTop - 6} L-18 ${torsoTop - 6} L-26 ${hem - 4} L-84 ${hem - 4} Q-92 ${hem - 20} -88 ${hem - 40} Z`}
              fill={shirtColor}
            />
            <path
              d={`M74 ${torsoTop + 18} Q76 ${torsoTop} 42 ${torsoTop - 6} L18 ${torsoTop - 6} L26 ${hem - 4} L84 ${hem - 4} Q92 ${hem - 20} 88 ${hem - 40} Z`}
              fill={shirtColor}
            />
            <path
              d={`M-42 ${torsoTop - 8} L-8 ${torsoTop + 30} L-30 ${torsoTop + 34} Z M42 ${torsoTop - 8} L8 ${torsoTop + 30} L30 ${torsoTop + 34} Z`}
              fill={shade(shirtColor, 0.25)}
            />
            {[0, 1, 2].map((k) => (
              <circle
                key={k}
                cx={-24}
                cy={torsoTop + 60 + k * 45}
                r={4}
                fill={shade(shirtColor, -0.3)}
              />
            ))}
          </g>
        )}
        {accessories.includes('stetho') && !line && (
          <path
            d={`M-30 ${torsoTop + 4} Q-40 ${torsoTop + 90} 0 ${torsoTop + 110} Q40 ${torsoTop + 90} 30 ${torsoTop + 4}`}
            stroke="#3a3f48"
            strokeWidth={6}
            fill="none"
          />
        )}
        {accessories.includes('stetho') && !line && (
          <circle cx={0} cy={torsoTop + 116} r={12} fill="#c9cdd2" />
        )}
        {accessories.includes('backpack') && fx !== 0 && (
          <rect x={-fx * 120} y={torsoTop + 20} width={56} height={120} rx={18} {...S('#566170')} />
        )}
        {/* head */}
        <g transform={`translate(${sh},0)`}>
          {hair && (
            <g
              stroke={line ? '#fff' : C.ink}
              strokeWidth={line ? lw : 9}
              fill="none"
              strokeLinecap="round"
            >
              <path d={`M${-18 - fx * 6} ${HEAD_Y + yOff - HEAD_R + 6} q-14 -40 -46 -44`} />
              <path d={`M${2 - fx * 6} ${HEAD_Y + yOff - HEAD_R + 2} q4 -46 30 -60`} />
              <path d={`M${20 - fx * 6} ${HEAD_Y + yOff - HEAD_R + 8} q22 -26 50 -24`} />
              <path d={`M${-4 - fx * 6} ${HEAD_Y + yOff - HEAD_R + 4} q-6 -30 -2 -48`} />
            </g>
          )}
          {accessories.includes('bob') && (
            <path
              d={`M${-HEAD_R - 14} ${HEAD_Y + yOff + 10} Q${-HEAD_R - 20} ${HEAD_Y + yOff - HEAD_R - 10} 0 ${HEAD_Y + yOff - HEAD_R - 12} Q${HEAD_R + 20} ${HEAD_Y + yOff - HEAD_R - 10} ${HEAD_R + 14} ${HEAD_Y + yOff + 10} Q${HEAD_R + 30} ${HEAD_Y + yOff + 120} ${HEAD_R - 10} ${HEAD_Y + yOff + 110} L${-HEAD_R + 10} ${HEAD_Y + yOff + 110} Q${-HEAD_R - 30} ${HEAD_Y + yOff + 120} ${-HEAD_R - 14} ${HEAD_Y + yOff + 10} Z`}
              {...S('#1e1a24')}
            />
          )}
          {accessories.includes('ponytail') && (
            <path
              d={`M${-fx * 90 - (fx === 0 ? 70 : 0)} ${HEAD_Y + yOff - 60} q${-(fx || 1) * 60} 10 ${-(fx || 1) * 70 + Math.sin(t / 8) * 6} 90 q${(fx || 1) * 30} -10 ${(fx || 1) * 40} -70 Z`}
              {...S('#1e1a24')}
            />
          )}
          {accessories.includes('bun') && (
            <circle cx={-fx * 20} cy={HEAD_Y + yOff - HEAD_R + 8} r={38} {...S('#1e1a24')} />
          )}
          <ellipse
            cx={0}
            cy={HEAD_Y + yOff}
            rx={HEAD_R * (1 + puff * 0.09)}
            ry={HEAD_R * (1 - puff * 0.02)}
            {...(line ? S('') : { fill: `url(#${uid}-head)` })}
          />
          {!line && flush > 0 && (
            <ellipse
              cx={0}
              cy={HEAD_Y + yOff + 40}
              rx={HEAD_R * 0.85}
              ry={HEAD_R * 0.6}
              fill="#e0503a"
              opacity={0.35 * flush}
              filter={`url(#${uid}-soft)`}
            />
          )}
          {!line && (
            <path
              d={`M${rimSide * HEAD_R * 0.98} ${HEAD_Y + yOff - 30} A${HEAD_R} ${HEAD_R} 0 0 ${rimSide < 0 ? 1 : 0} ${rimSide * 30} ${HEAD_Y + yOff - HEAD_R * 0.99}`}
              stroke={C.rim}
              strokeWidth={5}
              fill="none"
              strokeLinecap="round"
              opacity={0.85}
            />
          )}
          {!line && (
            <ellipse
              cx={rimSide * 40}
              cy={HEAD_Y + yOff - 62}
              rx={30}
              ry={16}
              fill="#ffffff"
              opacity={0.07}
              transform={`rotate(${rimSide * 30} ${rimSide * 40} ${HEAD_Y + yOff - 62})`}
            />
          )}
          {accessories.includes('cap') && (
            <g>
              <path
                d={`M${-HEAD_R} ${HEAD_Y + yOff - 18} Q0 ${HEAD_Y + yOff - HEAD_R * 1.5} ${HEAD_R} ${HEAD_Y + yOff - 18} Z`}
                {...S('#2b2930')}
              />
              <path
                d={`M${fx * 20 - 10} ${HEAD_Y + yOff - 24} Q${(fx || 1) * 150} ${HEAD_Y + yOff - 30} ${(fx || 1) * 170} ${HEAD_Y + yOff - 6} L${fx * 20} ${HEAD_Y + yOff - 6} Z`}
                {...S('#232128')}
              />
            </g>
          )}
          {!back && (
            <g transform={`translate(0,${yOff})`}>
              <EyesG eyes={eyes} blink={bl} look={look} fx={fx} line={line} scale={1} />
            </g>
          )}
          {accessories.includes('clip') && (
            <rect
              x={fx * 30 + 40}
              y={HEAD_Y + yOff - HEAD_R + 18}
              width={36}
              height={14}
              rx={7}
              fill={line ? 'none' : '#e8a0b0'}
              stroke={line ? '#fff' : undefined}
              transform={`rotate(25 ${fx * 30 + 58} ${HEAD_Y + yOff - HEAD_R + 25})`}
            />
          )}
          {!back && accessories.includes('glassesRound') && (
            <g stroke={line ? '#fff' : '#d8cfbd'} strokeWidth={line ? lw : 4} fill="none">
              {[-1, 1].map((s) => (
                <circle key={s} cx={fx * 34 + s * 38} cy={HEAD_Y + yOff + 6} r={31} />
              ))}
              <line
                x1={fx * 34 - 7}
                y1={HEAD_Y + yOff + 2}
                x2={fx * 34 + 7}
                y2={HEAD_Y + yOff + 2}
              />
            </g>
          )}
          {!back && accessories.includes('glassesSquare') && (
            <g stroke={line ? '#fff' : '#d8cfbd'} strokeWidth={line ? lw : 5} fill="none">
              {[-1, 1].map((s) => (
                <rect
                  key={s}
                  x={fx * 34 + s * 38 - 30}
                  y={HEAD_Y + yOff - 18}
                  width={60}
                  height={46}
                  rx={8}
                />
              ))}
              <line x1={fx * 34 - 8} y1={HEAD_Y + yOff} x2={fx * 34 + 8} y2={HEAD_Y + yOff} />
            </g>
          )}
        </g>
        {/* front arm + held item */}
        {fx === 0 ? arms.map((a) => armG(a, false)) : armG(frontArm, false)}
        {itemR && <Item item={itemR} p={hand(1)} fx={fx || 1} mode={mode} />}
        {itemL && <Item item={itemL} p={hand(-1)} fx={-(fx || 1)} mode={mode} />}
      </g>
    );
  };

  const inv = Math.max(0, Math.min(1, invisible));
  const shimmer = 0.75 + 0.25 * Math.sin(t * 0.35 + seed) * Math.sin(t * 0.13);
  return (
    <g transform={`translate(${x},${y}) scale(${size})`} opacity={opacity}>
      <defs>
        <radialGradient id={`${uid}-head`} cx="38%" cy="32%" r="75%">
          <stop offset="0" stopColor="#4a4252" />
          <stop offset="0.35" stopColor="#1d1922" />
          <stop offset="1" stopColor="#09070c" />
        </radialGradient>
        <linearGradient id={`${uid}-hd`} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor={light} />
          <stop offset="0.55" stopColor={color} />
          <stop offset="1" stopColor={dark} />
        </linearGradient>
        <filter id={`${uid}-soft`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="14" />
        </filter>
        <filter id={`${uid}-rim`} x="-20%" y="-20%" width="140%" height="140%">
          <feMorphology in="SourceAlpha" operator="dilate" radius={3.2 / (size * px)} result="d" />
          <feFlood floodColor={C.rim} floodOpacity={0.6} />
          <feComposite in2="d" operator="in" result="rim" />
          <feMerge>
            <feMergeNode in="rim" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id={`${uid}-edge`} x="-20%" y="-20%" width="140%" height="140%">
          <feMorphology in="SourceAlpha" operator="dilate" radius={3.4 / (size * px)} result="d" />
          <feComposite in="d" in2="SourceAlpha" operator="out" result="ring" />
          <feFlood floodColor="#ffffff" />
          <feComposite in2="ring" operator="in" />
        </filter>
        <radialGradient id={`${uid}-sh`}>
          <stop offset="0" stopColor="#000" stopOpacity="0.32" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>
      {shadow && (
        <ellipse
          cx={0}
          cy={2}
          rx={pose === 'sitGround' ? 150 : 110}
          ry={20}
          fill={`url(#${uid}-sh)`}
          opacity={1 - inv * 0.85}
        />
      )}
      <g transform={`rotate(${lean}) translate(0,0) scale(${sx},${sy})`}>
        {/* solid body + thin cream rim around the silhouette */}
        {inv < 1 && (
          <g opacity={1 - inv} filter={`url(#${uid}-rim)`}>
            {draw('solid')}
          </g>
        )}
        {/* invisible: only a shimmering faint white outline + faded eyes */}
        {inv > 0 && (
          <g opacity={inv * 0.4 * shimmer}>
            <g filter={`url(#${uid}-edge)`}>{draw('solid')}</g>
            {!back && (
              <g transform={`translate(${sh},${yOff})`}>
                <EyesG eyes={eyes} blink={bl} look={look} fx={fx} line scale={1} />
              </g>
            )}
          </g>
        )}
      </g>
      {sparkle > 0 && <Sparkles amount={sparkle} seed={seed} t={t} />}
    </g>
  );
};

/** Small sparkles on vanish / appear. */
export const Sparkles: React.FC<{ amount: number; seed: number; t: number; spread?: number }> = ({
  amount,
  seed,
  t,
  spread = 1,
}) => (
  <g>
    {Array.from({ length: 10 }, (_, i) => {
      const a = random(`sp${seed}-${i}`) * Math.PI * 2;
      const r = (120 + random(`spr${seed}-${i}`) * 200) * spread;
      const cx = Math.cos(a) * r * (0.6 + 0.4 * amount);
      const cy = -330 + Math.sin(a) * r * 1.2;
      const s =
        (10 + random(`sps${seed}-${i}`) * 14) * amount * (0.6 + 0.4 * Math.sin(t * 0.6 + i));
      return (
        <path
          key={i}
          d={`M${cx} ${cy - s} L${cx + s * 0.25} ${cy} L${cx} ${cy + s} L${cx - s * 0.25} ${cy} Z M${cx - s} ${cy} L${cx} ${cy - s * 0.25} L${cx + s} ${cy} L${cx} ${cy + s * 0.25} Z`}
          fill="#fffbe8"
          opacity={amount}
        />
      );
    })}
  </g>
);

/**
 * Invisibility state from events = [[frame, "vanish" | "appear"]] (local frames).
 * Vanish = 8-frame fade + sparkles · appear = 4-frame squash-and-stretch "pop".
 */
export const invis = (
  f: number,
  events: readonly (readonly [number, 'vanish' | 'appear'])[],
  startInvisible = false,
) => {
  let v = startInvisible ? 1 : 0;
  let squash = 0;
  let sparkle = 0;
  for (const [at, kind] of events) {
    if (f < at) break;
    const u = f - at;
    if (kind === 'vanish') {
      v = interpolate(u, [0, 8], [0, 1], clamp);
      sparkle = interpolate(u, [0, 4, 16], [0, 1, 0], clamp);
      squash = 0;
    } else {
      v = interpolate(u, [0, 4], [1, 0], clamp);
      squash = interpolate(u, [0, 2, 4, 7, 10], [0, -0.55, 0.45, -0.12, 0], clamp);
      sparkle = interpolate(u, [0, 3, 12], [0, 0.8, 0], clamp);
    }
  }
  return { invisible: v, squash, sparkle };
};
