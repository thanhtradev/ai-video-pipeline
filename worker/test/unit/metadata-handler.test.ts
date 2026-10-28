import { mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pino from 'pino';
import { beforeEach, describe, expect, test } from 'vitest';
import type { ClaudeRequest } from '../../src/claude/claude-cli.js';
import {
  createMetadataHandler,
  thumbnailFrame,
  type MetadataHandlerDeps,
} from '../../src/handlers/metadata.js';
import { NO_RULES } from '../../src/rules/channel-rules.js';
import { PermanentJobError, type HandlerContext } from '../../src/runner.js';
import { writeCheckpoint } from '../../src/storage/checkpoint.js';

// Metadata (D-062): Claude writes the Vietnamese title/description/tags and picks the thumbnail
// shot; the worker checks them and grabs the frame from final.mp4.

const SCRIPT_JOB = '11111111-1111-4111-8111-111111111111';
const TIMING_JOB = '22222222-2222-4222-8222-222222222222';
const RENDER_JOB = '33333333-3333-4333-8333-333333333333';
const PREVIOUS_JOB = '44444444-4444-4444-8444-444444444444';
const META_JOB = '55555555-5555-4555-8555-555555555555';
const INPUT = {
  script_job_id: SCRIPT_JOB,
  timing_job_id: TIMING_JOB,
  render_job_id: RENDER_JOB,
  round: 1,
};
const GOOD = {
  title: 'Nếu bạn nghe được suy nghĩ của mèo?',
  description:
    'Con mèo nhà bạn đang nghĩ gì khi nhìn bạn chằm chằm? Một ngày bạn bỗng nghe được tất cả. Bạn muốn nghe suy nghĩ của ai?',
  tags: ['mèo', 'nếu bạn', 'hoạt hình', 'suy nghĩ của mèo', 'chuyện kỳ lạ'],
  hashtags: ['#nếubạn', '#mèo'],
  thumbnail_shot: '1.2',
};

let jobsDir: string;
let workDir: string;
let requests: ClaudeRequest[];
let frames: { video: string; seconds: number; output: string }[];

async function writeJob(
  id: string,
  files: Record<string, string>,
  result: Record<string, unknown> = {},
) {
  const dir = join(jobsDir, id);
  await mkdir(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) await writeFile(join(dir, name), content);
  await writeCheckpoint(dir, Object.keys(files), result);
}

beforeEach(async () => {
  jobsDir = await realpath(await mkdtemp(join(tmpdir(), 'jobs-')));
  workDir = join(jobsDir, META_JOB);
  await mkdir(workDir);
  requests = [];
  frames = [];
  await writeJob(SCRIPT_JOB, {
    'script.json': JSON.stringify({
      title: 'Mèo nghĩ gì?',
      logline: 'Bạn nghe được suy nghĩ của mèo.',
      acts: [
        {
          title: 'Mở đầu',
          lines: [{ id: 'L001', text: 'Nếu bạn nghe được suy nghĩ của mèo?' }],
          shots: [
            { id: '1.1', description: 'BẠN ngồi trên giường.' },
            { id: '1.2', description: 'Cận mặt mèo, mắt to.' },
          ],
        },
      ],
    }),
  });
  await writeJob(TIMING_JOB, {
    'timing.json': JSON.stringify({
      fps: 30,
      shots: [
        { id: '1.1', from: 0, to: 60 },
        { id: '1.2', from: 60, to: 160 },
      ],
      // Shot 1.2 speaks until frame 100: the thumbnail is taken in the pause after it.
      lines: [
        { from: 0, to: 58 },
        { from: 60, to: 100 },
      ],
    }),
  });
  await writeJob(RENDER_JOB, { 'final.mp4': 'video' });
});

function deps(
  output: unknown = GOOD,
  overrides: Partial<MetadataHandlerDeps> = {},
): MetadataHandlerDeps {
  return {
    claude: async (request) => {
      requests.push(request);
      return { output, durationMs: 1000, numTurns: 1, usage: null, text: '' } as never;
    },
    grabFrame: async (video, seconds, output) => {
      frames.push({ video, seconds, output });
      await writeFile(output, 'jpg');
    },
    rules: async () => ({ ...NO_RULES, video: [{ id: 1, text: 'Không giật tít.' }] }),
    ...overrides,
  };
}

function context(input: unknown = INPUT): HandlerContext {
  return {
    jobId: META_JOB,
    attemptNo: 1,
    input,
    workDir,
    signal: new AbortController().signal,
    logger: pino({ level: 'silent' }),
    progress: async () => undefined,
  };
}

describe('metadata handler', () => {
  test('writes the metadata and grabs the chosen shot as the thumbnail', async () => {
    const result = await createMetadataHandler(deps())(context());

    expect(requests[0]!.prompt).toMatch(/Write the YouTube metadata/);
    expect(requests[0]!.prompt).toContain('- shot 1.2: Cận mặt mèo, mắt to.');
    expect(requests[0]!.prompt).toContain('- Không giật tít.');
    // Shot 1.1 is spoken all through; 1.2 has a pause.
    expect(requests[0]!.prompt).toContain('the\n  shots with a moment without captions are 1.2:');
    expect(frames).toEqual([
      {
        video: join(jobsDir, RENDER_JOB, 'final.mp4'),
        seconds: 4.4,
        output: join(workDir, 'thumbnail.jpg'),
      },
    ]);
    expect(result.outputs).toEqual(['metadata.json', 'thumbnail.jpg']);
    expect(result.result).toMatchObject({
      metadata: GOOD,
      thumbnail: { shot: '1.2', seconds: 4.4 },
    });
    expect(result.result.media_token).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.parse(await readFile(join(workDir, 'metadata.json'), 'utf8'))).toEqual(GOOD);
  });

  test('a rewrite gets the previous metadata and the notes', async () => {
    await writeJob(PREVIOUS_JOB, { 'metadata.json': '{}' }, { metadata: GOOD });
    const input = {
      ...INPUT,
      round: 2,
      revision: { previous_job_id: PREVIOUS_JOB, feedback: 'Tiêu đề ngắn hơn.' },
    };
    await createMetadataHandler(deps())(context(input));

    expect(requests[0]!.prompt).toContain("The owner's notes (follow them): Tiêu đề ngắn hơn.");
    expect(requests[0]!.prompt).toContain('"title": "Nếu bạn nghe được suy nghĩ của mèo?"');
  });

  test('describes the selected channel in the system prompt', async () => {
    await createMetadataHandler(deps())(context());
    expect(requests[0]!.systemPrompt).toContain('Nếu bạn…?');
    await createMetadataHandler(deps())(
      context({ ...INPUT, kit: 'science', character_set: 'bip' }),
    );
    expect(requests[1]!.systemPrompt).toContain('BÍP');
    expect(requests[1]!.systemPrompt).not.toContain('Nếu bạn…?');
  });

  test('retries (plain error) on an unknown shot, < in the title or a bad schema', async () => {
    for (const bad of [
      { ...GOOD, thumbnail_shot: '9.9' },
      { ...GOOD, title: 'Mèo <3 bạn nghe thấy' },
      { title: 'x' },
    ]) {
      const error = await createMetadataHandler(deps(bad))(context()).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(PermanentJobError);
    }
    expect(frames).toEqual([]);
  });

  test('fails permanently on invalid input or a changed render', async () => {
    const handler = createMetadataHandler(deps());
    await expect(handler(context({ round: 1 }))).rejects.toBeInstanceOf(PermanentJobError);
    await writeFile(join(jobsDir, RENDER_JOB, 'final.mp4'), 'changed');
    await expect(handler(context())).rejects.toThrow(/render_final job .* is missing or changed/);
  });

  test('takes the thumbnail where no caption is on screen', () => {
    // Shot 60–160; sentences 60–90 and 130–160: the pause is 94–126, its middle 110.
    expect(
      thumbnailFrame({ from: 60, to: 160 }, [
        { from: 60, to: 90 },
        { from: 130, to: 160 },
      ]),
    ).toBe(110);
    // Speech all through the shot: 60% in.
    expect(thumbnailFrame({ from: 60, to: 160 }, [{ from: 55, to: 165 }])).toBe(120);
    // No speech at all: the middle of the shot.
    expect(thumbnailFrame({ from: 0, to: 60 }, [])).toBe(30);
  });
});
