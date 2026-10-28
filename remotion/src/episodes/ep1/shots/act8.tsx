import React from 'react';
import { AbsoluteFill, interpolate, random } from 'remotion';
import { Character, invis } from '../../../rig/Character';
import { Ban, Bin, bodyCam, clamp, Extra, faceCam, hit, KeBatCoc, loopFor, ShotDef } from '../kit';
import { CarpLantern, KeoQuan, Lion, Motorbike, StarLantern } from '../../../kits/whatif/props';
import { lanternStreet } from '../../../kits/whatif/sets';
import { SetStage } from '../../../kits/whatif/SetStage';
import { Cam, cutCam } from '../../../kits/whatif/Stage';
import { C } from '../../../kits/whatif/theme';
import { tr, useShot } from '../time';
import { BigText, Pow } from '../../../kits/whatif/ui';

const Y = 1600;
/** Row of people passing in front of the camera (mid-layer crowd, sharp). */
const Passers: React.FC<{
  f: number;
  n?: number;
  y?: number;
  speed?: number;
  seed?: number;
  size?: number;
  dir?: number;
}> = ({ f, n = 6, y = Y + 40, speed = 4, seed = 0, size = 1.05, dir = 1 }) => (
  <>
    {Array.from({ length: n }, (_, i) => {
      const span = 1700;
      const x =
        ((((random(`ps${seed}${i}`) * span +
          f * speed * dir * (0.7 + random(`pv${seed}${i}`) * 0.6)) %
          span) +
          span) %
          span) -
        300;
      return (
        <Extra
          key={i}
          k={i + seed}
          x={x}
          y={y + (i % 3) * 30}
          size={size * (0.9 + random(`pz${seed}${i}`) * 0.2)}
          t={f + i * 7}
          pose="walk"
          facing={dir}
          eyes={i % 2 ? 'normal' : 'half'}
        />
      );
    })}
  </>
);
/** Dark layer + edge blur while suffocating (0…1). */
const Choke: React.FC<{ k: number }> = ({ k }) =>
  k > 0 ? (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse ${80 - k * 30}% ${70 - k * 25}% at 48% 45%, rgba(0,0,0,0) 40%, rgba(5,0,8,${0.55 + k * 0.4}) 100%)`,
        pointerEvents: 'none',
      }}
    />
  ) : null;

// ───────── 8.1 Mid-Autumn full moon – lantern street ─────────
const S81: React.FC = () => {
  const { f, dur, at, L } = useShot('8.1');
  const cam = cutCam(
    f,
    [
      { at: 0, a: { x: 520, y: 900, z: 0.92 }, b: { x: 520, y: 880, z: 1.0 } },
      { at: L('L161') - 2, a: { x: 260, y: 520, z: 1.35 }, b: { x: 760, y: 560, z: 1.35 } },
      { at: L('L162') - 2, a: { x: 540, y: 1180, z: 1.5 }, b: { x: 540, y: 1180, z: 1.6 } },
      {
        at: at('L163', 'ông sao') - 2,
        a: { x: 300, y: 640, z: 2.6 },
        b: { x: 300, y: 640, z: 2.8 },
      },
      {
        at: at('L163', 'cá chép') - 2,
        a: { x: 700, y: 660, z: 2.6 },
        b: { x: 700, y: 660, z: 2.8 },
      },
      {
        at: at('L163', 'kéo quân') - 2,
        a: { x: 500, y: 760, z: 2.4 },
        b: { x: 500, y: 760, z: 2.6 },
      },
      { at: L('L164') - 2, a: { x: 620, y: 1080, z: 1.9 }, b: { x: 620, y: 1080, z: 2.1 } },
    ],
    dur,
  );
  const lanternCU = f >= at('L163', 'ông sao') - 2 && f < L('L164') - 2;
  return (
    <AbsoluteFill>
      <SetStage
        set={lanternStreet(f)}
        cam={cam}
        f={f}
        actors={
          lanternCU ? (
            <>
              <StarLantern x={300} y={700} s={1.4} f={f} />
              <CarpLantern x={700} y={720} s={1.3} f={f} />
              <KeoQuan x={500} y={820} s={1.3} f={f} />
            </>
          ) : f >= L('L164') - 2 ? (
            <Lion x={760} y={1560} s={1.25} f={f} />
          ) : (
            <Passers f={f} n={9} y={Y} speed={3} />
          )
        }
      />
      {f >= L('L161') && f < L('L162') && (
        <BigText
          lines={tr(['PHỐ LỒNG ĐÈN', 'LƯƠNG NHỮ HỌC'], ['LANTERN STREET', 'SAIGON CHINATOWN'])}
          from={L('L161')}
          f={f}
          y={1280}
          size={70}
          color="#ffd27a"
        />
      )}
    </AbsoluteFill>
  );
};

// ───────── 8.2 You lead Bin by the hand ─────────
const HandsCU: React.FC<{
  f: number;
  gap?: number;
  binHand?: boolean;
  ghost?: number;
  lantern?: boolean;
}> = ({ f, gap = 0, binHand = true, ghost = 0, lantern = true }) => (
  <g>
    {/* your hand (orange hoodie) from the left */}
    <g opacity={1 - ghost * 0.65}>
      <path
        d={`M-200 1500 Q200 1250 ${420 - gap} 1080`}
        stroke={ghost ? '#fff' : C.orange}
        strokeWidth={ghost ? 6 : 150}
        fill={ghost ? 'none' : 'none'}
        strokeLinecap="round"
        opacity={ghost ? 0.5 : 1}
      />
      <circle
        cx={470 - gap}
        cy={1050}
        r={78}
        fill={ghost ? 'none' : C.ink}
        stroke={ghost ? '#fff' : C.rim}
        strokeWidth={ghost ? 6 : 4}
        opacity={ghost ? 0.6 : 1}
      />
    </g>
    {binHand && (
      <g transform={`translate(${gap * 0.6},0)`}>
        <path
          d="M1250 1450 Q900 1250 640 1080"
          stroke={C.bin}
          strokeWidth={100}
          fill="none"
          strokeLinecap="round"
        />
        <circle cx={600} cy={1060} r={56} fill={C.ink} stroke={C.rim} strokeWidth={4} />
      </g>
    )}
    {lantern && <StarLantern x={250 + Math.sin(f / 15) * 10} y={560} s={1.5} f={f} />}
  </g>
);
const S82: React.FC = () => {
  const { f, dur, L } = useShot('8.2');
  const cu = f >= L('L166') - 2;
  const wx = interpolate(f, [0, dur], [360, 520]);
  return cu ? (
    <SetStage
      set={lanternStreet(f)}
      cam={cutCam(
        f,
        [{ at: 0, a: { x: 520, y: 900, z: 1.0 }, b: { x: 520, y: 900, z: 1.06 } }],
        dur,
      )}
      blurBg={10}
      f={f}
      actors={<HandsCU f={f} />}
    />
  ) : (
    <SetStage
      set={lanternStreet(f)}
      cam={cutCam(
        f,
        [{ at: 0, a: bodyCam(wx + 60, Y, 1, 1.25), b: bodyCam(wx + 90, Y, 1, 1.3) }],
        dur,
      )}
      f={f}
      actors={
        <>
          <Ban
            x={wx}
            y={Y}
            t={f}
            pose="walk"
            facing={1}
            eyes="happy"
            itemL="starLantern"
            handR={{ x: 120, y: -200 }}
            speed={0.7}
          />
          <Bin
            x={wx + 200}
            y={Y + 10}
            t={f}
            pose="walk"
            facing={1}
            eyes="happy"
            handL={{ x: -150, y: -200 }}
            speed={0.9}
          />
          <Passers f={f} n={4} y={Y + 140} speed={2} seed={5} size={1.15} />
        </>
      }
    />
  );
};

// ───────── 8.3 The crowd pushes ─────────
const S83: React.FC = () => {
  const { f, dur } = useShot('8.3');
  const gap = interpolate(f, [8, 22], [0, 260], clamp);
  return (
    <SetStage
      set={lanternStreet(f)}
      cam={cutCam(
        f,
        [{ at: 0, a: { x: 520, y: 900, z: 1.05 }, b: { x: 520, y: 900, z: 1.1 }, hold: true }],
        dur,
      )}
      f={f}
      shake={16}
      blurBg={10}
      actors={
        <>
          <HandsCU f={f} gap={gap} lantern={false} />
          <Passers f={f + 200} n={5} y={Y + 300} speed={22} seed={11} size={1.6} dir={-1} />
        </>
      }
    />
  );
};

// ───────── 8.4 Your hand is empty ─────────
const S84: React.FC = () => {
  const { f, dur } = useShot('8.4');
  return (
    <SetStage
      set={lanternStreet(f)}
      cam={cutCam(
        f,
        [{ at: 0, a: { x: 470, y: 1000, z: 1.0 }, b: { x: 470, y: 1000, z: 1.12 }, hold: true }],
        dur,
      )}
      f={f}
      blurBg={14}
      actors={
        <g>
          <path
            d="M-200 1700 Q150 1350 420 1120"
            stroke={C.orange}
            strokeWidth={170}
            fill="none"
            strokeLinecap="round"
          />
          <circle cx={470} cy={1080} r={96} fill={C.ink} stroke={C.rim} strokeWidth={5} />
          <circle cx={440} cy={1050} r={30} fill="#3a3440" opacity={0.6} />
        </g>
      }
    />
  );
};

// ───────── 8.5 You turn – a man in a cap carries Bin off ─────────
const Kidnap: React.FC<{
  f: number;
  x: number;
  y?: number;
  size?: number;
  walk?: boolean;
  jerk?: number;
  held?: boolean;
  binOut?: number;
}> = ({ f, x, y = Y, size = 1, walk = true, jerk = 0, held = false, binOut = 0 }) => (
  <g transform={`translate(${x},${y}) scale(${size}) translate(${-x},${-y})`}>
    <KeBatCoc
      x={x}
      y={y}
      t={f}
      pose={held ? 'armsUp' : walk ? 'walk' : 'carry'}
      facing={1}
      speed={1.2}
      lean={jerk}
      handR={held ? undefined : { x: 70, y: -300 }}
      handL={held ? undefined : { x: 10, y: -260 }}
      eyes={held ? 'wide' : 'half'}
    />
    {binOut < 1 && (
      <Bin
        x={x + 130 - binOut * 260}
        y={y - 190 + binOut * 190}
        t={f}
        pose="flail"
        facing={-1}
        eyes="wide"
        shadow={false}
      />
    )}
  </g>
);
const S85: React.FC = () => {
  const { f, dur, L } = useShot('8.5');
  const kx = interpolate(f, [0, dur], [520, 820]);
  const cam: Cam = cutCam(
    f,
    [
      { at: 0, a: faceCam(500, Y, 1, 2.6), b: faceCam(500, Y, 1, 2.9) },
      { at: L('L170') - 2, a: { x: 520, y: 900, z: 0.95 }, b: { x: 560, y: 900, z: 1.05 } },
      { at: L('L171') - 2, a: bodyCam(kx, Y, 1.12, 1.15), b: bodyCam(kx + 40, Y, 1.12, 1.25) },
      { at: L('L173') - 2, a: faceCam(kx, Y, 1.12, 2.6), b: faceCam(kx + 30, Y, 1.12, 2.8) },
      {
        at: L('L174') - 2,
        a: { x: kx + 60, y: Y - 330, z: 2.4 },
        b: { x: kx + 80, y: Y - 330, z: 2.6 },
      },
      { at: L('L175') - 2, a: { x: 700, y: 1100, z: 1.7 }, b: { x: 700, y: 1100, z: 1.85 } },
    ],
    dur,
  );
  const pov = f >= L('L170') - 2 && f < L('L171') - 2;
  const lion = f >= L('L175') - 2;
  return (
    <AbsoluteFill>
      <SetStage
        set={lanternStreet(f)}
        cam={cam}
        f={f}
        shake={f < L('L170') ? 3 : 1.5}
        actors={
          f < L('L170') - 2 ? (
            <Ban x={500} y={Y} t={f} facing={f < 8 ? 1 : 0} eyes="wide" />
          ) : pov ? (
            <>
              <Kidnap f={f} x={kx - 60} y={1300} size={0.45} />
              <Passers f={f} n={7} y={Y + 80} speed={2} seed={20} size={1.1} />
            </>
          ) : lion ? (
            <>
              <Lion x={760} y={1560} s={1.25} f={f} />
              <Kidnap f={f} x={kx - 400} y={1350} size={0.5} />
            </>
          ) : (
            <>
              <Kidnap f={f} x={kx} />
              <Passers f={f} n={4} y={Y + 200} speed={3} seed={30} size={1.25} />
            </>
          )
        }
      />
      {pov && (
        <Pow
          text="KIA!"
          x={400}
          y={420}
          from={L('L170')}
          f={f}
          size={130}
          color="#ff6a4a"
          rot={-6}
        />
      )}
    </AbsoluteFill>
  );
};

// ───────── 8.6 Nobody notices (crowd faces turned away) ─────────
const FacesRow: React.FC<{ f: number; turnAt: (i: number) => number; toBack: boolean }> = ({
  f,
  turnAt,
  toBack,
}) => (
  <>
    {[0, 1, 2, 3, 4].map((i) => {
      const turned = f >= turnAt(i);
      const show = toBack ? turned : !turned;
      return (
        <Extra
          key={i}
          k={i * 3 + 1}
          x={120 + i * 190}
          y={1620 + (i % 2) * 40}
          size={1.05}
          t={f + i * 9}
          back={toBack ? turned : !turned}
          facing={0}
          eyes={toBack ? 'half' : 'wide'}
          squash={Math.abs(f - turnAt(i)) < 4 ? 0.1 : 0}
          opacity={1}
          lean={show ? 0 : 0}
        />
      );
    })}
  </>
);
const S86: React.FC = () => {
  const { f, dur, L } = useShot('8.6');
  return (
    <SetStage
      set={lanternStreet(f)}
      cam={cutCam(
        f,
        [
          { at: 0, a: { x: 500, y: 1120, z: 1.25 }, b: { x: 500, y: 1120, z: 1.35 } },
          { at: L('L177') - 2, a: { x: 540, y: 1100, z: 1.0 }, b: { x: 540, y: 1100, z: 1.08 } },
        ],
        dur,
      )}
      f={f}
      actors={<FacesRow f={f} turnAt={(i) => 4 + i * 7} toBack />}
    />
  );
};

// ───────── 8.7 Breathe in · hold · vanish · slip through the crowd ─────────
const S87: React.FC = () => {
  const { f, dur, L } = useShot('8.7');
  const v = L('L180');
  const iv = invis(f, [[v, 'vanish']]);
  const weave = L('L181');
  const bx = interpolate(f, [weave, dur], [200, 820], clamp) + Math.sin(f / 6) * 30;
  const kx = interpolate(f, [weave, dur], [1300, 980], clamp);
  const near = f >= L('L184') - 2;
  const cam: Cam =
    f < weave - 2
      ? cutCam(
          f,
          [
            { at: 0, a: faceCam(500, Y, 1, 3.2), b: faceCam(500, Y, 1, 3.4) },
            { at: L('L179') - 2, a: faceCam(500, Y, 1, 4.2, 10), b: faceCam(500, Y, 1, 4.4, 10) },
            { at: v - 2, a: bodyCam(500, Y, 1, 1.5), b: bodyCam(500, Y, 1, 1.6) },
          ],
          dur,
        )
      : { x: bx + (near ? 120 : 40), y: Y - 380, z: near ? 1.5 + (f - L('L184')) * 0.006 : 1.25 };
  return (
    <AbsoluteFill>
      <SetStage
        set={lanternStreet(f)}
        cam={cam}
        f={f}
        shake={f >= weave ? 6 : 1}
        actors={
          <>
            {f >= weave && <Kidnap f={f} x={kx} />}
            <Ban
              x={f < weave ? 500 : bx}
              y={Y}
              t={f}
              pose={f < weave ? 'stand' : 'run'}
              facing={f < weave ? 0 : 1}
              eyes="squint"
              puff={interpolate(f, [0, 20], [0, 1], clamp)}
              {...iv}
              px={cam.z}
            />
            {f >= weave && (
              <Passers f={f} n={8} y={Y + 60} speed={7} seed={40} size={1.1} dir={-1} />
            )}
          </>
        }
      />
      {f >= L('L185') && (
        <Pow
          text={f >= L('L186') ? tr('1 MÉT', '1 METER') : tr('2 MÉT', '2 METERS')}
          x={470}
          y={430}
          from={f >= L('L186') ? L('L186') : L('L185')}
          f={f}
          size={130}
          color="#ffc83a"
          rot={-5}
        />
      )}
    </AbsoluteFill>
  );
};

// ───────── 8.8 Grab Bin's hand → it slips ─────────
const S88: React.FC = () => {
  const { f, dur, L } = useShot('8.8');
  const jerk = L('L188');
  const slip = L('L189');
  const gap = f < slip ? 0 : interpolate(f, [slip, slip + 10], [0, 300], clamp);
  const cu = f < L('L190') - 2;
  const kx = interpolate(f, [L('L190'), dur], [700, 1100], clamp);
  return cu ? (
    <SetStage
      set={lanternStreet(f)}
      cam={cutCam(
        f,
        [
          { at: 0, a: { x: 520, y: 1000, z: 1.0 }, b: { x: 520, y: 1000, z: 1.06 } },
          { at: jerk - 2, a: { x: 540, y: 1020, z: 1.15 }, b: { x: 540, y: 1020, z: 1.2 } },
        ],
        dur,
      )}
      f={f}
      blurBg={12}
      shake={f >= jerk && f < slip + 10 ? 12 : 3}
      actors={<HandsCU f={f} gap={gap} ghost={1} lantern={false} />}
    />
  ) : (
    <SetStage
      set={lanternStreet(f)}
      cam={cutCam(
        f,
        [
          { at: 0, a: bodyCam(kx, Y, 1.12, 1.15), b: bodyCam(kx, Y, 1.12, 1.2) },
          { at: L('L191') - 2, a: { x: 620, y: 960, z: 0.95 }, b: { x: 640, y: 960, z: 1.0 } },
        ],
        dur,
      )}
      f={f}
      shake={4}
      actors={
        <>
          <Kidnap
            f={f}
            x={f < L('L191') - 2 ? kx : kx - 300}
            y={f < L('L191') - 2 ? Y : 1320}
            size={f < L('L191') - 2 ? 1 : 0.5}
          />
          <Ban
            x={kx - 420}
            y={Y}
            t={f}
            invisible={1}
            eyes="squint"
            pose="reach"
            facing={1}
            px={1.2}
          />
        </>
      }
    />
  );
};

// ───────── 8.9 A motorbike is idling, waiting ─────────
const S89: React.FC = () => {
  const { f, dur } = useShot('8.9');
  return (
    <SetStage
      set={lanternStreet(f, { bike: false })}
      cam={cutCam(
        f,
        [{ at: 0, a: { x: 560, y: 1300, z: 1.9 }, b: { x: 560, y: 1300, z: 2.1 } }],
        dur,
      )}
      f={f}
      shake={2}
      actors={
        <>
          <Motorbike x={560} y={1500} s={0.95} f={f} running color="#4a4a52" />
          <Extra
            k={7}
            x={540}
            y={1430}
            size={1}
            t={f}
            pose="sitChair"
            facing={1}
            eyes="half"
            accessories={['cap']}
          />
        </>
      }
    />
  );
};

// ───────── 8.10 Two minutes – red ring, darkening, blurring ─────────
const S810: React.FC = () => {
  const { f, dur, L } = useShot('8.10');
  const k = interpolate(f, [0, dur], [0.2, 0.85], clamp);
  return (
    <AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          filter: `blur(${interpolate(f, [0, dur], [0, 5], clamp)}px)`,
        }}
      >
        <SetStage
          set={lanternStreet(f)}
          cam={cutCam(
            f,
            [
              { at: 0, a: faceCam(520, Y, 1, 2.8), b: faceCam(520, Y, 1, 3.1) },
              { at: L('L194') - 2, a: bodyCam(520, Y, 1, 1.7), b: bodyCam(520, Y, 1, 1.8) },
              { at: L('L196') - 2, a: faceCam(520, Y, 1, 3.4, 10), b: faceCam(520, Y, 1, 3.8, 10) },
            ],
            dur,
          )}
          f={f}
          shake={4}
          actors={
            <Ban
              x={520}
              y={Y}
              t={f}
              invisible={1}
              eyes="squint"
              puff={1.3}
              shiver={2}
              pose={f >= L('L194') ? 'pray' : 'stand'}
              px={2}
            />
          }
        />
      </div>
      <Choke k={k} />
    </AbsoluteFill>
  );
};

// ───────── 8.11 Standing still in a moving crowd (slow push-in) ─────────
const S811: React.FC = () => {
  const { f, dur, L } = useShot('8.11');
  const seg = (id: string) => f >= L(id) - 2;
  const kidnapCut = seg('L201') && !seg('L202');
  const streetCut = seg('L202') && !seg('L203');
  const push = seg('L203');
  const cam: Cam = kidnapCut
    ? { x: 640, y: 1300, z: 1.7 + (f - L('L201')) * 0.002 }
    : streetCut
      ? { x: 540, y: 900, z: 0.95 }
      : push
        ? {
            ...faceCam(520, Y, 1, 1.4 + (f - L('L203')) * 0.012, 20),
            z: Math.min(3.6, 1.4 + (f - L('L203')) * 0.012),
          }
        : cutCam(
            f,
            [
              { at: 0, a: bodyCam(520, Y, 1, 1.0), b: bodyCam(520, Y, 1, 1.3), hold: true },
              { at: L('L198') - 2, a: faceCam(520, Y, 1, 2.4), b: faceCam(520, Y, 1, 2.6) },
              { at: L('L199') - 2, a: bodyCam(520, Y, 1, 1.5), b: bodyCam(520, Y, 1, 1.6) },
              { at: L('L200') - 2, a: faceCam(520, Y, 1, 3.0), b: faceCam(520, Y, 1, 3.2) },
            ],
            dur,
          );
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', inset: 0, filter: `blur(${streetCut ? 2 : 3}px)` }}>
        <SetStage
          set={lanternStreet(f, { bikeRunning: true })}
          cam={cam}
          f={f}
          actors={
            kidnapCut ? (
              <>
                <Motorbike x={640} y={1500} s={0.95} f={f} running color="#4a4a52" />
                <KeBatCoc
                  x={460}
                  y={1560}
                  t={f}
                  facing={1}
                  pose="carry"
                  handR={{ x: 70, y: -300 }}
                />
                <Bin x={520} y={1350} t={f} pose="flail" facing={-1} eyes="wide" shadow={false} />
              </>
            ) : (
              <>
                <Ban
                  x={520}
                  y={Y}
                  t={f}
                  invisible={1}
                  eyes={push ? 'normal' : 'squint'}
                  puff={push ? 0.6 : 1.2}
                  shiver={1.2}
                  px={cam.z}
                />
                <Passers f={f} n={7} y={Y - 40} speed={6} seed={50} size={1.0} />
                <Passers f={f} n={5} y={Y + 160} speed={9} seed={60} size={1.25} dir={-1} />
              </>
            )
          }
        />
      </div>
      <Choke k={0.85} />
    </AbsoluteFill>
  );
};

// ───────── 8.12 You must reappear (almost silent) ─────────
const S812: React.FC = () => {
  const { f, dur, L } = useShot('8.12');
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', inset: 0, filter: 'blur(3px)' }}>
        <SetStage
          set={lanternStreet(f)}
          cam={cutCam(
            f,
            [
              { at: 0, a: faceCam(520, Y, 1, 3.4, 10), b: faceCam(520, Y, 1, 3.7, 10) },
              {
                at: L('L205') - 2,
                a: faceCam(520, Y, 1, 4.4, 0),
                b: faceCam(520, Y, 1, 4.8, 0),
                hold: true,
              },
            ],
            dur,
          )}
          f={f}
          actors={
            <Ban
              x={520}
              y={Y}
              t={f}
              invisible={1}
              eyes={f >= L('L205') ? 'wide' : 'normal'}
              puff={0.8}
              shiver={0.6}
              px={4}
            />
          }
        />
      </div>
      <Choke k={0.95} />
    </AbsoluteFill>
  );
};

// ───────── 8.13 "BẮT CÓC!" ─────────
const S813: React.FC = () => {
  const { f, dur, L } = useShot('8.13');
  const iv = invis(f, [[0, 'appear']], true);
  const big = interpolate(f, [0, 3, 8], [1, 1.25, 1], clamp);
  const cam = cutCam(
    f,
    [
      { at: 0, a: bodyCam(520, Y, 1, 1.5), b: bodyCam(520, Y, 1, 1.4) },
      { at: L('L207') - 2, a: faceCam(520, Y, 1, 2.2), b: faceCam(520, Y, 1, 2.4) },
      { at: L('L209') - 2, a: { x: 520, y: 900, z: 0.92 }, b: { x: 520, y: 900, z: 0.98 } },
      { at: L('L210') - 2, a: faceCam(520, Y, 1, 3.0), b: faceCam(520, Y, 1, 3.2) },
      { at: L('L211') - 2, a: bodyCam(520, Y, 1, 1.6), b: bodyCam(520, Y, 1, 1.7) },
    ],
    dur,
  );
  return (
    <AbsoluteFill>
      <SetStage
        set={lanternStreet(f)}
        cam={cam}
        f={f}
        shake={
          f < L('L207')
            ? interpolate(f, [0, 20], [22, 6], clamp)
            : interpolate(f, [L('L207'), L('L207') + 20], [14, 4], clamp)
        }
        actors={
          <Ban
            x={520}
            y={Y}
            size={big}
            t={f}
            eyes={f < L('L210') ? 'wide' : 'squint'}
            pose={f < L('L208') ? 'armsUp' : 'stand'}
            flush={f >= L('L210') - 2 ? 1 : 0.4}
            {...iv}
            squash={iv.squash}
            px={cam.z}
          />
        }
      />
      <Pow
        text={tr('BẮT CÓC!', 'KIDNAPPER!')}
        x={480}
        y={400}
        from={0}
        f={f}
        size={170}
        color="#ff4a3a"
        rot={-6}
        out={L('L207') - 2}
      />
      <Pow
        text={tr('HẮN BẮT EM TÔI!', "HE'S TAKING MY BROTHER!")}
        x={480}
        y={420}
        from={L('L207')}
        f={f}
        size={tr(104, 80)}
        color="#ff4a3a"
        rot={4}
        out={L('L208')}
      />
    </AbsoluteFill>
  );
};

// ───────── 8.14 Everyone looks at you ─────────
const S814: React.FC = () => {
  const { f, dur, at } = useShot('8.14');
  const t0 = at('L212', 'tất cả');
  return (
    <SetStage
      set={lanternStreet(f, { lookAway: 0 })}
      cam={cutCam(
        f,
        [{ at: 0, a: { x: 500, y: 1120, z: 1.3 }, b: { x: 500, y: 1120, z: 1.6 }, hold: true }],
        dur,
      )}
      f={f}
      actors={<FacesRow f={f} turnAt={() => t0} toBack={false} />}
    />
  );
};

// ───────── 8.15 The lion-dance drums stop ─────────
const S815: React.FC = () => {
  const { f, dur, at } = useShot('8.15');
  const stop = at('L213', 'dừng');
  return (
    <SetStage
      set={lanternStreet(f, { lionStill: f >= stop })}
      cam={cutCam(
        f,
        [{ at: 0, a: { x: 680, y: 1180, z: 1.9 }, b: { x: 680, y: 1180, z: 2.0 }, hold: true }],
        dur,
      )}
      f={f}
      actors={<Lion x={760} y={1560} s={1.25} f={f >= stop ? stop : f} still={f >= stop} />}
    />
  );
};

// ───────── 8.16 The whole street steps in ─────────
const S816: React.FC = () => {
  const { f, dur, L } = useShot('8.16');
  const binOut = interpolate(f, [L('L216'), L('L216') + 24], [0, 1], clamp);
  const struggle = f >= L('L217') ? Math.sin(f / 2) * 6 : 0;
  const cam = cutCam(
    f,
    [
      { at: 0, a: { x: 600, y: 1150, z: 1.35 }, b: { x: 620, y: 1150, z: 1.45 } },
      { at: L('L215') - 2, a: { x: 500, y: 1080, z: 1.5 }, b: { x: 500, y: 1080, z: 1.6 } },
      { at: L('L216') - 2, a: { x: 380, y: 1150, z: 1.6 }, b: { x: 360, y: 1150, z: 1.7 } },
      { at: L('L217') - 2, a: { x: 520, y: 1080, z: 1.3 }, b: { x: 520, y: 1080, z: 1.35 } },
    ],
    dur,
  );
  return (
    <SetStage
      set={lanternStreet(f, { bike: false })}
      cam={cam}
      f={f}
      shake={f >= L('L217') ? 5 : 2}
      actors={
        <>
          <Motorbike x={840} y={1560} s={0.9} f={f} running={f < L('L215')} color="#4a4a52" />
          <Character
            x={720}
            y={1600}
            size={1.05}
            seed={41}
            t={f}
            hoodieColor="#8a7a62"
            facing={-1}
            pose="armsUp"
            eyes="half"
            itemR={undefined}
          />
          <KeoQuan x={720} y={1080} s={0.5} f={f} />
          <Kidnap f={f} x={500 + struggle} held={f >= L('L215')} binOut={binOut} walk={false} />
          {f >= L('L215') - 2 && (
            <>
              <Character
                x={350}
                y={1610}
                size={1.05}
                seed={42}
                t={f}
                hoodieColor="#5a6a5a"
                accessories={['cap']}
                facing={1}
                pose="reach"
                eyes="normal"
              />
              <Character
                x={650}
                y={1620}
                size={1.08}
                seed={43}
                t={f}
                hoodieColor="#6a5a6a"
                accessories={['cap']}
                facing={-1}
                pose="reach"
                eyes="normal"
              />
            </>
          )}
          {f >= L('L216') - 2 && (
            <Character
              x={250 - binOut * 40}
              y={1640}
              size={1.0}
              seed={44}
              t={f}
              hoodieColor="#a08a6a"
              accessories={['bun']}
              facing={1}
              pose="carry"
              eyes="happy"
            />
          )}
          {binOut >= 1 && (
            <Bin x={260} y={1430} t={f} pose="hug" facing={-1} eyes="sad" shadow={false} />
          )}
        </>
      }
    />
  );
};

// ───────── 8.17 Ward police ─────────
const S817: React.FC = () => {
  const { f, dur } = useShot('8.17');
  return (
    <SetStage
      set={lanternStreet(f, { bike: false, police: interpolate(f, [0, 10], [0, 1], clamp) })}
      cam={cutCam(
        f,
        [{ at: 0, a: { x: 520, y: 1000, z: 1.05 }, b: { x: 520, y: 1000, z: 1.12 } }],
        dur,
      )}
      f={f}
      actors={
        <>
          <KeBatCoc x={540} y={1560} t={f} facing={0} eyes="sad" pose="stand" />
          <Character
            x={380}
            y={1580}
            size={1.05}
            seed={42}
            t={f}
            hoodieColor="#5a6a5a"
            accessories={['cap']}
            facing={1}
            pose="reach"
            handR={{ x: 150, y: -280 }}
          />
          <Character
            x={700}
            y={1590}
            size={1.08}
            seed={43}
            t={f}
            hoodieColor="#6a5a6a"
            accessories={['cap']}
            facing={-1}
            pose="reach"
            handR={{ x: -150, y: -280 }}
          />
        </>
      }
    />
  );
};

// ───────── 8.18 Bin runs back and hugs your leg ─────────
const S818: React.FC = () => {
  const { f, dur, L } = useShot('8.18');
  const hug = L('L221');
  const bx = interpolate(f, [0, hug - 4], [120, 430], clamp);
  const cam = cutCam(
    f,
    [
      { at: 0, a: { x: 420, y: 1200, z: 1.2 }, b: { x: 460, y: 1200, z: 1.3 } },
      { at: hug - 2, a: { x: 500, y: 1330, z: 1.8 }, b: { x: 500, y: 1330, z: 1.9 } },
      { at: L('L222') - 2, a: faceCam(430, Y, 0.58, 3.0, -20), b: faceCam(430, Y, 0.58, 3.2, -20) },
      { at: L('L223') - 2, a: faceCam(430, Y, 0.58, 2.6, -20), b: faceCam(430, Y, 0.58, 2.8, -20) },
      { at: L('L225') - 2, a: { x: 520, y: 1230, z: 1.5 }, b: { x: 520, y: 1230, z: 1.6 } },
    ],
    dur,
  );
  const cry = f >= L('L222') && f < L('L223');
  return (
    <SetStage
      set={lanternStreet(f, { bike: false })}
      cam={cam}
      f={f}
      actors={
        <>
          <Ban
            x={560}
            y={Y}
            t={f}
            facing={-1}
            eyes={f >= L('L225') ? 'happy' : 'sad'}
            look={{ x: -0.5, y: 0.6 }}
            flush={0.5}
            pose={f >= L('L223') ? 'hug' : 'stand'}
          />
          <Bin
            x={bx}
            y={Y + 6}
            t={f}
            pose={f < hug - 4 ? 'run' : 'hug'}
            facing={1}
            eyes={cry ? 'sad' : f >= L('L225') ? 'happy' : 'closed'}
            shiver={cry ? 1.5 : 0}
          />
          {cry &&
            [0, 1].map((i) => (
              <ellipse
                key={i}
                cx={bx + 30 + i * 46}
                cy={Y - 250 + ((f * 4 + i * 20) % 60)}
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

// ───────── 8.19 Sitting on the kerb breathing (a warm crowd around) ─────────
const S819: React.FC = () => {
  const { f, dur, L, H } = useShot('8.19');
  const cam = cutCam(
    f,
    [
      { at: 0, a: { x: 500, y: 1180, z: 1.15 }, b: { x: 500, y: 1180, z: 1.25 } },
      {
        at: L('L227') - 2,
        a: faceCam(480, Y + 10, 1, 2.4, 110),
        b: faceCam(480, Y + 10, 1, 2.6, 110),
      },
      { at: L('L229') - 2, a: { x: 480, y: 1350, z: 1.6 }, b: { x: 480, y: 1350, z: 1.7 } },
      { at: L('L230') - 2, a: { x: 520, y: 1050, z: 0.95 }, b: { x: 520, y: 1020, z: 1.05 } },
      {
        at: H('L230'),
        a: { x: 520, y: 1050, z: 1.05 },
        b: { x: 520, y: 1050, z: 0.95 },
        hold: true,
      },
    ],
    dur,
  );
  const breath = Math.sin(f / 5) * 0.08;
  return (
    <SetStage
      set={lanternStreet(f, { bike: false, crowd: 1.2 })}
      cam={cam}
      f={f}
      actors={
        <>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Extra
              key={i}
              k={i + 2}
              x={[80, 230, 380, 640, 790, 930][i]}
              y={1440 + (i % 2) * 20}
              size={0.95}
              t={f + i * 5}
              facing={i < 3 ? 1 : -1}
              eyes={i % 2 ? 'happy' : 'normal'}
            />
          ))}
          <Ban
            x={480}
            y={Y + 10}
            t={f}
            pose="sitGround"
            facing={1}
            eyes={f >= L('L229') ? 'closed' : 'half'}
            squash={breath}
          />
          <Bin x={720} y={Y + 20} t={f} pose="sitGround" facing={-1} eyes="happy" />
        </>
      }
    />
  );
};

export const ACT8: Record<string, ShotDef> = {
  '8.1': {
    C: S81,
    amb: 'lantern',
    fx: (h) => [
      hit('lantern_swing', h.at('L163', 'ông sao'), 0.6),
      hit('lantern_swing', h.at('L163', 'kéo quân'), 0.5),
    ],
  },
  '8.2': {
    C: S82,
    amb: 'lantern',
    fx: (h) => [
      loopFor('steps_sidewalk_loop', 0, h.L('L166'), 0.45, 6),
      hit('lantern_swing', h.L('L166'), 0.5),
    ],
  },
  '8.3': {
    C: S83,
    amb: 'lantern',
    fx: () => [hit('shove', 0, 1), hit('cloth', 10, 0.7), hit('thump_heavy', 6, 0.6)],
  },
  '8.4': { C: S84, amb: 'lantern', fx: () => [hit('whoosh', 0, 0.4)] },
  '8.5': {
    C: S85,
    amb: 'lantern',
    fx: (h) => [
      hit('startle', 0, 0.6),
      hit('cloth', h.L('L174'), 0.6),
      loopFor('steps_rush_loop', h.L('L171'), h.L('L175'), 0.35, 6),
    ],
  },
  '8.6': { C: S86, amb: 'lantern', fx: () => [hit('cloth', 4, 0.3), hit('cloth', 18, 0.3)] },
  '8.7': {
    C: S87,
    amb: 'lantern',
    fx: (h) => [
      hit('inhale', h.L('L178'), 0.9),
      hit('shimmer', h.L('L180'), 0.9),
      hit('sparkle', h.L('L180') + 6, 0.5),
      loopFor('steps_rush_loop', h.L('L181'), h.dur, 0.55, 4),
      hit('shove', h.L('L182'), 0.5),
    ],
  },
  '8.8': {
    C: S88,
    amb: 'lantern',
    fx: (h) => [
      hit('cloth', h.L('L187') + 4, 0.8),
      hit('whoosh', h.L('L188'), 0.8),
      hit('thump_heavy', h.L('L188') + 2, 0.5),
      hit('whoosh', h.L('L189'), 0.6),
      loopFor('steps_rush_loop', h.L('L190'), h.dur, 0.5, 4),
    ],
  },
  '8.9': {
    C: S89,
    amb: 'lantern',
    fx: (h) => [hit('moto_start', 0, 1), loopFor('moto_idle_loop', 60, h.dur + 4, 0.6, 6)],
  },
  '8.10': { C: S810, amb: 'lantern', fx: (h) => [loopFor('moto_idle_loop', 0, h.dur, 0.25, 6)] },
  '8.11': { C: S811, amb: 'lantern', fx: (h) => [loopFor('moto_idle_loop', 0, h.dur, 0.18, 10)] },
  '8.12': { C: S812, amb: 'lantern' },
  '8.13': {
    C: S813,
    amb: 'lantern',
    fx: (h) => [
      hit('pop_big', 0, 1, undefined),
      hit('whoosh', 0, 0.8),
      loopFor('panting_loop', h.L('L211') - 4, h.dur + 30, 0.45, 6),
    ],
  },
  '8.14': {
    C: S814,
    amb: 'lantern',
    fx: (h) => [
      hit('cloth', h.at('L212', 'tất cả'), 0.6),
      hit('whoosh', h.at('L212', 'tất cả'), 0.6),
      loopFor('panting_loop', 0, h.dur, 0.35, 10),
    ],
  },
  '8.15': { C: S815, amb: 'lantern' },
  '8.16': {
    C: S816,
    amb: 'lantern',
    fx: (h) => [
      loopFor('steps_rush_loop', 0, h.L('L216'), 0.6, 4),
      loopFor('moto_idle_loop', 0, h.L('L215'), 0.5, 4),
      hit('shouts', h.L('L214'), 0.7),
      hit('shove', h.L('L215'), 0.8),
      hit('cloth', h.L('L216'), 0.6),
      hit('shove', h.L('L217'), 0.6),
      hit('shouts', h.L('L218'), 0.6),
    ],
  },
  '8.17': { C: S817, amb: 'lantern', fx: (h) => [loopFor('siren_loop', 0, h.dur + 60, 0.5, 20)] },
  '8.18': {
    C: S818,
    amb: 'lantern',
    fx: (h) => [
      loopFor('steps_small_loop', 0, h.L('L221') - 4, 0.8, 3),
      hit('hug', h.L('L221'), 0.9),
    ],
  },
  '8.19': {
    C: S819,
    amb: 'lantern',
    fx: (h) => [
      hit('cloth', 4, 0.5),
      loopFor('panting_loop', 0, h.L('L230'), 0.45, 6),
      loopFor('exhale', h.L('L230'), h.dur, 0.0, 6),
    ],
  },
};
