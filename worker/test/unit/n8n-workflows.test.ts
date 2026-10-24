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
}

/** Runs a Code node body the way n8n does (top-level return) with stubbed globals. */
function runCode(file: string, nodeName: string, globals: CodeGlobals): Item[] {
  const node = workflow(file).nodes.find((n) => n.name === nodeName)!;
  const input = globals.input ?? [];
  const $input = { all: () => input, first: () => input[0] };
  const $ = (name: string) => {
    const items = globals.nodeOutputs?.[name] ?? [];
    return { first: () => items[0], all: () => items };
  };
  const staticData = globals.staticData ?? {};
  const body = new Function(
    '$input',
    '$execution',
    '$',
    '$getWorkflowStaticData',
    node.parameters.jsCode as string,
  );
  return body($input, { id: globals.executionId ?? '1' }, $, () => staticData) as Item[];
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

  test('code nodes compile', () => {
    for (const node of wf.nodes.filter((n) => n.type === 'n8n-nodes-base.code')) {
      expect(() => new Function(node.parameters.jsCode as string)).not.toThrow();
    }
  });
});

describe('WF-01 Intake', () => {
  test('builds a trimmed brief keyed by the execution id', () => {
    const [out] = runCode('wf-01-intake.json', 'Build brief', {
      executionId: '42',
      input: [
        {
          json: {
            Topic: '  Vì sao bầu trời có màu xanh? ',
            'Duration (seconds)': 45,
            Audience: '',
            Tone: 'vui vẻ',
          },
        },
      ],
    });

    expect(out!.json.submissionId).toBe('n8n-form-42');
    expect(JSON.parse(out!.json.brief as string)).toEqual({
      topic: 'Vì sao bầu trời có màu xanh?',
      duration_seconds: 45,
      tone: 'vui vẻ',
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
