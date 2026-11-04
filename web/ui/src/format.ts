import type { Cost, StateGroup } from '../../shared/types';

// The same time zone as the bot's messages (D-072), wherever the page is opened.
const TIME_ZONE = 'Asia/Ho_Chi_Minh';
const dateTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatTime(iso: string | null | undefined): string {
  return iso ? dateTime.format(new Date(iso)) : 'n/a';
}

const MINUTE = 60;
const HOUR = 3600;

export function formatDuration(seconds: number): string {
  if (seconds < MINUTE) return `${Math.round(seconds)}s`;
  if (seconds < HOUR) return `${Math.round(seconds / MINUTE)} min`;
  return `${Number((seconds / HOUR).toFixed(1))} h`;
}

export function timeLeft(iso: string, now = Date.now()): string {
  const seconds = (new Date(iso).getTime() - now) / 1000;
  return seconds <= 0 ? 'expired' : `${formatDuration(seconds)} left`;
}

export function formatCost(cost: Cost | null | undefined): string {
  const entries = Object.entries(cost ?? {});
  if (entries.length === 0) return 'no cost recorded';
  return entries
    .map(
      ([currency, amount]) =>
        `${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${currency}`,
    )
    .join(', ');
}

export function shortId(id: string): string {
  return id.slice(0, 8);
}

const GATES: Readonly<Record<string, string>> = {
  SCRIPT: 'Script',
  VOICE: 'Voice',
  STORYBOARD: 'Storyboard',
  PREVIEW: 'Preview',
  METADATA: 'Final and publishing details',
  CLEANUP: 'Mac cleanup',
  DECISION: 'Decision',
};

export function gateName(type: string): string {
  return GATES[type] ?? type;
}

export const GROUP_LABEL: Readonly<Record<StateGroup, string>> = {
  STOPPED: 'Stopped',
  APPROVAL: 'Waiting for approval',
  RUNNING: 'Running',
  WAITING: 'Queued',
  DONE: 'Finished',
};

export function cellState(status: string): 'done' | 'running' | 'failed' | 'blocked' | 'waiting' {
  if (status === 'SUCCEEDED') return 'done';
  if (status === 'RUNNING') return 'running';
  if (status === 'FAILED_PERMANENT' || status === 'FAILED_RETRYABLE') return 'failed';
  if (status === 'BLOCKED') return 'blocked';
  return 'waiting';
}
