import React from 'react';
import { AbsoluteFill, interpolate } from 'remotion';
import {
  Ban,
  bodyCam,
  clamp,
  CoGiao,
  Extra,
  faceCam,
  Friend,
  hit,
  Huy,
  loopFor,
  Me,
  ShotDef,
} from '../kit';
import { altarRoom, bedroom, classroom, minimal } from '../sets';
import { SetStage } from '../SetStage';
import { cutCam, WIDE } from '../Stage';
import { C, FONT } from '../theme';
import { tr, useShot } from '../time';
import { BigText, Pow } from '../ui';
import { Lying } from './act7';

// Classroom: rows of desks (seen from the board)
const ROW = [
  { k: 1, x: 120, y: 1640 },
  { k: 7, x: 940, y: 1660 },
  { k: 3, x: -140, y: 1600 },
  { k: 5, x: 1200, y: 1620 },
];
const Class: React.FC<{ f: number; turned: boolean; stand: number; huyThumb?: boolean }> = ({
  f,
  turned,
  stand,
  huyThumb,
}) => (
  <>
    {ROW.map((r, i) => (
      <Extra
        key={i}
        k={r.k}
        x={r.x}
        y={r.y}
        size={0.9}
        t={f + i * 7}
        back={!turned}
        pose="sitChair"
        facing={turned ? (r.x < 540 ? 1 : -1) : 0}
        eyes="wide"
      />
    ))}
    <Huy
      x={300}
      y={1680}
      size={0.95}
      t={f}
      back={!turned}
      pose={huyThumb ? 'raise' : 'sitChair'}
      facing={turned ? 1 : 0}
      eyes="happy"
      itemR={huyThumb ? 'thumb' : undefined}
    />
    <Ban
      x={720}
      y={1620}
      size={0.95}
      t={f}
      pose={stand > 0.5 ? 'stand' : 'sitChair'}
      facing={0}
      eyes="normal"
    />
  </>
);

// ───────── 9.1 Monday · the teacher takes the roll · you stand up ─────────
const S91: React.FC = () => {
  const { f, dur, L } = useShot('9.1');
  const stand = interpolate(f, [L('L236'), L('L236') + 10], [0, 1], clamp);
  const cam = cutCam(
    f,
    [
      { at: 0, a: { x: 520, y: 1000, z: 0.95 }, b: { x: 520, y: 1000, z: 1.02 } },
      { at: L('L233') - 2, a: faceCam(300, 1480, 1.05, 2.3), b: faceCam(300, 1480, 1.05, 2.5) },
      { at: L('L235') - 2, a: faceCam(720, 1620, 0.95, 2.6), b: faceCam(720, 1620, 0.95, 2.8) },
      { at: L('L236') - 2, a: bodyCam(720, 1620, 0.95, 1.3), b: bodyCam(720, 1620, 0.95, 1.4) },
    ],
    dur,
  );
  return (
    <SetStage
      set={classroom(f)}
      cam={cam}
      f={f}
      actors={
        <>
          <CoGiao
            x={300}
            y={1480}
            t={f}
            facing={f >= L('L234') ? 1 : 0}
            eyes="normal"
            look={{ x: 0.8, y: 0.3 }}
            pose="hold"
            itemR="paper"
          />
          <Class f={f} turned={false} stand={stand} />
        </>
      }
    />
  );
};

