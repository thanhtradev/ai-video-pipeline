import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db.js';
import { decide, jobs, OWNER, succeed } from '../helpers/episode-flow.js';
import { versionStatus } from '../helpers/fixtures.js';

// ops/postgres/cancel-videos.sql (D-094): the owner cancels a list of videos by id prefix, dry run
// unless apply=1; each video is independent and nothing is deleted.

const SCRIPT = fileURLToPath(new URL('../../../ops/postgres/cancel-videos.sql', import.meta.url));
const run = promisify(execFile);

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
  await db.pool.query(`INSERT INTO approver (telegram_user_id, name) VALUES ($1, 'owner')`, [
    OWNER,
  ]);
});

afterAll(async () => {
  await db.drop();
});

interface Row {
  prefix: string;
  video_id: string;
  from_status: string;
  result: string;
  jobs_cancelled: string;
}

/** Runs the script with psql; returns its result rows (unaligned, |-separated). */
async function cancel(ids: string, apply = false): Promise<Row[]> {
  const args = [db.url, '-X', '-q', '-A', '-F', '|', '-v', 'ON_ERROR_STOP=1', '-v', `ids=${ids}`];
  if (apply) args.push('-v', 'apply=1');
  const { stdout } = await run('psql', [...args, '-f', SCRIPT]);
  const lines = stdout.trim().split('\n');
  const header = lines.findIndex((line) => line.startsWith('prefix|'));
  const keys = lines[header]!.split('|');
  return lines
    .slice(header + 1)
    .filter((line) => line.includes('|'))
    .map((line) => Object.fromEntries(line.split('|').map((v, i) => [keys[i], v])) as Row);
}

async function submitted(name: string) {
  return (
    await db.pool.query<{ video_id: string; version_id: string; job_id: string }>(
      'SELECT * FROM video_submit($1, $2::jsonb)',
      [name, JSON.stringify({ format: 'episode', topic: `Tập ${name}` })],
    )
  ).rows[0]!;
}

/** A video whose script is done and waits for A1. */
async function awaitingScript(name: string) {
  const video = await submitted(name);
  await succeed(db.pool, video.job_id, {
    outputs: [{ path: 'script.json', bytes: 1, sha256: 'a'.repeat(64) }],
    result: { format: 'episode', title: 'Mèo', scenes: [{ narration: 'Một.' }] },
  });
  const a1 = (
    await db.pool.query<{ token: string; video_version_id: string }>(
      'SELECT token, video_version_id FROM script_approvals_due()',
    )
  ).rows.find((row) => row.video_version_id === video.version_id)!;
  return { ...video, token: a1.token };
}

const short = (id: string) => id.slice(0, 8);

describe('cancel-videos.sql', () => {
  test('a dry run reports and changes nothing', async () => {
    const video = await submitted('cancel-dry');

    const rows = await cancel(short(video.video_id));

    expect(rows).toEqual([
      {
        prefix: short(video.video_id),
        video_id: video.video_id,
        from_status: 'SCRIPTING',
        result: 'WOULD_CANCEL',
        jobs_cancelled: '1',
      },
    ]);
    expect(await versionStatus(db.pool, video.version_id)).toBe('SCRIPTING');
    expect((await jobs(db.pool, video.version_id))[0]!.status).not.toBe('CANCELLED');
  });

  test('apply cancels each video, its open jobs and pending approvals', async () => {
    const scripting = await submitted('cancel-scripting');
    const waiting = await awaitingScript('cancel-waiting');
    await db.pool.query('UPDATE video_version SET auto_approve_by = $1 WHERE id = $2', [
      OWNER,
      waiting.version_id,
    ]);

    const rows = await cancel(`${short(scripting.video_id)}, ${short(waiting.video_id)}`, true);

    expect(rows.map((row) => [row.from_status, row.result, row.jobs_cancelled])).toEqual([
      ['SCRIPTING', 'CANCELLED', '1'],
      ['AWAITING_SCRIPT_APPROVAL', 'CANCELLED', '0'],
    ]);
    expect(await versionStatus(db.pool, scripting.version_id)).toBe('CANCELLED');
    expect(await versionStatus(db.pool, waiting.version_id)).toBe('CANCELLED');
    expect((await jobs(db.pool, scripting.version_id))[0]!.status).toBe('CANCELLED');
    const approval = await db.pool.query<{ status: string }>(
      'SELECT status FROM approval WHERE token = $1',
      [waiting.token],
    );
    expect(approval.rows[0]!.status).toBe('SUPERSEDED');
    const auto = await db.pool.query<{ auto_approve_by: string | null }>(
      'SELECT auto_approve_by FROM video_version WHERE id = $1',
      [waiting.version_id],
    );
    expect(auto.rows[0]!.auto_approve_by).toBeNull();
    expect((await decide(db.pool, waiting.token, 'APPROVE')).result).not.toBe('OK');

    const audit = await db.pool.query<{ actor: string; detail: { from_status: string } }>(
      `SELECT actor, detail FROM audit_log WHERE action = 'video_cancelled' AND object_id = $1`,
      [waiting.version_id],
    );
    expect(audit.rows[0]!.actor).toMatch(/^rollout:/);
    expect(audit.rows[0]!.detail.from_status).toBe('AWAITING_SCRIPT_APPROVAL');
  });

  test('unknown, malformed and finished ids are reported; the others are still cancelled', async () => {
    const done = await submitted('cancel-done');
    await db.pool.query(`UPDATE video_version SET status = 'CANCELLED' WHERE id = $1`, [
      done.version_id,
    ]);
    const live = await submitted('cancel-live');

    const rows = await cancel(`ffffffff zz ${short(done.video_id)} ${short(live.video_id)}`, true);

    expect(rows.map((row) => [row.prefix, row.result])).toEqual([
      ['ffffffff', 'NOT_FOUND'],
      ['zz', 'NOT_FOUND'],
      [short(done.video_id), 'ALREADY_CANCELLED'],
      [short(live.video_id), 'CANCELLED'],
    ]);
    expect(await versionStatus(db.pool, live.version_id)).toBe('CANCELLED');
  });

  test('a cancelled video gets no new jobs from the dispatcher', async () => {
    const video = await submitted('cancel-dispatch');
    await cancel(short(video.video_id), true);

    await db.pool.query('SELECT job_promote()');
    const claimed = await db.pool.query<{ id: string }>(
      `SELECT j.id FROM job j WHERE j.video_version_id = $1 AND j.status IN ('READY', 'QUEUED', 'RUNNING')`,
      [video.version_id],
    );
    expect(claimed.rows).toEqual([]);
  });
});
