import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db.js';
import { succeed } from '../helpers/episode-flow.js';

// ops/postgres/claude-usage.sql (Q-004): what the Claude steps of recent videos used, read from
// the `claude` field of each succeeded job's result. Read-only.

const SCRIPT = fileURLToPath(new URL('../../../ops/postgres/claude-usage.sql', import.meta.url));
const run = promisify(execFile);

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(async () => {
  await db.drop();
});

type Row = Record<string, string>;

/** Runs the report with psql; returns the rows of the table whose header starts with `step|`. */
async function report(video?: string): Promise<Row[]> {
  const args = [db.url, '-X', '-q', '-A', '-F', '|', '-v', 'ON_ERROR_STOP=1'];
  if (video) args.push('-v', `video=${video}`);
  const { stdout } = await run('psql', [...args, '-f', SCRIPT]);
  const lines = stdout.trim().split('\n');
  const header = lines.findIndex((line) => line.startsWith('step|'));
  const keys = lines[header]!.split('|');
  return lines
    .slice(header + 1)
    .filter((line) => line.includes('|'))
    .map((line) => Object.fromEntries(line.split('|').map((v, i) => [keys[i], v])));
}

async function video(name: string, cost: number | null) {
  const submitted = (
    await db.pool.query<{ video_id: string; version_id: string; job_id: string }>(
      'SELECT * FROM video_submit($1, $2::jsonb)',
      [name, JSON.stringify({ format: 'episode', topic: `Tập ${name}` })],
    )
  ).rows[0]!;
  await succeed(db.pool, submitted.job_id, {
    outputs: [{ path: 'script.json', bytes: 1, sha256: 'a'.repeat(64) }],
    result: {
      format: 'episode',
      claude: {
        duration_ms: 1000,
        num_turns: 1,
        usage: { input_tokens: 10, output_tokens: 4000 },
        cost_usd: cost,
        models: ['claude-sonnet-5-5'],
      },
    },
  });
  // episode_code is several dependencies away: a finished row stands in for it.
  await db.pool.query(
    `INSERT INTO job (video_version_id, step, stream, idempotency_key, status, output)
     VALUES ($1, 'episode_code', 'q:render', $2, 'SUCCEEDED', $3::jsonb)`,
    [
      submitted.version_id,
      `code-${name}`,
      JSON.stringify({
        result: {
          claude: {
            turn_costs_usd: [3, 4.5],
            usage: { input_tokens: 50, output_tokens: 60000, cache_read_input_tokens: 9000000 },
            models: ['claude-opus-5-5'],
          },
        },
      }),
    ],
  );
  return submitted;
}

describe('claude-usage.sql', () => {
  test('summarizes recent jobs per step, skipping jobs that report no cost', async () => {
    await video('usage-a', 0.2);
    await video('usage-b', 0.4);
    await video('usage-old', null);

    const rows = await report();

    expect(rows.find((row) => row.step === 'script')).toMatchObject({
      jobs: '2',
      median_usd: '0.30',
      max_usd: '0.40',
      models: 'claude-sonnet-5-5',
    });
    // The CLI may report a resumed session's running total: the sum and the largest turn are shown.
    expect(rows.find((row) => row.step === 'episode_code')).toMatchObject({
      jobs: '3',
      median_usd: '7.50',
      max_usd: '7.50',
      median_max_turn_usd: '4.50',
      models: 'claude-opus-5-5',
    });
  });

  test('lists one video job by job', async () => {
    const { video_id } = await video('usage-one', 0.25);

    const rows = await report(video_id);

    expect(rows).toEqual([
      expect.objectContaining({ step: 'script', cost_usd: '0.25', output_tokens: '4000' }),
      expect.objectContaining({
        step: 'episode_code',
        cost_usd: '7.50',
        max_turn_usd: '4.50',
        cache_read_tokens: '9000000',
      }),
    ]);
  });
});
