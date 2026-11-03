import React from 'react';
import { C, FONT, shade } from '../whatif/theme';
import { SoftShadow } from '../whatif/props';

/**
 * Western props for the "What if… (EN)" kit (D-092): the international redraws of the reference
 * EN episodes (suburban houses, picket fence, mailbox, sash window, range, egg carton…). Same
 * drawing language as the whatif props: world coordinates, muted colours, rounded, soft shadows.
 * The props that suit any country are re-exported; Vietnam-specific ones (altar, lanterns, lion,
 * motorbike, grille window, plastic chair, tear-off lunar calendar) are not.
 */
export {
  Bed,
  Blackboard,
  CrowdSil,
  Desk,
  Door,
  Frame,
  Fridge,
  NightLamp,
  Plant,
  SoftShadow,
  StoneBench as ParkBench,
  Table,
  TileFloor,
  TvCabinet,
  Wall,
  WallClock,
} from '../whatif/props';

type G = { readonly x?: number; readonly y?: number; readonly s?: number; readonly f?: number };
const at = (x = 0, y = 0, s = 1) => `translate(${x},${y}) scale(${s})`;

/** Sash window with white frame; night shows a dark-blue sky. */
export const SashWindow: React.FC<G & { w?: number; h?: number; night?: boolean }> = ({
  x = 0,
  y = 0,
  w = 300,
  h = 420,
  night = false,
}) => (
  <g transform={at(x, y)}>
    <rect x={-w / 2 - 16} y={-h / 2 - 16} width={w + 32} height={h + 32} rx={6} fill="#ece6da" />
    <rect x={-w / 2} y={-h / 2} width={w} height={h} fill={night ? '#34405e' : '#cfe0e6'} />
    {!night && (
      <path
        d={`M${-w / 2} ${h * 0.2} L${w * 0.1} ${-h / 2} L${w * 0.35} ${-h / 2} L${-w / 2} ${h * 0.45} Z`}
        fill="#ffffff"
        opacity={0.35}
      />
    )}
    <rect x={-w / 2} y={-8} width={w} height={16} fill="#ece6da" />
    <rect x={-6} y={-h / 2} width={12} height={h} fill="#ece6da" />
    <rect x={-w / 2 - 30} y={h / 2 + 10} width={w + 60} height={22} rx={6} fill="#d9d1c2" />
  </g>
);

/** Standing floor lamp with a fabric shade (warm light). */
export const FloorLamp: React.FC<G & { lit?: boolean }> = ({ x = 0, y = 0, s = 1, lit = true }) => (
  <g transform={at(x, y, s)}>
    <SoftShadow x={0} y={0} rx={70} />
    {lit && (
      <circle
        cx={0}
        cy={-520}
        r={190}
        fill="#ffcf8a"
        opacity={0.3}
        style={{ filter: 'blur(30px)' }}
      />
    )}
    <ellipse cx={0} cy={-6} rx={60} ry={12} fill="#4a3e36" />
    <rect x={-7} y={-470} width={14} height={466} fill="#4a3e36" />
    <path d="M-80 -460 L80 -460 L56 -600 L-56 -600 Z" fill={lit ? '#f4dca6' : '#cdbfa6'} />
  </g>
);

/** Curb-side mailbox on a post; flag up when there is mail. */
export const Mailbox: React.FC<G & { flag?: boolean; color?: string }> = ({
  x = 0,
  y = 0,
  s = 1,
  flag = false,
  color = '#5f7186',
}) => (
  <g transform={at(x, y, s)}>
    <SoftShadow x={0} y={0} rx={50} />
    <rect x={-10} y={-260} width={20} height={260} fill="#6b5446" />
    <path d="M-70 -260 L-70 -330 Q-70 -370 0 -370 Q70 -370 70 -330 L70 -260 Z" fill={color} />
    <rect x={-70} y={-268} width={140} height={10} fill={shade(color, -0.25)} />
    <rect x={70} y={flag ? -400 : -330} width={10} height={flag ? 90 : 60} fill="#c4553f" />
    {flag && <rect x={80} y={-400} width={40} height={26} fill="#c4553f" />}
  </g>
);

