import React from 'react';
import { AbsoluteFill, interpolate, random } from 'remotion';
import { Character, invis } from '../../../rig/Character';
import { Ban, bodyCam, clamp, faceCam, Friend, hit, loopFor, Me, ShotDef, Thay } from '../kit';
import {
  altarRoom,
  bathroom,
  bedroom,
  canteen,
  hallway,
  livingRoom,
  minimal,
  schoolYard,
  teacherRoom,
} from '../../../kits/whatif/sets';
import { SetStage } from '../../../kits/whatif/SetStage';
import { cutCam, WIDE } from '../../../kits/whatif/Stage';
import { C, FONT } from '../../../kits/whatif/theme';
import { tr, useShot } from '../time';
import { Bar, BigText, Grain, PhoneFrame, PortraitBox, Pow } from '../../../kits/whatif/ui';

// ───────── 5.1 Full-moon day: the altar ─────────
const PLATE = { x: 690, y: 960 };
const S51: React.FC = () => {
  const { f, dur, at, L } = useShot('5.1');
  const cam = cutCam(
    f,
    [
      { at: 0, a: faceCam(560, 1560, 1.1, 2.4), b: faceCam(560, 1560, 1.1, 2.7) },
      { at: L('L080') - 2, a: { x: 520, y: 880, z: 1.0 }, b: { x: 520, y: 900, z: 1.1 } },
      { at: L('L081') - 2, a: { x: 360, y: 940, z: 2.2 }, b: { x: 430, y: 940, z: 2.3 } },
      {
        at: at('L081', 'bánh bò') - 2,
        a: { x: PLATE.x, y: PLATE.y, z: 2.9 },
        b: { x: PLATE.x, y: PLATE.y, z: 3.1 },
      },
    ],
    dur,
  );
  const intro = f < L('L080') - 2;
  return (
    <SetStage
      set={intro ? livingRoom(f, { table: false }) : altarRoom(f)}
      cam={cam}
      f={f}
      actors={
        intro ? (
          <Ban x={560} y={1560} size={1.1} t={f} eyes="happy" look={{ x: 0.4, y: -0.2 }} />
        ) : null
      }
    />
  );
};

// ───────── 5.2 Eating the bánh bò one by one ─────────
const S52: React.FC = () => {
  const { f, dur, at, L } = useShot('5.2');
  const nin = at('L082', 'nín');
  const eat0 = L('L083');
  const eat1 = L('L085');
  const cakes = Math.round(interpolate(f, [eat0 + 4, eat1 - 6], [9, 5], clamp));
  const iv = invis(f, [[nin, 'vanish']]);
  const cam = cutCam(
    f,
    [
      { at: 0, a: { x: 640, y: 1160, z: 1.35 }, b: { x: 640, y: 1160, z: 1.45 } },
      {
        at: eat0 - 2,
        a: { x: PLATE.x, y: PLATE.y - 10, z: 3.0 },
        b: { x: PLATE.x, y: PLATE.y - 10, z: 3.25 },
      },
      { at: L('L084') - 2, a: bodyCam(300, 1720, 1.08, 1.5), b: bodyCam(300, 1720, 1.08, 1.6) },
      {
        at: eat1 - 2,
        a: { x: PLATE.x, y: PLATE.y - 10, z: 2.6 },
        b: { x: PLATE.x, y: PLATE.y - 10, z: 2.75 },
      },
    ],
    dur,
  );
  // crumbs fly up at the invisible "mouth" position
  const eating = f >= eat0 && f < eat1;
  return (
    <SetStage
      set={altarRoom(f, { cakes })}
      cam={cam}
      f={f}
      actors={
        <>
          <Ban
            x={860}
            y={1720}
            size={1.05}
            t={f}
            facing={-1}
            eyes="happy"
            puff={eating ? 0.6 + 0.4 * Math.abs(Math.sin(f / 4)) : 0}
            {...iv}
            pose={eating ? 'reach' : 'stand'}
            px={cam.z}
          />
          {eating && (
            <ellipse
              cx={PLATE.x + 40 + Math.sin(f / 3) * 10}
              cy={PLATE.y - 80 - ((f * 3) % 60)}
              rx={22}
              ry={14}
              fill="#f2ead8"
              opacity={0.9}
            />
          )}
          {f >= L('L084') - 2 && (
            <Me
              x={300}
              y={1720}
              t={f}
              facing={f < at('L084', 'quay') + 6 ? -1 : 1}
              eyes="normal"
              look={{ x: 1, y: -0.2 }}
            />
          )}
        </>
      }
    />
  );
};

