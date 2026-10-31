import { NO_RULES } from '../../src/rules/channel-rules.js';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pino from 'pino';
import { beforeEach, describe, expect, test } from 'vitest';
import type { ClaudeRequest, ClaudeRunner } from '../../src/claude/claude-cli.js';
import {
  checkEpisodeScript,
  createEpisodeScriptHandler,
  isEpisodeInput,
  matchKey,
  type EpisodeScript,
} from '../../src/handlers/episode-script.js';
import { PermanentJobError, type HandlerContext } from '../../src/runner.js';
import { writeCheckpoint } from '../../src/storage/checkpoint.js';

const TOPIC_BRIEF = {
  format: 'episode',
  topic: 'Nếu bạn dừng được thời gian 30 giây?',
  duration_minutes: 6,
} as const;

const FULL_BRIEF_TEXT = [
  'VOICE',
  '[punchy] Nếu bạn dừng được thời gian ba mươi giây… thì cuộc đời bạn sẽ ra sao?',
  '[short pause] [tense] Tiết Toán. Cô gọi tên bạn lên bảng.',
  'Bạn hoảng. Bạn vỗ tay một cái.',
  '',
  '[explaining] Luật thế này.',
  'Vỗ tay một cái — cả thế giới dừng lại.',
].join('\n');

const SCRIPT: EpisodeScript = {
  title: 'Nếu bạn dừng được thời gian 30 giây?',
  logline: 'Mỗi lần dừng thời gian, bạn già thêm một ngày.',
  characters: [{ name: 'BẠN', look: 'thiếu niên, hoodie CAM' }],
  effects: 'VỖ TAY → FREEZE: gợn sóng tròn lan từ tay ra toàn khung.',
  notes: 'Hook giữ đủ ~3s.',
  acts: [
    {
      title: 'HOOK + COLD OPEN',
      grade: 'sáng',
      lines: [
        '[punchy] Nếu bạn dừng được thời gian ba mươi giây… thì cuộc đời bạn sẽ ra sao?',
        '[short pause] [tense] Tiết Toán. Cô gọi tên bạn lên bảng.',
        'Bạn hoảng. Bạn vỗ tay một cái.',
      ],
      shots: [
        {
          id: '1.1',
          moc: 'Nếu bạn dừng được thời gian',
          description: 'ECU hai bàn tay vỗ.',
          sfx: ['vỗ tay'],
        },
        { id: '1.2', moc: 'Tiết Toán', description: 'Cô gọi tên, bạn lên bảng.', sfx: [] },
        {
          id: '1.3',
          moc: 'Bạn vỗ tay một cái',
          description: 'ECU vỗ tay → FreezeWorld.',
          hold_seconds: 1.2,
          sfx: ['vỗ tay', 'vút'],
        },
      ],
    },
    {
      title: 'LUẬT CHƠI',
      grade: 'nền tối giản',
      lines: ['[explaining] Luật thế này.', 'Vỗ tay một cái — cả thế giới dừng lại.'],
      shots: [
        {
          id: '2.1',
          moc: 'Luật thế này',
          description: 'Bạn ở giữa, icon nổi lên.',
          sfx: ['whoosh'],
        },
        { id: '2.2', moc: 'Vỗ tay một cái', description: 'Vỗ tay → đồng hồ 30 giây.', sfx: [] },
      ],
    },
  ],
};

let workDir: string;
let requests: ClaudeRequest[];

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'episode-script-'));
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

const withAct = (index: number, patch: Partial<EpisodeScript['acts'][number]>): EpisodeScript => ({
  ...SCRIPT,
  acts: SCRIPT.acts.map((act, i) => (i === index ? { ...act, ...patch } : act)),
});

const noRules = async () => NO_RULES;

describe('isEpisodeInput', () => {
  test('routes only briefs with format "episode"', () => {
    expect(isEpisodeInput({ brief: TOPIC_BRIEF })).toBe(true);
    expect(isEpisodeInput({ brief: { topic: 'x', duration_seconds: 30 } })).toBe(false);
    expect(isEpisodeInput(null)).toBe(false);
  });
});

describe('matchKey', () => {
  test('drops audio tags, punctuation and case, keeps Vietnamese letters', () => {
    expect(matchKey('[short pause] [tense] Tiết Toán. Cô gọi TÊN bạn!')).toBe(
      'tiết toán cô gọi tên bạn',
    );
    expect(matchKey('Vỗ tay một cái — cả thế giới')).toBe('vỗ tay một cái cả thế giới');
  });
});

