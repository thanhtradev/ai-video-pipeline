import React from 'react';
import { AbsoluteFill, interpolate } from 'remotion';
import { Character } from '../../ep1/Character';
import { Motorbike } from '../../ep1/props';
import { cutCam } from '../../ep1/Stage';
import { C, FONT } from '../../ep1/theme';
import { BigText } from '../../ep1/ui';
import {
  Ba,
  Ban,
  Clone,
  clamp,
  faceCam,
  hit,
  loopFor,
  Me,
  PopRing,
  popIn,
  ShotDef,
  snapPop,
  Stage2,
} from '../kit';
import { bedroomDay, dining, lot, PhoneScreen } from '../sets';
import { useShot } from '../time';

/** You lying on the bed scrolling a phone – blue screen light on the face. */
const PhoneBed: React.FC<{ f: number; glow?: number }> = ({ f, glow = 1 }) => (
  <g>
    <Character
      x={720}
      y={1305}
      size={1}
      seed={1}
      hoodieColor={C.orange}
      hair
      t={f}
      lean={-90}
      eyes="half"
      shadow={false}
    />
    <rect
      x={300}
      y={1100}
      width={54}
      height={86}
      rx={10}
      fill="#2b2f38"
      transform="rotate(-20 327 1143)"
    />
    <ellipse
      cx={300}
      cy={1220}
      rx={150}
      ry={120}
      fill="#7ab0ff"
      opacity={0.28 * glow}
      style={{ filter: 'blur(20px)' }}
    />
    <path
      d={`M440 1262 Q690 ${1226 + Math.sin(f / 50) * 4} 940 1262 L960 1420 L420 1420 Z`}
      fill="#d08a5a"
    />
  </g>
);

// Dining table: Dad left, Mom right, "your" seat in the middle
const BA = { x: 160, y: 1540 };
const ME = { x: 840, y: 1540 };
const SEAT = { x: 500, y: 1560 };