/** White picket fence from x0 to x1 standing on y. */
export const PicketFence: React.FC<{
  x0: number;
  x1: number;
  y: number;
  h?: number;
  color?: string;
}> = ({ x0, x1, y, h = 170, color = '#ece6da' }) => {
  const n = Math.max(1, Math.floor((x1 - x0) / 46));
  return (
    <g>
      <rect x={x0} y={y - h * 0.75} width={x1 - x0} height={16} fill={shade(color, -0.12)} />
      <rect x={x0} y={y - h * 0.35} width={x1 - x0} height={16} fill={shade(color, -0.12)} />
      {Array.from({ length: n + 1 }, (_, i) => {
        const px = x0 + i * 46;
        return (
          <path
            key={i}
            d={`M${px} ${y} L${px} ${y - h + 18} L${px + 15} ${y - h} L${px + 30} ${y - h + 18} L${px + 30} ${y} Z`}
            fill={color}
          />
        );
      })}
    </g>
  );
};

/** Two-storey suburban house with gable roof, porch, front door and windows; base at y. */
export const SuburbHouse: React.FC<
  G & { w?: number; wall?: string; roof?: string; door?: string; lit?: boolean }
> = ({
  x = 0,
  y = 0,
  s = 1,
  w = 640,
  wall = '#c9c2b0',
  roof = '#6d5f63',
  door = '#7b4a42',
  lit = false,
}) => {
  const h = 560;
  const win = lit ? '#ffd48a' : '#a9bcc6';
  return (
    <g transform={at(x, y, s)}>
      <SoftShadow x={0} y={0} rx={w * 0.6} a={0.2} />
      <rect x={-w / 2} y={-h} width={w} height={h} fill={wall} />
      {/* clapboard lines */}
      {Array.from({ length: 13 }, (_, i) => (
        <rect
          key={i}
          x={-w / 2}
          y={-h + 30 + i * 40}
          width={w}
          height={3}
          fill={shade(wall, -0.1)}
        />
      ))}
      <path d={`M${-w / 2 - 40} ${-h} L0 ${-h - 260} L${w / 2 + 40} ${-h} Z`} fill={roof} />
      <rect x={w * 0.22} y={-h - 220} width={60} height={140} fill={shade(roof, -0.2)} />
      {/* upstairs windows */}
      {[-0.28, 0.28].map((k) => (
        <g key={k}>
          <rect x={w * k - 60} y={-h + 60} width={120} height={150} fill={win} />
          <rect x={w * k - 72} y={-h + 50} width={144} height={12} fill="#ece6da" />
          <rect x={w * k - 4} y={-h + 60} width={8} height={150} fill="#ece6da" />
        </g>
      ))}
      {/* porch */}
      <rect x={-w / 2 + 30} y={-250} width={w - 60} height={24} fill={shade(roof, 0.1)} />
      {[-0.42, -0.1, 0.42].map((k) => (
        <rect key={k} x={w * k - 8} y={-226} width={16} height={196} fill="#ece6da" />
      ))}
      <rect x={-w / 2 + 20} y={-30} width={w - 40} height={30} fill="#9a8f80" />
      <rect x={-50} y={-210} width={100} height={180} rx={6} fill={door} />
      <circle cx={30} cy={-120} r={7} fill={C.gold} />
      <rect x={w * 0.18} y={-190} width={130} height={120} fill={win} />
      <rect x={w * 0.18 + 61} y={-190} width={8} height={120} fill="#ece6da" />
    </g>
  );
};

