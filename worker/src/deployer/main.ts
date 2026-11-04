import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { z } from 'zod';
import { createLogger } from '../logger.js';
import { childEnv, runDeployerOnce, type RunResult } from './deployer.js';
import { createDeployStore } from './store.js';

// Entry point of one deployer run (D-100): ops/launchd/run-deployer.sh or
// ops/systemd/run-deployer.sh every 30 s. Imports are static on purpose: npm ci replaces
// node_modules while this process waits for the update script.

/** Below the 30 min limit of deploy_notices_due(), so a stuck script is reported, not lost. */
const COMMAND_TIMEOUT_MS = 25 * 60 * 1000;
const KEPT_OUTPUT_CHARS = 20_000;

const Env = z.object({
  DATABASE_URL: z.string().min(1),
  WORKER_ID: z.string().regex(/^[a-z0-9-]{3,64}$/),
  AIVIDEO_ROOT: z.string().optional(),
  DEPLOY_N8N: z.string().optional(),
  PVE_HOST: z
    .string()
    .regex(/^[a-zA-Z0-9.-]+$/)
    .default('pve'),
  LOG_LEVEL: z.string().default('info'),
});

function runCommand(command: string, args: string[]): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      env: childEnv(process.env),
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: COMMAND_TIMEOUT_MS,
    });
    let output = '';
    const keep = (chunk: Buffer) => {
      output = (output + chunk.toString('utf8')).slice(-KEPT_OUTPUT_CHARS);
    };
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);
    child.on('error', (error) => resolve({ code: -1, output: error.message }));
    child.on('close', (code) => resolve({ code: code ?? -1, output }));
  });
}

async function main(): Promise<void> {
  const env = Env.parse(process.env);
  const logger = createLogger({ level: env.LOG_LEVEL });
  const repoDir = join(env.AIVIDEO_ROOT ?? join(homedir(), 'aivideo'), 'repo');
  const canDeployN8n = env.DEPLOY_N8N === '1';
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 1 });
  try {
    await runDeployerOnce({
      workerId: env.WORKER_ID,
      canDeployN8n,
      repoDir,
      platform: process.platform,
      pveHost: env.PVE_HOST,
      n8nEnvExists: () => existsSync(join(repoDir, 'ops/n8n/deploy.env')),
      store: createDeployStore(pool, env.WORKER_ID, canDeployN8n),
      run: runCommand,
      logger,
    });
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  // Before the logger may exist; no secret reaches here (the URL is only inside pg's pool).
  process.stderr.write(`deployer failed: ${error instanceof Error ? error.message : 'unknown'}\n`);
  process.exitCode = 1;
});
