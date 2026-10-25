import React from 'react';
import { AbsoluteFill, interpolate } from 'remotion';
import { Character, invis } from '../Character';
import {
  Ban,
  Bin,
  bodyCam,
  clamp,
  CoGiao,
  Extra,
  faceCam,
  Friend,
  hit,
  loopFor,
  ShotDef,
} from '../kit';
import { alley, bedroom, canteen, classroom, hallway } from '../sets';
import { SetStage } from '../SetStage';
import { cutCam } from '../Stage';
import { C, FONT } from '../theme';
import { tr, useShot } from '../time';
import { BigText, PortraitBox, Pow } from '../ui';

/** Small whisper bubble. */
const Whisper: React.FC<{ x: number; y: number; f: number; from: number; text?: string }> = ({
  x,
  y,
  f,
  from,
  text = '…',
}) => {
  const k = interpolate(f, [from, from + 6], [0, 1], clamp);
  if (k <= 0) return null;
  return (
    <g transform={`translate(${x},${y}) scale(${k})`} opacity={0.9}>
      <path
        d="M-90 -50 Q-90 -80 -60 -80 L60 -80 Q90 -80 90 -50 L90 0 Q90 30 60 30 L-10 30 L-40 60 L-36 30 L-60 30 Q-90 30 -90 0 Z"
        fill="#f2ede4"
      />
      <text
        y={-12}
        textAnchor="middle"
        fontFamily={FONT}
        fontWeight={800}
        fontSize={44}
        fill="#4a4652"
      >
        {text}
      </text>
    </g>
  );
};

// ───────── 7.1 "Nhưng có một cái giá" ─────────
const S71: React.FC = () => {
  const { f, dur, L } = useShot('7.1');
  const ears = L('L129');
  const cam = cutCam(
    f,
    [
      { at: 0, a: faceCam(560, 1560, 1, 2.0, 40), b: faceCam(560, 1560, 1, 2.6, 40), hold: true },
      { at: ears - 2, a: { x: 560, y: 1020, z: 1.2 }, b: { x: 560, y: 1020, z: 1.35 } },
    ],
    dur,
  );
  return (
    <SetStage
      set={hallway(f)}
      cam={cam}
      f={f}
      actors={
        f < ears - 2 ? (
          <Ban x={560} y={1560} t={f} eyes="half" look={{ x: 0, y: 0.4 }} />
        ) : (
          <>
            <Extra k={1} x={300} y={1540} t={f} facing={1} eyes="half" />
            <Extra k={4} x={430} y={1590} t={f} facing={-1} eyes="normal" />
            <Ban x={720} y={1560} t={f} invisible={1} eyes="sad" px={cam.z} />
            <Whisper x={330} y={860} f={f} from={ears + 10} text={tr('nó á…', 'him?…')} />
            <Whisper x={480} y={800} f={f} from={ears + 30} text={tr('…kệ nó', '…whatever')} />
          </>
        )
      }
    />
  );
};

// ───────── Break time: group of 3 friends ─────────
const Circle3: React.FC<{ f: number; leave?: number }> = ({ f, leave = 0 }) => (
  <g
    transform={`translate(${-leave * 900},${-leave * 120}) scale(${1 - leave * 0.55})`}
    style={{ transformOrigin: '300px 1560px' }}
  >
    <Friend
      k={0}
      x={260}
      y={1540}
      t={f}
      facing={1}
      eyes="normal"
      pose={leave > 0 ? 'walk' : 'stand'}
    />
    <Friend
      k={1}
      x={420}
      y={1500}
      t={f}
      facing={leave > 0 ? -1 : 0}
      eyes="happy"
      pose={leave > 0 ? 'walk' : 'stand'}
    />
    <Friend
      k={2}
      x={570}
      y={1560}
      t={f}
      facing={-1}
      eyes="half"
      pose={leave > 0 ? 'walk' : 'stand'}
    />
  </g>
);
const S72: React.FC = () => {
  const { f, dur, L } = useShot('7.2');
  const cam = cutCam(
    f,
    [
      { at: 0, a: { x: 560, y: 980, z: 0.95 }, b: { x: 560, y: 990, z: 1.0 } },
      { at: L('L131') - 2, a: { x: 420, y: 1060, z: 1.45 }, b: { x: 420, y: 1060, z: 1.55 } },
      { at: L('L132') - 2, a: { x: 640, y: 1080, z: 1.3 }, b: { x: 640, y: 1080, z: 1.4 } },
      { at: L('L133') - 2, a: faceCam(780, 1560, 1, 2.8), b: faceCam(780, 1560, 1, 3.1) },
    ],
    dur,
  );
  return (
    <SetStage
      set={hallway(f)}
      cam={cam}
      f={f}
      actors={
        <>
          <Circle3 f={f} />
          <Ban
            x={780}
            y={1560}
            t={f}
            invisible={1}
            eyes="normal"
            look={{ x: -1, y: 0 }}
            px={cam.z}
          />
          <Whisper
            x={300}
            y={880}
            f={f}
            from={L('L131') + 10}
            text={tr('T7 đi chơi!', 'Sat hangout!')}
          />
        </>
      }
    />
  );
};

