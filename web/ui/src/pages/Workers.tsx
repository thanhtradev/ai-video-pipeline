import type { WorkerSummary } from '../../../shared/types';
import { api } from '../api';
import { Card, EmptyState, ErrorNote, Link, Loading, PageHeader } from '../components';
import { formatDuration, formatTime, shortId } from '../format';
import { usePoll } from '../hooks';

export function WorkerTile({ worker }: { worker: WorkerSummary }) {
  return (
    <li className={worker.online ? 'worker-tile worker' : 'worker-tile worker worker-offline'}>
      <div className="worker-tile-head">
        <span className={worker.online ? 'dot dot-on' : 'dot dot-off'} aria-hidden="true" />
        <Link to={`/workers/${worker.worker_id}`}>{worker.worker_id}</Link>
      </div>
      <span className={worker.online ? 'note' : 'note warn'}>
        {worker.online ? 'Online' : `Offline, last seen ${formatTime(worker.last_seen_at)}`}
      </span>
      <span>
        {worker.jobs.length === 0
          ? 'Idle'
          : worker.jobs
              .map((job) => `${job.step} on ${job.title ?? shortId(job.video_id)}`)
              .join(', ')}
      </span>
      <span className="note">{worker.waiting} steps waiting</span>
    </li>
  );
}

export function WorkerTiles({
  workers,
  isCompact = false,
}: {
  workers: WorkerSummary[];
  isCompact?: boolean;
}) {
  return (
    <ul className={isCompact ? 'worker-grid worker-compact' : 'worker-grid'}>
      {workers.map((worker) => (
        <WorkerTile key={worker.worker_id} worker={worker} />
      ))}
    </ul>
  );
}

export function Workers() {
  const { data, error, isLoading } = usePoll(api.workers, 'workers');
  return (
    <>
      <PageHeader title="Workers" />
      {isLoading && <Loading />}
      {error && <ErrorNote error={error} />}
      {data?.length === 0 && <EmptyState title="No worker has reported in yet" />}
      {data && data.length > 0 && <WorkerTiles workers={data} />}
    </>
  );
}

export function WorkerPage({ id }: { id: string }) {
  const { data: worker, error, isLoading } = usePoll(() => api.worker(id), id);
  if (isLoading) return <Loading />;
  if (!worker) {
    return (
      <>
        <PageHeader title={id} />
        {error && <ErrorNote error={error} />}
        <p>
          <Link to="/workers">Back to workers</Link>
        </p>
      </>
    );
  }
  return (
    <article>
      <PageHeader
        title={worker.worker_id}
        lead={
          <>
            {worker.online ? (
              <span className="ok">Online</span>
            ) : (
              <span className="warn">Offline</span>
            )}
            , last seen {formatTime(worker.last_seen_at)}
          </>
        }
      />
      {error && <ErrorNote error={error} />}
      <Card title="Running now">
        {worker.jobs.length === 0 && <p className="quiet">Nothing is running on this worker.</p>}
        <ul className="plain">
          {worker.jobs.map((job) => (
            <li key={`${job.video_id}-${job.step}`}>
              <Link to={`/videos/${job.video_id}`}>{job.title ?? shortId(job.video_id)}</Link>{' '}
              <span className="note">{job.step}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Card title={`Videos on this worker (${worker.videos_total})`}>
        {worker.videos.length === 0 && <p className="quiet">No video is pinned here.</p>}
        <ul className="plain">
          {worker.videos.map((video) => (
            <li key={video.video_id}>
              <Link to={`/videos/${video.video_id}`} className="id">
                {shortId(video.video_id)}
              </Link>{' '}
              <span className="note">{video.approval ?? video.status}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Last 24 hours">
        <p>
          {worker.stats.completed} videos finished, {worker.stats.succeeded} steps succeeded,{' '}
          {worker.stats.failed} failed.
        </p>
        {worker.stats.slowest.length > 0 && (
          <p className="note">
            Slowest:{' '}
            {worker.stats.slowest
              .map((step) => `${step.step} ${formatDuration(step.median_seconds)}`)
              .join(', ')}
          </p>
        )}
      </Card>
    </article>
  );
}
