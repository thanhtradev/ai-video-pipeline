import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

// The render browser can only load media over HTTP. This loopback server exposes exactly the
// files of one render (an allow-list of URL path -> file), with Range support for seeking.

const CONTENT_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
};

export interface MediaServer {
  /** Absolute URL of a registered path. */
  url(path: string): string;
  close(): Promise<void>;
}

function contentType(file: string): string {
  return CONTENT_TYPES[file.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';
}

function parseRange(header: string | undefined, size: number): [number, number] | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header ?? '');
  if (!match) return null;
  const [, from, to] = match;
  if (!from && !to) return null;
  const start = from ? Number(from) : Math.max(0, size - Number(to));
  const end = from && to ? Math.min(Number(to), size - 1) : size - 1;
  return start <= end && start < size ? [start, end] : null;
}

export async function startMediaServer(files: ReadonlyMap<string, string>): Promise<MediaServer> {
  const server: Server = createServer((request, response) => {
    const file = files.get(new URL(request.url ?? '/', 'http://localhost').pathname);
    if (!file || (request.method !== 'GET' && request.method !== 'HEAD')) {
      response.writeHead(404).end();
      return;
    }
    stat(file).then(
      ({ size }) => {
        const headers = {
          'content-type': contentType(file),
          'accept-ranges': 'bytes',
          'access-control-allow-origin': '*',
        };
        const range = request.headers.range ? parseRange(request.headers.range, size) : null;
        if (request.headers.range && !range) {
          response.writeHead(416, { 'content-range': `bytes */${size}` }).end();
          return;
        }
        const [start, end] = range ?? [0, size - 1];
        response.writeHead(range ? 206 : 200, {
          ...headers,
          'content-length': end - start + 1,
          ...(range ? { 'content-range': `bytes ${start}-${end}/${size}` } : {}),
        });
        if (request.method === 'HEAD') response.end();
        else createReadStream(file, { start, end }).pipe(response);
      },
      () => response.writeHead(404).end(),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: (path) => `http://127.0.0.1:${port}${path}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