describe('checkEpisodeScript', () => {
  test('accepts a consistent script', () => {
    expect(checkEpisodeScript(SCRIPT, TOPIC_BRIEF)).toEqual([]);
  });

  test('requires shot ids numbered act.n in order', () => {
    const script = withAct(1, {
      shots: [{ ...SCRIPT.acts[1]!.shots[0]!, id: '2.2' }, SCRIPT.acts[1]!.shots[1]!],
    });
    expect(checkEpisodeScript(script, TOPIC_BRIEF)).toContainEqual(
      expect.stringMatching(/shot 2\.2: expected 2\.1/),
    );
  });

  test('requires every MỐC to appear in the act narration after the previous one', () => {
    const missing = withAct(0, {
      shots: [SCRIPT.acts[0]!.shots[0]!, { ...SCRIPT.acts[0]!.shots[1]!, moc: 'Không có câu này' }],
    });
    expect(checkEpisodeScript(missing, TOPIC_BRIEF)).toContainEqual(
      expect.stringMatching(/shot 1\.2: MỐC "Không có câu này" not found/),
    );

    const reversed = withAct(0, {
      shots: [
        { ...SCRIPT.acts[0]!.shots[0]!, moc: 'Tiết Toán' },
        { ...SCRIPT.acts[0]!.shots[1]!, moc: 'Nếu bạn dừng được thời gian' },
      ],
    });
    expect(checkEpisodeScript(reversed, TOPIC_BRIEF)).toContainEqual(
      expect.stringMatching(/shot 1\.2: MỐC .* not found/),
    );
  });

  test('keeps each act within one TTS request (10000 characters)', () => {
    const long = withAct(1, { lines: [...SCRIPT.acts[1]!.lines, 'a'.repeat(400).repeat(25)] });
    expect(checkEpisodeScript(long, TOPIC_BRIEF)).toContainEqual(
      expect.stringMatching(/act 2 narration is \d+ characters; at most 10000/),
    );
  });

  test('requires narration copied verbatim from a full brief', () => {
    const brief = { ...TOPIC_BRIEF, full_brief: FULL_BRIEF_TEXT };
    expect(checkEpisodeScript(SCRIPT, brief)).toEqual([]);

    const edited = withAct(1, {
      lines: ['[explaining] Luật chơi thế này.', SCRIPT.acts[1]!.lines[1]!],
    });
    expect(checkEpisodeScript(edited, brief)).toContainEqual(
      expect.stringMatching(/act 2 line 1 is not in the brief/),
    );
  });

  test('rejects a topic episode far longer than the requested duration', () => {
    const words = Array.from({ length: 2000 }, () => 'chữ').join(' ');
    const chunks = Array.from(
      { length: 8 },
      (_, i) => words.slice(i * 1000, (i + 1) * 1000) || 'x',
    );
    const long = withAct(1, { lines: [...SCRIPT.acts[1]!.lines, ...chunks] });
    expect(checkEpisodeScript(long, { ...TOPIC_BRIEF, duration_minutes: 2 })).toContainEqual(
      expect.stringMatching(/about \d+ s of narration; the brief asks for 120 s/),
    );
  });
});

