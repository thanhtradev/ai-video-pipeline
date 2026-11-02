import { setTimeout as sleep } from 'node:timers/promises';
import { runNextJob, type RunnerDeps } from './runner.js';

// Sequential poll loop: one job at a time per worker process (Phase 1).
// Concurrency per stream is limited centrally by dispatch_claim.

const DEFAULT_WORKER_HEARTBEAT_MS = 30_000;
const DEFAULT_IDLE_REPORT_MS = 10_000;
const ERROR_BACKOFF_MS = 5_000;

export interface WorkerLoopDeps extends RunnerDeps {
  streams: readonly string[];
  /** Sent with each worker heartbeat so n8n can reach this worker (D-074). */
  apiUrl?: string | undefined;
  pollIntervalMs: number;
  /** Liveness for the watchdog; runs on its own timer so long jobs do not look like outages. */
  workerHeartbeatMs?: number;
  /** Minimum gap between "all queues empty" reports (used to detect lost queue messages). */
  idleReportMs?: number;
  /**
   * Work done only when every queue is empty, one unit per call (idea requests, D-083). Resolves
   * true when it did something, so the loop checks the queues again before sleeping.
   */
  idleWork?: (signal: AbortSignal) => Promise<boolean>;
}

export interface WorkerLoop {
  start: () => void;
  /** Stops taking new jobs and waits for the current one to finish. */
  stop: () => Promise<void>;
  activeJobs: () => number;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createWorkerLoop(deps: WorkerLoopDeps): WorkerLoop {
  const workerHeartbeatMs = deps.workerHeartbeatMs ?? DEFAULT_WORKER_HEARTBEAT_MS;
  const idleReportMs = deps.idleReportMs ?? DEFAULT_IDLE_REPORT_MS;
  let running = false;
  let active = 0;
  let lastIdleReport = 0;
  let heartbeatTimer: NodeJS.Timeout | undefined;
  let loopDone: Promise<void> = Promise.resolve();
  const stopController = new AbortController();

  function sendWorkerHeartbeat(): void {
    deps.store
      .workerHeartbeat(deps.workerId, deps.streams, deps.apiUrl)
      .catch((error: unknown) =>
        deps.logger.warn({ err: errorText(error) }, 'worker heartbeat failed'),
      );
  }

  async function reportIdle(): Promise<void> {
    if (Date.now() - lastIdleReport < idleReportMs) return;
    lastIdleReport = Date.now();
    await deps.store.workerIdle(deps.workerId);
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
        active = 1;
        const outcome = await runNextJob(deps);
        if (outcome.kind !== 'idle') {
          active = 0;
          deps.logger.info({ outcome }, 'job finished');
          continue;
        }
        active = 0;
        await reportIdle();
        // Idle work is not a job: /capabilities keeps reporting this worker as free.
        const didWork = deps.idleWork ? await deps.idleWork(stopController.signal) : false;
        if (!didWork) await idle(deps.pollIntervalMs);
      } catch (error: unknown) {
        active = 0;
        deps.logger.error({ err: errorText(error) }, 'worker loop error');
        await idle(ERROR_BACKOFF_MS);
      }
    }
  }

  return {
    start: () => {
      if (running) return;
      running = true;
      sendWorkerHeartbeat();
      heartbeatTimer = setInterval(sendWorkerHeartbeat, workerHeartbeatMs);
      loopDone = loop();
    },
    stop: async () => {
      running = false;
      stopController.abort();
      await loopDone;
      clearInterval(heartbeatTimer);
    },
    activeJobs: () => active,
  };
}
