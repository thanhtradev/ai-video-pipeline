import { setTimeout as sleep } from 'node:timers/promises';
import { runNextJob, type RunnerDeps } from './runner.js';

// Sequential poll loop: one job at a time per worker process (Phase 1).
// Concurrency per stream is limited centrally by dispatch_claim.

const WORKER_HEARTBEAT_MS = 30_000;
const ERROR_BACKOFF_MS = 5_000;

export interface WorkerLoopDeps extends RunnerDeps {
  streams: readonly string[];
  pollIntervalMs: number;
}

export interface WorkerLoop {
  start: () => void;
  /** Stops taking new jobs and waits for the current one to finish. */
  stop: () => Promise<void>;
  activeJobs: () => number;
}

export function createWorkerLoop(deps: WorkerLoopDeps): WorkerLoop {
  let running = false;
  let active = 0;
  let lastWorkerHeartbeat = 0;
  let loopDone: Promise<void> = Promise.resolve();
  const stopController = new AbortController();

  async function reportWorkerHeartbeat(): Promise<void> {
    if (Date.now() - lastWorkerHeartbeat < WORKER_HEARTBEAT_MS) return;
    await deps.store.workerHeartbeat(deps.workerId, deps.streams);
    lastWorkerHeartbeat = Date.now();
  }

  async function idle(ms: number): Promise<void> {
    try {
      await sleep(ms, undefined, { signal: stopController.signal });
    } catch {
      // Stop requested.
    }
  }

  async function loop(): Promise<void> {
    while (running) {
      try {
        await reportWorkerHeartbeat();
        active = 1;
        const outcome = await runNextJob(deps);
        active = 0;
        if (outcome.kind === 'idle') await idle(deps.pollIntervalMs);
        else deps.logger.info({ outcome }, 'job finished');
      } catch (error: unknown) {
        active = 0;
        deps.logger.error(
          { err: error instanceof Error ? error.message : String(error) },
          'worker loop error',
        );
        await idle(ERROR_BACKOFF_MS);
      }
    }
  }

  return {
    start: () => {
      if (running) return;
      running = true;
      loopDone = loop();
    },
    stop: async () => {
      running = false;
      stopController.abort();
      await loopDone;
    },
    activeJobs: () => active,
  };
}
