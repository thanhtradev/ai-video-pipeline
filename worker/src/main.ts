import { fileURLToPath } from 'node:url';
import { Redis } from 'ioredis';
import pg from 'pg';
import { buildApi } from './api.js';
import { createAgentCli } from './claude/agent-cli.js';
import { claudeChildEnv, createClaudeCli } from './claude/claude-cli.js';
import { loadConfig, type Config } from './config.js';
import { createCostStore } from './db/cost-store.js';
import { createJobStore } from './db/job-store.js';
import { createRulesSource } from './db/rules-store.js';
import { createRcloneRunner, createRcloneTarget } from './archive/rclone-target.js';
import { createWebdavTarget } from './archive/webdav-target.js';
import { createGateRunner } from './episode/gates.js';
import { chromeInstalled } from './episode/workspace.js';
import { createEpisodeCodeHandler } from './handlers/episode-code.js';
import { createEpisodeScriptHandler, routeScriptJobs } from './handlers/episode-script.js';
import { createArchiveVideoHandler } from './handlers/archive-video.js';
import { createCleanupLocalHandler } from './handlers/cleanup-local.js';
import { createMetadataHandler } from './handlers/metadata.js';
import { createQaPreviewHandler } from './handlers/qa-preview.js';
import {
  createRenderEpisodeHandler,
  createSandboxedEpisodeRenderer,
} from './handlers/render-episode.js';
import { createRenderPreviewHandler } from './handlers/render-preview.js';
import { createScriptHandler } from './handlers/script.js';
import { simulateHandler } from './handlers/simulate.js';
import { createTimingHandler } from './handlers/timing.js';
import { createTtsHandler } from './handlers/tts.js';
import { createLogger, redactUrl } from './logger.js';
import type { Logger } from 'pino';
import { createFfprobe } from './media/ffprobe.js';
import { createFrameGrabber } from './media/frame.js';
import { createGapDetector, createMediaInspector } from './media/inspect.js';
import { createLoudnessNormalizer } from './media/loudness.js';
import { createVoiceBuilder } from './media/voice.js';
import { createWhisper } from './media/whisper.js';
import { createRedisQueue } from './queue/redis-queue.js';
import { createMusicLibrary } from './render/music.js';
import { createRemotionRenderer } from './render/remotion-renderer.js';
import type { JobHandler } from './runner.js';
import { createRedisNonceStore } from './security/redis-nonce-store.js';
import { createIteraClient } from './tts/itera-client.js';
import { createWorkerLoop } from './worker-loop.js';

const SHUTDOWN_TIMEOUT_MS = 5 * 60 * 1000;
const ITERA_REQUEST_TIMEOUT_MS = 60_000;
/** A timing job without a whisper model waits this long before it checks again. */
const WHISPER_BLOCK_SECONDS = 3600;
/** How long an episode job waits before checking again for Remotion's Chrome. */
const CHROME_BLOCK_SECONDS = 1800;

const CLAUDE_SETTINGS = fileURLToPath(
  new URL('../../ops/claude/pipeline-settings.json', import.meta.url),
);
const EPISODE_RENDER_PROFILE = fileURLToPath(
  new URL('../../ops/claude/episode-render.sb', import.meta.url),
);

// Step name -> handler. Phase 2d adds qa, final render, archive.
/** Google Drive through rclone when configured (D-063), else Nextcloud WebDAV, else none. */
function archiveTarget(config: Config) {
  const { rclone, webdav, blockSeconds } = config.archive;
  if (rclone) {
    const run = createRcloneRunner(rclone.bin, rclone.timeoutMs);
    return {
      target: createRcloneTarget({ run, root: rclone.remote }),
      targetName: 'gdrive',
      blockSeconds,
    };
  }
  if (webdav) return { target: createWebdavTarget(webdav), targetName: 'nextcloud', blockSeconds };
  return { target: null, targetName: 'none', blockSeconds };
}

