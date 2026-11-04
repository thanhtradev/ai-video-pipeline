import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { LIBRARY_PAGE_SIZE, type ApiResponse } from '../../shared/types.js';
import type { Store } from '../store.js';
import { WORKER_ID_SHAPE } from './schemas.js';
import { readSession } from './session.js';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;
const MAX_SEARCH_LENGTH = 200;
// The largest value of the functions' integer parameter.
const MAX_OFFSET = 2_147_483_647;

const videoQuery = z.object({
  state: z
    .enum(['all', 'active', 'stopped', 'approval', 'running', 'waiting', 'done'])
    .default('all'),
  search: z.string().max(MAX_SEARCH_LENGTH).default(''),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  offset: z.coerce.number().int().min(0).max(MAX_OFFSET).default(0),
});
const videoParams = z.object({ id: z.uuid() });
const workerParams = z.object({ id: z.string().regex(WORKER_ID_SHAPE) });
const libraryQuery = z.object({
  group: z.enum(['kit', 'character']).default('kit'),
  search: z.string().max(MAX_SEARCH_LENGTH).default(''),
  limit: z.coerce.number().int().min(1).max(LIBRARY_PAGE_SIZE).default(LIBRARY_PAGE_SIZE),
  offset: z.coerce.number().int().min(0).max(MAX_OFFSET).default(0),
});
const reportQuery = z.object({ period: z.enum(['today', '7d', '30d']).default('today') });

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

  const sessionOf = (request: FastifyRequest): string => readSession(request, cookieName);

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

  app.get('/api/library', async (request) => {
    const session = sessionOf(request);
    return ok(await store.library(session, libraryQuery.parse(request.query)));
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
