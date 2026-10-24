import { randomUUID } from 'node:crypto';
import pino from 'pino';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { buildApi } from '../../src/api.js';
import { createMemoryNonceStore, signRequest } from '../../src/security/hmac.js';

const KEY = 'z'.repeat(48);

let app: Awaited<ReturnType<typeof buildApi>>;

beforeEach(async () => {
  app = await buildApi({
    workerId: 'mac-mini-m4',
    streams: ['q:render', 'q:light'],
    clientKeys: { n8n: KEY },
    nonces: createMemoryNonceStore(),
    activeJobs: () => 0,
  });
});

afterEach(async () => {
  await app.close();
});

function signedHeaders(path: string): Record<string, string> {
  return signRequest({
    clientId: 'n8n',
    key: KEY,
    method: 'GET',
    path,
    body: '',
    timestamp: Math.floor(Date.now() / 1000),
    nonce: randomUUID(),
  });
}

describe('worker api', () => {
  test('health is public and minimal', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', workerId: 'mac-mini-m4' });
  });

  test('capabilities requires a signature', async () => {
    const response = await app.inject({ method: 'GET', url: '/capabilities' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ success: false, error: 'unauthorized' });
  });

  test('capabilities accepts a signed request once', async () => {
    const headers = signedHeaders('/capabilities');

    const first = await app.inject({ method: 'GET', url: '/capabilities', headers });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({
      success: true,
      data: { workerId: 'mac-mini-m4', streams: ['q:render', 'q:light'], activeJobs: 0 },
    });

    const replay = await app.inject({ method: 'GET', url: '/capabilities', headers });
    expect(replay.statusCode).toBe(401);
  });

  test('logs the reason for rejected requests', async () => {
    const lines: string[] = [];
    const logger = pino({ level: 'warn' }, { write: (line: string) => void lines.push(line) });
    const logged = await buildApi({
      workerId: 'mac-mini-m4',
      streams: ['q:light'],
      clientKeys: { n8n: KEY },
      nonces: createMemoryNonceStore(),
      activeJobs: () => 0,
      logger,
    });
    const headers = { ...signedHeaders('/capabilities'), 'x-signature': 'ab'.repeat(32) };

    await logged.inject({ method: 'GET', url: '/capabilities', headers });
    await logged.close();

    expect(lines.join('')).toMatch(/"reason":"bad_signature".*rejected unsigned request/);
  });

  test('unknown routes return 404', async () => {
    const response = await app.inject({ method: 'GET', url: '/nope' });
    expect(response.statusCode).toBe(404);
  });
});
