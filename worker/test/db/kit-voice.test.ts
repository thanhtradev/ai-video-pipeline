import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db.js';
import { decide, jobs, OWNER, succeed } from '../helpers/episode-flow.js';

// Voice per kit (D-095): tts jobs carry the video's kit, and ops/postgres/itera-tts-kit-voice.sql
// sets provider_model.default_params.kit_voices.<kit>.

const SCRIPT = fileURLToPath(
  new URL('../../../ops/postgres/itera-tts-kit-voice.sql', import.meta.url),
);
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

/** A new episode through A1 approval; returns its tts job input. */
async function ttsInput(name: string, kit?: string): Promise<Record<string, unknown>> {
  const brief = { format: 'episode', topic: `Tập ${name}`, ...(kit ? { kit } : {}) };
  const video = (
    await db.pool.query<{ version_id: string; job_id: string }>(
      'SELECT * FROM video_submit($1, $2::jsonb)',
      [name, JSON.stringify(brief)],
    )
  ).rows[0]!;
  await succeed(db.pool, video.job_id, {
    outputs: [{ path: 'script.json', bytes: 1, sha256: 'a'.repeat(64) }],
    result: { format: 'episode', title: 'Mèo', scenes: [{ narration: 'Một.' }] },
  });
  const a1 = (
    await db.pool.query<{ token: string; video_version_id: string }>(
      'SELECT token, video_version_id FROM script_approvals_due()',
    )
  ).rows.find((row) => row.video_version_id === video.version_id)!;
  expect((await decide(db.pool, a1.token, 'APPROVE')).result).toBe('OK');
  return (await jobs(db.pool, video.version_id)).find((job) => job.step === 'tts')!.input;
}

async function setKitVoice(kit: string, voiceId: string) {
  const { stdout } = await run('psql', [
    db.url,
    '-X',
    '-q',
    '-v',
    'ON_ERROR_STOP=1',
    '-v',
    'model_id=eleven_v4',
    '-v',
    `kit=${kit}`,
    '-v',
    `voice_id=${voiceId}`,
    '-v',
    'language_code=vi',
    '-f',
    SCRIPT,
  ]);
  return stdout;
}

async function kitVoices() {
  const result = await db.pool.query<{ kit_voices: Record<string, unknown> | null }>(
    `SELECT default_params->'kit_voices' AS kit_voices FROM provider_model
     WHERE provider_id = 'itera' AND model_id = 'eleven_v4'`,
  );
  return result.rows[0]!.kit_voices;
}

describe('tts jobs carry the kit', () => {
  test('the brief kit, else the default kit', async () => {
    expect((await ttsInput('kit-science', 'science')).kit).toBe('science');
    expect((await ttsInput('kit-default')).kit).toBe('whatif');
  });

  test('other jobs are left alone', async () => {
    const video = (
      await db.pool.query<{ version_id: string }>('SELECT * FROM video_submit($1, $2::jsonb)', [
        'kit-script',
        JSON.stringify({ format: 'episode', topic: 'Tập kit', kit: 'science' }),
      ])
    ).rows[0]!;
    const [script] = await jobs(db.pool, video.version_id);
    expect(script!.input).not.toHaveProperty('kit');
  });
});

describe('itera-tts-kit-voice.sql', () => {
  test('sets, replaces and removes the voice of one kit', async () => {
    await setKitVoice('science', 'xhfhhoIVxzqWcDxnFU2J');
    expect(await kitVoices()).toEqual({
      science: { voice_id: 'xhfhhoIVxzqWcDxnFU2J', language_code: 'vi' },
    });
    await setKitVoice('whatif', 'voice-w');
    await setKitVoice('science', 'voice-s2');
    expect(await kitVoices()).toMatchObject({
      science: { voice_id: 'voice-s2' },
      whatif: { voice_id: 'voice-w' },
    });
    await setKitVoice('whatif', 'none');
    expect(await kitVoices()).toEqual({ science: { voice_id: 'voice-s2', language_code: 'vi' } });
  });

  test('an unknown kit changes nothing', async () => {
    const before = await kitVoices();
    expect(await setKitVoice('anime', 'voice-x')).toContain('Unknown kit; nothing changed.');
    expect(await kitVoices()).toEqual(before);
  });
});
