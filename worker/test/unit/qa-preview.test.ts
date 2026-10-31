import { mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pino from 'pino';
import { beforeEach, describe, expect, test } from 'vitest';
import {
  overallLevel,
  previewChecks,
  srtProblems,
  type PreviewFacts,
} from '../../src/episode/qa.js';
import { createQaPreviewHandler, type QaPreviewDeps } from '../../src/handlers/qa-preview.js';
import { parseGaps, parseProbe, type MediaInfo } from '../../src/media/inspect.js';
import { PermanentJobError, type HandlerContext } from '../../src/runner.js';
import { writeCheckpoint } from '../../src/storage/checkpoint.js';

const RENDER_JOB = '11111111-1111-4111-8111-111111111111';
const TIMING_JOB = '22222222-2222-4222-8222-222222222222';
const QA_JOB = '33333333-3333-4333-8333-333333333333';
const INPUT = { render_job_id: RENDER_JOB, timing_job_id: TIMING_JOB };
const SRT =
  '1\n00:00:00,100 --> 00:00:01,733\nNếu bạn nghe được suy nghĩ của mèo?\n\n2\n00:00:01,933 --> 00:00:03,200\nKhông phải tiếng meo meo.\n';

const INFO: MediaInfo = {
  formatName: 'mov,mp4,m4a,3gp,3g2,mj2',
  durationSeconds: 178.6,
  video: { codec: 'h264', width: 1280, height: 720, fps: 30 },
  audio: { codec: 'aac' },
};
const FACTS: PreviewFacts = {
  info: INFO,
  gaps: { black: [], silence: [] },
  expected: { width: 1280, height: 720, fps: 30, seconds: 5357 / 30 },
  loudness: { output_lufs: -14.2, output_true_peak: -1.31 },
  srt: SRT,
};

describe('preview checks', () => {
  test('a good preview passes every check', () => {
    const checks = previewChecks(FACTS);
    expect(checks.map((c) => [c.name, c.level])).toEqual([
      ['format', 'PASS'],
      ['size', 'PASS'],
      ['duration', 'PASS'],
      ['loudness', 'PASS'],
      ['subtitles', 'PASS'],
      ['black frames', 'PASS'],
      ['silence', 'PASS'],
    ]);
    expect(overallLevel(checks)).toBe('PASS');
  });

  test('black and silent stretches only warn', () => {
    const checks = previewChecks({
      ...FACTS,
      gaps: { black: [{ start: 42, end: 43.2 }], silence: [{ start: 170, end: NaN }] },
    });
    expect(checks.find((c) => c.name === 'black frames')).toEqual({
      name: 'black frames',
      level: 'WARN',
      detail: '0:42.0–0:43.2',
    });
    expect(checks.find((c) => c.name === 'silence')!.detail).toBe('2:50.0–2:58.6');
    expect(overallLevel(checks)).toBe('WARN');
  });

  test.each([
    ['format', { info: { ...INFO, audio: null } }],
    ['size', { info: { ...INFO, video: { ...INFO.video!, width: 1920 } } }],
    ['duration', { info: { ...INFO, durationSeconds: 170 } }],
    ['loudness', { loudness: { output_lufs: -18, output_true_peak: -1.3 } }],
    ['loudness', { loudness: { output_lufs: -14, output_true_peak: -0.2 } }],
    ['subtitles', { srt: '' }],
  ])('%s fails', (name, change) => {
    const checks = previewChecks({ ...FACTS, ...change });
    expect(checks.find((c) => c.name === name)!.level).toBe('FAIL');
    expect(overallLevel(checks)).toBe('FAIL');
  });

  test('SRT problems name the cue', () => {
    const overlapping = SRT.replace('00:00:01,933', '00:00:01,000');
    expect(srtProblems(overlapping, 10)).toEqual(['cue 2 overlaps the previous cue']);
    expect(srtProblems(SRT, 2)).toEqual(['cue 2 ends after the video']);
    expect(srtProblems('1\nnot a time\nx\n', 10)).toEqual(['cue 1 is malformed']);
  });
});

describe('ffprobe and ffmpeg output', () => {
  test('reads streams, size and frame rate', () => {
    const json = JSON.stringify({
      streams: [
        {
          codec_type: 'video',
          codec_name: 'h264',
          width: 1280,
          height: 720,
          avg_frame_rate: '30/1',
        },
        { codec_type: 'audio', codec_name: 'aac', avg_frame_rate: '0/0' },
      ],
      format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', duration: '178.600000' },
    });
    expect(parseProbe(json)).toEqual(INFO);
  });

  test('reads black and silent stretches, also one running to the end', () => {
    const stderr = [
      '[blackdetect @ 0x1] black_start:0 black_end:1.5 black_duration:1.5',
      '[silencedetect @ 0x2] silence_start: 12.3',
      '[silencedetect @ 0x2] silence_end: 15.6 | silence_duration: 3.3',
      '[silencedetect @ 0x2] silence_start: 175.1',
    ].join('\n');
    const gaps = parseGaps(stderr);
    expect(gaps.black).toEqual([{ start: 0, end: 1.5 }]);
    expect(gaps.silence[0]).toEqual({ start: 12.3, end: 15.6 });
    expect(gaps.silence[1]!.start).toBe(175.1);
    expect(gaps.silence[1]!.end).toBeNaN();
  });
});

let jobsDir: string;
let workDir: string;

beforeEach(async () => {
  jobsDir = await realpath(await mkdtemp(join(tmpdir(), 'jobs-')));
  workDir = join(jobsDir, QA_JOB);
  await mkdir(workDir);
  const renderDir = join(jobsDir, RENDER_JOB);
  await mkdir(renderDir);
  await writeFile(join(renderDir, 'preview.mp4'), 'video');
  await writeFile(join(renderDir, 'vi.srt'), SRT);
  await writeCheckpoint(renderDir, ['preview.mp4', 'vi.srt'], {
    loudness: FACTS.loudness,
    width: 1280,
    height: 720,
  });
  const timingDir = join(jobsDir, TIMING_JOB);
  await mkdir(timingDir);
  await writeFile(join(timingDir, 'timing.json'), JSON.stringify({ totalFrames: 5357 }));
  await writeCheckpoint(timingDir, ['timing.json'], {});
});

function context(input: unknown = INPUT): HandlerContext {
  return {
    jobId: QA_JOB,
    attemptNo: 1,
    input,
    workDir,
    signal: new AbortController().signal,
    logger: pino({ level: 'silent' }),
    progress: async () => undefined,
  };
}

const deps = (info = INFO): QaPreviewDeps => ({
  inspect: async (path) => {
    expect(path).toBe(join(jobsDir, RENDER_JOB, 'preview.mp4'));
    return info;
  },
  detectGaps: async () => ({ black: [{ start: 42, end: 43.2 }], silence: [] }),
});

describe('qa_preview handler', () => {
  test('reports the checks and a media token for A2', async () => {
    const result = await createQaPreviewHandler(deps())(context());

    expect(result.outputs).toEqual(['qa-report.json']);
    expect(result.result).toMatchObject({
      level: 'WARN',
      render_job_id: RENDER_JOB,
      duration_seconds: 178.6,
      loudness: { output_lufs: -14.2 },
    });
    expect(result.result.media_token).toMatch(/^[0-9a-f]{32}$/);
    const report = JSON.parse(await readFile(join(workDir, 'qa-report.json'), 'utf8'));
    expect(report.level).toBe('WARN');
  });

  test('fails permanently on a FAIL check, keeping the report', async () => {
    const error = await createQaPreviewHandler(deps({ ...INFO, durationSeconds: 120 }))(
      context(),
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(PermanentJobError);
    expect((error as Error).message).toMatch(
      /^QA failed: duration \(120\.0 s \(timeline 178\.6 s\)\)/,
    );
    expect(JSON.parse(await readFile(join(workDir, 'qa-report.json'), 'utf8')).level).toBe('FAIL');
  });

  test('checks the 1080p final.mp4 for qa_final (D-062)', async () => {
    const renderDir = join(jobsDir, RENDER_JOB);
    await writeFile(join(renderDir, 'final.mp4'), 'final');
    await writeCheckpoint(renderDir, ['final.mp4', 'vi.srt'], {
      loudness: FACTS.loudness,
      width: 1920,
      height: 1080,
    });
    const inspected: string[] = [];
    const final = { ...INFO, video: { ...INFO.video!, width: 1920, height: 1080 } };
    const result = await createQaPreviewHandler({
      inspect: async (path) => {
        inspected.push(path);
        return final;
      },
      detectGaps: async () => ({ black: [], silence: [] }),
    })(context({ ...INPUT, quality: 'final' }));

    expect(inspected).toEqual([join(renderDir, 'final.mp4')]);
    expect(result.result).toMatchObject({ level: 'PASS' });
  });

  test('expects the size the render reports, e.g. a 9:16 kit (D-080)', async () => {
    const renderDir = join(jobsDir, RENDER_JOB);
    await writeCheckpoint(renderDir, ['preview.mp4', 'vi.srt'], {
      loudness: FACTS.loudness,
      width: 720,
      height: 1280,
    });
    const portrait = { ...INFO, video: { ...INFO.video!, width: 720, height: 1280 } };
    const handler = createQaPreviewHandler({
      inspect: async () => portrait,
      detectGaps: async () => ({ black: [], silence: [] }),
    });

    expect((await handler(context())).result).toMatchObject({ level: 'PASS' });
  });

  test('rejects invalid input or a changed render', async () => {
    const handler = createQaPreviewHandler(deps());
    await expect(handler(context({ render_job_id: 'x' }))).rejects.toBeInstanceOf(
      PermanentJobError,
    );
    await writeFile(join(jobsDir, RENDER_JOB, 'preview.mp4'), 'changed');
    await expect(handler(context())).rejects.toThrow(/render_episode job .* is missing or changed/);
  });
});