const S61: React.FC = () => {
  const { f, dur } = useShot('6.1');
  return (
    <Stage2
      set={bedroomDay(f, { dark: true })}
      cam={{ x: 520, y: 1180, z: interpolate(f, [0, dur], [1.2, 1.7]) }}
      f={f}
      actors={<PhoneBed f={f} />}
    />
  );
};
const S62: React.FC = () => {
  const { f, dur, L } = useShot('6.2');
  const pop = L('L113') + 4;
  const q = popIn(f, pop);
  const walk = interpolate(f, [pop + 8, dur], [0, 1], clamp);
  return (
    <Stage2
      set={bedroomDay(f, { dark: true, doorOpen: walk > 0 ? 1 : 0 })}
      cam={cutCam(
        f,
        [
          { at: 0, a: { x: 520, y: 1180, z: 1.7 }, b: { x: 520, y: 1180, z: 1.8 } },
          { at: pop - 2, a: { x: 1000, y: 1080, z: 1.15 }, b: { x: 1000, y: 1080, z: 1.2 } },
        ],
        dur,
      )}
      f={f}
      actors={
        <>
          <PhoneBed f={f} />
          <PopRing x={1100} y={1520} u={f - pop} />
          <Clone
            k={1}
            x={1100 + walk * 330}
            y={1520}
            t={f}
            opacity={q.opacity * (1 - walk * 0.3)}
            squash={q.squash}
            pose={walk > 0 ? 'walk' : 'stand'}
            facing={walk > 0 ? 1 : 0}
            eyes="half"
            itemR="bag"
          />
        </>
      }
    />
  );
};
const S63: React.FC = () => {
  const { f, dur, L } = useShot('6.3');
  const up = f >= L('L115') - 2 && f < L('L116') - 2;
  return up ? (
    <Stage2
      set={bedroomDay(f, { dark: true })}
      cam={{ x: 400, y: 1220, z: 2.0 }}
      f={f}
      actors={<PhoneBed f={f} />}
    />
  ) : (
    <Stage2
      set={dining(f, { night: true })}
      cam={cutCam(
        f,
        [
          { at: 0, a: { x: 500, y: 1040, z: 1.0 }, b: { x: 500, y: 1040, z: 1.08 } },
          {
            at: L('L116') - 2,
            a: faceCam(SEAT.x, SEAT.y, 1, 2.2, 60),
            b: faceCam(SEAT.x, SEAT.y, 1, 2.4, 60),
          },
        ],
        dur,
      )}
      f={f}
      actors={
        <>
          <Ba
            x={BA.x}
            y={BA.y}
            t={f}
            facing={1}
            pose={Math.floor(f / 20) % 2 ? 'shrug' : 'point'}
            eyes="happy"
          />
          <Me x={ME.x} y={ME.y} t={f} facing={-1} eyes="happy" />
          <Clone
            k={1}
            x={SEAT.x}
            y={SEAT.y}
            t={f}
            facing={-1}
            eyes="happy"
            look={{ x: -0.8, y: 0 }}
          />
        </>
      }
    />
  );
};
const S64: React.FC = () => {
  const { f, dur, L } = useShot('6.4');
  const bx = interpolate(f, [0, dur], [100, 900]);
  return (
    <Stage2
      set={lot(f)}
      cam={cutCam(
        f,
        [
          { at: 0, a: { x: bx, y: 1100, z: 1.1 }, b: { x: bx + 60, y: 1100, z: 1.15 } },
          {
            at: L('L118') - 2,
            a: faceCam(bx + 40, 1460, 1, 2.3, 60),
            b: faceCam(bx + 40, 1460, 1, 2.5, 60),
          },
          {
            at: L('L119') - 2,
            a: { x: bx - 100, y: 1100, z: 1.0 },
            b: { x: bx - 100, y: 1100, z: 1.05 },
          },
        ],
        dur,
      )}
      f={f}
      actors={
        <>
          <Motorbike x={bx} y={1520} s={0.85} f={f} running color="#8a5a50" />
          <Clone
            k={2}
            x={bx - 20}
            y={1400}
            t={f}
            pose="sitChair"
            facing={1}
            eyes="happy"
            handR={{ x: 160, y: -260 }}
          />
          <Ba x={bx - 380} y={1540} t={f} pose="armsUp" facing={1} eyes="happy" speed={1.2} />
        </>
      }
    />
  );
};
const S65: React.FC = () => {
  const { f, dur, L } = useShot('6.5');
  return (
    <AbsoluteFill>
      <Stage2
        set={bedroomDay(f, { dark: true })}
        cam={{ x: 520, y: 1180, z: interpolate(f, [0, dur], [1.4, 1.6]) }}
        f={f}
        actors={<PhoneBed f={f} />}
      />
      <BigText
        lines={['VIỆC GÌ CHÁN —', 'ĐỂ BẢN SAO LÀM']}
        from={L('L121')}
        f={f}
        y={120}
        size={100}
        accent={[1]}
      />
    </AbsoluteFill>
  );
};
const S66: React.FC = () => {
  const { f, dur } = useShot('6.6');
  const day = Math.floor(f / 18) % 2 === 0;
  return (
    <Stage2
      set={bedroomDay(f, { dark: !day })}
      cam={{ x: 400 + Math.sin(f / 30) * 20, y: 1220, z: 1.9 + (f % 18) * 0.004 }}
      f={f}
      actors={
        <>
          <PhoneBed f={f} glow={day ? 0.5 : 1.3} />
          {dur && null}
        </>
      }
    />
  );
};
const S67: React.FC = () => {
  const { f, dur, L } = useShot('6.7');
  return (
    <Stage2
      set={dining(f, { night: true })}
      cam={cutCam(
        f,
        [
          { at: 0, a: { x: 340, y: 1060, z: 1.25 }, b: { x: 340, y: 1060, z: 1.32 } },
          {
            at: L('L126') - 2,
            a: faceCam(BA.x, BA.y, 1.18, 2.2),
            b: faceCam(BA.x, BA.y, 1.18, 2.4),
          },
          { at: L('L127') - 2, a: { x: 330, y: 1100, z: 1.6 }, b: { x: 330, y: 1100, z: 1.7 } },
        ],
        dur,
      )}
      f={f}
      actors={
        <>
          <Ba x={BA.x} y={BA.y} t={f} facing={1} pose="reach" itemR="phone" eyes="happy" />
          <Ban x={SEAT.x} y={SEAT.y} t={f} facing={-1} eyes="normal" look={{ x: -1, y: 0.3 }} />
          <Me x={ME.x} y={ME.y} t={f} facing={-1} eyes="normal" />
        </>
      }
    />
  );
};
/** Photo on the phone: the clone riding a bike grinning, Dad running behind with a raised hand. */
const S68: React.FC = () => {
  const { f, dur } = useShot('6.8');
  const z = interpolate(f, [0, dur], [1.0, 1.35]);
  return (
    <AbsoluteFill style={{ background: '#1e1c24' }}>
      <svg width={1920} height={1080}>
        <g transform={`translate(960,560) scale(${z})`}>
          <PhoneScreen x={0} y={0} s={1.15} glow="#ffd27a">
            <foreignObject x={-190} y={-300} width={380} height={600}>
              <div style={{ width: 380, height: 600, overflow: 'hidden', position: 'relative' }}>
                <div
                  style={{
                    width: 1920,
                    height: 1080,
                    transform: 'scale(0.56) translate(-640px,-40px)',
                    transformOrigin: '0 0',
                    position: 'absolute',
                  }}
                >
                  <Stage2
                    set={lot(40)}
                    cam={{ x: 440, y: 1120, z: 1.15 }}
                    f={40}
                    actors={
                      <>
                        <Motorbike x={600} y={1520} s={0.85} f={40} color="#8a5a50" />
                        <Character
                          x={580}
                          y={1400}
                          seed={102}
                          hoodieColor={C.orange}
                          hair
                          t={40}
                          pose="sitChair"
                          facing={1}
                          eyes="happy"
                          handR={{ x: 160, y: -260 }}
                          blink={false}
                        />
                        <Ba
                          x={260}
                          y={1540}
                          t={40}
                          pose="armsUp"
                          facing={1}
                          eyes="happy"
                          blink={false}
                        />
                      </>
                    }
                  />
                </div>
              </div>
            </foreignObject>
            <text
              x={0}
              y={350}
              textAnchor="middle"
              fontFamily={FONT}
              fontWeight={800}
              fontSize={28}
              fill="#77737a"
            >
              Chủ nhật · 17:42
            </text>
          </PhoneScreen>
        </g>
      </svg>
    </AbsoluteFill>
  );
};
const S69: React.FC = () => {
  const { f, dur } = useShot('6.9');
  return (
    <Stage2
      set={dining(f, { night: true })}
      cam={cutCam(
        f,
        [
          {
            at: 0,
            a: faceCam(SEAT.x, SEAT.y, 1, 2.8),
            b: faceCam(SEAT.x, SEAT.y, 1, 3.2),
            hold: true,
          },
        ],
        dur,
      )}
      f={f}
      actors={
        <Ban
          x={SEAT.x}
          y={SEAT.y}
          t={f}
          facing={0}
          eyes="look"
          look={{ x: 0, y: 0.1 }}
          blink={false}
        />
      }
    />
  );
};
const S610: React.FC = () => {
  const { f, dur, L } = useShot('6.10');
  const give = interpolate(f, [4, 24], [0, 1], clamp);
  return (
    <Stage2
      set={dining(f, { night: true })}
      cam={cutCam(
        f,
        [
          { at: 0, a: { x: 680, y: 1200, z: 1.7 }, b: { x: 680, y: 1200, z: 1.8 } },
          {
            at: L('L136') - 2,
            a: faceCam(ME.x, ME.y, 1.08, 2.3),
            b: faceCam(ME.x, ME.y, 1.08, 2.5),
          },
        ],
        dur,
      )}
      f={f}
      actors={
        <>
          <Ban x={SEAT.x} y={SEAT.y} t={f} facing={1} eyes="normal" />
          <Me
            x={ME.x}
            y={ME.y}
            t={f}
            facing={-1}
            eyes="happy"
            pose="reach"
            handR={{ x: -200 + give * -60, y: -330 + give * 40 }}
          />
          <path
            d={`M${ME.x - 200 - give * 60} ${1185} l-40 0`}
            stroke="#c9884a"
            strokeWidth={14}
            strokeLinecap="round"
            opacity={give < 1 ? 1 : 0}
          />
        </>
      }
    />
  );
};
const S611: React.FC = () => {
  const { f, dur, L } = useShot('6.11');
  return (
    <Stage2
      set={dining(f, { night: true })}
      cam={cutCam(
        f,
        [
          { at: 0, a: faceCam(SEAT.x, SEAT.y, 1, 2.6), b: faceCam(SEAT.x, SEAT.y, 1, 2.8) },
          {
            at: L('L139') - 2,
            a: { x: SEAT.x, y: 1160, z: 2.2 },
            b: { x: SEAT.x, y: 1160, z: 2.4 },
          },
        ],
        dur,
      )}
      f={f}
      actors={
        <Ban
          x={SEAT.x}
          y={SEAT.y}
          t={f}
          facing={0}
          eyes={f >= L('L138') ? 'sad' : 'normal'}
          look={{ x: 0, y: 0.9 }}
          lean={f >= L('L139') ? 6 : 0}
        />
      }
    />
  );
};
const S612: React.FC = () => {
  const { f, dur } = useShot('6.12');
  return (
    <AbsoluteFill>
      <Stage2
        set={bedroomDay(f, { dark: true, doorOpen: 0.25 })}
        cam={{ x: 700, y: 1000, z: interpolate(f, [0, dur], [1.05, 0.9]) }}
        f={f}
        actors={
          <>
            <polygon
              points="1300,800 1380,800 1700,1700 1250,1700"
              fill="#ffc070"
              opacity={0.35}
              style={{ filter: 'blur(10px)' }}
            />
            <Character
              x={300}
              y={1330}
              seed={1}
              hoodieColor={C.orange}
              hair
              t={f}
              pose="sitChair"
              facing={1}
              eyes="half"
              look={{ x: 1, y: 0 }}
            />
          </>
        }
      />
    </AbsoluteFill>
  );
};

