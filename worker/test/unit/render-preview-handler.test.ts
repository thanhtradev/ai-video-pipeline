import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pino from 'pino';
import { beforeEach, describe, expect, test } from 'vitest';
import type { ExplainerProps, ThumbnailProps } from '../../../remotion/src/props.js';
import {
  createRenderPreviewHandler,
  PREVIEW_SCALE,
  type RenderPreviewDeps,
} from '../../src/handlers/render-preview.js';
import type { MusicLibrary } from '../../src/render/music.js';
import type { PreviewRenderer } from '../../src/render/remotion-renderer.js';
import { PermanentJobError, type HandlerContext } from '../../src/runner.js';
import { writeCheckpoint } from '../../src/storage/checkpoint.js';

const TTS_JOB = '0b9d8f7e-1c2a-4b3d-9e8f-123456789abc';
const RENDER_JOB = '5f4e3d2c-1b0a-4c9d-8e7f-abcdef012345';

const INPUT = {
  title: 'Bầu trời xanh',
  hook: 'Vì sao bầu trời màu xanh?',
  music_style: 'curious',
  language: 'vi',
  tts_job_id: TTS_JOB,
  scenes: [
    { index: 1, narration: 'Ánh sáng có nhiều màu.', on_screen_text: 'Nhiều màu', emphasis: [] },
    {
      index: 2,
      narration: 'Màu xanh bị tán xạ mạnh nhất.',
      on_screen_text: 'Tán xạ',
      emphasis: ['Tán xạ'],
    },
  ],
};

let jobsDir: string;
let workDir: string;
let rendered: { props: ExplainerProps; scale: number; fetched: string[] }[];
let thumbnails: ThumbnailProps[];

async function writeTtsJob(scenes = [1, 2]): Promise<void> {
  const ttsDir = join(jobsDir, TTS_JOB);
  await mkdir(ttsDir, { recursive: true });
  for (const index of scenes) await writeFile(join(ttsDir, `scene-0${index}.mp3`), `voice${index}`);
  await writeCheckpoint(
    ttsDir,
    scenes.map((index) => `scene-0${index}.mp3`),
    {
      scenes: scenes.map((index) => ({
        index,
        file: `scene-0${index}.mp3`,
        duration_seconds: index === 1 ? 2 : 3,
      })),
    },
  );
}

beforeEach(async () => {
  jobsDir = await mkdtemp(join(tmpdir(), 'jobs-'));
  workDir = join(jobsDir, RENDER_JOB);
  await mkdir(workDir);
  rendered = [];
  thumbnails = [];
});

const renderer: PreviewRenderer = {
  async renderVideo(props, output, scale) {
    // Fetch every media URL like the render browser does.
    const urls = [
      ...props.scenes.map((s) => s.audioSrc!),
      ...(props.music ? [props.music.src] : []),
    ];
    const fetched = await Promise.all(urls.map(async (url) => (await fetch(url)).text()));
    rendered.push({ props, scale, fetched });
    await writeFile(output, 'raw video');
  },
  async renderThumbnail(props, output) {
    thumbnails.push(props);
    await writeFile(output, 'png');
  },
};

function deps(overrides: Partial<RenderPreviewDeps> = {}): RenderPreviewDeps {
  return {
    renderer,
    loudness: async (input, output) => {
      await writeFile(output, `normalized ${await readFile(input, 'utf8')}`);
      return { input_lufs: -20, input_true_peak: -3, output_lufs: -14, output_true_peak: -1.6 };
    },
    probe: async () => 6.4,
    music: null,
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
  };
}

