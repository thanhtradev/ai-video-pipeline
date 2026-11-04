import type { ReactNode } from 'react';
import type { StateGroup, StripCell, VideoSummary } from '../../shared/types';
import { ApiError } from './api';
import { cellState, formatCost, gateName, GROUP_LABEL, shortId, timeLeft } from './format';
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

export function StateMark({ group }: { group: StateGroup }) {
  return <span className={`state state-${group.toLowerCase()}`}>{GROUP_LABEL[group]}</span>;
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
        <StateMark group={video.state_group} />
        <span className="note">{videoNote(video)}</span>
      </div>
      <div className="video-meta">
        <span className="id">{shortId(video.video_id)}</span>
        <span>{video.worker_id ?? 'No worker yet'}</span>
        <span>{formatCost(video.cost)}</span>
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
    <p className="quiet" aria-live="polite">
      Loading
    </p>
  );
}
