import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { ApiResponse, VideoMediaList } from '../../shared/types.js';
import type { MediaFileAccess, Store } from '../store.js';
import { readSession } from './session.js';

// Files of a video, fetched from the worker it is pinned to. Tokens and worker addresses stay here,
// and devices need no route to the workers. The address and token come from the database and the
// file must be one the database lists, so a request cannot point this at anything else.

const CONNECT_TIMEOUT_MS = 15_000;
const COPIED_HEADERS = ['content-type', 'content-length', 'content-range', 'accept-ranges'];
const PASSED_STATUSES = new Set([200, 206, 416]);

const videoParams = z.object({ id: z.uuid() });
const fileParams = z.object({ id: z.uuid(), file: z.string().max(64) });
const workerUrl = z.url({ protocol: /^https?$/ });

function failure(reply: FastifyReply, status: number, error: string): FastifyReply {
  const body: ApiResponse<never> = { success: false, error };
  return reply.code(status).send(body);
}

function workerFileUrl(access: MediaFileAccess, videoId: string): string {
  const base = workerUrl.parse(access.base_url).replace(/\/+$/, '');
  const route = access.kind === 'board' ? 'boards' : 'media';
  const file = encodeURIComponent(access.file);
  return `${base}/${route}/${videoId}/${access.version}/${access.job_id}/${file}?t=${access.token}`;
}

export interface MediaRouteOptions {
  store: Store;
  cookieName: string;
}

export function mediaRoutes(app: FastifyInstance, options: MediaRouteOptions): void {
  const { store, cookieName } = options;

  app.get('/api/videos/:id/media', async (request, reply) => {
    const session = readSession(request, cookieName);
    const { id } = videoParams.parse(request.params);
    const media = await store.videoMedia(session, id);
    if (!media) return failure(reply, 404, 'not found');
    const body: ApiResponse<VideoMediaList> = { success: true, data: media };
    return body;
  });

  app.get('/api/videos/:id/media/:file', async (request, reply) => {
    const session = readSession(request, cookieName);
    const { id, file } = fileParams.parse(request.params);
    const access = await store.videoMediaFile(session, id, file);
    if (!access?.base_url) return failure(reply, 404, 'not found');

    const abort = new AbortController();
    const connectTimer = setTimeout(() => abort.abort(), CONNECT_TIMEOUT_MS);
    request.raw.once('close', () => abort.abort());
    let upstream: Response;
    try {
      const { range } = request.headers;
      upstream = await fetch(workerFileUrl(access, id), {
        headers: range ? { range } : {},
        signal: abort.signal,
      });
    } catch (error: unknown) {
      // Never log the URL: it holds the token.
      request.log.warn(
        { videoId: id, file, err: error instanceof Error ? error.name : 'unknown' },
        'worker did not answer for a media file',
      );
      return failure(reply, 502, 'The worker holding this file did not answer.');
    } finally {
      clearTimeout(connectTimer);
    }

    if (!PASSED_STATUSES.has(upstream.status)) {
      await upstream.body?.cancel();
      if (upstream.status === 404) return failure(reply, 404, 'not found');
      request.log.warn({ videoId: id, file, status: upstream.status }, 'worker refused a file');
      return failure(reply, 502, 'The worker holding this file did not answer.');
    }
    reply.code(upstream.status);
    for (const name of COPIED_HEADERS) {
      const value = upstream.headers.get(name);
      if (value !== null) reply.header(name, value);
    }
    if (!upstream.body) return reply.send();
    return reply.send(Readable.fromWeb(upstream.body as WebReadableStream));
  });
}