// ───────── 7.3 "Có rủ nó không?" ─────────
const S73: React.FC = () => {
  const { f, dur, L, H } = useShot('7.3');
  const cam = cutCam(
    f,
    [
      { at: 0, a: faceCam(260, 1540, 0.98, 2.5), b: faceCam(260, 1540, 0.98, 2.7) },
      { at: L('L135') - 2, a: faceCam(570, 1560, 0.95, 2.5), b: faceCam(570, 1560, 0.95, 2.7) },
      { at: H('L135'), a: faceCam(780, 1560, 1, 3.2), b: faceCam(780, 1560, 1, 3.4), hold: true },
    ],
    dur,
  );
  return (
    <SetStage
      set={hallway(f)}
      cam={cam}
      f={f}
      actors={
        <>
          <Circle3 f={f} />
          <Ban x={780} y={1560} t={f} invisible={1} eyes="sad" px={cam.z} />
        </>
      }
    />
  );
};

// ───────── 7.4 You breathe out – empty corridor ─────────
const S74: React.FC = () => {
  const { f, dur, at, L } = useShot('7.4');
  const pop = at('L136', 'thở');
  const iv = invis(f, [[pop, 'appear']], true);
  const leave = interpolate(f, [0, pop + 20], [0.15, 1], clamp);
  const cam = cutCam(
    f,
    [
      { at: 0, a: bodyCam(780, 1560, 1, 1.6), b: bodyCam(780, 1560, 1, 1.7) },
      {
        at: L('L137') - 2,
        a: { x: 600, y: 860, z: 0.72 },
        b: { x: 600, y: 860, z: 0.68 },
        hold: true,
      },
    ],
    dur,
  );
  return (
    <SetStage
      set={hallway(f)}
      cam={cam}
      f={f}
      actors={
        <>
          <Circle3 f={f} leave={leave} />
          <Ban x={780} y={1560} t={f} eyes={f > L('L137') ? 'sad' : 'half'} {...iv} px={cam.z} />
        </>
      }
    />
  );
};

// ───────── 7.5 "KHÔNG CẦN AI THẤY MÌNH" ─────────
const S75: React.FC = () => {
  const { f, dur, L } = useShot('7.5');
  return (
    <AbsoluteFill>
      <SetStage
        set={hallway(f)}
        cam={cutCam(
          f,
          [{ at: 0, a: bodyCam(780, 1560, 1, 1.3), b: bodyCam(780, 1560, 1, 1.5), hold: true }],
          dur,
        )}
        f={f}
        actors={
          <Ban
            x={780}
            y={1560}
            t={f}
            back
            eyes="sad"
            invisible={interpolate(f, [L('L139'), L('L139') + 8], [0, 1], clamp)}
          />
        }
      />
      <BigText
        lines={tr(['KHÔNG CẦN', 'AI THẤY MÌNH'], ['NOBODY NEEDS', 'TO SEE ME'])}
        from={L('L139')}
        f={f}
        y={330}
        size={104}
        color="#d8d4e4"
      />
    </AbsoluteFill>
  );
};