/** Sedan seen from the side (flip faces it left). */
export const Car: React.FC<G & { color?: string; flip?: boolean }> = ({
  x = 0,
  y = 0,
  s = 1,
  color = '#7c8fa3',
  flip = false,
}) => (
  <g transform={`${at(x, y, s)} scale(${flip ? -1 : 1},1)`}>
    <SoftShadow x={0} y={0} rx={300} a={0.3} />
    <path
      d="M-300 -60 L-300 -150 Q-290 -180 -230 -185 L-150 -190 L-80 -280 L140 -280 L220 -190 L280 -180 Q305 -170 305 -130 L305 -60 Z"
      fill={color}
    />
    <path d="M-60 -265 L60 -265 L60 -195 L-120 -195 Z" fill="#c9d6dd" />
    <path d="M78 -265 L130 -265 L195 -195 L78 -195 Z" fill="#c9d6dd" />
    <rect x={-300} y={-110} width={605} height={14} fill={shade(color, -0.2)} />
    {[-185, 190].map((cx) => (
      <g key={cx}>
        <circle cx={cx} cy={-55} r={58} fill="#2b2a30" />
        <circle cx={cx} cy={-55} r={26} fill="#9a9aa2" />
      </g>
    ))}
    <rect x={285} y={-160} width={20} height={26} rx={6} fill="#ffe2a0" />
  </g>
);

/** Yellow school bus seen from the side. */
export const SchoolBus: React.FC<G & { label?: string }> = ({
  x = 0,
  y = 0,
  s = 1,
  label = 'SCHOOL BUS',
}) => (
  <g transform={at(x, y, s)}>
    <SoftShadow x={0} y={0} rx={560} a={0.3} />
    <rect x={-560} y={-420} width={1100} height={360} rx={40} fill="#e0b45a" />
    <rect x={540} y={-300} width={90} height={240} rx={24} fill="#d6a84e" />
    {Array.from({ length: 7 }, (_, i) => (
      <rect key={i} x={-520 + i * 140} y={-390} width={110} height={110} rx={10} fill="#c9d6dd" />
    ))}
    <rect x={-560} y={-250} width={1100} height={18} fill="#2b2a30" />
    <rect x={-560} y={-150} width={1100} height={14} fill="#2b2a30" />
    <text
      x={-20}
      y={-180}
      textAnchor="middle"
      fontFamily={FONT}
      fontWeight={800}
      fontSize={58}
      fill="#2b2a30"
    >
      {label}
    </text>
    {[-380, 400].map((cx) => (
      <g key={cx}>
        <circle cx={cx} cy={-55} r={66} fill="#2b2a30" />
        <circle cx={cx} cy={-55} r={30} fill="#9a9aa2" />
      </g>
    ))}
  </g>
);

/** A row of school lockers (n doors) with vents and handles; base at y. */
export const Lockers: React.FC<G & { n?: number; color?: string; open?: number }> = ({
  x = 0,
  y = 0,
  s = 1,
  n = 6,
  color = '#6f8599',
  open = -1,
}) => (
  <g transform={at(x, y, s)}>
    {Array.from({ length: n }, (_, i) => (
      <g key={i} transform={`translate(${i * 130},0)`}>
        <rect
          x={0}
          y={-640}
          width={124}
          height={640}
          rx={6}
          fill={i === open ? '#2b2a30' : color}
        />
        {i !== open &&
          [0, 1, 2].map((v) => (
            <rect
              key={v}
              x={30}
              y={-600 + v * 22}
              width={64}
              height={8}
              rx={4}
              fill={shade(color, -0.25)}
            />
          ))}
        {i !== open && <rect x={98} y={-330} width={10} height={54} rx={5} fill="#d9d2bc" />}
      </g>
    ))}
  </g>
);

/** Upper kitchen cabinets from x0 to x1, bottom at y. */
export const UpperCabinets: React.FC<{ x0: number; x1: number; y: number; color?: string }> = ({
  x0,
  x1,
  y,
  color = '#d9d1c2',
}) => {
  const n = Math.max(1, Math.round((x1 - x0) / 170));
  const w = (x1 - x0) / n;
  return (
    <g>
      <rect x={x0} y={y - 300} width={x1 - x0} height={300} fill={shade(color, -0.12)} />
      {Array.from({ length: n }, (_, i) => (
        <g key={i}>
          <rect x={x0 + i * w + 8} y={y - 292} width={w - 16} height={284} rx={6} fill={color} />
          <rect x={x0 + i * w + w / 2 - 4} y={y - 70} width={8} height={40} rx={4} fill="#8a7a62" />
        </g>
      ))}
    </g>
  );
};

