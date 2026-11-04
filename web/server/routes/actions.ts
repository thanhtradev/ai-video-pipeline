import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ApiResponse } from '../../shared/types.js';
import type { Store } from '../store.js';
import { readSession } from './session.js';

// Each action answers 200 with the result code of the function the bot calls, also for a refusal:
// the page words them. Permissions and state checks are in SQL.

const MAX_NOTE_LENGTH = 4000;

const videoParams = z.object({ id: z.uuid() });
const approvalParams = z.object({ id: z.uuid() });
const cancelParams = z.object({ token: z.string().regex(/^[0-9a-f]{32}$/) });
const autoBody = z.object({ enable: z.boolean() }).strict();
const cancelBody = z.object({ confirm: z.boolean() }).strict();
const decideBody = z
  .object({
    action: z.enum(['APPROVE', 'APPROVE_ALL', 'REJECT', 'REGENERATE', 'FEEDBACK']),
    note: z.string().trim().max(MAX_NOTE_LENGTH).optional(),
  })
  .strict()
  .refine((body) => body.action !== 'FEEDBACK' || (body.note ?? '') !== '', {
    message: 'notes are empty',
  });

function ok<T>(data: T): ApiResponse<T> {
  return { success: true, data };
}

export interface ActionRouteOptions {
  store: Store;
  cookieName: string;
}

export function actionRoutes(app: FastifyInstance, options: ActionRouteOptions): void {
  const { store, cookieName } = options;

  app.post('/api/approvals/:id/decide', async (request) => {
    const session = readSession(request, cookieName);
    const { id } = approvalParams.parse(request.params);
    const { action, note } = decideBody.parse(request.body);
    return ok(await store.decide(session, id, action, note ?? null));
  });

  app.post('/api/videos/:id/retry', async (request) => {
    const session = readSession(request, cookieName);
    return ok(await store.retry(session, videoParams.parse(request.params).id));
  });

  app.post('/api/videos/:id/auto', async (request) => {
    const session = readSession(request, cookieName);
    const { id } = videoParams.parse(request.params);
    const { enable } = autoBody.parse(request.body);
    return ok(await store.auto(session, id, enable));
  });

  app.post('/api/videos/:id/cancel', async (request) => {
    const session = readSession(request, cookieName);
    return ok(await store.cancel(session, videoParams.parse(request.params).id));
  });

  app.post('/api/cancel/:token', async (request) => {
    const session = readSession(request, cookieName);
    const { token } = cancelParams.parse(request.params);
    const { confirm } = cancelBody.parse(request.body);
    return ok(await store.cancelConfirm(session, token, confirm));
  });
}
