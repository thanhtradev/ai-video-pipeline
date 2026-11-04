import { useState } from 'react';
import type { DecideAction, OpenApproval, VoiceTakes } from '../../../shared/types';
import { api } from '../api';
import { gateName, timeLeft } from '../format';
import type { ActionState } from './useAction';
import { decideMessage, gateActions, type GateActions, type GateButton } from './words';

/** Another take is paid, so its button states the cost, as the Telegram button does (WF-15). */
function buttonsFor(gate: GateActions, voice: VoiceTakes | null): readonly GateButton[] {
  const cost = voice?.retake_cost;
  return gate.buttons.flatMap((button) => {
    if (button.action !== 'REGENERATE' || !gate.isPaidRetake) return [button];
    return cost ? [{ ...button, label: `Read again, about ${cost.amount} ${cost.currency}` }] : [];
  });
}

export function ApprovalPanel({
  approval,
  state,
  voice,
  language,
}: {
  approval: OpenApproval;
  /** Owned by the page: the outcome must outlive this panel, which goes once decided. */
  state: ActionState;
  voice: VoiceTakes | null;
  language: string;
}) {
  const [notes, setNotes] = useState('');
  const [confirming, setConfirming] = useState<GateButton | null>(null);
  const gate = gateActions(approval.type);
  const titleId = `approval-${approval.approval_id}`;

  const decide = (action: DecideAction, note?: string): void => {
    setConfirming(null);
    state.run(async () => {
      const { result } = await api.decide(approval.approval_id, action, note);
      if (result === 'OK' && action === 'FEEDBACK') setNotes('');
      return decideMessage(result, action);
    });
  };

  return (
    <section className="approval-panel" aria-labelledby={titleId}>
      <h2 id={titleId}>
        {gateName(approval.type)}: waiting for approval, {timeLeft(approval.expires_at)}
      </h2>
      {!gate && (
        <p>
          {approval.type === 'CLEANUP'
            ? 'This deletes the copy on the Mac, so it stays on Telegram. The owner approves it there.'
            : 'Decide this one on Telegram.'}
        </p>
      )}
      {gate && confirming && (
        <div className="confirm-box">
          <p>Reject this and cancel the video? This cannot be undone from here.</p>
          <div className="button-row">
            <button
              type="button"
              className="danger"
              disabled={state.isBusy}
              onClick={() => decide(confirming.action)}
            >
              {confirming.label}
            </button>
            <button type="button" onClick={() => setConfirming(null)}>
              Keep the video
            </button>
          </div>
        </div>
      )}
      {gate && !confirming && (
        <div className="button-row">
          {buttonsFor(gate, voice).map((button) => (
            <button
              key={button.action}
              type="button"
              className={button.isDangerous ? 'danger' : undefined}
              disabled={state.isBusy}
              onClick={() => (button.isDangerous ? setConfirming(button) : decide(button.action))}
            >
              {button.label}
            </button>
          ))}
        </div>
      )}
      {gate?.isPaidRetake && !voice?.retake_cost && (
        <p className="note">No more takes can be started here. Approve this take or reject it.</p>
      )}
      {gate?.takesNotes && (
        <form
          className="notes-form"
          onSubmit={(event) => {
            event.preventDefault();
            decide('FEEDBACK', notes.trim());
          }}
        >
          <label htmlFor={`${titleId}-notes`}>Notes for a revision</label>
          <textarea
            id={`${titleId}-notes`}
            name="notes"
            lang={language}
            maxLength={4000}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
          <button type="submit" disabled={state.isBusy || notes.trim() === ''}>
            Send notes
          </button>
        </form>
      )}
    </section>
  );
}
