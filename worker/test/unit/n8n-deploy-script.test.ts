import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

// Drives ops/n8n/deploy-workflows.sh against fake `ssh` and `git` shims (D-068). Every remote
// command the script issues is logged by the ssh shim; nothing real is contacted.

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SCRIPT_SRC = join(REPO_ROOT, 'ops/n8n/deploy-workflows.sh');
const WORKFLOWS_SRC = join(REPO_ROOT, 'n8n/workflows');
const CHAT_ID = '-1001234567890';
const WORKER_URL = 'http://100.71.214.125:8787';
const PUBLISH_ORDER = [
  'aivideoWf99Error',
  'aivideoWf08Watch',
  'qXD7V4t9Bd9v47UZ',
  'aivideoWf06TgCbk',
  'aivideoWf05Apprv',
  'aivideoWf15Voice',
  'aivideoWf12Story',
  'aivideoWf13Prev',
  'yh8qoZvAF2jYsfyp',
];

const SSH_SHIM = `#!/usr/bin/env bash
# Logs its arguments; saves piped stdin; answers export:workflow --all with SHIM_EXPORT_FILE and
# ls with the files of the copied tarball (none when SHIM_HIDE_COPY is set).
printf '%s\\n' "$*" >> "$SHIM_LOG"
if [ ! -t 0 ]; then
  stdin_file="$SHIM_DIR/stdin-$(date +%s%N)-$RANDOM.bin"
  cat > "$stdin_file"
  [ -s "$stdin_file" ] || rm -f "$stdin_file"
fi
case "$*" in
  *"export:workflow --all"*) [ -n "\${SHIM_EXPORT_FILE:-}" ] && cat "$SHIM_EXPORT_FILE" ;;
  *" ls -1 "*)
    [ -n "\${SHIM_HIDE_COPY:-}" ] && exit 2
    for f in "$SHIM_DIR"/stdin-*; do tar -tf "$f"; done ;;
esac
exit 0
`;

const GIT_SHIM = `#!/usr/bin/env bash
case "$*" in
  *"status --porcelain"*) printf '%s' "\${SHIM_GIT_STATUS:-}" ;;
  *"rev-parse --abbrev-ref HEAD"*) echo main ;;
  *"rev-parse --short HEAD"*) echo abc1234 ;;
esac
exit 0
`;

interface Harness {
  root: string;
  repo: string;
  shimDir: string;
  log: string;
  envFile: string;
}

let h: Harness;

function writeExecutable(path: string, content: string) {
  writeFileSync(path, content);
  chmodSync(path, 0o755);
}

function setUp(): Harness {
  const root = mkdtempSync(join(tmpdir(), 'n8n-deploy-'));
  const repo = join(root, 'repo');
  mkdirSync(join(repo, 'ops/n8n'), { recursive: true });
  cpSync(WORKFLOWS_SRC, join(repo, 'n8n/workflows'), { recursive: true });
  cpSync(SCRIPT_SRC, join(repo, 'ops/n8n/deploy-workflows.sh'));
  chmodSync(join(repo, 'ops/n8n/deploy-workflows.sh'), 0o755);
  const shimDir = join(root, 'shim');
  mkdirSync(shimDir);
  writeExecutable(join(shimDir, 'ssh'), SSH_SHIM);
  writeExecutable(join(shimDir, 'git'), GIT_SHIM);
  const envFile = join(root, 'deploy.env');
  writeFileSync(envFile, `APPROVAL_CHAT_ID=${CHAT_ID}\nWORKER_URL=${WORKER_URL}\n`);
  return { root, repo, shimDir, log: join(shimDir, 'ssh.log'), envFile };
}

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

