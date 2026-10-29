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

    expect(out!.json.text).toContain('Kịch bản sẵn sàng để duyệt (A1)');
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
      'Ngân sách TTS: tối đa 462 credit ITERA (420 ký tự)',
    );
    expect(without[0]!.json.text).toContain('duyệt sẽ không cho chi tiền TTS');
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

    expect(out!.json.text).toContain('Tập ~6.6 phút, 9 hồi, 83 shot, 126 câu thoại');
    expect(out!.json.text).toContain('6251 ký tự lời đọc');
    expect(out!.json.text).not.toContain('cảnh');
  });

  test('invites notes as a plain reply and ends with the kb: reference (D-070)', () => {
    const [out] = runCode('wf-05-script-approval.json', 'Build message', {
      input: [{ json: row }],
    });
    const text = out!.json.text as string;
    expect(text).toContain('Trả lời tin nhắn này bằng lời bình thường để sửa kịch bản');
    expect(text.endsWith(`kb:${token}`)).toBe(true);
  });

  test('fetches script.md from the worker for new requests that have one', () => {
    const file = { job_id: '87654321-aaaa-bbbb-cccc-000000000000', token: 'c'.repeat(32) };
    const [out] = runCode('wf-05-script-approval.json', 'Build file', {
      input: [{ json: { ...row, script: { ...row.script, file } } }],
    });
    expect(out!.json).toEqual({
      url: `REPLACE_WITH_WORKER_URL/media/${row.video_id}/2/${file.job_id}/script.md?t=${file.token}`,
      fileName: 'script-12345678-v2.md',
      caption: 'Kịch bản đầy đủ · Video 12345678 v2 · Bầu trời xanh',
    });
    expect(
      runCode('wf-05-script-approval.json', 'Build file', {
        input: [
          { json: { ...row, script: { ...row.script, file: null } } },
          { json: { ...row, kind: 'REMINDER', script: { ...row.script, file } } },
        ],
      }),
    ).toEqual([]);
  });

  test('labels reminders and skips empty results', () => {
    const outputs = runCode('wf-05-script-approval.json', 'Build message', {
      input: [{ json: { ...row, kind: 'REMINDER' } }, { json: {} }],
    });

    expect(outputs).toHaveLength(1);
    expect(outputs[0]!.json.text).toContain('Nhắc');
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
    expect(out.json).toMatchObject({ answer: 'Đang viết lại thành v2', settled: true });
    expect(out.json.editedText).toContain('Quyết định: Đang viết lại thành v2');
  });

  test('leaves the buttons for a refused stranger', () => {
    expect(reply('NOT_ALLOWED', 'APPROVE', null).json).toMatchObject({
      answer: 'Bạn không phải approver.',
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

  test('turns a reply to an A1 request into notes for a script revision (D-070)', () => {
    const [out] = runCode('wf-06-telegram-callback.json', 'Parse callback', {
      input: [message('Hồi 3 dài quá.', `Kịch bản sẵn sàng\nkb:${token}`)],
    });
    expect(out!.json).toMatchObject({
      kind: 'reply',
      approval: 'script',
      action: 'FEEDBACK',
      token,
      note: 'Hồi 3 dài quá.',
    });
  });

  test('answers notes on a script with the new version and round', () => {
    const parsed = {
      json: { kind: 'reply', approval: 'script', action: 'FEEDBACK', token, chatId: '111' },
    };
    const answer = (result: string, version: number | null, round: number | null) =>
      runCode('wf-06-telegram-callback.json', 'Build reply', {
        input: [{ json: { result, version, round } }],
        nodeOutputs: { 'Parse callback': [parsed] },
      })[0]!.json.answer;
    expect(answer('OK', 3, 2)).toBe('Đã nhận ghi chú: đang sửa kịch bản thành v3 (lần 2/3).');
    expect(answer('NEEDS_DECISION', 4, 3)).toMatch(/vòng ghi chú cuối.*quyết định/);
    expect(answer('NOT_SUPPORTED', null, null)).toBe('Không áp dụng được cho yêu cầu này.');
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
      answer: 'Đã duyệt: đang render preview',
      settled: true,
      isButton: true,
    });
    expect(storyboardReply('OK', 'reply', 'FEEDBACK', 2)).toMatchObject({
      answer: 'Đã nhận ghi chú: đang sửa storyboard (vòng 2/4).',
      isButton: false,
    });
    expect(storyboardReply('NEEDS_DECISION', 'reply', 'FEEDBACK', 4).answer).toMatch(
      /vòng ghi chú cuối.*quyết định/,
    );
    expect(storyboardReply('EMPTY_NOTE', 'reply', 'FEEDBACK', null).answer).toMatch(
      /Hãy viết ghi chú/,
    );
    expect(storyboardReply('NOT_PENDING', 'reply', 'FEEDBACK', null).answer).toBe(
      'Đã được quyết định rồi.',
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
    expect(decide('OK', 'APPROVE').answer).toBe('Đã duyệt: đang render bản cuối 1080p');
    expect(decide('OK', 'REJECT').answer).toBe('Đã từ chối (hủy video)');
    expect(decide('HASH_MISMATCH', 'APPROVE').answer).toBe(
      'Preview đã thay đổi sau khi gửi yêu cầu; hãy chờ yêu cầu mới.',
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
    expect(out.text).toContain('[AI Video] 1 video đang chạy');
    expect(out.text).toContain('679cd22f v1 · Nếu bạn nghe được suy nghĩ của mèo?');
    expect(out.text).toContain(
      'GENERATING_ASSETS · episode_code running 12 phút · agent lượt 1/3 · 4/5 job xong',
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
    expect(out.text).toContain('✓ script · 1 phút');
    expect(out.text).toContain('✓ timing · 22 phút · 2 lần chạy');
    expect(out.text).toContain('▶ episode_code · 12 phút · đang kiểm tra (lượt 2/3)');
    expect(out.text).toContain('· render_episode · đang chờ');
    expect(out.text).toContain('Chi phí: 2817 CRD');
    expect(out.text).toContain('Đang chờ: STORYBOARD, hạn 2026-10-29 10:00 UTC');
  });

  test('says when nothing matches and refuses strangers', () => {
    expect(status([{}]).text).toBe('[AI Video] Không có video nào đang chạy.');
    expect(status([{}], 'abcd').text).toBe(
      '[AI Video] Không có video nào có id bắt đầu bằng abcd.',
    );
    expect(status([{ allowed: false }]).text).toBe('Bạn không phải approver.');
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
      text: '[AI Video] Đang chạy lại bước episode_code của video 679cd22f (lần 3). Tiến độ: /status 679cd22f',
      chatId: '-100',
      messageId: '6',
    });
    expect(reply({ result: 'NOT_APPROVER' }).text).toBe('Bạn không phải approver.');
    expect(reply({ result: 'NOT_FOUND' }, 'abcd').text).toBe(
      '[AI Video] Không có video nào có id bắt đầu bằng abcd.',
    );
    expect(reply({ result: 'AMBIGUOUS' }, 'abcd').text).toMatch(/gõ thêm ký tự/);
    expect(reply({ result: 'NOT_STOPPED', video_id: id }).text).toMatch(
      /679cd22f không ở trạng thái chờ/,
    );
    expect(reply({ result: 'NO_FAILED_JOB', video_id: id }).text).toMatch(/không có job lỗi/);
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
    expect(out.text).toContain('Chạy lại bước lỗi: /retry 679cd22f');
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
    expect(pages[1]!.json.caption).toBe('Video 12345678 v1 · storyboard vòng 2/4 · trang 2/2');
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

    expect(out!.json.text).toContain('Storyboard sẵn sàng để duyệt (vòng 2/4)');
    expect(out!.json.text).toContain('Mèo nghĩ gì?');
    expect(out!.json.text).toMatch(/trả lời \(reply\) tin này kèm ghi chú/);
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
      selection: {},
      error: '',
    });
    expect(parse(message('/new Mèo nghĩ gì?'))).toMatchObject({
      topic: 'Mèo nghĩ gì?',
      minutes: null,
    });
  });

  test('takes kit= and nhanvat= tokens off the first line (D-066)', () => {
    expect(
      parse(message('/new 5 Bíp ơi, tại sao? kit=science nhanvat=bip\nGhi chú')),
    ).toMatchObject({
      topic: 'Bíp ơi, tại sao?',
      minutes: 5,
      notes: 'Ghi chú',
      selection: { kit: 'science', character_set: 'bip' },
    });
    expect(parse(message('/new kit=whatif Mèo'))).toMatchObject({
      topic: 'Mèo',
      selection: { kit: 'whatif' },
    });
    expect(parse(message('/new kit=science'))!.error).toMatch(/^Cách dùng/);
  });

  test('takes the full brief from an attached .md or .txt file', () => {
    const file = { document: { file_id: 'F1', file_name: 'tap-1.md', file_size: 30_000 } };
    expect(parse(message('/new Mèo nghĩ gì?', file))).toMatchObject({ fileId: 'F1', error: '' });
    expect(
      parse(
        message('/new Mèo', { document: { file_id: 'F2', file_name: 'brief.pdf', file_size: 10 } }),
      ),
    ).toMatchObject({ error: 'Full brief phải là file .md hoặc .txt, tối đa 200 KB.' });
  });

  test('refuses other chats (showing their id) and an empty topic', () => {
    expect(parse(message('/new Mèo', {}, -100999))!.error).toBe(
      'Chat này (-100999) không phải chat duyệt; /new chỉ dùng được ở đó.',
    );
    expect(parse(message('/new  '))!.error).toMatch(/^Cách dùng: \/new \[số phút\] <chủ đề>/);
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
    const [chosen] = await runAsyncCode('wf-06-telegram-callback.json', 'Build draft', {
      input: [{ json: {} }],
      nodeOutputs: {
        'Parse callback': [{ json: { ...parsed, fileId: '', selection: { kit: 'science' } } }],
      },
    });
    expect(JSON.parse(String(chosen!.json.brief))).toMatchObject({ kit: 'science' });
    const [failed] = await runAsyncCode('wf-06-telegram-callback.json', 'Build draft', {
      input: [{ json: {} }],
      nodeOutputs: { 'Parse callback': [{ json: { ...parsed, error: 'Usage: x' } }] },
    });
    expect(failed!.json).toMatchObject({ ok: false, text: 'Usage: x' });
  });

  const SELECTION = {
    kit: { slug: 'whatif', label: 'Nếu bạn…', next_slug: 'science', next_label: 'Khoa học' },
    character_set: { slug: 'chip', label: 'Chíp (BẠN)', next_slug: 'bip', next_label: 'Bíp' },
  };
  const confirm = (
    row: Record<string, unknown>,
    parsed: Record<string, unknown> = { chatId: CHAT, messageId: '12' },
  ) =>
    runCode('wf-06-telegram-callback.json', 'Build confirmation', {
      input: [{ json: row }],
      nodeOutputs: { 'Parse callback': [{ json: parsed }] },
    })[0]!.json;

  test('asks to confirm with Create / Cancel, warning when a full brief has no VOICE', () => {
    const token = 'd'.repeat(32);
    const out = confirm({
      result: 'DRAFT',
      token,
      expires_at: '2026-10-26T06:00:00.000Z',
      brief: { topic: 'Mèo nghĩ gì?', duration_minutes: 8, full_brief: 'Dàn ý' },
      has_voice: false,
      selection: SELECTION,
    });
    expect(out.text).toContain('Chủ đề: Mèo nghĩ gì?');
    expect(out.text).toContain('Kit: Nếu bạn… · Nhân vật: Chíp (BẠN)');
    expect(out).toMatchObject({
      edit: false,
      kitButton: 'Kit → Khoa học',
      kitData: `in:K:${token}`,
      castButton: 'Nhân vật → Bíp',
      castData: `in:C:${token}`,
    });
    expect(out.text).toContain('Thời lượng: khoảng 8 phút');
    expect(out.text).toContain('Full brief: 5 ký tự');
    expect(out.text).toMatch(/không có mục VOICE/);
    expect(out).toMatchObject({ approve: `in:A:${token}`, reject: `in:R:${token}` });

    const plain = confirm({
      result: 'DRAFT',
      token,
      expires_at: '2026-10-26T06:00:00Z',
      brief: { topic: 'Mèo' },
      has_voice: null,
      selection: SELECTION,
    });
    expect(plain.text).toContain('Full brief: không có (Claude tự viết tập)');
    expect(plain.text).not.toMatch(/VOICE/);
  });

  test('explains a refused draft without buttons', () => {
    expect(confirm({ result: 'NOT_APPROVER' })).toEqual({
      chatId: CHAT,
      messageId: '12',
      queryId: '',
      edit: false,
      text: 'Bạn không phải approver.',
    });
    expect(
      confirm({ result: 'INVALID', error: 'invalid brief: topic must be 3-500 characters' }).text,
    ).toBe('[AI Video] Chưa tạo: invalid brief: topic must be 3-500 characters');
  });

  test('Kit / Nhân vật buttons cycle the draft and edit the confirmation in place (D-066)', () => {
    const token = 'd'.repeat(32);
    const callback = (data: string): Item => ({
      json: {
        callback_query: {
          id: 'q9',
          data,
          from: { id: 111 },
          message: { message_id: 13, chat: { id: CHAT }, text: 'confirm' },
        },
      },
    });
    const parsed = runCode('wf-06-telegram-callback.json', 'Parse callback', {
      input: [callback(`in:K:${token}`)],
    })[0]!.json;
    expect(parsed).toEqual({
      kind: 'intake-set',
      setKind: 'kit',
      queryId: 'q9',
      userId: '111',
      chatId: CHAT,
      messageId: '13',
      token,
    });
    expect(
      runCode('wf-06-telegram-callback.json', 'Parse callback', {
        input: [callback(`in:C:${token}`)],
      })[0]!.json,
    ).toMatchObject({ setKind: 'character_set' });
    expect(
      runCode('wf-06-telegram-callback.json', 'Parse callback', {
        input: [callback(`a1:K:${token}`)],
      }),
    ).toEqual([]);

    const edited = confirm(
      {
        result: 'DRAFT',
        token,
        expires_at: '2026-10-26T06:00:00Z',
        brief: { topic: 'Mèo', kit: 'science' },
        has_voice: null,
        selection: {
          ...SELECTION,
          kit: {
            ...SELECTION.kit,
            slug: 'science',
            label: 'Khoa học',
            next_slug: 'whatif',
            next_label: 'Nếu bạn…',
          },
        },
      },
      parsed,
    );
    expect(edited).toMatchObject({
      edit: true,
      chatId: CHAT,
      messageId: '13',
      queryId: 'q9',
      kitButton: 'Kit → Nếu bạn…',
    });
    expect(edited.text).toContain('Kit: Khoa học · Nhân vật: Chíp (BẠN)');

    const closed = confirm({ result: 'NOT_PENDING' }, parsed);
    expect(closed).toMatchObject({
      edit: false,
      queryId: 'q9',
      text: 'Bản nháp đã được quyết định rồi.',
    });
    expect(closed.approve).toBeUndefined();
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
      answer: 'Đã tạo video 302209bf: đang viết kịch bản, yêu cầu duyệt A1 sẽ đến sau.',
      settled: true,
    });
    expect(
      runCode('wf-06-telegram-callback.json', 'Parse callback', {
        input: [callback(`in:G:${token}`)],
      }),
    ).toEqual([]);
  });
});

