import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, test } from 'vitest';

// ops/launchd/backfill-drive-ids.sh exists so the backfill needs no pasting (D-104). It runs with
// stand-ins for the Keychain and npx. It must dry-run unless told otherwise.

const SCRIPT = fileURLToPath(
  new URL('../../../ops/launchd/backfill-drive-ids.sh', import.meta.url),
);

let root: string;
let shim: string;
let recorded: string;

function executable(path: string, body: string): void {
  writeFileSync(path, `#!/usr/bin/env bash\n${body}\n`);
  chmodSync(path, 0o755);
}

function run(args: string[] = []) {
  return spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf8',
    env: {
      PATH: `${shim}:/usr/bin:/bin`,
      HOME: root,
      AIVIDEO_ROOT: join(root, 'aivideo'),
      RECORD: recorded,
    },
  });
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'backfill-script-'));
  shim = join(root, 'shim');
  recorded = join(root, 'recorded.txt');
  mkdirSync(shim);
  mkdirSync(join(root, 'aivideo/config'), { recursive: true });
  mkdirSync(join(root, 'aivideo/repo/worker/src/tools'), { recursive: true });
  writeFileSync(join(root, 'aivideo/repo/worker/src/tools/backfill-drive-ids.ts'), '');
  writeFileSync(
    join(root, 'aivideo/config/worker.env'),
    'WORKER_ID=mac-mini-m4\nDB_HOST=db.test\nDB_NAME=aivideo\nDB_USER=worker\n',
  );
  executable(
    join(shim, 'security'),
    `case "$*" in
  *aivideo-db-password*) echo db-secret ;;
  *aivideo-rclone-config-pass*) echo rclone-secret ;;
  *) exit 44 ;;
esac`,
  );
  executable(
    join(shim, 'npx'),
    `{
  echo "args=$*"
  echo "cwd=$PWD"
  echo "db=$DATABASE_URL"
  echo "rclone=$RCLONE_CONFIG_PASS"
  echo "worker=$WORKER_ID"
} > "$RECORD"`,
  );
});

describe('backfill-drive-ids.sh', () => {
  test('dry-runs by default, with the secrets from the Keychain', () => {
    const result = run();

    expect(result.status, result.stderr).toBe(0);
    const seen = readFileSync(recorded, 'utf8');
    expect(seen).toContain('args=tsx src/tools/backfill-drive-ids.ts --dry-run');
    expect(seen).toContain('/aivideo/repo/worker');
    expect(seen).toContain('db=postgres://worker:db-secret@db.test:5432/aivideo');
    expect(seen).toContain('rclone=rclone-secret');
    expect(seen).toContain('worker=mac-mini-m4');
  });

  test('saves only with --save', () => {
    const result = run(['--save']);

    expect(result.status, result.stderr).toBe(0);
    const seen = readFileSync(recorded, 'utf8');
    expect(seen).toContain('args=tsx src/tools/backfill-drive-ids.ts\n');
    expect(seen).not.toContain('--dry-run');
  });

  test('refuses an unknown argument rather than guessing', () => {
    const result = run(['--force']);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('--save');
  });

  test('says to update the worker when the tool is not there yet', () => {
    const missing = spawnSync('bash', [SCRIPT], {
      encoding: 'utf8',
      env: {
        PATH: `${shim}:/usr/bin:/bin`,
        HOME: root,
        AIVIDEO_ROOT: join(root, 'aivideo'),
        AIVIDEO_REPO: join(root, 'old-repo'),
        RECORD: recorded,
      },
    });

    expect(missing.status).not.toBe(0);
    expect(missing.stderr).toContain('update');
  });

  test('never prints a secret', () => {
    const result = run();

    expect(result.stdout + result.stderr).not.toContain('secret');
  });
});