/** Kitchen range (stove + oven); boil 0…1 shows a steaming pot on the front burner. */
export const Range: React.FC<G & { boil?: number }> = ({
  x = 0,
  y = 0,
  s = 1,
  f = 0,
  boil = 0,
}) => (
  <g transform={at(x, y, s)}>
    <SoftShadow x={0} y={0} rx={170} />
    <rect x={-160} y={-440} width={320} height={440} rx={12} fill="#c9ced2" />
    <rect x={-160} y={-470} width={320} height={40} rx={8} fill="#2b2a30" />
    <rect x={-160} y={-520} width={320} height={50} rx={8} fill="#b7bdc2" />
    {[-90, -30, 30, 90].map((kx) => (
      <circle key={kx} cx={kx} cy={-495} r={12} fill="#2b2a30" />
    ))}
    <rect x={-130} y={-360} width={260} height={220} rx={12} fill="#3a3a42" />
    <rect x={-110} y={-400} width={220} height={14} rx={7} fill="#9aa0a6" />
    {boil > 0 && (
      <g>
        <rect x={-110} y={-560} width={150} height={90} rx={14} fill="#7f8c94" />
        {[0, 1, 2].map((i) => (
          <path
            key={i}
            d={`M${-70 + i * 35} -570 q-14 -30 0 -60 q14 -30 0 -60`}
            stroke="#ffffff"
            strokeWidth={8}
            strokeLinecap="round"
            fill="none"
            opacity={0.35 * boil * (0.6 + 0.4 * Math.sin(f / 6 + i))}
          />
        ))}
      </g>
    )}
  </g>
);

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** Daily tear-off calendar, international style: month and big day number, no lunar date. */
export const DailyCalendar: React.FC<G & { day?: number; month?: number }> = ({
  x = 0,
  y = 0,
  s = 1,
  day = 14,
  month = 4,
}) => (
  <g transform={at(x, y, s)}>
    <rect x={-80} y={-110} width={160} height={210} rx={8} fill="#efe9dc" />
    <rect x={-80} y={-110} width={160} height={52} rx={8} fill={C.red} />
    <text
      x={0}
      y={-72}
      textAnchor="middle"
      fontFamily={FONT}
      fontWeight={800}
      fontSize={34}
      fill="#fff"
    >
      {MONTHS[(month - 1 + 12) % 12]}
    </text>
    <text
      x={0}
      y={60}
      textAnchor="middle"
      fontFamily={FONT}
      fontWeight={800}
      fontSize={104}
      fill="#3a343c"
    >
      {day}
    </text>
    <circle cx={0} cy={-124} r={8} fill="#6b5446" />
  </g>
);

/** Paper carton of twelve eggs (eggs = how many are in it). */
export const EggCarton: React.FC<G & { eggs?: number; open?: boolean }> = ({
  x = 0,
  y = 0,
  s = 1,
  eggs = 12,
  open = true,
}) => (
  <g transform={at(x, y, s)}>
    <SoftShadow x={0} y={0} rx={170} />
    {open && <path d="M-170 -70 L170 -70 L190 -150 L-150 -150 Z" fill="#c8b79a" />}
    {Array.from({ length: 12 }, (_, i) => {
      const col = i % 6;
      const row = Math.floor(i / 6);
      const ex = -135 + col * 54;
      const ey = -60 - row * 30;
      return i < eggs ? (
        <ellipse key={i} cx={ex + row * 14} cy={ey} rx={22} ry={28} fill="#f4ede0" />
      ) : null;
    })}
    <path d="M-170 -50 L170 -50 L160 0 L-160 0 Z" fill="#b9a688" />
    {Array.from({ length: 6 }, (_, i) => (
      <path key={i} d={`M${-150 + i * 54} -50 q27 26 54 0`} fill="#ab987a" />
    ))}
  </g>
);

