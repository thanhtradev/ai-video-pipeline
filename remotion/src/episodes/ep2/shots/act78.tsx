import React from 'react';
import { AbsoluteFill, interpolate } from 'remotion';
import { Character } from '../../../rig/Character';
import { minimal } from '../../../kits/whatif/sets';
import { cutCam, WIDE } from '../../../kits/whatif/Stage';
import { C, FONT } from '../../../kits/whatif/theme';
import { BigText } from '../../../kits/whatif/ui';
import {
  Ba,
  Ban,
  bodyCam,
  ClonerCounter,
  Clone,
  clamp,
  Dust,
  faceCam,
  FlashTone,
  hit,
  loopFor,
  Me,
  PopRing,
  popIn,
  ShotDef,
  snapPop,
  Stage2,
} from '../kit';
import { balcony, bedroomDay, dining, kitchen, lot, stairs } from '../../../kits/whatif/sets-home';
import { useShot } from '../time';
import { Motorbike, PlasticChair } from '../../../kits/whatif/props';
import { livingRoom } from '../../../kits/whatif/sets';

/** Extreme close-up of a clock on a dark background. */
const ClockCU: React.FC<{ f: number; time: string; dur: number; ring?: boolean }> = ({
  f,
  time,
  dur,
  ring,
}) => (
  <Stage2
    set={bedroomDay(f, { dark: true, time, ring })}
    cam={{ x: -20, y: 1170, z: interpolate(f, [0, dur], [3.0, 3.4]) }}
    f={f}
  />
);

// Balcony: the clone's plastic chair at x=560; you sit on the floor beside it at x=860
const CH = { x: 560, y: 1500 };
const BN = { x: 880, y: 1560 };
const CloneOnChair: React.FC<{
  f: number;
  eyes?: 'normal' | 'happy' | 'half' | 'closed';
  back?: boolean;
  opacity?: number;
}> = ({ f, eyes = 'normal', back, opacity }) => (
  <Clone
    k={1}
    x={CH.x}
    y={CH.y}
    t={f}
    pose="sitChair"
    facing={back ? 0 : 1}
    back={back}
    eyes={eyes}
    opacity={opacity}
  />
);