describe('episode script handler', () => {
  test('writes script.json with line ids and returns the A1 summary', async () => {
    const handler = createEpisodeScriptHandler({ claude: stub(SCRIPT), rules: noRules });

    const result = await handler(context({ brief: TOPIC_BRIEF, language: 'vi' }));

    expect(result.outputs).toEqual(['script.json', 'script.md']);
    const saved = JSON.parse(await readFile(join(workDir, 'script.json'), 'utf8'));
    expect(saved.acts[0].lines[0]).toEqual({ id: 'L001', text: SCRIPT.acts[0]!.lines[0] });
    expect(saved.acts[1].lines.map((l: { id: string }) => l.id)).toEqual(['L004', 'L005']);
    expect(saved.acts[1].shots).toEqual(SCRIPT.acts[1]!.shots);

    const narration = SCRIPT.acts.map((act) => act.lines.join('\n'));
    expect(result.result).toMatchObject({
      format: 'episode',
      title: SCRIPT.title,
      hook: SCRIPT.logline,
      act_count: 2,
      shot_count: 5,
      line_count: 5,
      narration_chars: narration.join('').length,
      // One TTS request per act, audio tags included (docs/episode-pipeline.md §4).
      scenes: narration.map((text) => ({ narration: text })),
      claude: { duration_ms: 900, num_turns: 1 },
    });
    expect(result.result.total_seconds).toBeGreaterThan(0);
    expect(String(result.result.preview)).toContain('LUẬT CHƠI');
  });

  test('writes a readable Markdown storyboard', async () => {
    const handler = createEpisodeScriptHandler({ claude: stub(SCRIPT), rules: noRules });
    await handler(context({ brief: TOPIC_BRIEF, language: 'vi' }));

    const markdown = await readFile(join(workDir, 'script.md'), 'utf8');
    expect(markdown).toContain(`# ${SCRIPT.title}`);
    expect(markdown).toContain('L002 [short pause] [tense] Tiết Toán.');
    expect(markdown).toContain('1.3 MỐC "Bạn vỗ tay một cái"');
  });

  test('asks in English to write an episode from a topic, with the brief as data', async () => {
    const handler = createEpisodeScriptHandler({ claude: stub(SCRIPT), rules: noRules });
    await handler(context({ brief: TOPIC_BRIEF, language: 'vi' }));

    const request = requests[0]!;
    expect(request.cwd).toBe(workDir);
    expect(request.systemPrompt).toMatch(/Vietnamese/);
    expect(request.systemPrompt).toContain('Nếu bạn…?');
    expect(request.systemPrompt).toContain('Một chữ nếu… một cuộc đời khác.');
    expect(request.prompt).toMatch(/Write one episode/);
    expect(request.prompt).toMatch(/about 6 minutes/);
    expect(request.prompt).toContain(TOPIC_BRIEF.topic);
    expect(request.timeoutMs).toBeGreaterThanOrEqual(30 * 60 * 1000);
    expect(request.jsonSchema).toMatchObject({
      $schema: 'http://json-schema.org/draft-07/schema#',
      required: ['title', 'logline', 'characters', 'effects', 'notes', 'acts'],
    });
  });

  test('writes for the selected channel: science kit + Chíp', async () => {
    const handler = createEpisodeScriptHandler({ claude: stub(SCRIPT), rules: noRules });
    const brief = { ...TOPIC_BRIEF, kit: 'science', character_set: 'chip-science' };
    await handler(context({ brief, language: 'vi' }));

    const request = requests[0]!;
    expect(request.systemPrompt).toContain('CHÍP');
    expect(request.systemPrompt).toContain('Chíp ơi, tại sao…?');
    expect(request.systemPrompt).not.toContain('Nếu bạn…?');
    expect(request.systemPrompt).toContain('science settings');
    expect(request.prompt).toContain('"character_set": "chip-science"');
  });

  test('refuses an unknown kit instead of falling back', async () => {
    const handler = createEpisodeScriptHandler({ claude: stub(SCRIPT), rules: noRules });
    await expect(
      handler(context({ brief: { ...TOPIC_BRIEF, kit: 'anime' }, language: 'vi' })),
    ).rejects.toThrow(/unknown kit/);
  });

  test('asks to restructure a full brief verbatim', async () => {
    const handler = createEpisodeScriptHandler({ claude: stub(SCRIPT), rules: noRules });
    const brief = { ...TOPIC_BRIEF, full_brief: FULL_BRIEF_TEXT };
    await handler(context({ brief, language: 'vi' }));

    expect(requests[0]!.prompt).toMatch(/Restructure the brief/);
    expect(requests[0]!.prompt).toMatch(/verbatim/);
    expect(requests[0]!.prompt).toContain('Tiết Toán. Cô gọi tên bạn lên bảng.');
  });

  test("puts the owner's rules into the prompt and records their version (D-059)", async () => {
    const rules = async () => ({
      ...NO_RULES,
      version: 'abc',
      video: [{ id: 1, text: 'Không dùng nhạc nền.' }],
      tts: [{ id: 2, text: 'Câu hỏi mở đầu có [short pause] phía sau.' }],
    });
    const result = await createEpisodeScriptHandler({ claude: stub(SCRIPT), rules })(
      context({ brief: TOPIC_BRIEF }),
    );

    expect(requests[0]!.prompt).toMatch(
      /owner's rules for every video[^\n]*\n- Không dùng nhạc nền\./,
    );
    expect(requests[0]!.prompt).toMatch(/narration lines[^\n]*\n- Câu hỏi mở đầu/);
    expect(result.result.rules_version).toBe('abc');
  });

  test('returns a media token so WF-05 can attach script.md', async () => {
    const handler = createEpisodeScriptHandler({ claude: stub(SCRIPT), rules: noRules });
    const result = await handler(context({ brief: TOPIC_BRIEF }));
    expect(result.result.media_token).toMatch(/^[0-9a-f]{32}$/);
    expect(String(result.result.preview)).toContain('(3 câu, 3 shot)');
  });

  test('rejects an invalid input permanently', async () => {
    const handler = createEpisodeScriptHandler({ claude: stub(SCRIPT), rules: noRules });
    await expect(
      handler(context({ brief: { format: 'episode', topic: '' } })),
    ).rejects.toBeInstanceOf(PermanentJobError);
  });

  test('retries (plain error) on a schema mismatch or failed checks', async () => {
    const bad = createEpisodeScriptHandler({ claude: stub({ title: 'x' }), rules: noRules });
    const schemaError = await bad(context({ brief: TOPIC_BRIEF })).catch((e: unknown) => e);
    expect(schemaError).not.toBeInstanceOf(PermanentJobError);
    expect((schemaError as Error).message).toMatch(/episode script does not match the schema/);

    const wrongIds = withAct(0, {
      shots: SCRIPT.acts[0]!.shots.map((shot, i) => ({ ...shot, id: `1.${i + 5}` })),
    });
    const inconsistent = createEpisodeScriptHandler({ claude: stub(wrongIds), rules: noRules });
    const checkError = await inconsistent(context({ brief: TOPIC_BRIEF })).catch((e: unknown) => e);
    expect(checkError).not.toBeInstanceOf(PermanentJobError);
    expect((checkError as Error).message).toMatch(/episode script failed its checks/);
  });
});

