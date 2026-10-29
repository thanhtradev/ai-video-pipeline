import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { buildApi } from '../../src/api.js';
import { createMemoryNonceStore } from '../../src/security/hmac.js';

// GET /media/… serves an episode preview to WF-13 against the media token of its qa_preview job
// (D-057), only for files the checked render lists.

const VIDEO = '5b0c7a8e-1111-4c2d-9e3f-000000000001';
const QA = '5b0c7a8e-2222-4c2d-9e3f-000000000002';
const RENDER = '5b0c7a8e-3333-4c2d-9e3f-000000000003';
const TOKEN = 'b'.repeat(32);
const MP4 = Buffer.from('fake mp4 bytes');
const META = '5b0c7a8e-4444-4c2d-9e3f-000000000004';
const META_TOKEN = 'd'.repeat(32);
const JPG = Buffer.from([0xff, 0xd8, 0xff]);
const SCRIPT = '5b0c7a8e-5555-4c2d-9e3f-000000000005';
const SCRIPT_TOKEN = 'e'.repeat(32);
const SCRIPT_MD = '# Bíp ơi, tại sao nước sôi?\n';

let root: string;
let app: Awaited<ReturnType<typeof buildApi>>;

async function checkpoint(dir: string, outputs: string[], result: object) {
  await writeFile(
    join(dir, 'checkpoint.json'),
    JSON.stringify({
      version: 1,
      completedAt: '2026-10-26T00:00:00Z',
      outputs: outputs.map((path) => ({ path, sha256: '0'.repeat(64), bytes: 1 })),
      result,
    }),
  );
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'work-'));
  const jobs = join(root, 'videos', VIDEO, 'v1', 'jobs');
  await mkdir(join(jobs, QA), { recursive: true });
  await mkdir(join(jobs, RENDER), { recursive: true });
  await writeFile(join(jobs, RENDER, 'preview.mp4'), MP4);
  await writeFile(join(jobs, RENDER, 'vi.srt'), '1\n');
  await writeFile(join(jobs, RENDER, 'final.mp4'), MP4);
  await checkpoint(join(jobs, RENDER), ['preview.mp4'], {});
  await mkdir(join(jobs, META), { recursive: true });
  await writeFile(join(jobs, META, 'thumbnail.jpg'), JPG);
  await checkpoint(join(jobs, META), ['metadata.json', 'thumbnail.jpg'], {
    media_token: META_TOKEN,
  });
  await mkdir(join(jobs, SCRIPT), { recursive: true });
  await writeFile(join(jobs, SCRIPT, 'script.md'), SCRIPT_MD);
  await checkpoint(join(jobs, SCRIPT), ['script.json', 'script.md'], {
    media_token: SCRIPT_TOKEN,
  });
  await checkpoint(join(jobs, QA), ['qa-report.json'], {
    media_token: TOKEN,
    render_job_id: RENDER,
  });
  app = await buildApi({
    workerId: 'mac-mini-m4',
    streams: ['q:light'],
    clientKeys: { n8n: 'z'.repeat(48) },
    nonces: createMemoryNonceStore(),
    activeJobs: () => 0,
    workRoot: root,
  });
});

afterEach(async () => {
  await app.close();
});

const url = (file: string, token = TOKEN, job = QA) =>
  `/media/${VIDEO}/1/${job}/${file}?t=${token}`;

describe('preview media', () => {
  test('serves the checked preview for the right token', async () => {
    const response = await app.inject({ method: 'GET', url: url('preview.mp4') });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('video/mp4');
    expect(response.headers['content-length']).toBe(String(MP4.length));
    expect(response.rawPayload).toEqual(MP4);
  });

  test.each([
    ['a wrong token', url('preview.mp4', 'c'.repeat(32))],
    ['no token', `/media/${VIDEO}/1/${QA}/preview.mp4`],
    ['a file the render does not list', url('vi.srt')],
    ['a file type that is never served', url('final.mp4')],
    ['the render job instead of the QA job', url('preview.mp4', TOKEN, RENDER)],
    ['a traversal', `/media/${VIDEO}/1/..%2F..%2F${QA}/preview.mp4?t=${TOKEN}`],
  ])('answers 404 for %s', async (_name, path) => {
    const response = await app.inject({ method: 'GET', url: path });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ success: false, error: 'not found' });
  });

  test('serves the thumbnail of a metadata job for its own token (D-062)', async () => {
    const thumb = (token: string) => `/media/${VIDEO}/1/${META}/thumbnail.jpg?t=${token}`;
    const response = await app.inject({ method: 'GET', url: thumb(META_TOKEN) });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('image/jpeg');
    expect(response.rawPayload).toEqual(JPG);
    expect((await app.inject({ method: 'GET', url: thumb(TOKEN) })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: url('thumbnail.jpg') })).statusCode).toBe(404);
  });

  test('serves script.md of a script job for its own token (D-070)', async () => {
    const md = (token: string) => `/media/${VIDEO}/1/${SCRIPT}/script.md?t=${token}`;
    const response = await app.inject({ method: 'GET', url: md(SCRIPT_TOKEN) });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('text/markdown; charset=utf-8');
    expect(response.payload).toBe(SCRIPT_MD);
    expect((await app.inject({ method: 'GET', url: md(META_TOKEN) })).statusCode).toBe(404);
  });

  test.each([
    ['voice.m4a', 'timing.json'],
    ['mix.m4a', 'agent-turns.json'],
  ])('serves %s of its job as audio for its own token (D-071)', async (file, other) => {
    const job = '5b0c7a8e-6666-4c2d-9e3f-000000000006';
    const dir = join(root, 'videos', VIDEO, 'v1', 'jobs', job);
    const audio = Buffer.from('fake m4a bytes');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, file), audio);
    await checkpoint(dir, [other, file], { media_token: 'f'.repeat(32) });
    const url = (token: string) => `/media/${VIDEO}/1/${job}/${file}?t=${token}`;

    const response = await app.inject({ method: 'GET', url: url('f'.repeat(32)) });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('audio/mp4');
    expect(response.rawPayload).toEqual(audio);
    expect((await app.inject({ method: 'GET', url: url(SCRIPT_TOKEN) })).statusCode).toBe(404);
  });
});
