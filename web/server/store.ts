import type pg from 'pg';
import type {
  Attention,
  AutoResult,
  CancelOutcome,
  CancelPreview,
  DecideAction,
  DecideResult,
  RetryResult,
  Me,
  Report,
  ReportPeriod,
  VideoDetail,
  VideoFilter,
  VideoMediaList,
  VideoPage,
  WorkerDetail,
  WorkerSummary,
} from '../shared/types.js';
import { UnauthorizedError } from './errors.js';

// Every call goes through a web_* function: the role has no table access, and state and permission
// rules stay in SQL (CLAUDE.md §4.7).

// Raised by web_session_user(). Not 28000, which also means Postgres refused the connection.
const INVALID_SESSION = 'WB401';

export interface LoginResult {
  session: string;
  expiresAt: Date;
}

export interface VideoQuery {
  state: VideoFilter;
  search: string;
  limit: number;
  offset: number;
}

/** Holds a worker media token: for the service only, never sent to a browser. */
export interface MediaFileAccess {
  file: string;
  kind: 'media' | 'board';
  job_id: string;
  token: string;
  version: number;
  base_url: string | null;
}

export interface Store {
  loginConsume: (token: string) => Promise<LoginResult | null>;
  logout: (session: string) => Promise<void>;
  me: (session: string) => Promise<Me>;
  attention: (session: string) => Promise<Attention>;
  videos: (session: string, query: VideoQuery) => Promise<VideoPage>;
  video: (session: string, videoId: string) => Promise<VideoDetail | null>;
  workers: (session: string) => Promise<WorkerSummary[]>;
  worker: (session: string, workerId: string) => Promise<WorkerDetail | null>;
  report: (session: string, period: ReportPeriod) => Promise<Report>;
  decide: (
    session: string,
    approvalId: string,
    action: DecideAction,
    note: string | null,
  ) => Promise<DecideResult>;
  retry: (session: string, videoId: string) => Promise<RetryResult>;
  auto: (session: string, videoId: string, enable: boolean) => Promise<AutoResult>;
  cancel: (session: string, videoId: string) => Promise<CancelPreview>;
  cancelConfirm: (session: string, token: string, confirm: boolean) => Promise<CancelOutcome>;
  videoMedia: (session: string, videoId: string) => Promise<VideoMediaList | null>;
  videoMediaFile: (
    session: string,
    videoId: string,
    file: string,
  ) => Promise<MediaFileAccess | null>;
  ping: () => Promise<void>;
}

function isInvalidSession(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === INVALID_SESSION;
}

export function createPgStore(pool: pg.Pool): Store {
  async function call<T>(fn: string, ...args: unknown[]): Promise<T> {
    const placeholders = args.map((_, index) => `$${index + 1}`).join(', ');
    try {
      const result = await pool.query<{ value: T }>(`SELECT ${fn}(${placeholders}) AS value`, args);
      return result.rows[0]!.value;
    } catch (error: unknown) {
      if (isInvalidSession(error)) throw new UnauthorizedError();
      throw error;
    }
  }

  return {
    loginConsume: async (token) => {
      const result = await pool.query<{ result: string; session: string; expires_at: Date }>(
        'SELECT * FROM web_login_consume($1)',
        [token],
      );
      const row = result.rows[0]!;
      return row.result === 'OK' ? { session: row.session, expiresAt: row.expires_at } : null;
    },
    logout: (session) => call<void>('web_logout', session),
    me: (session) => call<Me>('web_me', session),
    attention: (session) => call<Attention>('web_attention', session),
    videos: (session, query) =>
      call<VideoPage>('web_videos', session, query.state, query.search, query.limit, query.offset),
    video: (session, videoId) => call<VideoDetail | null>('web_video', session, videoId),
    workers: (session) => call<WorkerSummary[]>('web_workers', session),
    worker: (session, workerId) => call<WorkerDetail | null>('web_worker', session, workerId),
    report: (session, period) => call<Report>('web_report', session, period),
    decide: (session, approvalId, action, note) =>
      call<DecideResult>('web_decide', session, approvalId, action, note),
    retry: (session, videoId) => call<RetryResult>('web_retry', session, videoId),
    auto: (session, videoId, enable) => call<AutoResult>('web_auto', session, videoId, enable),
    cancel: (session, videoId) => call<CancelPreview>('web_cancel', session, videoId),
    cancelConfirm: (session, token, confirm) =>
      call<CancelOutcome>('web_cancel_confirm', session, token, confirm),
    videoMedia: (session, videoId) =>
      call<VideoMediaList | null>('web_video_media', session, videoId),
    videoMediaFile: (session, videoId, file) =>
      call<MediaFileAccess | null>('web_video_media_file', session, videoId, file),
    ping: async () => {
      await pool.query('SELECT 1');
    },
  };
}
