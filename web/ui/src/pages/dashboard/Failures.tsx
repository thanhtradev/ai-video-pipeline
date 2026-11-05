import type { DashboardFailure } from '../../../../shared/types';
import { ActionMessage, useAction } from '../../actions/useAction';
import { videoMessage } from '../../actions/words';
import { api } from '../../api';
import { Card, Link } from '../../components';
import { formatTime, shortId } from '../../format';

export function Failures({
  failures,
  onChanged,
}: {
  failures: DashboardFailure[];
  onChanged: () => void;
}) {
  const state = useAction(onChanged);
  const retry = (videoId: string): void =>
    state.run(async () => {
      const { result, step } = await api.retry(videoId);
      return result === 'RETRIED' ? `Retrying ${step ?? 'the failed step'}.` : videoMessage(result);
    });

  return (
    <Card id="failures" title="Recent failures" className="span-7">
      <ActionMessage state={state} />
      {failures.length === 0 && <p className="quiet">No step has failed on a video in flight.</p>}
      {failures.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Video</th>
                <th scope="col">Step</th>
                <th scope="col">Error</th>
                <th scope="col">When</th>
                <th scope="col" className="actions">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {failures.map((failure) => (
                <tr key={`${failure.video_id}-${failure.step}`}>
                  <td>
                    <Link to={`/videos/${failure.video_id}`} className="cell-title">
                      {failure.title ?? shortId(failure.video_id)}
                    </Link>
                    {failure.kit && <span className="cell-sub">{failure.kit}</span>}
                  </td>
                  <td>
                    {failure.step}
                    <span className="cell-sub">
                      {failure.status}
                      {failure.attempts > 1 ? `, ${failure.attempts} attempts` : ''}
                    </span>
                  </td>
                  <td>
                    <span className="clip warn" title={failure.error ?? undefined}>
                      {failure.error ?? 'No error text'}
                    </span>
                  </td>
                  <td className="note">{formatTime(failure.failed_at)}</td>
                  <td className="actions">
                    {failure.can_retry ? (
                      <button
                        type="button"
                        disabled={state.isBusy}
                        onClick={() => retry(failure.video_id)}
                      >
                        Retry
                      </button>
                    ) : (
                      <Link to={`/videos/${failure.video_id}`}>Open</Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