// ───────── 9.2 "Dạ, có" · the class turns · Huy gives a thumbs-up ─────────
const S92: React.FC = () => {
  const { f, dur, L } = useShot('9.2');
  const turn = L('L238');
  const cam = cutCam(
    f,
    [
      { at: 0, a: faceCam(720, 1620, 0.95, 2.4), b: faceCam(720, 1620, 0.95, 2.6) },
      { at: turn - 2, a: { x: 540, y: 1180, z: 1.0 }, b: { x: 540, y: 1180, z: 1.08 } },
      {
        at: L('L239') - 2,
        a: faceCam(300, 1680, 0.95, 2.2, 0),
        b: faceCam(300, 1680, 0.95, 2.4, 0),
      },
      { at: L('L240') - 2, a: { x: 480, y: 1200, z: 1.35 }, b: { x: 480, y: 1200, z: 1.45 } },
    ],
    dur,
  );
  const friends = f >= L('L240') - 2;
  return (
    <AbsoluteFill>
      <SetStage
        set={classroom(f)}
        cam={cam}
        f={f}
        actors={
          friends ? (
            <>
              <Friend k={0} x={260} y={1640} t={f} facing={1} eyes="happy" />
              <Friend k={2} x={420} y={1660} t={f} facing={1} eyes="normal" />
              <Ban x={700} y={1640} size={0.95} t={f} facing={-1} eyes="happy" />
            </>
          ) : (
            <Class f={f} turned={f >= turn} stand={1} huyThumb={f >= L('L239')} />
          )
        }
      />
      {f >= L('L237') && f < turn && (
        <Pow
          text={tr('DẠ, CÓ!', 'HERE!')}
          x={480}
          y={430}
          from={L('L237')}
          f={f}
          size={120}
          color={C.orange}
          rot={-5}
        />
      )}
      {friends && (
        <Pow
          text={tr('CN rảnh không? 🍦', 'Free this weekend? 🍦')}
          x={420}
          y={430}
          from={L('L240')}
          f={f}
          size={90}
          color="#ffffff"
          rot={-3}
        />
      )}
    </AbsoluteFill>
  );
};

// ───────── 9.3 "Tàng hình thì dễ…" ─────────
const S93: React.FC = () => {
  const { f, dur, L } = useShot('9.3');
  return (
    <AbsoluteFill>
      <SetStage
        set={classroom(f)}
        cam={cutCam(
          f,
          [
            {
              at: 0,
              a: faceCam(720, 1620, 0.95, 1.5, 20),
              b: faceCam(720, 1620, 0.95, 1.8, 20),
              hold: true,
            },
            {
              at: L('L243') - 2,
              a: faceCam(520, 1620, 0.95, 1.7, 120),
              b: faceCam(520, 1620, 0.95, 1.9, 120),
              hold: true,
            },
          ],
          dur,
        )}
        f={f}
        blurBg={8}
        actors={<Ban x={720} y={1620} size={0.95} t={f} eyes="happy" look={{ x: -0.3, y: -0.3 }} />}
      />
      <AbsoluteFill style={{ background: 'rgba(20,14,26,0.25)' }} />
      <BigText
        lines={[tr('Tàng hình thì dễ.', 'Turning invisible is easy.')]}
        from={L('L241')}
        f={f}
        y={160}
        size={100}
      />
      <BigText
        lines={tr(
          ['Để người ta thấy mình', 'mới khó.'],
          ['Letting people see you', 'is the hard part.'],
        )}
        from={L('L243')}
        f={f}
        y={1120}
        size={100}
        accent={[1]}
      />
    </AbsoluteFill>
  );
};

// ───────── 9.4 Half-empty bánh bò plate · Mom looks at the plate → at you → crumbs ─────────
const S94: React.FC = () => {
  const { f, dur, L } = useShot('9.4');
  const cam = cutCam(
    f,
    [
      { at: 0, a: { x: 540, y: 960, z: 1.0 }, b: { x: 540, y: 960, z: 1.08 } },
      { at: L('L247') - 2, a: { x: 690, y: 950, z: 2.9 }, b: { x: 690, y: 950, z: 3.1 } },
      { at: L('L248') - 2, a: faceCam(380, 1720, 1.08, 2.4), b: faceCam(380, 1720, 1.08, 2.6) },
      { at: L('L249') - 2, a: faceCam(820, 1720, 1.05, 2.4), b: faceCam(820, 1720, 1.05, 2.6) },
      { at: L('L250') - 2, a: { x: 830, y: 1400, z: 3.4 }, b: { x: 830, y: 1400, z: 3.7 } },
      { at: L('L251') - 2, a: faceCam(380, 1720, 1.08, 2.6), b: faceCam(380, 1720, 1.08, 2.8) },
      { at: L('L252') - 2, a: faceCam(820, 1720, 1.05, 2.6), b: faceCam(820, 1720, 1.05, 2.9) },
    ],
    dur,
  );
  const momLook =
    f < L('L249') ? { x: 0.6, y: -0.8 } : f < L('L250') ? { x: 1, y: 0 } : { x: 1, y: 0.7 };
  return (
    <SetStage
      set={altarRoom(f, { cakes: 4 })}
      cam={cam}
      f={f}
      actors={
        <>
          <Me x={380} y={1720} t={f} facing={1} eyes="half" look={momLook} />
          <Ban
            x={820}
            y={1720}
            size={1.05}
            t={f}
            facing={-1}
            eyes={f >= L('L253') ? 'happy' : f >= L('L249') ? 'look' : 'normal'}
            look={{ x: f >= L('L249') ? 0.4 : -1, y: 0 }}
            shiver={f >= L('L251') && f < L('L253') ? 0.4 : 0}
          />
          {[0, 1, 2, 3, 4].map((i) => (
            <circle
              key={i}
              cx={800 + i * 16 + (i % 2) * 8}
              cy={1380 + (i % 3) * 16}
              r={6}
              fill="#f2ead8"
            />
          ))}
        </>
      }
    />
  );
};

