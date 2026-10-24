import { fileURLToPath } from 'node:url';
import { Redis } from 'ioredis';
import pg from 'pg';
import { buildApi } from './api.js';
import { createClaudeCli } from './claude/claude-cli.js';
import { loadConfig, type Config } from './config.js';
import { createJobStore } from './db/job-store.js';
import { createScriptHandler } from './handlers/script.js';
import { simulateHandler } from './handlers/simulate.js';
import { createLogger, redactUrl } from './logger.js';
import { createRedisQueue } from './queue/redis-queue.js';
import type { JobHandler } from './runner.js';
import { createRedisNonceStore } from './security/redis-nonce-store.js';
import { createWorkerLoop } from './worker-loop.js';

const SHUTDOWN_TIMEOUT_MS = 5 * 60 * 1000;

const CLAUDE_SETTINGS = fileURLToPath(
  new URL('../../ops/claude/pipeline-settings.json', import.meta.url),
);
// Non-secret variables the Claude Code CLI needs (HOME for its login); nothing else is passed.
const CLAUDE_ENV_KEYS = ['PATH', 'HOME', 'USER', 'LOGNAME', 'TMPDIR', 'LANG'] as const;

function claudeEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(CLAUDE_ENV_KEYS.flatMap((key) => (env[key] ? [[key, env[key]]] : [])));
}

// Step name -> handler. Phase 2 adds tts, visuals, render, qa, archive.
function buildHandlers(config: Config): ReadonlyMap<string, JobHandler> {
  const claude = createClaudeCli({
    bin: config.claude.bin,
    settingsPath: CLAUDE_SETTINGS,
    timeoutMs: config.claude.timeoutSeconds * 1000,
    blockSeconds: config.claude.blockSeconds,
    env: claudeEnv(process.env),
    ...(config.claude.model ? { model: config.claude.model } : {}),
  });
  return new Map([
    ['simulate', simulateHandler],
    ['script', createScriptHandler({ claude })],
  ]);
}

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const logger = createLogger({ level: config.logLevel });
  logger.info(
    {
      workerId: config.workerId,
      streams: config.workerStreams,
      database: redactUrl(config.databaseUrl),
      redis: redactUrl(config.redisUrl),
    },
    'worker starting',
  );

  const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 4 });
  pool.on('error', (error) => logger.error({ err: error.message }, 'postgres pool error'));
  const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: 3 });
  redis.on('error', (error) => logger.error({ err: error.message }, 'redis error'));

  const queue = createRedisQueue(redis, {
    workerId: config.workerId,
    streams: config.workerStreams,
  });
  const recovered = await queue.recoverInFlight();
  if (recovered > 0) logger.warn({ recovered }, 'returned in-flight messages to the queue');

  const loop = createWorkerLoop({
    store: createJobStore(pool),
    queue,
    handlers: buildHandlers(config),
    workRoot: config.workRoot,
    workerId: config.workerId,
    streams: config.workerStreams,
    leaseSeconds: config.leaseSeconds,
    heartbeatMs: config.heartbeatSeconds * 1000,
    pollIntervalMs: config.pollIntervalMs,
    logger,
  });

  const api = await buildApi({
    workerId: config.workerId,
    streams: config.workerStreams,
    clientKeys: config.apiClientKeys,
    nonces: createRedisNonceStore(redis),
    activeJobs: loop.activeJobs,
    logger,
  });
  await api.listen({ host: config.apiHost, port: config.apiPort });
  loop.start();
  logger.info({ host: config.apiHost, port: config.apiPort }, 'worker ready');

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down; finishing current job');
    const forceExit = setTimeout(() => {
      logger.error('shutdown timed out; lease watchdog will recover the job');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    await loop.stop();
    await api.close();
    await Promise.all([pool.end(), redis.quit()]);
    clearTimeout(forceExit);
    process.exit(0);
  };
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((error: unknown) => {
  // Config errors never contain secret values (see loadConfig).
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
