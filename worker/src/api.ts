import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { verifyRequest, type NonceStore } from './security/hmac.js';

// Worker API (docs/architecture.md §5). Bind to the Tailscale interface only.
// /health is unauthenticated for Uptime Kuma; everything else requires an HMAC signature.

export interface ApiOptions {
  workerId: string;
  streams: readonly string[];
  clientKeys: Readonly<Record<string, string>>;
  nonces: NonceStore;
  activeJobs: () => number;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export async function buildApi(options: ApiOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, bodyLimit: 64 * 1024 });

  // Keep the raw body so signatures are computed over exactly what was sent.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_request, body, done) => {
    done(null, body);
  });

  async function authorized(request: FastifyRequest): Promise<boolean> {
    const result = await verifyRequest(
      {
        method: request.method,
        path: request.url,
        body: typeof request.body === 'string' ? request.body : '',
        headers: request.headers,
      },
      { keys: options.clientKeys, nonces: options.nonces, now: Math.floor(Date.now() / 1000) },
    );
    if (!result.ok) request.log.warn({ reason: result.reason }, 'rejected unsigned request');
    return result.ok;
  }

  app.get('/health', async () => ({ status: 'ok', workerId: options.workerId }));

  app.get('/capabilities', async (request, reply) => {
    if (!(await authorized(request))) {
      const body: ApiResponse<never> = { success: false, error: 'unauthorized' };
      return reply.code(401).send(body);
    }
    const body: ApiResponse<{ workerId: string; streams: readonly string[]; activeJobs: number }> =
      {
        success: true,
        data: {
          workerId: options.workerId,
          streams: options.streams,
          activeJobs: options.activeJobs(),
        },
      };
    return body;
  });

  await app.ready();
  return app;
}
