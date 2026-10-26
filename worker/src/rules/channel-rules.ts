import { z } from 'zod';

// Channel rules (D-059), kept by the owner from Telegram (telegram_rules in SQL). Video and TTS
// rules are prompt text for the script writer and the episode agent; pronunciation entries replace
// a written term in the TTS text only, so captions and on-screen text keep the term.

export const rulesSchema = z.object({
  version: z.string(),
  video: z.array(z.object({ id: z.number(), text: z.string() })),
  tts: z.array(z.object({ id: z.number(), text: z.string() })),
  pronunciation: z.array(z.object({ term: z.string().min(1), spoken: z.string().min(1) })),
});

export type ChannelRules = z.infer<typeof rulesSchema>;
export type Pronunciation = ChannelRules['pronunciation'];
/** The current rules, read when a step starts. */
export type RulesSource = () => Promise<ChannelRules>;

export const NO_RULES: ChannelRules = { version: 'none', video: [], tts: [], pronunciation: [] };

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Audio tags such as [punchy] are instructions to the voice, never read aloud: left alone. */
const AUDIO_TAG = /(\[[^\]\n]*\])/;

function termPattern(pronunciation: Pronunciation): RegExp | null {
  if (pronunciation.length === 0) return null;
  // Longest first, so "TikTok Shop" wins over "TikTok".
  const terms = [...pronunciation]
    .map((p) => p.term)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp);
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${terms.join('|')})(?![\\p{L}\\p{N}])`, 'gu');
}

/** The text the voice reads: each term (case-sensitive, whole word) replaced by how it is said. */
export function pronounce(text: string, pronunciation: Pronunciation): string {
  const pattern = termPattern(pronunciation);
  if (!pattern) return text;
  const spoken = new Map(pronunciation.map((p) => [p.term, p.spoken]));
  return text
    .normalize('NFC')
    .split(AUDIO_TAG)
    .map((part, i) => (i % 2 === 1 ? part : part.replace(pattern, (term) => spoken.get(term)!)))
    .join('');
}

/** How a displayed word is said, when the pronunciation table has it (punctuation ignored). */
export function spokenForm(word: string, pronunciation: Pronunciation): string | null {
  const bare = word.normalize('NFC').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  return pronunciation.find((p) => p.term === bare)?.spoken ?? null;
}

/** The owner's rules as a prompt section; empty when there are none. */
export function rulesPrompt(rules: ChannelRules): string[] {
  const list = (items: { text: string }[]) => items.map((rule) => `- ${rule.text}`);
  return [
    ...(rules.video.length > 0
      ? [
          "The channel owner's rules for every video (follow them; where one conflicts with a style rule above it wins, but never with the schema or the narration rules):",
          ...list(rules.video),
          '',
        ]
      : []),
    ...(rules.tts.length > 0
      ? [
          "The channel owner's rules for narration lines and their delivery (audio tags):",
          ...list(rules.tts),
          '',
        ]
      : []),
  ];
}

/** rules.md for the episode agent's workspace. */
export function rulesMarkdown(rules: ChannelRules): string {
  const list = (items: { text: string }[]) =>
    items.length > 0 ? items.map((rule) => `- ${rule.text}`).join('\n') : '- (none)';
  return [
    "# Channel owner's rules",
    '',
    'They override CLAUDE.md where they disagree.',
    '',
    '## Every video',
    '',
    list(rules.video),
    '',
    '## Narration',
    '',
    list(rules.tts),
    '',
  ].join('\n');
}