describe('episode script revision (A1 notes)', () => {
  const VIDEO = '11111111-1111-4111-8111-111111111111';
  const PREVIOUS = '22222222-2222-4222-8222-222222222222';
  const NOTES = 'Hồi 2 thêm một câu đùa.';
  const revisionInput = (brief: object = TOPIC_BRIEF) => ({
    brief,
    revision: { previous_job_id: PREVIOUS, previous_version: 1, feedback: NOTES, round: 1 },
  });

  /** The job layout of the worker: <root>/videos/<video>/v<n>/jobs/<job>. */
  async function layout(withPrevious = true) {
    const root = await mkdtemp(join(tmpdir(), 'episode-revision-'));
    const previousDir = join(root, 'videos', VIDEO, 'v1', 'jobs', PREVIOUS);
    workDir = join(root, 'videos', VIDEO, 'v2', 'jobs', 'job-2');
    await mkdir(workDir, { recursive: true });
    if (!withPrevious) return;
    await mkdir(previousDir, { recursive: true });
    const numbered = {
      ...SCRIPT,
      acts: SCRIPT.acts.map((act) => ({
        ...act,
        lines: act.lines.map((text, i) => ({ id: `L00${i + 1}`, text })),
      })),
    };
    await writeFile(join(previousDir, 'script.json'), JSON.stringify(numbered));
    await writeCheckpoint(previousDir, ['script.json'], {});
  }

  test('revises the previous script with the notes, keeping what they do not touch', async () => {
    await layout();
    const handler = createEpisodeScriptHandler({ claude: stub(SCRIPT), rules: noRules });

    const result = await handler(context(revisionInput()));

    const prompt = requests[0]!.prompt;
    expect(prompt).toMatch(/Revise the episode script below/);
    expect(prompt).toMatch(/Change only what the notes ask/);
    expect(prompt).toContain(NOTES);
    // The previous script as the model wrote it: plain line strings, no worker line ids.
    expect(prompt).toContain(JSON.stringify(SCRIPT.acts[1]!.lines[0]));
    expect(prompt).not.toContain('"L001"');
    expect(result.result.revision).toEqual({ previous_job_id: PREVIOUS, round: 1 });
  });

  test('accepts narration the notes changed even from a full brief', async () => {
    await layout();
    const changed = withAct(1, {
      lines: ['[explaining] Luật thế này.', 'Vỗ tay một cái — cả thế giới dừng lại. Hết.'],
    });
    const handler = createEpisodeScriptHandler({ claude: stub(changed), rules: noRules });
    const brief = { ...TOPIC_BRIEF, full_brief: FULL_BRIEF_TEXT };
    await expect(handler(context(revisionInput(brief)))).resolves.toBeDefined();
  });

  test('fails permanently when the previous script is missing', async () => {
    await layout(false);
    const handler = createEpisodeScriptHandler({ claude: stub(SCRIPT), rules: noRules });
    await expect(handler(context(revisionInput()))).rejects.toBeInstanceOf(PermanentJobError);
    expect(requests).toHaveLength(0);
  });
});
