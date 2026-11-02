import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { list } from 'tar';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { buildApi } from '../../src/api.js';
import { createMemoryNonceStore } from '../../src/security/hmac.js';

// GET /transfer/<video>?t=<token> (D-087) sends the video folder as a tar to the worker a move
// targets, only for the token of that move's current copy attempt (checked in Postgres).

const VIDEO = '5b0c7a8e-1111-4c2d-9e3f-000000000001';
const TOKEN = 'a'.repeat(32);

let root: string;
let checks: { videoId: string; token: string }[];
let app: Awaited<ReturnType<typeof buildApi>>;

async function build(transferAllowed?: (videoId: string, token: string) => Promise<boolean>) {
  return buildApi({
    workerId: 'mac-mini-m4',
    streams: ['q:light'],
    clientKeys: { n8n: 'z'.repeat(48) },
    nonces: createMemoryNonceStore(),
    activeJobs: () => 0,
    workRoot: root,
    ...(transferAllowed ? { transferAllowed } : {}),
  });
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'work-'));
  const ws = join(root, 'videos', VIDEO, 'v1', 'jobs', 'job', 'episode');
  await mkdir(ws, { recursive: true });
  await writeFile(join(ws, 'brief.md'), '# Mèo');
  await symlink('/repo/node_modules', join(ws, 'node_modules'));
  checks = [];
  app = await build(async (videoId, token) => {
    checks.push({ videoId, token });
    return token === TOKEN;
  });
});

afterEach(async () => {
  await app.close();
});

async function entries(payload: Buffer): Promise<string[]> {
  const names: string[] = [];
  await new Promise<void>((resolve, reject) => {
    const parser = list({ onReadEntry: (entry) => names.push(`${entry.type} ${entry.path}`) });
    parser.on('end', resolve);
    parser.on('error', reject);
    Readable.from([payload]).pipe(parser);
  });
  return names;
}

describe('/transfer', () => {
  test('streams the video folder for the move token, links kept as links', async () => {
    const response = await app.inject({ method: 'GET', url: `/transfer/${VIDEO}?t=${TOKEN}` });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('application/x-tar');
    expect(checks).toEqual([{ videoId: VIDEO, token: TOKEN }]);
    expect(await entries(response.rawPayload)).toEqual(
      expect.arrayContaining([
        `File ${VIDEO}/v1/jobs/job/episode/brief.md`,
        `SymbolicLink ${VIDEO}/v1/jobs/job/episode/node_modules`,
      ]),
    );
  });

  test.each([
    ['a wrong token', `/transfer/${VIDEO}?t=${'b'.repeat(32)}`],
    ['no token', `/transfer/${VIDEO}`],
    ['a malformed token', `/transfer/${VIDEO}?t=nope`],
    ['an invalid id', `/transfer/..%2Fetc?t=${TOKEN}`],
    ['an unknown video', `/transfer/5b0c7a8e-9999-4c2d-9e3f-000000000009?t=${TOKEN}`],
  ])('answers 404 for %s', async (_name, url) => {
    const response = await app.inject({ method: 'GET', url });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ success: false, error: 'not found' });
  });

  test('asks Postgres only for well-formed requests', async () => {
    await app.inject({ method: 'GET', url: `/transfer/${VIDEO}?t=nope` });
    await app.inject({ method: 'GET', url: `/transfer/not-a-uuid?t=${TOKEN}` });

    expect(checks).toEqual([]);
  });

  test('answers 404 when the worker has no token check', async () => {
    await app.close();
    app = await build();

    const response = await app.inject({ method: 'GET', url: `/transfer/${VIDEO}?t=${TOKEN}` });

    expect(response.statusCode).toBe(404);
  });
});
