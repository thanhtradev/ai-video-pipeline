// Props of the typography explainer (D-041, P-010). The worker builds them from the approved script
// and the measured narration clips; this file has no JSX so the worker can share the types.

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;

export const MUSIC_STYLES = [
  'uplifting',
  'calm',
  'curious',
  'epic',
  'playful',
  'groovy',
  'somber',
] as const;

export type MusicStyle = (typeof MUSIC_STYLES)[number];

export type ExplainerScene = {
  index: number;
  /** Vietnamese on-screen text, at most ~8 words. */
  text: string;
  /** Words or phrases of `text` to highlight. */
  emphasis: string[];
  startFrame: number;
  durationInFrames: number;
  /** Narration clip URL, or null for a silent scene. */
  audioSrc: string | null;
};

export type ExplainerProps = {
  style: MusicStyle;
  title: string;
  scenes: ExplainerScene[];
  music: { src: string; volume: number } | null;
  durationInFrames: number;
};

export type ThumbnailProps = {
  style: MusicStyle;
  title: string;
  hook: string;
};

export type Palette = {
  from: string;
  to: string;
  accent: string;
  text: string;
};

export const PALETTES: Record<MusicStyle, Palette> = {
  uplifting: { from: '#1a1446', to: '#3b1f6e', accent: '#ffd166', text: '#ffffff' },
  calm: { from: '#0b2a3a', to: '#14505f', accent: '#7ee8c4', text: '#ffffff' },
  curious: { from: '#0d0b26', to: '#2b1650', accent: '#9b8cff', text: '#ffffff' },
  epic: { from: '#140c0c', to: '#3d1414', accent: '#ff8a3d', text: '#ffffff' },
  playful: { from: '#1d1240', to: '#4a1d6b', accent: '#ff5fa2', text: '#ffffff' },
  groovy: { from: '#0e1a2b', to: '#1b3b5a', accent: '#3ee0ff', text: '#ffffff' },
  somber: { from: '#111418', to: '#2a2f36', accent: '#c9d1d9', text: '#ffffff' },
};

export type Word = { text: string; emphasized: boolean };

function normalizeWord(word: string): string {
  return word
    .normalize('NFC')
    .toLocaleLowerCase('vi')
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

/** Splits text into words and marks those covered by an emphasis word or phrase. */
export function splitWords(text: string, emphasis: readonly string[]): Word[] {
  const words = text.normalize('NFC').split(/\s+/).filter(Boolean);
  const keys = words.map(normalizeWord);
  const marked = words.map(() => false);
  for (const phrase of emphasis) {
    const target = phrase.split(/\s+/).map(normalizeWord).filter(Boolean);
    if (target.length === 0) continue;
    for (let start = 0; start + target.length <= keys.length; start += 1) {
      if (target.every((part, offset) => keys[start + offset] === part)) {
        for (let i = start; i < start + target.length; i += 1) marked[i] = true;
      }
    }
  }
  return words.map((word, i) => ({ text: word, emphasized: marked[i] ?? false }));
}

/** Font size (px at 1080 wide) that keeps short texts big and long ones on a few lines. */
export function fontSizeFor(text: string): number {
  const length = Array.from(text).length;
  if (length <= 18) return 128;
  if (length <= 32) return 108;
  if (length <= 48) return 92;
  return 78;
}