function buildHandlers(
  config: Config,
  pool: pg.Pool,
  logger: Logger,
): ReadonlyMap<string, JobHandler> {
  const claude = createClaudeCli({
    bin: config.claude.bin,
    settingsPath: CLAUDE_SETTINGS,
    timeoutMs: config.claude.timeoutSeconds * 1000,
    blockSeconds: config.claude.blockSeconds,
    env: claudeChildEnv(process.env),
    ...(config.claude.model ? { model: config.claude.model } : {}),
  });
  const { itera } = config;
  const probe = createFfprobe(config.ffprobeBin);
  const rules = createRulesSource(pool, config.workerId);
  const archive = archiveTarget(config);
  const qaHandler = createQaPreviewHandler({
    inspect: createMediaInspector(config.ffprobeBin),
    detectGaps: createGapDetector(config.ffmpegBin),
  });
  const renderEpisode = createRenderEpisodeHandler({
    render: createSandboxedEpisodeRenderer(EPISODE_RENDER_PROFILE, config.runtimeRoot),
    loudness: createLoudnessNormalizer(config.ffmpegBin),
    probe,
    browserReady: chromeInstalled,
    blockSeconds: CHROME_BLOCK_SECONDS,
  });
  const tts = createTtsHandler({
    itera: itera.apiKey
      ? createIteraClient({
          baseUrl: itera.baseUrl,
          apiKey: itera.apiKey,
          blockSeconds: itera.blockSeconds,
          requestTimeoutMs: ITERA_REQUEST_TIMEOUT_MS,
        })
      : null,
    costs: createCostStore(pool),
    probe,
    workerId: config.workerId,
    pollMs: itera.pollMs,
    rules,
    taskTimeoutMs: itera.taskTimeoutSeconds * 1000,
    blockSeconds: itera.blockSeconds,
  });
  return new Map([
    ['simulate', simulateHandler],
    [
      'script',
      routeScriptJobs(
        createScriptHandler({ claude }),
        createEpisodeScriptHandler({ claude, rules }),
      ),
    ],
    ['tts', tts],
    [
      'episode_code',
      createEpisodeCodeHandler({
        agent: createAgentCli({
          bin: config.claude.bin,
          model: config.claude.agentModel,
          blockSeconds: config.claude.blockSeconds,
          env: claudeChildEnv(process.env),
        }),
        gates: createGateRunner({
          profile: EPISODE_RENDER_PROFILE,
          runtimeRoot: config.runtimeRoot,
        }),
        // Values the agent's files must never contain.
        secrets: [
          process.env.CLAUDE_CODE_OAUTH_TOKEN ?? '',
          config.itera.apiKey ?? '',
          ...Object.values(config.apiClientKeys),
        ],
        rules,
        browserReady: chromeInstalled,
        blockSeconds: CHROME_BLOCK_SECONDS,
        runtimeRoot: config.runtimeRoot,
      }),
    ],
    [
      'timing',
      createTimingHandler({
        buildVoice: createVoiceBuilder(config.ffmpegBin),
        transcribe: config.whisper.model
          ? createWhisper({ bin: config.whisper.bin, model: config.whisper.model })
          : null,
        blockSeconds: WHISPER_BLOCK_SECONDS,
      }),
    ],
    // The final 1080p render (D-057) is the same handler; its input says quality: final.
    ['render_episode', renderEpisode],
    ['render_final', renderEpisode],
    ['qa_final', qaHandler],
    [
      'metadata',
      createMetadataHandler({
        claude,
        grabFrame: createFrameGrabber(config.ffmpegBin),
        rules,
      }),
    ],
    ['archive', createArchiveVideoHandler(archive)],
    ['cleanup', createCleanupLocalHandler(archive)],
    ['qa_preview', qaHandler],
    [
      'render_preview',
      createRenderPreviewHandler({
        renderer: createRemotionRenderer(logger),
        loudness: createLoudnessNormalizer(config.ffmpegBin),
        probe,
        music: config.musicLibraryDir ? createMusicLibrary(config.musicLibraryDir) : null,
      }),
    ],
  ]);
}

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const logger = createLogger({ level: config.logLevel });
  logger.info(
    {
      workerId: config.workerId,
      streams: config.workerStreams,
      database: redactUrl(config.databaseUrl),
      redis: redactUrl(config.redisUrl),
    },
    'worker starting',
  );

  const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 4 });
  pool.on('error', (error) => logger.error({ err: error.message }, 'postgres pool error'));
  const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: 3 });
  redis.on('error', (error) => logger.error({ err: error.message }, 'redis error'));

  const queue = createRedisQueue(redis, {
    workerId: config.workerId,
    streams: config.workerStreams,
  });
  const recovered = await queue.recoverInFlight();
  if (recovered > 0) logger.warn({ recovered }, 'returned in-flight messages to the queue');

  const loop = createWorkerLoop({
    store: createJobStore(pool),
    queue,
    handlers: buildHandlers(config, pool, logger),
    workRoot: config.workRoot,
    workerId: config.workerId,
    streams: config.workerStreams,
    leaseSeconds: config.leaseSeconds,
    heartbeatMs: config.heartbeatSeconds * 1000,
    pollIntervalMs: config.pollIntervalMs,
    logger,
  });

  const api = await buildApi({
    workerId: config.workerId,
    streams: config.workerStreams,
    clientKeys: config.apiClientKeys,
    nonces: createRedisNonceStore(redis),
    activeJobs: loop.activeJobs,
    logger,
    workRoot: config.workRoot,
  });
  await api.listen({ host: config.apiHost, port: config.apiPort });
  loop.start();
  logger.info({ host: config.apiHost, port: config.apiPort }, 'worker ready');

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down; finishing current job');
    const forceExit = setTimeout(() => {
      logger.error('shutdown timed out; lease watchdog will recover the job');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    await loop.stop();
    await api.close();
    await Promise.all([pool.end(), redis.quit()]);
    clearTimeout(forceExit);
    process.exit(0);
  };
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((error: unknown) => {
  // Config errors never contain secret values (see loadConfig).
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
