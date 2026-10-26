/**
 * The parts of an episode timeline (data/timing.json) the kit reads. Every episode has its own
 * time.ts; the kit only needs these shapes.
 */
/** One word as the timing builder writes it: [text, normalised text, fromFrame, toFrame]. */
export type CaptionWord = readonly (string | number)[];
export type CaptionLine = {
  readonly from: number;
  readonly to: number;
  readonly words: readonly CaptionWord[];
};
