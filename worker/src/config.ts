import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
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
    // The worker Mac's runtime root (D-065): repo/, work/, config/, logs/, models/, media/. The
    // agent sandboxes deny its private folders; set by run-worker.sh.
    AIVIDEO_ROOT: z.string().refine(isAbsolute, 'must be an absolute path').optional(),
    API_HOST: z.string().default('127.0.0.1'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(8787),
    API_CLIENT_KEYS: clientKeys,
    // This worker's API as n8n reaches it (Tailscale), stored with each heartbeat so n8n fetches a
    // video's media from the worker the video is pinned to (D-074).
    WORKER_API_URL: z
      .string()
      .regex(/^https?:\/\/[^\s/]+$/, 'must be http(s)://host[:port] without a path')
      .optional(),
    LEASE_SECONDS: z.coerce.number().int().min(10).default(60),
    HEARTBEAT_SECONDS: z.coerce.number().int().min(1).default(20),
    POLL_INTERVAL_MS: z.coerce.number().int().min(100).default(1000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    // Claude Code CLI (D-042). launchd's PATH does not include ~/.local/bin: use an absolute path.
    CLAUDE_BIN: z.string().min(1).default('claude'),
    CLAUDE_MODEL: z.string().min(1).optional(),
    // The episode-code agent (D-053): Opus by default, never switched automatically.
    CLAUDE_AGENT_MODEL: z.string().min(1).default('claude-opus-5-5'),
    CLAUDE_TIMEOUT_SECONDS: z.coerce.number().int().min(30).max(3600).default(600),
    CLAUDE_BLOCK_SECONDS: z.coerce.number().int().min(60).max(86_400).default(3600),
    // ITERA TTS (D-040, S-24). The key comes from the Keychain (run-worker.sh); without it tts
    // jobs wait as BLOCKED.
    ITERA_BASE_URL: z.url({ protocol: /^https$/ }).default('https://api.genmax.io'),
    ITERA_API_KEY: z.string().min(MIN_ITERA_KEY_LENGTH).optional(),
    ITERA_POLL_MS: z.coerce.number().int().min(500).default(2000),
    ITERA_TASK_TIMEOUT_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),
    ITERA_BLOCK_SECONDS: z.coerce.number().int().min(60).max(86_400).default(3600),
    // Archive (D-063): Google Drive through an rclone remote the owner configured (OAuth), e.g.
    // "aivideo-drive:AI Video Archive". Nextcloud WebDAV (D-036) is used only when no rclone remote
    // is set; its password comes from the Keychain (run-worker.sh). Without either, archive and
    // cleanup jobs wait BLOCKED.
    ARCHIVE_RCLONE_REMOTE: z
      .string()
      .regex(/^[\w-]+:/)
      .optional(),
    RCLONE_BIN: z.string().min(1).default('rclone'),
    ARCHIVE_RCLONE_TIMEOUT_SECONDS: z.coerce.number().int().min(60).max(86_400).default(3600),
    ARCHIVE_WEBDAV_URL: z.url().optional(),
    ARCHIVE_WEBDAV_USER: z.string().min(1).optional(),
    ARCHIVE_WEBDAV_PASSWORD: z.string().min(1).optional(),
    ARCHIVE_BLOCK_SECONDS: z.coerce.number().int().min(60).max(86_400).default(3600),
    // ffmpeg's ffprobe measures clip durations; launchd's PATH includes /opt/homebrew/bin.
    FFPROBE_BIN: z.string().min(1).default('ffprobe'),
    // ffmpeg normalises the preview's loudness (render_preview, D-032).
    FFMPEG_BIN: z.string().min(1).default('ffmpeg'),
    // Shared royalty-free music library with catalog.json (D-021). Unset: previews have no music.
    MUSIC_LIBRARY_DIR: z.string().refine(isAbsolute, 'must be an absolute path').optional(),
    // whisper.cpp word timing for episodes (timing step). Unset model: timing jobs wait BLOCKED.
    WHISPER_BIN: z.string().min(1).default('whisper-cli'),
    WHISPER_MODEL: z.string().refine(isAbsolute, 'must be an absolute path').optional(),
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
  /** Runtime root of this worker Mac (D-065). */
  runtimeRoot: string;
  apiHost: string;
  apiPort: number;
  apiClientKeys: Record<string, string>;
  /** Base URL n8n uses for this worker's API (D-074). */
  apiUrl: string | undefined;
  leaseSeconds: number;
  heartbeatSeconds: number;
  pollIntervalMs: number;
  logLevel: string;
  claude: {
    bin: string;
    model: string | undefined;
    agentModel: string;
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
  archive: {
    rclone: { bin: string; remote: string; timeoutMs: number } | null;
    webdav: { baseUrl: string; username: string; password: string } | null;
    blockSeconds: number;
  };
  ffprobeBin: string;
  ffmpegBin: string;
  musicLibraryDir: string | undefined;
  whisper: { bin: string; model: string | undefined };
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
    runtimeRoot: e.AIVIDEO_ROOT ?? join(homedir(), 'aivideo'),
    apiHost: e.API_HOST,
    apiPort: e.API_PORT,
    apiClientKeys: e.API_CLIENT_KEYS,
    apiUrl: e.WORKER_API_URL,
    leaseSeconds: e.LEASE_SECONDS,
    heartbeatSeconds: e.HEARTBEAT_SECONDS,
    pollIntervalMs: e.POLL_INTERVAL_MS,
    logLevel: e.LOG_LEVEL,
    claude: {
      bin: e.CLAUDE_BIN,
      model: e.CLAUDE_MODEL,
      agentModel: e.CLAUDE_AGENT_MODEL,
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
    archive: {
      rclone: e.ARCHIVE_RCLONE_REMOTE
        ? {
            bin: e.RCLONE_BIN,
            remote: e.ARCHIVE_RCLONE_REMOTE,
            timeoutMs: e.ARCHIVE_RCLONE_TIMEOUT_SECONDS * 1000,
          }
        : null,
      webdav:
        e.ARCHIVE_WEBDAV_URL && e.ARCHIVE_WEBDAV_USER && e.ARCHIVE_WEBDAV_PASSWORD
          ? {
              baseUrl: e.ARCHIVE_WEBDAV_URL,
              username: e.ARCHIVE_WEBDAV_USER,
              password: e.ARCHIVE_WEBDAV_PASSWORD,
            }
          : null,
      blockSeconds: e.ARCHIVE_BLOCK_SECONDS,
    },
    ffprobeBin: e.FFPROBE_BIN,
    ffmpegBin: e.FFMPEG_BIN,
    musicLibraryDir: e.MUSIC_LIBRARY_DIR,
    whisper: { bin: e.WHISPER_BIN, model: e.WHISPER_MODEL },
  };
}
