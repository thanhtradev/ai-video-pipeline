import type {
  ApiResponse,
  Attention,
  Me,
  Report,
  ReportPeriod,
  VideoDetail,
  VideoFilter,
  VideoPage,
  WorkerDetail,
  WorkerSummary,
} from '../../shared/types';

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new ApiError(0, 'Cannot reach the console. Check that Tailscale is on.');
  }
  const body = (await response.json().catch(() => null)) as ApiResponse<T> | null;
  if (!response.ok || !body?.success) {
    throw new ApiError(response.status, body?.error ?? 'The console gave an unexpected answer.');
  }
  return body.data as T;
}

function post<T>(path: string, payload?: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    ...(payload === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }),
  });
}

export const api = {
  login: (token: string) => post<unknown>('/api/auth/login', { token }),
  logout: () => post<null>('/api/auth/logout'),
  me: () => request<Me>('/api/me'),
  attention: () => request<Attention>('/api/attention'),
  videos: (query: { state: VideoFilter; search: string; limit: number; offset: number }) => {
    const params = new URLSearchParams({
      state: query.state,
      search: query.search,
      limit: String(query.limit),
      offset: String(query.offset),
    });
    return request<VideoPage>(`/api/videos?${params.toString()}`);
  },
  video: (id: string) => request<VideoDetail>(`/api/videos/${encodeURIComponent(id)}`),
  workers: () => request<WorkerSummary[]>('/api/workers'),
  worker: (id: string) => request<WorkerDetail>(`/api/workers/${encodeURIComponent(id)}`),
  report: (period: ReportPeriod) => request<Report>(`/api/report?period=${period}`),
};
