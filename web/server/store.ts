import type pg from 'pg';
import type {
  Attention,
  Me,
  Report,
  ReportPeriod,
  VideoDetail,
  VideoFilter,
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
    ping: async () => {
      await pool.query('SELECT 1');
    },
  };
}
