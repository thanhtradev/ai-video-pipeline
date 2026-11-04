import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ApiResponse } from '../../shared/types.js';
import type { Store } from '../store.js';

const SESSION_SHAPE = /^[0-9a-f]{64}$/;
const loginBody = z.object({ token: z.string().regex(/^[0-9a-f]{64}$/) }).strict();

export interface AuthRouteOptions {
  store: Store;
  cookieName: string;
  loginPerMinute: number;
}

export function authRoutes(app: FastifyInstance, options: AuthRouteOptions): void {
  const { store, cookieName } = options;

  app.post(
    '/api/auth/login',
    { config: { rateLimit: { max: options.loginPerMinute, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { token } = loginBody.parse(request.body);
      const login = await store.loginConsume(token);
      if (!login) {
        // No error handler here: it clears the cookie, and an old link must not sign anyone out.
        const refused: ApiResponse<never> = { success: false, error: 'link used or expired' };
        return reply.code(401).send(refused);
      }
      const previous = request.cookies[cookieName];
      if (previous && SESSION_SHAPE.test(previous)) await store.logout(previous);
      reply.setCookie(cookieName, login.session, {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        path: '/',
        expires: login.expiresAt,
      });
      const body: ApiResponse<{ expires_at: Date }> = {
        success: true,
        data: { expires_at: login.expiresAt },
      };
      return body;
    },
  );

  app.post('/api/auth/logout', async (request, reply) => {
    const session = request.cookies[cookieName];
    if (session) await store.logout(session);
    reply.clearCookie(cookieName, { path: '/', secure: true, sameSite: 'strict', httpOnly: true });
    const body: ApiResponse<null> = { success: true, data: null };
    return body;
  });
}