// ───────── 5.3 Mom lights three more incense sticks ─────────
const S53: React.FC = () => {
  const { f, dur, L } = useShot('5.3');
  const lit = L('L086') + 20;
  const cam = cutCam(
    f,
    [
      { at: 0, a: faceCam(420, 1720, 1.08, 2.2, 60), b: faceCam(420, 1720, 1.08, 2.4, 60) },
      { at: L('L087') - 2, a: faceCam(420, 1720, 1.08, 2.9), b: faceCam(420, 1720, 1.08, 3.2) },
      { at: L('L088') - 2, a: { x: 480, y: 1000, z: 1.25 }, b: { x: 480, y: 1000, z: 1.3 } },
      { at: L('L089') - 2, a: faceCam(860, 1720, 1.05, 2.5), b: faceCam(860, 1720, 1.05, 2.8) },
    ],
    dur,
  );
  const bow = f >= L('L088') ? Math.max(0, Math.sin(((f - L('L088')) / 30) * Math.PI)) * 18 : 0;
  return (
    <SetStage
      set={altarRoom(f, { cakes: 4, extraIncense: f > lit ? 3 : 0 })}
      cam={cam}
      f={f}
      actors={
        <>
          <Me
            x={420}
            y={1720}
            t={f}
            facing={0}
            back={false}
            pose="pray"
            eyes={f >= L('L087') ? 'happy' : 'closed'}
            lean={bow}
            itemR={f < lit ? 'incense' : undefined}
          />
          {f >= L('L089') - 2 && (
            <>
              <Ban
                x={860}
                y={1720}
                size={1.05}
                t={f}
                facing={-1}
                eyes="half"
                look={{ x: 0.8, y: 0 }}
                puff={0.5 + 0.5 * Math.abs(Math.sin(f / 5))}
              />
              {[0, 1, 2, 3].map((i) => (
                <circle key={i} cx={830 + i * 18} cy={1340 + (i % 2) * 20} r={6} fill="#f2ead8" />
              ))}
            </>
          )}
        </>
      }
    />
  );
};

// ───────── 5.4 Sneaking into the teachers' room ─────────
const S54: React.FC = () => {
  const { f, dur, L } = useShot('5.4');
  const walkEnd = L('L091') - 4;
  const bx = interpolate(f, [0, walkEnd], [80, 520], clamp);
  const cam = cutCam(
    f,
    [
      { at: 0, a: { x: 420, y: 980, z: 1.0 }, b: { x: 500, y: 990, z: 1.06 } },
      { at: L('L091') - 2, a: { x: 470, y: 1210, z: 2.6 }, b: { x: 470, y: 1210, z: 2.8 } },
      { at: L('L092') - 2, a: { x: 440, y: 1220, z: 3.4 }, b: { x: 470, y: 1220, z: 3.4 } },
      { at: L('L093') - 2, a: { x: 500, y: 1220, z: 3.4 }, b: { x: 530, y: 1220, z: 3.5 } },
    ],
    dur,
  );
  return (
    <SetStage
      set={teacherRoom(f)}
      cam={cam}
      f={f}
      actors={
        <Ban
          x={bx}
          y={1470}
          size={0.98}
          t={f}
          pose={f < walkEnd ? 'walk' : 'stand'}
          facing={f < walkEnd ? 1 : 0}
          speed={0.7}
          invisible={1}
          eyes="squint"
          puff={1}
          px={cam.z}
        />
      }
    />
  );
};

// ───────── 5.5 Question three is too long (exam paper rolls to the floor) ─────────
const S55: React.FC = () => {
  const { f, dur, L, H } = useShot('5.5');
  const roll = interpolate(f, [L('L094') + 6, H('L094') + 20], [0, 1], clamp);
  const pop = L('L095');
  const iv = invis(f, [[pop, 'appear']], true);
  const cam = cutCam(
    f,
    [
      { at: 0, a: { x: 560, y: 1300, z: 1.6 }, b: { x: 580, y: 1400, z: 1.5 }, hold: true },
      { at: pop - 2, a: { x: 560, y: 1120, z: 1.25 }, b: { x: 560, y: 1120, z: 1.3 } },
    ],
    dur,
  );
  return (
    <SetStage
      set={teacherRoom(f, { roll })}
      cam={cam}
      f={f}
      actors={
        <Ban
          x={520}
          y={1470}
          size={0.98}
          t={f}
          eyes={f < pop ? 'squint' : 'wide'}
          puff={f < pop ? 1.2 : 0}
          shiver={f < pop ? 1 : 0}
          {...iv}
          px={cam.z}
        />
      }
    />
  );
};