/** Dinner plates with food (lasagna or pancakes), cutlery and glasses, on a table top at y. */
export const PlatesMeal: React.FC<G & { food?: 'lasagna' | 'pancakes'; n?: number }> = ({
  x = 0,
  y = 0,
  s = 1,
  food = 'lasagna',
  n = 3,
}) => (
  <g transform={at(x, y, s)}>
    {Array.from({ length: n }, (_, i) => {
      const px = (i - (n - 1) / 2) * 170;
      return (
        <g key={i} transform={`translate(${px},0)`}>
          <ellipse cx={0} cy={-6} rx={70} ry={16} fill="#efe9dc" />
          {food === 'lasagna' ? (
            <path d="M-34 -14 L30 -14 L36 -38 L-28 -38 Z" fill="#c4553f" />
          ) : (
            <g>
              <ellipse cx={0} cy={-18} rx={40} ry={9} fill="#d9a46a" />
              <ellipse cx={0} cy={-28} rx={38} ry={9} fill="#e0b45a" />
            </g>
          )}
          <rect x={-90} y={-30} width={6} height={34} rx={3} fill="#b7bdc2" />
          <rect x={84} y={-30} width={6} height={34} rx={3} fill="#b7bdc2" />
        </g>
      );
    })}
    <rect
      x={(n / 2) * 170 - 20}
      y={-90}
      width={40}
      height={84}
      rx={8}
      fill="#c9d6dd"
      opacity={0.8}
    />
  </g>
);

/** Teacup on a saucer; tilt 0…1 tips it over (the cup that falls). */
export const Teacup: React.FC<G & { tilt?: number }> = ({ x = 0, y = 0, s = 1, tilt = 0 }) => (
  <g transform={at(x, y, s)}>
    <ellipse cx={0} cy={0} rx={60} ry={12} fill="#efe9dc" />
    <g transform={`rotate(${tilt * 95}, 30, -10)`}>
      <path d="M-40 -60 L40 -60 Q36 -8 0 -6 Q-36 -8 -40 -60 Z" fill="#f4ede0" />
      <path d="M40 -50 q30 4 20 26 q-6 10 -22 8" stroke="#f4ede0" strokeWidth={8} fill="none" />
      <ellipse cx={0} cy={-60} rx={40} ry={8} fill="#9a6a4a" />
    </g>
  </g>
);

/** Milkshake in a tall glass with straw and cream. */
export const Milkshake: React.FC<G & { flavor?: string }> = ({
  x = 0,
  y = 0,
  s = 1,
  flavor = '#e9b8b8',
}) => (
  <g transform={at(x, y, s)}>
    <path d="M-40 -180 L40 -180 L28 0 L-28 0 Z" fill={flavor} />
    <path d="M-48 -180 Q0 -240 48 -180 Z" fill="#f6efe6" />
    <circle cx={0} cy={-226} r={12} fill={C.red} />
    <rect
      x={14}
      y={-290}
      width={10}
      height={120}
      rx={5}
      fill="#c4553f"
      transform="rotate(12,19,-230)"
    />
  </g>
);

/** Iced coffee in a plastic cup with lid and straw; spill 0…1 throws it into the air like fireworks. */
export const IcedCoffee: React.FC<G & { spill?: number }> = ({
  x = 0,
  y = 0,
  s = 1,
  spill = 0,
}) => (
  <g transform={at(x, y, s)}>
    <path d="M-44 -190 L44 -190 L32 0 L-32 0 Z" fill="#c9d6dd" opacity={0.75} />
    <path d="M-40 -150 L40 -150 L32 0 L-32 0 Z" fill="#8a5a3c" />
    {[-20, 6, 22].map((ix, i) => (
      <rect
        key={i}
        x={ix - 12}
        y={-130 + i * 30}
        width={24}
        height={24}
        rx={4}
        fill="#eef4f6"
        opacity={0.7}
      />
    ))}
    <rect x={-50} y={-202} width={100} height={16} rx={8} fill="#eef4f6" />
    <rect x={8} y={-290} width={10} height={100} rx={5} fill="#c4553f" />
    {spill > 0 &&
      Array.from({ length: 10 }, (_, i) => {
        const a = (-150 + i * 12) * (Math.PI / 180);
        const r = 60 + spill * 160;
        return (
          <circle
            key={i}
            cx={Math.cos(a) * r}
            cy={-200 + Math.sin(a) * r}
            r={10 + (i % 3) * 4}
            fill="#8a5a3c"
            opacity={0.9}
          />
        );
      })}
  </g>
);