// ───────── 7.1 Mom's birthday: cake downstairs · ranked games upstairs ─────────
const S71: React.FC = () => {
  const { f, dur, L } = useShot('7.1');
  const up = f >= L('L144') - 2;
  const pop = L('L145') + 6;
  const q = popIn(f, pop);
  return up ? (
    <Stage2
      set={bedroomDay(f, { dark: true })}
      cam={cutCam(
        f,
        [
          { at: 0, a: { x: 1080, y: 1080, z: 1.5 }, b: { x: 1080, y: 1080, z: 1.6 } },
          { at: pop - 2, a: { x: 900, y: 1060, z: 1.15 }, b: { x: 900, y: 1060, z: 1.2 } },
        ],
        dur,
      )}
      f={f}
      actors={
        <>
          <PlasticChair x={1080} y={1440} color="#4f6a80" />
          <Ban x={1080} y={1440} t={f} back pose="sitChair" handR={{ x: 60, y: -300 }} />
          <ellipse
            cx={1050}
            cy={1040}
            rx={180}
            ry={120}
            fill="#7ab0ff"
            opacity={0.25}
            style={{ filter: 'blur(20px)' }}
          />
          <PopRing x={760} y={1520} u={f - pop} />
          <Clone
            k={1}
            x={760 + interpolate(f, [pop + 10, dur], [0, 500], clamp)}
            y={1520}
            t={f}
            opacity={q.opacity}
            squash={q.squash}
            pose={f > pop + 10 ? 'walk' : 'stand'}
            facing={f > pop + 10 ? 1 : 0}
            eyes="normal"
          />
        </>
      }
    />
  ) : (
    <Stage2
      set={dining(f, { night: true, cake: true })}
      cam={cutCam(
        f,
        [{ at: 0, a: { x: 500, y: 1100, z: 1.6 }, b: { x: 500, y: 1100, z: 1.7 } }],
        dur,
      )}
      f={f}
      actors={
        <>
          <Ba x={160} y={1540} t={f} facing={1} eyes="happy" />
          <Me x={840} y={1540} t={f} facing={-1} eyes="happy" />
        </>
      }
    />
  );
};
const S72: React.FC = () => {
  const { f, dur, L } = useShot('7.2');
  const door = interpolate(f, [L('L148'), L('L148') + 16], [0, 1], clamp);
  return f < L('L148') - 2 ? (
    <ClockCU f={f} time="23:50" dur={dur} />
  ) : (
    <Stage2
      set={balcony(f, { doorOpen: door })}
      cam={cutCam(
        f,
        [{ at: 0, a: { x: -480, y: 1060, z: 1.4 }, b: { x: -440, y: 1060, z: 1.5 } }],
        dur,
      )}
      f={f}
      actors={
        <Ban
          x={-480 + door * 160}
          y={1560}
          t={f}
          pose="walk"
          facing={1}
          eyes="normal"
          speed={0.6}
        />
      }
    />
  );
};
const S73: React.FC = () => {
  const { f, dur, L } = useShot('7.3');
  return (
    <Stage2
      set={balcony(f, { doorOpen: 1 })}
      cam={cutCam(
        f,
        [
          { at: 0, a: { x: 600, y: 940, z: 0.95 }, b: { x: 600, y: 930, z: 1.05 } },
          { at: L('L150') - 2, a: { x: CH.x, y: 1280, z: 1.7 }, b: { x: CH.x, y: 1280, z: 1.8 } },
          { at: L('L151') - 2, a: { x: 900, y: 800, z: 1.2 }, b: { x: 900, y: 780, z: 1.3 } },
        ],
        dur,
      )}
      f={f}
      actors={<CloneOnChair f={f} back />}
    />
  );
};
const S74: React.FC = () => {
  const { f, dur, L } = useShot('7.4');
  const sit = f >= L('L153') - 2;
  return (
    <Stage2
      set={balcony(f, { doorOpen: 1 })}
      cam={cutCam(
        f,
        [
          { at: 0, a: faceCam(CH.x, CH.y, 1, 2.8, 140), b: faceCam(CH.x, CH.y, 1, 3.0, 140) },
          { at: L('L153') - 2, a: { x: 720, y: 1180, z: 1.45 }, b: { x: 720, y: 1180, z: 1.55 } },
        ],
        dur,
      )}
      f={f}
      actors={
        <>
          <CloneOnChair f={f} eyes="normal" />
          {sit && (
            <Ban
              x={BN.x}
              y={BN.y}
              t={f}
              pose="sitGround"
              facing={-1}
              eyes="normal"
              look={{ x: -0.6, y: 0 }}
            />
          )}
        </>
      }
    />
  );
};
/** Flashback of the evenings the clone lived. */
const S75: React.FC = () => {
  const { f, dur, L } = useShot('7.5');
  return (
    <FlashTone>
      <Stage2
        set={dining(f, { night: true })}
        cam={cutCam(
          f,
          [
            { at: 0, a: { x: 500, y: 1100, z: 1.6 }, b: { x: 500, y: 1100, z: 1.7 } },
            { at: L('L155') - 2, a: { x: 660, y: 1160, z: 1.9 }, b: { x: 660, y: 1160, z: 2.0 } },
            {
              at: L('L156') - 2,
              a: faceCam(840, 1540, 1.08, 2.3),
              b: faceCam(840, 1540, 1.08, 2.5),
            },
          ],
          dur,
        )}
        f={f}
        actors={
          <>
            <Ba x={160} y={1540} t={f} facing={1} eyes="happy" />
            <Clone k={1} x={500} y={1560} t={f} facing={1} eyes="happy" />
            <Me
              x={840}
              y={1540}
              t={f}
              facing={-1}
              eyes="happy"
              pose={f >= L('L155') && f < L('L156') ? 'reach' : 'stand'}
              handR={f >= L('L155') && f < L('L156') ? { x: -230, y: -310 } : undefined}
            />
          </>
        }
      />
    </FlashTone>
  );
};
const S76: React.FC = () => {
  const { f, dur, L } = useShot('7.6');
  return (
    <FlashTone>
      <Stage2
        set={dining(f, { night: true })}
        cam={cutCam(
          f,
          [
            { at: 0, a: faceCam(160, 1540, 1.18, 2.0, 80), b: faceCam(160, 1540, 1.18, 2.2, 80) },
            {
              at: L('L158') - 2,
              a: faceCam(500, 1560, 1, 2.4, 60),
              b: faceCam(500, 1560, 1, 2.6, 60),
            },
            { at: L('L159') - 2, a: { x: 330, y: 1060, z: 1.35 }, b: { x: 330, y: 1060, z: 1.45 } },
          ],
          dur,
        )}
        f={f}
        actors={
          <>
            <Ba
              x={160}
              y={1540}
              t={f}
              facing={1}
              pose={Math.floor(f / 15) % 2 ? 'shrug' : 'armsUp'}
              eyes="happy"
            />
            <Clone
              k={1}
              x={500}
              y={1560}
              t={f}
              facing={-1}
              eyes="happy"
              pose="hold"
              handR={{ x: -40, y: -380 }}
            />
          </>
        }
      />
    </FlashTone>
  );
};
const S77: React.FC = () => {
  const { f, dur } = useShot('7.7');
  return (
    <Stage2
      set={balcony(f, { doorOpen: 1 })}
      cam={cutCam(
        f,
        [{ at: 0, a: { x: 720, y: 1150, z: 1.5 }, b: { x: 720, y: 1150, z: 1.55 } }],
        dur,
      )}
      f={f}
      actors={
        <>
          <CloneOnChair f={f} eyes="normal" />
          <Ban
            x={BN.x}
            y={BN.y}
            t={f}
            pose="sitGround"
            facing={-1}
            eyes="wide"
            look={{ x: -0.8, y: -0.2 }}
          />
        </>
      }
    />
  );
};
const S78: React.FC = () => {
  const { f, dur } = useShot('7.8');
  return (
    <Stage2
      set={balcony(f, { doorOpen: 1 })}
      cam={{ ...faceCam(CH.x, CH.y, 1, interpolate(f, [0, dur], [1.8, 3.0]), 140) }}
      f={f}
      actors={
        <>
          <CloneOnChair f={f} eyes="normal" />
          <Ban x={BN.x} y={BN.y} t={f} pose="sitGround" facing={-1} eyes="normal" />
        </>
      }
    />
  );
};
/** Quick flashback strip: each evening breaks into light particles. */
const S79: React.FC = () => {
  const { f, dur, L } = useShot('7.9');
  const ids = ['L166', 'L167', 'L168', 'L169', 'L170', 'L171', 'L172'];
  const seg = Math.max(0, ids.filter((id) => f >= L(id) - 2).length - 1);
  const local = f - L(ids[seg]);
  const k = interpolate(local, [12, 40], [0, 1], clamp);
  const scenes = [
    () => (
      <Stage2
        set={dining(f, { night: true })}
        cam={{ x: 500, y: 1100, z: 1.5 }}
        f={f}
        actors={
          <>
            <Ba x={160} y={1540} t={f} facing={1} eyes="happy" />
            <Clone k={1} x={500} y={1560} t={f} opacity={1 - k} eyes="happy" />
            <Dust x={500} y={1560} k={k} f={f} seed={11} />
          </>
        }
      />
    ),
    () => (
      <Stage2
        set={lot(f)}
        cam={{ x: 500, y: 1100, z: 1.3 }}
        f={f}
        actors={
          <>
            <Motorbike x={520} y={1520} s={0.85} f={f} color="#8a5a50" />
            <Clone
              k={2}
              x={500}
              y={1400}
              t={f}
              pose="sitChair"
              facing={1}
              opacity={1 - k}
              eyes="happy"
            />
            <Dust x={500} y={1400} k={k} f={f} seed={12} />
          </>
        }
      />
    ),
    () => (
      <Stage2
        set={livingRoom(f, { table: false, lights: (q) => q % 2 === 0 })}
        cam={{ x: 560, y: 1080, z: 1.3 }}
        f={f}
        actors={
          <>
            <Clone k={3} x={560} y={1540} t={f} pose="pray" opacity={1 - k} eyes="happy" />
            <Dust x={560} y={1540} k={k} f={f} seed={13} />
          </>
        }
      />
    ),
    () => (
      <Stage2
        set={dining(f, { night: true, cake: true })}
        cam={{ x: 500, y: 1100, z: 1.5 }}
        f={f}
        actors={
          <>
            <Me x={840} y={1540} t={f} facing={-1} eyes="happy" />
            <Clone
              k={4}
              x={500}
              y={1560}
              t={f}
              opacity={1 - k}
              eyes="happy"
              pose="hug"
              facing={1}
            />
            <Dust x={500} y={1560} k={k} f={f} seed={14} />
          </>
        }
      />
    ),
  ];
  const S = scenes[seg % scenes.length];
  return (
    <FlashTone>
      <S />
      {dur && null}
    </FlashTone>
  );
};
const S710: React.FC = () => {
  const { f, dur } = useShot('7.10');
  return <ClockCU f={f} time="23:55" dur={dur} />;
};
const S711: React.FC = () => {
  const { f, dur, L } = useShot('7.11');
  return (
    <Stage2
      set={balcony(f, { doorOpen: 1 })}
      cam={cutCam(
        f,
        [
          {
            at: 0,
            a: faceCam(BN.x, BN.y - 100, 1, 2.6, 40),
            b: faceCam(BN.x, BN.y - 100, 1, 2.8, 40),
          },
          {
            at: L('L175') - 2,
            a: faceCam(CH.x, CH.y, 1, 2.9, 140),
            b: faceCam(CH.x, CH.y, 1, 3.2, 140),
            hold: true,
          },
        ],
        dur,
      )}
      f={f}
      actors={
        <>
          <CloneOnChair f={f} eyes={f >= L('L175') ? 'happy' : 'normal'} />
          <Ban
            x={BN.x}
            y={BN.y}
            t={f}
            pose="sitGround"
            facing={-1}
            eyes="normal"
            look={{ x: -0.8, y: -0.3 }}
          />
        </>
      }
    />
  );
};
const S712: React.FC = () => {
  const { f, dur, L } = useShot('7.12');
  const hands = interpolate(f, [0, dur * 0.4], [0.05, 0.6], clamp);
  const body = interpolate(f, [dur * 0.45, dur], [0, 0.35], clamp);
  return (
    <Stage2
      set={balcony(f, { doorOpen: 1 })}
      cam={cutCam(
        f,
        [
          { at: 0, a: { x: CH.x + 40, y: 1300, z: 2.6 }, b: { x: CH.x + 40, y: 1300, z: 2.9 } },
          { at: L('L178') - 2, a: { x: CH.x, y: 1150, z: 1.8 }, b: { x: CH.x, y: 1150, z: 1.95 } },
          {
            at: L('L179') - 2,
            a: faceCam(CH.x, CH.y, 1, 2.7, 140),
            b: faceCam(CH.x, CH.y, 1, 2.9, 140),
          },
          { at: L('L181') - 2, a: { x: 720, y: 1120, z: 1.35 }, b: { x: 720, y: 1110, z: 1.5 } },
        ],
        dur,
      )}
      f={f}
      actors={
        <>
          <CloneOnChair f={f} eyes="happy" opacity={1 - body * 0.5} />
          <Dust x={CH.x} y={CH.y} k={hands} f={f} seed={21} hands n={30} />
          <Dust x={CH.x} y={CH.y} k={body} f={f} seed={22} n={40} />
          <Ban
            x={BN.x}
            y={BN.y}
            t={f}
            pose="sitGround"
            facing={-1}
            eyes="wide"
            look={{ x: -0.8, y: -0.2 }}
          />
        </>
      }
    />
  );
};
const S713: React.FC = () => {
  const { f, dur, L, H } = useShot('7.13');
  const clock = f < L('L183') - 2;
  const k = interpolate(f, [L('L183'), H('L183') + 30], [0.35, 1], clamp);
  return clock ? (
    <ClockCU f={f} time="00:00" dur={dur} />
  ) : (
    <Stage2
      set={balcony(f, { doorOpen: 1 })}
      cam={cutCam(
        f,
        [
          { at: 0, a: { x: CH.x, y: 1100, z: 1.6 }, b: { x: CH.x, y: 950, z: 1.3 }, hold: true },
          { at: L('L184') - 2, a: { x: 720, y: 1150, z: 1.4 }, b: { x: 720, y: 1150, z: 1.5 } },
        ],
        dur,
      )}
      f={f}
      actors={
        <>
          <CloneOnChair f={f} eyes="closed" opacity={Math.max(0, 1 - k * 1.25)} />
          <Dust x={CH.x} y={CH.y} k={k} f={f} seed={23} n={90} />
          <Ban
            x={BN.x}
            y={BN.y}
            t={f}
            pose="sitGround"
            facing={-1}
            eyes={k > 0.9 ? 'sad' : 'wide'}
            look={{ x: -0.8, y: -0.4 }}
          />
        </>
      }
    />
  );
};
const S714: React.FC = () => {
  const { f, dur, L } = useShot('7.14');
  const touch = interpolate(f, [L('L187'), L('L187') + 20], [0, 1], clamp);
  return (
    <Stage2
      set={balcony(f, { doorOpen: 1 })}
      cam={cutCam(
        f,
        [{ at: 0, a: { x: CH.x, y: 1300, z: 2.2 }, b: { x: CH.x, y: 1300, z: 2.4 }, hold: true }],
        dur,
      )}
      f={f}
      actors={
        <>
          <path
            d={`M1100 1700 Q900 ${1500 - touch * 100} ${700 - touch * 60} ${1440 - touch * 60}`}
            stroke={C.orange}
            strokeWidth={60}
            fill="none"
            strokeLinecap="round"
            opacity={touch > 0 ? 1 : 0}
          />
          {touch > 0 && <circle cx={680 - touch * 60} cy={1420 - touch * 60} r={30} fill={C.ink} />}
          <ellipse
            cx={CH.x}
            cy={1340}
            rx={120}
            ry={40}
            fill="#ffc870"
            opacity={0.18}
            style={{ filter: 'blur(12px)' }}
          />
        </>
      }
    />
  );
};
const S715: React.FC = () => {
  const { f, dur } = useShot('7.15');
  return (
    <Stage2
      set={balcony(f, { doorOpen: 1 })}
      cam={{ x: 640, y: 900, z: interpolate(f, [0, dur], [1.0, 0.82]) }}
      f={f}
      actors={<Ban x={720} y={1540} t={f} back pose="stand" />}
    />
  );
};