// ───────── 5.6 The principal makes tea right beside you ─────────
const S56: React.FC = () => {
  const { f, dur, L, H } = useShot('5.6');
  const turn0 = L('L097');
  const turn = interpolate(f, [turn0, H('L097') + 10], [0, 1], clamp);
  const cam = cutCam(
    f,
    [
      { at: 0, a: bodyCam(800, 1480, 1.1, 1.45), b: bodyCam(800, 1480, 1.1, 1.55) },
      {
        at: turn0 - 2,
        a: faceCam(800, 1480, 1.1, 2.4),
        b: faceCam(800, 1480, 1.1, 2.9),
        hold: true,
      },
      { at: L('L098') - 2, a: { x: 640, y: 1100, z: 1.2 }, b: { x: 640, y: 1100, z: 1.25 } },
    ],
    dur,
  );
  return (
    <AbsoluteFill>
      <SetStage
        set={teacherRoom(f, { roll: 1 })}
        cam={cam}
        f={f}
        actors={
          <>
            <Ban
              x={480}
              y={1470}
              size={0.98}
              t={f}
              facing={1}
              eyes={f > turn0 ? 'wide' : 'normal'}
              shiver={f > turn0 ? 0.8 : 0}
            />
            <Thay
              x={800}
              y={1480}
              t={f}
              facing={turn > 0.5 ? -1 : 1}
              look={{ x: -turn, y: 0 }}
              eyes={f >= L('L098') ? 'half' : 'normal'}
              itemR="teapot"
              pose="hold"
              handR={{ x: 110 - turn * 20, y: -300 }}
            />
            {f < turn0 && (
              <path
                d={`M${905} ${1170} Q${910} ${1230} ${905} ${1290}`}
                stroke="#c9a46a"
                strokeWidth={6}
                fill="none"
                opacity={0.8}
              />
            )}
          </>
        }
      />
      <BigText
        lines={[tr('3 BUỔI TRỰC NHÀ VỆ SINH', '3 DAYS OF TOILET DUTY')]}
        from={L('L098')}
        f={f}
        y={150}
        size={110}
        accent={[0]}
      />
    </AbsoluteFill>
  );
};

// ───────── 5.7 So you train (montage) ─────────
const S57: React.FC = () => {
  const { f, L } = useShot('5.7');
  const cuts = ['L100', 'L101', 'L102', 'L103'].map((id) => L(id));
  const i =
    f < cuts[0] - 2 ? -1 : f < cuts[1] - 2 ? 0 : f < cuts[2] - 2 ? 1 : f < cuts[3] - 2 ? 2 : 3;
  const sets = [
    livingRoom(f, { table: false }),
    bedroom(f, { warm: 0.6 }),
    schoolYard(f),
    livingRoom(f, { table: false }),
    bathroom(f),
  ];
  const cams = [
    faceCam(540, 1520, 1.1, 2.0, 60),
    faceCam(560, 1520, 1.05, 2.6),
    bodyCam(480, 1500, 1.05, 1.6),
    faceCam(600, 1520, 1.1, 3.0),
    bodyCam(620, 1520, 1.05, 1.4),
  ];
  const k = i + 1;
  const x = [540, 560, 480, 600, 620][k];
  const local = f - (i < 0 ? 0 : cuts[i]);
  return (
    <AbsoluteFill>
      <SetStage
        set={sets[k]}
        cam={{ ...cams[k], z: cams[k].z * (1 + local * 0.002) }}
        f={f}
        actors={
          <Ban
            x={x}
            y={1520}
            size={1.08}
            t={f}
            eyes={i < 0 ? 'normal' : i === 3 ? 'squint' : 'squint'}
            puff={i < 0 ? 0 : 1}
            invisible={i < 0 ? 0 : 1}
            shiver={i >= 2 ? 1 : 0.3}
            pose={i === 3 ? 'armsUp' : 'stand'}
            px={cams[k].z}
          />
        }
      />
      {i >= 0 && (
        <Pow
          text={['0:40', '1:00', '1:30', '2:00'][i]}
          x={480}
          y={420}
          from={cuts[i]}
          f={f}
          size={150}
          color={['#4fd47a', '#4fd47a', '#ffc83a', '#ff4a3a'][i]}
          rot={-6}
        />
      )}
    </AbsoluteFill>
  );
};

