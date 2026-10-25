import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import pino from 'pino';
import { describe, expect, test } from 'vitest';
import { createTimingHandler } from '../../src/handlers/timing.js';
import { createVoiceBuilder } from '../../src/media/voice.js';
import { createWhisper } from '../../src/media/whisper.js';
import { writeCheckpoint } from '../../src/storage/checkpoint.js';

// The timing step with real ffmpeg and whisper.cpp on Vietnamese speech from macOS `say` (voice
// Linh): free, about a minute. Opt in by pointing at the model:
//   WHISPER_MODEL=/path/ggml-large-v3-turbo.bin npx vitest run test/integration/timing.test.ts

const execFileAsync = promisify(execFile);
const MODEL = process.env.WHISPER_MODEL;
const SCRIPT_JOB = '0c1d2e3f-4a5b-4c6d-8e7f-001122334455';
const TTS_JOB = '0c1d2e3f-4a5b-4c6d-8e7f-001122334466';
const ACTS = [
  { text: '[punchy] Một hai ba. Bốn năm sáu.', shots: ['Một hai ba', 'Bốn năm sáu'] },
  { text: 'Bảy tám chín mười.', shots: ['Bảy tám'] },
];

describe.runIf(MODEL)('timing (real ffmpeg + whisper.cpp)', () => {
  test(
    'builds a timeline with every sentence cut in silence',
    async () => {
      const jobsDir = await mkdtemp(join(tmpdir(), 'jobs-'));
      const ttsDir = join(jobsDir, TTS_JOB);
      const scriptDir = join(jobsDir, SCRIPT_JOB);
      const workDir = join(jobsDir, 'timing');
      await Promise.all([ttsDir, scriptDir, workDir].map((dir) => mkdir(dir)));
      const files = ACTS.map((_, i) => `scene-0${i + 1}.aiff`);
      for (const [i, act] of ACTS.entries()) {
        const spoken = act.text.replace(/\[[^\]]*\]/g, '');
        await execFileAsync('say', ['-v', 'Linh', '-o', join(ttsDir, files[i]!), spoken]);
      }
      await writeCheckpoint(ttsDir, files, {
        scenes: files.map((file, i) => ({ index: i + 1, file, duration_seconds: 2 })),
      });
      const script = {
        acts: ACTS.map((act, a) => ({
          lines: [{ id: `L00${a + 1}`, text: act.text }],
          shots: act.shots.map((moc, s) => ({ id: `${a + 1}.${s + 1}`, moc })),
        })),
      };
      await writeFile(join(scriptDir, 'script.json'), JSON.stringify(script));
      await writeCheckpoint(scriptDir, ['script.json'], {});

      const handler = createTimingHandler({
        buildVoice: createVoiceBuilder(process.env.FFMPEG_BIN ?? 'ffmpeg'),
        transcribe: createWhisper({ bin: process.env.WHISPER_BIN ?? 'whisper-cli', model: MODEL! }),
        blockSeconds: 3600,
      });
      const result = await handler({
        jobId: 'timing',
        attemptNo: 1,
        input: { script_job_id: SCRIPT_JOB, tts_job_id: TTS_JOB, language: 'vi' },
        workDir,
        signal: new AbortController().signal,
        logger: pino({ level: 'silent' }),
        progress: async () => undefined,
      });

      expect(result.result).toMatchObject({ sentences: 3, shots: 3 });
      const { words_matched: matched, words_total: total } = result.result as {
        words_matched: number;
        words_total: number;
      };
      expect(matched / total).toBeGreaterThanOrEqual(0.7);
      const timing = JSON.parse(await readFile(join(workDir, 'timing.json'), 'utf8'));
      expect(timing.shots.map((s: { firstLine: string }) => s.firstLine)).toEqual([
        'S001',
        'S002',
        'S003',
      ]);
    },
    5 * 60 * 1000,
  );
});
