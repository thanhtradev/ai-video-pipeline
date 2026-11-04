import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test, vi } from 'vitest';
import {
  childEnv,
  runDeployerOnce,
  sanitizeOutput,
  type DeployerDeps,
  type DeployPoll,
  type RunResult,
} from '../../src/deployer/deployer.js';

// The deployer process (D-100): one poll, one action. Commands go through a fake runner here; only
// the user's rollout runs it on a real machine.

const SHA = 'a'.repeat(40);
const LAST = 'b'.repeat(40);
const REQUEST = '11111111-1111-4111-8111-111111111111';
const WORKER = 'mac-mini-m4';
const REPO = '/home/aivideo/aivideo/repo';

type Reply = Partial<RunResult>;

function setup(
  poll: DeployPoll,
  replies: Record<string, Reply> = {},
  overrides: Partial<DeployerDeps> = {},
) {
  const calls: string[] = [];
  const preflight = vi.fn(async () => undefined);
  const target = vi.fn(async () => true);
  const deps: DeployerDeps = {
    workerId: WORKER,
    canDeployN8n: true,
    repoDir: REPO,
    platform: 'darwin',
    pveHost: 'pve',
    n8nEnvExists: () => true,
    store: {
      poll: async () => poll,
      reportPreflight: preflight,
      reportTarget: target,
    },
    run: async (command, args) => {
      const line = [command, ...args].join(' ');
      calls.push(line);
      const key = Object.keys(replies).find((k) => line.includes(k));
      return { code: 0, output: '', ...(key ? replies[key] : {}) };
    },
    logger: { info: () => undefined, error: () => undefined },
    ...overrides,
  };
  return { deps, calls, preflight, target };
}

const none: DeployPoll = {
  action: 'NONE',
  requestId: null,
  sha: null,
  lastSha: null,
  target: null,
};

