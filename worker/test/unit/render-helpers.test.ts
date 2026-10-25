import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { startMediaServer, type MediaServer } from '../../src/render/media-server.js';
import { bedVolume, createMusicLibrary } from '../../src/render/music.js';
import { buildTimeline, SCENE_PAUSE_SECONDS } from '../../src/render/timeline.js';

function track(id: string, style: string, loudness: number | null = -20): object {
  return {
    id,
    style,
    file: `${style}/${id}.mp3`,
    title: id,
    artist: 'Kevin MacLeod',
    source_url: 'https://incompetech.com/music/royalty-free/index.html?isrc=X',
    license: 'CC-BY-4.0',
    license_url: 'https://creativecommons.org/licenses/by/4.0/',
    credit: `${id} Kevin MacLeod (incompetech.com)`,
    duration_seconds: 120,
    loudness_lufs: loudness,
  };
}

describe('buildTimeline', () => {
  test('each scene lasts its clip plus the pause, in whole frames, back to back', () => {
    const timeline = buildTimeline(
      [
        { index: 1, durationSeconds: 2 },
        { index: 2, durationSeconds: 1.01 },
      ],
      30,
    );
    const first = Math.ceil((2 + SCENE_PAUSE_SECONDS) * 30);
    expect(timeline.scenes).toEqual([
      { index: 1, startFrame: 0, durationInFrames: first, startSeconds: 0, speechSeconds: 2 },
      {
        index: 2,
        startFrame: first,
        durationInFrames: Math.ceil((1.01 + SCENE_PAUSE_SECONDS) * 30),
        startSeconds: first / 30,
        speechSeconds: 1.01,
      },
    ]);
    expect(timeline.durationInFrames).toBe(first + timeline.scenes[1]!.durationInFrames);
  });
});

describe('music library', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'music-'));
    await mkdir(join(root, 'calm'));
    await writeFile(
      join(root, 'catalog.json'),
      JSON.stringify({
        tracks: [track('a-calm', 'calm'), track('b-calm', 'calm', null), track('epic-1', 'epic')],
      }),
    );
  });

  test('picks a track of the requested style, the same one for the same seed', async () => {
    const library = createMusicLibrary(root);
    const first = await library.pick('calm', 'seed-1');
    const again = await library.pick('calm', 'seed-1');

    expect(first?.track.style).toBe('calm');
    expect(again?.track.id).toBe(first?.track.id);
    expect(first?.path).toBe(join(root, 'calm', `${first?.track.id}.mp3`));
    const seen = new Set<string>();
    for (let i = 0; i < 20; i += 1) seen.add((await library.pick('calm', `s${i}`))!.track.id);
    expect(seen).toEqual(new Set(['a-calm', 'b-calm']));
  });

  test('returns null when no track has the style', async () => {
    expect(await createMusicLibrary(root).pick('somber', 'x')).toBeNull();
  });

  test('refuses a catalog file path outside the library', async () => {
    const bad = await mkdtemp(join(tmpdir(), 'music-bad-'));
    await writeFile(
      join(bad, 'catalog.json'),
      JSON.stringify({ tracks: [{ ...track('x', 'calm'), file: '../../etc/passwd' }] }),
    );
    await expect(createMusicLibrary(bad).pick('calm', 'x')).rejects.toThrow(/outside/);
  });

  test('bed volume brings the track to the bed loudness, within bounds', () => {
    expect(bedVolume(-30)).toBe(1);
    expect(bedVolume(-14)).toBe(0.158);
    expect(bedVolume(0)).toBe(0.032);
    expect(bedVolume(20)).toBe(0.02);
    expect(bedVolume(-60)).toBe(1);
    expect(bedVolume(null)).toBe(0.15);
  });
});

describe('media server', () => {
  let server: MediaServer;
  const bytes = Buffer.from('0123456789');

  beforeAll(async () => {
    const dir = await mkdtemp(join(tmpdir(), 'media-'));
    await writeFile(join(dir, 'clip.mp3'), bytes);
    await writeFile(join(dir, 'secret.txt'), 'nope');
    server = await startMediaServer(new Map([['/voice/clip.mp3', join(dir, 'clip.mp3')]]));
  });

  afterAll(async () => {
    await server.close();
  });

  test('serves registered files with a media type', async () => {
    const response = await fetch(server.url('/voice/clip.mp3'));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('audio/mpeg');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
  });

  test('answers byte ranges', async () => {
    const response = await fetch(server.url('/voice/clip.mp3'), {
      headers: { range: 'bytes=2-4' },
    });
    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe('bytes 2-4/10');
    expect(await response.text()).toBe('234');
  });

  test('serves nothing that was not registered', async () => {
    for (const path of ['/secret.txt', '/voice/../secret.txt', '/voice/other.mp3']) {
      expect((await fetch(server.url(path))).status).toBe(404);
    }
  });
});