describe('WF-06 channel rules (D-059)', () => {
  const message = (text: string, extra: object = {}): Item => ({
    json: {
      message: {
        message_id: 21,
        from: { id: 111, is_bot: false },
        chat: { id: -100 },
        ...(Object.keys(extra).length ? { caption: text, ...extra } : { text }),
      },
    },
  });
  const parse = (text: string, extra: object = {}) =>
    runCode('wf-06-telegram-callback.json', 'Parse callback', { input: [message(text, extra)] })[0]
      ?.json;

  test.each([
    ['/rules', { action: 'VIEW', scope: '' }],
    ['/rules say', { action: 'VIEW', scope: 'pronunciation' }],
    ['/rules file video', { action: 'VIEW', scope: 'video', exportFile: true }],
    [
      '/rule add video Không dùng nhạc nền.',
      { action: 'ADD', scope: 'video', text: 'Không dùng nhạc nền.' },
    ],
    ['/rule del #12', { action: 'DELETE', text: '12' }],
    [
      '/say TikTok Shop = tích tốc sốp',
      { action: 'SAY', text: 'TikTok Shop', extra: 'tích tốc sốp' },
    ],
    ['/unsay TikTok', { action: 'UNSAY', text: 'TikTok' }],
  ])('parses %j', (text, expected) => {
    expect(parse(text)).toMatchObject({ kind: 'rules', userId: '111', error: '', ...expected });
  });

  test.each([
    '/rules music',
    '/rule add music x',
    '/rule del x',
    '/say TikTok',
    '/unsay',
    '/rules set video',
  ])('answers %j with usage or a hint', (text) => {
    expect(parse(text)!.error).not.toBe('');
  });

  test('takes a /rules set file', () => {
    const file = { document: { file_id: 'R1', file_name: 'video-rules.md', file_size: 500 } };
    expect(parse('/rules set say', file)).toMatchObject({
      action: 'SET',
      scope: 'pronunciation',
      fileId: 'R1',
    });
  });

  const rules = {
    version: 'abcdef0123456789',
    video: [{ id: 3, text: 'Không dùng nhạc nền.' }],
    tts: [],
    pronunciation: [{ id: 1, term: 'TikTok', spoken: 'tích tốc' }],
  };
  const answer = (row: Record<string, unknown>, parsed: Record<string, unknown>) =>
    runCode('wf-06-telegram-callback.json', 'Build rules reply', {
      input: [{ json: row }],
      nodeOutputs: { 'Parse callback': [{ json: { chatId: '-100', messageId: '21', ...parsed } }] },
    })[0]!.json;

  test('lists the rules with their numbers', () => {
    const out = answer({ result: 'OK', rules }, { action: 'VIEW', scope: '' });
    expect(out.text).toContain('Quy tắc kênh (phiên bản abcdef01)');
    expect(out.text).toContain('Video:\n#3 Không dùng nhạc nền.');
    expect(out.text).toContain('TTS:\n(chưa có)');
    expect(out.text).toContain('Phát âm:\nTikTok = tích tốc');
  });

  test('confirms edits and explains refusals', () => {
    expect(answer({ result: 'OK', detail: '7', rules }, { action: 'ADD', scope: 'tts' }).text).toBe(
      '[AI Video] Đã thêm quy tắc #7 (TTS). Áp dụng cho các bước bắt đầu từ bây giờ.',
    );
    expect(answer({ result: 'NOT_FOUND', detail: '9' }, { action: 'DELETE', text: '9' }).text).toBe(
      '[AI Video] Không có quy tắc #9.',
    );
    expect(
      answer({ result: 'INVALID', detail: 'scope must be video or tts' }, { action: 'ADD' }).text,
    ).toBe('[AI Video] Chưa thay đổi: scope must be video or tts');
    expect(answer({ result: 'NOT_APPROVER' }, {}).text).toBe('Bạn không phải approver.');
    expect(answer({ result: 'OK', rules }, { action: 'SET', scope: 'pronunciation' }).text).toBe(
      '[AI Video] Đã thay toàn bộ quy tắc phát âm: giờ có 1 mục. Áp dụng cho các bước bắt đầu từ bây giờ.',
    );
  });

  test('exports a scope as an editable Markdown file', async () => {
    const out = answer(
      { result: 'OK', rules },
      { action: 'VIEW', scope: 'pronunciation', exportFile: true },
    );
    expect(out).toMatchObject({
      exportFile: true,
      fileName: 'say-rules.md',
      caption: 'Sửa xong gửi lại với caption /rules set say',
    });
    expect(out.markdown).toContain('- TikTok = tích tốc');

    const prepared: unknown[] = [];
    const [doc] = await runAsyncCode('wf-06-telegram-callback.json', 'Rules document', {
      input: [{ json: out }],
      helpers: {
        prepareBinaryData: async (...args: never[]) => {
          prepared.push(args);
          return { fileName: 'say-rules.md' };
        },
      },
    });
    expect((prepared[0] as [Buffer, string, string])[0].toString('utf8')).toBe(out.markdown);
    expect(doc).toMatchObject({
      json: { chatId: '-100' },
      binary: { data: { fileName: 'say-rules.md' } },
    });
  });
});

