import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import pg from 'pg';

const execFileAsync = promisify(execFile);

// Local docker-compose.test.yml only; never a production host.
const ADMIN_URL = process.env.TEST_PG_ADMIN_URL ?? 'postgres://test:test@127.0.0.1:55432/test';
const MIGRATIONS_DIR = fileURLToPath(new URL('../../../db/migrations', import.meta.url));

export interface TestDb {
  pool: pg.Pool;
  url: string;
  drop: () => Promise<void>;
}

function databaseUrl(name: string): string {
  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  url.searchParams.set('sslmode', 'disable');
  return url.toString();
}

export async function runDbmate(url: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(
    'npx',
    ['dbmate', '--migrations-dir', MIGRATIONS_DIR, '--no-dump-schema', ...args],
    { env: { ...process.env, DATABASE_URL: url } },
  );
  return stdout;
}

export async function createTestDb(): Promise<TestDb> {
  const name = `t_${randomBytes(6).toString('hex')}`;
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${name}`);
  } finally {
    await admin.end();
  }

  const url = databaseUrl(name);
  await runDbmate(url, ['up']);

  const pool = new pg.Pool({ connectionString: url, max: 5 });
  return {
    pool,
    url,
    drop: async () => {
      await pool.end();
      const cleanup = new pg.Client({ connectionString: ADMIN_URL });
      await cleanup.connect();
      try {
        await cleanup.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      } finally {
        await cleanup.end();
      }
    },
  };
}