// ───────── 7.6 Lunch alone · going home alone ─────────
const S76: React.FC = () => {
  const { f, dur, L } = useShot('7.6');
  const inAlley = f >= L('L142') - 2;
  const breathe = L('L145');
  const holdAgain = L('L146');
  const iv = invis(
    f,
    [
      [breathe, 'appear'],
      [holdAgain + 6, 'vanish'],
    ],
    true,
  );
  const walkX = interpolate(f, [L('L142'), dur], [180, 760], clamp);
  const cam = inAlley
    ? cutCam(
        f,
        [
          { at: L('L142') - 2, a: { x: 520, y: 980, z: 1.0 }, b: { x: 560, y: 990, z: 1.05 } },
          { at: L('L144') - 2, a: bodyCam(walkX, 1500, 1, 1.5), b: bodyCam(walkX, 1500, 1, 1.6) },
          { at: L('L147') - 2, a: faceCam(walkX, 1500, 1, 2.6), b: faceCam(walkX, 1500, 1, 2.9) },
        ],
        dur,
      )
    : cutCam(
        f,
        [
          { at: 0, a: { x: 520, y: 1260, z: 1.2 }, b: { x: 520, y: 1260, z: 1.3 } },
          { at: L('L141') - 2, a: { x: 420, y: 1300, z: 1.9 }, b: { x: 420, y: 1300, z: 2.0 } },
        ],
        dur,
      );
  return (
    <SetStage
      set={inAlley ? alley(f) : canteen(f, { empty: false })}
      cam={cam}
      f={f}
      actors={
        inAlley ? (
          <Ban
            x={walkX}
            y={1500}
            t={f}
            pose={f < L('L147') - 2 ? 'walk' : 'stand'}
            facing={f < L('L147') - 2 ? 1 : 0}
            speed={0.6}
            eyes={f >= L('L147') ? 'look' : 'half'}
            look={{ x: 0, y: 0.5 }}
            fade={f > breathe ? 0.3 : 0}
            {...iv}
            px={cam.z}
          />
        ) : (
          <>
            <Ban
              x={420}
              y={1640}
              size={0.95}
              t={f}
              pose="sitChair"
              facing={0}
              invisible={1}
              eyes="half"
              px={cam.z}
            />
            <Extra k={2} x={900} y={1560} size={0.9} t={f} facing={-1} eyes="happy" />
            <Extra k={5} x={1030} y={1580} size={0.95} t={f} facing={-1} eyes="normal" />
          </>
        )
      }
    />
  );
};

// ───────── 7.7 Even while breathing – the orange hoodie fades ─────────
const S77: React.FC = () => {
  const { f, dur } = useShot('7.7');
  const fade = interpolate(f, [0, dur * 0.6], [0.2, 0.5], clamp);
  const px = interpolate(f, [0, dur], [1150, -150]);
  return (
    <SetStage
      set={alley(f)}
      cam={cutCam(
        f,
        [{ at: 0, a: bodyCam(520, 1500, 1, 1.3), b: bodyCam(520, 1500, 1, 1.45) }],
        dur,
      )}
      f={f}
      actors={
        <>
          <Extra
            k={6}
            x={px}
            y={1450}
            size={0.95}
            t={f}
            facing={-1}
            pose="walk"
            eyes="normal"
            look={{ x: -1, y: 0 }}
          />
          <Extra
            k={3}
            x={px + 420}
            y={1440}
            size={0.92}
            t={f}
            facing={-1}
            pose="walk"
            eyes="half"
          />
          <Ban x={520} y={1500} t={f} eyes="sad" fade={fade} pose="stand" />
        </>
      }
    />
  );
};

// ───────── 7.8 The teacher takes the roll and skips you ─────────
const S78: React.FC = () => {
  const { f, dur, L } = useShot('7.8');
  const raise = L('L151');
  const scan = L('L153');
  const look = f < scan ? 0 : Math.sin((f - scan) / 10) * 1;
  const cam = cutCam(
    f,
    [
      { at: 0, a: faceCam(300, 1480, 1.05, 2.3), b: faceCam(300, 1480, 1.05, 2.5) },
      { at: raise - 2, a: bodyCam(720, 1620, 0.95, 1.35), b: bodyCam(720, 1620, 0.95, 1.45) },
      { at: L('L152') - 2, a: faceCam(720, 1620, 0.95, 2.6), b: faceCam(720, 1620, 0.95, 2.8) },
      { at: scan - 2, a: { x: 520, y: 1040, z: 1.05 }, b: { x: 520, y: 1040, z: 1.12 } },
    ],
    dur,
  );
  return (
    <AbsoluteFill>
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
              facing={f < scan ? 1 : 0}
              eyes="normal"
              look={{ x: f < scan ? 0.8 : look, y: 0 }}
              pose="hold"
              itemR="paper"
            />
            <Extra k={1} x={520} y={1640} size={0.9} t={f} back pose="sitChair" />
            <Extra k={7} x={940} y={1660} size={0.92} t={f} back pose="sitChair" />
            <Ban
              x={720}
              y={1620}
              size={0.95}
              t={f}
              pose={f >= raise ? 'raise' : 'sitChair'}
              facing={0}
              eyes={f >= scan ? 'sad' : 'normal'}
              fade={0.5}
            />
          </>
        }
      />
      {f >= L('L152') && f < scan && (
        <Pow
          text={tr('CÓ…', 'HERE…')}
          x={640}
          y={520}
          from={L('L152')}
          f={f}
          size={90}
          color="#cfc8c0"
          rot={-4}
        />
      )}
    </AbsoluteFill>
  );
};