export const ACT6: Record<string, ShotDef> = {
  '6.1': {
    C: S61,
    amb: 'bedroom',
    fx: (h) =>
      [0, 30, 60, 90, 120].filter((t) => t < h.dur).map((t) => hit('phone_swipe', t, 0.25)),
  },
  '6.2': {
    C: S62,
    amb: 'bedroom',
    fx: (h) => [...snapPop(h.L('L113') + 4, 1, 0.5), hit('door_open', h.L('L113') + 20, 0.4)],
  },
  '6.3': {
    C: S63,
    amb: 'dinner',
    fx: (h) => [
      hit('chopsticks', 10, 0.5),
      hit('phone_swipe', h.L('L115'), 0.4),
      ...snapPop(h.L('L116'), 1, 0.35),
    ],
  },
  '6.4': {
    C: S64,
    amb: 'lot',
    fx: (h) => [
      loopFor('moto_idle_loop', 0, h.dur, 0.5, 10),
      loopFor('steps_tile_loop', 0, h.dur, 0.35, 10),
      ...snapPop(h.L('L119'), 1, 0.25),
    ],
  },
  '6.5': { C: S65, amb: 'bedroom', fx: (h) => [hit('whoosh_ui', h.L('L121'), 0.5)] },
  '6.6': {
    C: S66,
    amb: 'bedroom',
    fx: (h) => [0, 36, 72, 108].filter((t) => t < h.dur).map((t) => hit('phone_swipe', t, 0.22)),
  },
  '6.7': { C: S67, amb: 'dinner', fx: () => [hit('cloth', 4, 0.4)] },
  '6.8': { C: S68, amb: 'dinner' },
  '6.9': { C: S69, amb: 'dinner' },
  '6.10': { C: S610, amb: 'dinner', fx: () => [hit('chopsticks', 6, 0.7), hit('dishes', 22, 0.4)] },
  '6.11': { C: S611, amb: 'dinner' },
  '6.12': {
    C: S612,
    amb: 'quiet',
    fx: (h) => [loopFor('amb_dinner_loop', 0, h.dur + 8, 0.25, 12)],
  },
};
