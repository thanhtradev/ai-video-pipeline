import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, {
  LogController,
  type FastifyBaseLogger,
  type FastifyError,
  type FastifyInstance,
} from 'fastify';
import pino, { type Logger } from 'pino';
import { ZodError } from 'zod';
import type { ApiResponse } from '../shared/types.js';
import { UnauthorizedError } from './errors.js';
import { authRoutes } from './routes/auth.js';
import { readRoutes } from './routes/read.js';
import type { Store } from './store.js';

// __Host- makes the browser refuse the cookie unless it is Secure, on this exact host, path /.
export const SESSION_COOKIE = '__Host-aivideo_session';

const BODY_LIMIT_BYTES = 64 * 1024;
const REQUESTS_PER_MINUTE = 600;
const LOGINS_PER_MINUTE = 10;
const COOKIE_OPTIONS = { path: '/', secure: true, sameSite: 'strict', httpOnly: true } as const;

export interface AppOptions {
  store: Store;
  /** The one origin the page is served from; a write from any other is refused. */
  publicOrigin: string;
  /** Built page; without it only the API answers. */
  uiDir?: string;
  logger?: Logger;
  loginPerMinute?: number;
}

function failure(error: string): ApiResponse<never> {
  return { success: false, error };
}

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const { store, publicOrigin, uiDir } = options;
  const logger = options.logger ?? pino({ level: 'silent' });
  const app = Fastify({
    loggerInstance: logger as FastifyBaseLogger,
    // Off because the page URL /login?t=... carries a sign-in token.
    logController: new LogController({ disableRequestLogging: true }),
    bodyLimit: BODY_LIMIT_BYTES,
    // One hop, tailscale serve: the address it adds, not one a client wrote into the header.
    trustProxy: (_address, hop) => hop === 0,
  });

  await app.register(helmet, {
    referrerPolicy: { policy: 'no-referrer' },
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        baseUri: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
      },
    },
  });
  await app.register(cookie);
  await app.register(rateLimit, { global: true, max: REQUESTS_PER_MINUTE, timeWindow: '1 minute' });

  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/')) return;
    reply.header('cache-control', 'no-store');
    const isWrite = request.method !== 'GET' && request.method !== 'HEAD';
    if (isWrite && request.headers.origin !== publicOrigin) {
      request.log.warn({ path: request.routeOptions.url }, 'refused a write from another origin');
      return reply.code(403).send(failure('forbidden'));
    }
  });

  app.setErrorHandler((error: FastifyError | Error, request, reply) => {
    if (error instanceof UnauthorizedError) {
      reply.clearCookie(SESSION_COOKIE, COOKIE_OPTIONS);
      return reply.code(401).send(failure('not signed in'));
    }
    if (error instanceof ZodError) return reply.code(400).send(failure('invalid input'));
    const status = 'statusCode' in error ? (error.statusCode ?? 500) : 500;
    if (status < 500) return reply.code(status).send(failure(error.message));
    request.log.error({ err: error.message, path: request.routeOptions.url }, 'request failed');
    return reply.code(500).send(failure('The service could not answer. Try again in a moment.'));
  });

  app.get('/health', { config: { rateLimit: false } }, async () => {
    await store.ping();
    return { status: 'ok' };
  });

  authRoutes(app, {
    store,
    cookieName: SESSION_COOKIE,
    loginPerMinute: options.loginPerMinute ?? LOGINS_PER_MINUTE,
  });
  readRoutes(app, { store, cookieName: SESSION_COOKIE });

  if (uiDir) await app.register(fastifyStatic, { root: uiDir, wildcard: false });

  app.setNotFoundHandler((request, reply) => {
    const isPage = uiDir && request.method === 'GET' && !request.url.startsWith('/api/');
    if (isPage) return reply.sendFile('index.html');
    return reply.code(404).send(failure('not found'));
  });

  await app.ready();
  return app;
}
