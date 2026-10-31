import { copyFile, mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pino from 'pino';
import { beforeEach, describe, expect, test } from 'vitest';
import {
  createRenderEpisodeHandler,
  EPISODE_PREVIEW_SCALE,
  type RenderEpisodeDeps,
} from '../../src/handlers/render-episode.js';
import { PermanentJobError, ProviderBlockedError, type HandlerContext } from '../../src/runner.js';
import { writeCheckpoint } from '../../src/storage/checkpoint.js';

const CODE_JOB = '11111111-1111-4111-8111-111111111111';
const TIMING_JOB = '22222222-2222-4222-8222-222222222222';
const RENDER_JOB = '33333333-3333-4333-8333-333333333333';
const INPUT = { episode_code_job_id: CODE_JOB, timing_job_id: TIMING_JOB };
const TIMING = {
  fps: 30,
  totalFrames: 150,
  lines: [
    { id: 'S001', text: 'Nếu bạn nghe được suy nghĩ của con mèo?', from: 3, to: 60 },
    { id: 'S002', text: 'Con mèo nhìn bạn.', from: 75, to: 120 },
  ],
};

let jobsDir: string;
let workDir: string;
let renders: { ws: string; output: string; scale: number }[];

beforeEach(async () => {
  jobsDir = await realpath(await mkdtemp(join(tmpdir(), 'jobs-')));
  workDir = join(jobsDir, RENDER_JOB);
  await mkdir(workDir);
  renders = [];
  const codeDir = join(jobsDir, CODE_JOB);
  await mkdir(join(codeDir, 'ws', 'src', 'episode'), { recursive: true });
  await mkdir(join(codeDir, 'ws', 'src', 'data'), { recursive: true });
  await writeFile(join(codeDir, 'ws', 'src', 'episode', 'Episode.tsx'), 'export {};\n');
  await writeFile(join(codeDir, 'ws', 'src', 'data', 'timing.json'), JSON.stringify(TIMING));
  await writeCheckpoint(codeDir, ['ws/src/episode/Episode.tsx'], {});
  await mkdir(join(jobsDir, TIMING_JOB));
  await writeFile(join(jobsDir, TIMING_JOB, 'timing.json'), JSON.stringify(TIMING));
  await writeCheckpoint(join(jobsDir, TIMING_JOB), ['timing.json'], {});
});

function deps(overrides: Partial<RenderEpisodeDeps> = {}): RenderEpisodeDeps {
  return {
    render: async (ws, output, scale) => {
      renders.push({ ws, output, scale });
      await mkdir(join(ws, 'out'), { recursive: true });
      await writeFile(join(ws, output), 'raw video');
    },
    loudness: async (input, output) => {
      await copyFile(input, output);
      return { input_lufs: -20, input_true_peak: -3, output_lufs: -14, output_true_peak: -1.6 };
    },
    probe: async () => 5,
    browserReady: () => true,
    blockSeconds: 1800,
    ...overrides,
  };
}

function context(input: unknown = INPUT): HandlerContext {
  return {
    jobId: RENDER_JOB,
    attemptNo: 1,
    input,
    workDir,
    signal: new AbortController().signal,
    logger: pino({ level: 'silent' }),
    progress: async () => undefined,
  };
}

describe('render_episode handler', () => {
  test('renders a copy of the approved workspace at 720p, normalised, with subtitles', async () => {
    const result = await createRenderEpisodeHandler(deps())(context());

    const ws = join(workDir, 'ws');
    expect(renders).toEqual([{ ws, output: 'out/preview.raw.mp4', scale: EPISODE_PREVIEW_SCALE }]);
    expect(await readFile(join(ws, 'src', 'episode', 'Episode.tsx'), 'utf8')).toBe('export {};\n');
    expect(result.outputs).toEqual(['preview.mp4', 'vi.srt']);
    expect(await readFile(join(workDir, 'preview.mp4'), 'utf8')).toBe('raw video');
    const srt = await readFile(join(workDir, 'vi.srt'), 'utf8');
    expect(srt).toContain('00:00:00,100 --> 00:00:02,000');
    expect(srt).toContain('Con mèo nhìn bạn.');
    expect(result.result).toMatchObject({
      width: 1280,
      height: 720,
      frames: 150,
      duration_seconds: 5,
      loudness: { output_lufs: -14 },
      subtitles: { language: 'vi', cues: 2 },
    });
  });

  test('renders the final 1080p after A2', async () => {
    const result = await createRenderEpisodeHandler(deps())(
      context({ ...INPUT, quality: 'final' }),
    );

    expect(renders.map((r) => [r.output, r.scale])).toEqual([['out/final.raw.mp4', 1]]);
    expect(result.outputs).toEqual(['final.mp4', 'vi.srt']);
    expect(result.result).toMatchObject({ quality: 'final', width: 1920, height: 1080 });
  });

  test('renders at the frame of the clip kit recorded by the episode code (D-080)', async () => {
    const codeDir = join(jobsDir, CODE_JOB);
    await writeCheckpoint(codeDir, ['ws/src/episode/Episode.tsx'], {
      frame: { width: 1080, height: 1920 },
    });
    const handler = createRenderEpisodeHandler(deps());

    expect((await handler(context())).result).toMatchObject({ width: 720, height: 1280 });
    expect((await handler(context({ ...INPUT, quality: 'final' }))).result).toMatchObject({
      width: 1080,
      height: 1920,
    });
  });

  test('fails permanently on invalid input or a changed episode code', async () => {
    const handler = createRenderEpisodeHandler(deps());
    await expect(handler(context({ episode_code_job_id: 'x' }))).rejects.toBeInstanceOf(
      PermanentJobError,
    );
    await writeFile(join(jobsDir, CODE_JOB, 'ws', 'src', 'episode', 'Episode.tsx'), 'changed');
    await expect(handler(context())).rejects.toThrow(/episode_code job .* is missing or changed/);
  });

  test("waits (blocked) while Remotion's Chrome is missing", async () => {
    const error = await createRenderEpisodeHandler(deps({ browserReady: () => false }))(
      context(),
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderBlockedError);
    expect((error as ProviderBlockedError).retryAfterSeconds).toBe(1800);
    expect(renders).toEqual([]);
  });
});
