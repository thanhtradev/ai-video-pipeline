/**
 * The deployer (D-100): one poll of the database, at most one action, then exit. It runs in its
 * own launchd/systemd job, not in the worker, because a process that restarts its own service is
 * killed mid-update. The state machine is in SQL (deploy_poll and friends); this only runs
 * commands and reports what came back. Agents never run it (D-011).
 */

const COMMIT_ID = /^[0-9a-f]{40}$/;
const MIGRATION_FILE = /^db\/migrations\/(\d+)_[^/]+\.sql$/;
const MAX_REPORTED_OUTPUT = 800;
const MAX_LISTED_COMMITS = 15;
const SSH_CONNECT_TIMEOUT_SECONDS = 10;
const CHILD_ENV_NAMES = ['PATH', 'HOME', 'AIVIDEO_ROOT', 'LANG', 'SSH_AUTH_SOCK'] as const;

export type DeployAction = 'NONE' | 'PREFLIGHT' | 'UPDATE_WORKER' | 'UPDATE_N8N';

export interface DeployPoll {
  action: DeployAction;
  requestId: string | null;
  sha: string | null;
  lastSha: string | null;
  target: string | null;
}

export interface PreflightResult {
  sha: string | null;
  commits: string | null;
  migrations: string[];
  error: string | null;
}

export interface RunResult {
  code: number;
  output: string;
}

export interface DeployStore {
  poll(): Promise<DeployPoll>;
  reportPreflight(requestId: string, result: PreflightResult): Promise<unknown>;
  reportTarget(requestId: string, target: string, ok: boolean, detail: string): Promise<boolean>;
}

export interface DeployerDeps {
  workerId: string;
  canDeployN8n: boolean;
  repoDir: string;
  platform: NodeJS.Platform;
  pveHost: string;
  n8nEnvExists: () => boolean;
  store: DeployStore;
  run: (command: string, args: string[]) => Promise<RunResult>;
  logger: { info(obj: object, msg: string): void; error(obj: object, msg: string): void };
}

/** The end of a command's output, with any password in a URL hidden, for a Telegram message. */
export function sanitizeOutput(output: string): string {
  return output
    .replace(/(:\/\/[^\s:/@]+:)[^\s@/]+@/g, '$1***@')
    .trim()
    .slice(-MAX_REPORTED_OUTPUT);
}

/** The scripts get only what they need: never the database URL or any other secret. */
export function childEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(
    CHILD_ENV_NAMES.flatMap((name) => (env[name] === undefined ? [] : [[name, env[name]]])),
  ) as NodeJS.ProcessEnv;
}

class PreflightError extends Error {}

async function preflightStep(
  deps: DeployerDeps,
  label: string,
  command: string,
  args: string[],
): Promise<string> {
  const { code, output } = await deps.run(command, args);
  if (code !== 0) throw new PreflightError(`${label} failed: ${sanitizeOutput(output)}`);
  return output;
}

async function readOriginMain(deps: DeployerDeps): Promise<PreflightResult> {
  const git = (...args: string[]) => ['-C', deps.repoDir, ...args];
  await preflightStep(deps, 'git fetch', 'git', git('fetch', 'origin'));
  const sha = (
    await preflightStep(deps, 'reading origin/main', 'git', git('rev-parse', 'origin/main'))
  ).trim();
  if (!COMMIT_ID.test(sha)) throw new PreflightError(`origin/main gave no commit id: ${sha}`);

  const log = await deps.run(
    'git',
    git('log', '--oneline', `-n${MAX_LISTED_COMMITS}`, `HEAD..${sha}`),
  );
  const files = await preflightStep(
    deps,
    'listing migrations',
    'git',
    git('ls-tree', '--name-only', sha, 'db/migrations/'),
  );
  await preflightStep(deps, 'ssh to Proxmox', 'ssh', [
    '-o',
    'BatchMode=yes',
    '-o',
    `ConnectTimeout=${SSH_CONNECT_TIMEOUT_SECONDS}`,
    deps.pveHost,
    'true',
  ]);
  if (!deps.n8nEnvExists()) throw new PreflightError('ops/n8n/deploy.env is missing');

  return {
    sha,
    commits: log.code === 0 ? log.output.trim() : '',
    migrations: files
      .split('\n')
      .flatMap((file) => MIGRATION_FILE.exec(file.trim())?.slice(1, 2) ?? []),
    error: null,
  };
}

async function runPreflight(deps: DeployerDeps, requestId: string): Promise<void> {
  let result: PreflightResult;
  try {
    result = await readOriginMain(deps);
  } catch (error) {
    if (!(error instanceof PreflightError)) throw error;
    result = { sha: null, commits: null, migrations: [], error: error.message };
  }
  await deps.store.reportPreflight(requestId, result);
}

function updateScript(deps: DeployerDeps): string {
  const service = deps.platform === 'darwin' ? 'launchd' : 'systemd';
  return `${deps.repoDir}/ops/${service}/update-worker.sh`;
}

async function updateWorker(deps: DeployerDeps, sha: string): Promise<RunResult> {
  return deps.run('bash', [updateScript(deps), sha]);
}

async function updateN8n(
  deps: DeployerDeps,
  sha: string,
  lastSha: string | null,
): Promise<RunResult & { skipped?: boolean }> {
  const git = (...args: string[]) => ['-C', deps.repoDir, ...args];
  if (lastSha !== null && COMMIT_ID.test(lastSha)) {
    const diff = await deps.run('git', git('diff', '--quiet', lastSha, sha, '--', 'n8n/workflows'));
    if (diff.code === 0) return { code: 0, output: 'workflows unchanged', skipped: true };
  }
  const checkout = await deps.run('git', git('checkout', 'main'));
  if (checkout.code !== 0) return checkout;
  const merge = await deps.run('git', git('merge', '--ff-only', sha));
  if (merge.code !== 0) return merge;
  return deps.run('bash', [`${deps.repoDir}/ops/n8n/deploy-workflows.sh`]);
}

async function runTarget(deps: DeployerDeps, poll: DeployPoll): Promise<void> {
  const requestId = poll.requestId!;
  const target = poll.target!;
  const sha = poll.sha ?? '';
  if (!COMMIT_ID.test(sha)) {
    await deps.store.reportTarget(requestId, target, false, 'no valid commit id to deploy');
    return;
  }
  deps.logger.info({ target, sha }, 'deploy: updating');
  const result =
    poll.action === 'UPDATE_N8N'
      ? await updateN8n(deps, sha, poll.lastSha)
      : await updateWorker(deps, sha);
  const ok = result.code === 0;
  const skipped = 'skipped' in result && result.skipped === true;
  const detail = !ok || skipped ? sanitizeOutput(result.output) : '';
  const accepted = await deps.store.reportTarget(requestId, target, ok, detail);
  deps.logger.info({ target, sha, ok, accepted }, 'deploy: target finished');
}

export async function runDeployerOnce(deps: DeployerDeps): Promise<void> {
  const poll = await deps.store.poll();
  if (poll.action === 'NONE') return;
  if (poll.action === 'PREFLIGHT') {
    await runPreflight(deps, poll.requestId!);
    return;
  }
  await runTarget(deps, poll);
}
