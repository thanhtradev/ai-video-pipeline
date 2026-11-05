import { useState } from 'react';
import type { CancelPreview, Me, VideoSummary } from '../../../shared/types';
import { api } from '../api';
import { gateName } from '../format';
import { ActionMessage, useAction } from './useAction';
import { videoMessage } from './words';

function CancelConfirm({
  onAnswer,
  isBusy,
}: {
  onAnswer: (confirm: boolean) => void;
  isBusy: boolean;
}) {
  return (
    <div className="confirm-box">
      <p>Cancel this video? It stops for good. No file is deleted.</p>
      <div className="button-row">
        <button type="button" className="danger" disabled={isBusy} onClick={() => onAnswer(true)}>
          Cancel video
        </button>
        <button type="button" disabled={isBusy} onClick={() => onAnswer(false)}>
          Keep the video
        </button>
      </div>
    </div>
  );
}

export function VideoActions({
  video,
  me,
  onChanged,
}: {
  video: VideoSummary;
  me: Me;
  onChanged: () => void;
}) {
  const state = useAction(onChanged);
  const [preview, setPreview] = useState<CancelPreview | null>(null);
  const [confirmingAuto, setConfirmingAuto] = useState(false);
  const videoId = video.video_id;
  const isFinished = video.state_group === 'DONE';
  if (isFinished && !state.message) return null;

  const retry = (): void =>
    state.run(async () => {
      const { result, step } = await api.retry(videoId);
      return result === 'RETRIED' ? `Retrying ${step ?? 'the failed step'}.` : videoMessage(result);
    });

  const setAuto = (enable: boolean): void => {
    setConfirmingAuto(false);
    state.run(async () => {
      const { result, decided_type: decided } = await api.auto(videoId, enable);
      if (result === 'OFF') return 'Automatic approval is off.';
      if (result !== 'OK') return videoMessage(result);
      return decided
        ? `Automatic approval is on. ${gateName(decided)} was approved now.`
        : 'Automatic approval is on.';
    });
  };

  const askCancel = (): void =>
    state.run(async () => {
      const answer = await api.cancelPreview(videoId);
      if (answer.result !== 'OK' || !answer.token) return videoMessage(answer.result);
      setPreview(answer);
      return '';
    });

  const answerCancel = (confirm: boolean): void => {
    const token = preview?.token;
    if (!token) return;
    setPreview(null);
    state.run(async () => {
      const { result, items } = await api.cancelConfirm(token, confirm);
      // OK means the confirmation was used; the item says what happened to the video.
      return videoMessage(result === 'OK' ? (items?.[0]?.result ?? 'ERROR') : result);
    });
  };

  return (
    <section className="card" aria-labelledby="video-actions">
      <div className="card-head">
        <h2 id="video-actions">Actions</h2>
      </div>
      <ActionMessage state={state} />
      {confirmingAuto && (
        <div className="confirm-box">
          <p>
            Approve every remaining gate automatically? A gate waiting now is approved at once. A QA
            failure still stops the video, and the Mac cleanup is never automatic.
          </p>
          <div className="button-row">
            <button type="button" disabled={state.isBusy} onClick={() => setAuto(true)}>
              Turn on automatic approval
            </button>
            <button type="button" onClick={() => setConfirmingAuto(false)}>
              Leave it off
            </button>
          </div>
        </div>
      )}
      {preview && <CancelConfirm onAnswer={answerCancel} isBusy={state.isBusy} />}
      {!isFinished && !confirmingAuto && !preview && (
        <div className="button-row">
          {video.status === 'NEEDS_DECISION' && (
            <button type="button" disabled={state.isBusy} onClick={retry}>
              Retry failed step
            </button>
          )}
          {video.auto ? (
            <button type="button" disabled={state.isBusy} onClick={() => setAuto(false)}>
              Turn off automatic approval
            </button>
          ) : (
            <button type="button" disabled={state.isBusy} onClick={() => setConfirmingAuto(true)}>
              Turn on automatic approval
            </button>
          )}
          {me.is_owner && (
            <button type="button" className="danger" disabled={state.isBusy} onClick={askCancel}>
              Cancel video
            </button>
          )}
        </div>
      )}
    </section>
  );
}
