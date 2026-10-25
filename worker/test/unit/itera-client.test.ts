import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { PermanentJobError, ProviderBlockedError } from '../../src/runner.js';
import { createIteraClient, type IteraClient } from '../../src/tts/itera-client.js';

// A local stand-in for api.genmax.io; no request leaves the machine.

const API_KEY = 'test-itera-key-0123456789';

interface Seen {
  method: string;
  url: string;
  key: string | undefined;
  body: string;
}

type Reply = (req: IncomingMessage, res: ServerResponse) => void;

let server: Server;
let other: Server;
let base: string;
let otherBase: string;
let seen: Seen[];
let reply: Reply;

function listen(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<Server> {
  return new Promise((resolve) => {
    const s = createServer(handler);
    s.listen(0, '127.0.0.1', () => resolve(s));
  });
}

function record(req: IncomingMessage, res: ServerResponse): void {
  let body = '';
  req.on('data', (chunk: Buffer) => (body += chunk.toString()));
  req.on('end', () => {
    seen.push({
      method: req.method!,
      url: req.url!,
      key: req.headers['xi-api-key'] as string | undefined,
      body,
    });
    reply(req, res);
  });
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Reply {
  return (_req, res) => {
    res.writeHead(status, { 'content-type': 'application/json', ...headers });
    res.end(JSON.stringify(body));
  };
}

beforeAll(async () => {
  server = await listen(record);
  other = await listen(record);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  otherBase = `http://127.0.0.1:${(other.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await Promise.all([server, other].map((s) => new Promise((r) => s.close(r))));
});

let client: IteraClient;
const signal = new AbortController().signal;

beforeEach(() => {
  seen = [];
  client = createIteraClient({
    baseUrl: base,
    apiKey: API_KEY,
    blockSeconds: 1800,
    requestTimeoutMs: 2000,
  });
});

describe('itera client', () => {
  test('queues a speech task with the documented body and the key header', async () => {
    reply = json(202, { id: 'task-1', status: 'pending' });

    const id = await client.createSpeech(
      {
        voiceId: 'voice/1',
        text: 'Xin chào',
        modelId: 'eleven_v3',
        provider: 'elevenlabs',
        languageCode: 'vi',
      },
      signal,
    );

    expect(id).toBe('task-1');
    expect(seen[0]).toMatchObject({
      method: 'POST',
      url: '/v1/text-to-speech/voice%2F1',
      key: API_KEY,
    });
    expect(JSON.parse(seen[0]!.body)).toEqual({
      text: 'Xin chào',
      model_id: 'eleven_v3',
      provider: 'elevenlabs',
      language_code: 'vi',
    });
  });

  test('reads a finished task', async () => {
    reply = json(200, {
      id: 'task-1',
      status: 'completed',
      progress: 100,
      result: { audio_url: `${base}/audio/task-1.mp3` },
      error: null,
      characters_used: 8,
      credits_deducted: 8,
    });

    expect(await client.getTask('task-1', signal)).toEqual({
      id: 'task-1',
      status: 'completed',
      audioUrl: `${base}/audio/task-1.mp3`,
      error: undefined,
      charactersUsed: 8,
      creditsDeducted: 8,
    });
    expect(seen[0]!.url).toBe('/v1/history/task-1');
  });

  test('reads the credit balance', async () => {
    reply = json(200, { id: 'u', credit_balance: 4000, role: 'user' });
    expect(await client.creditBalance(signal)).toBe(4000);
    expect(seen[0]!.url).toBe('/v1/auth/me');
  });

  test('downloads audio, sending the key only to the API origin', async () => {
    reply = (_req, res) => res.end(Buffer.from('ID3audio'));

    expect(Buffer.from(await client.download(`${base}/audio/a.mp3`, signal)).toString()).toBe(
      'ID3audio',
    );
    await client.download(`${otherBase}/cdn/a.mp3`, signal);

    expect(seen.map((s) => s.key)).toEqual([API_KEY, undefined]);
  });

  test.each([
    [401, ProviderBlockedError],
    [403, ProviderBlockedError],
    [402, ProviderBlockedError],
    [429, ProviderBlockedError],
    [400, PermanentJobError],
    [422, PermanentJobError],
  ])('classifies HTTP %i', async (status, type) => {
    reply = json(status, { detail: 'nope' });
    const error = await client.getTask('t', signal).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(type);
    expect(String(error)).not.toContain(API_KEY);
  });

  test('blocks for Retry-After seconds on a rate limit, else the configured time', async () => {
    reply = json(429, {}, { 'retry-after': '120' });
    const limited = (await client
      .getTask('t', signal)
      .catch((e: unknown) => e)) as ProviderBlockedError;
    expect(limited.retryAfterSeconds).toBe(120);

    reply = json(402, { detail: 'insufficient credits' });
    const broke = (await client
      .getTask('t', signal)
      .catch((e: unknown) => e)) as ProviderBlockedError;
    expect(broke.retryAfterSeconds).toBe(1800);
  });

  test('server errors and malformed replies are retryable', async () => {
    reply = json(503, {});
    const unavailable = await client.getTask('t', signal).catch((e: unknown) => e);
    expect(unavailable).toBeInstanceOf(Error);
    expect(unavailable).not.toBeInstanceOf(PermanentJobError);
    expect(unavailable).not.toBeInstanceOf(ProviderBlockedError);

    reply = json(200, { id: 't', status: 'weird' });
    await expect(client.getTask('t', signal)).rejects.toThrow(/unexpected response/);
  });

  test('an unreachable API is a retryable error', async () => {
    const offline = createIteraClient({
      baseUrl: 'http://127.0.0.1:9',
      apiKey: API_KEY,
      blockSeconds: 60,
      requestTimeoutMs: 1000,
    });
    const error = await offline.creditBalance(signal).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).toMatch(/ITERA me failed/);
  });
});
