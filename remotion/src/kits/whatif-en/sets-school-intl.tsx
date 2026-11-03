import type { SetLayers } from '../whatif/sets';
import {
  CrowdSil,
  Door,
  ParkBench,
  RoundTree,
  SchoolBus,
  StreetLamp,
  StripesFlag,
} from './props-intl';
import { FONT } from '../whatif/theme';

/**
 * Western school and town sets of the "What if… (EN)" kit (D-092): `kit/active/sets-school`.
 * The Vietnamese ones (school gate with almond tree, motorbike traffic, Saigon bus station,
 * Hoan Kiem lake) are not re-exported.
 */
export { Coach, Leaf, Mirror } from '../whatif/sets-school';

/** Front of a brick high school: name sign, steps, double doors, striped flag, yellow bus. */
export const schoolFront = (
  f: number,
  o: { name?: string; bus?: boolean; crowd?: number } = {},
): SetLayers => ({
  sky: '#bcd3dc',
  far: (
    <g>
      <rect x={-1300} y={-600} width={3700} height={1800} fill="#bcd3dc" />
      <rect x={-500} y={200} width={2000} height={1000} fill="#a8705c" />
      {Array.from({ length: 22 }, (_, i) => (
        <rect key={i} x={-500} y={220 + i * 44} width={2000} height={3} fill="#00000018" />
      ))}
      {Array.from({ length: 8 }, (_, i) => (
        <g key={i}>
          <rect x={-420 + i * 250} y={300} width={150} height={190} fill="#c9d6dd" />
          <rect x={-420 + i * 250} y={300} width={150} height={12} fill="#ece6da" />
        </g>
      ))}
      <rect x={180} y={600} width={760} height={110} rx={8} fill="#ece6da" />
      <text
        x={560}
        y={680}
        textAnchor="middle"
        fontFamily={FONT}
        fontWeight={800}
        fontSize={66}
        fill="#3a343c"
      >
        {o.name ?? 'WESTBROOK HIGH SCHOOL'}
      </text>
      <Door x={480} y={1200} w={180} h={420} color="#5f7186" />
      <Door x={660} y={1200} w={180} h={420} color="#5f7186" />
    </g>
  ),
  bg: (
    <g>
      <rect x={-1300} y={1200} width={3700} height={60} fill="#c9c3b6" />
      <rect x={300} y={1200} width={520} height={30} fill="#b7b0a2" />
      <rect x={-1300} y={1260} width={3700} height={1200} fill="#8fa07a" />
      <path d="M380 1260 L740 1260 L900 2400 L220 2400 Z" fill="#cfc3a6" />
      <StripesFlag x={-260} y={1260} f={f} />
      <RoundTree x={1400} y={1300} s={0.85} f={f} />
      {(o.crowd ?? 0) > 0 && (
        <CrowdSil y={1300} x0={-200} x1={1300} n={o.crowd ?? 0} seed="sf" s={0.4} f={f} />
      )}
    </g>
  ),
  back: o.bus ? <SchoolBus x={-650} y={1560} s={0.9} /> : null,
  glow: { x: 1300, y: 200, r: 850, color: '#fff2cf', a: 0.42 },
});

/** Bus stop on a town sidewalk: shelter, bench, street lamp, storefronts with English signs. */
export const busStop = (
  f: number,
  o: { night?: boolean; signs?: [string, string] } = {},
): SetLayers => {
  const [left, right] = o.signs ?? ['DINER', 'PHARMACY'];
  return {
    sky: o.night ? '#28304a' : '#c3d6dc',
    far: (
      <g>
        <rect
          x={-1300}
          y={-600}
          width={3700}
          height={1800}
          fill={o.night ? '#28304a' : '#c3d6dc'}
        />
        {[
          [-500, '#b7a08a', left],
          [400, '#8797a6', right],
          [1300, '#a99a8a', ''],
        ].map(([x, c, sign], i) => (
          <g key={i}>
            <rect x={Number(x)} y={300} width={820} height={900} fill={String(c)} />
            <rect
              x={Number(x) + 60}
              y={760}
              width={700}
              height={380}
              fill={o.night ? '#ffd48a' : '#c9d6dd'}
              opacity={0.85}
            />
            {sign && (
              <g>
                <rect x={Number(x) + 120} y={600} width={580} height={110} rx={10} fill="#3a3a42" />
                <text
                  x={Number(x) + 410}
                  y={680}
                  textAnchor="middle"
                  fontFamily={FONT}
                  fontWeight={800}
                  fontSize={64}
                  fill="#ffd894"
                >
                  {String(sign)}
                </text>
              </g>
            )}
          </g>
        ))}
      </g>
    ),
    bg: (
      <g>
        <rect x={-1300} y={1200} width={3700} height={300} fill="#c9c3b6" />
        <rect x={-1300} y={1500} width={3700} height={1000} fill="#6f6e72" />
        <StreetLamp x={1100} y={1420} s={0.9} lit={o.night} />
      </g>
    ),
    back: (
      <g>
        <rect x={60} y={900} width={600} height={30} rx={8} fill="#4a4a50" />
        <rect x={70} y={930} width={14} height={500} fill="#4a4a50" />
        <rect x={636} y={930} width={14} height={500} fill="#4a4a50" />
        <rect x={90} y={940} width={540} height={380} fill="#c9d6dd" opacity={0.35} />
        <ParkBench x={360} y={1430} s={0.9} />
      </g>
    ),
    glow: o.night
      ? { x: 1160, y: 700, r: 520, color: '#ffcf8a', a: 0.42 }
      : { x: 900, y: 200, r: 800, color: '#fff2cf', a: 0.4 },
  };
};
