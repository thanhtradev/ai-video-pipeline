import { resolve } from 'node:path';
import pg from 'pg';
import pino from 'pino';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createPgStore } from './store.js';

const POOL_SIZE = 4;

const config = loadConfig(process.env);
const logger = pino({ level: config.LOG_LEVEL });
const pool = new pg.Pool({ connectionString: config.DATABASE_URL, max: POOL_SIZE });
// An idle client losing its connection must not take the process down.
pool.on('error', (error) => logger.error({ err: error.message }, 'database connection lost'));

const app = await buildApp({
  store: createPgStore(pool),
  publicOrigin: config.WEB_PUBLIC_ORIGIN,
  uiDir: resolve(config.WEB_UI_DIR),
  logger,
});

async function shutdown(): Promise<void> {
  await app.close();
  await pool.end();
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    shutdown().catch((error: unknown) => {
      logger.error({ err: error instanceof Error ? error.message : String(error) }, 'stop failed');
      process.exitCode = 1;
    });
  });
}

await app.listen({ host: config.WEB_HOST, port: config.WEB_PORT });
logger.info({ port: config.WEB_PORT }, 'web console listening');
