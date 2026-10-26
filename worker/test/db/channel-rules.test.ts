import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db.js';
import { OWNER, STRANGER } from '../helpers/episode-flow.js';

// Channel rules (D-059): approvers keep video and TTS rules and a pronunciation table from
// Telegram; the worker reads the current snapshot when a step starts.

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

interface Snapshot {
  version: string;
  video: { id: number; text: string }[];
  tts: { id: number; text: string }[];
  pronunciation: { id: number; term: string; spoken: string }[];
}

interface Row {
  result: string;
  detail: string | null;
  rules: Snapshot | null;
}

async function rules(
  action: string,
  scope = '',
  text = '',
  extra: string | null = null,
  user = OWNER,
): Promise<Row> {
  const result = await db.pool.query<Row>('SELECT * FROM telegram_rules($1, $2, $3, $4, $5)', [
    user,
    action,
    scope,
    text,
    extra,
  ]);
  return result.rows[0]!;
}

describe('telegram_rules', () => {
  test('adds, lists and removes video and TTS rules, keeping history', async () => {
    const empty = (await rules('VIEW')).rules!;
    const added = await rules('ADD', 'video', 'Không dùng nhạc nền.');
    expect(added.result).toBe('OK');
    await rules('ADD', 'tts', 'Câu hỏi mở đầu đọc chậm, có [short pause] sau dấu chấm hỏi.');

    const snapshot = (await rules('VIEW')).rules!;
    expect(snapshot.video).toEqual([{ id: Number(added.detail), text: 'Không dùng nhạc nền.' }]);
    expect(snapshot.tts).toHaveLength(1);
    expect(snapshot.version).not.toBe(empty.version);

    expect((await rules('DELETE', '', added.detail!)).result).toBe('OK');
    expect((await rules('DELETE', '', added.detail!)).result).toBe('NOT_FOUND');
    expect((await rules('VIEW')).rules!.video).toEqual([]);
    const kept = await db.pool.query('SELECT deleted_by FROM rule WHERE id = $1', [
      Number(added.detail),
    ]);
    expect(kept.rows[0]).toEqual({ deleted_by: String(OWNER) });
  });

  test('replaces a whole scope from a Markdown list, atomically', async () => {
    const md = '# Video rules\n\n- Một\n* Hai\n1. Ba\nnot a list item\n';
    expect((await rules('SET', 'video', md)).rules!.video.map((r) => r.text)).toEqual([
      'Một',
      'Hai',
      'Ba',
    ]);
    const bad = await rules('SET', 'pronunciation', '- TikTok = tích tốc\n- missing equals\n');
    expect(bad).toMatchObject({
      result: 'INVALID',
      detail: 'not "term = how to say it": missing equals',
    });
    expect((await rules('VIEW')).rules!.pronunciation).toEqual([]);
  });

  test('keeps one pronunciation per term, case-sensitive', async () => {
    await rules('SAY', '', 'AI', 'ây ai');
    await rules('SAY', '', 'AI', 'ê ai');
    await rules('SAY', '', 'ai', 'ai');
    expect((await rules('VIEW')).rules!.pronunciation.map((p) => [p.term, p.spoken])).toEqual([
      ['ai', 'ai'],
      ['AI', 'ê ai'],
    ]);
    expect((await rules('UNSAY', '', 'ai')).result).toBe('OK');
    expect((await rules('UNSAY', '', 'ai')).result).toBe('NOT_FOUND');
    expect(await rules('SAY', '', 'x[y]', 'z')).toMatchObject({ result: 'INVALID' });
    expect(await rules('SET', 'pronunciation', '- A = a\n- A = b\n')).toMatchObject({
      result: 'INVALID',
    });
  });

  test('refuses strangers and bad input', async () => {
    expect((await rules('VIEW', '', '', null, STRANGER)).result).toBe('NOT_APPROVER');
    expect(await rules('ADD', 'music', 'x')).toMatchObject({
      result: 'INVALID',
      detail: 'scope must be video or tts',
    });
    expect(await rules('ADD', 'video', '')).toMatchObject({ result: 'INVALID' });
    expect(await rules('DELETE', '', 'abc')).toMatchObject({ result: 'INVALID' });
  });
});
