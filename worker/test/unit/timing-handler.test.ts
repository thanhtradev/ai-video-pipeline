import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pino from 'pino';
import { beforeEach, describe, expect, test } from 'vitest';
import { createTimingHandler, type TimingHandlerDeps } from '../../src/handlers/timing.js';
import type { LoudnessNormalizer } from '../../src/media/loudness.js';
import { concatFilter, readPcm16, type VoiceBuilder } from '../../src/media/voice.js';
import { whisperArgs, type Transcriber } from '../../src/media/whisper.js';
import { PermanentJobError, ProviderBlockedError, type HandlerContext } from '../../src/runner.js';
import { writeCheckpoint } from '../../src/storage/checkpoint.js';
import { toneSamples, wavBytes, writeToneWav } from '../helpers/wav.js';

const SCRIPT_JOB = '11111111-1111-4111-8111-111111111111';
const TTS_JOB = '22222222-2222-4222-8222-222222222222';
const TIMING_JOB = '33333333-3333-4333-8333-333333333333';
const INPUT = { script_job_id: SCRIPT_JOB, tts_job_id: TTS_JOB, language: 'vi' };

// Two acts; the voice has a clear pause between every sentence.
const SCRIPT = {
  title: 'x',
  acts: [
    {
      lines: [{ id: 'L001', text: '[punchy] Một hai. Ba bốn.' }],
      shots: [
        { id: '1.1', moc: 'Một hai', description: '-', sfx: [] },
        { id: '1.2', moc: 'Ba bốn', description: '-', sfx: [], hold_seconds: 0.5 },
      ],
    },
    {
      lines: [{ id: 'L002', text: 'Năm sáu.' }],
      shots: [{ id: '2.1', moc: 'Năm sáu', description: '-', sfx: [] }],
    },
  ],
};
const VOICED: [number, number][] = [
  [0.5, 1.5],
  [2.1, 3.0],
  [3.8, 4.6],
];
const HEARD: [string, number, number][] = [
  [' Một', 0.5, 0.9],
  [' hai.', 0.9, 2.1],
  [' Ba', 2.1, 2.5],
  [' bốn.', 2.5, 3.8],
  [' Năm', 3.8, 4.2],
  [' sáu.', 4.2, 4.6],
];

let jobsDir: string;
let workDir: string;
let voiceCalls: string[][];
let loudnessCalls: [string, string][];

function whisperJson(words: [string, number, number][]): Uint8Array {
  const transcription = words.map(([text, from, to]) => ({
    offsets: { from: from * 1000, to: to * 1000 },
    text,
  }));
  return new TextEncoder().encode(JSON.stringify({ transcription }));
}

const buildVoice: VoiceBuilder = async (clips, outputs) => {
  voiceCalls.push([...clips]);
  await writeFile(outputs.voice, 'voice');
  await writeToneWav(outputs.analysis, 5, VOICED);
};

const transcribe =
  (words = HEARD): Transcriber =>
  async (_wav, prefix) => {
    const bytes = whisperJson(words);
    await writeFile(`${prefix}.json`, bytes);
    return bytes;
  };

const LOUDNESS = { input_lufs: -20, input_true_peak: -3, output_lufs: -14, output_true_peak: -1.6 };
const loudness: LoudnessNormalizer = async (input, output) => {
  loudnessCalls.push([input, output]);
  await writeFile(output, 'm4a');
  return LOUDNESS;
};

function deps(overrides: Partial<TimingHandlerDeps> = {}): TimingHandlerDeps {
  return { buildVoice, transcribe: transcribe(), loudness, blockSeconds: 3600, ...overrides };
}

function context(input: unknown = INPUT): HandlerContext {
  return {
    jobId: TIMING_JOB,
    attemptNo: 1,
    input,
    workDir,
    signal: new AbortController().signal,
    logger: pino({ level: 'silent' }),
    progress: async () => undefined,
  };
}

async function writeJobs(script: object = SCRIPT, clips = 2): Promise<void> {
  const scriptDir = join(jobsDir, SCRIPT_JOB);
  await mkdir(scriptDir);
  await writeFile(join(scriptDir, 'script.json'), JSON.stringify(script));
  await writeCheckpoint(scriptDir, ['script.json'], { title: 'x' });
  const ttsDir = join(jobsDir, TTS_JOB);
  await mkdir(ttsDir);
  const files = Array.from({ length: clips }, (_, i) => `scene-0${i + 1}.mp3`);
  for (const file of files) await writeFile(join(ttsDir, file), file);
  await writeCheckpoint(ttsDir, files, {
    scenes: files.map((file, i) => ({ index: i + 1, file, duration_seconds: 2 })),
  });
}

beforeEach(async () => {
  jobsDir = await mkdtemp(join(tmpdir(), 'jobs-'));
  workDir = join(jobsDir, TIMING_JOB);
  await mkdir(workDir);
  voiceCalls = [];
  loudnessCalls = [];
});

