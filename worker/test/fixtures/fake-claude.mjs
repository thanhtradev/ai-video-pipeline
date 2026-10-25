#!/usr/bin/env node
// Test double for the Claude Code CLI (`claude -p --output-format json`). The scenario is chosen by
// the first line of the prompt on stdin, because the real wrapper passes no custom environment.
// It records its argv and environment variable names to ./fake-claude-call.json in its cwd.
import { writeFileSync } from 'node:fs';

let stdin = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) stdin += chunk;

writeFileSync(
  'fake-claude-call.json',
  JSON.stringify({ argv: process.argv.slice(2), envKeys: Object.keys(process.env), stdin }),
);

const mode = stdin.split('\n')[0].trim();
const base = { type: 'result', duration_ms: 1234, num_turns: 1, usage: { output_tokens: 42 } };

function emit(result, code = 0) {
  process.stdout.write(JSON.stringify(result));
  process.exit(code);
}

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

switch (mode) {
  case 'MODE:structured':
    emit({ ...base, subtype: 'success', is_error: false, result: '', structured_output: SCRIPT });
    break;
  case 'MODE:text-json':
    emit({ ...base, subtype: 'success', is_error: false, result: JSON.stringify(SCRIPT) });
    break;
  case 'MODE:success-mentions-limit':
    emit({
      ...base,
      subtype: 'success',
      is_error: false,
      result: 'The speed limit reached zero.',
      structured_output: { note: 'speed limit reached' },
    });
    break;
  case 'MODE:no-output':
    emit({ ...base, subtype: 'success', is_error: false, result: 'Sorry, I cannot help.' });
    break;
  case 'MODE:usage-limit':
    emit(
      {
        ...base,
        subtype: 'success',
        is_error: true,
        result: 'Claude AI usage limit reached|1761400800',
      },
      1,
    );
    break;
  case 'MODE:auth-failure':
    process.stderr.write(
      'Failed to authenticate: OAuth session expired and could not be refreshed\n',
    );
    process.exit(1);
    break;
  case 'MODE:crash':
    process.stderr.write('internal error\n');
    process.exit(2);
    break;
  case 'MODE:hang':
    setTimeout(() => emit({ ...base, subtype: 'success', is_error: false, result: '' }), 60_000);
    break;
  default:
    emit(
      {
        ...base,
        subtype: 'error_during_execution',
        is_error: true,
        result: `unknown mode ${mode}`,
      },
      1,
    );
}
