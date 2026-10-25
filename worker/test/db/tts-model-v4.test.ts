import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db.js';

// Episodes narrate with ITERA eleven_v4 (D-050). The migration only registers the model, disabled;
// ops/postgres/itera-tts.sql sets its voice and price and makes it the one enabled TTS model.

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(async () => {
  await db.drop();
});

async function model(modelId: string) {
  const result = await db.pool.query<{ id: string; enabled: boolean; default_params: object }>(
    `SELECT id, enabled, default_params FROM provider_model
     WHERE provider_id = 'itera' AND model_id = $1`,
    [modelId],
  );
  return result.rows[0];
}

describe('eleven_v4 registration', () => {
  test('is registered disabled with the ElevenLabs Vietnamese defaults and no price', async () => {
    const v4 = await model('eleven_v4');

    expect(v4).toMatchObject({
      enabled: false,
      default_params: { provider: 'elevenlabs', language_code: 'vi' },
    });
    const prices = await db.pool.query(
      'SELECT 1 FROM provider_price WHERE provider_model_id = $1',
      [v4!.id],
    );
    expect(prices.rowCount).toBe(0);
  });

  test('new TTS jobs use it once it is the enabled model', async () => {
    const v3 = await model('eleven_v3');
    const v4 = await model('eleven_v4');
    const pick = async () =>
      (await db.pool.query<{ id: string }>('SELECT tts_provider_model() AS id')).rows[0]!.id;

    await db.pool.query(`UPDATE provider SET enabled = true WHERE id = 'itera'`);
    await db.pool.query(`UPDATE provider_model SET enabled = (model_id = 'eleven_v3')
                         WHERE provider_id = 'itera'`);
    expect(await pick()).toBe(v3!.id);

    await db.pool.query(`UPDATE provider_model SET enabled = (model_id = 'eleven_v4')
                         WHERE provider_id = 'itera'`);
    expect(await pick()).toBe(v4!.id);
  });
});
