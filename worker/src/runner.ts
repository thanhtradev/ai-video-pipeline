import type { Logger } from 'pino';
import type { JobStore, StartedJob } from './db/job-store.js';
import type { JobQueue, QueueMessage } from './queue/redis-queue.js';
import { readValidCheckpoint, writeCheckpoint, type Checkpoint } from './storage/checkpoint.js';
import { jobWorkspace } from './storage/workspace.js';

// Executes one queued job: start (DB guard) -> checkpoint short-circuit -> handler with heartbeat
// -> checkpoint -> succeed. Failure classification follows docs/job-lifecycle.md §6.

/** Throw from a handler when retrying cannot help (bad input, content rejected). */
export class PermanentJobError extends Error {
  override name = 'PermanentJobError';
}

export interface HandlerContext {
  jobId: string;
  attemptNo: number;
  input: unknown;
  workDir: string;
  signal: AbortSignal;
  logger: Logger;
}

export interface HandlerResult {
  /** Paths relative to workDir. */
  outputs: string[];
  result: Record<string, unknown>;
}

export type JobHandler = (context: HandlerContext) => Promise<HandlerResult>;

export interface RunnerDeps {
  store: JobStore;
  queue: JobQueue;
  handlers: ReadonlyMap<string, JobHandler>;
  workRoot: string;
  workerId: string;
  leaseSeconds: number;
  heartbeatMs: number;
  logger: Logger;
}

export type RunOutcome =
  | { kind: 'idle' }
  | { kind: 'skipped'; jobId: string }
  | { kind: 'succeeded'; jobId: string; fromCheckpoint: boolean }
  | { kind: 'failed'; jobId: string; status: string }
  | { kind: 'aborted'; jobId: string; reason: string };

const MAX_ERROR_LENGTH = 2000;

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return message.slice(0, MAX_ERROR_LENGTH);
}

function checkpointOutput(
  checkpoint: Checkpoint,
  fromCheckpoint: boolean,
): Record<string, unknown> {
  return { outputs: checkpoint.outputs, result: checkpoint.result, fromCheckpoint };
}

function startHeartbeat(deps: RunnerDeps, jobId: string, controller: AbortController): () => void {
  const timer = setInterval(() => {
    deps.store
      .heartbeat(jobId, deps.workerId, deps.leaseSeconds)
      .then((status) => {
        if (status !== 'RUNNING' && !controller.signal.aborted) controller.abort(status);
      })
      .catch((error: unknown) => {
        // DB unreachable: keep working; the lease watchdog decides if we were too slow.
        deps.logger.warn({ jobId, err: errorMessage(error) }, 'heartbeat failed');
      });
  }, deps.heartbeatMs);
  return () => clearInterval(timer);
}

async function execute(deps: RunnerDeps, job: StartedJob): Promise<RunOutcome> {
  const log = deps.logger.child({
    videoId: job.videoId,
    version: job.version,
    jobId: job.jobId,
    step: job.step,
    attempt: job.attemptNo,
  });
  const workDir = await jobWorkspace(deps.workRoot, job);

  const existing = await readValidCheckpoint(workDir);
  if (existing) {
    log.info('valid checkpoint found, skipping handler');
    await deps.store.succeed(job.jobId, deps.workerId, checkpointOutput(existing, true));
    return { kind: 'succeeded', jobId: job.jobId, fromCheckpoint: true };
  }

  const handler = deps.handlers.get(job.step);
  if (!handler) {
    const status = await deps.store.fail(
      job.jobId,
      deps.workerId,
      `no handler for step ${job.step}`,
      false,
    );
    return { kind: 'failed', jobId: job.jobId, status };
  }

  const controller = new AbortController();
  const stopHeartbeat = startHeartbeat(deps, job.jobId, controller);
  let result: HandlerResult;
  try {
    result = await handler({
      jobId: job.jobId,
      attemptNo: job.attemptNo,
      input: job.input,
      workDir,
      signal: controller.signal,
      logger: log,
    });
  } catch (error: unknown) {
    if (controller.signal.aborted) {
      return { kind: 'aborted', jobId: job.jobId, reason: String(controller.signal.reason) };
    }
    const retryable = !(error instanceof PermanentJobError);
    log.warn({ err: errorMessage(error), retryable }, 'handler failed');
    const status = await deps.store.fail(job.jobId, deps.workerId, errorMessage(error), retryable);
    return { kind: 'failed', jobId: job.jobId, status };
  } finally {
    stopHeartbeat();
  }

  if (controller.signal.aborted) {
    return { kind: 'aborted', jobId: job.jobId, reason: String(controller.signal.reason) };
  }

  const checkpoint = await writeCheckpoint(workDir, result.outputs, result.result);
  await deps.store.succeed(job.jobId, deps.workerId, checkpointOutput(checkpoint, false));
  log.info('job succeeded');
  return { kind: 'succeeded', jobId: job.jobId, fromCheckpoint: false };
}

/** Takes one message from the queue and runs it. Infrastructure errors propagate to the caller. */
export async function runNextJob(deps: RunnerDeps): Promise<RunOutcome> {
  const message: QueueMessage | null = await deps.queue.next();
  if (!message) return { kind: 'idle' };

  try {
    const job = await deps.store.start(message.jobId, deps.workerId, deps.leaseSeconds);
    if (!job) {
      deps.logger.info({ jobId: message.jobId }, 'job not startable, dropping message');
      return { kind: 'skipped', jobId: message.jobId };
    }
    return await execute(deps, job);
  } finally {
    await deps.queue.ack(message);
  }
}