/** Street lamp; lit at night. */
export const StreetLamp: React.FC<G & { lit?: boolean }> = ({
  x = 0,
  y = 0,
  s = 1,
  lit = false,
}) => (
  <g transform={at(x, y, s)}>
    {lit && (
      <circle
        cx={60}
        cy={-760}
        r={220}
        fill="#ffcf8a"
        opacity={0.3}
        style={{ filter: 'blur(30px)' }}
      />
    )}
    <rect x={-10} y={-780} width={20} height={780} fill="#4a4a50" />
    <path d="M0 -780 Q0 -820 60 -820 L90 -820" stroke="#4a4a50" strokeWidth={16} fill="none" />
    <path d="M40 -820 L120 -820 L104 -780 L56 -780 Z" fill={lit ? '#ffe2a0' : '#7a7a82'} />
  </g>
);

/** Striped flag on a pole (no real country's flag). */
export const StripesFlag: React.FC<G> = ({ x = 0, y = 0, s = 1, f = 0 }) => (
  <g transform={at(x, y, s)}>
    <rect x={-6} y={-900} width={12} height={900} fill="#9a9aa2" />
    {Array.from({ length: 5 }, (_, i) => (
      <path
        key={i}
        d={`M6 ${-880 + i * 32} q60 ${Math.sin(f / 10) * 10} 120 0 q60 ${-Math.sin(f / 10) * 10} 120 0 l0 32 q-60 ${Math.sin(f / 10) * 10} -120 0 q-60 ${-Math.sin(f / 10) * 10} -120 0 Z`}
        fill={i % 2 ? '#e9e3d6' : '#5f7186'}
      />
    ))}
  </g>
);

/** Whiteboard with marker text lines (classroom). */
export const Whiteboard: React.FC<G & { text?: string[] }> = ({
  x = 0,
  y = 0,
  s = 1,
  text = [],
}) => (
  <g transform={at(x, y, s)}>
    <rect x={-430} y={-210} width={860} height={420} rx={10} fill="#b7bdc2" />
    <rect x={-412} y={-192} width={824} height={384} fill="#f2f0ea" />
    {text.map((t, i) => (
      <text
        key={i}
        x={-370}
        y={-110 + i * 80}
        fill="#3a4e7a"
        fontSize={52}
        fontFamily={FONT}
        opacity={0.9}
      >
        {t}
      </text>
    ))}
    <rect x={-380} y={192} width={760} height={14} fill="#9aa0a6" />
  </g>
);

/** Round deciduous tree for parks and front yards. */
export const RoundTree: React.FC<G & { tone?: string }> = ({
  x = 0,
  y = 0,
  s = 1,
  f = 0,
  tone = '#6f7d55',
}) => (
  <g transform={at(x, y, s)}>
    <SoftShadow x={0} y={0} rx={180} />
    <path d="M-26 0 L-18 -300 L18 -300 L26 0 Z" fill="#6b5446" />
    {[
      [0, -460, 200],
      [-150, -380, 140],
      [150, -390, 150],
      [-60, -580, 140],
      [90, -560, 130],
    ].map(([cx, cy, r], i) => (
      <circle
        key={i}
        cx={cx! + Math.sin(f / 50 + i) * 4}
        cy={cy}
        r={r}
        fill={shade(tone, (i % 3) * 0.05 - 0.05)}
      />
    ))}
  </g>
);
