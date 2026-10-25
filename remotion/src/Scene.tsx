import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { FONT_FAMILY } from './fonts';
import { fontSizeFor, splitWords, type ExplainerScene, type Palette } from './props';

// One scene: words rise in one after another, emphasized words get the accent colour and a
// highlight that sweeps in behind them, and the whole block fades out before the next scene.

const WORD_STAGGER = 4;
const EXIT_FRAMES = 8;

interface SceneProps {
  scene: ExplainerScene;
  total: number;
  palette: Palette;
}

export function Scene({ scene, total, palette }: SceneProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = splitWords(scene.text, scene.emphasis);
  const size = fontSizeFor(scene.text);
  const exitStart = scene.durationInFrames - EXIT_FRAMES;

  return (
    <AbsoluteFill
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: FONT_FAMILY,
        opacity: interpolate(frame, [exitStart, scene.durationInFrames], [1, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        }),
        scale: interpolate(frame, [exitStart, scene.durationInFrames], [1, 0.96], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        }),
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 300,
          color: palette.text,
          opacity: 0.55,
          fontSize: 36,
          fontWeight: 500,
          letterSpacing: 6,
        }}
      >
        {String(scene.index).padStart(2, '0')} / {String(total).padStart(2, '0')}
      </div>
      <div
        style={{
          width: 880,
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          columnGap: size * 0.28,
          rowGap: size * 0.12,
          lineHeight: 1.15,
          textAlign: 'center',
        }}
      >
        {words.map((word, i) => {
          const enter = spring({ frame: frame - i * WORD_STAGGER, fps, config: { damping: 200 } });
          const sweep = spring({
            frame: frame - i * WORD_STAGGER - 6,
            fps,
            config: { damping: 200 },
          });
          return (
            <span
              key={i}
              style={{
                position: 'relative',
                display: 'inline-block',
                fontSize: size,
                fontWeight: 800,
                color: word.emphasized ? palette.accent : palette.text,
                opacity: enter,
                translate: `0px ${interpolate(enter, [0, 1], [size * 0.5, 0])}px`,
              }}
            >
              {word.emphasized ? (
                <span
                  style={{
                    position: 'absolute',
                    left: -size * 0.08,
                    right: -size * 0.08,
                    bottom: size * 0.06,
                    height: size * 0.28,
                    background: palette.accent,
                    opacity: 0.22,
                    borderRadius: size * 0.08,
                    transformOrigin: 'left center',
                    scale: `${sweep} 1`,
                  }}
                />
              ) : null}
              <span style={{ position: 'relative' }}>{word.text}</span>
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}
