import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { createTestDb, type TestDb } from '../../worker/test/helpers/db.js';
import { createBatch, createJob, createVideo } from '../../worker/test/helpers/fixtures.js';
import { buildApp } from '../server/app.js';
import { createPgStore } from '../server/store.js';

// A real service and database with a few videos, for the browser tests. Local containers only.

const GRANTS_SQL = new URL('../../ops/postgres/grants.sql', import.meta.url);
const UI_DIR = fileURLToPath(new URL('../dist/ui', import.meta.url));
const PORT = 8791;
export const BASE_URL = `http://localhost:${PORT}`;
export const OWNER = 111;

const STEPS = ['script', 'tts', 'timing', 'storyboard', 'episode_code', 'render', 'qa', 'archive'];

export interface Harness {
  db: TestDb;
  app: FastifyInstance;
  webPool: pg.Pool;
  videos: { approval: string; stopped: string; running: string };
}

async function ensureRole(db: TestDb, role: string): Promise<void> {
  await db.pool.query(`
    DO $$ BEGIN
      CREATE ROLE ${role} NOLOGIN;
    EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL;
    END $$;`);
}

async function seedVideo(
  db: TestDb,
  sequence: number,
  batchId: string,
  topic: string,
  statuses: string[],
  versionStatus?: string,
): Promise<{ videoId: string; versionId: string }> {
  const { videoId, versionId } = await createVideo(db.pool, batchId, sequence);
  await db.pool.query(
    `UPDATE video_version SET brief = jsonb_set(brief, '{topic}', to_jsonb($2::text)) WHERE id = $1`,
    [versionId, topic],
  );
  for (const [index, step] of STEPS.entries()) {
    const jobId = await createJob(db.pool, versionId, step);
    const status = statuses[index] ?? 'PENDING';
    // Seeding jumps straight to a state, past the transition triggers.
    await db.pool.query(
      `BEGIN;
       SET LOCAL session_replication_role = replica;
       UPDATE job SET status = '${status}', last_error = ${status.startsWith('FAILED') ? `'render crashed: Page crashed!'` : 'NULL'} WHERE id = '${jobId}';
       COMMIT;`,
    );
  }
  if (versionStatus) {
    await db.pool.query('UPDATE video_version SET status = $2 WHERE id = $1', [
      versionId,
      versionStatus,
    ]);
  }
  return { videoId, versionId };
}

export async function startHarness(): Promise<Harness> {
  const db = await createTestDb();
  for (const role of ['aivideo_n8n', 'aivideo_worker', 'aivideo_web']) await ensureRole(db, role);
  await db.pool.query(await readFile(GRANTS_SQL, 'utf8'));
  await db.pool.query(
    `INSERT INTO approver (telegram_user_id, name, is_owner) VALUES ($1, 'Owner', true)`,
    [OWNER],
  );
  await db.pool.query(
    `INSERT INTO worker (id, capabilities, last_seen_at)
     VALUES ('mac-mini-m4', '{q:render}', now()),
            ('hp-400-g7', '{q:render}', now() - interval '1 hour')`,
  );

  const batchId = await createBatch(db.pool, 'e2e');
  const done = (count: number): string[] => Array.from({ length: count }, () => 'SUCCEEDED');
  const approval = await seedVideo(db, 1, batchId, 'Nếu Trái Đất ngừng quay', done(3));
  await db.pool.query(`SELECT approval_request($1, 'SCRIPT', 'h1', interval '24 hours')`, [
    approval.versionId,
  ]);
  const stopped = await seedVideo(
    db,
    2,
    batchId,
    'Vì sao bầu trời màu xanh',
    [...done(4), 'FAILED_PERMANENT'],
    'NEEDS_DECISION',
  );
  const running = await seedVideo(db, 3, batchId, 'Hành trình của một giọt nước', [
    ...done(5),
    'RUNNING',
  ]);

  const url = new URL(db.url);
  url.searchParams.set('options', '-c role=aivideo_web');
  const webPool = new pg.Pool({ connectionString: url.toString(), max: 3 });
  const app = await buildApp({
    store: createPgStore(webPool),
    publicOrigin: BASE_URL,
    uiDir: UI_DIR,
    loginPerMinute: 1000,
  });
  await app.listen({ host: '127.0.0.1', port: PORT });
  return {
    db,
    app,
    webPool,
    videos: { approval: approval.videoId, stopped: stopped.videoId, running: running.videoId },
  };
}

export async function stopHarness(harness: Harness): Promise<void> {
  await harness.app.close();
  await harness.webPool.end();
  await harness.db.drop();
}

export async function loginLink(harness: Harness, user = OWNER): Promise<string> {
  const { rows } = await harness.db.pool.query<{ token: string }>(
    'SELECT token FROM telegram_web_login($1, true)',
    [user],
  );
  return `${BASE_URL}/login?t=${rows[0]!.token}`;
}
