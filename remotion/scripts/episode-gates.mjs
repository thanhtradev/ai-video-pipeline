// Worker gates for an agent-written episode workspace (docs/episode-pipeline.md §6, D-054).
// The worker runs this under ops/claude/episode-render.sb (loopback only, writes only in the
// workspace), since it executes agent-written code: the SFX script and the episode in Chrome.
// Usage: node remotion/scripts/episode-gates.mjs <workspace>   → <workspace>/gates.json
// Steps: typecheck → SFX synthesis (no ambience beds, sfx-rules.mjs) → storyboard pages → audio mix
// (voice + SFX as the Episode plays them, no frames: board/mix.wav, D-071) → text-out-of-frame QA
// (reference scripts/tiktok2/check-text-bounds.mjs). Later steps run only when the typecheck passes.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import {
  openBrowser,
  renderFrames,
  renderMedia,
  renderStill,
  selectComposition,
} from '@remotion/renderer';
import { ambienceBeds } from './sfx-rules.mjs';

const ws = process.argv[2];
if (!ws || !existsSync(join(ws, 'src', 'index.ts'))) {
  console.error('usage: node episode-gates.mjs <workspace>');
  process.exit(2);
}
// Remotion finds its Chrome download (remotion/node_modules/.remotion) from the working directory;
// the sandbox has no network, so the browser must already be there (`npx remotion browser ensure`).
process.chdir(join(dirname(fileURLToPath(import.meta.url)), '..'));
const require = createRequire(import.meta.url);
const TSC = join(dirname(require.resolve('typescript/package.json')), 'bin', 'tsc');
const STEP_TIMEOUT_MS = 10 * 60 * 1000;
const OUTPUT_TAIL = 6000;
/**
 * QA samples per fresh browser. 100 crashed Chrome deterministically on one episode (a V8 fatal
 * check in the tab, 2026-10-27) while 20 passed; a fresh browser costs under a second.
 */
const QA_CHUNK = 20;
/** Must match src/Root.tsx: board shots per page, QA sampling step. */
const BOARD_PER = 12;
const QA_EVERY = 10;
// The worker's GL backend (D-075): ANGLE on the Macs, swangle on a CPU-only Linux.
const CHROMIUM = { gl: process.env.REMOTION_GL || 'angle' };

const tail = (text) => String(text ?? '').slice(-OUTPUT_TAIL);
const run = (args) =>
  spawnSync(process.execPath, args, { cwd: ws, encoding: 'utf8', timeout: STEP_TIMEOUT_MS });

function typecheck() {
  const r = run([TSC, '-p', 'tsconfig.json']);
  return { ok: r.status === 0, output: tail(`${r.stdout}${r.stderr}`) };
}

function sfx() {
  const out = join(ws, 'public', 'sfx');
  mkdirSync(out, { recursive: true });
  const r = run(['sfx/generate-sfx.mjs', 'public/sfx']);
  const files = readdirSync(out)
    .filter((f) => f.endsWith('.wav'))
    .sort();
  const output = tail(`${r.stdout}${r.stderr}`);
  const beds = ambienceBeds(files);
  if (beds.length === 0) return { ok: r.status === 0, files, output };
  return {
    ok: false,
    files,
    output:
      `Ambience beds and room tone are not allowed (heard as constant hiss): ${beds.join(', ')}. ` +
      `Remove them from sfx/generate-sfx.mjs and the episode audio.\n${output}`,
  };
}

async function board(serveUrl, browser) {
  const dir = join(ws, 'board');
  mkdirSync(dir, { recursive: true });
  const composition = await selectComposition({
    serveUrl,
    id: 'EpisodeBoard',
    puppeteerInstance: browser,
  });
  const shots = JSON.parse(readFileSync(join(ws, 'src', 'data', 'timing.json'), 'utf8')).shots
    .length;
  const pages = [];
  for (let page = 0; page < Math.ceil(shots / BOARD_PER); page++) {
    const name = `page-${String(page + 1).padStart(2, '0')}.jpg`;
    await renderStill({
      composition,
      serveUrl,
      frame: page,
      output: join(dir, name),
      imageFormat: 'jpeg',
      jpegQuality: 85,
      puppeteerInstance: browser,
      chromiumOptions: CHROMIUM,
      timeoutInMilliseconds: 240_000,
    });
    pages.push(`board/${name}`);
  }
  return { ok: true, pages };
}

