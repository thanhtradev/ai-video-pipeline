import { Audio } from '@remotion/media';
import { AbsoluteFill, interpolate, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { Background } from './Background';
import { FontGate } from './fonts';
import { PALETTES, type ExplainerProps } from './props';
import { Scene } from './Scene';

// Typography explainer (D-041): one Sequence per scene, timed by the worker from the measured
// narration clips, over a shared background, with a progress bar and an optional music bed.

const MUSIC_FADE_IN_FRAMES = 15;
const MUSIC_FADE_OUT_FRAMES = 45;

export function Explainer({ style, scenes, music, durationInFrames }: ExplainerProps) {
  const palette = PALETTES[style];
  return (
    <FontGate>
      <AbsoluteFill>
        <Background palette={palette} />
        <ProgressBar color={palette.accent} />
        {scenes.map((scene) => (
          <Sequence
            key={scene.index}
            from={scene.startFrame}
            durationInFrames={scene.durationInFrames}
            name={`Scene ${scene.index}`}
          >
            <Scene scene={scene} total={scenes.length} palette={palette} />
            {scene.audioSrc ? <Audio src={scene.audioSrc} /> : null}
          </Sequence>
        ))}
        {music ? (
          <Audio
            src={music.src}
            loop
            volume={(f) =>
              music.volume *
              interpolate(
                f,
                [
                  0,
                  MUSIC_FADE_IN_FRAMES,
                  durationInFrames - MUSIC_FADE_OUT_FRAMES,
                  durationInFrames,
                ],
                [0, 1, 1, 0],
                { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
              )
            }
          />
        ) : null}
      </AbsoluteFill>
    </FontGate>
  );
}

function ProgressBar({ color }: { color: string }) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  return (
    <div
      style={{
        position: 'absolute',
        top: 200,
        left: 110,
        width: 860,
        height: 8,
        borderRadius: 4,
        background: 'rgba(255, 255, 255, 0.15)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${(100 * frame) / Math.max(durationInFrames - 1, 1)}%`,
          background: color,
        }}
      />
    </div>
  );
}
