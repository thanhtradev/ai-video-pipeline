import { z } from 'zod';

/**
 * Video frame of an episode (D-080): a property of the kit (remotion/catalog.json `frame`), e.g.
 * whatif 1920×1080, science 1080×1920. The episode_code job records it in its result, and the
 * render, QA and archive steps take it from there.
 */
export const frameSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type Frame = z.infer<typeof frameSchema>;

/** The frame of every episode made before D-080 (episode code results without `frame`). */
export const LANDSCAPE_FRAME: Frame = { width: 1920, height: 1080 };

export type AspectRatio = '16:9' | '9:16';

export function aspectRatioOf(frame: Frame): AspectRatio {
  return frame.width >= frame.height ? '16:9' : '9:16';
}

/** e.g. "Landscape 16:9 (1920×1080)" — for prompts and agent docs. */
export function describeFrame(frame: Frame): string {
  const aspect = aspectRatioOf(frame);
  return `${aspect === '16:9' ? 'Landscape' : 'Vertical'} ${aspect} (${frame.width}×${frame.height})`;
}

export function scaledFrame(frame: Frame, scale: number): Frame {
  return { width: Math.round(frame.width * scale), height: Math.round(frame.height * scale) };
}
