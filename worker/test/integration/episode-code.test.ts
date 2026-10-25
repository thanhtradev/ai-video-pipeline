import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import pino from 'pino';
import { describe, expect, test } from 'vitest';
import { createAgentCli } from '../../src/claude/agent-cli.js';
import { claudeChildEnv } from '../../src/claude/claude-cli.js';
import { createGateRunner } from '../../src/episode/gates.js';
import { createEpisodeCodeHandler } from '../../src/handlers/episode-code.js';
import { createTimingHandler } from '../../src/handlers/timing.js';
import { createVoiceBuilder } from '../../src/media/voice.js';
import { createWhisper } from '../../src/media/whisper.js';
import { writeCheckpoint } from '../../src/storage/checkpoint.js';

// The whole episode-code step on a 3-shot mini episode: macOS `say` narration → real timing job
// (ffmpeg + whisper.cpp) → real Claude Code agent in its sandbox → real gates under the render
// profile. Uses the Claude subscription (a small model by default) and takes several minutes.
//   RUN_AGENT_TESTS=1 WHISPER_MODEL=/path/ggml-large-v3-turbo.bin \
//     [AGENT_TEST_MODEL=claude-haiku-5-5] npx vitest run test/integration/episode-code.test.ts

const execFileAsync = promisify(execFile);
const MODEL = process.env.WHISPER_MODEL;
const PROFILE = fileURLToPath(new URL('../../../ops/claude/episode-render.sb', import.meta.url));
const SCRIPT_JOB = '0d1e2f3a-4b5c-4d6e-8f70-001122334401';
const TTS_JOB = '0d1e2f3a-4b5c-4d6e-8f70-001122334402';
const TIMING_JOB = '0d1e2f3a-4b5c-4d6e-8f70-001122334403';
const CODE_JOB = '0d1e2f3a-4b5c-4d6e-8f70-001122334404';
const ACTS = [
  {
    title: 'HOOK',
    lines: ['Nếu bạn nghe được suy nghĩ của con mèo?', 'Con mèo nhìn bạn.'],
    shots: [
      [
        '1.1',
        'Nếu bạn nghe được',
        'Wide: BẠN (hoodie cam) ngồi trong phòng khách, con mèo xám trên ghế.',
      ],
      ['1.2', 'Con mèo nhìn bạn', 'Close-up con mèo, mắt nheo "> <". TEXT "MÈO ĐANG NGHĨ GÌ?"'],
    ],
  },
  {
    title: 'KẾT',
    lines: ['Và nó chỉ nghĩ về cá.'],
    shots: [['2.1', 'Và nó chỉ nghĩ', 'Medium: bong bóng suy nghĩ hình con cá trên đầu mèo.']],
  },
];

const ctx = (jobId: string, input: unknown, workDir: string) => ({
  jobId,
  attemptNo: 1,
  input,
  workDir,
  signal: new AbortController().signal,
  logger: pino({ level: 'silent' }),
});

describe.runIf(process.env.RUN_AGENT_TESTS === '1' && MODEL)('episode_code (real agent)', () => {
  test(
    'writes a mini episode that passes every gate',
    async () => {
      const jobs = await realpath(await mkdtemp(join(tmpdir(), 'episode-')));
      const dir = (id: string) => join(jobs, id);
      await Promise.all([SCRIPT_JOB, TTS_JOB, TIMING_JOB, CODE_JOB].map((id) => mkdir(dir(id))));

      const script = {
        acts: ACTS.map((act, a) => ({
          title: act.title,
          lines: act.lines.map((text, l) => ({ id: `L00${a * 2 + l + 1}`, text })),
          shots: act.shots.map(([id, moc, description]) => ({ id, moc, description, sfx: [] })),
        })),
      };
      const markdown = ACTS.map(
        (act, a) =>
          `## ${a + 1}. ${act.title}\n\n${act.lines.join('\n')}\n\n` +
          act.shots.map(([id, moc, d]) => `- ${id} MỐC "${moc}": ${d}`).join('\n'),
      ).join('\n\n');
      await writeFile(join(dir(SCRIPT_JOB), 'script.json'), JSON.stringify(script));
      await writeFile(join(dir(SCRIPT_JOB), 'script.md'), `# Mèo nghĩ gì?\n\n${markdown}\n`);
      await writeCheckpoint(dir(SCRIPT_JOB), ['script.json', 'script.md'], {});
      const clips = ACTS.map((_, i) => `scene-0${i + 1}.aiff`);
      for (const [i, act] of ACTS.entries()) {
        await execFileAsync('say', [
          '-v',
          'Linh',
          '-o',
          join(dir(TTS_JOB), clips[i]!),
          act.lines.join(' '),
        ]);
      }
      await writeCheckpoint(dir(TTS_JOB), clips, {
        scenes: clips.map((file, i) => ({ index: i + 1, file, duration_seconds: 2 })),
      });

      const timing = createTimingHandler({
        buildVoice: createVoiceBuilder(process.env.FFMPEG_BIN ?? 'ffmpeg'),
        transcribe: createWhisper({ bin: process.env.WHISPER_BIN ?? 'whisper-cli', model: MODEL! }),
        blockSeconds: 3600,
      });
      const timed = await timing(
        ctx(
          TIMING_JOB,
          { script_job_id: SCRIPT_JOB, tts_job_id: TTS_JOB, language: 'vi' },
          dir(TIMING_JOB),
        ),
      );
      await writeCheckpoint(dir(TIMING_JOB), timed.outputs, timed.result);

      const code = createEpisodeCodeHandler({
        agent: createAgentCli({
          bin: process.env.CLAUDE_BIN ?? 'claude',
          model: process.env.AGENT_TEST_MODEL ?? 'claude-haiku-5-5',
          blockSeconds: 3600,
          env: claudeChildEnv(process.env),
        }),
        gates: createGateRunner({ profile: PROFILE }),
        secrets: [],
        limitMs: 30 * 60 * 1000,
      });
      const result = await code(
        ctx(CODE_JOB, { script_job_id: SCRIPT_JOB, timing_job_id: TIMING_JOB }, dir(CODE_JOB)),
      );

      console.log(`episode workspace: ${join(dir(CODE_JOB), 'ws')}`, result.result);
      const ws = join(dir(CODE_JOB), 'ws');
      expect(await readFile(join(ws, 'src/episode/Episode.tsx'), 'utf8')).toMatch(/export/);
      expect(existsSync(join(ws, 'board/page-01.jpg'))).toBe(true);
      expect(JSON.parse(await readFile(join(ws, 'gates.json'), 'utf8')).ok).toBe(true);
    },
    40 * 60 * 1000,
  );
});