function run(args: string[], env: Record<string, string> = {}): RunResult {
  try {
    const stdout = execFileSync('bash', [join(h.repo, 'ops/n8n/deploy-workflows.sh'), ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        PATH: `${h.shimDir}:${process.env.PATH}`,
        HOME: h.root,
        N8N_DEPLOY_ENV: h.envFile,
        SHIM_LOG: h.log,
        SHIM_DIR: h.shimDir,
        ...env,
      },
    });
    return { status: 0, stdout, stderr: '' };
  } catch (error) {
    const failure = error as { status: number; stdout: string; stderr: string };
    return { status: failure.status, stdout: failure.stdout, stderr: failure.stderr };
  }
}

function remoteCommands(): string[] {
  return existsSync(h.log) ? readFileSync(h.log, 'utf8').trimEnd().split('\n') : [];
}

function capturedTarball(): string {
  const file = readdirSync(h.shimDir).find((name) => name.startsWith('stdin-'));
  expect(file, 'the copy step pipes a tarball into ssh').toBeDefined();
  return join(h.shimDir, file!);
}

function extractedFiles(): Map<string, string> {
  const out = join(h.root, 'extracted');
  mkdirSync(out);
  execFileSync('tar', ['-xf', capturedTarball(), '-C', out]);
  return new Map(
    readdirSync(out).map((name) => [name, readFileSync(join(out, name), 'utf8')] as const),
  );
}

beforeEach(() => {
  h = setUp();
});

afterEach(() => {
  rmSync(h.root, { recursive: true, force: true });
});

