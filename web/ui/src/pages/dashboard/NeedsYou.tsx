import type { Attention } from '../../../../shared/types';
import { ActionMessage, useAction } from '../../actions/useAction';
import { decideMessage, gateActions, videoMessage } from '../../actions/words';
import { api } from '../../api';
import { Card, Link } from '../../components';
import { gateName, shortId, timeLeft } from '../../format';

/**
 * What a person has to decide, with the one safe quick action per row: the gate's plain approve,
 * or a retry. Anything that regenerates, rejects or costs money is decided on the video's page.
 */
export function NeedsYou({ data, onChanged }: { data: Attention; onChanged: () => void }) {
  const state = useAction(onChanged);
  const count = data.approvals.length + data.stopped.length;

  const approve = (approvalId: string, type: string): void =>
    state.run(async () => {
      const { result } = await api.decide(approvalId, 'APPROVE');
      return `${gateName(type)}: ${decideMessage(result, 'APPROVE')}`;
    });

  const retry = (videoId: string): void =>
    state.run(async () => {
      const { result, step } = await api.retry(videoId);
      return result === 'RETRIED' ? `Retrying ${step ?? 'the failed step'}.` : videoMessage(result);
    });

  return (
    <Card
      id="needs-you"
      title={count === 0 ? 'Nothing needs you' : `${count} ${count === 1 ? 'needs' : 'need'} you`}
      className="span-8"
    >
      <ActionMessage state={state} />
      {count === 0 && <p className="quiet">Approvals and stopped videos appear here.</p>}
      <ul className="queue">
        {data.approvals.map((item) => {
          const approveButton = gateActions(item.type)?.buttons.find(
            (button) => button.action === 'APPROVE',
          );
          return (
            <li key={item.approval_id} className="queue-item queue-approval">
              <span className="list-main">
                <Link to={`/videos/${item.video_id}`}>{item.title ?? shortId(item.video_id)}</Link>
                <span className="cell-sub">
                  {gateName(item.type)}, {timeLeft(item.expires_at)}
                </span>
              </span>
              <span className="list-side">
                {approveButton && (
                  <button
                    type="button"
                    disabled={state.isBusy}
                    onClick={() => approve(item.approval_id, item.type)}
                  >
                    {approveButton.label}
                  </button>
                )}
                <Link to={`/videos/${item.video_id}`}>Open</Link>
              </span>
            </li>
          );
        })}
        {data.stopped.map((item) => (
          <li key={item.video_id} className="queue-item queue-stopped">
            <span className="list-main">
              <Link to={`/videos/${item.video_id}`}>{item.title ?? shortId(item.video_id)}</Link>
              <span className="cell-sub">Stopped: {item.status}</span>
            </span>
            <span className="list-side">
              {item.status === 'NEEDS_DECISION' && (
                <button type="button" disabled={state.isBusy} onClick={() => retry(item.video_id)}>
                  Retry failed step
                </button>
              )}
              <Link to={`/videos/${item.video_id}`}>Open</Link>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
