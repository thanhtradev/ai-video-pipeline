import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, test } from 'vitest';
import type { ClaudeRequest, ClaudeRunner } from '../../src/claude/claude-cli.js';
import type { ClaimedIdeaRequest } from '../../src/db/idea-store.js';
import { generateIdeas } from '../../src/ideas/generate-ideas.js';

const PAST = '6b0c8f8e-1111-4222-8333-444455556666';

const REQUEST: ClaimedIdeaRequest = {
  requestId: 'req-1',
  attemptNo: 1,
  kit: 'science',
  characterSet: 'chip-science',
  ideaCount: 3,
  history: {
    videos: [
      {
        video_id: PAST,
        title: 'Vì sao bầu trời màu xanh?',
        summary: 'Chíp tìm hiểu tán xạ ánh sáng.',
        status: 'COMPLETED',
        series: { id: PAST, title: 'Bầu trời', episode: 2 },
      },
    ],
    unused_ideas: ['Vì sao lá cây màu xanh?'],
  },
};

const IDEAS = {
  ideas: [
    {
      kind: 'series',
      topic: 'Vì sao hoàng hôn màu đỏ?',
      hook: 'Chíp ơi, tại sao chiều nào trời cũng đỏ?',
      angle: 'Tiếp nối tập tán xạ ánh sáng.',
      series_id: PAST,
    },
    {
      kind: 'related',
      topic: 'Vì sao biển màu xanh?',
      hook: 'Chíp ơi, biển có phải soi bóng bầu trời?',
      angle: 'Một góc khác của màu sắc tự nhiên.',
      related_video_id: PAST,
    },
    {
      kind: 'new',
      topic: 'Vì sao nam châm hút sắt?',
      hook: 'Chíp ơi, sao nam châm không hút nhôm?',
      angle: 'Chủ đề mới về từ trường.',
    },
  ],
};

let workDir: string;
let requests: ClaudeRequest[];

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'ideas-'));
  requests = [];
});

function stub(output: unknown): ClaudeRunner {
  return async (request) => {
    requests.push(request);
    return { output, durationMs: 500, numTurns: 1, usage: null, costUsd: null, models: [] };
  };
}

describe('generateIdeas', () => {
  test('returns the validated ideas in order', async () => {
    const ideas = await generateIdeas(stub(IDEAS), REQUEST, {
      workDir,
      signal: new AbortController().signal,
    });
    expect(ideas.map((i) => i.kind)).toEqual(['series', 'related', 'new']);
    expect(ideas[0]!.series_id).toBe(PAST);
  });

  test('asks in English with the channel, the history and the mix to propose', async () => {
    await generateIdeas(stub(IDEAS), REQUEST, { workDir, signal: new AbortController().signal });
    const request = requests[0]!;
    expect(request.cwd).toBe(workDir);
    // The selected character's prompt fragment (remotion/src/characters/chip-science/prompt.md).
    expect(request.systemPrompt).toMatch(/CHÍP/);
    expect(request.prompt).toContain('Vì sao bầu trời màu xanh?');
    expect(request.prompt).toContain('Vì sao lá cây màu xanh?');
    expect(request.prompt).toMatch(/exactly 3 ideas/);
    expect(request.prompt).toMatch(/series/);
    expect(request.prompt).toMatch(/related/);
    expect(request.jsonSchema).toMatchObject({
      $schema: 'http://json-schema.org/draft-07/schema#',
      required: ['ideas'],
    });
  });

  test('asks only for new ideas when there is no history', async () => {
    const empty = { ...REQUEST, history: { videos: [], unused_ideas: [] } };
    await generateIdeas(stub(IDEAS), empty, { workDir, signal: new AbortController().signal });
    expect(requests[0]!.prompt).toMatch(/no videos yet: every idea is kind "new"/);
  });

  test('rejects a reply that does not match the schema', async () => {
    const bad = { ideas: [{ kind: 'new', topic: 'x' }] };
    await expect(
      generateIdeas(stub(bad), REQUEST, { workDir, signal: new AbortController().signal }),
    ).rejects.toThrow(/ideas do not match the schema/);
  });

  test('rejects a reply with fewer ideas than requested', async () => {
    const short = { ideas: IDEAS.ideas.slice(0, 2) };
    await expect(
      generateIdeas(stub(short), REQUEST, { workDir, signal: new AbortController().signal }),
    ).rejects.toThrow(/got 2 ideas; the request asks for 3/);
  });

  test('keeps at most the requested number of ideas', async () => {
    const many = { ideas: [...IDEAS.ideas, ...IDEAS.ideas] };
    const ideas = await generateIdeas(stub(many), REQUEST, {
      workDir,
      signal: new AbortController().signal,
    });
    expect(ideas).toHaveLength(3);
  });
});