describe('WF-06 members (D-060)', () => {
  const CHAT = 'REPLACE_WITH_APPROVAL_CHAT_ID';
  const message = (text: string, from: object = {}, chat: string | number = CHAT): Item => ({
    json: {
      message: {
        message_id: 31,
        from: { id: 333, is_bot: false, first_name: 'Bình', last_name: 'Trần', ...from },
        chat: { id: chat },
        text,
      },
    },
  });
  const parse = (item: Item) =>
    runCode('wf-06-telegram-callback.json', 'Parse callback', { input: [item] })[0]?.json;

  test('parses /join with the Telegram name, only in the approval chat', () => {
    expect(parse(message('/join', { username: 'binh' }))).toMatchObject({
      kind: 'member',
      action: 'JOIN',
      name: '@binh',
      userId: '333',
      error: '',
    });
    expect(parse(message('/join@aivideo_bot'))).toMatchObject({ name: 'Bình Trần' });
    expect(parse(message('/join', {}, -5))!.error).toBe(
      'Chat này (-5) không phải chat duyệt; /join chỉ dùng được ở đó.',
    );
  });

  test('parses /members and /revoke', () => {
    expect(parse(message('/members'))).toMatchObject({ action: 'LIST' });
    expect(parse(message('/revoke 222'))).toMatchObject({ action: 'REVOKE', target: '222' });
    expect(parse(message('/revoke @binh'))!.error).toMatch(/^Cách dùng: \/revoke <user id>/);
  });

  const answer = (row: Record<string, unknown>, parsed: Record<string, unknown> = {}) =>
    runCode('wf-06-telegram-callback.json', 'Build members reply', {
      input: [{ json: row }],
      nodeOutputs: {
        'Parse callback': [
          { json: { chatId: CHAT, messageId: '31', name: '@binh', userId: '333', ...parsed } },
        ],
      },
    })[0]!.json;

  test('asks the owner with Approve / Reject', () => {
    const token = 'e'.repeat(32);
    const out = answer({ result: 'REQUESTED', token }, { action: 'JOIN' });
    expect(out.text).toContain('@binh (id 333) xin làm approver.');
    expect(out).toMatchObject({ approve: `mb:A:${token}`, reject: `mb:R:${token}` });
  });

  test('lists approvers with the owner first and answers refusals', () => {
    const members = [
      { user_id: '111', name: 'owner', owner: true },
      { user_id: '222', name: 'An', owner: false },
    ];
    const out = answer({ result: 'OK', members }, { action: 'LIST' });
    expect(out.text).toBe(
      '[AI Video] Approver (2)\n★ owner (id 111) · chủ sở hữu\n- An (id 222)\n\nChủ sở hữu có thể gỡ một người bằng /revoke <user id>.',
    );
    expect(answer({ result: 'NOT_OWNER' }).text).toBe('Chỉ chủ sở hữu mới làm được việc này.');
    expect(answer({ result: 'ALREADY_REQUESTED' }).text).toMatch(/đang chờ chủ sở hữu/);
    expect(answer({ result: 'OK', detail: '222', members }, { action: 'REVOKE' }).text).toMatch(
      /^\[AI Video\] 222 không còn là approver\./,
    );
  });

  test("parses the owner's buttons and keeps them for anyone else", () => {
    const token = 'e'.repeat(32);
    const callback: Item = {
      json: {
        callback_query: {
          id: 'q',
          data: `mb:A:${token}`,
          from: { id: 222 },
          message: { message_id: 32, chat: { id: CHAT }, text: 'asks' },
        },
      },
    };
    const parsed = runCode('wf-06-telegram-callback.json', 'Parse callback', { input: [callback] });
    expect(parsed[0]!.json).toMatchObject({ approval: 'member', action: 'APPROVE', token });
    const reply = (result: string) =>
      runCode('wf-06-telegram-callback.json', 'Build reply', {
        input: [{ json: { result, version: null, round: null } }],
        nodeOutputs: { 'Parse callback': parsed },
      })[0]!.json;
    expect(reply('NOT_OWNER')).toMatchObject({
      answer: 'Chỉ chủ sở hữu mới duyệt được thành viên mới.',
      settled: false,
    });
    expect(reply('OK')).toMatchObject({
      answer: 'Đã duyệt: người này giờ là approver.',
      settled: true,
    });
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

    expect(text).toContain('Preview sẵn sàng để duyệt (A2)');
    expect(text).toContain('QA: WARN · 2:59');
    expect(text).toContain('- khung hình đen: 0:42.0–0:43.2');
    expect(text).not.toContain('định dạng');
    expect(text).toContain('Chi phí đến giờ: 2817 CRD');
    expect(text).toMatch(/render bản cuối 1080p/);
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
    expect(out!.json.text).toContain('Nhắc: preview đang chờ duyệt (A2)');
    expect(out!.json.text).not.toContain('Chi phí đến giờ');
  });
});

