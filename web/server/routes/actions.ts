import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ApiResponse } from '../../shared/types.js';
import type { Store } from '../store.js';
import { confirmBody, tokenParams, WORKER_ID_SHAPE } from './schemas.js';
import { readSession } from './session.js';

// Each action answers 200 with the result code of the function the bot calls, also for a refusal:
// the page words them. Permissions and state checks are in SQL.

const MAX_NOTE_LENGTH = 4000;

const videoParams = z.object({ id: z.uuid() });
const approvalParams = z.object({ id: z.uuid() });
const autoBody = z.object({ enable: z.boolean() }).strict();
const decideBody = z
  .object({
    action: z.enum(['APPROVE', 'APPROVE_ALL', 'REJECT', 'REGENERATE', 'FEEDBACK']),
    note: z.string().trim().max(MAX_NOTE_LENGTH).optional(),
  })
  .strict()
  .refine((body) => body.action !== 'FEEDBACK' || (body.note ?? '') !== '', {
    message: 'notes are empty',
  });

const SLUG = /^[a-z0-9-]{2,40}$/;
// The limits a brief must meet are brief_normalize's; these only keep junk out of the database.
const newVideoBody = z
  .object({
    topic: z.string().trim().min(1).max(500),
    duration_minutes: z.number().int().min(1).max(60).optional(),
    notes: z.string().trim().max(MAX_NOTE_LENGTH).optional(),
    kit: z.string().regex(SLUG).optional(),
    character_set: z.string().regex(SLUG).optional(),
    worker: z.string().regex(WORKER_ID_SHAPE).optional(),
    auto: z.boolean(),
  })
  .strict();

function ok<T>(data: T): ApiResponse<T> {
  return { success: true, data };
}

export interface ActionRouteOptions {
  store: Store;
  cookieName: string;
}

export function actionRoutes(app: FastifyInstance, options: ActionRouteOptions): void {
  const { store, cookieName } = options;

  app.get('/api/catalog', async (request) =>
    ok(await store.catalog(readSession(request, cookieName))),
  );

  app.post('/api/videos/draft', async (request) => {
    const session = readSession(request, cookieName);
    const { worker, auto, notes, ...brief } = newVideoBody.parse(request.body);
    return ok(
      await store.createDraft(
        session,
        { ...brief, ...(notes ? { notes } : {}) },
        worker ?? null,
        auto,
      ),
    );
  });

  app.post('/api/videos/draft/:token', async (request) => {
    const session = readSession(request, cookieName);
    const { token } = tokenParams.parse(request.params);
    const { confirm } = confirmBody.parse(request.body);
    return ok(await store.createDecide(session, token, confirm));
  });

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
    const { token } = tokenParams.parse(request.params);
    const { confirm } = confirmBody.parse(request.body);
    return ok(await store.cancelConfirm(session, token, confirm));
  });
}