// ───────── 5.8 Diving reflex ─────────
const Heart: React.FC<{ x: number; y: number; f: number; bpm: number; s?: number }> = ({
  x,
  y,
  f,
  bpm,
  s = 1,
}) => {
  const ph = ((f / 30) * bpm) / 60;
  const beat = Math.exp(-((ph % 1) * 8));
  return (
    <g transform={`translate(${x},${y}) scale(${s * (1 + beat * 0.15)})`}>
      <path
        d="M0 60 C-90 0 -90 -70 -40 -70 C-15 -70 0 -50 0 -35 C0 -50 15 -70 40 -70 C90 -70 90 0 0 60 Z"
        fill="#ff5a5a"
      />
      <text
        y={150}
        textAnchor="middle"
        fontFamily={FONT}
        fontWeight={800}
        fontSize={56}
        fill="#fff"
        stroke="#15121a"
        strokeWidth={8}
        paintOrder="stroke"
      >
        {Math.round(bpm)} {tr('nhịp/phút', 'bpm')}
      </text>
    </g>
  );
};
const S58: React.FC = () => {
  const { f, dur, at, L } = useShot('5.8');
  const fact = f < L('L105') - 2;
  const diag = f < L('L108') - 2;
  const bpm = interpolate(f, [L('L106'), L('L107')], [90, 55], clamp);
  const dunk = at('L108', 'úp');
  const lean = interpolate(f, [dunk - 6, dunk + 6], [0, -42], clamp);
  const splash = interpolate(f, [dunk + 4, dunk + 20], [0, 1], clamp);
  return (
    <AbsoluteFill>
      {diag ? (
        <SetStage
          set={minimal('#2f4a5a', '#1e2c38')}
          cam={cutCam(
            f,
            [
              { at: 0, a: { ...WIDE, z: 1 }, b: { ...WIDE, z: 1.05 } },
              { at: L('L105') - 2, a: { ...WIDE, z: 1.05 }, b: { ...WIDE, z: 1.12 } },
              { at: L('L106') - 2, a: { x: 500, y: 700, z: 1.2 }, b: { x: 500, y: 700, z: 1.28 } },
              { at: L('L107') - 2, a: { ...WIDE, z: 1.0 }, b: { ...WIDE, z: 1.05 } },
            ],
            dur,
          )}
          f={f}
          actors={
            fact ? null : (
              <>
                <g transform="translate(300,1000)">
                  <ellipse cx={0} cy={140} rx={260} ry={60} fill="#7ab0c8" opacity={0.8} />
                  <Character
                    x={40}
                    y={300}
                    size={0.7}
                    t={f}
                    seed={1}
                    hoodieColor={C.orange}
                    facing={-1}
                    lean={-30}
                    eyes="squint"
                    shadow={false}
                  />
                </g>
                <Heart x={760} y={720} f={f} bpm={f < L('L106') ? 90 : bpm} />
              </>
            )
          }
        />
      ) : (
        <SetStage
          set={bathroom(f, { splash })}
          cam={cutCam(
            f,
            [
              { at: 0, a: { x: 640, y: 1080, z: 1.2 }, b: { x: 640, y: 1080, z: 1.3 } },
              { at: dunk + 12, a: { x: 540, y: 1180, z: 2.2 }, b: { x: 540, y: 1180, z: 2.4 } },
            ],
            dur,
          )}
          f={f}
          actors={
            <Ban
              x={830}
              y={1500}
              size={1}
              t={f}
              facing={-1}
              lean={lean}
              eyes="squint"
              invisible={0}
              pose="hold"
            />
          }
        />
      )}
      {fact && (
        <Pow
          text={tr('CHUYỆN THẬT', 'TRUE FACT')}
          x={480}
          y={760}
          from={0}
          f={f}
          size={110}
          color="#ff7a1a"
          rot={-6}
        />
      )}
      {!fact && diag && (
        <BigText
          lines={[tr('PHẢN XẠ LẶN', 'DIVING REFLEX')]}
          from={at('L105', 'phản xạ')}
          f={f}
          y={330}
          size={104}
          color="#7ad0ff"
        />
      )}
    </AbsoluteFill>
  );
};

