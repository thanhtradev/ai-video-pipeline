import { api } from '../api';
import { Card, EmptyState, ErrorNote, Link, Loading, PageHeader, VideoRow } from '../components';
import { formatCost, gateName, shortId, timeLeft } from '../format';
import { usePoll } from '../hooks';
import { WorkerTiles } from './Workers';

function NeedsYou() {
  const { data, error, isLoading } = usePoll(api.attention, 'attention');
  if (isLoading) return <Loading />;
  if (!data) return error ? <ErrorNote error={error} /> : null;
  const count = data.approvals.length + data.stopped.length;
  return (
    <Card
      id="needs-you"
      title={count === 0 ? 'Nothing needs you' : `${count} ${count === 1 ? 'needs' : 'need'} you`}
    >
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
    </Card>
  );
}

function InProduction() {
  const { data, error, isLoading } = usePoll(
    () => api.videos({ state: 'active', search: '', limit: 20, offset: 0 }),
    'active',
  );
  return (
    <Card id="in-production" title="In production">
      {isLoading && <Loading />}
      {error && <ErrorNote error={error} />}
      {data?.total === 0 && (
        <EmptyState
          title="No video is in production"
          action={<Link to="/videos/new">Start a new one</Link>}
        />
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
    </Card>
  );
}

function Today() {
  const workers = usePoll(api.workers, 'workers');
  const report = usePoll(() => api.report('today'), 'today');
  const online = workers.data?.filter((worker) => worker.online) ?? [];
  return (
    <>
      <Card
        title="Workers"
        action={
          workers.data && (
            <Link to="/workers">
              {online.length} of {workers.data.length} online
            </Link>
          )
        }
      >
        {workers.error && <ErrorNote error={workers.error} />}
        {workers.data && <WorkerTiles workers={workers.data} isCompact />}
      </Card>
      <Card title="Today" action={<Link to="/report">Report</Link>}>
        {report.error && <ErrorNote error={report.error} />}
        {report.data && (
          <p>
            {report.data.completed} finished, {report.data.created} started, {report.data.failed}{' '}
            failed. {formatCost(report.data.cost)}
          </p>
        )}
      </Card>
    </>
  );
}

export function Overview() {
  return (
    <>
      <PageHeader title="Dashboard" />
      <div className="grid">
        <div className="span-8">
          <NeedsYou />
          <InProduction />
        </div>
        <div className="span-4">
          <Today />
        </div>
      </div>
    </>
  );
}
