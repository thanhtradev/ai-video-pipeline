import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import type { Logger } from 'pino';
import type { MoveStore } from '../db/move-store.js';
import { importVideo } from './import-video.js';

// Target side of a video move (D-087), run as the worker loop's idle work: claim a move waiting
// for this worker, fetch the video folder from the source worker's /transfer endpoint, import it
// (import-video.ts checks every entry and checkpoint), then complete the move, which re-pins the
// video. Any failure is reported; SQL decides whether another attempt follows (3 at most).

/** Longer than the transfer timeout, so a live copy never loses its lease. */
export const MOVE_LEASE_SECONDS = 2 * 60 * 60;
const TRANSFER_TIMEOUT_MS = 100 * 60 * 1000;
const MAX_ERROR_LENGTH = 2000;

export interface TransferResponse {
  ok: boolean;
  status: number;
  body: Readable | null;
}

export type TransferFetch = (url: string, signal: AbortSignal) => Promise<TransferResponse>;

export interface MoveRunnerDeps {
  store: MoveStore;
  workerId: string;
  workRoot: string;
  /** This worker's repo node_modules (the episode workspaces link to it). */
  nodeModules: string;
  fetchTransfer?: TransferFetch;
  logger: Logger;
}

/** A failure whose message is already the whole story (no error class prefix). */
class TransferError extends Error {}

function errorMessage(error: unknown): string {
  const message =
    error instanceof TransferError
      ? error.message
      : error instanceof Error
        ? `${error.name}: ${error.message}`
        : String(error);
  return message.slice(0, MAX_ERROR_LENGTH);
}

export const fetchTransfer: TransferFetch = async (url, signal) => {
  const response = await fetch(url, { signal });
  const body = response.body ? Readable.fromWeb(response.body as WebReadableStream) : null;
  return { ok: response.ok, status: response.status, body };
};

/** Returns a function that runs at most one move; it resolves true when it claimed one. */
export function createMoveRunner(deps: MoveRunnerDeps): (signal?: AbortSignal) => Promise<boolean> {
  const fetchFrom = deps.fetchTransfer ?? fetchTransfer;
  return async (signal = new AbortController().signal) => {
    const move = await deps.store.claim(deps.workerId, MOVE_LEASE_SECONDS);
    if (!move) return false;
    const log = deps.logger.child({
      moveId: move.moveId,
      videoId: move.videoId,
      from: move.fromWorker,
      attempt: move.attemptNo,
    });
    try {
      if (!move.sourceUrl) {
        throw new TransferError(`source worker ${move.fromWorker} has no API URL`);
      }
      log.info('copying video from its worker');
      // The token is never logged: it is the only proof the source asks for.
      const url = `${move.sourceUrl}/transfer/${move.videoId}?t=${move.token}`;
      const response = await fetchFrom(
        url,
        AbortSignal.any([signal, AbortSignal.timeout(TRANSFER_TIMEOUT_MS)]),
      );
      if (!response.ok || !response.body) {
        throw new TransferError(`source worker answered HTTP ${response.status}`);
      }
      const imported = await importVideo({
        workRoot: deps.workRoot,
        videoId: move.videoId,
        source: response.body,
        nodeModules: deps.nodeModules,
      });
      const status = await deps.store.complete(move.moveId, deps.workerId);
      if (status === 'DONE') log.info({ ...imported }, 'video moved to this worker');
      else log.warn({ status }, 'video copied but the move is no longer ours; copy left in place');
    } catch (error: unknown) {
      if (signal.aborted) {
        // Shutdown, not a failure: the lease expires and counts as an attempt.
        log.info('video move interrupted by shutdown');
        return true;
      }
      const status = await deps.store.fail(move.moveId, deps.workerId, errorMessage(error));
      log.warn({ err: errorMessage(error), status }, 'video move failed');
    }
    return true;
  };
}
