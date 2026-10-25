import { createHash } from 'node:crypto';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pino from 'pino';
import { beforeEach, describe, expect, test } from 'vitest';
import type { ClaudeRequest, ClaudeRunner } from '../../src/claude/claude-cli.js';
import { createScriptHandler } from '../../src/handlers/script.js';
import { PermanentJobError, type HandlerContext } from '../../src/runner.js';

const BRIEF = { topic: 'Vì sao bầu trời có màu xanh?', duration_seconds: 30, tone: 'vui vẻ' };

const SCRIPT = {
  title: 'Bầu trời xanh',
  hook: 'Bạn có biết vì sao bầu trời màu xanh?',
  music_style: 'curious',
  scenes: [
    {
      narration: 'Ánh sáng mặt trời có nhiều màu.',
      on_screen_text: 'Ánh sáng nhiều màu',
      duration_seconds: 8,
      emphasis: ['nhiều màu'],
    },
    {
      narration: 'Màu xanh bị tán xạ mạnh nhất.',
      on_screen_text: 'Tán xạ Rayleigh',
      duration_seconds: 10,
      emphasis: [],
    },
    {
      narration: 'Vì vậy bầu trời có màu xanh.',
      on_screen_text: 'Bầu trời xanh',
      duration_seconds: 8,
      emphasis: ['xanh'],
    },
  ],
};

let workDir: string;
let requests: ClaudeRequest[];

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'script-'));
  requests = [];
});

function stub(output: unknown): ClaudeRunner {
  return async (request) => {
    requests.push(request);
    return { output, durationMs: 900, numTurns: 1, usage: { output_tokens: 10 } };
  };
}

function context(input: unknown): HandlerContext {
  return {
    jobId: 'job-1',
    attemptNo: 1,
    input,
    workDir,
    signal: new AbortController().signal,
    logger: pino({ level: 'silent' }),
    progress: async () => undefined,
  };
}

describe('script handler', () => {
  test('writes the validated script and returns a summary for the A1 message', async () => {
    const handler = createScriptHandler({ claude: stub(SCRIPT) });

    const result = await handler(context({ brief: BRIEF, language: 'vi' }));

    expect(result.outputs).toEqual(['script.json', 'script.md']);
    const saved = await readFile(join(workDir, 'script.json'), 'utf8');
    expect(JSON.parse(saved)).toEqual(SCRIPT);
    expect(result.result).toMatchObject({
      title: 'Bầu trời xanh',
      scene_count: 3,
      total_seconds: 26,
      narration_chars: SCRIPT.scenes.reduce((n, s) => n + s.narration.length, 0),
      scenes: SCRIPT.scenes,
      claude: { duration_ms: 900, num_turns: 1, usage: { output_tokens: 10 } },
    });
    expect(String(result.result.preview)).toContain('Tán xạ Rayleigh');
    expect(createHash('sha256').update(saved).digest('hex')).toMatch(/^[0-9a-f]{64}$/);
  });

  test('writes a readable Markdown copy in Vietnamese', async () => {
    const handler = createScriptHandler({ claude: stub(SCRIPT) });
    await handler(context({ brief: BRIEF, language: 'vi' }));

    const markdown = await readFile(join(workDir, 'script.md'), 'utf8');
    expect(markdown).toContain('# Bầu trời xanh');
    expect(markdown).toContain('Màu xanh bị tán xạ mạnh nhất.');
  });

  test('asks Claude in English with the brief as quoted data and the target duration', async () => {
    const handler = createScriptHandler({ claude: stub(SCRIPT) });
    await handler(context({ brief: BRIEF, language: 'vi' }));

    const request = requests[0]!;
    expect(request.cwd).toBe(workDir);
    expect(request.systemPrompt).toMatch(/Vietnamese/);
    expect(request.prompt).toContain('Vì sao bầu trời có màu xanh?');
    expect(request.prompt).toMatch(/at most 30 seconds/);
    expect(request.prompt).toMatch(/music_style .*uplifting, calm, curious/);
    expect(request.jsonSchema).toMatchObject({
      // The CLI rejects draft 2020-12 schemas (zod's default target).
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      required: ['title', 'hook', 'music_style', 'scenes'],
    });
  });

  test('rejects an invalid input permanently', async () => {
    const handler = createScriptHandler({ claude: stub(SCRIPT) });
    await expect(handler(context({ brief: { topic: '' } }))).rejects.toBeInstanceOf(
      PermanentJobError,
    );
  });

  test('retries (plain error) when the reply does not match the schema', async () => {
    const handler = createScriptHandler({ claude: stub({ title: 'x' }) });

    const error = await handler(context({ brief: BRIEF, language: 'vi' })).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(PermanentJobError);
    expect((error as Error).message).toMatch(/script does not match the schema/);
  });

  test('retries when the scenes exceed the requested duration', async () => {
    const long = { ...SCRIPT, scenes: SCRIPT.scenes.map((s) => ({ ...s, duration_seconds: 15 })) };
    const handler = createScriptHandler({ claude: stub(long) });

    await expect(handler(context({ brief: BRIEF, language: 'vi' }))).rejects.toThrow(
      /45 s exceeds the 30 s brief/,
    );
  });
});
