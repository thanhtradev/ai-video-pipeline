import { api } from '../api';
import { ErrorNote, Link, Loading, VideoRow } from '../components';
import { formatCost, gateName, shortId, timeLeft } from '../format';
import { usePoll } from '../hooks';

function NeedsYou() {
  const { data, error, isLoading } = usePoll(api.attention, 'attention');
  if (isLoading) return <Loading />;
  if (!data) return error ? <ErrorNote error={error} /> : null;
  const count = data.approvals.length + data.stopped.length;
  return (
    <section className="needs-you" aria-labelledby="needs-you">
      <h1 id="needs-you">
        {count === 0 ? 'Nothing needs you' : `${count} ${count === 1 ? 'needs' : 'need'} you`}
      </h1>
      {error && <ErrorNote error={error} />}
      {count === 0 && <p className="quiet">Approvals and stopped videos appear here.</p>}
      <ul className="queue">
        {data.approvals.map((item) => (
          <li key={item.approval_id} className="queue-item queue-approval">
            <Link to={`/videos/${item.video_id}`}>{item.title ?? shortId(item.video_id)}</Link>
            <span>
              Approve {gateName(item.type).toLowerCase()}, {timeLeft(item.expires_at)}
            </span>
          </li>
        ))}
        {data.stopped.map((item) => (
          <li key={item.video_id} className="queue-item queue-stopped">
            <Link to={`/videos/${item.video_id}`}>{item.title ?? shortId(item.video_id)}</Link>
            <span>Stopped: {item.status}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function InProduction() {
  const { data, error, isLoading } = usePoll(
    () => api.videos({ state: 'active', search: '', limit: 20, offset: 0 }),
    'active',
  );
  return (
    <section aria-labelledby="in-production">
      <h2 id="in-production">In production</h2>
      {isLoading && <Loading />}
      {error && <ErrorNote error={error} />}
      {data?.total === 0 && (
        <p className="quiet">No video is in production. Start one with /new.</p>
      )}
      <ul className="video-list">
        {data?.items.map((video) => (
          <VideoRow key={video.video_id} video={video} />
        ))}
      </ul>
      {data && data.total > data.items.length && (
        <p>
          <Link to="/videos?state=active">See all {data.total} in production</Link>
        </p>
      )}
    </section>
  );
}

function Today() {
  const workers = usePoll(api.workers, 'workers');
  const report = usePoll(() => api.report('today'), 'today');
  const online = workers.data?.filter((worker) => worker.online) ?? [];
  const offline = workers.data?.filter((worker) => !worker.online) ?? [];
  return (
    <aside className="today" aria-label="Today">
      <h2>Workers</h2>
      {workers.error && <ErrorNote error={workers.error} />}
      {workers.data && (
        <p>
          <Link to="/workers">
            {online.length} of {workers.data.length} online
          </Link>
          {offline.length > 0 && (
            <span className="warn"> {offline.map((w) => w.worker_id).join(', ')} offline</span>
          )}
        </p>
      )}
      <h2>Today</h2>
      {report.error && <ErrorNote error={report.error} />}
      {report.data && (
        <p>
          {report.data.completed} finished, {report.data.created} started, {report.data.failed}{' '}
          failed. <Link to="/report">{formatCost(report.data.cost)}</Link>
        </p>
      )}
    </aside>
  );
}

export function Overview() {
  return (
    <div className="overview">
      <div className="overview-main">
        <NeedsYou />
        <InProduction />
      </div>
      <Today />
    </div>
  );
}
