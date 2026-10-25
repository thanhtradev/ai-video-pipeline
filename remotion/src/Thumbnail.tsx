import { AbsoluteFill } from 'remotion';
import { Background } from './Background';
import { FONT_FAMILY, FontGate } from './fonts';
import { fontSizeFor, PALETTES, type ThumbnailProps } from './props';

// Still frame for the preview and upload: the title large, the hook below it.

export function Thumbnail({ style, title, hook }: ThumbnailProps) {
  const palette = PALETTES[style];
  const size = Math.round(fontSizeFor(title) * 1.1);
  return (
    <FontGate>
      <AbsoluteFill>
        <Background palette={palette} />
        <AbsoluteFill
          style={{
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: FONT_FAMILY,
            color: palette.text,
            textAlign: 'center',
            padding: '0 100px',
          }}
        >
          <div style={{ fontSize: size, fontWeight: 800, lineHeight: 1.12 }}>{title}</div>
          <div
            style={{
              width: 220,
              height: 14,
              borderRadius: 7,
              background: palette.accent,
              margin: '56px 0',
            }}
          />
          <div style={{ fontSize: 54, fontWeight: 500, lineHeight: 1.35, opacity: 0.85 }}>
            {hook}
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    </FontGate>
  );
}
