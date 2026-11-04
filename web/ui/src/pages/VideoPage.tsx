import { api } from '../api';
import { ErrorNote, Link, Loading, StateMark, StepStrip } from '../components';
import { cellState, formatCost, formatTime, gateName, shortId, timeLeft } from '../format';
import { usePoll } from '../hooks';

export function VideoPage({ id }: { id: string }) {
  const { data: video, error, isLoading } = usePoll(() => api.video(id), id);
  if (isLoading) return <Loading />;
  if (!video) {
    return (
      <section>
        <h1>Video {shortId(id)}</h1>
        {error && <ErrorNote error={error} />}
        <p>
          <Link to="/videos">Back to videos</Link>
        </p>
      </section>
    );
  }
  const notes = video.brief['notes'];
  return (
    <article className="video-page">
      <header>
        <h1>{video.title ?? 'Untitled'}</h1>
        <StepStrip cells={video.strip} />
        <p className="headline-state">
          <StateMark group={video.state_group} /> <span className="note">{video.status}</span>
        </p>
      </header>
      {error && <ErrorNote error={error} />}

      {video.approvals.length > 0 && (
        <section className="approval-panel" aria-labelledby="approvals">
          <h2 id="approvals">Waiting for approval</h2>
          <ul>
            {video.approvals.map((approval) => (
              <li key={approval.approval_id}>
                {gateName(approval.type)}, {timeLeft(approval.expires_at)}. Approve it in the
                Telegram chat for now.
              </li>
            ))}
          </ul>
        </section>
      )}

      <dl className="facts">
        <dt>Video id</dt>
        <dd className="id">{video.video_id}</dd>
        <dt>Version</dt>
        <dd>{video.version}</dd>
        <dt>Kit</dt>
        <dd>{video.kit ?? 'Default'}</dd>
        <dt>Worker</dt>
        <dd>
          {video.worker_id ? (
            <Link to={`/workers/${video.worker_id}`}>{video.worker_id}</Link>
          ) : (
            'No worker yet'
          )}
          {video.worker_online === false && <span className="warn"> offline</span>}
        </dd>
        <dt>Automatic approval</dt>
        <dd>{video.auto ? 'On' : 'Off'}</dd>
        <dt>Cost</dt>
        <dd>{formatCost(video.costs.cost)}</dd>
        <dt>Started</dt>
        <dd>{formatTime(video.created_at)}</dd>
        <dt>Last change</dt>
        <dd>{formatTime(video.updated_at)}</dd>
      </dl>

      {typeof notes === 'string' && notes !== '' && (
        <section aria-labelledby="notes">
          <h2 id="notes">Notes in the brief</h2>
          <p className="prose" lang="vi">
            {notes}
          </p>
        </section>
      )}

      <section aria-labelledby="steps">
        <h2 id="steps">Steps</h2>
        {video.jobs.length === 0 && <p className="quiet">No steps have been created yet.</p>}
        <ol className="steps">
          {video.jobs.map((job, index) => (
            <li key={`${job.step}-${index}`} className={`step step-${cellState(job.status)}`}>
              <span className="step-name">{job.step}</span>
              <span className="step-status">{job.status}</span>
              <span className="note">
                {job.finished
                  ? `Finished ${formatTime(job.finished)}`
                  : job.started
                    ? `Started ${formatTime(job.started)}`
                    : 'Not started'}
                {job.attempts > 1 ? `, ${job.attempts} attempts` : ''}
              </span>
              {job.error && <p className="step-error">{job.error}</p>}
            </li>
          ))}
        </ol>
      </section>
    </article>
  );
}