// ───────── 5.9 Mom thinks you are doing skincare ─────────
const S59: React.FC = () => {
  const { f, dur } = useShot('5.9');
  const peek = interpolate(f, [0, 10], [0, 1], clamp);
  return (
    <SetStage
      set={bathroom(f)}
      cam={cutCam(
        f,
        [
          {
            at: 0,
            a: faceCam(150, 1520, 1.08, 2.0, 40),
            b: faceCam(150, 1520, 1.08, 2.2, 40),
            hold: true,
          },
        ],
        dur,
      )}
      f={f}
      actors={
        <>
          <Ban x={830} y={1500} t={f} facing={-1} lean={-42} eyes="squint" pose="hold" />
          <Me
            x={60 + peek * 90}
            y={1520}
            t={f}
            facing={1}
            lean={14 * peek}
            eyes="half"
            look={{ x: 1, y: 0.2 }}
          />
        </>
      }
    />
  );
};

// ───────── 5.10 World record 11+ min vs 3 min ─────────
const S510: React.FC = () => {
  const { f, dur, at, L } = useShot('5.10');
  const k1 = interpolate(
    f,
    [at('L110', 'mười một') - 6, at('L110', 'mười một') + 16],
    [0, 1],
    clamp,
  );
  const k2 = interpolate(f, [L('L111'), L('L111') + 14], [0, 1], clamp);
  const proud = f >= L('L112') - 2;
  return (
    <AbsoluteFill>
      <SetStage
        set={minimal('#40384e', '#24202e')}
        cam={cutCam(
          f,
          [
            { at: 0, a: { ...WIDE, z: 1 }, b: { ...WIDE, z: 1.04 } },
            { at: L('L111') - 2, a: { ...WIDE, z: 1.06 }, b: { ...WIDE, z: 1.1 } },
            {
              at: L('L112') - 2,
              a: faceCam(500, 1700, 1.2, 2.0, 120),
              b: faceCam(500, 1700, 1.2, 2.2, 120),
            },
          ],
          dur,
        )}
        f={f}
        actors={
          <>
            {!proud && (
              <g>
                <Bar
                  x={90}
                  y={520}
                  w={760}
                  k={k1}
                  color="#7ad0ff"
                  label={tr('KỶ LỤC THẾ GIỚI', 'WORLD RECORD')}
                  value={tr('11+ PHÚT', '11+ MIN')}
                />
                <Bar
                  x={90}
                  y={800}
                  w={760}
                  k={k2 * (3 / 11.5)}
                  color={C.orange}
                  label={tr('BẠN', 'YOU')}
                  value={tr('3 PHÚT', '3 MIN')}
                />
              </g>
            )}
            <Ban
              x={500}
              y={1700}
              size={1.2}
              t={f}
              eyes={proud ? 'happy' : 'normal'}
              pose={proud ? 'armsUp' : 'stand'}
              look={{ x: 0, y: -0.6 }}
            />
          </>
        }
      />
      {proud && (
        <BigText
          lines={tr(['3 PHÚT', 'LÀ ĐỦ!'], ['3 MIN', 'IS ENOUGH!'])}
          from={L('L113')}
          f={f}
          y={300}
          size={110}
          accent={[0]}
        />
      )}
    </AbsoluteFill>
  );
};

