import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import pino from 'pino';
import { describe, expect, test } from 'vitest';
import { createRenderPreviewHandler } from '../../src/handlers/render-preview.js';
import { createFfprobe } from '../../src/media/ffprobe.js';
import { createLoudnessNormalizer } from '../../src/media/loudness.js';
import { createMusicLibrary } from '../../src/render/music.js';
import { createRemotionRenderer } from '../../src/render/remotion-renderer.js';
import { writeCheckpoint } from '../../src/storage/checkpoint.js';

// A real Remotion render + ffmpeg loudness pass (slow, needs ffmpeg and the Chrome Headless Shell
// Remotion downloads on first use). Opt in: RUN_RENDER_TESTS=1 npx vitest run test/integration/render-preview.test.ts
// Set KEEP_RENDER=1 to print the output folder for a manual look.

const execFileAsync = promisify(execFile);
const FFMPEG = process.env.FFMPEG_BIN ?? 'ffmpeg';
const FFPROBE = process.env.FFPROBE_BIN ?? 'ffprobe';
const TTS_JOB = '0b9d8f7e-1c2a-4b3d-9e8f-123456789abc';

async function tone(path: string, seconds: number, frequency: number): Promise<void> {
  await execFileAsync(FFMPEG, [
    ...['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi'],
    ...['-i', `sine=frequency=${frequency}:duration=${seconds}`, '-c:a', 'libmp3lame', path],
  ]);
}

async function streams(path: string): Promise<Record<string, unknown>[]> {
  const { stdout } = await execFileAsync(FFPROBE, [
    ...['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height,r_frame_rate'],
    ...['-of', 'json', path],
  ]);
  return (JSON.parse(stdout) as { streams: Record<string, unknown>[] }).streams;
}

describe.runIf(process.env.RUN_RENDER_TESTS === '1')('render_preview (real render)', () => {
  test(
    'renders a 720×1280 H.264/AAC preview at the target loudness',
    { timeout: 600_000 },
    async () => {
      const jobsDir = await mkdtemp(join(tmpdir(), 'render-'));
      const ttsDir = join(jobsDir, TTS_JOB);
      const workDir = join(jobsDir, '5f4e3d2c-1b0a-4c9d-8e7f-abcdef012345');
      await mkdir(ttsDir);
      await mkdir(workDir);
      await tone(join(ttsDir, 'scene-01.mp3'), 1.5, 440);
      await tone(join(ttsDir, 'scene-02.mp3'), 2, 330);
      await writeCheckpoint(ttsDir, ['scene-01.mp3', 'scene-02.mp3'], {
        scenes: [
          { index: 1, file: 'scene-01.mp3', duration_seconds: 1.5 },
          { index: 2, file: 'scene-02.mp3', duration_seconds: 2 },
        ],
      });

      const library = join(jobsDir, 'music');
      await mkdir(join(library, 'calm'), { recursive: true });
      await tone(join(library, 'calm', 'test-bed.mp3'), 20, 220);
      await writeFile(
        join(library, 'catalog.json'),
        JSON.stringify({
          tracks: [
            {
              id: 'test-bed',
              style: 'calm',
              file: 'calm/test-bed.mp3',
              title: 'Test bed',
              artist: 'ffmpeg',
              source_url: 'https://ffmpeg.org/',
              license: 'test',
              license_url: 'https://ffmpeg.org/',
              credit: 'test',
              duration_seconds: 20,
              loudness_lufs: -20,
            },
          ],
        }),
      );

      const logger = pino({ level: 'silent' });
      const handler = createRenderPreviewHandler({
        renderer: createRemotionRenderer(logger),
        loudness: createLoudnessNormalizer(FFMPEG),
        probe: createFfprobe(FFPROBE),
        music: createMusicLibrary(library),
      });
      const result = await handler({
        jobId: 'render',
        attemptNo: 1,
        workDir,
        signal: new AbortController().signal,
        logger,
        input: {
          title: 'Vì sao bầu trời có màu xanh?',
          hook: 'Câu trả lời nằm ở ánh sáng',
          music_style: 'calm',
          language: 'vi',
          tts_job_id: TTS_JOB,
          scenes: [
            {
              index: 1,
              narration: 'Ánh sáng mặt trời có nhiều màu.',
              on_screen_text: 'Ánh sáng có nhiều màu',
              emphasis: ['nhiều màu'],
            },
            {
              index: 2,
              narration: 'Màu xanh bị tán xạ mạnh nhất.',
              on_screen_text: 'Màu xanh bị tán xạ',
              emphasis: ['tán xạ'],
            },
          ],
        },
      });
      if (process.env.KEEP_RENDER === '1') process.stderr.write(`render output: ${workDir}\n`);

      expect(await streams(join(workDir, 'preview.mp4'))).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            codec_type: 'video',
            codec_name: 'h264',
            width: 720,
            height: 1280,
            r_frame_rate: '30/1',
          }),
          expect.objectContaining({ codec_type: 'audio', codec_name: 'aac' }),
        ]),
      );
      const loudness = result.result.loudness as { output_lufs: number; output_true_peak: number };
      expect(loudness.output_lufs).toBeGreaterThan(-15);
      expect(loudness.output_lufs).toBeLessThan(-13);
      expect(loudness.output_true_peak).toBeLessThanOrEqual(-1);
      expect(result.result.duration_seconds).toBeCloseTo(4.2, 0);
      expect(result.result.music).toMatchObject({ id: 'test-bed' });
    },
  );
});
