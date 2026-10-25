import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { buildApi } from '../../src/api.js';
import { createMemoryNonceStore } from '../../src/security/hmac.js';

// GET /boards/… serves storyboard pages to WF-12 against the board token of the episode_code job
// (D-055): a read-only capability instead of HMAC (whether n8n lets a Code node import crypto is
// [UNKNOWN] on our instance).

const VIDEO = '5b0c7a8e-1111-4c2d-9e3f-000000000001';
const JOB = '5b0c7a8e-2222-4c2d-9e3f-000000000002';
const TOKEN = 'a'.repeat(32);
const PAGE = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

let root: string;
let app: Awaited<ReturnType<typeof buildApi>>;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'work-'));
  const jobDir = join(root, 'videos', VIDEO, 'v1', 'jobs', JOB);
  await mkdir(join(jobDir, 'ws', 'board'), { recursive: true });
  await writeFile(join(jobDir, 'ws', 'board', 'page-01.jpg'), PAGE);
  await writeFile(join(jobDir, 'ws', 'board', 'page-02.jpg'), PAGE);
  await writeFile(
    join(jobDir, 'checkpoint.json'),
    JSON.stringify({
      version: 1,
      completedAt: '2026-10-26T00:00:00Z',
      outputs: [],
      result: { board_token: TOKEN, board_pages: ['ws/board/page-01.jpg'] },
    }),
  );
  app = await buildApi({
    workerId: 'mac-mini-m4',
    streams: ['q:render'],
    clientKeys: { n8n: 'z'.repeat(48) },
    nonces: createMemoryNonceStore(),
    activeJobs: () => 0,
    workRoot: root,
  });
});

afterEach(async () => {
  await app.close();
});

const url = (page: string, token = TOKEN, job = JOB, version = '1') =>
  `/boards/${VIDEO}/${version}/${job}/${page}?t=${token}`;

describe('storyboard pages', () => {
  test('serves a listed page for the right token', async () => {
    const response = await app.inject({ method: 'GET', url: url('page-01.jpg') });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('image/jpeg');
    expect(response.rawPayload).toEqual(PAGE);
  });

  test.each([
    ['a wrong token', url('page-01.jpg', 'b'.repeat(32))],
    ['no token', `/boards/${VIDEO}/1/${JOB}/page-01.jpg`],
    ['a page the job did not list', url('page-02.jpg')],
    ['an unknown job', url('page-01.jpg', TOKEN, '5b0c7a8e-3333-4c2d-9e3f-000000000003')],
    ['a bad page name', url('..%2Fcheckpoint.json')],
    ['a bad version', url('page-01.jpg', TOKEN, JOB, '1..')],
  ])('answers 404 for %s', async (_name, path) => {
    const response = await app.inject({ method: 'GET', url: path });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ success: false, error: 'not found' });
  });
});