// ───────── 7.9 Birthday – the group chat is silent ─────────
const S79: React.FC = () => {
  const { f, dur } = useShot('7.9');
  const hh = Math.floor(interpolate(f, [0, dur], [7, 23.98]));
  const mm = Math.floor((interpolate(f, [0, dur], [7, 23.98]) % 1) * 60);
  return (
    <AbsoluteFill style={{ background: '#26232c', alignItems: 'center' }}>
      <PortraitBox s={0.75} dy={90}>
        <div
          style={{
            position: 'absolute',
            top: 160,
            left: 160,
            width: 760,
            height: 1360,
            borderRadius: 60,
            background: '#1b1a20',
            padding: 20,
            transform: `scale(${1 + f * 0.0006})`,
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
              position: 'relative',
            }}
          >
            <div
              style={{
                background: '#8b8a96',
                color: '#fff',
                padding: '60px 30px 24px',
                fontSize: 44,
                fontWeight: 800,
              }}
            >
              {tr('‹ Nhóm 8A3 thân 🫶', '‹ 8A3 besties 🫶')}
              <div style={{ fontSize: 30, fontWeight: 600, opacity: 0.85 }}>
                {tr('5 thành viên', '5 members')}
              </div>
            </div>
            <div
              style={{
                padding: 30,
                display: 'flex',
                flexDirection: 'column',
                gap: 24,
                fontSize: 36,
              }}
            >
              <div style={{ alignSelf: 'center', fontSize: 28, color: '#77737a' }}>
                {tr('Hôm qua', 'Yesterday')}
              </div>
              <div
                style={{
                  background: '#fff',
                  borderRadius: 26,
                  padding: '18px 26px',
                  alignSelf: 'flex-start',
                  maxWidth: 520,
                }}
              >
                {tr('T7 đi ăn kem ko 🍦', 'ice cream sat? 🍦')}
              </div>
              <div
                style={{
                  background: '#fff',
                  borderRadius: 26,
                  padding: '18px 26px',
                  alignSelf: 'flex-start',
                  maxWidth: 520,
                }}
              >
                {tr('ok 3 đứa mình đi', 'ok just the 3 of us')}
              </div>
              <div style={{ alignSelf: 'center', fontSize: 28, color: '#77737a', marginTop: 30 }}>
                {tr('Hôm nay · 🎂 Sinh nhật bạn', 'Today · 🎂 Your birthday')}
              </div>
              <div style={{ alignSelf: 'center', fontSize: 30, color: '#9a969e', marginTop: 300 }}>
                {tr('Chưa có tin nhắn mới', 'No new messages')}
              </div>
            </div>
            <div
              style={{
                position: 'absolute',
                top: 12,
                right: 40,
                fontSize: 30,
                fontWeight: 800,
                color: '#fff',
              }}
            >
              {String(hh).padStart(2, '0')}:{String(mm).padStart(2, '0')}
            </div>
          </div>
        </div>
      </PortraitBox>
    </AbsoluteFill>
  );
};

// ───────── 7.10 Only Bin (dark bedroom) ─────────
/** Character lying on the bed (rotated horizontal). */
export const Lying: React.FC<{
  who: 'ban' | 'bin';
  x: number;
  y: number;
  f: number;
  eyes?: 'normal' | 'closed' | 'half' | 'happy' | 'sad';
  fade?: number;
  facing?: number;
}> = ({ who, x, y, f, eyes = 'normal', fade = 0 }) =>
  who === 'ban' ? (
    <Character
      x={x}
      y={y}
      size={1}
      seed={1}
      hoodieColor={C.orange}
      t={f}
      lean={-90}
      eyes={eyes}
      fade={fade}
      shadow={false}
      blink={eyes !== 'closed'}
    />
  ) : (
    <Character
      x={x}
      y={y}
      size={0.58}
      seed={3}
      hoodieColor={C.bin}
      t={f}
      lean={-90}
      eyes={eyes}
      shadow={false}
    />
  );