describe('runDeployerOnce', () => {
  test('does nothing when there is nothing to do', async () => {
    const { deps, calls, preflight, target } = setup(none);
    await runDeployerOnce(deps);
    expect(calls).toEqual([]);
    expect(preflight).not.toHaveBeenCalled();
    expect(target).not.toHaveBeenCalled();
  });

  describe('preflight', () => {
    const poll: DeployPoll = { ...none, action: 'PREFLIGHT', requestId: REQUEST };

    test('reports the commit, its commits and migration versions, read from origin/main', async () => {
      const { deps, calls, preflight } = setup(poll, {
        'rev-parse': { output: `${SHA}\n` },
        'log --oneline': { output: 'abc feat: x\ndef fix: y\n' },
        'ls-tree': {
          output:
            'db/migrations/20261125000100_help_last_stopped.sql\ndb/migrations/20261125000200_command_confirm.sql\n',
        },
      });

      await runDeployerOnce(deps);

      expect(calls[0]).toContain('fetch origin');
      expect(calls.some((line) => line.includes('ssh') && line.includes('BatchMode=yes'))).toBe(
        true,
      );
      expect(preflight).toHaveBeenCalledWith(REQUEST, {
        sha: SHA,
        commits: 'abc feat: x\ndef fix: y',
        migrations: ['20261125000100', '20261125000200'],
        error: null,
      });
    });

    test.each([
      ['fetch origin', 'git fetch'],
      ['rev-parse', 'origin/main'],
      ['ls-tree', 'migrations'],
      ['BatchMode', 'ssh'],
    ])('a failing %s refuses with the reason', async (step, reason) => {
      const { deps, preflight } = setup(poll, {
        'rev-parse': { output: `${SHA}\n` },
        [step]: { code: 1, output: 'boom' },
      });

      await runDeployerOnce(deps);

      const report = preflight.mock.calls[0]! as unknown as [string, { error: string }];
      expect(report[1].error).toContain(reason);
      expect(report[1].error).toContain('boom');
    });

    test('refuses when ops/n8n/deploy.env is missing', async () => {
      const { deps, preflight } = setup(
        poll,
        { 'rev-parse': { output: `${SHA}\n` } },
        { n8nEnvExists: () => false },
      );

      await runDeployerOnce(deps);

      const report = preflight.mock.calls[0]! as unknown as [string, { error: string }];
      expect(report[1].error).toContain('deploy.env');
    });

    test('refuses a commit id that is not one', async () => {
      const { deps, preflight } = setup(poll, { 'rev-parse': { output: 'not a sha\n' } });

      await runDeployerOnce(deps);

      const report = preflight.mock.calls[0]! as unknown as [string, { error: string }];
      expect(report[1].error).toContain('commit');
    });
  });

  describe('a worker target', () => {
    const poll: DeployPoll = {
      ...none,
      action: 'UPDATE_WORKER',
      requestId: REQUEST,
      sha: SHA,
      target: WORKER,
    };

    test.each([
      ['darwin', 'ops/launchd/update-worker.sh'],
      ['linux', 'ops/systemd/update-worker.sh'],
    ] as const)('on %s runs its update script with the commit', async (platform, script) => {
      const { deps, calls, target } = setup(poll, {}, { platform });

      await runDeployerOnce(deps);

      expect(calls).toEqual([`bash ${REPO}/${script} ${SHA}`]);
      expect(target).toHaveBeenCalledWith(REQUEST, WORKER, true, '');
    });

    test('reports a failure with the end of the output', async () => {
      const { deps, target } = setup(poll, {
        'update-worker.sh': { code: 1, output: 'x'.repeat(5000) + 'npm ci failed' },
      });

      await runDeployerOnce(deps);

      const report = target.mock.calls[0]! as unknown as [string, string, boolean, string];
      expect(report[2]).toBe(false);
      expect(report[3]).toContain('npm ci failed');
      expect(report[3].length).toBeLessThanOrEqual(800);
    });

    test('refuses a commit id that is not one, running nothing', async () => {
      const { deps, calls, target } = setup({ ...poll, sha: 'main; rm -rf /' });

      await runDeployerOnce(deps);

      expect(calls).toEqual([]);
      expect(target).toHaveBeenCalledWith(
        REQUEST,
        WORKER,
        false,
        expect.stringContaining('commit'),
      );
    });
  });

  describe('the n8n target', () => {
    const poll: DeployPoll = {
      ...none,
      action: 'UPDATE_N8N',
      requestId: REQUEST,
      sha: SHA,
      lastSha: LAST,
      target: 'n8n',
    };

    test('skips publishing when the workflows did not change', async () => {
      const { deps, calls, target } = setup(poll);

      await runDeployerOnce(deps);

      expect(
        calls.some((line) => line.includes(`diff --quiet ${LAST} ${SHA} -- n8n/workflows`)),
      ).toBe(true);
      expect(calls.some((line) => line.includes('deploy-workflows.sh'))).toBe(false);
      expect(target).toHaveBeenCalledWith(REQUEST, 'n8n', true, 'workflows unchanged');
    });

    test('publishes from the confirmed commit when they changed', async () => {
      const { deps, calls, target } = setup(poll, { 'diff --quiet': { code: 1 } });

      await runDeployerOnce(deps);

      const merge = calls.findIndex((line) => line.includes(`merge --ff-only ${SHA}`));
      const publish = calls.findIndex((line) => line.includes('ops/n8n/deploy-workflows.sh'));
      expect(merge).toBeGreaterThanOrEqual(0);
      expect(publish).toBeGreaterThan(merge);
      expect(target).toHaveBeenCalledWith(REQUEST, 'n8n', true, '');
    });

    test('publishes when no earlier deploy is known', async () => {
      const { deps, calls } = setup({ ...poll, lastSha: null });

      await runDeployerOnce(deps);

      expect(calls.some((line) => line.includes('diff --quiet'))).toBe(false);
      expect(calls.some((line) => line.includes('deploy-workflows.sh'))).toBe(true);
    });

    test('reports a failed publish and does not hide a failed fast-forward', async () => {
      const publish = setup(poll, {
        'diff --quiet': { code: 1 },
        'deploy-workflows.sh': { code: 1, output: 'n8n did not answer' },
      });
      await runDeployerOnce(publish.deps);
      expect(publish.target).toHaveBeenCalledWith(REQUEST, 'n8n', false, 'n8n did not answer');

      const merge = setup(poll, {
        'diff --quiet': { code: 1 },
        'merge --ff-only': { code: 1, output: 'not possible' },
      });
      await runDeployerOnce(merge.deps);
      expect(merge.target).toHaveBeenCalledWith(REQUEST, 'n8n', false, 'not possible');
      expect(merge.calls.some((line) => line.includes('deploy-workflows.sh'))).toBe(false);
    });
  });
});

describe('sanitizeOutput', () => {
  test('hides passwords in URLs and keeps the end', () => {
    const out = sanitizeOutput('connect postgres://user:s3cret@10.0.0.1:5432/db failed');
    expect(out).not.toContain('s3cret');
    expect(out).toContain('failed');
  });

  test('caps the length', () => {
    expect(sanitizeOutput('a'.repeat(5000)).length).toBeLessThanOrEqual(800);
  });
});

describe('childEnv', () => {
  test('passes only what the scripts need, never the database URL', () => {
    const env = childEnv({
      PATH: '/bin',
      HOME: '/home/x',
      AIVIDEO_ROOT: '/home/x/aivideo',
      DATABASE_URL: 'postgres://u:p@h/db',
      REDIS_URL: 'redis://x',
    });
    expect(env).toEqual({ PATH: '/bin', HOME: '/home/x', AIVIDEO_ROOT: '/home/x/aivideo' });
  });
});

describe('update-worker.sh', () => {
  test.each(['launchd', 'systemd'])('%s fast-forwards to the commit it is given', (service) => {
    const script = readFileSync(
      fileURLToPath(new URL(`../../../ops/${service}/update-worker.sh`, import.meta.url)),
      'utf8',
    );
    expect(script).toContain('git merge --ff-only "$SHA"');
    expect(script).toContain('git pull --ff-only');
    expect(script).toContain('wait_healthy');
  });
});