// ───────── 9.5 Bin presses an ear to your chest ─────────
const S95: React.FC = () => {
  const { f, dur, L } = useShot('9.5');
  const lay = f >= L('L256') - 2;
  const cam = cutCam(
    f,
    [
      { at: 0, a: { x: 520, y: 1160, z: 1.05 }, b: { x: 520, y: 1160, z: 1.12 } },
      { at: L('L256') - 2, a: { x: 520, y: 1260, z: 2.0 }, b: { x: 520, y: 1260, z: 2.2 } },
      { at: L('L257') - 2, a: { x: 470, y: 1250, z: 2.8 }, b: { x: 470, y: 1250, z: 3.0 } },
      { at: L('L258') - 2, a: { x: 380, y: 1290, z: 2.8 }, b: { x: 380, y: 1290, z: 3.0 } },
      { at: L('L259') - 2, a: { x: 470, y: 1270, z: 2.0 }, b: { x: 470, y: 1270, z: 2.2 } },
    ],
    dur,
  );
  return (
    <SetStage
      set={bedroom(f, { warm: 1 })}
      cam={cam}
      f={f}
      actors={
        <>
          {!lay && <Lying who="bin" x={700} y={1230} f={f} eyes="normal" />}
          <Lying who="ban" x={720} y={1305} f={f} eyes={f >= L('L258') ? 'happy' : 'normal'} />
          {lay && (
            <Lying who="bin" x={720} y={1262} f={f} eyes={f >= L('L259') ? 'happy' : 'closed'} />
          )}
          <path
            d={`M500 1262 Q690 ${1226 + Math.sin(f / 50) * 4} 880 1262 L900 1420 L480 1420 Z`}
            fill="#c98a6a"
          />
        </>
      }
    />
  );
};

// ───────── 9.6 Bin sleeps · slow even breathing · slow pull-out ─────────
const S96: React.FC = () => {
  const { f, dur } = useShot('9.6');
  const z = interpolate(f, [0, dur], [1.7, 1.0], clamp);
  return (
    <SetStage
      set={bedroom(f, { warm: 1 })}
      cam={{ x: 520, y: 1200, z }}
      f={f}
      actors={
        <>
          <Lying who="ban" x={720} y={1305} f={f} eyes="closed" />
          <Lying who="bin" x={720} y={1262} f={f} eyes="closed" />
          <path
            d={`M500 1262 Q690 ${1220 + Math.sin(f / 45) * 8} 880 1262 L900 1420 L480 1420 Z`}
            fill="#c98a6a"
          />
          {[0, 1, 2].map((i) => {
            const u = (f + i * 40) % 120;
            return (
              <text
                key={i}
                x={300 + u * 0.8}
                y={1060 - u * 1.2}
                fontFamily={FONT}
                fontWeight={800}
                fontSize={40 + i * 8}
                fill="#fff"
                opacity={interpolate(u, [0, 20, 100, 120], [0, 0.6, 0.6, 0], clamp)}
              >
                z
              </text>
            );
          })}
        </>
      }
    />
  );
};