/** The Episode's audio only: with an audio codec Remotion takes no screenshots. */
async function mix(serveUrl, browser) {
  const composition = await selectComposition({
    serveUrl,
    id: 'Episode',
    puppeteerInstance: browser,
  });
  const file = 'board/mix.wav';
  await renderMedia({
    composition,
    serveUrl,
    codec: 'wav',
    outputLocation: join(ws, file),
    puppeteerInstance: browser,
    chromiumOptions: CHROMIUM,
    timeoutInMilliseconds: 240_000,
  });
  return { ok: true, file };
}

/** Groups out-of-frame text hits by text and kind into runs of consecutive samples. */
function groupHits(hits, every) {
  const open = new Map();
  const rows = [];
  for (const h of hits.sort((a, b) => a.at - b.at)) {
    const key = `${h.kind}|${h.text}`;
    const run = open.get(key);
    if (run && h.at - run.to <= every) {
      run.to = h.at;
    } else {
      const fresh = { kind: h.kind, side: h.side, text: h.text, from: h.at, to: h.at };
      open.set(key, fresh);
      rows.push(fresh);
    }
  }
  return rows.sort((a, b) => a.from - b.from);
}

async function textBounds(serveUrl) {
  const composition = await selectComposition({ serveUrl, id: 'EpisodeQA' });
  const samples = Math.ceil(composition.durationInFrames / QA_EVERY);
  const hits = [];
  let measured = 0;
  for (let a = 0; a < samples; a += QA_CHUNK) {
    // A fresh browser per chunk, as in the reference: long runs crash Chrome on small machines.
    await renderFrames({
      composition,
      serveUrl,
      inputProps: {},
      imageFormat: 'none',
      frameRange: [a, Math.min(samples, a + QA_CHUNK) - 1],
      concurrency: 3,
      timeoutInMilliseconds: 120_000,
      chromiumOptions: CHROMIUM,
      onStart: () => {},
      onFrameUpdate: () => {},
      outputDir: null,
      onBrowserLog: (log) => {
        const text = log.text;
        if (text.startsWith('TEXTQA-PING')) measured++;
        else if (text.startsWith('TEXTQA|')) {
          const [, at, kind, side, , ...rest] = text.split('|');
          hits.push({ at: Number(at), kind, side, text: rest.join('|') });
        }
      },
    });
  }
  const rows = groupHits(hits, QA_EVERY);
  const sharp = rows.filter((r) => r.kind !== 'blur');
  return {
    ok: sharp.length === 0,
    measured,
    sharp: sharp.length,
    blur: rows.length - sharp.length,
    rows,
  };
}

async function guarded(step) {
  try {
    return await step();
  } catch (error) {
    return { ok: false, error: tail(error?.stack ?? String(error)) };
  }
}

const report = { typecheck: typecheck() };
if (report.typecheck.ok) {
  report.sfx = sfx();
  const serveUrl = await guarded(() =>
    bundle({
      entryPoint: join(ws, 'src', 'index.ts'),
      publicDir: join(ws, 'public'),
      enableCaching: false,
    }),
  );
  if (typeof serveUrl === 'string') {
    const browser = await openBrowser('chrome', { chromiumOptions: CHROMIUM });
    try {
      report.board = await guarded(() => board(serveUrl, browser));
      report.mix = await guarded(() => mix(serveUrl, browser));
    } finally {
      await browser.close({ silent: true });
    }
    report.textBounds = await guarded(() => textBounds(serveUrl));
  } else {
    report.bundle = serveUrl;
  }
}
report.ok = ['typecheck', 'sfx', 'board', 'mix', 'textBounds'].every((k) => report[k]?.ok === true);
writeFileSync(join(ws, 'gates.json'), `${JSON.stringify(report, null, 1)}\n`);
console.log(`gates ${report.ok ? 'passed' : 'failed'}`);
process.exit(0);
