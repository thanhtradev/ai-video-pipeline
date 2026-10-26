import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db.js';
import { decide as decideWith, OWNER } from '../helpers/episode-flow.js';

// Members (D-060): one owner; a Telegram user asks with /join, only the owner's Approve adds them.

const APPROVER = 222;
const NEWCOMER = 333;
const CHAT = '-1001234567890';

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
  await db.pool.query(
    `INSERT INTO approver (telegram_user_id, name, is_owner) VALUES ($1, 'owner', true), ($2, 'An', false)`,
    [OWNER, APPROVER],
  );
});

afterAll(async () => {
  await db.drop();
});

interface Row {
  result: string;
  token: string | null;
  detail: string | null;
  members: { user_id: string; name: string; owner: boolean }[] | null;
}

async function members(user: number, action: string, name = '', target: string | null = null) {
  const result = await db.pool.query<Row>('SELECT * FROM telegram_members($1, $2, $3, $4, $5)', [
    user,
    action,
    name,
    CHAT,
    target,
  ]);
  return result.rows[0]!;
}

const decide = (token: string, action: string, user: number) =>
  decideWith(db.pool, token, action, null, user);

async function isApprover(user: number): Promise<boolean> {
  const result = await db.pool.query<{ ok: boolean }>(
    'SELECT EXISTS (SELECT 1 FROM approver WHERE telegram_user_id = $1 AND active) AS ok',
    [user],
  );
  return result.rows[0]!.ok;
}

describe('join requests', () => {
  test('only the owner approves; the newcomer becomes an approver', async () => {
    const request = await members(NEWCOMER, 'JOIN', '@binh');
    expect(request.result).toBe('REQUESTED');
    expect((await members(NEWCOMER, 'JOIN', '@binh')).result).toBe('ALREADY_REQUESTED');

    expect((await decide(request.token!, 'APPROVE', APPROVER)).result).toBe('NOT_OWNER');
    expect((await decide(request.token!, 'APPROVE', NEWCOMER)).result).toBe('NOT_OWNER');
    expect(await isApprover(NEWCOMER)).toBe(false);

    expect((await decide(request.token!, 'APPROVE', OWNER)).result).toBe('OK');
    expect(await isApprover(NEWCOMER)).toBe(true);
    expect((await decide(request.token!, 'REJECT', OWNER)).result).toBe('NOT_PENDING');
    expect((await members(NEWCOMER, 'JOIN', '@binh')).result).toBe('ALREADY_MEMBER');
    const added = await db.pool.query(
      'SELECT name, added_by FROM approver WHERE telegram_user_id = $1',
      [NEWCOMER],
    );
    expect(added.rows[0]).toEqual({ name: '@binh', added_by: String(OWNER) });
  });

  test('reject and expiry add nobody; a new request can follow', async () => {
    const user = 444;
    const first = await members(user, 'JOIN', 'Cường');
    expect((await decide(first.token!, 'REJECT', OWNER)).result).toBe('OK');
    expect(await isApprover(user)).toBe(false);

    const second = await members(user, 'JOIN', 'Cường');
    await db.pool.query(
      `UPDATE member_request SET expires_at = now() - interval '1 second' WHERE token = $1`,
      [second.token],
    );
    expect((await decide(second.token!, 'APPROVE', OWNER)).result).toBe('EXPIRED');
    expect(await isApprover(user)).toBe(false);
    expect((await members(user, 'JOIN', 'Cường')).result).toBe('REQUESTED');
  });
});

describe('/members and /revoke', () => {
  test('approvers list members; only the owner revokes, never themselves', async () => {
    const list = await members(APPROVER, 'LIST');
    expect(list.members).toEqual(
      expect.arrayContaining([
        { user_id: String(OWNER), name: 'owner', owner: true },
        { user_id: String(APPROVER), name: 'An', owner: false },
      ]),
    );
    expect(list.members![0]!.owner).toBe(true);
    expect((await members(999, 'LIST')).result).toBe('NOT_APPROVER');

    expect((await members(APPROVER, 'REVOKE', '', String(NEWCOMER))).result).toBe('NOT_OWNER');
    expect(await members(OWNER, 'REVOKE', '', String(OWNER))).toMatchObject({
      result: 'INVALID',
      detail: 'the owner cannot be revoked',
    });
    expect((await members(OWNER, 'REVOKE', '', '5')).result).toBe('NOT_FOUND');
    expect((await members(OWNER, 'REVOKE', '', 'abc')).result).toBe('INVALID');

    expect((await members(OWNER, 'REVOKE', '', String(APPROVER))).result).toBe('OK');
    expect(await isApprover(APPROVER)).toBe(false);
  });

  test('there is at most one owner', async () => {
    await expect(
      db.pool.query(`UPDATE approver SET is_owner = true WHERE telegram_user_id = $1`, [NEWCOMER]),
    ).rejects.toThrow(/approver_one_owner/);
  });
});