describe('render_preview handler', () => {
  test('renders the timed scenes with their narration and writes all outputs', async () => {
    await writeTtsJob();
    const result = await createRenderPreviewHandler(deps())(context());

    expect(result.outputs).toEqual(['preview.mp4', 'thumbnail.png', 'vi.srt', 'vi.vtt']);
    expect((await readdir(workDir)).sort()).toEqual(
      ['preview.mp4', 'thumbnail.png', 'vi.srt', 'vi.vtt'].sort(),
    );
    expect(await readFile(join(workDir, 'preview.mp4'), 'utf8')).toBe('normalized raw video');

    const [{ props, scale, fetched }] = rendered as [(typeof rendered)[number]];
    expect(scale).toBe(PREVIEW_SCALE);
    expect(fetched).toEqual(['voice1', 'voice2']);
    expect(props).toMatchObject({
      style: 'curious',
      music: null,
      scenes: [
        { index: 1, text: 'Nhiều màu', startFrame: 0, durationInFrames: 71 },
        { index: 2, text: 'Tán xạ', emphasis: ['Tán xạ'], startFrame: 71, durationInFrames: 101 },
      ],
      durationInFrames: 172,
    });
    expect(thumbnails).toEqual([
      { style: 'curious', title: 'Bầu trời xanh', hook: 'Vì sao bầu trời màu xanh?' },
    ]);

    const srt = await readFile(join(workDir, 'vi.srt'), 'utf8');
    expect(srt).toContain('00:00:00,000 --> 00:00:02,000\nÁnh sáng có nhiều màu.');
    expect(srt).toContain('00:00:02,367 --> 00:00:05,367\nMàu xanh bị tán xạ mạnh nhất.');
    expect(result.result).toMatchObject({
      width: 720,
      height: 1280,
      fps: 30,
      frames: 172,
      duration_seconds: 6.4,
      subtitles: { cues: 2 },
      music: null,
      loudness: { output_lufs: -14 },
    });
  });

  test('adds the music bed from the library and reports its license and credit', async () => {
    await writeTtsJob();
    const musicFile = join(jobsDir, 'bed.mp3');
    await writeFile(musicFile, 'music');
    const picks: [string, string][] = [];
    const music: MusicLibrary = {
      pick: async (style, seed) => {
        picks.push([style, seed]);
        return {
          path: musicFile,
          volume: 0.2,
          track: {
            id: 'incompetech--frost-waltz',
            style: 'curious',
            file: 'curious/incompetech--frost-waltz.mp3',
            title: 'Frost Waltz',
            artist: 'Kevin MacLeod',
            source_url: 'https://incompetech.com/x',
            license: 'CC-BY-4.0',
            license_url: 'https://creativecommons.org/licenses/by/4.0/',
            credit: 'Frost Waltz Kevin MacLeod (incompetech.com)',
            duration_seconds: 135,
            loudness_lufs: -16,
          },
        };
      },
    };

    const result = await createRenderPreviewHandler(deps({ music }))(context());

    expect(picks).toEqual([['curious', TTS_JOB]]);
    expect(rendered[0]!.props.music?.volume).toBe(0.2);
    expect(rendered[0]!.fetched).toContain('music');
    expect(result.result.music).toMatchObject({
      id: 'incompetech--frost-waltz',
      license: 'CC-BY-4.0',
      credit: 'Frost Waltz Kevin MacLeod (incompetech.com)',
    });
  });

  test('needs a decision when the narration checkpoint is missing or incomplete', async () => {
    await expect(createRenderPreviewHandler(deps())(context())).rejects.toBeInstanceOf(
      PermanentJobError,
    );
    await writeTtsJob([1]);
    await expect(createRenderPreviewHandler(deps())(context())).rejects.toThrow(
      /no narration clip for scene 2/,
    );
    await writeFile(join(jobsDir, TTS_JOB, 'scene-01.mp3'), 'tampered');
    await expect(createRenderPreviewHandler(deps())(context())).rejects.toThrow(
      /missing or changed/,
    );
    expect(rendered).toEqual([]);
  });

  test('rejects invalid input permanently', async () => {
    await expect(
      createRenderPreviewHandler(deps())(context({ ...INPUT, music_style: 'disco' })),
    ).rejects.toBeInstanceOf(PermanentJobError);
  });
});