describe('WF-14 Final Delivery (D-062)', () => {
  const token = 'f'.repeat(32);
  const row = {
    kind: 'REQUEST',
    video_id: '679cd22f-d1f8-44fe-a9fd-9cdcbaa6325c',
    version: 1,
    token,
    expires_at: '2026-10-29T10:00:00.000Z',
    round: 1,
    title: 'Mèo nghĩ gì?',
    metadata: {
      job_id: '87654321-aaaa-bbbb-cccc-000000000000',
      token: 'c'.repeat(32),
      title: 'Nếu bạn nghe được suy nghĩ của mèo?',
      description: 'Con mèo nhà bạn đang nghĩ gì?',
      tags: ['mèo', 'nếu bạn'],
      thumbnail_shot: '1.2',
      qa_level: 'WARN',
      qa: [
        { name: 'format', level: 'PASS', detail: 'MP4' },
        { name: 'silence', level: 'WARN', detail: '2:50.0–2:58.6' },
      ],
    },
    report: null,
  };

  test('fetches the thumbnail with the metadata media token', () => {
    const [out] = runCode('wf-14-final-delivery.json', 'Build thumbnail', {
      input: [{ json: row }],
    });
    expect(out!.json.url).toBe(
      `REPLACE_WITH_WORKER_URL/media/${row.video_id}/1/${row.metadata.job_id}/thumbnail.jpg?t=${'c'.repeat(32)}`,
    );
  });

  test('asks for A3 with the metadata, QA warnings, Duyệt and Viết lại', () => {
    const [out] = runCode('wf-14-final-delivery.json', 'Build message', { input: [{ json: row }] });
    const text = out!.json.text as string;
    expect(text).toContain('Metadata sẵn sàng để duyệt (A3, lần 1)');
    expect(text).toContain('Tiêu đề: Nếu bạn nghe được suy nghĩ của mèo?');
    expect(text).toContain('Tag: mèo, nếu bạn');
    expect(text).toContain('- im lặng: 2:50.0–2:58.6');
    expect(text.endsWith(`meta:${token}`)).toBe(true);
    expect(out!.json).toMatchObject({ approve: `a3:A:${token}`, regenerate: `a3:G:${token}` });
  });

  test('reports a finished video with its archive, cost and the Mac cleanup question', () => {
    const [out] = runCode('wf-14-final-delivery.json', 'Build done', {
      input: [
        {
          json: {
            ...row,
            kind: 'DONE',
            metadata: {
              title: 'Nếu bạn nghe được suy nghĩ của mèo?',
              hashtags: ['#nếubạn', '#mèo'],
            },
            report: {
              target: 'gdrive',
              path: `2026/10/${row.video_id}/v1`,
              file_count: 18,
              total_bytes: 104857600,
              local_bytes: 987654321,
              cost: { CRD: 2817 },
              agent_minutes: 42.5,
              jobs: 12,
            },
          },
        },
      ],
    });
    const text = out!.json.text as string;
    expect(text).toContain('Video hoàn tất ✓');
    expect(text).toContain(
      `Đã lưu trên Google Drive (đã kiểm tra checksum): 2026/10/${row.video_id}/v1`,
    );
    expect(text).toContain('18 file, 100.0 MB');
    expect(text).toContain('Chi phí: 2817 CRD · agent 42.5 phút · 12 job');
    expect(text).toContain('Xóa bản trên Mac (0.92 GB) để giải phóng chỗ?');
    expect(out!.json).toMatchObject({ approve: `cl:A:${token}`, reject: `cl:R:${token}` });
    expect(
      runCode('wf-14-final-delivery.json', 'Build message', {
        input: [{ json: { ...row, kind: 'DONE' } }],
      }),
    ).toEqual([]);
  });

  test('WF-06 takes A3 buttons (Viết lại allowed) and notes replied to an A3 message', () => {
    const callback = (data: string): Item => ({
      json: {
        callback_query: {
          id: 'q',
          data,
          from: { id: 111 },
          message: { message_id: 40, chat: { id: -100 }, text: 'A3' },
        },
      },
    });
    const parse = (item: Item) =>
      runCode('wf-06-telegram-callback.json', 'Parse callback', { input: [item] });
    const regenerate = parse(callback(`a3:G:${token}`));
    expect(regenerate[0]!.json).toMatchObject({
      approval: 'metadata',
      action: 'REGENERATE',
      token,
    });
    const reply = parse({
      json: {
        message: {
          message_id: 41,
          from: { id: 111, is_bot: false },
          chat: { id: -100 },
          text: 'Tiêu đề ngắn hơn.',
          reply_to_message: { message_id: 40, from: { is_bot: true }, text: `A3\nmeta:${token}` },
        },
      },
    });
    expect(reply[0]!.json).toMatchObject({
      kind: 'reply',
      approval: 'metadata',
      action: 'FEEDBACK',
      token,
    });
    const answer = (parsed: Item[], result = 'OK') =>
      runCode('wf-06-telegram-callback.json', 'Build reply', {
        input: [{ json: { result, version: 1, round: 2 } }],
        nodeOutputs: { 'Parse callback': parsed },
      })[0]!.json;
    expect(answer(regenerate).answer).toBe('Đang viết lại metadata (lần 2).');
    expect(answer(reply).answer).toBe('Đã nhận ghi chú: đang viết lại metadata (lần 2).');
    expect(answer(parse(callback(`a3:A:${token}`))).answer).toBe(
      'Đã duyệt: đang lưu trữ lên Google Drive để hoàn tất video.',
    );
    const cleanup = parse(callback(`cl:A:${token}`));
    expect(cleanup[0]!.json).toMatchObject({ approval: 'cleanup', action: 'APPROVE' });
    expect(parse(callback(`cl:G:${token}`))).toEqual([]);
    expect(answer(cleanup, 'NOT_OWNER')).toMatchObject({
      answer: 'Chỉ chủ sở hữu mới xóa được bản trên Mac.',
      settled: false,
    });
    expect(answer(cleanup).answer).toBe(
      'Đã duyệt: kiểm tra lại bản lưu trên Google Drive rồi xóa bản trên Mac.',
    );
    const [cleaned] = runCode('wf-14-final-delivery.json', 'Build cleaned', {
      input: [
        {
          json: {
            ...row,
            kind: 'CLEANED',
            report: { freed_bytes: 987654321, remote_dir: `2026/10/${row.video_id}/v1` },
          },
        },
      ],
    });
    expect(cleaned!.json.text).toContain('Đã xóa bản trên Mac: 0.92 GB');
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
      'Video abcdef12 v1 cần bạn quyết định: bước script lỗi: Error: script does not match the schema',
    );
    expect(run([failed])).toEqual([]);
  });

  test('alerts only when the set of blocked videos changes', () => {
    const staticData = {};
    const run = (blocked: string[]) =>
      runCode('wf-08-watchdog.json', 'Build alert', { input: [summary(blocked)], staticData });

    expect(run([])).toEqual([]);
    expect(run(['12345678-0000-0000-0000-000000000000'])[0]!.json.text).toContain(
      'bị chặn do giới hạn nhà cung cấp (đang chờ, không tự đổi nhà cung cấp): 12345678',
    );
    expect(run(['12345678-0000-0000-0000-000000000000'])).toEqual([]);
    expect(run([])[0]!.json.text).toContain('Không còn video nào bị');
  });
});

describe('deploy script (ops/n8n/deploy-workflows.sh)', () => {
  const script = readFileSync(
    fileURLToPath(new URL('../../../ops/n8n/deploy-workflows.sh', import.meta.url)),
    'utf8',
  );
  const start = script.indexOf('PUBLISH_ORDER=(');
  const publishOrder = script
    .slice(start, script.indexOf(')', start))
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean);

  test('every workflow id is in PUBLISH_ORDER and WF-99 is published first', () => {
    const ids = [...workflows.values()].map((wf) => wf.id);

    expect(publishOrder[0]).toBe('aivideoWf99Error');
    expect(new Set(publishOrder)).toEqual(new Set(ids));
  });

  test('the only placeholders are the two the script fills in', () => {
    const KNOWN = new Set(['REPLACE_WITH_APPROVAL_CHAT_ID', 'REPLACE_WITH_WORKER_URL']);

    for (const file of files) {
      const found = readFileSync(`${DIR}${file}`, 'utf8').match(/REPLACE_WITH_[A-Z_]+/g) ?? [];
      const unknown = [...new Set(found)].filter((placeholder) => !KNOWN.has(placeholder));
      expect(unknown, file).toEqual([]);
    }
  });
});
