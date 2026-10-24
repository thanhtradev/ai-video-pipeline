import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

// Request signing from docs/security.md §3. Used for n8n -> worker API calls.
export const MAX_CLOCK_SKEW_SECONDS = 300;
export const NONCE_TTL_SECONDS = 600;

export const HEADER_CLIENT_ID = 'x-client-id';
export const HEADER_TIMESTAMP = 'x-timestamp';
export const HEADER_NONCE = 'x-nonce';
export const HEADER_SIGNATURE = 'x-signature';

export type SignatureHeaders = Record<string, string>;

export interface SignedRequest {
  method: string;
  path: string;
  body: string;
  headers: Record<string, string | string[] | undefined>;
}

export interface SignInput {
  clientId: string;
  key: string;
  method: string;
  path: string;
  body: string;
  timestamp: number;
  nonce: string;
}

export interface NonceStore {
  /** Returns true if the nonce was unused and is now claimed. */
  claim: (nonce: string, ttlSeconds: number) => Promise<boolean>;
}

export type VerifyResult =
  | { ok: true; clientId: string }
  | {
      ok: false;
      reason:
        | 'missing_headers'
        | 'unknown_client'
        | 'stale_timestamp'
        | 'bad_signature'
        | 'replayed_nonce';
    };

export interface VerifyOptions {
  keys: Readonly<Record<string, string>>;
  nonces: NonceStore;
  now: number;
}

function canonicalString(
  method: string,
  path: string,
  timestamp: string,
  nonce: string,
  body: string,
): string {
  const bodyHash = createHash('sha256').update(body).digest('hex');
  return [method.toUpperCase(), path, timestamp, nonce, bodyHash].join('\n');
}

function computeSignature(key: string, canonical: string): string {
  return createHmac('sha256', key).update(canonical).digest('hex');
}

export function signRequest(input: SignInput): SignatureHeaders {
  const timestamp = String(input.timestamp);
  const canonical = canonicalString(input.method, input.path, timestamp, input.nonce, input.body);
  return {
    [HEADER_CLIENT_ID]: input.clientId,
    [HEADER_TIMESTAMP]: timestamp,
    [HEADER_NONCE]: input.nonce,
    [HEADER_SIGNATURE]: computeSignature(input.key, canonical),
  };
}

function header(headers: SignedRequest['headers'], name: string): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function signaturesMatch(expected: string, actual: string): boolean {
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(actual, 'hex');
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

export async function verifyRequest(
  request: SignedRequest,
  options: VerifyOptions,
): Promise<VerifyResult> {
  const clientId = header(request.headers, HEADER_CLIENT_ID);
  const timestamp = header(request.headers, HEADER_TIMESTAMP);
  const nonce = header(request.headers, HEADER_NONCE);
  const signature = header(request.headers, HEADER_SIGNATURE);
  if (!clientId || !timestamp || !nonce || !signature) {
    return { ok: false, reason: 'missing_headers' };
  }

  const key = Object.hasOwn(options.keys, clientId) ? options.keys[clientId] : undefined;
  if (!key) {
    return { ok: false, reason: 'unknown_client' };
  }

  const sentAt = Number(timestamp);
  if (!Number.isInteger(sentAt) || Math.abs(options.now - sentAt) > MAX_CLOCK_SKEW_SECONDS) {
    return { ok: false, reason: 'stale_timestamp' };
  }

  const canonical = canonicalString(request.method, request.path, timestamp, nonce, request.body);
  if (!signaturesMatch(computeSignature(key, canonical), signature)) {
    return { ok: false, reason: 'bad_signature' };
  }

  // Claim the nonce only after the signature is valid, so forged requests cannot burn real nonces.
  if (!(await options.nonces.claim(`${clientId}:${nonce}`, NONCE_TTL_SECONDS))) {
    return { ok: false, reason: 'replayed_nonce' };
  }

  return { ok: true, clientId };
}

export function createMemoryNonceStore(): NonceStore {
  const seen = new Map<string, number>();
  return {
    claim: async (nonce, ttlSeconds) => {
      const now = Date.now();
      for (const [key, expiresAt] of seen) {
        if (expiresAt <= now) seen.delete(key);
      }
      if (seen.has(nonce)) return false;
      seen.set(nonce, now + ttlSeconds * 1000);
      return true;
    },
  };
}
