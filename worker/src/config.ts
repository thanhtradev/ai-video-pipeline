import { isAbsolute } from 'node:path';
import { z } from 'zod';

const MIN_CLIENT_KEY_LENGTH = 32;
const MIN_ITERA_KEY_LENGTH = 16;

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
    // Claude Code CLI (D-042). launchd's PATH does not include ~/.local/bin: use an absolute path.
    CLAUDE_BIN: z.string().min(1).default('claude'),
    CLAUDE_MODEL: z.string().min(1).optional(),
    CLAUDE_TIMEOUT_SECONDS: z.coerce.number().int().min(30).max(3600).default(600),
    CLAUDE_BLOCK_SECONDS: z.coerce.number().int().min(60).max(86_400).default(3600),
    // ITERA TTS (D-040, S-24). The key comes from the Keychain (run-worker.sh); without it tts
    // jobs wait as BLOCKED.
    ITERA_BASE_URL: z.url({ protocol: /^https$/ }).default('https://api.genmax.io'),
    ITERA_API_KEY: z.string().min(MIN_ITERA_KEY_LENGTH).optional(),
    ITERA_POLL_MS: z.coerce.number().int().min(500).default(2000),
    ITERA_TASK_TIMEOUT_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),
    ITERA_BLOCK_SECONDS: z.coerce.number().int().min(60).max(86_400).default(3600),
    // ffmpeg's ffprobe measures clip durations; launchd's PATH includes /opt/homebrew/bin.
    FFPROBE_BIN: z.string().min(1).default('ffprobe'),
    // ffmpeg normalises the preview's loudness (render_preview, D-032).
    FFMPEG_BIN: z.string().min(1).default('ffmpeg'),
    // Shared royalty-free music library with catalog.json (D-021). Unset: previews have no music.
    MUSIC_LIBRARY_DIR: z.string().refine(isAbsolute, 'must be an absolute path').optional(),
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
  claude: {
    bin: string;
    model: string | undefined;
    timeoutSeconds: number;
    /** How long a job waits after a usage limit before it is retried. */
    blockSeconds: number;
  };
  itera: {
    baseUrl: string;
    apiKey: string | undefined;
    pollMs: number;
    taskTimeoutSeconds: number;
    /** How long a job waits after a key, credit, quota, or configuration problem. */
    blockSeconds: number;
  };
  ffprobeBin: string;
  ffmpegBin: string;
  musicLibraryDir: string | undefined;
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
    claude: {
      bin: e.CLAUDE_BIN,
      model: e.CLAUDE_MODEL,
      timeoutSeconds: e.CLAUDE_TIMEOUT_SECONDS,
      blockSeconds: e.CLAUDE_BLOCK_SECONDS,
    },
    itera: {
      baseUrl: e.ITERA_BASE_URL,
      apiKey: e.ITERA_API_KEY,
      pollMs: e.ITERA_POLL_MS,
      taskTimeoutSeconds: e.ITERA_TASK_TIMEOUT_SECONDS,
      blockSeconds: e.ITERA_BLOCK_SECONDS,
    },
    ffprobeBin: e.FFPROBE_BIN,
    ffmpegBin: e.FFMPEG_BIN,
    musicLibraryDir: e.MUSIC_LIBRARY_DIR,
  };
}
