// What the web_* functions return (db/migrations/20261127000100_web_console.sql), shared by the
// service and the page.

export type StateGroup = 'STOPPED' | 'APPROVAL' | 'RUNNING' | 'WAITING' | 'DONE';
export type VideoFilter =
  'all' | 'active' | 'stopped' | 'approval' | 'running' | 'waiting' | 'done';
export type ReportPeriod = 'today' | '7d' | '30d';
export type Cost = Record<string, number>;

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface Me {
  user_id: number;
  name: string;
  is_owner: boolean;
}

export interface StripCell {
  step: string;
  status: string;
}

export interface VideoSummary {
  video_id: string;
  version: number;
  title: string | null;
  kit: string | null;
  status: string;
  state_group: StateGroup;
  step: string | null;
  step_status: string | null;
  steps_done: number;
  steps_total: number;
  strip: StripCell[];
  approval_type: string | null;
  approval_expires_at: string | null;
  cost: Cost;
  worker_id: string | null;
  worker_online: boolean | null;
  auto: boolean;
  created_at: string;
  updated_at: string;
}

export interface VideoPage {
  items: VideoSummary[];
  total: number;
}

export interface VideoJob {
  step: string;
  status: string;
  attempts: number;
  started: string | null;
  finished: string | null;
  error: string | null;
  progress: unknown;
}

export interface OpenApproval {
  approval_id: string;
  type: string;
  requested_at: string;
  expires_at: string;
}

export interface VideoDetail extends VideoSummary {
  brief: Record<string, unknown>;
  jobs: VideoJob[];
  costs: { cost: Cost; agent_minutes: number; jobs: number };
  approvals: OpenApproval[];
}

export interface AttentionApproval extends OpenApproval {
  video_id: string;
  version: number;
  title: string | null;
}

export interface AttentionStopped {
  video_id: string;
  version: number;
  title: string | null;
  status: string;
  created_at: string;
}

export interface Attention {
  approvals: AttentionApproval[];
  stopped: AttentionStopped[];
}

export interface WorkerJob {
  video_id: string;
  version: number;
  title: string | null;
  video_status: string;
  step: string;
  attempts: number;
  started: string | null;
  progress: unknown;
}

export interface WorkerSummary {
  worker_id: string;
  online: boolean;
  last_seen_at: string | null;
  jobs: WorkerJob[];
  waiting: number;
  moves: unknown[];
}

export interface WorkerDetail extends WorkerSummary {
  last_idle_at: string | null;
  capabilities: string[];
  videos: { video_id: string; version: number; status: string; approval: string | null }[];
  videos_total: number;
  stats: {
    succeeded: number;
    failed: number;
    completed: number;
    slowest: { step: string; median_seconds: number }[];
  };
}

export interface Report {
  period: ReportPeriod;
  since: string;
  created: number;
  completed: number;
  failed: number;
  cancelled: number;
  active: number;
  stopped: number;
  cost: Cost;
  minutes: number;
  minutes_videos: number;
  completed_cost: Cost;
  steps: { step: string; runs: number; median_seconds: number }[];
  approvals: unknown;
}

export type DecideAction = 'APPROVE' | 'APPROVE_ALL' | 'REJECT' | 'REGENERATE' | 'FEEDBACK';

export interface ActionResult {
  result: string;
}

export interface DecideResult extends ActionResult {
  version: number | null;
  round: number | null;
}

export interface RetryResult extends ActionResult {
  step: string | null;
  attempt: number | null;
}

export interface AutoResult extends ActionResult {
  status: string | null;
  decided_type: string | null;
}

export interface CancelItem {
  ref?: string;
  video_id: string | null;
  version: number | null;
  title?: string | null;
  status?: string | null;
  result?: string;
}

export interface CancelPreview extends ActionResult {
  token: string | null;
  expires_at: string | null;
  items: CancelItem[] | null;
}

export interface CancelOutcome extends ActionResult {
  items: CancelItem[] | null;
}

export interface VoiceTakes {
  take: number;
  max_takes: number;
  /** Null when there are no takes left or no estimate is possible: no more takes from the page. */
  retake_cost: { amount: number; currency: string } | null;
}

export interface MediaReview {
  qa_level: string | null;
  qa_checks: unknown;
  metadata: {
    title?: string;
    description?: string;
    tags?: string[];
    hashtags?: string[];
  } | null;
  voice: VoiceTakes | null;
}

export interface MediaFileRef {
  file: string;
  /** The job that made the file: a rewritten file has a new one and the same name. */
  revision: string;
}

export interface VideoMediaList {
  language: string;
  files: MediaFileRef[];
  review: MediaReview;
}
