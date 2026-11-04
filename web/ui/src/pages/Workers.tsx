import { api } from '../api';
import { ErrorNote, Link, Loading } from '../components';
import { formatDuration, formatTime, shortId } from '../format';
import { usePoll } from '../hooks';

export function Workers() {
  const { data, error, isLoading } = usePoll(api.workers, 'workers');
  return (
    <section aria-labelledby="workers">
      <h1 id="workers">Workers</h1>
      {isLoading && <Loading />}
      {error && <ErrorNote error={error} />}
      {data?.length === 0 && <p className="quiet">No worker has reported in yet.</p>}
      <ul className="worker-list">
        {data?.map((worker) => (
          <li key={worker.worker_id} className={worker.online ? 'worker' : 'worker worker-offline'}>
            <Link to={`/workers/${worker.worker_id}`} className="video-title">
              {worker.worker_id}
            </Link>
            <span className="note">
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
        ))}
      </ul>
    </section>
  );
}

export function WorkerPage({ id }: { id: string }) {
  const { data: worker, error, isLoading } = usePoll(() => api.worker(id), id);
  if (isLoading) return <Loading />;
  if (!worker) {
    return (
      <section>
        <h1>{id}</h1>
        {error && <ErrorNote error={error} />}
        <p>
          <Link to="/workers">Back to workers</Link>
        </p>
      </section>
    );
  }
  return (
    <article>
      <h1>{worker.worker_id}</h1>
      {error && <ErrorNote error={error} />}
      <p>
        {worker.online ? 'Online' : <span className="warn">Offline</span>}, last seen{' '}
        {formatTime(worker.last_seen_at)}
      </p>
      <section aria-labelledby="running">
        <h2 id="running">Running now</h2>
        {worker.jobs.length === 0 && <p className="quiet">Nothing is running on this worker.</p>}
        <ul className="plain">
          {worker.jobs.map((job) => (
            <li key={`${job.video_id}-${job.step}`}>
              <Link to={`/videos/${job.video_id}`}>{job.title ?? shortId(job.video_id)}</Link>{' '}
              <span className="note">{job.step}</span>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="pinned">
        <h2 id="pinned">Videos on this worker ({worker.videos_total})</h2>
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
      </section>
      <section aria-labelledby="day">
        <h2 id="day">Last 24 hours</h2>
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
      </section>
    </article>
  );
}
