import type { FastifyRequest } from 'fastify';
import { UnauthorizedError } from '../errors.js';

const SESSION_SHAPE = /^[0-9a-f]{64}$/;

export function readSession(request: FastifyRequest, cookieName: string): string {
  const session = request.cookies[cookieName];
  if (!session || !SESSION_SHAPE.test(session)) throw new UnauthorizedError();
  return session;
}
