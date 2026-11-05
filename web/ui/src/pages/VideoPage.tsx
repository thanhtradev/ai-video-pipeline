import type { Me, VideoJob } from '../../../shared/types';
import { ApprovalPanel } from '../actions/ApprovalPanel';
import { ActionMessage, useAction } from '../actions/useAction';
import { VideoActions } from '../actions/VideoActions';
import { api } from '../api';
import { MediaPanel } from '../MediaPanel';
import { Badge, Card, ErrorNote, Link, Loading, PageHeader, StepStrip } from '../components';
import { cellState, formatCost, formatDuration, formatTime, shortId } from '../format';
import { usePoll } from '../hooks';

function stepTiming(job: VideoJob): string {
  if (job.finished && job.started) {
    const seconds = (new Date(job.finished).getTime() - new Date(job.started).getTime()) / 1000;
    return `Finished ${formatTime(job.finished)}, took ${formatDuration(Math.max(0, seconds))}`;
  }
  if (job.finished) return `Finished ${formatTime(job.finished)}`;
  if (job.started) return `Started ${formatTime(job.started)}`;
  return 'Not started';
}

function Steps({ jobs }: { jobs: VideoJob[] }) {
  if (jobs.length === 0) return <p className="quiet">No steps have been created yet.</p>;
  return (
    <ol className="steps">
      {jobs.map((job, index) => (
        <li key={`${job.step}-${index}`} className={`step step-${cellState(job.status)}`}>
          <div className="step-line">
            <span className="step-name">{job.step}</span>
            <span className="step-status">{job.status}</span>
          </div>
          <span className="note">
            {stepTiming(job)}
            {job.attempts > 1 ? `, ${job.attempts} attempts` : ''}
          </span>
          {job.error && <p className="step-error">{job.error}</p>}
        </li>
      ))}
    </ol>
  );
}

export function VideoPage({ id, me }: { id: string; me: Me }) {
  const { data: video, error, isLoading, reload } = usePoll(() => api.video(id), id);
  const media = usePoll(() => api.media(id), id);
  const reloadAll = (): void => {
    reload();
    media.reload();
  };
  const approvalState = useAction(reloadAll);
  if (isLoading) return <Loading />;
  if (!video) {
    return (
      <>
        <PageHeader title={`Video ${shortId(id)}`} />
        {error && <ErrorNote error={error} />}
        <p>
          <Link to="/videos">Back to videos</Link>
        </p>
      </>
    );
  }
  const notes = video.brief['notes'];
  return (
    <article className="video-page">
      <header className="video-head">
        <h1>{video.title ?? 'Untitled'}</h1>
        <p className="headline-state">
          <Badge group={video.state_group} />
          <span>{video.status}</span>
          {video.kit && <span>Kit {video.kit}</span>}
          <span>
            {video.worker_id ? (
              <Link to={`/workers/${video.worker_id}`}>{video.worker_id}</Link>
            ) : (
              'No worker yet'
            )}
            {video.worker_online === false && <span className="warn"> offline</span>}
          </span>
        </p>
        <StepStrip cells={video.strip} />
      </header>
      {error && <ErrorNote error={error} />}

      <div className="video-columns">
        <div className="video-main-column">
          <ActionMessage state={approvalState} />
          {video.approvals.map((approval) => (
            <ApprovalPanel
              key={approval.approval_id}
              approval={approval}
              state={approvalState}
              voice={media.data?.review.voice ?? null}
              language={media.data?.language ?? 'vi'}
            />
          ))}

          <MediaPanel videoId={video.video_id} media={media.data} error={media.error} />

          {typeof notes === 'string' && notes !== '' && (
            <Card title="Notes in the brief">
              <p className="prose" lang="vi">
                {notes}
              </p>
            </Card>
          )}

          <Card title="Steps">
            <Steps jobs={video.jobs} />
          </Card>
        </div>

        <aside className="video-side">
          <VideoActions video={video} me={me} onChanged={reloadAll} />
          <Card title="Details">
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
          </Card>
        </aside>
      </div>
    </article>
  );
}