describe('timing handler', () => {
  test('joins the act clips in order and writes the timeline for the kit', async () => {
    await writeJobs();

    const result = await createTimingHandler(deps())(context());

    expect(voiceCalls).toEqual([
      [join(jobsDir, TTS_JOB, 'scene-01.mp3'), join(jobsDir, TTS_JOB, 'scene-02.mp3')],
    ]);
    expect(result.outputs).toEqual([
      'voice.wav',
      'timing.json',
      'captions.json',
      'timeline.md',
      'transcript.json',
      'voice.m4a',
    ]);
    const timing = JSON.parse(await readFile(join(workDir, 'timing.json'), 'utf8'));
    expect(timing.voice).toBe('voice.wav');
    expect(timing.lines.map((l: { id: string; line: string }) => [l.id, l.line])).toEqual([
      ['S001', 'L001'],
      ['S002', 'L001'],
      ['S003', 'L002'],
    ]);
    expect(timing.shots.map((s: { id: string; firstLine: string }) => [s.id, s.firstLine])).toEqual(
      [
        ['1.1', 'S001'],
        ['1.2', 'S002'],
        ['2.1', 'S003'],
      ],
    );
    expect(timing.lines[1].hold).toBe(0.5);
    expect(timing.acts.map((a: { act: number }) => a.act)).toEqual([1, 2]);
    const captions = JSON.parse(await readFile(join(workDir, 'captions.json'), 'utf8'));
    expect(captions.captions).toHaveLength(6);
    expect(await readFile(join(workDir, 'timeline.md'), 'utf8')).toContain('| 1.2 | S002 |');
    expect(result.result).toMatchObject({
      sentences: 3,
      shots: 3,
      words_matched: 6,
      words_total: 6,
      joins: 0,
    });
  });

  test('encodes the voice for the A1b request at the delivery loudness, with a media token', async () => {
    await writeJobs();

    const result = await createTimingHandler(deps())(context());

    expect(loudnessCalls).toEqual([[join(workDir, 'voice.wav'), join(workDir, 'voice.m4a')]]);
    expect(result.result).toMatchObject({ voice_loudness: LOUDNESS });
    expect((result.result as { media_token: string }).media_token).toMatch(/^[0-9a-f]{32}$/);
  });

  test('waits (blocked) while no whisper model is configured', async () => {
    await writeJobs();
    await expect(createTimingHandler(deps({ transcribe: null }))(context())).rejects.toBeInstanceOf(
      ProviderBlockedError,
    );
  });

  test('fails permanently on invalid input, a changed script or a missing clip', async () => {
    const handler = createTimingHandler(deps());
    await expect(handler(context({ ...INPUT, language: 'en' }))).rejects.toBeInstanceOf(
      PermanentJobError,
    );
    await expect(handler(context())).rejects.toThrow(/script job .* is missing or changed/);

    await writeJobs(SCRIPT, 1);
    await expect(handler(context())).rejects.toThrow(/1 clips for 2 acts/);
  });

  test('fails permanently when a MỐC is never spoken', async () => {
    const edited = structuredClone(SCRIPT);
    edited.acts[1]!.shots[0]!.moc = 'Bảy tám';
    await writeJobs(edited);
    await expect(createTimingHandler(deps())(context())).rejects.toThrow(
      /timeline: shot 2.1: MỐC "Bảy tám" not found/,
    );
  });
});

describe('voice and whisper helpers', () => {
  test('concat pads every act clip but the last with silence', () => {
    expect(concatFilter(2)).toBe(
      '[0:a]aresample=48000,aformat=sample_fmts=s16:channel_layouts=mono,apad=pad_dur=0.6[a0];' +
        '[1:a]aresample=48000,aformat=sample_fmts=s16:channel_layouts=mono[a1];' +
        '[a0][a1]concat=n=2:v=0:a=1[voice]',
    );
  });

  test('reads 16-bit mono WAV samples past extra chunks', async () => {
    const samples = toneSamples(0.01, 16_000, [[0, 0.01]]);
    const path = join(jobsDir, 'x.wav');
    await writeFile(path, wavBytes(samples, 16_000, true));
    const pcm = await readPcm16(path);
    expect(pcm.sampleRate).toBe(16_000);
    expect(Array.from(pcm.samples)).toEqual(Array.from(samples));

    await writeFile(path, 'not a wav file at all');
    await expect(readPcm16(path)).rejects.toThrow(/not a WAV/);
  });

  test('runs whisper like the reference episodes: one word per segment, JSON', () => {
    expect(whisperArgs({ bin: 'whisper-cli', model: '/m.bin' }, '/v.wav', '/t', 'vi')).toEqual([
      '-m',
      '/m.bin',
      '-f',
      '/v.wav',
      '-l',
      'vi',
      '-ojf',
      '-of',
      '/t',
      '-ml',
      '1',
      '-sow',
      '-t',
      '8',
      '-np',
    ]);
    expect(
      whisperArgs({ bin: 'whisper-cli', model: '/m.bin', threads: 6 }, '/v.wav', '/t', 'vi'),
    ).toContain('6');
  });
});
