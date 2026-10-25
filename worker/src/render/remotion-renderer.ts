import { bundle } from '@remotion/bundler';
import { makeCancelSignal, renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { fileURLToPath } from 'node:url';
import type { Logger } from 'pino';
import type { ExplainerProps, ThumbnailProps } from '../../../remotion/src/props.js';

// Renders the repo's Remotion templates (remotion/, D-030) with the Node APIs. The bundle is built
// once per worker process; media reach the browser through startMediaServer() URLs.

export const ENTRY_POINT = fileURLToPath(
  new URL('../../../remotion/src/index.ts', import.meta.url),
);
export const EXPLAINER_ID = 'TypographyExplainer';
export const THUMBNAIL_ID = 'Thumbnail';
const CRF = 20;

export interface PreviewRenderer {
  renderVideo(
    props: ExplainerProps,
    output: string,
    scale: number,
    signal: AbortSignal,
  ): Promise<void>;
  renderThumbnail(
    props: ThumbnailProps,
    output: string,
    scale: number,
    signal: AbortSignal,
  ): Promise<void>;
}

function cancelOn(signal: AbortSignal): ReturnType<typeof makeCancelSignal>['cancelSignal'] {
  const { cancelSignal, cancel } = makeCancelSignal();
  if (signal.aborted) cancel();
  else signal.addEventListener('abort', () => cancel(), { once: true });
  return cancelSignal;
}

export function createRemotionRenderer(logger: Logger): PreviewRenderer {
  let serveUrl: Promise<string> | null = null;
  const bundled = (): Promise<string> => {
    serveUrl ??= bundle({ entryPoint: ENTRY_POINT }).catch((error: unknown) => {
      serveUrl = null; // try again on the next render
      throw error;
    });
    return serveUrl;
  };

  return {
    async renderVideo(props, output, scale, signal) {
      const url = await bundled();
      const composition = await selectComposition({
        serveUrl: url,
        id: EXPLAINER_ID,
        inputProps: props,
      });
      let lastLogged = -1;
      await renderMedia({
        composition,
        serveUrl: url,
        codec: 'h264',
        audioCodec: 'aac',
        crf: CRF,
        scale,
        inputProps: props,
        outputLocation: output,
        overwrite: true,
        cancelSignal: cancelOn(signal),
        onProgress: ({ progress }) => {
          const step = Math.floor(progress * 4);
          if (step > lastLogged) {
            lastLogged = step;
            logger.info({ progress: Math.round(progress * 100) }, 'rendering preview');
          }
        },
      });
    },

    async renderThumbnail(props, output, scale, signal) {
      const url = await bundled();
      const composition = await selectComposition({
        serveUrl: url,
        id: THUMBNAIL_ID,
        inputProps: props,
      });
      await renderStill({
        composition,
        serveUrl: url,
        output,
        overwrite: true,
        scale,
        inputProps: props,
        cancelSignal: cancelOn(signal),
      });
    },
  };
}
