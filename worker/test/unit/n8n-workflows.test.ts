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

  // The *_due() call has already recorded the request when the media branch runs, so an unreachable
  // worker (or a failed upload) must not end the execution before the buttons go out; the owner
  // would otherwise see them only with the next reminder, hours later (D-086).
  test('a failed media fetch or upload never loses the approval buttons', () => {
    const approvalPolls = [
      'wf-05-script-approval.json',
      'wf-12-storyboard-approval.json',
      'wf-13-preview-approval.json',
      'wf-14-final-delivery.json',
      'wf-15-voice-approval.json',
    ];
    if (!approvalPolls.includes(file)) return;
    // The fetch nodes and the Telegram nodes that upload what they fetched.
    const media = wf.nodes.filter(
      (n) => n.type === 'n8n-nodes-base.httpRequest' || n.parameters.binaryData === true,
    );
    expect(media.length).toBeGreaterThan(0);
    for (const node of media) {
      expect((node as WorkflowNode & { onError?: string }).onError, node.name).toBe(
        'continueRegularOutput',
      );
    }
  });

  // WF-99 writes the audit row before it notifies; when Postgres itself is the outage, the alert
  // must still go out (D-086).
  test('WF-99 notifies Telegram even when the audit write fails', () => {
    if (wf.id !== 'aivideoWf99Error') return;
    const audit = wf.nodes.find((n) => n.name === 'Write audit log') as WorkflowNode & {
      onError?: string;
    };
    expect(audit.onError).toBe('continueRegularOutput');
    expect(wf.connections['Write audit log']!.main[0]!.map((c) => c.node)).toEqual([
      'Notify Telegram',
    ]);
  });

  // The Telegram node parses text as Markdown unless told otherwise, so a step name such as
  // episode_code breaks the message ("can't parse entities"). Texts go out as escaped HTML: either
  // escaped by the node, or built as HTML by a Code node that escapes every value (an `html` field).
  test('Telegram texts are sent as escaped HTML', () => {
    const escape =
      /^=\{\{ String\(.+\)\.replace\(\/&\/g, '&amp;'\)\.replace\(\/<\/g, '&lt;'\)\.replace\(\/>\/g, '&gt;'\) \}\}$/;
    const built = /^=\{\{ (\$json|\$\('[^']+'\)\.first\(\)\.json)\.\w*[hH]tml \}\}$/;
    for (const node of wf.nodes.filter((n) => n.type === 'n8n-nodes-base.telegram')) {
      const fields = (node.parameters.additionalFields ?? {}) as Record<string, unknown>;
      const text = node.parameters.text ?? fields.caption;
      if (text === undefined) continue;
      expect(escape.test(String(text)) || built.test(String(text)), node.name).toBe(true);
      expect(fields.parse_mode, node.name).toBe('HTML');
    }
  });

  // The hidden ref link at the start of an approval message must not turn into a link preview.
  test('messages built as HTML send no link preview', () => {
    for (const node of wf.nodes.filter((n) => n.type === 'n8n-nodes-base.telegram')) {
      if (node.parameters.text !== '={{ $json.html }}') continue;
      const fields = node.parameters.additionalFields as Record<string, unknown>;
      expect(fields.disable_web_page_preview, node.name).toBe(true);
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

    expect(out!.json.html).toContain('<b>📝 Duyệt kịch bản</b> · bước 1/5 · A1');
    expect(out!.json.html).toContain('#12345678 v2');
    expect(out!.json.html).toContain('«Bầu trời xanh»');
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

    expect(withBudget[0]!.json.html).toContain('TTS tối đa 462 credit ITERA (420 ký tự)');
    expect(without[0]!.json.html).toContain('duyệt sẽ không cho chi tiền TTS');
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

    expect(out!.json.html).toContain('~6.6 phút · 9 hồi · 83 shot · 126 câu');
    expect(out!.json.html).not.toContain('cảnh');
  });

  test('invites notes as a reply and hides the kb reference in a link at the start (D-070)', () => {
    const [out] = runCode('wf-05-script-approval.json', 'Build message', {
      input: [{ json: row }],
    });
    const html = out!.json.html as string;
    expect(html).toContain('↩️ Reply tin này để góp ý sửa');
    expect(html.startsWith(`<a href="https://t.me/?kb=${token}">\u200d</a>`)).toBe(true);
    expect(html).not.toContain(`kb:${token}`);
  });

  test('shows the deadline in Vietnam time (UTC+7)', () => {
    const [out] = runCode('wf-05-script-approval.json', 'Build message', {
      input: [{ json: { ...row, expires_at: '2026-10-30T19:30:00.000Z' } }],
    });
    expect(out!.json.html).toContain('⏰ Hạn 02:30 31/10');
    expect(out!.json.html).not.toContain('UTC');
  });

  test('collapses the preview and escapes every value', () => {
    const [out] = runCode('wf-05-script-approval.json', 'Build message', {
      input: [{ json: { ...row, script: { ...row.script, title: 'A<b>&', preview: 'x < y' } } }],
    });
    expect(out!.json.html).toContain('«A&lt;b&gt;&amp;»');
    expect(out!.json.html).toContain('<blockquote expandable>x &lt; y</blockquote>');
  });

  test('fetches script.md from the worker for new requests that have one', () => {
    const file = { job_id: '87654321-aaaa-bbbb-cccc-000000000000', token: 'c'.repeat(32) };
    const [out] = runCode('wf-05-script-approval.json', 'Build file', {
      input: [{ json: { ...row, script: { ...row.script, file } } }],
    });
    expect(out!.json).toEqual({
      url: `REPLACE_WITH_WORKER_URL/media/${row.video_id}/2/${file.job_id}/script.md?t=${file.token}`,
      fileName: 'script-12345678-v2.md',
      caption: '📝 #12345678 v2 · kịch bản đầy đủ',
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
    expect(outputs[0]!.json.html).toContain('⏰ Nhắc: ');
    expect(outputs[0]!.json.html).not.toContain('blockquote');
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
    expect(out.json.editedHtml).toMatch(
      /^Script ready\n<b>✔️ Đang viết lại thành v2<\/b> · \d{2}:\d{2} \d{2}\/\d{2}$/,
    );
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

  test('parses Render final on a storyboard only (D-076)', () => {
    const parse = (data: string) =>
      runCode('wf-06-telegram-callback.json', 'Parse callback', { input: [callback(data)] });
    expect(parse(`sb:F:${token}`)[0]!.json).toMatchObject({
      kind: 'button',
      approval: 'storyboard',
      action: 'APPROVE_ALL',
      token,
    });
    for (const kind of ['a1', 'a1b', 'a2', 'in', 'mb', 'a3', 'cl']) {
      expect(parse(`${kind}:F:${token}`), kind).toEqual([]);
    }
  });

  test('parses voice buttons, Đọc lại included (A1b, D-071)', () => {
    const parse = (data: string) =>
      runCode('wf-06-telegram-callback.json', 'Parse callback', { input: [callback(data)] });
    for (const [code, action] of [
      ['A', 'APPROVE'],
      ['G', 'REGENERATE'],
      ['R', 'REJECT'],
    ]) {
      expect(parse(`a1b:${code}:${token}`)[0]!.json).toMatchObject({
        kind: 'button',
        approval: 'voice',
        action,
        token,
      });
    }
  });

  test('answers voice buttons with the take', () => {
    const answer = (result: string, action: string, round: number | null) =>
      runCode('wf-06-telegram-callback.json', 'Build reply', {
        input: [{ json: { result, version: 1, round } }],
        nodeOutputs: {
          'Parse callback': [
            { json: { kind: 'button', approval: 'voice', action, token, originalText: 'x' } },
          ],
        },
      })[0]!.json.answer;
    expect(answer('OK', 'APPROVE', 1)).toBe('Đã duyệt giọng: Claude đang viết code tập');
    expect(answer('OK', 'REGENERATE', 2)).toBe('Đang đọc lại giọng (lần 2/3)');
    expect(answer('OK', 'REJECT', 1)).toBe('Đã từ chối (hủy video)');
    expect(answer('NEEDS_DECISION', 'REGENERATE', 3)).toBe(
      'Đã đọc 3/3 lần; video cần bạn quyết định.',
    );
    expect(answer('HASH_MISMATCH', 'APPROVE', null)).toMatch(/^Giọng đọc đã thay đổi/);
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

  test('finds the request in the hidden ref link of a compact message, for each kind', () => {
    const linked = (kind: string): Item => {
      const item = message('Sửa câu mở đầu.', '\u200d🏷 Duyệt metadata');
      const replied = (item.json.message as { reply_to_message: Record<string, unknown> })
        .reply_to_message;
      replied.entities = [
        { type: 'bold', offset: 1, length: 5 },
        { type: 'text_link', offset: 0, length: 1, url: `https://t.me/?${kind}=${token}` },
      ];
      return item;
    };
    for (const [kind, approval] of [
      ['kb', 'script'],
      ['ref', 'storyboard'],
      ['meta', 'metadata'],
    ]) {
      const [out] = runCode('wf-06-telegram-callback.json', 'Parse callback', {
        input: [linked(kind!)],
      });
      expect(out!.json).toMatchObject({ kind: 'reply', approval, token, note: 'Sửa câu mở đầu.' });
    }
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
    expect(storyboardReply('OK', 'button', 'APPROVE_ALL', 1)).toMatchObject({
      answer:
        'Đã chọn Render final: đang render preview; preview và metadata tự duyệt nếu QA không cảnh báo',
      settled: true,
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

  test.each([
    ['/statusx', 'statusx'],
    ['/status 679cd22f extra', 'status'],
    ['/status zz', 'status'],
  ])('sends %j to the usage reply (D-097)', (text, topic) => {
    expect(parse(command(text))[0]!.json).toMatchObject({ kind: 'help', mode: 'bad', topic });
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
    worker_id: 'hp-400-g7',
    worker_online: true,
    state_group: 'RUNNING',
    total: 1,
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
    expect(out.text).toContain('📊 1 video · ▶ 1 chạy');
    expect(out.text).toContain('▶ ĐANG CHẠY');
    expect(out.text).toContain('/v_679cd22f v1 · Nếu bạn nghe được suy nghĩ của mèo?');
    expect(out.text).toContain('🖥 hp-400-g7 · episode_code 12 phút · agent lượt 1/3 · 4/5 job');
    expect(out.text).not.toContain('8 ký tự');
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

    expect(out.text).toContain(
      '📊 Video 679cd22f v1 · Nếu bạn nghe được suy nghĩ của mèo?\n🖥 Worker: /worker_hp_400_g7 🟢\nTrạng thái:',
    );
    expect(out.text).toContain('✓ script · 1 phút');
    expect(out.text).toContain('✓ timing · 22 phút · 2 lần chạy');
    expect(out.text).toContain('▶ episode_code · 12 phút · đang kiểm tra (lượt 2/3)');
    expect(out.text).toContain('· render_episode · đang chờ');
    expect(out.text).toContain('Chi phí: 2817 CRD');
    expect(out.text).toContain('Đang chờ: STORYBOARD, hạn 17:00 29/10');
  });

  test('says when nothing matches and refuses strangers', () => {
    expect(status([{}]).text).toBe('Không có video nào đang chạy.');
    expect(status([{}], 'abcd').text).toBe('Không có video nào có id bắt đầu bằng abcd.');
    expect(status([{ allowed: false }]).text).toBe('Bạn không phải approver.');
  });
});

describe('WF-06 /workers (D-082)', () => {
  const command = (text: string): Item => ({
    json: {
      message: { message_id: 7, from: { id: 111, is_bot: false }, chat: { id: -100 }, text },
    },
  });
  const parse = (item: Item) =>
    runCode('wf-06-telegram-callback.json', 'Parse callback', { input: [item] });
  const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
  const build = (rows: Record<string, unknown>[]) =>
    runCode('wf-06-telegram-callback.json', 'Build status', {
      input: rows.map((json) => ({ json })),
      nodeOutputs: {
        'Parse callback': [{ json: { kind: 'workers', chatId: '-100', messageId: '7' } }],
      },
    })[0]!.json as { text: string; chatId: string; messageId: string };

  test.each(['/workers', '/worker', '/workers@aivideo_bot'])('parses %j', (text) => {
    expect(parse(command(text))[0]!.json).toEqual({
      kind: 'workers',
      userId: '111',
      chatId: '-100',
      messageId: '7',
    });
  });

  test.each([
    ['/workersx', 'workersx'],
    ['/workers x', 'workers'],
    ['/worker mac mini', 'worker'],
  ])('sends %j to the usage reply (D-097)', (text, topic) => {
    expect(parse(command(text))[0]!.json).toMatchObject({ kind: 'help', mode: 'bad', topic });
  });

  test('routes /workers to telegram_workers() and its reply to Build status', () => {
    const wf = workflow('wf-06-telegram-callback.json');
    const node = wf.nodes.find((n) => n.name === 'Workers')!;
    expect(node.parameters.query).toBe('SELECT * FROM telegram_workers($1::bigint);');
    expect(wf.connections['Status?']!.main[1]).toEqual([
      expect.objectContaining({ node: 'Workers?' }),
    ]);
    expect(wf.connections['Workers?']!.main.map((out) => out[0]!.node)).toEqual([
      'Workers',
      'Worker detail?',
    ]);
    expect(wf.connections['Workers']!.main[0]).toEqual([
      expect.objectContaining({ node: 'Build status' }),
    ]);
  });

  test('shows each worker, the clip it runs, its step and progress', () => {
    const out = build([
      {
        allowed: true,
        worker_id: 'hp-400-g7',
        online: false,
        last_seen_at: minutesAgo(15),
        jobs: [],
        waiting: 0,
      },
      {
        allowed: true,
        worker_id: 'mac-mini-m4',
        online: true,
        last_seen_at: minutesAgo(0),
        waiting: 2,
        jobs: [
          {
            video_id: '679cd22f-d1f8-44fe-a9fd-9cdcbaa6325c',
            version: 1,
            title: 'Mèo nghĩ gì?',
            video_status: 'GENERATING_ASSETS',
            step: 'render_episode',
            attempts: 2,
            started: minutesAgo(12),
            progress: { stage: 'render', frames: 1800 },
          },
        ],
      },
    ]);

    expect(out).toMatchObject({ chatId: '-100', messageId: '7' });
    expect(out.text).toContain('🖥 2 worker');
    expect(out.text).toContain('🔴 hp-400-g7 · offline 15 phút\nrảnh');
    expect(out.text).toContain('🟢 mac-mini-m4 · online · 2 job đang chờ');
    expect(out.text).toContain('Chi tiết: /worker_hp_400_g7');
    expect(out.text).toContain('Chi tiết: /worker_mac_mini_m4');
    expect(out.text).toContain('▶ /v_679cd22f v1 · Mèo nghĩ gì?');
    expect(out.text).toContain(
      'render_episode · 12 phút · lần 2 · đang render 1800 khung hình · GENERATING_ASSETS',
    );
    expect(out.text).not.toContain('8 ký tự');
  });

  test('says when no worker has reported and refuses strangers', () => {
    expect(build([{}]).text).toBe('Chưa có worker nào gửi heartbeat.');
    expect(build([{ allowed: false }]).text).toBe('Bạn không phải approver.');
  });
});

describe('WF-06 /pending (D-090)', () => {
  const command = (text: string): Item => ({
    json: {
      message: { message_id: 7, from: { id: 111, is_bot: false }, chat: { id: -100 }, text },
    },
  });
  const parse = (item: Item) =>
    runCode('wf-06-telegram-callback.json', 'Parse callback', { input: [item] });
  const build = (rows: Record<string, unknown>[], prefix = '') =>
    runCode('wf-06-telegram-callback.json', 'Build status', {
      input: rows.map((json) => ({ json })),
      nodeOutputs: {
        'Parse callback': [{ json: { kind: 'pending', prefix, chatId: '-100', messageId: '7' } }],
      },
    })[0]!.json as { text: string; chatId: string; messageId: string };

  test.each([
    ['/pending', ''],
    ['/cho', ''],
    ['/pending@aivideo_bot', ''],
    ['/pending 679CD22F', '679cd22f'],
  ])('parses %j', (text, prefix) => {
    expect(parse(command(text))[0]!.json).toEqual({
      kind: 'pending',
      prefix,
      userId: '111',
      chatId: '-100',
      messageId: '7',
    });
  });

  test.each([
    ['/pendingx', 'pendingx'],
    ['/pending abc xyz', 'pending'],
    ['/chooo', 'chooo'],
  ])('sends %j to the usage reply (D-097)', (text, topic) => {
    expect(parse(command(text))[0]!.json).toMatchObject({ kind: 'help', mode: 'bad', topic });
  });

  test('routes /pending to telegram_pending() and its reply to Build status', () => {
    const wf = workflow('wf-06-telegram-callback.json');
    const node = wf.nodes.find((n) => n.name === 'Pending')!;
    expect(node.parameters.query).toBe(
      'SELECT * FROM telegram_pending($1::bigint, video_ref($2));',
    );
    expect(node.parameters.options).toEqual({
      queryReplacement: '={{ [$json.userId, $json.prefix] }}',
    });
    expect(wf.connections['Worker detail?']!.main[1]).toEqual([
      expect.objectContaining({ node: 'Pending?' }),
    ]);
    expect(wf.connections['Pending?']!.main.map((out) => out[0]!.node)).toEqual([
      'Pending',
      'Ideas?',
    ]);
    expect(wf.connections['Pending']!.main[0]).toEqual([
      expect.objectContaining({ node: 'Build status' }),
    ]);
  });

  test('lists each open request and says the buttons come again', () => {
    const out = build([
      {
        allowed: true,
        video_id: '679cd22f-d1f8-44fe-a9fd-9cdcbaa6325c',
        version: 2,
        title: 'Mèo nghĩ gì?',
        type: 'STORYBOARD',
        expires_at: '2026-11-04T10:00:00Z',
        reminded: true,
      },
      {
        allowed: true,
        video_id: '11112222-d1f8-44fe-a9fd-9cdcbaa6325c',
        version: 1,
        title: null,
        type: 'CLEANUP',
        expires_at: '2026-11-09T01:30:00Z',
        reminded: false,
      },
    ]);

    expect(out).toMatchObject({ chatId: '-100', messageId: '7' });
    expect(out.text).toContain('⏳ 2 yêu cầu đang chờ duyệt');
    expect(out.text).toContain('/v_679cd22f v2 · Mèo nghĩ gì? · STORYBOARD · hạn 17:00 04/11');
    expect(out.text).toContain(
      '/v_11112222 v1 · ? · CLEANUP · hạn 08:30 09/11 · nút nằm trong tin báo hoàn tất',
    );
    expect(out.text).toContain('Bot sẽ gửi lại 1 yêu cầu kèm nút trong khoảng 30 giây.');
  });

  test('says when nothing is open and refuses strangers', () => {
    expect(build([{}]).text).toBe('Không có yêu cầu nào đang chờ duyệt.');
    expect(build([{}], 'abcd').text).toBe(
      'Không có yêu cầu nào đang chờ duyệt cho video có id bắt đầu bằng abcd.',
    );
    expect(build([{ allowed: false }]).text).toBe('Bạn không phải approver.');
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
    'sends %j to the usage reply (D-097)',
    (text) => {
      expect(parse(command(text))[0]!.json).toMatchObject({
        kind: 'help',
        mode: 'bad',
        topic: 'retry',
      });
    },
  );

  test('answers each result of telegram_retry()', () => {
    const id = '679cd22f-d1f8-44fe-a9fd-9cdcbaa6325c';
    expect(reply({ result: 'RETRIED', video_id: id, step: 'episode_code', attempt: 3 })).toEqual({
      text: 'Đang chạy lại bước episode_code của video 679cd22f (lần 3). Tiến độ: /status_679cd22f',
      chatId: '-100',
      messageId: '6',
    });
    expect(reply({ result: 'NOT_APPROVER' }).text).toBe('Bạn không phải approver.');
    expect(reply({ result: 'NOT_FOUND' }, 'abcd').text).toBe(
      'Không có video nào có id bắt đầu bằng abcd.',
    );
    expect(reply({ result: 'AMBIGUOUS' }, 'abcd').text).toMatch(/gõ thêm ký tự/);
    expect(reply({ result: 'NOT_STOPPED', video_id: id }).text).toMatch(
      /679cd22f không ở trạng thái chờ/,
    );
    expect(reply({ result: 'NO_FAILED_JOB', video_id: id }).text).toMatch(/không có job lỗi/);
    expect(reply({ result: 'RETRY_LIMIT', video_id: id, step: 'tts' }).text).toMatch(
      /679cd22f đã chạy lại bước tts 5 lần/,
    );
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
    expect(out.text).toContain('Chạy lại bước lỗi: /retry_679cd22f');
  });
});

describe('WF-06 /auto (D-093)', () => {
  const id = '679cd22f-d1f8-44fe-a9fd-9cdcbaa6325c';
  const command = (text: string): Item => ({
    json: {
      message: { message_id: 8, from: { id: 111, is_bot: false }, chat: { id: -100 }, text },
    },
  });
  const parse = (text: string) =>
    runCode('wf-06-telegram-callback.json', 'Parse callback', { input: [command(text)] });
  const reply = (parsed: Record<string, unknown>, row: Record<string, unknown> | null) =>
    runCode('wf-06-telegram-callback.json', 'Build auto', {
      input: row ? [{ json: row }] : [],
      nodeOutputs: {
        'Parse callback': [{ json: { kind: 'auto', chatId: '-100', messageId: '8', ...parsed } }],
      },
    })[0]!.json as { text: string; chatId: string; messageId: string };

  test('parses /auto <id>, /tudong <id> off and the bot mention', () => {
    expect(parse('/auto@aivideo_bot 679CD22F')[0]!.json).toEqual({
      kind: 'auto',
      prefix: '679cd22f',
      enable: 'true',
      error: '',
      userId: '111',
      chatId: '-100',
      messageId: '8',
    });
    expect(parse('/tudong 679cd22f off')[0]!.json).toMatchObject({
      prefix: '679cd22f',
      enable: 'false',
      error: '',
    });
    expect(parse('/auto 679cd22f tat')[0]!.json).toMatchObject({ enable: 'false' });
  });

  test.each(['/auto', '/auto 679', '/auto 679cd22f now'])('answers %j with the usage', (text) => {
    expect(parse(text)[0]!.json).toMatchObject({
      kind: 'auto',
      error: expect.stringMatching(/^Cách dùng: \/auto/),
    });
  });

  test('other commands that start with auto are unknown commands (D-097)', () => {
    expect(parse('/automatic 679cd22f')[0]!.json).toMatchObject({
      kind: 'help',
      mode: 'bad',
      topic: 'automatic',
    });
  });

  test('WF-06 routes /auto to telegram_auto() and its reply to Send status', () => {
    const wf = workflow('wf-06-telegram-callback.json');
    const next = (name: string) => wf.connections[name]!.main.map((out) => out.map((c) => c.node));
    expect(next('Retry?')[1]).toEqual(['Auto?']);
    expect(next('Auto?')).toEqual([['Auto ok?'], ['Move?']]);
    expect(next('Auto ok?')).toEqual([['Auto'], ['Build auto']]);
    expect(next('Auto')).toEqual([['Build auto']]);
    expect(next('Build auto')).toEqual([['Send status']]);
    const query = wf.nodes.find((n) => n.name === 'Auto')!.parameters.query as string;
    expect(query).toBe('SELECT * FROM telegram_auto($1::bigint, video_ref($2), $3::boolean);');
  });

  test('answers each result of telegram_auto()', () => {
    const on = reply(
      { prefix: '679cd22f', enable: 'true', error: '' },
      {
        result: 'OK',
        video_id: id,
        version: 1,
        status: 'RENDERING_PREVIEW',
        decided_type: 'STORYBOARD',
      },
    );
    expect(on).toMatchObject({ chatId: '-100', messageId: '8' });
    expect(on.text).toContain('🤖 Đã bật tự duyệt cho video 679cd22f v1');
    expect(on.text).toContain('Đã duyệt luôn bước storyboard đang chờ.');
    expect(on.text).toContain('xóa bản trên Mac vẫn hỏi owner');
    expect(on.text).toContain('Tắt: /auto_679cd22f_off');
    const plain = reply(
      { prefix: '679cd22f', enable: 'true', error: '' },
      { result: 'OK', video_id: id, version: 1, status: 'SCRIPTING', decided_type: null },
    );
    expect(plain.text).not.toContain('Đã duyệt luôn');
    expect(reply({ prefix: '679cd22f' }, { result: 'OFF', video_id: id }).text).toMatch(
      /Đã tắt tự duyệt cho video 679cd22f/,
    );
    expect(reply({ prefix: 'abcd' }, { result: 'NOT_APPROVER' }).text).toBe(
      'Bạn không phải approver.',
    );
    expect(reply({ prefix: 'abcd' }, { result: 'NOT_FOUND' }).text).toBe(
      'Không có video nào có id bắt đầu bằng abcd.',
    );
    expect(reply({ prefix: 'abcd' }, { result: 'AMBIGUOUS' }).text).toMatch(/gõ thêm ký tự/);
    expect(reply({ prefix: '679cd22f' }, { result: 'NOT_ACTIVE', video_id: id }).text).toMatch(
      /679cd22f đang lưu trữ hoặc đã kết thúc/,
    );
    expect(reply({ error: 'Cách dùng: /auto x' }, null).text).toBe('Cách dùng: /auto x');
  });
});

describe('/auto notes in WF-05, WF-15 and WF-12 (D-093)', () => {
  const base = {
    kind: 'AUTO',
    video_id: '679cd22f-d1f8-44fe-a9fd-9cdcbaa6325c',
    version: 1,
    token: 'a'.repeat(32),
    expires_at: '2026-11-05T10:00:00.000Z',
    title: 'Mèo nghĩ gì?',
  };
  const cases = [
    {
      file: 'wf-05-script-approval.json',
      query: 'Due approvals',
      row: { ...base, title: undefined, script: { title: 'Mèo nghĩ gì?', format: 'episode' } },
      text: '🤖 #679cd22f v1 · kịch bản tự duyệt (/auto) · «Mèo nghĩ gì?»: đang tạo giọng đọc',
    },
    {
      file: 'wf-15-voice-approval.json',
      query: 'Due voices',
      row: { ...base, take: 1, voice: { file: null, max_takes: 3 } },
      text: '🤖 #679cd22f v1 · giọng đọc tự duyệt (/auto) · «Mèo nghĩ gì?»: đang dựng storyboard',
    },
    {
      file: 'wf-12-storyboard-approval.json',
      query: 'Due storyboards',
      row: {
        ...base,
        round: 1,
        board: { job_id: 'j', token: 't', pages: ['p.jpg'], mix_token: 'm' },
      },
      text: '🤖 #679cd22f v1 · storyboard tự duyệt (/auto) · «Mèo nghĩ gì?»: đang render preview',
    },
  ];

  test.each(cases)('$file sends one line without buttons or media for an AUTO row', (c) => {
    const wf = workflow(c.file);
    const input = [{ json: c.row }, { json: { ...c.row, kind: 'REQUEST' } }];
    const [note, ...rest] = runCode(c.file, 'Build auto note', { input });
    expect(rest).toEqual([]);
    expect(note!.json.text).toBe(c.text);
    expect(runCode(c.file, 'Build message', { input: [{ json: c.row }] })).toEqual([]);
    for (const n of wf.nodes.filter((n) => n.type === 'n8n-nodes-base.code')) {
      if (n.name === 'Build auto note' || n.name === 'Build message') continue;
      expect(runCode(c.file, n.name, { input: [{ json: c.row }] }), n.name).toEqual([]);
    }
    expect(wf.connections[c.query]!.main[0]!.map((x) => x.node)).toContain('Build auto note');
    expect(wf.connections['Build auto note']!.main[0]!.map((x) => x.node)).toEqual([
      'Send auto note',
    ]);
    const send = wf.nodes.find((n) => n.name === 'Send auto note')!;
    expect(send.type).toBe('n8n-nodes-base.telegram');
    expect(send.parameters).not.toHaveProperty('replyMarkup');
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
    expect(pages[1]!.json.caption).toBe('🎬 #12345678 · 2/2');
  });

  test('sends the audio mix of a new request with the media token (D-071)', () => {
    const [mix, ...rest] = runCode('wf-12-storyboard-approval.json', 'Build mix', {
      input: [
        { json: { ...row, board: { ...row.board, mix_token: 'f'.repeat(32) } } },
        { json: { ...row, video_id: '22345678-aaaa-bbbb-cccc-000000000000' } },
        { json: { ...row, kind: 'REMINDER', board: null } },
      ],
    });
    expect(rest).toEqual([]);
    expect(mix!.json).toEqual({
      url: `REPLACE_WITH_WORKER_URL/media/${row.video_id}/1/${row.board.job_id}/mix.m4a?t=${'f'.repeat(32)}`,
      caption: '🎬 #12345678 v1 · âm thanh (giọng + SFX)',
    });
    const wf = workflow('wf-12-storyboard-approval.json');
    expect(wf.connections['Due storyboards']!.main[0]!.map((c) => c.node)).toContain('Build mix');
    expect(wf.nodes.find((n) => n.name === 'Send mix')!.parameters.operation).toBe('sendAudio');
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

    const html = out!.json.html as string;
    expect(html).toContain('<b>🎬 Duyệt storyboard</b> · bước 3/5 · vòng 2/4');
    expect(html).toContain('«Mèo nghĩ gì?»');
    expect(html).toContain('↩️ Reply tin này để góp ý sửa');
    expect(html.startsWith(`<a href="https://t.me/?ref=${token}">\u200d</a>`)).toBe(true);
    expect(html).not.toContain(`ref:${token}`);
    expect(html).toContain('#12345678 v1 · Render preview → gửi preview để duyệt');
    expect(html).toContain('Render final → tự duyệt preview + metadata nếu QA không cảnh báo');
    expect(out!.json.approve).toBe(`sb:A:${token}`);
    expect(out!.json.approveAll).toBe(`sb:F:${token}`);
    expect(out!.json.reject).toBe(`sb:R:${token}`);
    for (const key of ['approve', 'approveAll', 'reject']) {
      expect(Buffer.byteLength(out!.json[key] as string)).toBeLessThanOrEqual(64);
    }
  });
});

test('WF-12 offers Render preview, Render final and Từ chối (D-076)', () => {
  const send = workflow('wf-12-storyboard-approval.json').nodes.find(
    (n) => n.name === 'Send buttons',
  )!;
  const keyboard = send.parameters.inlineKeyboard as {
    rows: { row: { buttons: { text: string; additionalFields: { callback_data: string } }[] } }[];
  };
  expect(
    keyboard.rows[0]!.row.buttons.map((b) => [b.text, b.additionalFields.callback_data]),
  ).toEqual([
    ['Render preview', '={{ $json.approve }}'],
    ['Render final', '={{ $json.approveAll }}'],
    ['Từ chối', '={{ $json.reject }}'],
  ]);
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
      worker: '',
      auto: false,
      error: '',
    });
    expect(parse(message('/new Mèo nghĩ gì?'))).toMatchObject({
      topic: 'Mèo nghĩ gì?',
      minutes: null,
    });
  });

  test('takes kit= and nhanvat= tokens off the first line (D-066)', () => {
    expect(
      parse(message('/new 5 Bíp ơi, tại sao? kit=science nhanvat=chip-science\nGhi chú')),
    ).toMatchObject({
      topic: 'Bíp ơi, tại sao?',
      minutes: 5,
      notes: 'Ghi chú',
      selection: { kit: 'science', character_set: 'chip-science' },
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
    expect(parse(message('/newx Mèo'))).toMatchObject({ kind: 'help', topic: 'newx' });
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
      worker: '',
      auto: 'false',
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
    character_set: {
      slug: 'chip',
      label: 'Chíp (BẠN)',
      next_slug: 'chip-science',
      next_label: 'Chíp Khoa học',
    },
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
      castButton: 'Nhân vật → Chíp Khoa học',
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

  test('the Thời lượng button cycles the length; a full brief shows its VOICE estimate (D-091)', () => {
    const token = 'd'.repeat(32);
    const draftRow = (brief: Record<string, unknown>, duration: Record<string, unknown>) => ({
      result: 'DRAFT',
      token,
      expires_at: '2026-10-26T06:00:00Z',
      brief,
      has_voice: brief.full_brief ? true : null,
      selection: { ...SELECTION, duration },
    });

    const auto = confirm(
      draftRow(
        { topic: 'Mèo' },
        {
          follows_voice: false,
          minutes: null,
          label: 'Tự động (~6 phút)',
          next_minutes: 3,
          next_label: '3 phút',
        },
      ),
    );
    expect(auto.text).toContain('Thời lượng: Tự động (~6 phút)');
    expect(auto).toMatchObject({
      durationButton: 'Thời lượng → 3 phút',
      durationData: `in:D:${token}`,
    });

    const voice = confirm(
      draftRow(
        { topic: 'Mèo', duration_minutes: 6, full_brief: 'VOICE\n…' },
        { follows_voice: true, voice_words: 1920, voice_minutes: 10 },
      ),
    );
    expect(voice.text).toContain('Thời lượng: theo VOICE, ước tính ~10 phút (1920 từ)');
    expect(voice.durationButton).toBe('Thời lượng: theo VOICE');

    const decimal = confirm(
      draftRow(
        { topic: 'Mèo', full_brief: 'VOICE\n…' },
        { follows_voice: true, voice_words: 1250, voice_minutes: 6.5 },
      ),
    );
    expect(decimal.text).toContain('ước tính ~6,5 phút (1250 từ)');

    const parsed = runCode('wf-06-telegram-callback.json', 'Parse callback', {
      input: [
        {
          json: {
            callback_query: {
              id: 'q9',
              data: `in:D:${token}`,
              from: { id: 111 },
              message: { message_id: 13, chat: { id: CHAT }, text: 'confirm' },
            },
          },
        },
      ],
    })[0]!.json;
    expect(parsed).toMatchObject({ kind: 'intake-set', setKind: 'duration', token });

    const refused = confirm({ result: 'FULL_BRIEF' }, parsed);
    expect(refused).toMatchObject({ edit: false, queryId: 'q9' });
    expect(refused.text).toMatch(/theo mục VOICE/);

    // A press that changes nothing (one option left) is answered, never edited: Telegram refuses
    // "message is not modified" (D-092 follow-up).
    const unchanged = confirm({ result: 'UNCHANGED' }, parsed);
    expect(unchanged).toMatchObject({ edit: false, queryId: 'q9' });
    expect(unchanged.text).toBe('Không có lựa chọn khác để đổi.');
    expect(unchanged.approve).toBeUndefined();
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
    ).toBe('Chưa tạo: invalid brief: topic must be 3-500 characters');
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

describe('WF-06 worker choice and /move (D-087)', () => {
  const CHAT = 'REPLACE_WITH_APPROVAL_CHAT_ID';
  const WF = 'wf-06-telegram-callback.json';
  const wf = workflow(WF);
  const node = (name: string) => wf.nodes.find((n) => n.name === name)!;
  const next = (name: string) => wf.connections[name]!.main.map((out) => out[0]?.node);
  const text = (value: string): Item => ({
    json: {
      message: {
        message_id: 12,
        from: { id: 111, is_bot: false },
        chat: { id: CHAT },
        text: value,
      },
    },
  });
  const parse = (item: Item) => runCode(WF, 'Parse callback', { input: [item] })[0]?.json;
  const token = 'd'.repeat(32);
  const SELECTION = {
    kit: { slug: 'whatif', label: 'Nếu bạn…', next_slug: 'science', next_label: 'Khoa học' },
    character_set: {
      slug: 'chip',
      label: 'Chíp (BẠN)',
      next_slug: 'chip',
      next_label: 'Chíp (BẠN)',
    },
    worker: { slug: 'hp-400-g7', label: 'hp-400-g7', next_slug: null, next_label: 'Tự động' },
  };
  const confirm = (selection: object) =>
    runCode(WF, 'Build confirmation', {
      input: [
        {
          json: {
            result: 'DRAFT',
            token,
            expires_at: '2026-11-02T06:00:00Z',
            brief: { topic: 'Mèo' },
            has_voice: null,
            selection,
          },
        },
      ],
      nodeOutputs: { 'Parse callback': [{ json: { chatId: CHAT, messageId: '12' } }] },
    })[0]!.json;

  test('/new takes worker= off the first line', () => {
    expect(parse(text('/new 5 Mèo nghĩ gì? worker=hp-400-g7 kit=science\nGhi chú'))).toMatchObject({
      topic: 'Mèo nghĩ gì?',
      minutes: 5,
      selection: { kit: 'science' },
      worker: 'hp-400-g7',
      error: '',
    });
    expect(parse(text('/new worker=hp-400-g7'))!.error).toMatch(/worker=<worker>/);
  });

  test('the draft passes the worker to telegram_intake_draft()', async () => {
    const parsed = parse(text('/new Mèo worker=hp-400-g7'))!;
    const [out] = await runAsyncCode(WF, 'Build draft', {
      input: [{ json: {} }],
      nodeOutputs: { 'Parse callback': [{ json: parsed }] },
    });

    expect(out!.json).toMatchObject({ worker: 'hp-400-g7' });
    expect(node('Draft').parameters.query).toBe(
      "SELECT result, token, expires_at, brief, has_voice, selection, error FROM telegram_intake_draft($1::bigint, $2, $3::jsonb, NULLIF($4, ''), $5::boolean);",
    );
    expect(
      (node('Draft').parameters.options as { queryReplacement: string }).queryReplacement,
    ).toBe('={{ [$json.userId, $json.chatId, $json.brief, $json.worker, $json.auto] }}');
  });

  test('the confirmation shows the worker and a Worker button next to Thời lượng', () => {
    const out = confirm(SELECTION);

    expect(out.text).toContain('Worker: hp-400-g7');
    expect(out).toMatchObject({ workerButton: 'Worker → Tự động', workerData: `in:W:${token}` });
    expect(confirm({ ...SELECTION, worker: undefined }).text).toContain('Worker: Tự động');
    for (const name of ['Send confirmation', 'Edit confirmation']) {
      const rows = (
        node(name).parameters.inlineKeyboard as {
          rows: {
            row: { buttons: { text: string; additionalFields: { callback_data: string } }[] };
          }[];
        }
      ).rows;
      expect(rows.at(-1)!.row.buttons).toEqual([
        {
          text: '={{ $json.workerButton }}',
          additionalFields: { callback_data: '={{ $json.workerData }}' },
        },
        {
          text: '={{ $json.durationButton }}',
          additionalFields: { callback_data: '={{ $json.durationData }}' },
        },
      ]);
    }
  });

  test('the Worker button cycles the draft like Kit / Nhân vật', () => {
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

    expect(
      runCode(WF, 'Parse callback', { input: [callback(`in:W:${token}`)] })[0]!.json,
    ).toMatchObject({
      kind: 'intake-set',
      setKind: 'worker',
      token,
    });
    expect(runCode(WF, 'Parse callback', { input: [callback(`a2:W:${token}`)] })).toEqual([]);
  });

  test('an idea draft gets the Worker button too', () => {
    expect(node('Pick idea').parameters.query).toContain(
      "selection || jsonb_build_object('worker', worker_selection(NULL)) AS selection",
    );
  });

  test.each([
    ['/move 679CD22F hp-400-g7', { prefix: '679cd22f', target: 'hp-400-g7', error: '' }],
    ['/move@aivideo_bot 679cd22f mac-mini-m4', { prefix: '679cd22f', target: 'mac-mini-m4' }],
    ['/chuyen 679cd22f hp-400-g7', { prefix: '679cd22f', target: 'hp-400-g7' }],
    ['/move 679cd22f huy', { prefix: '679cd22f', target: '' }],
    ['/move 679cd22f cancel', { prefix: '679cd22f', target: '' }],
  ])('parses %j', (command, expected) => {
    expect(parse(text(command))).toEqual({
      kind: 'move',
      userId: '111',
      chatId: CHAT,
      messageId: '12',
      error: '',
      ...expected,
    });
  });

  test.each(['/move', '/move 679cd22f', '/move 67 hp-400-g7', '/move 679cd22f hp 400'])(
    'answers %j with the usage',
    (command) => {
      expect(parse(text(command))).toMatchObject({
        kind: 'move',
        error: expect.stringMatching(/^Cách dùng: \/move/),
      });
    },
  );

  test('routes /move to telegram_move() and its reply to Send status', () => {
    expect(next('Retry?')).toEqual(['Retry', 'Auto?']);
    expect(next('Auto?')).toEqual(['Auto ok?', 'Move?']);
    expect(next('Move?')).toEqual(['Move ok?', 'Intake?']);
    expect(next('Move ok?')).toEqual(['Move', 'Build move']);
    expect(next('Move')).toEqual(['Build move']);
    expect(next('Build move')).toEqual(['Send status']);
    expect(node('Move').parameters.query).toBe(
      "SELECT * FROM telegram_move($1::bigint, video_ref($2), NULLIF($3, ''));",
    );
  });

  test('answers each result of telegram_move()', () => {
    const id = '679cd22f-d1f8-44fe-a9fd-9cdcbaa6325c';
    const reply = (row: Record<string, unknown>, parsed: Record<string, unknown> = {}) =>
      String(
        runCode(WF, 'Build move', {
          input: [{ json: row }],
          nodeOutputs: {
            'Parse callback': [
              {
                json: {
                  kind: 'move',
                  prefix: '679cd22f',
                  target: 'hp-400-g7',
                  chatId: CHAT,
                  messageId: '12',
                  error: '',
                  ...parsed,
                },
              },
            ],
          },
        })[0]!.json.text,
      );
    const row = { video_id: id, from_worker: 'mac-mini-m4', to_worker: 'hp-400-g7' };

    expect(reply({ ...row, result: 'REQUESTED', busy: false })).toBe(
      'Đang chuyển video 679cd22f từ mac-mini-m4 sang hp-400-g7: hp-400-g7 sẽ copy file từ mac-mini-m4 khi rảnh. Video tạm dừng trong lúc chuyển; có thông báo khi xong. Hủy: /move_679cd22f_huy',
    );
    expect(reply({ ...row, result: 'REQUESTED', busy: true })).toMatch(
      /^Sẽ chuyển video 679cd22f từ mac-mini-m4 sang hp-400-g7 khi bước đang chạy xong/,
    );
    expect(reply({ ...row, from_worker: null, result: 'PINNED' })).toBe(
      'Video 679cd22f chưa chạy bước nào trên worker nào; đã ghim sang hp-400-g7.',
    );
    expect(reply({ ...row, result: 'CANCELLED' })).toBe(
      'Đã hủy chuyển video 679cd22f; video ở lại mac-mini-m4.',
    );
    expect(reply({ result: 'NOT_OWNER' })).toBe('Chỉ owner mới chuyển được video giữa các worker.');
    expect(reply({ result: 'NOT_FOUND' })).toBe('Không có video nào có id bắt đầu bằng 679cd22f.');
    expect(reply({ result: 'AMBIGUOUS' })).toMatch(/gõ thêm ký tự/);
    expect(reply({ ...row, result: 'FINISHED' })).toMatch(/679cd22f đã kết thúc/);
    expect(reply({ ...row, result: 'ALREADY_MOVING' })).toMatch(
      /đang được chuyển từ mac-mini-m4 sang hp-400-g7/,
    );
    expect(reply({ ...row, result: 'NOT_MOVING' })).toMatch(/không có lệnh chuyển nào đang chờ/);
    expect(reply({ ...row, result: 'COPYING' })).toMatch(
      /đang được copy sang hp-400-g7; không hủy được nữa/,
    );
    expect(reply({ ...row, to_worker: 'raspberry', result: 'UNKNOWN_WORKER' })).toBe(
      'Không có worker raspberry. Danh sách: /workers',
    );
    expect(reply({ ...row, result: 'SAME_WORKER' })).toMatch(/đã ở hp-400-g7 rồi/);
    expect(reply({ ...row, result: 'TARGET_OFFLINE' })).toMatch(/hp-400-g7 đang offline/);
    expect(reply({ ...row, result: 'SOURCE_OFFLINE' })).toMatch(
      /mac-mini-m4 \(đang giữ file của video 679cd22f\) đang offline/,
    );
    expect(reply({}, { error: 'Cách dùng: /move x' })).toBe('Cách dùng: /move x');
  });

  test('/workers lists the moves from or to each worker', () => {
    const out = runCode(WF, 'Build status', {
      input: [
        {
          json: {
            allowed: true,
            worker_id: 'hp-400-g7',
            online: true,
            last_seen_at: new Date().toISOString(),
            jobs: [],
            waiting: 0,
            moves: [
              {
                video_id: '679cd22f-d1f8-44fe-a9fd-9cdcbaa6325c',
                from_worker: 'mac-mini-m4',
                to_worker: 'hp-400-g7',
                status: 'COPYING',
                attempts: 2,
              },
            ],
          },
        },
      ],
      nodeOutputs: {
        'Parse callback': [{ json: { kind: 'workers', chatId: '-100', messageId: '7' } }],
      },
    })[0]!.json as { text: string };

    expect(out.text).toContain('↪ /v_679cd22f: mac-mini-m4 → hp-400-g7 · đang copy (lần 2)');
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
      'Đã thêm quy tắc #7 (TTS). Áp dụng cho các bước bắt đầu từ bây giờ.',
    );
    expect(answer({ result: 'NOT_FOUND', detail: '9' }, { action: 'DELETE', text: '9' }).text).toBe(
      'Không có quy tắc #9.',
    );
    expect(
      answer({ result: 'INVALID', detail: 'scope must be video or tts' }, { action: 'ADD' }).text,
    ).toBe('Chưa thay đổi: scope must be video or tts');
    expect(answer({ result: 'NOT_APPROVER' }, {}).text).toBe('Bạn không phải approver.');
    expect(answer({ result: 'OK', rules }, { action: 'SET', scope: 'pronunciation' }).text).toBe(
      'Đã thay toàn bộ quy tắc phát âm: giờ có 1 mục. Áp dụng cho các bước bắt đầu từ bây giờ.',
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

describe('WF-06 /brief (D-077)', () => {
  const CHAT = 'REPLACE_WITH_APPROVAL_CHAT_ID';
  const PROMPT_FILE = fileURLToPath(new URL('../../../docs/brief-prompt.md', import.meta.url));
  const message = (text: string, chat: string | number = CHAT): Item => ({
    json: {
      message: { message_id: 41, from: { id: 111, is_bot: false }, chat: { id: chat }, text },
    },
  });
  const parse = (item: Item) =>
    runCode('wf-06-telegram-callback.json', 'Parse callback', { input: [item] })[0]?.json;
  const document = (parsed: Record<string, unknown>, prepared: unknown[] = []) =>
    runAsyncCode('wf-06-telegram-callback.json', 'Brief document', {
      nodeOutputs: { 'Parse callback': [{ json: parsed }] },
      helpers: {
        prepareBinaryData: async (...args: never[]) => {
          prepared.push(args);
          return { fileName: 'brief-prompt.md' };
        },
      },
    });

  test.each(['/brief', '/brief@aivideo_bot', '/brief  '])('%s in the approval chat', (text) => {
    expect(parse(message(text))).toEqual({
      kind: 'brief',
      chatId: CHAT,
      messageId: '41',
      error: '',
    });
  });

  test('refuses other chats', () => {
    expect(parse(message('/brief', -5))).toMatchObject({
      kind: 'brief',
      error: expect.stringContaining('không phải chat duyệt'),
    });
  });

  test.each(['/briefx', '/brief foo'])('ignores %s', (text) => {
    expect(parse(message(text))?.kind).not.toBe('brief');
  });

  test('sends docs/brief-prompt.md as a Markdown file', async () => {
    const prepared: unknown[] = [];
    const [out] = await document(
      { kind: 'brief', chatId: CHAT, messageId: '41', error: '' },
      prepared,
    );
    const [buffer, fileName, mime] = prepared[0] as [Buffer, string, string];
    expect(fileName).toBe('brief-prompt.md');
    expect(mime).toBe('text/markdown');
    expect(
      buffer.toString('utf8'),
      'docs/brief-prompt.md changed: run node ops/n8n/embed-brief-prompt.mjs',
    ).toBe(readFileSync(PROMPT_FILE, 'utf8'));
    expect(out).toMatchObject({
      json: { ok: true, chatId: CHAT, messageId: '41', caption: expect.stringContaining('/new') },
      binary: { data: { fileName: 'brief-prompt.md' } },
    });
  });

  test('a refusal becomes a reply', async () => {
    const [out] = await document({ kind: 'brief', chatId: '-5', messageId: '41', error: 'không' });
    expect(out).toEqual({ json: { ok: false, chatId: '-5', messageId: '41', text: 'không' } });
  });

  test('the prompt fits a full brief and names every section', () => {
    const prompt = readFileSync(PROMPT_FILE, 'utf8');
    expect(prompt.length).toBeLessThan(30_000);
    for (const marker of ['VOICE', '=== DANH SÁCH SHOT', '=== NHÂN VẬT ===', 'MỐC', 'INPUT']) {
      expect(prompt).toContain(marker);
    }
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
      'Approver (2)\n★ owner (id 111) · chủ sở hữu\n- An (id 222)\n\nChủ sở hữu có thể gỡ một người bằng /revoke <user id>.',
    );
    expect(answer({ result: 'NOT_OWNER' }).text).toBe('Chỉ chủ sở hữu mới làm được việc này.');
    expect(answer({ result: 'ALREADY_REQUESTED' }).text).toMatch(/đang chờ chủ sở hữu/);
    expect(answer({ result: 'OK', detail: '222', members }, { action: 'REVOKE' }).text).toMatch(
      /^222 không còn là approver\./,
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

describe('WF-15 Voice Approval Request (A1b, D-071)', () => {
  const token = 'b'.repeat(32);
  const row = {
    kind: 'REQUEST',
    video_id: '12345678-aaaa-bbbb-cccc-000000000000',
    version: 2,
    token,
    expires_at: '2026-10-29T10:00:00.000Z',
    take: 1,
    title: 'Bíp ơi, tại sao nước sôi?',
    voice: {
      file: { job_id: '87654321-aaaa-bbbb-cccc-000000000000', token: 'c'.repeat(32) },
      seconds: 125.4,
      max_takes: 3,
      retake_cost: { amount: 2817, currency: 'CRD' },
    },
  };
  const file = 'wf-15-voice-approval.json';

  test('polls voice_approvals_due() and sends the voice, then the buttons', () => {
    const wf = workflow(file);
    const due = wf.nodes.find((n) => n.name === 'Due voices')!;
    expect(due.parameters.query).toContain('FROM voice_approvals_due()');
    expect(wf.connections['Due voices']!.main[0]!.map((c) => c.node)).toEqual([
      'Build audio',
      'Build message',
      'Build auto note',
    ]);
    expect(wf.nodes.find((n) => n.name === 'Send audio')!.parameters.operation).toBe('sendAudio');
    const buttons = JSON.stringify(wf.nodes.find((n) => n.name === 'Send buttons')!.parameters);
    expect(buttons).toContain('Duyệt');
    expect(buttons).toContain('Từ chối');
    expect(buttons).toContain('$json.retakeLabel');
  });

  test('fetches voice.m4a of a new request with the media token', () => {
    const out = runCode(file, 'Build audio', {
      input: [
        { json: row },
        { json: { ...row, kind: 'REMINDER', voice: { ...row.voice, file: null } } },
      ],
    });
    expect(out.map((item) => item.json)).toEqual([
      {
        url: `REPLACE_WITH_WORKER_URL/media/${row.video_id}/2/${row.voice.file.job_id}/voice.m4a?t=${'c'.repeat(32)}`,
        caption: '🎙 #12345678 v2 · giọng đọc lần 1/3',
      },
    ]);
  });

  test('asks to approve the voice, with the cost of one more take and buttons under 64 bytes', () => {
    const [out] = runCode(file, 'Build message', { input: [{ json: row }] });
    const html = out!.json.html as string;

    expect(html).toContain('<b>🎙 Duyệt giọng đọc</b> · bước 2/5 · A1b');
    expect(html).toContain('#12345678 v2 · lần 1/3 · 2:05');
    expect(html).toContain('«Bíp ơi, tại sao nước sôi?»');
    expect(html).toMatch(/Đọc lại.*2817 CRD/);
    expect(html).toContain('⏰ Hạn 17:00 29/10');
    expect(out!.json.retakeLabel).toBe('Đọc lại (~2817 CRD)');
    expect(out!.json).toMatchObject({
      approve: `a1b:A:${token}`,
      retake: `a1b:G:${token}`,
      reject: `a1b:R:${token}`,
    });
    for (const key of ['approve', 'retake', 'reject']) {
      expect(Buffer.byteLength(out!.json[key] as string)).toBeLessThanOrEqual(64);
    }
  });

  test('says when no take is left, and reminds', () => {
    const last = { ...row, kind: 'REMINDER', take: 3, voice: { ...row.voice, retake_cost: null } };
    const [out] = runCode(file, 'Build message', { input: [{ json: last }] });
    expect(out!.json.html).toContain('<b>⏰ Nhắc: 🎙 Duyệt giọng đọc</b>');
    expect(out!.json.html).toContain('lần 3/3');
    expect(out!.json.retakeLabel).toBe('Đọc lại (hết lượt)');
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
      caption: '👀 #679cd22f v1 · preview 720p',
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
    const html = out!.json.html as string;

    expect(html).toContain('<b>👀 Duyệt preview</b> · bước 4/5 · A2');
    expect(html).toContain('#679cd22f v1 · vòng 1/4 · 2:59');
    expect(html).toContain('QA WARN · chi phí 2817 CRD');
    expect(html).toContain('⚠️ khung hình đen: 0:42.0–0:43.2');
    expect(html).not.toContain('định dạng');
    expect(html).toMatch(/render bản cuối 1080p/);
    expect(html.startsWith(`<a href="https://t.me/?ref=${token}">\u200d</a>`)).toBe(true);
    expect(out!.json.approve).toBe(`a2:A:${token}`);
    expect(out!.json.reject).toBe(`a2:R:${token}`);
    for (const key of ['approve', 'reject']) {
      expect(Buffer.byteLength(out!.json[key] as string)).toBeLessThanOrEqual(64);
    }
  });

  test('sends an A2 approved by Render final as information, without buttons (D-076)', () => {
    const auto = { json: { ...row, kind: 'AUTO', media: { ...row.media, level: 'PASS' } } };
    const [video] = runCode('wf-13-preview-approval.json', 'Build video', { input: [auto] });
    expect(video!.json.caption).toBe(
      '👀 #679cd22f v1 · preview 720p · ✔️ tự duyệt: đang render bản cuối 1080p',
    );
    expect(runCode('wf-13-preview-approval.json', 'Build message', { input: [auto] })).toEqual([]);
  });

  test('reminds without the report', () => {
    const [out] = runCode('wf-13-preview-approval.json', 'Build message', {
      input: [{ json: { ...row, kind: 'REMINDER', media: null, cost: null } }],
    });
    expect(out!.json.html).toContain('<b>⏰ Nhắc: 👀 Duyệt preview</b>');
    expect(out!.json.html).not.toContain('chi phí');
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

  test('sends an A3 approved by Render final as the thumbnail with its metadata (D-076)', () => {
    const auto = { json: { ...row, kind: 'AUTO' } };
    const [thumbnail] = runCode('wf-14-final-delivery.json', 'Build thumbnail', { input: [auto] });
    expect(thumbnail!.json.url).toContain('/thumbnail.jpg?t=');
    expect(thumbnail!.json.caption).toBe(
      [
        '🏷 #679cd22f v1 · ✔️ metadata tự duyệt: đang lưu lên Google Drive',
        '«Nếu bạn nghe được suy nghĩ của mèo?»',
        'Tag: mèo, nếu bạn',
        'Con mèo nhà bạn đang nghĩ gì?',
      ].join('\n'),
    );
    const long = {
      json: { ...row, kind: 'AUTO', metadata: { ...row.metadata, description: 'x'.repeat(5000) } },
    };
    const [capped] = runCode('wf-14-final-delivery.json', 'Build thumbnail', { input: [long] });
    expect((capped!.json.caption as string).length).toBe(1024);
    expect(runCode('wf-14-final-delivery.json', 'Build message', { input: [auto] })).toEqual([]);
  });

  test('asks for A3 with the metadata, QA warnings, Duyệt and Viết lại', () => {
    const [out] = runCode('wf-14-final-delivery.json', 'Build message', { input: [{ json: row }] });
    const html = out!.json.html as string;
    expect(html).toContain('<b>🏷 Duyệt metadata</b> · bước 5/5 · A3 lần 1');
    expect(html).toContain('«Nếu bạn nghe được suy nghĩ của mèo?»');
    expect(html).toContain('<blockquote expandable>Con mèo nhà bạn đang nghĩ gì?</blockquote>');
    expect(html).toContain('Tag: mèo, nếu bạn');
    expect(html).toContain('⚠️ im lặng: 2:50.0–2:58.6');
    expect(html.startsWith(`<a href="https://t.me/?meta=${token}">\u200d</a>`)).toBe(true);
    const [reminder] = runCode('wf-14-final-delivery.json', 'Build message', {
      input: [{ json: { ...row, kind: 'REMINDER' } }],
    });
    expect(reminder!.json.html).toContain('<b>⏰ Nhắc: 🏷 Duyệt metadata</b>');
    expect(reminder!.json.html).not.toContain('blockquote');
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
    expect(text).toContain('✅ Video hoàn tất');
    expect(text).toContain(`📦 Google Drive (đã kiểm tra checksum): 2026/10/${row.video_id}/v1`);
    expect(text).toContain('18 file · 100.0 MB · chi phí 2817 CRD · agent 42.5 phút');
    expect(text).toContain('🎬 Video final đã gửi trước khi lưu Drive');
    expect(text).toContain('🗑 Xóa bản trên Mac (0.92 GB)?');
    expect(out!.json).toMatchObject({ approve: `cl:A:${token}`, reject: `cl:R:${token}` });
    expect(
      runCode('wf-14-final-delivery.json', 'Build message', {
        input: [{ json: { ...row, kind: 'DONE' } }],
      }),
    ).toEqual([]);
  });

  test('sends final.mp4 with the first A3, before the archive; a failed upload never stops it (D-093)', () => {
    const file = 'wf-14-final-delivery.json';
    const wf = workflow(file);
    expect(wf.connections['Due finals']!.main[0]!.map((c) => c.node)).toContain('Build final');
    expect(wf.connections['Build final']!.main[0]!.map((c) => c.node)).toEqual(['Fetch final']);
    expect(wf.connections['Fetch final']!.main[0]!.map((c) => c.node)).toEqual(['Send final']);
    const node = (name: string) =>
      wf.nodes.find((n) => n.name === name)! as WorkflowNode & {
        position: [number, number];
        onError?: string;
      };
    expect(node('Send final').parameters).toMatchObject({
      operation: 'sendVideo',
      binaryData: true,
    });
    // executionOrder v1 runs sibling branches top to bottom: thumbnail, video, then the A3 buttons.
    expect(node('Build thumbnail').position[1]).toBeLessThan(node('Build final').position[1]);
    expect(node('Build final').position[1]).toBeLessThan(node('Build message').position[1]);
    // The A3 row comes back once; an upload error must not lose its buttons.
    expect(node('Fetch final').onError).toBe('continueRegularOutput');
    expect(node('Send final').onError).toBe('continueRegularOutput');

    const final = { job_id: '11111111-aaaa-bbbb-cccc-000000000000', token: 'd'.repeat(32) };
    const first = { ...row, metadata: { ...row.metadata, final } };
    const [out, auto, ...rest] = runCode(file, 'Build final', {
      input: [
        { json: first },
        { json: { ...first, kind: 'AUTO' } },
        { json: { ...row, round: 2 } },
        { json: { ...first, kind: 'REMINDER' } },
        { json: { ...row, kind: 'DONE', report: { path: 'x', final } } },
      ],
    });
    expect(rest).toEqual([]);
    expect(auto!.json.url).toContain('/final.mp4?t=');
    expect(out!.json).toEqual({
      url: `REPLACE_WITH_WORKER_URL/media/${row.video_id}/1/${final.job_id}/final.mp4?t=${final.token}`,
      caption: '🎬 #679cd22f v1 · final 1080p',
    });
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

describe("media URLs follow the video's worker (D-074)", () => {
  const videoId = '12345678-aaaa-bbbb-cccc-000000000000';
  const file = { job_id: '87654321-aaaa-bbbb-cccc-000000000000', token: 'c'.repeat(32) };
  const request = { kind: 'REQUEST', video_id: videoId, version: 1, take: 1 };
  const cases: { file: string; query: string; node: string; row: Record<string, unknown> }[] = [
    {
      file: 'wf-05-script-approval.json',
      query: 'Due approvals',
      node: 'Build file',
      row: { ...request, script: { file } },
    },
    {
      file: 'wf-12-storyboard-approval.json',
      query: 'Due storyboards',
      node: 'Build pages',
      row: { ...request, board: { ...file, pages: ['b/page-01.jpg'] } },
    },
    {
      file: 'wf-12-storyboard-approval.json',
      query: 'Due storyboards',
      node: 'Build mix',
      row: { ...request, board: { ...file, mix_token: file.token } },
    },
    {
      file: 'wf-13-preview-approval.json',
      query: 'Due previews',
      node: 'Build video',
      row: { ...request, media: file },
    },
    {
      file: 'wf-14-final-delivery.json',
      query: 'Due finals',
      node: 'Build thumbnail',
      row: { ...request, metadata: { ...file, thumbnail_shot: 1 } },
    },
    {
      file: 'wf-14-final-delivery.json',
      query: 'Due finals',
      node: 'Build final',
      row: { ...request, metadata: { ...file, final: file } },
    },
    {
      file: 'wf-15-voice-approval.json',
      query: 'Due voices',
      node: 'Build audio',
      row: { ...request, voice: { file, max_takes: 3 } },
    },
  ];

  test.each(cases)('$file $node uses worker_url, else the deployed WORKER_URL', (c) => {
    const query = workflow(c.file).nodes.find((n) => n.name === c.query)!.parameters.query;
    expect(query).toContain('video_worker_url(video_id) AS worker_url');

    const pinned = runCode(c.file, c.node, {
      input: [{ json: { ...c.row, worker_url: 'http://100.64.0.9:8787' } }],
    });
    const unpinned = runCode(c.file, c.node, { input: [{ json: { ...c.row, worker_url: null } }] });

    expect(pinned).toHaveLength(1);
    expect(pinned[0]!.json.url).toMatch(/^http:\/\/100\.64\.0\.9:8787\/(media|boards)\//);
    expect(unpinned[0]!.json.url).toMatch(/^REPLACE_WITH_WORKER_URL\/(media|boards)\//);
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
      'Video abcdef12 v1 cần bạn quyết định: bước script lỗi: Error: script does not match the schema\nChạy lại: /retry_abcdef12 · Chi tiết: /v_abcdef12',
    );
    expect(run([failed])).toEqual([]);
  });

  test('alerts only when the set of blocked videos changes', () => {
    const staticData = {};
    const run = (blocked: string[]) =>
      runCode('wf-08-watchdog.json', 'Build alert', { input: [summary(blocked)], staticData });

    expect(run([])).toEqual([]);
    expect(run(['12345678-0000-0000-0000-000000000000'])[0]!.json.text).toContain(
      'bị chặn do giới hạn nhà cung cấp (đang chờ, không tự đổi nhà cung cấp): /v_12345678',
    );
    expect(run(['12345678-0000-0000-0000-000000000000'])).toEqual([]);
    expect(run([])[0]!.json.text).toContain('Không còn video nào bị');
  });

  test('alerts when videos wait on an offline pinned worker, once per change (D-074)', () => {
    const staticData = {};
    const run = (stalled: object[]) =>
      runCode('wf-08-watchdog.json', 'Build alert', {
        input: [{ json: { summary: { ...summary([]).json.summary, stalled_pinned: stalled } } }],
        staticData,
      });
    const stalled = [{ video_id: 'abcdef12-0000-0000-0000-000000000000', worker_id: 'hp-400-g7' }];

    expect(run(stalled)[0]!.json.text).toContain(
      'Video đang chờ worker mất kết nối (file nằm trên máy đó): /v_abcdef12 (hp-400-g7)',
    );
    expect(run(stalled)).toEqual([]);
    expect(run([])[0]!.json.text).toContain('Không còn video nào chờ worker mất kết nối');
  });

  test('announces finished and failed moves (D-087)', () => {
    const out = runCode('wf-08-watchdog.json', 'Build alert', {
      input: [
        {
          json: {
            summary: {
              ...summary([]).json.summary,
              moves: [
                {
                  video_id: 'abcdef12-0000-0000-0000-000000000000',
                  status: 'DONE',
                  from_worker: 'mac-mini-m4',
                  to_worker: 'hp-400-g7',
                  attempts: 1,
                },
                {
                  video_id: '12345678-0000-0000-0000-000000000000',
                  status: 'FAILED',
                  from_worker: 'mac-mini-m4',
                  to_worker: 'hp-400-g7',
                  attempts: 3,
                  error: 'VideoImportError: x',
                },
              ],
            },
          },
        },
      ],
      staticData: {},
    });

    expect(out[0]!.json.text).toContain('Đã chuyển video abcdef12 từ mac-mini-m4 sang hp-400-g7.');
    expect(out[0]!.json.text).toContain(
      'Chuyển video 12345678 từ mac-mini-m4 sang hp-400-g7 thất bại sau 3 lần: VideoImportError: x. Video ở lại mac-mini-m4.',
    );
  });

  test('suggests /move for videos stalled on an offline worker (D-087)', () => {
    const out = runCode('wf-08-watchdog.json', 'Build alert', {
      input: [
        {
          json: {
            summary: {
              ...summary([]).json.summary,
              stalled_pinned: [
                { video_id: 'abcdef12-0000-0000-0000-000000000000', worker_id: 'hp-400-g7' },
              ],
            },
          },
        },
      ],
      staticData: {},
    });

    expect(out[0]!.json.text).toContain('/move <id> <worker>');
  });

  test('state saved before D-102 does not alert again when the links are added', () => {
    const blocked = '12345678-0000-0000-0000-000000000000';
    const staticData = {
      lastBlocked: '12345678',
      lastStalled: 'abcdef12 (hp-400-g7)',
      lastDecisions: ['Video abcdef12 v1 cần bạn quyết định: bước script lỗi: boom'],
    };
    const out = runCode('wf-08-watchdog.json', 'Build alert', {
      input: [
        {
          json: {
            summary: {
              ...summary([blocked]).json.summary,
              stalled_pinned: [
                { video_id: 'abcdef12-0000-0000-0000-000000000000', worker_id: 'hp-400-g7' },
              ],
              needs_decision: [
                {
                  video_id: 'abcdef12-0000-0000-0000-000000000000',
                  version: 1,
                  step: 'script',
                  error: 'boom',
                },
              ],
            },
          },
        },
      ],
      staticData,
    });

    expect(out).toEqual([]);
  });
});

describe('WF-06 one-tap commands (D-102)', () => {
  const command = (text: string): Item => ({
    json: {
      message: { message_id: 7, from: { id: 111, is_bot: false }, chat: { id: -100 }, text },
    },
  });
  const parse = (text: string) =>
    runCode('wf-06-telegram-callback.json', 'Parse callback', { input: [command(text)] })[0]!.json;

  test.each([
    ['/v_679cd22f', '/v 679cd22f'],
    ['/v_679cd22f@aivideo_bot', '/v@aivideo_bot 679cd22f'],
    ['/status_679cd22f', '/status 679cd22f'],
    ['/retry_679cd22f', '/retry 679cd22f'],
    ['/retry_679CD22F@aivideo_bot', '/retry@aivideo_bot 679CD22F'],
    ['/pending_679cd22f', '/pending 679cd22f'],
    ['/auto_679cd22f_off', '/auto 679cd22f off'],
    ['/move_679cd22f_huy', '/move 679cd22f huy'],
    ['/worker_hp_400_g7', '/worker hp-400-g7'],
    ['/worker_mac_mini_m4_02@aivideo_bot', '/worker@aivideo_bot mac-mini-m4-02'],
  ])('%j runs the same as %j', (tap, typed) => {
    expect(parse(tap)).toEqual(parse(typed));
    expect(parse(tap).kind).not.toBe('help');
  });

  test.each([
    ['/auto_679cd22f', 'auto_679cd22f'],
    ['/cancel_679cd22f', 'cancel_679cd22f'],
    ['/huy_679cd22f', 'huy_679cd22f'],
    ['/move_679cd22f_hp_400_g7', 'move_679cd22f_hp_400_g7'],
    ['/retry_zzzz', 'retry_zzzz'],
    ['/retry_679', 'retry_679'],
    ['/v_', 'v_'],
    ['/unknown_679cd22f', 'unknown_679cd22f'],
  ])('%j has no tap form and gets the unknown command reply', (text, topic) => {
    expect(parse(text)).toMatchObject({ kind: 'help', mode: 'bad', topic });
  });

  test('a tap keeps the sender, so the same permission checks apply', () => {
    expect(parse('/retry_679cd22f')).toMatchObject({ kind: 'retry', userId: '111' });
  });

  test('every suggested video command is tappable: no id after a space', () => {
    const typed = /\/(?:retry|status|v|pending|auto|move) \$\{/;
    for (const [file, wf] of workflows) {
      for (const node of wf.nodes) {
        const code = String(node.parameters.jsCode ?? '');
        expect(typed.test(code), `${file} / ${node.name}`).toBe(false);
      }
    }
  });

  test('every tap form fits a Telegram command (32 characters, no hyphen)', () => {
    for (const worker of ['mac-mini-m4', 'mac-mini-m4-02', 'hp-400-g7']) {
      const out = runCode('wf-06-telegram-callback.json', 'Build status', {
        input: [{ json: { allowed: true, worker_id: worker, online: true, jobs: [], waiting: 0 } }],
        nodeOutputs: {
          'Parse callback': [{ json: { kind: 'workers', chatId: '-100', messageId: '7' } }],
        },
      })[0]!.json as { text: string };
      expect(out.text).toMatch(/\/worker_[a-z0-9_]{1,25}(\s|$)/);
    }
    expect('auto_679cd22f_off'.length).toBeLessThanOrEqual(32);
  });

  test('Build move suggests the tap form to cancel', () => {
    const reply = (row: Record<string, unknown>) =>
      (
        runCode('wf-06-telegram-callback.json', 'Build move', {
          input: [{ json: row }],
          nodeOutputs: {
            'Parse callback': [
              { json: { kind: 'move', prefix: '679cd22f', chatId: '-100', messageId: '7' } },
            ],
          },
        })[0]!.json as { text: string }
      ).text;
    const row = {
      video_id: '679cd22f-d1f8-44fe-a9fd-9cdcbaa6325c',
      from_worker: 'mac-mini-m4',
      to_worker: 'hp-400-g7',
    };
    expect(reply({ ...row, result: 'ALREADY_MOVING' })).toContain('Hủy: /move_679cd22f_huy');
  });

  test('a video created from a draft links its card in the edited message', () => {
    const out = runCode('wf-06-telegram-callback.json', 'Build reply', {
      input: [
        {
          json: {
            result: 'OK',
            video_id: '302209bf-d1f8-44fe-a9fd-9cdcbaa6325c',
          },
        },
      ],
      nodeOutputs: {
        'Parse callback': [
          {
            json: {
              kind: 'button',
              approval: 'intake',
              action: 'APPROVE',
              chatId: '-100',
              messageId: '7',
              queryId: 'q',
              messageText: 'Nháp',
            },
          },
        ],
      },
    })[0]!.json as { answer: string; editedHtml: string };
    expect(out.answer).toBe(
      'Đã tạo video 302209bf: đang viết kịch bản, yêu cầu duyệt A1 sẽ đến sau.',
    );
    expect(out.editedHtml).toContain('/v_302209bf');
  });
});

describe('WF-06 /status groups and /worker detail (D-102)', () => {
  const WF = 'wf-06-telegram-callback.json';
  const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
  const build = (rows: Record<string, unknown>[], parsed: Record<string, unknown>) =>
    (
      runCode(WF, 'Build status', {
        input: rows.map((json) => ({ json })),
        nodeOutputs: {
          'Parse callback': [{ json: { chatId: '-100', messageId: '7', ...parsed } }],
        },
      })[0]!.json as { text: string }
    ).text;
  const base = {
    allowed: true,
    video_id: '679cd22f-d1f8-44fe-a9fd-9cdcbaa6325c',
    version: 2,
    title: 'Vì sao trời xanh',
    status: 'GENERATING_ASSETS',
    status_since: minutesAgo(30),
    step: 'render_episode',
    step_status: 'RUNNING',
    step_since: minutesAgo(12),
    progress: null,
    steps_done: 7,
    steps_total: 11,
    approval: null,
    cost: {},
    jobs: null,
    worker_id: 'mac-mini-m4-02',
    worker_online: true,
    state_group: 'RUNNING',
    total: 4,
  };
  const video = (id: string, over: Record<string, unknown>) => ({
    ...base,
    video_id: `${id}-d1f8-44fe-a9fd-9cdcbaa6325c`,
    ...over,
  });
  const list = [
    video('679cd22f', {
      status: 'NEEDS_DECISION',
      step: 'episode_code',
      step_status: 'FAILED_PERMANENT',
      worker_id: 'hp-400-g7',
      state_group: 'STOPPED',
    }),
    video('b10cced0', {
      status: 'BLOCKED_PROVIDER',
      step: 'tts',
      step_status: 'BLOCKED',
      worker_id: 'mac-mini-m4',
      worker_online: false,
      state_group: 'STOPPED',
    }),
    video('a1b2c3d4', {
      version: 1,
      title: 'Nếu Mặt Trăng biến mất',
      approval: 'A2 until 2026-11-05 07:30 UTC',
      worker_id: 'mac-mini-m4',
      state_group: 'APPROVAL',
    }),
    video('0f9e8d7c', { version: 1, title: 'Lỗ đen', state_group: 'RUNNING' }),
    video('55556666', {
      version: 1,
      title: 'Chưa chạy',
      step: 'script',
      step_status: 'READY',
      steps_done: 0,
      worker_id: null,
      worker_online: null,
      state_group: 'WAITING',
    }),
  ];

  test('groups the list, most urgent first, and hides empty groups', () => {
    const text = build(
      list.map((row) => ({ ...row, total: list.length })),
      { kind: 'status', prefix: '' },
    );

    expect(text).toBe(
      [
        '📊 5 video · ⛔ 2 dừng · ⏳ 1 chờ duyệt · ▶ 1 chạy · 🕒 1 chờ',
        '',
        '⛔ CẦN XỬ LÝ',
        '/v_679cd22f v2 · Vì sao trời xanh',
        '🖥 hp-400-g7 · NEEDS_DECISION',
        '✗ episode_code · /retry_679cd22f',
        '/v_b10cced0 v2 · Vì sao trời xanh',
        '🖥 mac-mini-m4 🔴 · BLOCKED_PROVIDER',
        '⏸ tts',
        '',
        '⏳ CHỜ DUYỆT',
        '/v_a1b2c3d4 v1 · Nếu Mặt Trăng biến mất',
        '🖥 mac-mini-m4 · A2, hạn 14:30 05/11',
        '',
        '▶ ĐANG CHẠY',
        '/v_0f9e8d7c v1 · Lỗ đen',
        '🖥 mac-mini-m4-02 · render_episode 12 phút · 7/11 job',
        '',
        '🕒 ĐANG CHỜ',
        '/v_55556666 v1 · Chưa chạy',
        '🖥 chưa gán · GENERATING_ASSETS · script ready 12 phút · 0/11 job',
      ].join('\n'),
    );
  });

  test('omits empty groups from the header and the body', () => {
    const text = build(
      [list[3]!].map((row) => ({ ...row, total: 1 })),
      {
        kind: 'status',
        prefix: '',
      },
    );
    expect(text.split('\n')[0]).toBe('📊 1 video · ▶ 1 chạy');
    expect(text).not.toContain('CẦN XỬ LÝ');
  });

  test('says how many are hidden when the list is cut', () => {
    const text = build([{ ...list[3]!, total: 27 }], { kind: 'status', prefix: '' });
    expect(text.split('\n')[0]).toBe('📊 hiện 1/27 video · ▶ 1 chạy');
  });

  test('cuts long titles in the list but not in the detail', () => {
    const title = 'Một tiêu đề rất dài '.repeat(5);
    const row = { ...list[3]!, title, total: 1 };
    expect(build([row], { kind: 'status', prefix: '' })).toContain(`${title.slice(0, 40)}…`);
    expect(build([row], { kind: 'status', prefix: '0f9e8d7c' })).toContain(title);
  });

  test('the detail shows an offline or missing worker', () => {
    expect(build([{ ...list[1]! }], { kind: 'status', prefix: 'b10cced0' })).toContain(
      '🖥 Worker: /worker_mac_mini_m4 🔴',
    );
    expect(build([{ ...list[4]! }], { kind: 'status', prefix: '55556666' })).toContain(
      '🖥 Worker: chưa gán',
    );
  });

  test('/pending links stopped videos, with /retry only where it can work', () => {
    const text = build(
      [
        {
          allowed: true,
          video_id: list[0]!.video_id,
          version: 2,
          title: 'A',
          type: 'NEEDS_DECISION',
        },
        {
          allowed: true,
          video_id: list[1]!.video_id,
          version: 2,
          title: 'B',
          type: 'BLOCKED_PROVIDER',
        },
      ],
      { kind: 'pending', prefix: '' },
    );
    expect(text).toContain('/v_679cd22f v2 · A · NEEDS_DECISION · chạy lại: /retry_679cd22f');
    expect(text).toContain('/v_b10cced0 v2 · B · BLOCKED_PROVIDER');
    expect(text).not.toContain('/retry_b10cced0');
  });

  test('routes /worker <id> to telegram_worker_detail() and its reply to Build status', () => {
    const wf = workflow(WF);
    const node = wf.nodes.find((n) => n.name === 'Worker detail')!;
    expect(node.parameters.query).toBe('SELECT * FROM telegram_worker_detail($1::bigint, $2);');
    expect(node.parameters.options).toEqual({
      queryReplacement: '={{ [$json.userId, $json.worker] }}',
    });
    expect(wf.connections['Worker detail?']!.main[0]).toEqual([
      expect.objectContaining({ node: 'Worker detail' }),
    ]);
    expect(wf.connections['Worker detail']!.main[0]).toEqual([
      expect.objectContaining({ node: 'Build status' }),
    ]);
  });

  test.each([
    ['/worker hp-400-g7', 'hp-400-g7'],
    ['/workers HP-400-G7', 'hp-400-g7'],
    ['/worker@aivideo_bot mac-mini-m4-02', 'mac-mini-m4-02'],
  ])('parses %j as worker detail', (text, worker) => {
    const out = runCode(WF, 'Parse callback', {
      input: [
        {
          json: {
            message: { message_id: 7, from: { id: 111, is_bot: false }, chat: { id: -100 }, text },
          },
        },
      ],
    })[0]!.json;
    expect(out).toEqual({
      kind: 'worker',
      worker,
      userId: '111',
      chatId: '-100',
      messageId: '7',
    });
  });

  const workerRow = {
    allowed: true,
    worker_id: 'hp-400-g7',
    online: true,
    last_seen_at: '2026-11-05T07:30:00Z',
    last_idle_at: '2026-11-05T07:02:00Z',
    capabilities: ['q:render', 'q:light'],
    jobs: [
      {
        video_id: '679cd22f-d1f8-44fe-a9fd-9cdcbaa6325c',
        version: 2,
        title: 'Vì sao trời xanh',
        video_status: 'GENERATING_ASSETS',
        step: 'render_episode',
        attempts: 1,
        started: minutesAgo(12),
        progress: { stage: 'render', frames: 5400 },
      },
    ],
    waiting: 4,
    moves: [],
    videos: [
      {
        video_id: '679cd22f-d1f8-44fe-a9fd-9cdcbaa6325c',
        version: 2,
        status: 'GENERATING_ASSETS',
        approval: null,
      },
      {
        video_id: 'a1b2c3d4-d1f8-44fe-a9fd-9cdcbaa6325c',
        version: 1,
        status: 'WAITING_APPROVAL',
        approval: 'A2',
      },
    ],
    videos_total: 3,
    stats: {
      succeeded: 31,
      failed: 2,
      completed: 2,
      slowest: [
        { step: 'render_episode', median_seconds: 840 },
        { step: 'tts', median_seconds: 45 },
      ],
    },
  };
  const detail = (row: Record<string, unknown>) =>
    build([row], { kind: 'worker', worker: 'hp-400-g7' });

  test('details one worker: live state, its videos and its last 24 hours', () => {
    expect(detail(workerRow)).toBe(
      [
        '🟢 hp-400-g7 · online',
        'Heartbeat: 14:30 05/11 · Rảnh lần cuối: 14:02 05/11',
        'Khả năng: q:render, q:light',
        '',
        '▶ Đang chạy',
        '/v_679cd22f v2 · Vì sao trời xanh',
        'render_episode · 12 phút · đang render 5400 khung hình · GENERATING_ASSETS',
        '',
        '📌 3 video trên máy này · 4 job đang chờ',
        '/v_679cd22f v2 · GENERATING_ASSETS',
        '/v_a1b2c3d4 v1 · chờ A2',
        '… và 1 video nữa',
        '',
        '📈 24 giờ: 31 bước xong · 2 lỗi · 2 video hoàn tất',
        'Chậm nhất: render_episode 14 phút, tts 45 giây',
      ].join('\n'),
    );
  });

  test('an idle worker with no history says so', () => {
    const text = detail({
      ...workerRow,
      online: false,
      last_seen_at: minutesAgo(15),
      last_idle_at: null,
      capabilities: [],
      jobs: [],
      waiting: 0,
      videos: [],
      videos_total: 0,
      stats: { succeeded: 0, failed: 0, completed: 0, slowest: [] },
    });
    expect(text).toContain('🔴 hp-400-g7 · offline 15 phút');
    expect(text).toContain('Rảnh, không chạy job nào.');
    expect(text).toContain('📌 Không có video nào trên máy này');
    expect(text).toContain('📈 24 giờ: 0 bước xong · 0 lỗi · 0 video hoàn tất');
    expect(text).not.toContain('Chậm nhất');
    expect(text).not.toContain('Khả năng');
    expect(text).not.toContain('Rảnh lần cuối');
  });

  test('shows open moves', () => {
    const text = detail({
      ...workerRow,
      moves: [
        {
          video_id: '679cd22f-d1f8-44fe-a9fd-9cdcbaa6325c',
          from_worker: 'mac-mini-m4',
          to_worker: 'hp-400-g7',
          status: 'COPYING',
          attempts: 2,
        },
      ],
    });
    expect(text).toContain('↪ /v_679cd22f: mac-mini-m4 → hp-400-g7 · đang copy (lần 2)');
  });

  test('answers an unknown worker and refuses strangers', () => {
    expect(build([{}], { kind: 'worker', worker: 'raspberry' })).toBe(
      'Không có worker raspberry. Danh sách: /workers',
    );
    expect(build([{ allowed: false }], { kind: 'worker', worker: 'hp-400-g7' })).toBe(
      'Bạn không phải approver.',
    );
  });

  test('/help explains the worker detail and the tap forms', () => {
    const help = (mode: string, topic: string) =>
      (
        runCode(WF, 'Build help', {
          input: [{ json: { allowed: true } }],
          nodeOutputs: {
            'Parse callback': [
              { json: { kind: 'help', mode, topic, chatId: '-100', messageId: '7' } },
            ],
          },
        })[0]!.json as { text: string }
      ).text;
    expect(help('help', 'worker')).toContain('/worker <worker>');
    expect(help('help', '')).toContain('/retry_679cd22f');
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

describe('WF-06 /ideas and idea buttons (D-083)', () => {
  const FILE = 'wf-06-telegram-callback.json';
  const CHAT = 'REPLACE_WITH_APPROVAL_CHAT_ID';
  const command = (text: string, chat: string | number = CHAT): Item => ({
    json: {
      message: { message_id: 9, from: { id: 111, is_bot: false }, chat: { id: chat }, text },
    },
  });
  const parse = (item: Item) => runCode(FILE, 'Parse callback', { input: [item] });
  const token = 'e'.repeat(32);

  test.each([
    ['/ideas', '*', '*'],
    ['/ytuong', '*', '*'],
    ['/ideas@aivideo_bot kit=science', 'science', '*'],
    ['/ideas kit=whatif nhanvat=chip-science', 'whatif', 'chip-science'],
  ])('parses %j', (text, kit, characterSet) => {
    expect(parse(command(text))[0]!.json).toEqual({
      kind: 'ideas',
      userId: '111',
      chatId: CHAT,
      messageId: '9',
      kit,
      characterSet,
      error: '',
    });
  });

  test.each([
    ['/ideasx', 'ideasx'],
    ['/ideas science', 'ideas'],
    ['/ideas kit=A', 'ideas'],
  ])('sends %j to the usage reply (D-097)', (text, topic) => {
    expect(parse(command(text))[0]!.json).toMatchObject({ kind: 'help', mode: 'bad', topic });
  });

  test('refuses other chats with their id', () => {
    expect(parse(command('/ideas', -5))[0]!.json.error).toMatch(/Chat này \(-5\)/);
  });

  test('parses an idea button', () => {
    const query = {
      id: 'q1',
      from: { id: 111 },
      data: `id:${token}`,
      message: { message_id: 40, chat: { id: -100 } },
    };
    expect(parse({ json: { callback_query: query } })[0]!.json).toEqual({
      kind: 'idea-pick',
      queryId: 'q1',
      userId: '111',
      chatId: '-100',
      messageId: '40',
      token,
    });
    expect(parse({ json: { callback_query: { ...query, data: 'id:short' } } })).toEqual([]);
  });

  test('routes /ideas to telegram_ideas() and idea buttons to idea_to_draft()', () => {
    const wf = workflow(FILE);
    const next = (name: string) => wf.connections[name]!.main.map((out) => out[0]?.node);
    expect(next('Ideas?')).toEqual(['Ideas ok?', 'Retry?']);
    expect(next('Ideas ok?')).toEqual(['Ideas', 'Build ideas reply']);
    expect(next('Build ideas reply')).toEqual(['Send status']);
    expect(next('Selection?')).toEqual(['Cycle selection', 'Idea pick?']);
    expect(next('Idea pick?')).toEqual(['Pick idea', 'Decide']);
    expect(next('Pick idea')).toEqual(['Build confirmation']);
    expect(next('Send confirmation')).toEqual(['Idea button?']);
    const query = (name: string) => wf.nodes.find((n) => n.name === name)!.parameters.query;
    expect(query('Ideas')).toMatch(/FROM telegram_ideas\(\$1::bigint, \$2, nullif\(\$3, '\*'\)/);
    expect(query('Pick idea')).toMatch(/FROM idea_to_draft\(\$1, \$2::bigint, \$3\)/);
  });

  const reply = (rows: Record<string, unknown>[], parsed: Record<string, unknown> = {}) =>
    runCode(FILE, 'Build ideas reply', {
      input: rows.map((json) => ({ json })),
      nodeOutputs: {
        'Parse callback': [{ json: { chatId: CHAT, messageId: '9', error: '', ...parsed } }],
      },
    })[0]!.json as { text: string; chatId: string; messageId: string };

  test('confirms each queued pair and explains refusals', () => {
    const text = reply([
      { result: 'QUEUED', kit: 'whatif', character_set: 'chip' },
      { result: 'BUSY', kit: 'science', character_set: 'chip-science' },
    ]).text;
    expect(text).toContain('⏳ whatif · chip: đang nghĩ ý tưởng…');
    expect(text).toContain('science · chip-science: ý tưởng đang được viết');
    expect(text).toMatch(/gửi vào chat này/);
    expect(reply([{ result: 'NOT_APPROVER' }]).text).toBe('Bạn không phải approver.');
    expect(reply([{ result: 'UNKNOWN_KIT', kit: 'anime' }]).text).toBe('Không có kit "anime".');
    expect(reply([], { error: 'Chat này (-5) …' }).text).toBe('Chat này (-5) …');
  });

  const confirm = (row: Record<string, unknown>) =>
    runCode(FILE, 'Build confirmation', {
      input: [{ json: row }],
      nodeOutputs: {
        'Parse callback': [
          { json: { kind: 'idea-pick', chatId: '-100', messageId: '40', queryId: 'q1' } },
        ],
      },
    })[0]!.json;

  test('an idea opens a new draft message that shows its series and related video', () => {
    const out = confirm({
      result: 'DRAFT',
      token,
      expires_at: '2026-11-02T06:00:00Z',
      brief: {
        topic: 'Nếu bạn là cá heo',
        notes: 'Hook gợi ý: …',
        series: { id: 'x', title: 'Dưới biển', episode: 3 },
        related_to: { video_id: 'y', title: 'Nếu bạn là cá' },
      },
      has_voice: null,
      selection: {
        kit: { label: 'Nếu bạn…', next_label: 'Khoa học' },
        character_set: { label: 'Chíp (BẠN)', next_label: 'Chíp Khoa học' },
      },
    });
    expect(out).toMatchObject({ edit: false, queryId: 'q1', approve: `in:A:${token}` });
    expect(out.text).toContain('Series: Dưới biển · tập 3');
    expect(out.text).toContain('Liên quan: Nếu bạn là cá');
  });

  test('a used or expired idea answers the button with the reason', () => {
    expect(confirm({ result: 'IDEA_USED' })).toMatchObject({
      queryId: 'q1',
      text: 'Ý tưởng này đang có bản nháp hoặc đã tạo video.',
    });
    expect(confirm({ result: 'IDEA_EXPIRED' }).text).toMatch(/hết hạn/);
  });
});

describe('WF-16 Video Ideas (D-083)', () => {
  const FILE = 'wf-16-video-ideas.json';
  const build = (rows: Record<string, unknown>[]) =>
    runCode(FILE, 'Build ideas message', { input: rows.map((json) => ({ json })) }).map(
      (item) => item.json,
    );
  const idea = (position: number, extra: Record<string, unknown> = {}) => ({
    position,
    kind: 'new',
    topic: `Ý tưởng <${position}>`,
    hook: 'Nếu bạn…?',
    angle: 'Góc nhìn',
    token: String(position).repeat(32),
    ...extra,
  });

  test('runs the daily request every morning in Vietnam time and polls for finished ideas', () => {
    const wf = workflow(FILE);
    const node = (name: string) => wf.nodes.find((n) => n.name === name)!;
    expect(node('Every morning').parameters.rule).toEqual({
      interval: [{ field: 'cronExpression', expression: '0 7 * * *' }],
    });
    expect((wf.settings as Record<string, unknown>).timezone).toBe('Asia/Ho_Chi_Minh');
    expect(node('Daily ideas').parameters.query).toMatch(/ideas_daily\(/);
    expect(node('Due ideas').parameters.query).toMatch(/FROM ideas_due\(\)/);
  });

  test('has one button per idea of a request (ideas_per_request() = 5)', () => {
    const send = workflow(FILE).nodes.find((n) => n.name === 'Send ideas')!;
    const rows = (send.parameters.inlineKeyboard as { rows: { row: { buttons: unknown[] } }[] })
      .rows;
    expect(rows[0]!.row.buttons).toHaveLength(5);
    const migration = readFileSync(
      fileURLToPath(
        new URL('../../../db/migrations/20261115000100_video_ideas.sql', import.meta.url),
      ),
      'utf8',
    );
    expect(migration).toMatch(
      /ideas_per_request\(\) RETURNS integer\s+LANGUAGE sql IMMUTABLE AS \$\$ SELECT 5;/,
    );
  });

  test('lists the ideas with their kind, escaped, and a button per idea', () => {
    const [out] = build([
      {
        kind: 'IDEAS',
        source: 'daily',
        chat_id: null,
        kit: 'whatif',
        kit_label: 'Nếu bạn…',
        character_label: 'Chíp (BẠN)',
        ideas: JSON.stringify([
          idea(1, { kind: 'series', series_title: 'Dưới biển', episode_no: 3 }),
          idea(2, { kind: 'related', related_title: 'Nếu bạn là cá' }),
          idea(3),
          idea(4),
          idea(5),
        ]),
      },
    ]);
    expect(out).toMatchObject({
      chatId: 'REPLACE_WITH_APPROVAL_CHAT_ID',
      hasButtons: true,
      idea1: `id:${'1'.repeat(32)}`,
      idea5: `id:${'5'.repeat(32)}`,
    });
    const html = String(out!.html);
    expect(html).toMatch(/^💡 Ý tưởng hôm nay · Nếu bạn… · Chíp \(BẠN\)/);
    expect(html).toContain('<b>1. Ý tưởng &lt;1&gt;</b>');
    expect(html).toContain('🔗 Series: Dưới biển · tập 3');
    expect(html).toContain('↪️ Liên quan: Nếu bạn là cá');
    expect(html).toContain('✨ Mới');
    expect(html.length).toBeLessThan(4096);
  });

  test('answers /ideas in its chat and sends failures and usage-limit waits as notices', () => {
    const rows = build([
      { kind: 'FAILED', chat_id: '-100', kit: 'science', error: 'boom <x>' },
      { kind: 'BLOCKED', chat_id: '-100', kit: 'science', blocked_until: '2026-11-02T03:00:00Z' },
    ]);
    expect(rows[0]).toMatchObject({ chatId: '-100', hasButtons: false });
    expect(rows[0]!.html).toContain('boom &lt;x&gt;');
    expect(rows[1]!.html).toContain('thử lại lúc 10:00 02/11');
  });
});

describe('BotFather command list (ops/telegram-commands.md)', () => {
  const doc = readFileSync(
    fileURLToPath(new URL('../../../ops/telegram-commands.md', import.meta.url)),
    'utf8',
  );
  const menu = /## BotFather menu[\s\S]*?```\n([\s\S]*?)```/.exec(doc)![1]!.trim().split('\n');
  // Aliases WF-06 accepts but the menu does not list.
  const ALIASES = new Set(['ytuong', 'chuyen', 'cho', 'tudong', 'huy', 'video']);
  // Commands that work and appear in /help, kept out of the menu so it stays short (D-097).
  const HIDDEN = [
    'deploy',
    'report',
    'brief',
    'move',
    'rules',
    'rule',
    'say',
    'unsay',
    'join',
    'members',
    'revoke',
  ];

  test('every line is a valid BotFather entry', () => {
    for (const line of menu) expect(line).toMatch(/^[a-z0-9_]{1,32} - \S.{0,254}$/);
  });

  test('lists exactly the commands WF-06 parses', () => {
    const code = workflow('wf-06-telegram-callback.json').nodes.find(
      (n) => n.name === 'Parse callback',
    )!.parameters.jsCode as string;
    const parsed = [...code.matchAll(/\/\^\\\/\(?(?:\?:)?([a-z|]+)/g)]
      .flatMap((m) => m[1]!.split('|'))
      .filter((name) => !ALIASES.has(name));
    const listed = menu.map((line) => line.split(' - ')[0]);
    expect(new Set([...listed, ...HIDDEN])).toEqual(new Set(parsed));
    expect(listed).toHaveLength(new Set(listed).size);
    expect(listed.filter((name) => HIDDEN.includes(name))).toEqual([]);
  });
});

describe('WF-06 /new auto=on (D-096)', () => {
  const WF = 'wf-06-telegram-callback.json';
  const CHAT = 'REPLACE_WITH_APPROVAL_CHAT_ID';
  const text = (value: string): Item => ({
    json: {
      message: {
        message_id: 12,
        from: { id: 111, is_bot: false },
        chat: { id: CHAT },
        text: value,
      },
    },
  });
  const parse = (value: string) =>
    runCode(WF, 'Parse callback', { input: [text(value)] })[0]?.json as Record<string, unknown>;
  const SELECTION = {
    kit: { slug: 'science', label: 'Khoa học', next_slug: 'whatif', next_label: 'Nếu bạn…' },
    character_set: {
      slug: 'chip-science',
      label: 'Chíp Khoa học',
      next_slug: 'chip-science',
      next_label: 'Chíp Khoa học',
    },
  };
  const confirm = (selection: object) =>
    runCode(WF, 'Build confirmation', {
      input: [
        {
          json: {
            result: 'DRAFT',
            token: 'd'.repeat(32),
            expires_at: '2026-11-04T06:00:00Z',
            brief: { topic: 'Mèo' },
            has_voice: null,
            selection,
          },
        },
      ],
      nodeOutputs: { 'Parse callback': [{ json: { chatId: String(CHAT), messageId: '12' } }] },
    })[0]!.json as { text: string };

  test('takes auto=on off the first line, with the other options', () => {
    expect(parse('/new 3 Vì sao trời xanh? kit=science auto=on worker=hp-400-g7')).toMatchObject({
      topic: 'Vì sao trời xanh?',
      minutes: 3,
      selection: { kit: 'science' },
      worker: 'hp-400-g7',
      auto: true,
      error: '',
    });
    expect(parse('/new Vì sao trời xanh?')).toMatchObject({ auto: false });
    expect(parse('/new Vì sao trời xanh? auto=off')).toMatchObject({
      topic: 'Vì sao trời xanh?',
      auto: false,
    });
  });

  test('the usage names auto=on', () => {
    expect(parse('/new auto=on')!.error).toMatch(/auto=on/);
  });

  test('Build draft passes the choice to telegram_intake_draft()', async () => {
    const parsed = parse('/new Vì sao trời xanh? auto=on');
    const [on] = await runAsyncCode(WF, 'Build draft', {
      input: [{ json: {} }],
      nodeOutputs: { 'Parse callback': [{ json: parsed }] },
    });
    expect(on!.json).toMatchObject({ auto: 'true' });
    const [off] = await runAsyncCode(WF, 'Build draft', {
      input: [{ json: {} }],
      nodeOutputs: { 'Parse callback': [{ json: parse('/new Vì sao trời xanh?') }] },
    });
    expect(off!.json).toMatchObject({ auto: 'false' });
  });

  test('the confirmation says whether the video will approve itself', () => {
    expect(confirm({ ...SELECTION, auto: true }).text).toContain(
      'Tự duyệt: Bật — mọi bước tới khi lưu Drive (trừ xóa bản trên Mac)',
    );
    expect(confirm({ ...SELECTION, auto: false }).text).not.toContain('Tự duyệt');
    expect(confirm(SELECTION).text).not.toContain('Tự duyệt');
  });
});

describe('WF-06 /help and usage replies (D-097)', () => {
  const FILE = 'wf-06-telegram-callback.json';
  const CHAT = 'REPLACE_WITH_APPROVAL_CHAT_ID';
  const command = (text: string, chat: string | number = -100, isBot = false): Item => ({
    json: {
      message: { message_id: 7, from: { id: 111, is_bot: isBot }, chat: { id: chat }, text },
    },
  });
  const parse = (item: Item) => runCode(FILE, 'Parse callback', { input: [item] });
  const build = (text: string, allowed: boolean, chat: string | number = -100) =>
    runCode(FILE, 'Build help', {
      input: [{ json: { allowed } }],
      nodeOutputs: { 'Parse callback': parse(command(text, chat)) },
    });
  const reply = (text: string) => build(text, true)[0]!.json.text as string;

  test.each([
    ['/help', '', 'help'],
    ['/help@aivideo_bot', '', 'help'],
    ['/help new', 'new', 'help'],
    ['/help /new', 'new', 'help'],
    ['/help NEW', 'new', 'help'],
  ])('parses %j', (text, topic, mode) => {
    expect(parse(command(text))[0]!.json).toMatchObject({ kind: 'help', topic, mode });
  });

  test.each([['hello'], ['/tmp/file.txt is the path'], ['/nope@other_bot'], ['/ hello']])(
    'stays silent on %j, which is no command for this bot',
    (text) => {
      const out = parse(command(text));
      if (out.length === 0) return;
      expect(build(text, true)).toEqual([]);
    },
  );

  test('ignores commands sent by a bot', () => {
    expect(parse(command('/nope', -100, true))).toEqual([]);
    expect(parse(command('/help', -100, true))).toEqual([]);
  });

  test('a menu tap in a group (/retry@bot, no id) gets the usage, not silence', () => {
    expect(reply('/retry@aivideo_bot')).toContain('/retry <');
  });

  test('a known command with bad arguments gets its usage', () => {
    expect(reply('/retry')).toMatch(/^Cách dùng: \/retry </);
    expect(reply('/ideas foo')).toMatch(/^Cách dùng: \/ideas/);
    expect(reply('/status xyz')).toMatch(/^Cách dùng: \/status/);
  });

  test('an alias gets the usage of its command', () => {
    expect(reply('/cho abc xyz')).toMatch(/^Cách dùng: \/pending/);
  });

  test('an unknown command points to /help', () => {
    expect(reply('/nope')).toBe('Không có lệnh /nope. Xem /help.');
    expect(reply('/help nope')).toBe('Không có lệnh /nope. Xem /help.');
  });

  test('/help groups the commands and tells about last', () => {
    const text = reply('/help');
    expect(text).toContain('/new');
    expect(text).toContain('/revoke');
    expect(text).toContain('last');
    expect(text.length).toBeLessThanOrEqual(4096);
  });

  test('/help <command> shows the usage of that command', () => {
    expect(reply('/help new')).toContain('kit=');
    expect(reply('/help auto')).toContain('off');
  });

  test('has an entry for every command in the BotFather list and the reference table', () => {
    const doc = readFileSync(
      fileURLToPath(new URL('../../../ops/telegram-commands.md', import.meta.url)),
      'utf8',
    );
    const names = [...doc.matchAll(/^\| `\/([a-z]+)`(?:, `\/([a-z]+)`)?/gm)].flatMap((m) =>
      [m[1]!, m[2]].filter((name): name is string => Boolean(name)),
    );
    expect(names.length).toBeGreaterThan(10);
    for (const name of names) {
      expect(reply(`/help ${name}`), name).toContain(`/${name}`);
    }
  });

  test('answers approvers anywhere and anyone in the approval chat, nobody else', () => {
    expect(build('/help', false)).toEqual([]);
    expect(build('/nope', false)).toEqual([]);
    expect(build('/help', false, CHAT)).toHaveLength(1);
    expect(build('/help', true)).toHaveLength(1);
  });

  test('a /command as a reply to an approval message stays a note', () => {
    const token = 'a'.repeat(32);
    const [out] = parse({
      json: {
        message: {
          message_id: 7,
          from: { id: 111, is_bot: false },
          chat: { id: -100 },
          text: '/nope please rewrite',
          reply_to_message: {
            from: { is_bot: true },
            text: `Script ref:${token}`,
          },
        },
      },
    });
    expect(out!.json).toMatchObject({ kind: 'reply', action: 'FEEDBACK', token });
  });

  test('routes help through the approver check to Send status', () => {
    const wf = workflow(FILE);
    const next = (name: string) => wf.connections[name]!.main.map((out) => out[0]!.node);
    expect(next('Members?')).toEqual(['Member error?', 'Help?']);
    expect(next('Help?')).toEqual(['Can help', 'Cancel?']);
    expect(next('Can help')).toEqual(['Build help']);
    expect(next('Build help')).toEqual(['Send status']);
    const node = wf.nodes.find((n) => n.name === 'Can help')!;
    expect(node.parameters.query).toBe('SELECT telegram_can_help($1::bigint) AS allowed;');
  });
});

describe('WF-06 last as a video id (D-097)', () => {
  const FILE = 'wf-06-telegram-callback.json';
  const parse = (text: string) =>
    runCode(FILE, 'Parse callback', {
      input: [
        {
          json: {
            message: { message_id: 7, from: { id: 111, is_bot: false }, chat: { id: -100 }, text },
          },
        },
      ],
    })[0]!.json;

  test.each([
    ['/status last', 'status'],
    ['/pending last', 'pending'],
    ['/retry last', 'retry'],
    ['/auto last', 'auto'],
    ['/move last hp-400-g7', 'move'],
  ])('parses %j', (text, kind) => {
    expect(parse(text)).toMatchObject({ kind, prefix: 'last' });
  });

  test('/auto last off turns it off', () => {
    expect(parse('/auto last off')).toMatchObject({
      kind: 'auto',
      prefix: 'last',
      enable: 'false',
    });
  });

  test.each(['Retry', 'Progress', 'Pending', 'Auto', 'Move'])('%s resolves it in SQL', (name) => {
    const node = workflow(FILE).nodes.find((n) => n.name === name)!;
    expect(node.parameters.query).toContain('video_ref($2)');
  });
});

describe('WF-06 /pending lists stopped videos (D-097)', () => {
  const build = (rows: Record<string, unknown>[]) =>
    runCode('wf-06-telegram-callback.json', 'Build status', {
      input: rows.map((json) => ({ json })),
      nodeOutputs: {
        'Parse callback': [
          { json: { kind: 'pending', prefix: '', chatId: '-100', messageId: '7' } },
        ],
      },
    })[0]!.json.text as string;
  const stopped = (type: string) => ({
    allowed: true,
    video_id: '679cd22f-d1f8-44fe-a9fd-9cdcbaa6325c',
    version: 2,
    title: 'Mèo',
    type,
    expires_at: null,
    reminded: false,
  });

  test('offers /retry for NEEDS_DECISION, with no deadline or button text', () => {
    const text = build([stopped('NEEDS_DECISION')]);
    expect(text).toContain('⛔ 1 video đang dừng');
    expect(text).toContain('/v_679cd22f v2 · Mèo · NEEDS_DECISION · chạy lại: /retry_679cd22f');
    expect(text).not.toContain('yêu cầu đang chờ duyệt');
    expect(text).not.toContain('hạn');
    expect(text).not.toContain('nút nằm trong');
  });

  test('only links the card for BLOCKED_PROVIDER, which /retry cannot resume', () => {
    const text = build([stopped('BLOCKED_PROVIDER')]);
    expect(text).toContain('/v_679cd22f v2 · Mèo · BLOCKED_PROVIDER');
    expect(text).not.toContain('/retry');
  });

  test('counts approvals and stopped videos apart', () => {
    const text = build([
      {
        ...stopped('SCRIPT'),
        video_id: '11112222-d1f8-44fe-a9fd-9cdcbaa6325c',
        expires_at: '2026-11-04T10:00:00Z',
        reminded: true,
      },
      stopped('NEEDS_DECISION'),
    ]);
    expect(text).toContain('⏳ 1 yêu cầu đang chờ duyệt');
    expect(text).toContain('⛔ 1 video đang dừng');
    expect(text).toContain('Bot sẽ gửi lại 1 yêu cầu');
  });
});

describe('WF-06 /cancel, /auto all and the Confirm button (D-098)', () => {
  const FILE = 'wf-06-telegram-callback.json';
  const ID = '679cd22f-d1f8-44fe-a9fd-9cdcbaa6325c';
  const TOKEN = 'a'.repeat(32);
  const parse = (text: string) =>
    runCode(FILE, 'Parse callback', {
      input: [
        {
          json: {
            message: { message_id: 7, from: { id: 111, is_bot: false }, chat: { id: -100 }, text },
          },
        },
      ],
    })[0]!.json;
  const parseButton = (data: string, userId = 111) =>
    runCode(FILE, 'Parse callback', {
      input: [
        {
          json: {
            callback_query: {
              id: 'q1',
              data,
              from: { id: userId },
              message: { message_id: 9, chat: { id: -100 }, text: 'Hủy?' },
            },
          },
        },
      ],
    });
  const prompt = (kind: string, row: Record<string, unknown>) =>
    runCode(FILE, 'Build confirm prompt', {
      input: [{ json: row }],
      nodeOutputs: { 'Parse callback': [{ json: { kind, chatId: '-100', messageId: '7' } }] },
    })[0]!.json as Record<string, string | boolean>;
  const outcome = (row: Record<string, unknown>) =>
    runCode(FILE, 'Build confirm reply', {
      input: [{ json: row }],
      nodeOutputs: {
        'Parse callback': [
          { json: { kind: 'confirm', queryId: 'q1', chatId: '-100', messageId: '9' } },
        ],
      },
    })[0]!.json as Record<string, string | boolean>;

  test.each([
    ['/cancel 679cd22f', '679cd22f'],
    ['/huy 679cd22f', '679cd22f'],
    ['/cancel@aivideo_bot 679CD22F 11112222', '679cd22f 11112222'],
    ['/cancel last', 'last'],
  ])('parses %j', (text, refs) => {
    expect(parse(text)).toMatchObject({ kind: 'cancel', refs, userId: '111' });
  });

  test.each(['/cancel', '/cancel zz', '/cancel 679cd22f now'])(
    'sends %j to the usage reply',
    (text) => {
      expect(parse(text)).toMatchObject({ kind: 'help', mode: 'bad', topic: 'cancel' });
    },
  );

  test.each([
    ['/auto all', true],
    ['/auto all off', false],
    ['/tudong all tat', false],
  ])('parses %j', (text, enable) => {
    expect(parse(text)).toMatchObject({ kind: 'auto-all', enable: String(enable) });
  });

  test('a Confirm button reaches the database; a malformed one does not', () => {
    expect(parseButton(`cf:A:${TOKEN}`)[0]!.json).toMatchObject({
      kind: 'confirm',
      action: 'A',
      token: TOKEN,
      userId: '111',
      queryId: 'q1',
      messageId: '9',
    });
    expect(parseButton(`cf:R:${TOKEN}`)[0]!.json).toMatchObject({ action: 'R' });
    expect(parseButton(`cf:X:${TOKEN}`)).toEqual([]);
    expect(parseButton('cf:A:short')).toEqual([]);
  });

  test('the cancel preview carries both buttons and says what it does', () => {
    const out = prompt('cancel', {
      result: 'OK',
      token: TOKEN,
      items: [
        {
          ref: '679cd22f',
          video_id: ID,
          version: 2,
          title: 'Mèo',
          status: 'SCRIPTING',
          result: 'WOULD_CANCEL',
        },
        { ref: 'ffffffff', video_id: null, version: null, result: 'NOT_FOUND' },
        {
          ref: '11112222',
          video_id: ID,
          version: 1,
          title: 'Cá',
          status: 'COMPLETED',
          result: 'ALREADY_COMPLETED',
        },
      ],
    });

    expect(out.ok).toBe(true);
    expect(out.approve).toBe(`cf:A:${TOKEN}`);
    expect(out.reject).toBe(`cf:R:${TOKEN}`);
    expect(out.text).toContain('Hủy 1 video?');
    expect(out.text).toContain('679cd22f v2 · Mèo · SCRIPTING');
    expect(out.text).toContain('ffffffff: không tìm thấy');
    expect(out.text).toContain('11112222: đã COMPLETED');
    expect(out.text).toContain('credit đã dùng không được hoàn lại');
  });

  test.each([
    ['cancel', { result: 'NOT_OWNER' }, 'Chỉ owner mới hủy được video.'],
    ['cancel', { result: 'TOO_MANY' }, 'Mỗi lần hủy tối đa 20 video.'],
    ['auto-all', { result: 'NOT_APPROVER' }, 'Bạn không phải approver.'],
    ['auto-all', { result: 'NOTHING', items: [] }, 'Không có video nào để bật tự duyệt.'],
  ])('%s %j has no buttons', (kind, row, text) => {
    const out = prompt(kind, row);
    expect(out.ok).toBe(false);
    expect(out.text).toBe(text);
  });

  test('a cancel with nothing to cancel explains each id', () => {
    const out = prompt('cancel', {
      result: 'NOTHING',
      items: [{ ref: 'ffffffff', video_id: null, result: 'NOT_FOUND' }],
    });
    expect(out.ok).toBe(false);
    expect(out.text).toContain('ffffffff: không tìm thấy');
  });

  test('the /auto all preview shows count, waiting gates and estimates', () => {
    const out = prompt('auto-all', {
      result: 'OK',
      token: TOKEN,
      items: [
        {
          video_id: ID,
          version: 2,
          title: 'Mèo',
          status: 'AWAITING_SCRIPT_APPROVAL',
          gate: 'SCRIPT',
        },
        { video_id: ID, version: 1, title: 'Cá', status: 'SCRIPTING', gate: null },
      ],
      gates: 1,
      estimates: { CRD: 5.126 },
      no_estimate: 1,
    });

    expect(out.ok).toBe(true);
    expect(out.approve).toBe(`cf:A:${TOKEN}`);
    expect(out.text).toContain('Bật tự duyệt cho 2 video?');
    expect(out.text).toContain('1 bước đang chờ sẽ được duyệt ngay');
    expect(out.text).toContain('5.13 CRD');
    expect(out.text).toContain('1 video chưa có ước tính');
    expect(out.text).toContain('video tạo sau vẫn duyệt tay');
  });

  test('/auto all off answers with the count and no buttons', () => {
    const out = prompt('auto-all', { result: 'OFF', items: [{}, {}] });
    expect(out.ok).toBe(false);
    expect(out.text).toContain('Đã tắt tự duyệt cho 2 video');
  });

  test('a confirmed cancel reports what happened and removes the buttons', () => {
    const out = outcome({
      result: 'OK',
      action: 'CANCEL',
      items: [
        { video_id: ID, version: 2, result: 'CANCELLED' },
        { video_id: '11112222-d1f8-44fe-a9fd-9cdcbaa6325c', version: 1, result: 'STALE' },
        { video_id: '33334444-d1f8-44fe-a9fd-9cdcbaa6325c', version: 1, result: 'ERROR' },
      ],
    });
    expect(out.settled).toBe(true);
    expect(out.answer).toBe('Đã hủy 1 video.');
    expect(out.editedHtml).toContain('Đã hủy 1 video.');
    expect(out.editedHtml).toContain('11112222: đã có bản mới, không hủy');
    expect(out.editedHtml).toContain('33334444: lỗi, xem log');
  });

  test('a confirmed /auto all reports the gates approved', () => {
    const out = outcome({
      result: 'OK',
      action: 'AUTO_ALL',
      items: [
        { video_id: ID, version: 2, result: 'OK', decided_type: 'SCRIPT' },
        { video_id: ID, version: 1, result: 'OK', decided_type: null },
      ],
    });
    expect(out.answer).toBe('Đã bật tự duyệt cho 2 video.');
    expect(out.editedHtml).toContain('duyệt luôn 1 bước đang chờ');
  });

  test.each([
    ['NOT_REQUESTER', false, 'Chỉ người gửi lệnh mới xác nhận được.'],
    ['NOT_ALLOWED', false, 'Bạn không còn quyền làm việc này.'],
    ['REJECTED', true, 'Đã bỏ qua.'],
    ['EXPIRED', true, 'Đã hết hạn; gửi lại lệnh nếu vẫn cần.'],
    ['ALREADY', true, 'Yêu cầu này đã xử lý rồi.'],
    ['NOT_FOUND', true, 'Yêu cầu này đã xử lý rồi.'],
  ])('%s: settled %s', (result, settled, answer) => {
    const out = outcome({ result, action: null, items: null });
    expect(out.settled).toBe(settled);
    expect(out.answer).toBe(answer);
  });

  test('routes the commands and the button', () => {
    const wf = workflow(FILE);
    const next = (name: string) => wf.connections[name]!.main.map((out) => out.map((n) => n.node));
    expect(next('Cancel?')).toEqual([['Cancel'], ['Auto all?']]);
    expect(next('Cancel')).toEqual([['Build confirm prompt']]);
    expect(next('Auto all?')).toEqual([['Auto all'], ['Confirm?']]);
    expect(next('Auto all')).toEqual([['Build confirm prompt']]);
    expect(next('Build confirm prompt')).toEqual([['Ask confirm?']]);
    expect(next('Ask confirm?')).toEqual([['Send confirm prompt'], ['Send status']]);
    expect(next('Confirm?')).toEqual([['Confirm'], ['Report?']]);
    expect(next('Confirm')).toEqual([['Build confirm reply']]);
    expect(next('Build confirm reply')).toEqual([['Answer confirm']]);
    expect(next('Answer confirm')).toEqual([['Confirm settled?']]);
    expect(next('Confirm settled?')).toEqual([['Edit confirm'], []]);
    const query = (name: string) => wf.nodes.find((n) => n.name === name)!.parameters.query;
    expect(query('Cancel')).toBe('SELECT * FROM telegram_cancel($1::bigint, $2);');
    expect(query('Auto all')).toBe('SELECT * FROM telegram_auto_all($1::bigint, $2::boolean);');
    expect(query('Confirm')).toBe('SELECT * FROM telegram_confirm($1, $2::bigint, $3);');
  });

  test('/help covers /cancel and /auto all', () => {
    const help = (text: string) =>
      runCode(FILE, 'Build help', {
        input: [{ json: { allowed: true } }],
        nodeOutputs: {
          'Parse callback': [
            { json: { kind: 'help', mode: 'help', topic: text, chatId: '-100', messageId: '7' } },
          ],
        },
      })[0]!.json.text as string;
    expect(help('cancel')).toContain('/cancel <id>');
    expect(help('huy')).toContain('/cancel <id>');
    expect(help('auto')).toContain('/auto all');
  });
});

describe('WF-06 /v card and /report (D-099)', () => {
  const FILE = 'wf-06-telegram-callback.json';
  const ID = '679cd22f-d1f8-44fe-a9fd-9cdcbaa6325c';
  const HEX = ID.replace(/-/g, '');
  const parse = (text: string) =>
    runCode(FILE, 'Parse callback', {
      input: [
        {
          json: {
            message: { message_id: 7, from: { id: 111, is_bot: false }, chat: { id: -100 }, text },
          },
        },
      ],
    })[0]!.json;
  const parseButton = (data: string) =>
    runCode(FILE, 'Parse callback', {
      input: [
        {
          json: {
            callback_query: {
              id: 'q1',
              data,
              from: { id: 111 },
              message: { message_id: 9, chat: { id: -100 }, text: 'card' },
            },
          },
        },
      ],
    });
  const statusRow = {
    allowed: true,
    video_id: ID,
    version: 2,
    title: 'Mèo',
    status: 'NEEDS_DECISION',
    status_since: new Date(Date.now() - 60_000).toISOString(),
    step: 'tts',
    step_status: 'FAILED_PERMANENT',
    step_since: new Date(Date.now() - 60_000).toISOString(),
    steps_done: 1,
    steps_total: 2,
    approval: null,
    cost: { CRD: 3 },
    jobs: [],
  };
  const card = (rows: Record<string, unknown>[]) =>
    runCode(FILE, 'Build status', {
      input: rows.map((json) => ({ json })),
      nodeOutputs: {
        'Parse callback': [
          { json: { kind: 'status', card: true, prefix: 'last', chatId: '-100', messageId: '7' } },
        ],
      },
    })[0]!.json as Record<string, unknown>;

  test.each([
    ['/v 679CD22F', '679cd22f'],
    ['/video 679cd22f', '679cd22f'],
    ['/v@aivideo_bot last', 'last'],
  ])('parses %j as a status with a card', (text, prefix) => {
    expect(parse(text)).toEqual({
      kind: 'status',
      card: true,
      prefix,
      userId: '111',
      chatId: '-100',
      messageId: '7',
    });
  });

  test.each(['/v', '/v zz', '/v 679cd22f now'])('sends %j to the usage reply', (text) => {
    expect(parse(text)).toMatchObject({ kind: 'help', mode: 'bad', topic: 'v' });
  });

  test('the card has the text of /status <id> and a button per action, bound to the version', () => {
    const out = card([statusRow]);
    expect(out.text).toContain('📊 Video 679cd22f v2 · Mèo');
    expect(out.card).toBe(true);
    expect(out.retryData).toBe(`v:R:${HEX}:2`);
    expect(out.autoData).toBe(`v:A:${HEX}:2`);
    expect(out.pendingData).toBe(`v:P:${HEX}:2`);
    expect(out.cancelData).toBe(`v:C:${HEX}:2`);
    for (const key of ['retryData', 'autoData', 'pendingData', 'cancelData']) {
      expect((out[key] as string).length).toBeLessThanOrEqual(64);
    }
  });

  test('no video or a stranger gets the plain reply, with no buttons', () => {
    expect(card([{}]).card).toBeUndefined();
    expect(card([{ allowed: false }]).card).toBeUndefined();
  });

  test('plain /status <id> has no card', () => {
    const [out] = runCode(FILE, 'Build status', {
      input: [{ json: statusRow }],
      nodeOutputs: {
        'Parse callback': [
          { json: { kind: 'status', prefix: '679cd22f', chatId: '-100', messageId: '7' } },
        ],
      },
    });
    expect(out!.json.card).toBeUndefined();
  });

  test.each([
    ['R', { kind: 'retry' }],
    ['A', { kind: 'auto', enable: 'true', error: '' }],
    ['P', { kind: 'pending' }],
    ['C', { kind: 'cancel', refs: `${ID}@2` }],
  ])('button %s runs the same command, bound to the version', (action, expected) => {
    expect(parseButton(`v:${action}:${HEX}:2`)[0]!.json).toMatchObject({
      ...expected,
      prefix: `${ID}@2`,
      fromCard: true,
      queryId: 'q1',
      userId: '111',
      chatId: '-100',
      messageId: '9',
    });
  });

  test.each([`v:X:${HEX}:2`, `v:R:${HEX}`, `v:R:short:2`, `v:R:${HEX}:x`])(
    'ignores malformed button %s',
    (data) => {
      expect(parseButton(data)).toEqual([]);
    },
  );

  test.each([
    ['Build retry', { result: 'NOT_FOUND' }, 'retry'],
    ['Build auto', { result: 'NOT_FOUND' }, 'auto'],
  ])('%s tells a stale card to send /v again', (node, row, kind) => {
    const [out] = runCode(FILE, node, {
      input: [{ json: row }],
      nodeOutputs: {
        'Parse callback': [
          {
            json: {
              kind,
              fromCard: true,
              prefix: `${ID}@2`,
              chatId: '-100',
              messageId: '9',
            },
          },
        ],
      },
    });
    expect(out!.json.text).toBe('Video đã có bản mới; gửi lại /v <id>.');
  });

  test('re-posting from a card with nothing waiting does not show the raw reference', () => {
    const [out] = runCode(FILE, 'Build status', {
      input: [{ json: {} }],
      nodeOutputs: {
        'Parse callback': [
          {
            json: {
              kind: 'pending',
              fromCard: true,
              prefix: `${ID}@2`,
              chatId: '-100',
              messageId: '9',
            },
          },
        ],
      },
    });
    expect(out!.json.text).toBe('Không có yêu cầu nào đang chờ duyệt cho video này.');
  });

  test('a stale card tells the cancel preview the same', () => {
    const [out] = runCode(FILE, 'Build confirm prompt', {
      input: [
        {
          json: {
            result: 'NOTHING',
            items: [{ ref: `${ID}@2`, video_id: null, result: 'NOT_FOUND' }],
          },
        },
      ],
      nodeOutputs: {
        'Parse callback': [
          { json: { kind: 'cancel', fromCard: true, chatId: '-100', messageId: '9' } },
        ],
      },
    });
    expect(out!.json.text).toContain('Video đã có bản mới; gửi lại /v <id>.');
    expect(out!.json.text).not.toContain('@2');
  });

  test.each([
    ['/report', 'today'],
    ['/report today', 'today'],
    ['/report 7d', '7d'],
    ['/report@aivideo_bot 30d', '30d'],
  ])('parses %j', (text, period) => {
    expect(parse(text)).toMatchObject({ kind: 'report', period, userId: '111' });
  });

  test.each(['/report 1y', '/report 7d now'])('sends %j to the usage reply', (text) => {
    expect(parse(text)).toMatchObject({ kind: 'help', mode: 'bad', topic: 'report' });
  });

  const report = (row: Record<string, unknown>, period = '7d') =>
    runCode(FILE, 'Build report', {
      input: [{ json: row }],
      nodeOutputs: {
        'Parse callback': [{ json: { kind: 'report', period, chatId: '-100', messageId: '7' } }],
      },
    })[0]!.json.text as string;
  const reportRow = {
    allowed: true,
    period: '7d',
    since: '2026-11-01T00:00:00Z',
    created: 4,
    completed: 3,
    failed: 1,
    cancelled: 0,
    active: 5,
    stopped: 2,
    cost: { CRD: 12.345 },
    minutes: 10,
    minutes_videos: 3,
    completed_cost: { CRD: 10 },
    steps: [{ step: 'render_final', runs: 3, median_seconds: 300 }],
    approvals: { decided: 6, median_seconds: 720 },
  };

  test('reports outcomes, cost, cost per minute, slow steps and approval waits', () => {
    const text = report(reportRow);
    expect(text).toContain('📈 Báo cáo 7 ngày (từ 07:00 01/11)');
    expect(text).toContain('Video: 3 xong · 1 lỗi · 0 hủy · 4 mới tạo');
    expect(text).toContain('Hiện tại: 5 đang chạy, 2 đang dừng');
    expect(text).toContain('Chi phí đã ghi nhận: 12.35 CRD');
    expect(text).toContain('1 CRD/phút (3 video, 10 phút)');
    expect(text).toContain('render_final · 5 phút · 3 lần');
    expect(text).toContain('Duyệt: 6 lần, chờ trung vị 12 phút');
  });

  test('says when cost per minute or the rest has no data, and refuses strangers', () => {
    const text = report({
      ...reportRow,
      cost: {},
      minutes: 0,
      minutes_videos: 0,
      completed_cost: {},
      steps: [],
      approvals: { decided: 0, median_seconds: null },
    });
    expect(text).toContain('Chi phí đã ghi nhận: chưa có');
    expect(text).toContain('Chi phí mỗi phút: chưa có video nào đo được độ dài');
    expect(text).toContain('Duyệt: chưa có');
    expect(report({ allowed: false })).toBe('Bạn không phải approver.');
  });

  test('routes the card, its answer and the report', () => {
    const wf = workflow(FILE);
    const next = (name: string) => wf.connections[name]!.main.map((out) => out.map((n) => n.node));
    expect(next('Build status')).toEqual([['Card buttons?']]);
    expect(next('Card buttons?')).toEqual([['Send card'], ['Send status']]);
    expect(next('Send status')).toEqual([['From card?']]);
    expect(next('Send confirm prompt')).toEqual([['From card?']]);
    expect(next('From card?')).toEqual([['Answer card'], []]);
    expect(next('Report?')).toEqual([['Report'], ['Deploy?']]);
    expect(next('Report')).toEqual([['Build report']]);
    expect(next('Build report')).toEqual([['Send status']]);
    const node = wf.nodes.find((n) => n.name === 'Report')!;
    expect(node.parameters.query).toBe('SELECT * FROM telegram_report($1::bigint, $2);');
    const send = JSON.stringify(wf.nodes.find((n) => n.name === 'Send card')!.parameters);
    for (const key of ['retryData', 'autoData', 'pendingData', 'cancelData']) {
      expect(send).toContain(`$json.${key}`);
    }
  });
});

describe('/deploy (D-100)', () => {
  const FILE = 'wf-06-telegram-callback.json';
  const WATCH = 'wf-08-watchdog.json';
  const SHA = 'a'.repeat(40);
  const TOKEN = 'c'.repeat(32);
  const parse = (text: string) =>
    runCode(FILE, 'Parse callback', {
      input: [
        {
          json: {
            message: { message_id: 7, from: { id: 111, is_bot: false }, chat: { id: -100 }, text },
          },
        },
      ],
    })[0]!.json;
  const reply = (row: Record<string, unknown>) =>
    runCode(FILE, 'Build deploy', {
      input: [{ json: row }],
      nodeOutputs: {
        'Parse callback': [{ json: { kind: 'deploy', chatId: '-100', messageId: '7' } }],
      },
    })[0]!.json.text as string;
  const notice = (row: Record<string, unknown>) =>
    runCode(WATCH, 'Build deploy message', { input: [{ json: row }] })[0]!.json as Record<
      string,
      string | boolean
    >;

  test('parses /deploy, which takes no arguments', () => {
    expect(parse('/deploy')).toMatchObject({ kind: 'deploy', userId: '111' });
    expect(parse('/deploy@aivideo_bot')).toMatchObject({ kind: 'deploy' });
    expect(parse('/deploy abc123')).toMatchObject({ kind: 'help', mode: 'bad', topic: 'deploy' });
  });

  test('answers each result of telegram_deploy()', () => {
    expect(reply({ result: 'NOT_OWNER' })).toBe('Chỉ owner mới deploy được.');
    expect(reply({ result: 'OK' })).toContain('Đang kiểm tra origin/main');
    const open = reply({
      result: 'OPEN',
      status: 'RUNNING',
      sha: SHA,
      targets: [
        { target: 'mac-mini-m4', status: 'DONE' },
        { target: 'hp-400-g7', status: 'DRAINING' },
      ],
    });
    expect(open).toContain('aaaaaaa');
    expect(open).toContain('mac-mini-m4: DONE');
    expect(open).toContain('hp-400-g7: DRAINING');
  });

  test('the confirm message shows what would go out, with both buttons', () => {
    const out = notice({
      kind: 'CONFIRM',
      status: 'AWAITING_CONFIRM',
      sha: SHA,
      commits: 'abc feat: x',
      token: TOKEN,
      targets: [],
      workers: ['mac-mini-m4', 'hp-400-g7'],
      offline: ['mac-mini-m4-02'],
    });
    expect(out.ask).toBe(true);
    expect(out.approve).toBe(`cf:A:${TOKEN}`);
    expect(out.reject).toBe(`cf:R:${TOKEN}`);
    expect(out.text).toContain('aaaaaaa');
    expect(out.text).toContain('abc feat: x');
    expect(out.text).toContain('mac-mini-m4, hp-400-g7, n8n');
    expect(out.text).toContain('Bỏ qua: mac-mini-m4-02');
    expect(out.text).toContain('khi worker rảnh');
  });

  test('a refusal for missing migrations names them and says what to do', () => {
    const out = notice({
      kind: 'FINISHED',
      status: 'REFUSED',
      sha: SHA,
      missing: ['20261125000400'],
      detail: null,
    });
    expect(out.ask).toBe(false);
    expect(out.text).toContain('20261125000400');
    expect(out.text).toContain('migration');
  });

  test('a refusal for another reason shows it', () => {
    const out = notice({
      kind: 'FINISHED',
      status: 'REFUSED',
      detail: 'ssh pve failed',
      missing: [],
    });
    expect(out.text).toContain('ssh pve failed');
  });

  test('a finished rollout lists each target; a failed one shows the output', () => {
    const done = notice({
      kind: 'FINISHED',
      status: 'SUCCEEDED',
      sha: SHA,
      targets: [
        { target: 'mac-mini-m4', status: 'DONE', detail: '' },
        { target: 'n8n', status: 'DONE', detail: 'workflows unchanged' },
        { target: 'hp-400-g7', status: 'SKIPPED', detail: 'offline' },
      ],
    });
    expect(done.text).toContain('✅ Deploy xong aaaaaaa');
    expect(done.text).toContain('hp-400-g7: SKIPPED (offline)');

    const failed = notice({
      kind: 'FINISHED',
      status: 'FAILED',
      sha: SHA,
      targets: [
        { target: 'mac-mini-m4', status: 'FAILED', detail: 'npm ci failed' },
        { target: 'n8n', status: 'CANCELLED', detail: null },
      ],
    });
    expect(failed.text).toContain('❌ Deploy lỗi');
    expect(failed.text).toContain('npm ci failed');
    expect(failed.text).toContain('n8n: CANCELLED');
  });

  test('a cancelled request says so', () => {
    expect(notice({ kind: 'FINISHED', status: 'CANCELLED', sha: SHA }).text).toContain(
      'Đã hủy deploy',
    );
  });

  test('the Confirm button answers for a deploy', () => {
    const [out] = runCode(FILE, 'Build confirm reply', {
      input: [{ json: { result: 'OK', action: 'DEPLOY', items: [] } }],
      nodeOutputs: {
        'Parse callback': [
          { json: { kind: 'confirm', queryId: 'q', chatId: '-1', messageId: '9' } },
        ],
      },
    });
    expect(out!.json.answer).toBe('Đã bắt đầu deploy; có thông báo khi xong.');
    expect(out!.json.settled).toBe(true);
  });

  test('routes the command and the notices', () => {
    const wf = workflow(FILE);
    const next = (name: string) => wf.connections[name]!.main.map((out) => out.map((n) => n.node));
    expect(next('Deploy?')).toEqual([['Deploy'], ['Selection?']]);
    expect(next('Deploy')).toEqual([['Build deploy']]);
    expect(next('Build deploy')).toEqual([['Send status']]);
    expect(wf.nodes.find((n) => n.name === 'Deploy')!.parameters.query).toBe(
      'SELECT * FROM telegram_deploy($1::bigint);',
    );

    const watch = workflow(WATCH);
    const after = (name: string) =>
      watch.connections[name]!.main.map((out) => out.map((n) => n.node));
    expect(after('Every minute')).toEqual([['Run watchdog', 'Deploy notices']]);
    expect(after('Deploy notices')).toEqual([['Build deploy message']]);
    expect(after('Build deploy message')).toEqual([['Ask deploy?']]);
    expect(after('Ask deploy?')).toEqual([['Send deploy confirm'], ['Send deploy notice']]);
    expect(watch.nodes.find((n) => n.name === 'Deploy notices')!.parameters.query).toBe(
      'SELECT * FROM deploy_notices_due();',
    );
  });
});
