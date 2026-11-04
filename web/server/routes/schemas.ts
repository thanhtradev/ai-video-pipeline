import { z } from 'zod';

// Shapes used by more than one route. WORKER_ID_SHAPE is WORKER_ID in worker/src/config.ts.

export const WORKER_ID_SHAPE = /^[a-z0-9-]{3,64}$/;
export const tokenParams = z.object({ token: z.string().regex(/^[0-9a-f]{32}$/) });
export const confirmBody = z.object({ confirm: z.boolean() }).strict();
