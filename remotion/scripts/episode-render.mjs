// Renders the `Episode` composition of an approved episode workspace (C4, docs/episode-pipeline.md
// §8). Run by the worker under ops/claude/episode-render.sb, since the episode is agent-written code.
// Usage: node remotion/scripts/episode-render.mjs <workspace> <output inside the workspace> <scale>
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';

const [ws, output, scale] = process.argv.slice(2);
if (!ws || !output || !scale) {
  console.error('usage: node episode-render.mjs <workspace> <output> <scale>');
  process.exit(2);
}
// Remotion finds its Chrome download from the working directory (see episode-gates.mjs).
process.chdir(join(dirname(fileURLToPath(import.meta.url)), '..'));
// Tunables from the worker (D-075): ANGLE and 8 frames on the Macs, swangle on a CPU-only Linux.
const CHROMIUM = { gl: process.env.REMOTION_GL || 'angle' };
const CONCURRENCY = Number(process.env.RENDER_CONCURRENCY) || 8;

const serveUrl = await bundle({
  entryPoint: join(ws, 'src', 'index.ts'),
  publicDir: join(ws, 'public'),
  enableCaching: false,
});
const composition = await selectComposition({ serveUrl, id: 'Episode', chromiumOptions: CHROMIUM });
await renderMedia({
  composition,
  serveUrl,
  codec: 'h264',
  crf: 20,
  scale: Number(scale),
  outputLocation: join(ws, output),
  concurrency: CONCURRENCY,
  chromiumOptions: CHROMIUM,
  timeoutInMilliseconds: 240_000,
});
console.log(`rendered ${composition.durationInFrames} frames`);