// ───────── 8. Kitchen at night ─────────
const SINK = { me: { x: 400, y: 1520 }, ban: { x: 740, y: 1540 } };
const S81: React.FC = () => {
  const { f, dur, L } = useShot('8.1');
  return f < L('L193') - 2 ? (
    <Stage2
      set={stairs(f)}
      cam={{
        x: interpolate(f, [0, L('L193')], [200, 600], clamp),
        y: interpolate(f, [0, L('L193')], [700, 1050], clamp),
        z: 1.15,
      }}
      f={f}
      actors={
        <Ban
          x={interpolate(f, [0, L('L193')], [150, 650], clamp)}
          y={interpolate(f, [0, L('L193')], [800, 1360], clamp)}
          t={f}
          pose="walk"
          facing={1}
          eyes="normal"
          speed={0.6}
        />
      }
    />
  ) : (
    <Stage2
      set={kitchen(f, { water: 1 })}
      cam={cutCam(
        f,
        [{ at: 0, a: { x: 500, y: 960, z: 1.0 }, b: { x: 500, y: 960, z: 1.06 } }],
        dur,
      )}
      f={f}
      actors={<Me x={SINK.me.x} y={SINK.me.y} t={f} back pose="hold" />}
    />
  );
};
const S82: React.FC = () => {
  const { f, dur, L } = useShot('8.2');
  const turned = f >= L('L195') - 2;
  return (
    <Stage2
      set={kitchen(f, { water: 1 })}
      cam={cutCam(
        f,
        [
          {
            at: 0,
            a: bodyCam(SINK.ban.x, SINK.ban.y, 1, 1.4),
            b: bodyCam(SINK.ban.x, SINK.ban.y, 1, 1.5),
          },
          {
            at: L('L195') - 2,
            a: faceCam(SINK.me.x, SINK.me.y, 1.08, 2.6),
            b: faceCam(SINK.me.x, SINK.me.y, 1.08, 2.8),
          },
        ],
        dur,
      )}
      f={f}
      actors={
        <>
          <Me
            x={SINK.me.x}
            y={SINK.me.y}
            t={f}
            back={!turned}
            facing={turned ? 1 : 0}
            eyes="wide"
            pose="hold"
          />
          <Ban x={SINK.ban.x} y={SINK.ban.y} t={f} facing={-1} eyes="normal" />
        </>
      }
    />
  );
};
const S83: React.FC = () => {
  const { f, dur } = useShot('8.3');
  return (
    <Stage2
      set={kitchen(f, { water: 1 })}
      cam={cutCam(
        f,
        [{ at: 0, a: { x: 560, y: 1080, z: 1.25 }, b: { x: 560, y: 1080, z: 1.35 } }],
        dur,
      )}
      f={f}
      actors={
        <>
          <Me x={SINK.me.x} y={SINK.me.y} t={f} back pose="stand" />
          <Ban
            x={560}
            y={SINK.ban.y}
            t={f}
            back
            pose="hold"
            handR={{ x: 20, y: -290 + Math.sin(f / 6) * 10 }}
            handL={{ x: -60, y: -300 + Math.cos(f / 6) * 10 }}
          />
        </>
      }
    />
  );
};
const S84: React.FC = () => {
  const { f, dur, L } = useShot('8.4');
  return (
    <Stage2
      set={kitchen(f, { water: 1 })}
      cam={cutCam(
        f,
        [
          {
            at: 0,
            a: faceCam(560, SINK.ban.y, 1, 2.7, 60),
            b: faceCam(560, SINK.ban.y, 1, 2.9, 60),
          },
          {
            at: L('L203') - 2,
            a: faceCam(560, SINK.ban.y, 1, 3.3, 30),
            b: faceCam(560, SINK.ban.y, 1, 3.5, 30),
          },
        ],
        dur,
      )}
      f={f}
      actors={
        <Ban
          x={560}
          y={SINK.ban.y}
          t={f}
          facing={1}
          eyes="half"
          look={{ x: 0.3, y: 0.9 }}
          pose="hold"
        />
      }
    />
  );
};
const S85: React.FC = () => {
  const { f, dur } = useShot('8.5');
  return (
    <Stage2
      set={kitchen(f, { water: 1 })}
      cam={cutCam(
        f,
        [
          {
            at: 0,
            a: faceCam(SINK.me.x, SINK.me.y, 1.08, 2.7),
            b: faceCam(SINK.me.x, SINK.me.y, 1.08, 3.0),
            hold: true,
          },
        ],
        dur,
      )}
      f={f}
      actors={<Me x={SINK.me.x} y={SINK.me.y} t={f} facing={1} eyes="happy" pose="hold" />}
    />
  );
};
const S86: React.FC = () => {
  const { f, dur } = useShot('8.6');
  return (
    <Stage2
      set={kitchen(f, { water: 1 })}
      cam={{ x: 500, y: 1000, z: interpolate(f, [0, dur], [1.0, 1.6]) }}
      f={f}
      actors={
        <>
          <Me x={SINK.me.x} y={SINK.me.y} t={f} facing={1} eyes="happy" pose="hold" />
          <Ban x={600} y={SINK.ban.y} t={f} facing={1} eyes="closed" pose="hold" />
        </>
      }
    />
  );
};
const S87: React.FC = () => {
  const { f, dur, L } = useShot('8.7');
  const list = f >= L('L214') - 2;
  return list ? (
    <AbsoluteFill>
      <Stage2
        set={bedroomDay(f)}
        cam={{ x: 470, y: 1240, z: 1.9 }}
        f={f}
        actors={
          <Character
            x={720}
            y={1305}
            seed={1}
            hoodieColor={C.orange}
            hair
            t={f}
            lean={-90}
            eyes="normal"
            shadow={false}
          />
        }
      />
      <div
        style={{
          position: 'absolute',
          left: 980,
          top: 200,
          width: 700,
          background: 'rgba(246,241,230,0.94)',
          borderRadius: 28,
          padding: '28px 40px',
          transform: 'rotate(2deg)',
        }}
      >
        {['Học chính', 'Học thêm Toán', 'Học thêm Anh'].map((t, i) => (
          <div
            key={i}
            style={{
              fontFamily: FONT,
              fontWeight: 800,
              fontSize: 46,
              color: '#4a4652',
              opacity: interpolate(
                f,
                [L(['L214', 'L215', 'L216'][i]), L(['L214', 'L215', 'L216'][i]) + 5],
                [0, 1],
                clamp,
              ),
              marginTop: 8,
            }}
          >
            ☐ {t}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  ) : (
    <ClockCU f={f} time="6:00" dur={dur} ring />
  );
};
const S88: React.FC = () => {
  const { f, dur, L } = useShot('8.8');
  const pop = L('L218') + 2;
  const q = popIn(f, pop);
  return (
    <AbsoluteFill>
      <Stage2
        set={bedroomDay(f)}
        cam={cutCam(
          f,
          [
            { at: 0, a: { x: 600, y: 1080, z: 1.2 }, b: { x: 600, y: 1080, z: 1.28 } },
            { at: L('L219') - 2, a: faceCam(880, 1330, 1, 2.6), b: faceCam(880, 1330, 1, 2.8) },
          ],
          dur,
        )}
        f={f}
        actors={
          <>
            <Character
              x={300}
              y={1330}
              seed={1}
              hoodieColor={C.orange}
              hair
              t={f}
              pose={f < pop ? 'raise' : 'sitChair'}
              facing={1}
              eyes="happy"
            />
            <PopRing x={880} y={1330} u={f - pop} />
            <Clone
              k={1}
              x={880}
              y={1330}
              t={f}
              pose="sitChair"
              facing={-1}
              opacity={q.opacity}
              squash={q.squash}
              sparkle={q.sparkle}
              eyes={f >= L('L219') ? 'half' : 'wide'}
            />
          </>
        }
      />
      <ClonerCounter n={1} f={f} changedAt={pop} show={f >= pop ? 1 : 0} />
    </AbsoluteFill>
  );
};
const S89: React.FC = () => {
  const { f, dur, L } = useShot('8.9');
  const walk = interpolate(f, [L('L223'), dur], [0, 1], clamp);
  return (
    <Stage2
      set={bedroomDay(f, { doorOpen: 1 })}
      cam={cutCam(
        f,
        [
          { at: 0, a: faceCam(700, 1520, 1, 2.4), b: faceCam(700, 1520, 1, 2.6) },
          { at: L('L222') - 2, a: bodyCam(1080, 1440, 1, 1.6), b: bodyCam(1080, 1440, 1, 1.7) },
          { at: L('L223') - 2, a: { x: 1100, y: 1040, z: 1.1 }, b: { x: 1180, y: 1040, z: 1.15 } },
        ],
        dur,
      )}
      f={f}
      actors={
        <>
          <PlasticChair x={1080} y={1440} color="#4f6a80" />
          <Clone k={1} x={1080} y={1440} t={f} back pose="sitChair" />
          <Ban
            x={700 + walk * 700}
            y={1520}
            t={f}
            pose={walk > 0 ? 'walk' : 'point'}
            facing={1}
            eyes="happy"
            itemL="bag"
          />
        </>
      }
    />
  );
};
const S810: React.FC = () => {
  const { f, dur, L } = useShot('8.10');
  const final = f >= L('L227') - 2;
  return (
    <AbsoluteFill>
      <Stage2
        set={minimal('#5a4050', '#2a2032')}
        cam={cutCam(
          f,
          [
            { at: 0, a: { ...WIDE, z: 1.0 }, b: { ...WIDE, z: 1.05 } },
            { at: L('L226') - 2, a: { ...WIDE, z: 1.05 }, b: { ...WIDE, z: 1.1 } },
            {
              at: L('L227') - 2,
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
              x={final ? 380 : 860}
              y={1560}
              t={f}
              eyes="happy"
              pose={final ? 'stand' : 'raise'}
            />
            {final && (
              <Clone
                k={1}
                x={640}
                y={1560}
                t={f}
                eyes="happy"
                opacity={interpolate(f, [L('L227'), L('L228')], [1, 0.25], clamp)}
              />
            )}
          </>
        }
      />
      {!final && f < L('L226') - 2 && (
        <BigText
          lines={['Nhân bản được mình,', 'bạn sai bản sao làm gì đầu tiên? 👇']}
          from={4}
          f={f}
          y={120}
          size={88}
          accent={[1]}
        />
      )}
      {!final && f >= L('L226') - 2 && (
        <BigText
          lines={['❤️ Thích  ·  🔔 Đăng ký', 'để xem thêm những chữ “nếu”']}
          from={L('L226')}
          f={f}
          y={120}
          size={88}
          accent={[0]}
        />
      )}
      {final && (
        <BigText
          lines={['Một chữ nếu…', 'một cuộc đời khác.']}
          from={L('L227')}
          f={f}
          y={160}
          size={110}
          accent={[1]}
        />
      )}
    </AbsoluteFill>
  );
};

export const ACT78: Record<string, ShotDef> = {
  '7.1': {
    C: S71,
    amb: 'dinner',
    fx: (h) => [
      loopFor('game_far_loop', h.L('L144') - 2, h.dur + 4, 0.35, 6),
      ...snapPop(h.L('L145') + 6, 1, 0.6),
    ],
  },
  '7.2': {
    C: S72,
    amb: 'balcony',
    fx: (h) => [hit('tick', 0, 0.5), hit('sliding_door', h.L('L148'), 0.8)],
  },
  '7.3': { C: S73, amb: 'balcony', fx: () => [hit('plastic_chair', 10, 0.4)] },
  '7.4': { C: S74, amb: 'balcony', fx: (h) => [hit('cloth', h.L('L153'), 0.5)] },
  '7.5': { C: S75, amb: 'dinner', fx: (h) => [hit('chopsticks', h.L('L155'), 0.6)] },
  '7.6': { C: S76, amb: 'dinner' },
  '7.7': { C: S77, amb: 'balcony' },
  '7.8': { C: S78, amb: 'balcony' },
  '7.9': {
    C: S79,
    amb: 'balcony',
    fx: (h) =>
      ['L166', 'L167', 'L168', 'L169', 'L170', 'L171', 'L172'].map((id) =>
        hit('sparkle_soft', h.L(id) + 12, 0.45),
      ),
  },
  '7.10': { C: S710, amb: 'balcony', fx: () => [hit('tick', 0, 0.6)] },
  '7.11': { C: S711, amb: 'balcony' },
  '7.12': { C: S712, amb: 'balcony', fx: (h) => [loopFor('dissolve_loop', 0, h.dur + 6, 0.5, 20)] },
  '7.13': {
    C: S713,
    amb: 'balcony',
    fx: (h) => [
      hit('tick', 0, 0.6),
      hit('sparkle_chime', h.L('L183'), 0.95),
      loopFor('dissolve_loop', h.L('L183'), h.H('L183') + 30, 0.4, 20),
    ],
  },
  '7.14': { C: S714, amb: 'balcony', fx: (h) => [hit('plastic_chair', h.L('L187'), 0.5)] },
  '7.15': { C: S715, amb: 'balcony' },
  '8.1': {
    C: S81,
    amb: 'kitchen',
    fx: (h) => [
      loopFor('steps_stairs_loop', 0, h.L('L193') - 4, 0.6, 6),
      loopFor('water_run_loop', h.L('L193') - 2, h.dur + 4, 0.22, 8),
    ],
  },
  '8.2': {
    C: S82,
    amb: 'kitchen',
    fx: (h) => [loopFor('water_run_loop', 0, h.dur + 4, 0.22, 4), hit('dishes', h.L('L195'), 0.4)],
  },
  '8.3': {
    C: S83,
    amb: 'kitchen',
    fx: (h) => [
      loopFor('water_run_loop', 0, h.dur + 4, 0.24, 4),
      hit('dishes', 20, 0.6),
      hit('dishes', 70, 0.5),
    ],
  },
  '8.4': { C: S84, amb: 'kitchen', fx: (h) => [loopFor('water_run_loop', 0, h.dur + 4, 0.18, 4)] },
  '8.5': { C: S85, amb: 'kitchen', fx: (h) => [loopFor('water_run_loop', 0, h.dur + 4, 0.16, 4)] },
  '8.6': {
    C: S86,
    amb: 'kitchen',
    fx: (h) => [loopFor('water_run_loop', 0, h.dur, 0.16, 30), hit('dishes', h.dur - 60, 0.35)],
  },
  '8.7': { C: S87, amb: 'bedroom', fx: () => [hit('alarm', 0, 0.5), hit('alarm_rattle', 0, 0.4)] },
  '8.8': { C: S88, amb: 'bedroom', fx: (h) => snapPop(h.L('L218') + 2, 1, 0.9) },
  '8.9': {
    C: S89,
    amb: 'bedroom',
    fx: (h) => [
      hit('cloth', h.L('L221'), 0.5),
      loopFor('steps_tile_loop', h.L('L223'), h.dur, 0.5, 4),
      hit('door_open', h.L('L223') + 10, 0.5),
    ],
  },
  '8.10': {
    C: S810,
    amb: 'rules',
    fx: (h) => [
      hit('whoosh_ui', 4, 0.5),
      hit('ting', h.L('L226'), 0.5),
      hit('sparkle_soft', h.L('L227'), 0.5),
    ],
  },
};
