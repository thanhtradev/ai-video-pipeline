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

/**
 * Throw from a handler when a provider refuses for quota/usage reasons (e.g. Claude Code usage
 * limit). The job waits as BLOCKED and resumes after retryAfterSeconds; it is not a failed attempt
 * and never switches provider (docs/job-lifecycle.md §6).
 */
export class ProviderBlockedError extends Error {
  override name = 'ProviderBlockedError';

  constructor(
    message: string,
    readonly retryAfterSeconds: number,
  ) {
    super(message);
  }
}

export interface HandlerContext {
  jobId: string;
  attemptNo: number;
  input: unknown;
  workDir: string;
  signal: AbortSignal;
  logger: Logger;
  /** Reports what the step is doing (P-017, /status on Telegram). Never fails the job. */
  progress: (progress: Record<string, unknown>) => Promise<void>;
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
  | { kind: 'blocked'; jobId: string; status: string }
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

interface Lease {
  job: StartedJob;
  controller: AbortController;
  log: Logger;
}

function aborted(lease: Lease): RunOutcome {
  return {
    kind: 'aborted',
    jobId: lease.job.jobId,
    reason: String(lease.controller.signal.reason),
  };
}

/** Reports success; a false return means the job is no longer ours (lease expired, cancelled). */
async function finish(
  deps: RunnerDeps,
  lease: Lease,
  checkpoint: Checkpoint,
  fromCheckpoint: boolean,
): Promise<RunOutcome> {
  const { job, controller, log } = lease;
  const ok = await deps.store.succeed(
    job.jobId,
    deps.workerId,
    checkpointOutput(checkpoint, fromCheckpoint),
  );
  if (!ok) {
    const reason = controller.signal.aborted ? String(controller.signal.reason) : 'LOST';
    log.warn({ reason }, 'job finished but could not be reported as succeeded');
    return { kind: 'aborted', jobId: job.jobId, reason };
  }
  log.info({ fromCheckpoint }, 'job succeeded');
  return { kind: 'succeeded', jobId: job.jobId, fromCheckpoint };
}

async function runHandler(deps: RunnerDeps, lease: Lease, workDir: string): Promise<RunOutcome> {
  const { job, controller, log } = lease;
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

  let result: HandlerResult;
  try {
    result = await handler({
      jobId: job.jobId,
      attemptNo: job.attemptNo,
      input: job.input,
      workDir,
      signal: controller.signal,
      logger: log,
      progress: (progress) =>
        deps.store.reportProgress(job.jobId, deps.workerId, progress).then(
          () => undefined,
          (error: unknown) => log.warn({ err: errorMessage(error) }, 'progress report failed'),
        ),
    });
  } catch (error: unknown) {
    if (controller.signal.aborted) return aborted(lease);
    if (error instanceof ProviderBlockedError) {
      log.warn(
        { err: errorMessage(error), retryAfterSeconds: error.retryAfterSeconds },
        'provider blocked',
      );
      const status = await deps.store.block(
        job.jobId,
        deps.workerId,
        errorMessage(error),
        error.retryAfterSeconds,
      );
      return { kind: 'blocked', jobId: job.jobId, status };
    }
    const retryable = !(error instanceof PermanentJobError);
    log.warn({ err: errorMessage(error), retryable }, 'handler failed');
    const status = await deps.store.fail(job.jobId, deps.workerId, errorMessage(error), retryable);
    return { kind: 'failed', jobId: job.jobId, status };
  }
  if (controller.signal.aborted) return aborted(lease);

  const checkpoint = await writeCheckpoint(workDir, result.outputs, result.result);
  return finish(deps, lease, checkpoint, false);
}

async function execute(deps: RunnerDeps, job: StartedJob): Promise<RunOutcome> {
  const log = deps.logger.child({
    videoId: job.videoId,
    version: job.version,
    jobId: job.jobId,
    step: job.step,
    attempt: job.attemptNo,
  });
  const controller = new AbortController();
  // The lease stays alive for the whole attempt, including hashing large outputs for checkpoints.
  const stopHeartbeat = startHeartbeat(deps, job.jobId, controller);
  const lease: Lease = { job, controller, log };
  try {
    const workDir = await jobWorkspace(deps.workRoot, job);
    const existing = await readValidCheckpoint(workDir);
    if (existing) {
      log.info('valid checkpoint found, skipping handler');
      return await finish(deps, lease, existing, true);
    }
    return await runHandler(deps, lease, workDir);
  } finally {
    stopHeartbeat();
  }
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
