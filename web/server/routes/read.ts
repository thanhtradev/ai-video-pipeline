import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { ApiResponse } from '../../shared/types.js';
import { UnauthorizedError } from '../errors.js';
import type { Store } from '../store.js';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;
const MAX_SEARCH_LENGTH = 200;

const videoQuery = z.object({
  state: z
    .enum(['all', 'active', 'stopped', 'approval', 'running', 'waiting', 'done'])
    .default('all'),
  search: z.string().max(MAX_SEARCH_LENGTH).default(''),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  offset: z.coerce.number().int().min(0).default(0),
});
const videoParams = z.object({ id: z.uuid() });
const workerParams = z.object({ id: z.string().regex(/^[a-z0-9-]{3,64}$/) });
const reportQuery = z.object({ period: z.enum(['today', '7d', '30d']).default('today') });

const SESSION_SHAPE = /^[0-9a-f]{64}$/;

function ok<T>(data: T): ApiResponse<T> {
  return { success: true, data };
}

function notFound(reply: FastifyReply): FastifyReply {
  const body: ApiResponse<never> = { success: false, error: 'not found' };
  return reply.code(404).send(body);
}

export interface ReadRouteOptions {
  store: Store;
  cookieName: string;
}

export function readRoutes(app: FastifyInstance, options: ReadRouteOptions): void {
  const { store, cookieName } = options;

  function sessionOf(request: FastifyRequest): string {
    const session = request.cookies[cookieName];
    if (!session || !SESSION_SHAPE.test(session)) throw new UnauthorizedError();
    return session;
  }

  app.get('/api/me', async (request) => ok(await store.me(sessionOf(request))));

  app.get('/api/attention', async (request) => ok(await store.attention(sessionOf(request))));

  app.get('/api/videos', async (request) => {
    const session = sessionOf(request);
    return ok(await store.videos(session, videoQuery.parse(request.query)));
  });

  app.get('/api/videos/:id', async (request, reply) => {
    const session = sessionOf(request);
    const video = await store.video(session, videoParams.parse(request.params).id);
    return video ? ok(video) : notFound(reply);
  });

  app.get('/api/workers', async (request) => ok(await store.workers(sessionOf(request))));

  app.get('/api/workers/:id', async (request, reply) => {
    const session = sessionOf(request);
    const worker = await store.worker(session, workerParams.parse(request.params).id);
    return worker ? ok(worker) : notFound(reply);
  });

  app.get('/api/report', async (request) => {
    const session = sessionOf(request);
    return ok(await store.report(session, reportQuery.parse(request.query).period));
  });
}