describe('configuration guards', () => {
  test('fails with a clear message when APPROVAL_CHAT_ID is missing', () => {
    writeFileSync(h.envFile, `WORKER_URL=${WORKER_URL}\n`);

    const result = run([]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('APPROVAL_CHAT_ID');
    expect(remoteCommands()).toEqual([]);
  });

  test('fails when the env file is missing', () => {
    rmSync(h.envFile);

    const result = run([]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('deploy.env');
  });

  test('rejects a non-numeric chat id and a non-http worker url', () => {
    writeFileSync(h.envFile, `APPROVAL_CHAT_ID=abc\nWORKER_URL=${WORKER_URL}\n`);
    expect(run([]).stderr).toContain('APPROVAL_CHAT_ID');

    writeFileSync(h.envFile, `APPROVAL_CHAT_ID=${CHAT_ID}\nWORKER_URL=100.71.214.125:8787\n`);
    expect(run([]).stderr).toContain('WORKER_URL');
  });

  test('refuses to run from a dirty working tree', () => {
    const result = run([], { SHIM_GIT_STATUS: ' M n8n/workflows/wf-06-telegram-callback.json\n' });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('local changes');
    expect(remoteCommands()).toEqual([]);
  });

  test('fails when a workflow still contains an unknown placeholder', () => {
    const file = join(h.repo, 'n8n/workflows/wf-08-watchdog.json');
    writeFileSync(file, readFileSync(file, 'utf8').replace('"name"', '"REPLACE_WITH_NEW_THING"'));

    const result = run([]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('REPLACE_WITH_');
    expect(remoteCommands()).toEqual([]);
  });

  test('fails when a workflow id is not in the publish order', () => {
    const file = join(h.repo, 'n8n/workflows/wf-77-new.json');
    writeFileSync(file, JSON.stringify({ id: 'aivideoWf77New00', name: 'WF-77', nodes: [] }));

    const result = run([]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('PUBLISH_ORDER');
    expect(result.stderr).toContain('aivideoWf77New00');
  });

  test('fails when a workflow argument matches no file', () => {
    const result = run(['wf-42']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('wf-42');
  });
});

describe('full deploy', () => {
  test('stages every workflow with the placeholders filled in', () => {
    const result = run([]);
    expect(result.status, result.stderr).toBe(0);

    const staged = extractedFiles();

    expect([...staged.keys()].sort()).toEqual(readdirSync(WORKFLOWS_SRC).sort());
    for (const content of staged.values()) {
      expect(content).not.toContain('REPLACE_WITH_');
    }
    expect(staged.get('wf-99-error-handler.json')).toContain(CHAT_ID);
    expect(staged.get('wf-14-final-delivery.json')).toContain(WORKER_URL);
  });

  test('copies into a per-run folder named like the backup, readable by the container user', () => {
    const result = run([]);
    expect(result.status, result.stderr).toBe(0);

    const commands = remoteCommands();
    const stamp = /pre-deploy-(\d{8}T\d{6}Z)/.exec(commands.join('\n'))?.[1];
    expect(stamp).toBeDefined();
    expect(
      commands.some((c) => c.endsWith(`-C /opt/docker/n8n_data/deploy/workflows/${stamp}`)),
    ).toBe(true);
    expect(
      commands.some((c) => c.endsWith(`--input=/home/node/.n8n/deploy/workflows/${stamp}`)),
    ).toBe(true);
    const root = execFileSync('tar', ['-tvf', capturedTarball()], { encoding: 'utf8' })
      .split('\n')
      .find((line) => / \.\/?$/.test(line));
    expect(root).toMatch(/^drwxr-xr-x/);
  });

  test('stops before import and publish when the container does not see the copied files', () => {
    const result = run([], { SHIM_HIDE_COPY: '1' });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('sees 0 of 9 staged files');
    expect(result.stderr).toContain('N8N_DATA_DIR');
    const commands = remoteCommands();
    expect(commands.some((c) => c.includes('import:workflow'))).toBe(false);
    expect(commands.some((c) => c.includes('publish:workflow'))).toBe(false);
  });

  test('backs up, copies, imports, publishes in order, restarts and checks health', () => {
    const result = run([]);
    expect(result.status, result.stderr).toBe(0);

    const commands = remoteCommands();
    const find = (needle: string) => commands.findIndex((c) => c.includes(needle));

    expect(commands.every((c) => c.startsWith('pve pct exec 104 -- '))).toBe(true);
    const backup = find(
      'n8n export:workflow --backup --output=/home/node/.n8n/backups/workflows/pre-deploy-',
    );
    const copy = find('tar --no-same-owner -xf - -C /opt/docker/n8n_data/deploy/workflows/');
    const verify = find('docker exec n8n ls -1 /home/node/.n8n/deploy/workflows/');
    const imported = find(
      'n8n import:workflow --separate --input=/home/node/.n8n/deploy/workflows/',
    );
    const publishes = commands.filter((c) => c.includes('n8n publish:workflow --id='));
    const restart = find('docker restart n8n');
    const health = find('curl -fsS http://127.0.0.1:5678/healthz');
    const report = find('n8n export:workflow --all');

    expect(backup).toBeGreaterThanOrEqual(0);
    expect(copy).toBeGreaterThan(backup);
    expect(verify).toBeGreaterThan(copy);
    expect(imported).toBeGreaterThan(verify);
    expect(publishes).toEqual(
      PUBLISH_ORDER.map(
        (id) => `pve pct exec 104 -- docker exec n8n n8n publish:workflow --id=${id}`,
      ),
    );
    expect(find('n8n publish:workflow --id=aivideoWf99Error')).toBeGreaterThan(imported);
    expect(restart).toBeGreaterThan(find('n8n publish:workflow --id=yh8qoZvAF2jYsfyp'));
    expect(health).toBeGreaterThan(restart);
    expect(report).toBeGreaterThan(health);
  });

  test('reports the published state from the export and the backup directory', () => {
    const exportFile = join(h.root, 'export.json');
    writeFileSync(
      exportFile,
      JSON.stringify([
        { id: 'aivideoWf99Error', name: 'WF-99 Error Handler', active: true },
        { id: 'aivideoWf08Watch', name: 'WF-08 Watchdog', active: false },
        { id: 'someOtherWf00001', name: 'Unrelated', active: true },
      ]),
    );

    const result = run([], { SHIM_EXPORT_FILE: exportFile });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/aivideoWf99Error\s+published\s+WF-99 Error Handler/);
    expect(result.stdout).toMatch(/aivideoWf08Watch\s+NOT PUBLISHED\s+WF-08 Watchdog/);
    expect(result.stdout).not.toContain('Unrelated');
    expect(result.stdout).toMatch(/backups\/workflows\/pre-deploy-\d{8}T\d{6}Z/);
  });

  test('reports the state when the n8n CLI prints warnings before the JSON', () => {
    const exportFile = join(h.root, 'export.json');
    writeFileSync(
      exportFile,
      'Deprecation warning: The storage directory "/home/node/.n8n/binaryData" will be renamed.\n' +
        JSON.stringify([{ id: 'aivideoWf99Error', name: 'WF-99 Error Handler', active: true }]),
    );

    const result = run(['wf-99'], { SHIM_EXPORT_FILE: exportFile });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/aivideoWf99Error\s+published\s+WF-99 Error Handler/);
  });

  test('uses the hosts and paths from the env file', () => {
    writeFileSync(
      h.envFile,
      `APPROVAL_CHAT_ID=${CHAT_ID}\nWORKER_URL=${WORKER_URL}\nPVE_HOST=pve2\nLXC_ID=204\nN8N_CONTAINER=n8n-test\nN8N_DATA_DIR=/srv/n8n\n`,
    );

    const result = run(['wf-99']);

    expect(result.status, result.stderr).toBe(0);
    const commands = remoteCommands();
    expect(commands.every((c) => c.startsWith('pve2 pct exec 204 -- '))).toBe(true);
    expect(commands.some((c) => c.includes('-xf - -C /srv/n8n/deploy/workflows/'))).toBe(true);
    expect(commands.some((c) => c.includes('docker exec n8n-test n8n import:workflow'))).toBe(true);
    expect(commands.some((c) => c.includes('docker restart n8n-test'))).toBe(true);
  });
});

describe('options', () => {
  test('--no-publish imports but neither publishes nor restarts', () => {
    const result = run(['--no-publish']);
    expect(result.status, result.stderr).toBe(0);

    const commands = remoteCommands();

    expect(commands.some((c) => c.includes('import:workflow'))).toBe(true);
    expect(commands.some((c) => c.includes('publish:workflow'))).toBe(false);
    expect(commands.some((c) => c.includes('docker restart'))).toBe(false);
    expect(commands.some((c) => c.includes('healthz'))).toBe(false);
  });

  test('a workflow argument deploys only that file', () => {
    const result = run(['wf-06']);
    expect(result.status, result.stderr).toBe(0);

    expect([...extractedFiles().keys()]).toEqual(['wf-06-telegram-callback.json']);
    const publishes = remoteCommands().filter((c) => c.includes('publish:workflow'));
    expect(publishes).toHaveLength(1);
    expect(publishes[0]).toContain('--id=aivideoWf06TgCbk');
  });

  test('several workflow arguments are published in the fixed order, not the argument order', () => {
    const result = run(['wf-13', 'wf-06', 'wf-99']);
    expect(result.status, result.stderr).toBe(0);

    const ids = remoteCommands()
      .filter((c) => c.includes('publish:workflow'))
      .map((c) => c.split('--id=')[1]);

    expect(ids).toEqual(['aivideoWf99Error', 'aivideoWf06TgCbk', 'aivideoWf13Prev']);
  });

  test('--dry-run prints the commands and contacts nothing', () => {
    const result = run(['--dry-run']);
    expect(result.status, result.stderr).toBe(0);

    expect(remoteCommands()).toEqual([]);
    expect(result.stdout).toContain(
      'DRY: ssh pve pct exec 104 -- docker exec n8n n8n import:workflow',
    );
    expect(result.stdout).toContain(
      'DRY: ssh pve pct exec 104 -- docker exec n8n n8n publish:workflow --id=aivideoWf99Error',
    );
    expect(result.stdout).toContain('DRY: ssh pve pct exec 104 -- docker restart n8n');
  });

  test('rejects an unknown option', () => {
    const result = run(['--bogus']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--bogus');
  });
});
