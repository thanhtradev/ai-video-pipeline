import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Logger } from 'pino';
import type { ClaudeRunner } from '../claude/claude-cli.js';
import type { IdeaStore } from '../db/idea-store.js';
import { ProviderBlockedError } from '../runner.js';
import { generateIdeas } from './generate-ideas.js';

// Runs one due idea request (D-083) when the worker's video queues are empty: claim it, ask
// Claude, store the ideas. Ideas are not video jobs, so they have their own lease in SQL and no
// checkpoint: a request that never completed simply runs again. A usage limit blocks it (no
// provider switch, CLAUDE.md §5); any other error is a retryable failure, bounded in SQL.

const MAX_ERROR_LENGTH = 2000;

export interface IdeaRunnerDeps {
  store: IdeaStore;
  claude: ClaudeRunner;
  workerId: string;
  /** Longer than the Claude CLI timeout, so a live attempt never loses its lease. */
  leaseSeconds: number;
  logger: Logger;
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return message.slice(0, MAX_ERROR_LENGTH);
}

/**
 * Returns a function that runs at most one request; it resolves true when it ran one. The signal
 * (the worker loop's stop) aborts the Claude call, so shutdown never waits for a whole CLI run.
 */
export function createIdeaRunner(deps: IdeaRunnerDeps): (signal?: AbortSignal) => Promise<boolean> {
  return async (signal = new AbortController().signal) => {
    const request = await deps.store.claim(deps.workerId, deps.leaseSeconds);
    if (!request) return false;
    const log = deps.logger.child({
      ideaRequestId: request.requestId,
      kit: request.kit,
      characterSet: request.characterSet,
      attempt: request.attemptNo,
    });
    // The CLI runs in an empty directory of its own (claude-cli.ts); nothing is kept.
    const workDir = await mkdtemp(join(tmpdir(), 'aivideo-ideas-'));
    try {
      const ideas = await generateIdeas(deps.claude, request, { workDir, signal });
      const ok = await deps.store.complete(request.requestId, deps.workerId, ideas);
      if (ok) log.info({ count: ideas.length }, 'ideas written');
      else log.warn('ideas written but the request is no longer ours');
    } catch (error: unknown) {
      if (signal.aborted) {
        // Shutdown, not a failure: the lease expires and the request runs again.
        log.info('idea request interrupted by shutdown');
        return true;
      }
      if (error instanceof ProviderBlockedError) {
        log.warn({ err: errorMessage(error) }, 'idea request blocked by the provider');
        await deps.store.block(
          request.requestId,
          deps.workerId,
          errorMessage(error),
          error.retryAfterSeconds,
        );
      } else {
        log.warn({ err: errorMessage(error) }, 'idea request failed');
        await deps.store.fail(request.requestId, deps.workerId, errorMessage(error), true);
      }
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
    return true;
  };
}