// ───────── 9.7 End card ─────────
const S97: React.FC = () => {
  const { f, dur, L } = useShot('9.7');
  const final = f >= L('L269') - 2;
  return (
    <AbsoluteFill>
      <SetStage
        set={minimal('#5a4050', '#2a2032')}
        cam={cutCam(
          f,
          [
            { at: 0, a: { ...WIDE, z: 1.0 }, b: { ...WIDE, z: 1.06 } },
            { at: L('L268') - 2, a: { ...WIDE, z: 1.06 }, b: { ...WIDE, z: 1.12 } },
            {
              at: L('L269') - 2,
              a: { ...WIDE, y: 1000, z: 1.0 },
              b: { ...WIDE, y: 1000, z: 1.05 },
            },
          ],
          dur,
        )}
        f={f}
        actors={
          <>
            <Ban
              x={final ? 500 : 860}
              y={1560}
              size={1.05}
              t={f}
              eyes="happy"
              pose={final ? 'stand' : 'raise'}
              invisible={final ? interpolate(f, [L('L269'), L('L270')], [0, 0.6], clamp) : 0}
            />
            {final && (
              <Ban x={150} y={1560} size={1.0} t={f} seed={91} invisible={1} eyes="happy" px={1} />
            )}
          </>
        }
      />
      {!final && f < L('L268') - 2 && (
        <BigText
          lines={tr(
            ['Tàng hình được 3 phút,', 'bạn sẽ làm gì đầu tiên? 👇'],
            ['Invisible for 3 minutes —', 'what would you do first? 👇'],
          )}
          from={4}
          f={f}
          y={260}
          size={92}
          accent={[1]}
        />
      )}
      {!final && f >= L('L268') - 2 && (
        <BigText
          lines={tr(
            ['❤️ Thích  ·  ➕ Theo dõi', 'để xem thêm những chữ “nếu”'],
            ['❤️ Like  ·  ➕ Subscribe', 'for more “what ifs”'],
          )}
          from={L('L268')}
          f={f}
          y={260}
          size={88}
          accent={[0]}
        />
      )}
      {final && (
        <BigText
          lines={tr(
            ['Một chữ nếu…', 'một cuộc đời khác.'],
            ['One little “if”…', 'a whole different life.'],
          )}
          from={L('L269')}
          f={f}
          y={300}
          size={110}
          accent={[1]}
        />
      )}
    </AbsoluteFill>
  );
};

export const ACT9: Record<string, ShotDef> = {
  '9.1': {
    C: S91,
    amb: 'class',
    fx: (h) => [hit('chair', h.L('L236'), 0.9), hit('paper', h.L('L233'), 0.4)],
  },
  '9.2': {
    C: S92,
    amb: 'class',
    fx: (h) => [
      hit('cloth', h.L('L238'), 0.7),
      hit('chair', h.L('L238') + 4, 0.4),
      hit('pop', h.L('L239') + 6, 0.4),
    ],
  },
  '9.3': {
    C: S93,
    amb: 'class',
    fx: (h) => [hit('whoosh_ui', h.L('L241'), 0.4), hit('whoosh_ui', h.L('L243'), 0.4)],
  },
  '9.4': {
    C: S94,
    amb: 'altar',
    fx: (h) => [hit('dishes', h.L('L247'), 0.4), hit('cloth', h.L('L250'), 0.4)],
  },
  '9.5': {
    C: S95,
    amb: 'night',
    fx: (h) => [
      hit('blanket', 10, 0.7),
      hit('blanket', h.L('L256') - 6, 0.5),
      loopFor('heartbeat_slow_loop', h.L('L256'), h.dur + 10, 0.55, 20),
    ],
  },
  '9.6': { C: S96, amb: 'night', fx: (h) => [loopFor('heartbeat_slow_loop', 0, h.dur, 0.35, 20)] },
  '9.7': {
    C: S97,
    amb: 'rules',
    fx: (h) => [
      hit('whoosh_ui', 4, 0.5),
      hit('ting', h.L('L268'), 0.5),
      hit('shimmer', h.L('L269'), 0.5),
    ],
  },
};
