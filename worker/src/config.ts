import { isAbsolute } from 'node:path';
import { z } from 'zod';

const MIN_CLIENT_KEY_LENGTH = 32;

const streamList = z
  .string()
  .transform((value) => value.split(',').map((stream) => stream.trim()))
  .pipe(z.array(z.string().regex(/^q:[a-z0-9-]+$/)).min(1));

const clientKeys = z
  .string()
  .transform((value, ctx) => {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      ctx.addIssue({ code: 'custom', message: 'must be a JSON object' });
      return z.NEVER;
    }
  })
  .pipe(z.record(z.string().regex(/^[a-z0-9-]+$/), z.string().min(MIN_CLIENT_KEY_LENGTH)));

const envSchema = z
  .object({
    WORKER_ID: z.string().regex(/^[a-z0-9-]{3,64}$/),
    WORKER_STREAMS: streamList,
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    REDIS_URL: z.url({ protocol: /^rediss?$/ }),
    WORK_ROOT: z.string().refine(isAbsolute, 'must be an absolute path'),
    API_HOST: z.string().default('127.0.0.1'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(8787),
    API_CLIENT_KEYS: clientKeys,
    LEASE_SECONDS: z.coerce.number().int().min(10).default(60),
    HEARTBEAT_SECONDS: z.coerce.number().int().min(1).default(20),
    POLL_INTERVAL_MS: z.coerce.number().int().min(100).default(1000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  })
  .refine((env) => env.HEARTBEAT_SECONDS * 2 <= env.LEASE_SECONDS, {
    path: ['HEARTBEAT_SECONDS'],
    message: 'must be at most half of LEASE_SECONDS',
  });

export interface Config {
  workerId: string;
  workerStreams: string[];
  databaseUrl: string;
  redisUrl: string;
  workRoot: string;
  apiHost: string;
  apiPort: number;
  apiClientKeys: Record<string, string>;
  leaseSeconds: number;
  heartbeatSeconds: number;
  pollIntervalMs: number;
  logLevel: string;
}

/** Validates the environment at startup; errors name the variables but never their values. */
export function loadConfig(env: Record<string, string | undefined>): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map(
      (issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`,
    );
    throw new Error(`invalid worker configuration:\n  ${problems.join('\n  ')}`);
  }
  const e = parsed.data;
  return {
    workerId: e.WORKER_ID,
    workerStreams: e.WORKER_STREAMS,
    databaseUrl: e.DATABASE_URL,
    redisUrl: e.REDIS_URL,
    workRoot: e.WORK_ROOT,
    apiHost: e.API_HOST,
    apiPort: e.API_PORT,
    apiClientKeys: e.API_CLIENT_KEYS,
    leaseSeconds: e.LEASE_SECONDS,
    heartbeatSeconds: e.HEARTBEAT_SECONDS,
    pollIntervalMs: e.POLL_INTERVAL_MS,
    logLevel: e.LOG_LEVEL,
  };
}
