import { describe, expect, test } from 'vitest';
import {
  createMemoryNonceStore,
  signRequest,
  verifyRequest,
  type SignedRequest,
} from '../../src/security/hmac.js';

const KEYS = { n8n: 'k'.repeat(48) };
const NOW = 1_800_000_000;

function signed(overrides: Partial<SignedRequest> = {}): SignedRequest {
  const base = { method: 'GET', path: '/capabilities', body: '' };
  const headers = signRequest({
    clientId: 'n8n',
    key: KEYS.n8n,
    ...base,
    timestamp: NOW,
    nonce: 'nonce-1',
  });
  return { ...base, headers, ...overrides };
}

describe('verifyRequest', () => {
  test('accepts a correctly signed request', async () => {
    const result = await verifyRequest(signed(), {
      keys: KEYS,
      nonces: createMemoryNonceStore(),
      now: NOW,
    });
    expect(result).toEqual({ ok: true, clientId: 'n8n' });
  });

  test('rejects a tampered body', async () => {
    const result = await verifyRequest(signed({ body: '{"evil":true}' }), {
      keys: KEYS,
      nonces: createMemoryNonceStore(),
      now: NOW,
    });
    expect(result).toEqual({ ok: false, reason: 'bad_signature' });
  });

  test('rejects a different path', async () => {
    const result = await verifyRequest(signed({ path: '/jobs/1/cancel' }), {
      keys: KEYS,
      nonces: createMemoryNonceStore(),
      now: NOW,
    });
    expect(result).toEqual({ ok: false, reason: 'bad_signature' });
  });

  test('rejects clock skew beyond 300 seconds', async () => {
    const result = await verifyRequest(signed(), {
      keys: KEYS,
      nonces: createMemoryNonceStore(),
      now: NOW + 301,
    });
    expect(result).toEqual({ ok: false, reason: 'stale_timestamp' });
  });

  test('rejects a replayed nonce', async () => {
    const nonces = createMemoryNonceStore();
    await verifyRequest(signed(), { keys: KEYS, nonces, now: NOW });
    const replay = await verifyRequest(signed(), { keys: KEYS, nonces, now: NOW });
    expect(replay).toEqual({ ok: false, reason: 'replayed_nonce' });
  });

  test('rejects an unknown client', async () => {
    const request = signed();
    const result = await verifyRequest(
      { ...request, headers: { ...request.headers, 'x-client-id': 'stranger' } },
      { keys: KEYS, nonces: createMemoryNonceStore(), now: NOW },
    );
    expect(result).toEqual({ ok: false, reason: 'unknown_client' });
  });

  test('rejects missing headers', async () => {
    const result = await verifyRequest(
      { method: 'GET', path: '/capabilities', body: '', headers: {} },
      { keys: KEYS, nonces: createMemoryNonceStore(), now: NOW },
    );
    expect(result).toEqual({ ok: false, reason: 'missing_headers' });
  });

  test('does not burn the nonce of a request with a bad signature', async () => {
    const nonces = createMemoryNonceStore();
    await verifyRequest(signed({ body: 'tampered' }), { keys: KEYS, nonces, now: NOW });
    const genuine = await verifyRequest(signed(), { keys: KEYS, nonces, now: NOW });
    expect(genuine.ok).toBe(true);
  });
});
