import type { ReactNode } from 'react';
import type { StateGroup, StripCell, VideoSummary } from '../../shared/types';
import { ApiError } from './api';
import {
  cellState,
  formatCost,
  formatTime,
  gateName,
  GROUP_LABEL,
  shortId,
  timeLeft,
} from './format';
import { useLinkHandler } from './hooks';

export function Link({
  to,
  children,
  className,
}: {
  to: string;
  children: ReactNode;
  className?: string;
}) {
  const onClick = useLinkHandler(to);
  return (
    <a href={to} onClick={onClick} className={className}>
      {children}
    </a>
  );
}

export function PageHeader({
  title,
  lead,
  actions,
}: {
  title: string;
  lead?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="page-header-text">
        <h1>{title}</h1>
        {lead && <p className="page-lead">{lead}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export type Tone = 'approval' | 'stopped' | 'running' | 'ok';

export function Card({
  title,
  action,
  tone,
  className,
  children,
  id,
}: {
  title?: string;
  action?: ReactNode;
  tone?: Tone;
  className?: string;
  children: ReactNode;
  id?: string;
}) {
  const classes = ['card', tone ? `card-${tone}` : '', className ?? ''].join(' ').trim();
  const headingId =
    id ?? (title ? `card-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : undefined);
  return (
    <section className={classes} aria-labelledby={headingId}>
      {(title || action) && (
        <div className="card-head">
          {title && <h2 id={headingId}>{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatTile({
  label,
  value,
  hint,
  to,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  to?: string;
  tone?: Tone | undefined;
}) {
  const className = ['tile', tone ? `tile-${tone}` : ''].join(' ').trim();
  const body = (
    <>
      <span className="tile-value">{value}</span>
      <span className="tile-label">{label}</span>
      {hint && <span className="tile-hint">{hint}</span>}
    </>
  );
  if (to) {
    return (
      <Link to={to} className={className}>
        {body}
      </Link>
    );
  }
  return <div className={className}>{body}</div>;
}

export function Badge({ group }: { group: StateGroup }) {
  return <span className={`badge badge-${group.toLowerCase()}`}>{GROUP_LABEL[group]}</span>;
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {hint && <p>{hint}</p>}
      {action}
    </div>
  );
}

/** One cell per pipeline step, in order: where a video is, readable at a glance. */
export function StepStrip({ cells }: { cells: StripCell[] }) {
  if (cells.length === 0) return <span className="strip-empty">No steps yet</span>;
  const done = cells.filter((cell) => cell.status === 'SUCCEEDED').length;
  return (
    <span className="strip" role="img" aria-label={`${done} of ${cells.length} steps done`}>
      {cells.map((cell, index) => (
        <span
          key={`${cell.step}-${index}`}
          className={`cell cell-${cellState(cell.status)}`}
          title={`${cell.step}: ${cell.status}`}
        />
      ))}
    </span>
  );
}

function videoNote(video: VideoSummary): string {
  if (video.approval_type && video.approval_expires_at) {
    return `${gateName(video.approval_type)}, ${timeLeft(video.approval_expires_at)}`;
  }
  if (video.state_group === 'STOPPED') return video.status;
  if (video.state_group === 'DONE')
    return video.status === 'COMPLETED' ? 'Completed' : video.status;
  return video.step ?? 'Not started';
}

export function VideoRow({ video }: { video: VideoSummary }) {
  return (
    <li className="video-row">
      <div className="video-main">
        <Link to={`/videos/${video.video_id}`} className="video-title">
          {video.title ?? 'Untitled'}
        </Link>
        <StepStrip cells={video.strip} />
      </div>
      <div className="video-state">
        <Badge group={video.state_group} />
        <span className="note">{videoNote(video)}</span>
      </div>
      <div className="video-meta">
        <span>
          <span className="id">{shortId(video.video_id)}</span>
          {video.kit ? ` · ${video.kit}` : ''}
        </span>
        <span>{video.worker_id ?? 'No worker yet'}</span>
        <span>
          {formatCost(video.cost)} · {formatTime(video.created_at)}
        </span>
      </div>
    </li>
  );
}

export function ErrorNote({ error }: { error: ApiError }) {
  return (
    <p className="error-note" role="alert">
      {error.message}
    </p>
  );
}

export function Loading() {
  return (
    <div className="skeleton" aria-live="polite" aria-label="Loading">
      <span />
      <span />
      <span />
    </div>
  );
}

export function Pager({
  offset,
  pageSize,
  shown,
  total,
  previousLabel,
  nextLabel,
  onChange,
}: {
  offset: number;
  pageSize: number;
  shown: number;
  total: number;
  previousLabel: string;
  nextLabel: string;
  onChange: (offset: number) => void;
}) {
  if (total <= pageSize) return null;
  const lastShown = offset + shown;
  return (
    <nav className="pager" aria-label="Pages">
      <button
        type="button"
        disabled={offset === 0}
        onClick={() => onChange(Math.max(0, offset - pageSize))}
      >
        {previousLabel}
      </button>
      <span>
        {offset + 1} to {lastShown} of {total}
      </span>
      <button
        type="button"
        disabled={lastShown >= total}
        onClick={() => onChange(offset + pageSize)}
      >
        {nextLabel}
      </button>
    </nav>
  );
}
