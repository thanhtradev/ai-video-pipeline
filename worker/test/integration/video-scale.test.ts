import { execFile } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, test } from 'vitest';
import { createFfprobe } from '../../src/media/ffprobe.js';
import { createVideoScaler } from '../../src/media/scale.js';

// The preview scaled down from the full-size render (D-089), with real ffmpeg (RUN_RENDER_TESTS=1).

const run = promisify(execFile);
const FFMPEG = process.env.FFMPEG_BIN ?? 'ffmpeg';
const FFPROBE = process.env.FFPROBE_BIN ?? 'ffprobe';

describe.runIf(process.env.RUN_RENDER_TESTS === '1')('video scaler (real ffmpeg)', () => {
  test('scales the video to the preview frame and keeps the audio and duration', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'scale-'));
    const master = join(dir, 'master.mp4');
    await run(FFMPEG, [
      ...['-hide_banner', '-loglevel', 'error', '-y'],
      ...['-f', 'lavfi', '-i', 'testsrc=size=192x108:rate=30:duration=2'],
      ...['-f', 'lavfi', '-i', 'sine=frequency=440:duration=2'],
      ...['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', master],
    ]);
    const preview = join(dir, 'preview.mp4');

    await createVideoScaler(FFMPEG)(
      master,
      preview,
      { width: 128, height: 72 },
      new AbortController().signal,
    );

    const { stdout } = await run(FFPROBE, [
      ...['-v', 'error', '-show_entries', 'stream=codec_type,width,height', '-of', 'json', preview],
    ]);
    const streams = (JSON.parse(stdout) as { streams: Record<string, unknown>[] }).streams;
    expect(streams).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ codec_type: 'video', width: 128, height: 72 }),
        expect.objectContaining({ codec_type: 'audio' }),
      ]),
    );
    expect(await createFfprobe(FFPROBE)(preview)).toBeCloseTo(2, 0);
  });
});
