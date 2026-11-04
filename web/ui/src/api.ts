import type {
  ApiResponse,
  Attention,
  AutoResult,
  CancelOutcome,
  CancelPreview,
  DecideAction,
  DecideResult,
  RetryResult,
  VideoMediaList,
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
  media: (id: string) => request<VideoMediaList>(`/api/videos/${encodeURIComponent(id)}/media`),
  decide: (approvalId: string, action: DecideAction, note?: string) =>
    post<DecideResult>(`/api/approvals/${encodeURIComponent(approvalId)}/decide`, {
      action,
      ...(note === undefined ? {} : { note }),
    }),
  retry: (id: string) => post<RetryResult>(`/api/videos/${encodeURIComponent(id)}/retry`, {}),
  auto: (id: string, enable: boolean) =>
    post<AutoResult>(`/api/videos/${encodeURIComponent(id)}/auto`, { enable }),
  cancelPreview: (id: string) =>
    post<CancelPreview>(`/api/videos/${encodeURIComponent(id)}/cancel`, {}),
  cancelConfirm: (token: string, confirm: boolean) =>
    post<CancelOutcome>(`/api/cancel/${encodeURIComponent(token)}`, { confirm }),
  report: (period: ReportPeriod) => request<Report>(`/api/report?period=${period}`),
};