// ───────── 6.1 The rumour: grainy phone clip ─────────
const Clip: React.FC<{ f: number; children: React.ReactNode; rec?: boolean; title?: string }> = ({
  f,
  children,
  rec = true,
  title,
}) => (
  <AbsoluteFill
    style={{
      transform: `translate(${Math.sin(f * 0.9) * 6}px,${Math.cos(f * 0.7) * 6}px) rotate(${Math.sin(f * 0.3) * 0.6}deg)`,
    }}
  >
    {children}
    <Grain f={f} a={0.28} />
    <AbsoluteFill style={{ background: 'rgba(40,40,30,0.12)' }} />
    {rec && (
      <div
        style={{
          position: 'absolute',
          left: 60,
          top: 140,
          fontFamily: FONT,
          fontWeight: 800,
          fontSize: 52,
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            background: Math.floor(f / 15) % 2 ? '#ff3a3a' : '#7a1a1a',
          }}
        />
        REC 00:{String(Math.floor(f / 30) % 60).padStart(2, '0')}
      </div>
    )}
    {title && (
      <div
        style={{
          position: 'absolute',
          left: 50,
          right: 50,
          bottom: 520,
          fontFamily: FONT,
          fontWeight: 800,
          fontSize: 84,
          color: '#fff',
          textAlign: 'center',
          WebkitTextStroke: '12px #15121a',
          paintOrder: 'stroke fill',
        }}
      >
        {title}
      </div>
    )}
  </AbsoluteFill>
);
const Scaled: React.FC<{ s: number; children: React.ReactNode }> = ({ s, children }) => (
  <div
    style={{
      width: 1080,
      height: 1920,
      transform: `scale(${s})`,
      transformOrigin: '0 0',
      position: 'absolute',
    }}
  >
    {children}
  </div>
);
const S61: React.FC = () => {
  const { f, dur, L } = useShot('6.1');
  const ids = ['L115', 'L116', 'L117', 'L118', 'L119', 'L120'].map((id) => L(id));
  const seg = ids.filter((t) => f >= t - 2).length; // 0 = rumour, 1 door, 2 chair, 3 bread, 4 person filming, 5 post, 6 headline
  const loc = f - (seg ? ids[seg - 1] : 0);
  if (seg === 0)
    return (
      <SetStage
        set={hallway(f)}
        cam={cutCam(
          f,
          [{ at: 0, a: { x: 560, y: 1000, z: 1.25 }, b: { x: 560, y: 1000, z: 1.35 } }],
          dur,
        )}
        f={f}
        actors={
          <>
            <Friend k={0} x={380} y={1560} t={f} facing={1} eyes="wide" />
            <Friend k={2} x={640} y={1580} t={f} facing={-1} eyes="half" look={{ x: -1, y: 0 }} />
          </>
        }
      />
    );
  const clipScene = (k: number) => {
    const ff = f;
    if (k === 1)
      return (
        <SetStage
          set={hallway(ff, { doorOpen: interpolate(loc, [4, 22], [0, 1], clamp) })}
          cam={{ x: 300, y: 1100, z: 1.4 }}
          f={ff}
        />
      );
    if (k === 2)
      return (
        <SetStage
          set={hallway(ff, { chairOut: interpolate(loc, [4, 20], [0, 1], clamp) })}
          cam={{ x: 500, y: 1150, z: 1.5 }}
          f={ff}
        />
      );
    return (
      <SetStage
        set={canteen(ff, { breadGone: loc > 10 })}
        cam={{ x: 300, y: 1560, z: 2.4 }}
        f={ff}
        actors={
          loc > 6 && loc < 16 ? (
            <circle cx={270} cy={1520 - (loc - 6) * 12} r={30} fill="#fff" opacity={0.4} />
          ) : null
        }
      />
    );
  };
  const phoneIn = seg >= 4;
  return (
    <AbsoluteFill style={{ background: '#2a2630' }}>
      {!phoneIn && <Clip f={f}>{clipScene(seg)}</Clip>}
      {phoneIn && (
        <>
          <SetStage set={hallway(f)} cam={{ x: 560, y: 1000, z: 1.2 }} f={f} blurBg={12} />
          <PortraitBox s={0.62} dy={10}>
            <PhoneFrame x={540} y={960} w={720} h={1300} rot={-3 + Math.sin(f / 20)}>
              <Scaled s={0.62}>
                {seg === 4 && <Clip f={f}>{clipScene(3)}</Clip>}
                {seg === 5 && (
                  <AbsoluteFill
                    style={{
                      background: '#18161c',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexDirection: 'column',
                      gap: 40,
                    }}
                  >
                    <div
                      style={{
                        width: 760,
                        height: 1000,
                        borderRadius: 30,
                        overflow: 'hidden',
                        position: 'relative',
                        opacity: 0.8,
                      }}
                    >
                      <Scaled s={0.7}>
                        <Clip f={f}>{clipScene(1)}</Clip>
                      </Scaled>
                    </div>
                    <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 64, color: '#fff' }}>
                      {tr('Đang đăng…', 'Posting…')}
                    </div>
                    <div style={{ width: 700, height: 30, borderRadius: 15, background: '#444' }}>
                      <div
                        style={{
                          width: `${interpolate(loc, [0, 24], [5, 100], clamp)}%`,
                          height: 30,
                          borderRadius: 15,
                          background: C.orange,
                        }}
                      />
                    </div>
                  </AbsoluteFill>
                )}
                {seg === 6 && (
                  <Clip
                    f={f}
                    title={tr('MA TRƯỜNG CẤP HAI 👻', 'THE GHOST OF THE MIDDLE SCHOOL 👻')}
                  >
                    {clipScene(2)}
                  </Clip>
                )}
              </Scaled>
            </PhoneFrame>
          </PortraitBox>
        </>
      )}
      {dur && null}
    </AbsoluteFill>
  );
};

