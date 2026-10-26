import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

// Static checks of the n8n exports (n8n/workflows) and behaviour tests of their Code nodes, run
// with stubbed n8n globals. The real import/run is the user's rollout step.

const DIR = fileURLToPath(new URL('../../../n8n/workflows/', import.meta.url));
const CREDENTIAL_NAMES = new Set([
  'aivideo-postgres',
  'aivideo-redis',
  'aivideo-telegram',
  'aivideo-form-auth',
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface WorkflowNode {
  id: string;
  name: string;
  type: string;
  parameters: Record<string, unknown>;
  credentials?: Record<string, { id: string; name: string }>;
}

interface Workflow {
  id: string;
  name: string;
  nodes: WorkflowNode[];
  connections: Record<string, { main: { node: string }[][] }>;
  settings: { errorWorkflow?: string };
}

const files = readdirSync(DIR).filter((file) => file.endsWith('.json'));
const workflows = new Map<string, Workflow>(
  files.map((file) => [file, JSON.parse(readFileSync(`${DIR}${file}`, 'utf8')) as Workflow]),
);

function workflow(file: string): Workflow {
  return workflows.get(file)!;
}

type Item = { json: Record<string, unknown> };

interface CodeGlobals {
  input?: Item[];
  executionId?: string;
  nodeOutputs?: Record<string, Item[]>;
  staticData?: Record<string, unknown>;
  helpers?: Record<string, (...args: never[]) => unknown>;
}

// n8n runs Code nodes as async functions, so `await` works at the top level.
const AsyncFunction = Object.getPrototypeOf(async () => undefined).constructor as new (
  ...args: string[]
) => (...args: unknown[]) => Promise<unknown>;

function codeBody(file: string, nodeName: string, globals: CodeGlobals) {
  const node = workflow(file).nodes.find((n) => n.name === nodeName)!;
  const input = globals.input ?? [];
  const $input = { all: () => input, first: () => input[0] };
  const $ = (name: string) => {
    const items = globals.nodeOutputs?.[name] ?? [];
    return { first: () => items[0], all: () => items };
  };
  const staticData = globals.staticData ?? {};
  const code = node.parameters.jsCode as string;
  const args = [$input, { id: globals.executionId ?? '1' }, $, () => staticData];
  const names = ['$input', '$execution', '$', '$getWorkflowStaticData'];
  const self = { helpers: globals.helpers ?? {} };
  return { code, args, names, self };
}

/** Runs a Code node body the way n8n does (top-level return) with stubbed globals. */
function runCode(file: string, nodeName: string, globals: CodeGlobals): Item[] {
  const { code, args, names, self } = codeBody(file, nodeName, globals);
  return new Function(...names, code).apply(self, args) as Item[];
}

/** The same for a Code node that awaits (e.g. reads binary data). */
async function runAsyncCode(file: string, nodeName: string, globals: CodeGlobals): Promise<Item[]> {
  const { code, args, names, self } = codeBody(file, nodeName, globals);
  return (await new AsyncFunction(...names, code).apply(self, args)) as Item[];
}

describe.each(files)('%s', (file) => {
  const wf = workflow(file);

  test('connections reference existing nodes and node names are unique', () => {
    const names = wf.nodes.map((n) => n.name);
    expect(new Set(names).size).toBe(names.length);
    for (const [from, outputs] of Object.entries(wf.connections)) {
      expect(names).toContain(from);
      for (const target of outputs.main.flat()) expect(names).toContain(target.node);
    }
  });

  test('node ids are UUIDs and credentials use the documented names', () => {
    for (const node of wf.nodes) {
      expect(node.id).toMatch(UUID);
      for (const credential of Object.values(node.credentials ?? {})) {
        expect(CREDENTIAL_NAMES).toContain(credential.name);
      }
    }
  });

  test('errors go to WF-99', () => {
    if (wf.id === 'aivideoWf99Error') return;
    expect(wf.settings.errorWorkflow).toBe('aivideoWf99Error');
  });

  // The Telegram node parses text as Markdown unless told otherwise, so a step name such as
  // episode_code breaks the message ("can't parse entities"). Texts go out as escaped HTML.
  test('Telegram texts are sent as escaped HTML', () => {
    const escape =
      /^=\{\{ String\(.+\)\.replace\(\/&\/g, '&amp;'\)\.replace\(\/<\/g, '&lt;'\)\.replace\(\/>\/g, '&gt;'\) \}\}$/;
    for (const node of wf.nodes.filter((n) => n.type === 'n8n-nodes-base.telegram')) {
      const fields = (node.parameters.additionalFields ?? {}) as Record<string, unknown>;
      const text = node.parameters.text ?? fields.caption;
      if (text === undefined) continue;
      expect(text, node.name).toMatch(escape);
      expect(fields.parse_mode, node.name).toBe('HTML');
    }
  });

  test('the escaping expression makes any text safe for HTML mode', () => {
    const expr = "String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')";
    const run = new Function('t', `return ${expr};`) as (t: string) => string;
    expect(run('Retrying episode_code <b>&</b> *x*')).toBe(
      'Retrying episode_code &lt;b&gt;&amp;&lt;/b&gt; *x*',
    );
  });

  test('code nodes compile', () => {
    for (const node of wf.nodes.filter((n) => n.type === 'n8n-nodes-base.code')) {
      expect(() => new AsyncFunction(node.parameters.jsCode as string)).not.toThrow();
    }
  });
});

describe('WF-01 Intake', () => {
  test('builds a trimmed episode brief keyed by the execution id', () => {
    const [out] = runCode('wf-01-intake.json', 'Build brief', {
      executionId: '42',
      input: [
        {
          json: {
            Topic: '  Nếu bạn dừng được thời gian 30 giây? ',
            'Duration (minutes)': 6,
            'Full brief': '',
            Notes: 'giọng kể vui',
          },
        },
      ],
    });

    expect(out!.json.submissionId).toBe('n8n-form-42');
    expect(JSON.parse(out!.json.brief as string)).toEqual({
      format: 'episode',
      topic: 'Nếu bạn dừng được thời gian 30 giây?',
      duration_minutes: 6,
      notes: 'giọng kể vui',
    });
  });

  test('passes a full brief through and leaves an empty duration out', () => {
    const fullBrief = 'VOICE\n[punchy] Nếu bạn dừng được thời gian…\n\n[1. HOOK]';
    const [out] = runCode('wf-01-intake.json', 'Build brief', {
      input: [{ json: { Topic: 'EP5', 'Duration (minutes)': '', 'Full brief': fullBrief } }],
    });

    expect(JSON.parse(out!.json.brief as string)).toEqual({
      format: 'episode',
      topic: 'EP5',
      full_brief: fullBrief,
    });
  });
});

describe('WF-05 Script Approval Request', () => {
  const token = 'f'.repeat(32);
  const row = {
    kind: 'REQUEST',
    video_id: '12345678-aaaa-bbbb-cccc-000000000000',
    version: 2,
    token,
    expires_at: '2026-10-26T10:00:00.000Z',
    script: { title: 'Bầu trời xanh', total_seconds: 44, scene_count: 4, preview: 'Cảnh 1' },
  };

  test('builds one message with three callbacks under 64 bytes', () => {
    const [out] = runCode('wf-05-script-approval.json', 'Build message', {
      input: [{ json: row }],
    });

    expect(out!.json.text).toContain('Script ready for approval (A1)');
    expect(out!.json.text).toContain('Video 12345678 v2');
    expect(out!.json.text).toContain('Bầu trời xanh');
    for (const key of ['approve', 'regenerate', 'reject']) {
      expect(Buffer.byteLength(out!.json[key] as string)).toBeLessThanOrEqual(64);
    }
    expect(out!.json.approve).toBe(`a1:A:${token}`);
  });

  test('shows the TTS budget that approving accepts, or that none is set', () => {
    const withBudget = runCode('wf-05-script-approval.json', 'Build message', {
      input: [
        {
          json: {
            ...row,
            script: { ...row.script, tts_estimate: { units: 420, amount: 462, currency: 'CRD' } },
          },
        },
      ],
    });
    const without = runCode('wf-05-script-approval.json', 'Build message', {
      input: [{ json: { ...row, script: { ...row.script, tts_estimate: null } } }],
    });

    expect(withBudget[0]!.json.text).toContain(
      'TTS budget: up to 462 ITERA credits (420 characters)',
    );
    expect(without[0]!.json.text).toContain('approving allows no TTS spend');
  });

  test('summarizes an episode script in minutes, acts and shots', () => {
    const episode = {
      format: 'episode',
      title: 'Nếu bạn dừng được thời gian 30 giây?',
      total_seconds: 395,
      act_count: 9,
      shot_count: 83,
      line_count: 126,
      narration_chars: 6251,
      preview: 'Mỗi lần dừng thời gian, bạn già thêm một ngày.',
    };
    const [out] = runCode('wf-05-script-approval.json', 'Build message', {
      input: [{ json: { ...row, script: episode } }],
    });

    expect(out!.json.text).toContain('Episode ~6.6 min, 9 acts, 83 shots, 126 lines');
    expect(out!.json.text).toContain('6251 narration characters');
    expect(out!.json.text).not.toContain('scenes');
  });

  test('labels reminders and skips empty results', () => {
    const outputs = runCode('wf-05-script-approval.json', 'Build message', {
      input: [{ json: { ...row, kind: 'REMINDER' } }, { json: {} }],
    });

    expect(outputs).toHaveLength(1);
    expect(outputs[0]!.json.text).toContain('Reminder');
  });
});

describe('WF-06 Telegram Callback', () => {
  const token = 'a'.repeat(32);
  const callback = (data: string): Item => ({
    json: {
      callback_query: {
        id: 'q1',
        data,
        from: { id: 111 },
        message: { message_id: 7, chat: { id: 111 }, text: 'Script ready' },
      },
    },
  });

  test('parses a valid A1 callback', () => {
    const [out] = runCode('wf-06-telegram-callback.json', 'Parse callback', {
      input: [callback(`a1:G:${token}`)],
    });
    expect(out!.json).toMatchObject({ action: 'REGENERATE', token, userId: '111', messageId: '7' });
  });

  test.each(['a1:X:' + token, 'a1:A:short', 'other', ''])('ignores malformed data %j', (data) => {
    expect(
      runCode('wf-06-telegram-callback.json', 'Parse callback', { input: [callback(data)] }),
    ).toEqual([]);
  });

  function reply(result: string, action = 'APPROVE', version: number | null = 1): Item {
    const parsed = runCode('wf-06-telegram-callback.json', 'Parse callback', {
      input: [callback(`a1:A:${token}`)],
    })[0]!;
    parsed.json.action = action;
    return runCode('wf-06-telegram-callback.json', 'Build reply', {
      input: [{ json: { result, version } }],
      nodeOutputs: { 'Parse callback': [parsed] },
    })[0]!;
  }

  test('settles and edits the message on success', () => {
    const out = reply('OK', 'REGENERATE', 2);
    expect(out.json).toMatchObject({ answer: 'Regenerating as v2', settled: true });
    expect(out.json.editedText).toContain('Decision: Regenerating as v2');
  });

  test('leaves the buttons for a refused stranger', () => {
    expect(reply('NOT_ALLOWED', 'APPROVE', null).json).toMatchObject({
      answer: 'You are not an approver.',
      settled: false,
    });
  });

  test('parses storyboard buttons', () => {
    const parse = (data: string) =>
      runCode('wf-06-telegram-callback.json', 'Parse callback', { input: [callback(data)] });
    expect(parse(`sb:A:${token}`)[0]!.json).toMatchObject({
      kind: 'button',
      approval: 'storyboard',
      action: 'APPROVE',
      token,
    });
    expect(parse(`sb:R:${token}`)[0]!.json).toMatchObject({ action: 'REJECT' });
    expect(parse(`sb:G:${token}`)).toEqual([]);
  });

  const message = (text: string, repliedTo: string | null, isBot = false): Item => ({
    json: {
      message: {
        message_id: 9,
        from: { id: 111, is_bot: isBot },
        chat: { id: 111 },
        text,
        ...(repliedTo === null
          ? {}
          : { reply_to_message: { message_id: 8, from: { is_bot: true }, text: repliedTo } }),
      },
    },
  });

  test('turns a reply to a storyboard request into notes for a revision', () => {
    const [out] = runCode('wf-06-telegram-callback.json', 'Parse callback', {
      input: [message('  Shot 1.2 tối quá.  ', `Storyboard ready\nref:${token}`)],
    });
    expect(out!.json).toMatchObject({
      kind: 'reply',
      approval: 'storyboard',
      action: 'FEEDBACK',
      token,
      note: 'Shot 1.2 tối quá.',
      userId: '111',
      chatId: '111',
      messageId: '9',
    });
  });

  test.each([
    ['a message that is not a reply', message('hello', null)],
    ['a reply to another message', message('hello', 'Script ready')],
    ['a message from a bot', message('hello', `ref:${token}`, true)],
  ])('ignores %s', (_name, item) => {
    expect(runCode('wf-06-telegram-callback.json', 'Parse callback', { input: [item] })).toEqual(
      [],
    );
  });

  function storyboardReply(
    result: string,
    kind: 'button' | 'reply',
    action: string,
    round: number | null,
  ) {
    const parsed = {
      json: {
        kind,
        approval: 'storyboard',
        action,
        token,
        chatId: '111',
        messageId: '9',
        queryId: 'q1',
        originalText: 'Storyboard ready',
      },
    };
    return runCode('wf-06-telegram-callback.json', 'Build reply', {
      input: [{ json: { result, version: 1, round } }],
      nodeOutputs: { 'Parse callback': [parsed] },
    })[0]!.json;
  }

  test('answers storyboard decisions and notes', () => {
    expect(storyboardReply('OK', 'button', 'APPROVE', 1)).toMatchObject({
      answer: 'Approved: rendering the preview',
      settled: true,
      isButton: true,
    });
    expect(storyboardReply('OK', 'reply', 'FEEDBACK', 2)).toMatchObject({
      answer: 'Notes received: revising the storyboard (round 2 of 4).',
      isButton: false,
    });
    expect(storyboardReply('NEEDS_DECISION', 'reply', 'FEEDBACK', 4).answer).toMatch(
      /last round.*needs a decision/,
    );
    expect(storyboardReply('EMPTY_NOTE', 'reply', 'FEEDBACK', null).answer).toMatch(
      /Write your notes/,
    );
    expect(storyboardReply('NOT_PENDING', 'reply', 'FEEDBACK', null).answer).toBe(
      'Already decided.',
    );
  });

  test('parses A2 buttons (no regenerate) and answers A2 decisions (D-057)', () => {
    const parse = (data: string) =>
      runCode('wf-06-telegram-callback.json', 'Parse callback', { input: [callback(data)] });
    expect(parse(`a2:A:${token}`)[0]!.json).toMatchObject({
      kind: 'button',
      approval: 'preview',
      action: 'APPROVE',
      token,
    });
    expect(parse(`a2:R:${token}`)[0]!.json).toMatchObject({ action: 'REJECT' });
    expect(parse(`a2:G:${token}`)).toEqual([]);

    const decide = (result: string, action: string) =>
      runCode('wf-06-telegram-callback.json', 'Build reply', {
        input: [{ json: { result, version: 1, round: 1 } }],
        nodeOutputs: { 'Parse callback': parse(`a2:${action[0]}:${token}`) },
      })[0]!.json;
    expect(decide('OK', 'APPROVE').answer).toBe('Approved: rendering the final 1080p');
    expect(decide('OK', 'REJECT').answer).toBe('Rejected (video cancelled)');
    expect(decide('HASH_MISMATCH', 'APPROVE').answer).toBe(
      'The preview changed after this request; wait for the new request.',
    );
  });
});

describe('WF-06 /status (P-017)', () => {
  const command = (text: string, isBot = false): Item => ({
    json: {
      message: { message_id: 5, from: { id: 111, is_bot: isBot }, chat: { id: -100 }, text },
    },
  });
  const parse = (item: Item) =>
    runCode('wf-06-telegram-callback.json', 'Parse callback', { input: [item] });

  test('parses /status with or without a video id prefix', () => {
    expect(parse(command('/status'))[0]!.json).toEqual({
      kind: 'status',
      prefix: '',
      userId: '111',
      chatId: '-100',
      messageId: '5',
    });
    expect(parse(command('/status@aivideo_bot 679CD22F'))[0]!.json).toMatchObject({
      kind: 'status',
      prefix: '679cd22f',
    });
  });

  test.each(['/statusx', '/status 679cd22f extra', '/status zz'])('ignores %j', (text) => {
    expect(parse(command(text))).toEqual([]);
  });

  const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
  const video = {
    allowed: true,
    video_id: '679cd22f-d1f8-44fe-a9fd-9cdcbaa6325c',
    version: 1,
    title: 'Nếu bạn nghe được suy nghĩ của mèo?',
    status: 'GENERATING_ASSETS',
    status_since: minutesAgo(30),
    step: 'episode_code',
    step_status: 'RUNNING',
    step_since: minutesAgo(12),
    progress: { stage: 'agent', turn: 1, of: 3 },
    steps_done: 4,
    steps_total: 5,
    approval: null,
    cost: { CRD: 2817 },
    jobs: null,
  };
  const status = (rows: Record<string, unknown>[], prefix = '') =>
    runCode('wf-06-telegram-callback.json', 'Build status', {
      input: rows.map((json) => ({ json })),
      nodeOutputs: {
        'Parse callback': [{ json: { kind: 'status', prefix, chatId: '-100', messageId: '5' } }],
      },
    })[0]!.json;

  test('lists active videos with their step, time in step and progress', () => {
    const out = status([video]);
    expect(out.text).toContain('[AI Video] 1 active video');
    expect(out.text).toContain('679cd22f v1 · Nếu bạn nghe được suy nghĩ của mèo?');
    expect(out.text).toContain(
      'GENERATING_ASSETS · episode_code running 12 min · agent turn 1/3 · 4/5 jobs done',
    );
    expect(out).toMatchObject({ chatId: '-100', messageId: '5' });
  });

  test('details one video: every job, cost and the approval it waits for', () => {
    const jobs = [
      {
        step: 'script',
        status: 'SUCCEEDED',
        attempts: 1,
        started: minutesAgo(40),
        finished: minutesAgo(39),
        error: null,
        progress: null,
      },
      {
        step: 'timing',
        status: 'SUCCEEDED',
        attempts: 2,
        started: minutesAgo(35),
        finished: minutesAgo(13),
        error: null,
        progress: null,
      },
      {
        step: 'episode_code',
        status: 'RUNNING',
        attempts: 1,
        started: minutesAgo(12),
        finished: null,
        error: null,
        progress: { stage: 'gates', turn: 2, of: 3 },
      },
      {
        step: 'render_episode',
        status: 'PENDING',
        attempts: 0,
        started: null,
        finished: null,
        error: null,
        progress: null,
      },
    ];
    const out = status(
      [{ ...video, jobs, approval: 'STORYBOARD until 2026-10-29 10:00 UTC' }],
      '679cd22f',
    );

    expect(out.text).toContain('Video 679cd22f v1 · Nếu bạn nghe được suy nghĩ của mèo?');
    expect(out.text).toContain('✓ script · 1 min');
    expect(out.text).toContain('✓ timing · 22 min · 2 attempts');
    expect(out.text).toContain('▶ episode_code · 12 min · checking (turn 2/3)');
    expect(out.text).toContain('· render_episode · waiting');
    expect(out.text).toContain('Cost: 2817 CRD');
    expect(out.text).toContain('Waiting for: STORYBOARD until 2026-10-29 10:00 UTC');
  });

  test('says when nothing matches and refuses strangers', () => {
    expect(status([{}]).text).toBe('[AI Video] No active videos.');
    expect(status([{}], 'abcd').text).toBe('[AI Video] No video id starts with abcd.');
    expect(status([{ allowed: false }]).text).toBe('You are not an approver.');
  });
});

describe('WF-06 /retry (D-056)', () => {
  const command = (text: string): Item => ({
    json: {
      message: { message_id: 6, from: { id: 111, is_bot: false }, chat: { id: -100 }, text },
    },
  });
  const parse = (item: Item) =>
    runCode('wf-06-telegram-callback.json', 'Parse callback', { input: [item] });
  const reply = (row: Record<string, unknown>, prefix = '679cd22f') =>
    runCode('wf-06-telegram-callback.json', 'Build retry', {
      input: [{ json: row }],
      nodeOutputs: {
        'Parse callback': [{ json: { kind: 'retry', prefix, chatId: '-100', messageId: '6' } }],
      },
    })[0]!.json as { text: string; chatId: string; messageId: string };

  test('parses /retry with a video id prefix of at least 4 characters', () => {
    expect(parse(command('/retry@aivideo_bot 679CD22F'))[0]!.json).toEqual({
      kind: 'retry',
      prefix: '679cd22f',
      userId: '111',
      chatId: '-100',
      messageId: '6',
    });
  });

  test.each(['/retry', '/retry 679', '/retry zzzz', '/retry 679cd22f now'])(
    'ignores %j',
    (text) => {
      expect(parse(command(text))).toEqual([]);
    },
  );

  test('answers each result of telegram_retry()', () => {
    const id = '679cd22f-d1f8-44fe-a9fd-9cdcbaa6325c';
    expect(reply({ result: 'RETRIED', video_id: id, step: 'episode_code', attempt: 3 })).toEqual({
      text: '[AI Video] Retrying episode_code of video 679cd22f (attempt 3). Progress: /status 679cd22f',
      chatId: '-100',
      messageId: '6',
    });
    expect(reply({ result: 'NOT_APPROVER' }).text).toBe('You are not an approver.');
    expect(reply({ result: 'NOT_FOUND' }, 'abcd').text).toBe(
      '[AI Video] No video id starts with abcd.',
    );
    expect(reply({ result: 'AMBIGUOUS' }, 'abcd').text).toMatch(/send more characters/);
    expect(reply({ result: 'NOT_STOPPED', video_id: id }).text).toMatch(/679cd22f is not waiting/);
    expect(reply({ result: 'NO_FAILED_JOB', video_id: id }).text).toMatch(/no failed job/);
  });

  test('/status of a stopped video shows the retry command', () => {
    const out = runCode('wf-06-telegram-callback.json', 'Build status', {
      input: [
        {
          json: {
            allowed: true,
            video_id: '679cd22f-d1f8-44fe-a9fd-9cdcbaa6325c',
            version: 1,
            title: 'x',
            status: 'NEEDS_DECISION',
            status_since: new Date().toISOString(),
            jobs: [],
            cost: {},
          },
        },
      ],
      nodeOutputs: {
        'Parse callback': [
          { json: { kind: 'status', prefix: '679cd22f', chatId: '-100', messageId: '5' } },
        ],
      },
    })[0]!.json as { text: string };
    expect(out.text).toContain('Retry the failed step: /retry 679cd22f');
  });
});

describe('WF-12 Storyboard Approval Request', () => {
  const token = 'b'.repeat(32);
  const row = {
    kind: 'REQUEST',
    video_id: '12345678-aaaa-bbbb-cccc-000000000000',
    version: 1,
    token,
    expires_at: '2026-10-29T10:00:00.000Z',
    round: 2,
    title: 'Mèo nghĩ gì?',
    board: {
      job_id: '87654321-aaaa-bbbb-cccc-000000000000',
      token: 'c'.repeat(32),
      pages: ['ws/board/page-01.jpg', 'ws/board/page-02.jpg'],
    },
  };

  test('builds one worker URL per storyboard page, in order, with the board token', () => {
    const pages = runCode('wf-12-storyboard-approval.json', 'Build pages', {
      input: [{ json: row }],
    });

    expect(pages.map((p) => p.json.url)).toEqual([
      `REPLACE_WITH_WORKER_URL/boards/${row.video_id}/1/${row.board.job_id}/page-01.jpg?t=${'c'.repeat(32)}`,
      `REPLACE_WITH_WORKER_URL/boards/${row.video_id}/1/${row.board.job_id}/page-02.jpg?t=${'c'.repeat(32)}`,
    ]);
    expect(pages[1]!.json.caption).toBe('Video 12345678 v1 · storyboard 2/4 · page 2/2');
  });

  test('sends no pages for reminders', () => {
    const pages = runCode('wf-12-storyboard-approval.json', 'Build pages', {
      input: [{ json: { ...row, kind: 'REMINDER', board: null } }],
    });
    expect(pages).toEqual([]);
  });

  test('asks for approval or a reply with notes, with buttons under 64 bytes', () => {
    const [out] = runCode('wf-12-storyboard-approval.json', 'Build message', {
      input: [{ json: row }],
    });

    expect(out!.json.text).toContain('Storyboard ready for approval (round 2 of 4)');
    expect(out!.json.text).toContain('Mèo nghĩ gì?');
    expect(out!.json.text).toMatch(/reply to this message with your notes/);
    expect(out!.json.text).toContain(`ref:${token}`);
    expect(out!.json.approve).toBe(`sb:A:${token}`);
    expect(out!.json.reject).toBe(`sb:R:${token}`);
    for (const key of ['approve', 'reject']) {
      expect(Buffer.byteLength(out!.json[key] as string)).toBeLessThanOrEqual(64);
    }
  });
});

describe('WF-06 /new (D-058)', () => {
  const CHAT = 'REPLACE_WITH_APPROVAL_CHAT_ID';
  const message = (text: string, extra: object = {}, chat: string | number = CHAT): Item => ({
    json: {
      message: {
        message_id: 12,
        from: { id: 111, is_bot: false },
        chat: { id: chat },
        ...(Object.keys(extra).length ? { caption: text, ...extra } : { text }),
      },
    },
  });
  const parse = (item: Item) =>
    runCode('wf-06-telegram-callback.json', 'Parse callback', { input: [item] })[0]?.json;

  test('parses minutes, topic and notes', () => {
    expect(
      parse(message('/new@aivideo_bot 8 Nếu bạn dừng được thời gian?\nGiọng vui.\nKết buồn.')),
    ).toEqual({
      kind: 'intake',
      userId: '111',
      chatId: CHAT,
      messageId: '12',
      topic: 'Nếu bạn dừng được thời gian?',
      minutes: 8,
      notes: 'Giọng vui.\nKết buồn.',
      fileId: '',
      error: '',
    });
    expect(parse(message('/new Mèo nghĩ gì?'))).toMatchObject({
      topic: 'Mèo nghĩ gì?',
      minutes: null,
    });
  });

  test('takes the full brief from an attached .md or .txt file', () => {
    const file = { document: { file_id: 'F1', file_name: 'tap-1.md', file_size: 30_000 } };
    expect(parse(message('/new Mèo nghĩ gì?', file))).toMatchObject({ fileId: 'F1', error: '' });
    expect(
      parse(
        message('/new Mèo', { document: { file_id: 'F2', file_name: 'brief.pdf', file_size: 10 } }),
      ),
    ).toMatchObject({ error: 'The full brief must be a .md or .txt file of at most 200 KB.' });
  });

  test('refuses other chats (showing their id) and an empty topic', () => {
    expect(parse(message('/new Mèo', {}, -100999))!.error).toBe(
      'This chat (-100999) is not the approval chat; /new works only there.',
    );
    expect(parse(message('/new  '))!.error).toMatch(/^Usage: \/new \[minutes\] <topic>/);
    expect(parse(message('/newx Mèo'))).toBeUndefined();
  });

  test('builds the brief, reading the file as UTF-8 without a byte order mark', async () => {
    const parsed = parse(
      message('/new 6 Mèo nghĩ gì?\nGhi chú', {
        document: { file_id: 'F1', file_name: 'a.md', file_size: 9 },
      }),
    )!;
    const [out] = await runAsyncCode('wf-06-telegram-callback.json', 'Build draft', {
      input: [{ json: {} }],
      nodeOutputs: { 'Parse callback': [{ json: parsed }] },
      helpers: { getBinaryDataBuffer: async () => Buffer.from('﻿VOICE\n[punchy] Một.', 'utf8') },
    });
    expect(out!.json).toEqual({
      chatId: CHAT,
      messageId: '12',
      ok: true,
      userId: '111',
      brief: JSON.stringify({
        topic: 'Mèo nghĩ gì?',
        duration_minutes: 6,
        full_brief: 'VOICE\n[punchy] Một.',
        notes: 'Ghi chú',
      }),
    });
    const [failed] = await runAsyncCode('wf-06-telegram-callback.json', 'Build draft', {
      input: [{ json: {} }],
      nodeOutputs: { 'Parse callback': [{ json: { ...parsed, error: 'Usage: x' } }] },
    });
    expect(failed!.json).toMatchObject({ ok: false, text: 'Usage: x' });
  });

  const confirm = (row: Record<string, unknown>) =>
    runCode('wf-06-telegram-callback.json', 'Build confirmation', {
      input: [{ json: row }],
      nodeOutputs: { 'Parse callback': [{ json: { chatId: CHAT, messageId: '12' } }] },
    })[0]!.json;

  test('asks to confirm with Create / Cancel, warning when a full brief has no VOICE', () => {
    const token = 'd'.repeat(32);
    const out = confirm({
      result: 'DRAFT',
      token,
      expires_at: '2026-10-26T06:00:00.000Z',
      brief: { topic: 'Mèo nghĩ gì?', duration_minutes: 8, full_brief: 'Dàn ý' },
      has_voice: false,
    });
    expect(out.text).toContain('Topic: Mèo nghĩ gì?');
    expect(out.text).toContain('Length: about 8 min');
    expect(out.text).toContain('Full brief: 5 characters');
    expect(out.text).toMatch(/no VOICE section/);
    expect(out).toMatchObject({ approve: `in:A:${token}`, reject: `in:R:${token}` });

    const plain = confirm({
      result: 'DRAFT',
      token,
      expires_at: '2026-10-26T06:00:00Z',
      brief: { topic: 'Mèo' },
      has_voice: null,
    });
    expect(plain.text).toContain('Full brief: none (Claude writes the episode)');
    expect(plain.text).not.toMatch(/VOICE/);
  });

  test('explains a refused draft without buttons', () => {
    expect(confirm({ result: 'NOT_APPROVER' })).toEqual({
      chatId: CHAT,
      messageId: '12',
      text: 'You are not an approver.',
    });
    expect(
      confirm({ result: 'INVALID', error: 'invalid brief: topic must be 3-500 characters' }).text,
    ).toBe('[AI Video] Not created: invalid brief: topic must be 3-500 characters');
  });

  test('parses Create / Cancel buttons and answers them', () => {
    const token = 'd'.repeat(32);
    const callback = (data: string): Item => ({
      json: {
        callback_query: {
          id: 'q',
          data,
          from: { id: 111 },
          message: { message_id: 13, chat: { id: CHAT }, text: 'confirm' },
        },
      },
    });
    const parsed = runCode('wf-06-telegram-callback.json', 'Parse callback', {
      input: [callback(`in:A:${token}`)],
    });
    expect(parsed[0]!.json).toMatchObject({ approval: 'intake', action: 'APPROVE', token });
    const answer = runCode('wf-06-telegram-callback.json', 'Build reply', {
      input: [
        {
          json: {
            result: 'OK',
            video_id: '302209bf-1d55-40e1-afbe-8278d7224add',
            version: 1,
            round: null,
          },
        },
      ],
      nodeOutputs: { 'Parse callback': parsed },
    })[0]!.json;
    expect(answer).toMatchObject({
      answer: 'Created video 302209bf: writing the script; the A1 request follows.',
      settled: true,
    });
    expect(
      runCode('wf-06-telegram-callback.json', 'Parse callback', {
        input: [callback(`in:G:${token}`)],
      }),
    ).toEqual([]);
  });
});

describe('WF-13 Preview Approval Request (D-057)', () => {
  const token = 'b'.repeat(32);
  const row = {
    kind: 'REQUEST',
    video_id: '679cd22f-d1f8-44fe-a9fd-9cdcbaa6325c',
    version: 1,
    token,
    expires_at: '2026-10-29T10:00:00.000Z',
    round: 1,
    title: 'Nếu bạn nghe được suy nghĩ của mèo?',
    cost: { CRD: 2817 },
    media: {
      job_id: '87654321-aaaa-bbbb-cccc-000000000000',
      token: 'c'.repeat(32),
      level: 'WARN',
      duration_seconds: 178.6,
      checks: [
        { name: 'format', level: 'PASS', detail: 'MP4, h264/aac' },
        { name: 'black frames', level: 'WARN', detail: '0:42.0–0:43.2' },
      ],
    },
  };

  test('fetches the preview from the worker with the media token', () => {
    const [out] = runCode('wf-13-preview-approval.json', 'Build video', { input: [{ json: row }] });
    expect(out!.json).toEqual({
      url: `REPLACE_WITH_WORKER_URL/media/${row.video_id}/1/${row.media.job_id}/preview.mp4?t=${'c'.repeat(32)}`,
      caption: 'Video 679cd22f v1 · preview 720p · Nếu bạn nghe được suy nghĩ của mèo?',
    });
    expect(
      runCode('wf-13-preview-approval.json', 'Build video', {
        input: [{ json: { ...row, kind: 'REMINDER', media: null } }],
      }),
    ).toEqual([]);
  });

  test('asks for A2 with the QA warnings and cost, with buttons under 64 bytes', () => {
    const [out] = runCode('wf-13-preview-approval.json', 'Build message', {
      input: [{ json: row }],
    });
    const text = out!.json.text as string;

    expect(text).toContain('Preview ready for approval (A2)');
    expect(text).toContain('QA: WARN · 2:59');
    expect(text).toContain('- black frames: 0:42.0–0:43.2');
    expect(text).not.toContain('format');
    expect(text).toContain('Cost so far: 2817 CRD');
    expect(text).toMatch(/render the final 1080p/);
    expect(text).toContain(`ref:${token}`);
    expect(out!.json.approve).toBe(`a2:A:${token}`);
    expect(out!.json.reject).toBe(`a2:R:${token}`);
    for (const key of ['approve', 'reject']) {
      expect(Buffer.byteLength(out!.json[key] as string)).toBeLessThanOrEqual(64);
    }
  });

  test('reminds without the report', () => {
    const [out] = runCode('wf-13-preview-approval.json', 'Build message', {
      input: [{ json: { ...row, kind: 'REMINDER', media: null, cost: null } }],
    });
    expect(out!.json.text).toContain('Reminder: preview approval (A2) pending');
    expect(out!.json.text).not.toContain('Cost so far');
  });
});

describe('WF-08 Watchdog', () => {
  const summary = (blocked: string[]) => ({
    json: {
      summary: {
        expired_leases: 0,
        requeued: 0,
        approvals_expired: 0,
        offline_workers: [],
        blocked_videos: blocked,
      },
    },
  });

  test('alerts once per video that needs a decision, with the failed step', () => {
    const staticData = {};
    const failed = {
      video_id: 'abcdef12-0000-0000-0000-000000000000',
      version: 1,
      step: 'script',
      error: 'Error: script does not match the schema',
    };
    const run = (needsDecision: object[]) =>
      runCode('wf-08-watchdog.json', 'Build alert', {
        input: [
          { json: { summary: { ...summary([]).json.summary, needs_decision: needsDecision } } },
        ],
        staticData,
      });

    expect(run([failed])[0]!.json.text).toContain(
      'Video abcdef12 v1 needs a decision: script failed: Error: script does not match the schema',
    );
    expect(run([failed])).toEqual([]);
  });

  test('alerts only when the set of blocked videos changes', () => {
    const staticData = {};
    const run = (blocked: string[]) =>
      runCode('wf-08-watchdog.json', 'Build alert', { input: [summary(blocked)], staticData });

    expect(run([])).toEqual([]);
    expect(run(['12345678-0000-0000-0000-000000000000'])[0]!.json.text).toContain(
      'blocked by a provider limit (waiting, no fallback): 12345678',
    );
    expect(run(['12345678-0000-0000-0000-000000000000'])).toEqual([]);
    expect(run([])[0]!.json.text).toContain('No videos blocked');
  });
});