const Blanket: React.FC<{ x: number; y: number; w: number; f: number; color?: string }> = ({
  x,
  y,
  w,
  f,
  color = '#6a7aa0',
}) => (
  <path
    d={`M${x} ${y} Q${x + w / 2} ${y - 40 + Math.sin(f / 50) * 4} ${x + w} ${y} L${x + w + 20} ${y + 120} L${x - 20} ${y + 120} Z`}
    fill={color}
  />
);
const S710: React.FC = () => {
  const { f, dur, L, H } = useShot('7.10');
  const climb = interpolate(f, [L('L156'), L('L156') + 40], [0, 1], clamp);
  const cam = cutCam(
    f,
    [
      { at: 0, a: { x: 520, y: 1160, z: 1.05 }, b: { x: 520, y: 1160, z: 1.12 } },
      { at: L('L156') - 2, a: { x: 460, y: 1250, z: 1.35 }, b: { x: 460, y: 1250, z: 1.45 } },
      { at: L('L157') - 2, a: { x: 360, y: 1210, z: 2.6 }, b: { x: 360, y: 1210, z: 2.8 } },
      { at: L('L159') - 2, a: { x: 470, y: 1240, z: 1.8 }, b: { x: 470, y: 1240, z: 1.95 } },
      {
        at: H('L159'),
        a: { x: 470, y: 1240, z: 1.5 },
        b: { x: 470, y: 1240, z: 1.42 },
        hold: true,
      },
    ],
    dur,
  );
  return (
    <SetStage
      set={bedroom(f, { warm: 0 })}
      cam={cam}
      f={f}
      actors={
        <>
          {climb >= 1 && (
            <Lying who="bin" x={700} y={1230} f={f} eyes={f > L('L159') ? 'sad' : 'normal'} />
          )}
          <Lying
            who="ban"
            x={720}
            y={1305}
            f={f}
            eyes={f > L('L157') ? 'half' : 'normal'}
            fade={0.5}
          />
          {climb < 1 ? (
            <Bin
              x={interpolate(climb, [0, 1], [120, 300])}
              y={interpolate(climb, [0, 0.6, 1], [1560, 1330, 1300])}
              t={f}
              pose="armsUp"
              facing={1}
              eyes="normal"
            />
          ) : null}
          <Blanket x={480} y={1250} w={420} f={f} />
        </>
      }
    />
  );
};

export const ACT7: Record<string, ShotDef> = {
  '7.1': { C: S71, amb: 'hall' },
  '7.2': { C: S72, amb: 'hall' },
  '7.3': { C: S73, amb: 'hall' },
  '7.4': {
    C: S74,
    amb: 'hall',
    fx: (h) => [
      hit('pop', h.at('L136', 'thở'), 0.9),
      hit('exhale', h.at('L136', 'thở'), 0.4),
      loopFor('steps_hall_loop', 0, h.L('L137') + 20, 0.35, 10),
    ],
  },
  '7.5': { C: S75, amb: 'hall', fx: (h) => [hit('shimmer', h.L('L139'), 0.5)] },
  '7.6': {
    C: S76,
    amb: 'none',
    fx: (h) => [
      loopFor('amb_canteen_loop', 0, h.L('L142') + 6, 0.42, 10),
      loopFor('amb_quiet_loop', h.L('L142') - 6, h.dur + 8, 0.55, 10),
      loopFor('steps_sidewalk_loop', h.L('L142'), h.L('L147') - 2, 0.45, 8),
      hit('exhale', h.L('L145'), 0.6),
      hit('pop', h.L('L145'), 0.7),
      hit('inhale', h.L('L146') - 10, 0.6),
      hit('shimmer', h.L('L146') + 6, 0.5),
    ],
  },
  '7.7': { C: S77, amb: 'alley', fx: (h) => [loopFor('steps_sidewalk_loop', 0, h.dur, 0.4, 8)] },
  '7.8': {
    C: S78,
    amb: 'class',
    fx: (h) => [hit('cloth', h.L('L151'), 0.5), hit('paper', 4, 0.3)],
  },
  '7.9': { C: S79, amb: 'night' },
  '7.10': {
    C: S710,
    amb: 'night',
    fx: (h) => [hit('blanket', h.L('L156') + 10, 0.8), hit('blanket', h.L('L156') + 40, 0.5)],
  },
};