// ───────── 6.2 Two million views ─────────
const S62: React.FC = () => {
  const { f, dur } = useShot('6.2');
  const n = Math.round(
    interpolate(f, [0, Math.min(dur - 10, 40)], [1200, 2000000], {
      ...clamp,
      easing: (t) => 1 - Math.pow(1 - t, 3),
    }),
  );
  return (
    <AbsoluteFill>
      <SetStage set={minimal('#3a3048', '#1e1a26')} cam={{ ...WIDE, z: 1 + f * 0.002 }} f={f} />
      <AbsoluteFill
        style={{ alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}
      >
        <div
          style={{ fontFamily: FONT, fontWeight: 800, fontSize: 70, color: '#fff', marginTop: -80 }}
        >
          {tr('👁 lượt xem', '👁 views')}
        </div>
        <div
          style={{
            fontFamily: FONT,
            fontWeight: 800,
            fontSize: 170,
            color: C.orange,
            WebkitTextStroke: '14px #15121a',
            paintOrder: 'stroke fill',
            transform: `scale(${1 + 0.05 * Math.sin(f / 2)})`,
          }}
        >
          {n.toLocaleString(tr('vi-VN', 'en-US'))}
        </div>
      </AbsoluteFill>
      <svg width={1920} height={1080} style={{ position: 'absolute' }}>
        {Array.from({ length: 14 }, (_, i) => {
          const t0 = i * 4;
          const u = f - t0;
          if (u < 0) return null;
          return (
            <text
              key={i}
              x={300 + random(`hx${i}`) * 1300}
              y={1000 - u * 14}
              fontSize={70}
              opacity={interpolate(u, [0, 30], [1, 0], clamp)}
            >
              {['❤️', '😱', '👻'][i % 3]}
            </text>
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};

// ───────── 6.3 Ghost-hunting group, the meter stays still ─────────
const Hunters: React.FC<{ f: number; nod?: number; look?: number }> = ({
  f,
  nod = 0,
  look = 0,
}) => (
  <>
    <Character
      x={300}
      y={1560}
      size={1.02}
      seed={21}
      t={f}
      hoodieColor="#6f6a5a"
      accessories={['cap']}
      facing={1}
      pose="hold"
      itemR="detector"
      eyes="half"
      lean={nod}
      look={{ x: look, y: 0 }}
    />
    <Character
      x={560}
      y={1580}
      size={0.98}
      seed={22}
      t={f}
      hoodieColor="#5f6a72"
      accessories={['glassesSquare']}
      facing={1}
      pose="hold"
      itemR="detector"
      eyes="half"
      lean={nod * 0.8}
      look={{ x: look, y: 0 }}
    />
  </>
);
const S63: React.FC = () => {
  const { f, dur, L } = useShot('6.3');
  const cam = cutCam(
    f,
    [
      { at: 0, a: { x: 560, y: 1000, z: 1.05 }, b: { x: 560, y: 1000, z: 1.12 } },
      { at: L('L123') - 2, a: { x: 680, y: 1060, z: 1.5 }, b: { x: 680, y: 1060, z: 1.6 } },
      { at: L('L124') - 2, a: faceCam(800, 1570, 1, 2.6), b: faceCam(800, 1570, 1, 2.8) },
      {
        at: L('L125') - 2,
        a: { x: 700, y: 1270, z: 3.4 },
        b: { x: 700, y: 1270, z: 3.6 },
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
          <Hunters f={f} />
          <Ban x={800} y={1570} t={f} invisible={1} eyes="squint" puff={1} px={cam.z} />
        </>
      }
    />
  );
};
const S64: React.FC = () => {
  const { f, dur, L } = useShot('6.4');
  const nod = Math.sin(f / 5) * 5;
  return (
    <AbsoluteFill>
      <SetStage
        set={hallway(f)}
        cam={cutCam(
          f,
          [
            { at: 0, a: { x: 440, y: 1000, z: 1.6 }, b: { x: 440, y: 1000, z: 1.7 } },
            { at: L('L127') - 2, a: { x: 560, y: 1050, z: 1.25 }, b: { x: 560, y: 1050, z: 1.35 } },
          ],
          dur,
        )}
        f={f}
        actors={
          <>
            <Hunters f={f} nod={nod} look={-0.3} />
            <Ban x={800} y={1570} t={f} invisible={1} eyes="happy" shiver={1.2} px={1.3} />
          </>
        }
      />
      <Pow
        text={tr('MA RẤT MẠNH', 'VERY POWERFUL GHOST')}
        x={470}
        y={430}
        from={L('L127')}
        f={f}
        size={110}
        color="#b7a6ff"
        rot={-5}
      />
    </AbsoluteFill>
  );
};

export const ACT56: Record<string, ShotDef> = {
  '5.1': { C: S51, amb: 'altar' },
  '5.2': {
    C: S52,
    amb: 'altar',
    fx: (h) => [
      hit('inhale', h.at('L082', 'nín') - 20, 0.5),
      hit('shimmer', h.at('L082', 'nín'), 0.7),
      hit('chew', h.L('L083') + 4, 0.8),
      hit('chew', h.L('L083') + 44, 0.7),
      hit('chew', h.H('L083'), 0.8),
      loopFor('steps_tile_loop', h.L('L084') - 6, h.at('L084', 'quay') + 6, 0.5, 4),
    ],
  },
  '5.3': {
    C: S53,
    amb: 'altar',
    fx: (h) => [
      hit('lighter', h.L('L086') + 4, 0.8),
      hit('cloth', h.L('L088'), 0.3),
      hit('chew', h.L('L089'), 0.6),
    ],
  },
  '5.4': {
    C: S54,
    amb: 'teacher',
    fx: (h) => [
      loopFor('steps_hall_loop', 0, h.L('L091') - 4, 0.3, 4),
      hit('paper', h.L('L092'), 0.4),
      hit('paper', h.L('L093'), 0.4),
    ],
  },
  '5.5': {
    C: S55,
    amb: 'teacher',
    fx: (h) => [hit('paper_roll', h.L('L094') + 6, 0.9), hit('pop', h.L('L095'), 1)],
  },
  '5.6': {
    C: S56,
    amb: 'teacher',
    fx: (h) => [
      hit('tea_pour', 0, 0.7),
      hit('cup', h.L('L097') - 6, 0.6),
      hit('whoosh_ui', h.L('L098'), 0.5),
    ],
  },
  '5.7': {
    C: S57,
    amb: 'living',
    fx: (h) => ['L100', 'L101', 'L102', 'L103'].map((id) => hit('whoosh', h.L(id) - 3, 0.5)),
  },
  '5.8': {
    C: S58,
    amb: 'bath',
    fx: (h) => [
      hit('whoosh_ui', 0, 0.6),
      hit('water', h.at('L108', 'úp') + 4, 1),
      hit('bubbles', h.at('L108', 'úp') + 14, 0.8),
    ],
  },
  '5.9': {
    C: S59,
    amb: 'bath',
    fx: () => [hit('door_creak', 0, 0.6), loopFor('bubbles', 0, 60, 0.4, 6)],
  },
  '5.10': {
    C: S510,
    amb: 'rules',
    fx: (h) => [
      hit('whoosh_ui', h.at('L110', 'mười một') - 6, 0.6),
      hit('whoosh_ui', h.L('L111'), 0.6),
      hit('sparkle', h.L('L113'), 0.5),
    ],
    capY: 950,
  },
  '6.1': {
    C: S61,
    amb: 'hall',
    fx: (h) => [
      hit('door_creak', h.L('L115') + 4, 0.9),
      hit('chair_long', h.L('L116') + 4, 0.9),
      hit('whoosh', h.L('L117') + 6, 0.5),
      hit('glitch', h.L('L115') - 2, 0.5),
      hit('glitch', h.L('L118') - 2, 0.5),
      hit('whoosh_ui', h.L('L119'), 0.5),
      hit('ting', h.L('L120'), 0.6),
    ],
  },
  '6.2': {
    C: S62,
    amb: 'rules',
    fx: () => Array.from({ length: 8 }, (_, i) => hit('ting', i * 5, 0.5 - i * 0.03)),
  },
  '6.3': { C: S63, amb: 'hall', fx: (h) => [loopFor('static_loop', 0, h.dur, 0.12, 8)] },
  '6.4': { C: S64, amb: 'hall', fx: (h) => [loopFor('static_loop', 0, h.dur, 0.1, 8)] },
};
