import type { DecideAction } from '../../../shared/types';

// What each gate lets a person do, as the bot's buttons do (ops/telegram-commands.md, WF-06), and
// result codes in words. The database enforces all of it; this only decides what to offer.

export interface GateButton {
  action: Exclude<DecideAction, 'FEEDBACK'>;
  label: string;
  isDangerous?: boolean;
}

export interface GateActions {
  buttons: readonly GateButton[];
  takesNotes: boolean;
  /** REGENERATE here costs money: a new TTS take. */
  isPaidRetake?: boolean;
}

const REJECT: GateButton = {
  action: 'REJECT',
  label: 'Reject and cancel video',
  isDangerous: true,
};

const GATES: Readonly<Record<string, GateActions>> = {
  SCRIPT: {
    buttons: [
      { action: 'APPROVE', label: 'Approve script' },
      { action: 'REGENERATE', label: 'Write again' },
      REJECT,
    ],
    takesNotes: true,
  },
  VOICE: {
    buttons: [
      { action: 'APPROVE', label: 'Approve voice' },
      { action: 'REGENERATE', label: 'Read again' },
      REJECT,
    ],
    takesNotes: false,
    isPaidRetake: true,
  },
  STORYBOARD: {
    buttons: [
      { action: 'APPROVE', label: 'Render preview' },
      { action: 'APPROVE_ALL', label: 'Render final' },
      REJECT,
    ],
    takesNotes: true,
  },
  PREVIEW: {
    buttons: [{ action: 'APPROVE', label: 'Render final' }, REJECT],
    takesNotes: true,
  },
  METADATA: {
    buttons: [
      { action: 'APPROVE', label: 'Approve and archive' },
      { action: 'REGENERATE', label: 'Write again' },
    ],
    takesNotes: true,
  },
};

export function gateActions(type: string): GateActions | null {
  return GATES[type] ?? null;
}

const DONE: Readonly<Record<DecideAction, string>> = {
  APPROVE: 'Approved.',
  APPROVE_ALL: 'Approved: rendering through to the final.',
  REJECT: 'Rejected: the video is cancelled.',
  REGENERATE: 'Started again.',
  FEEDBACK: 'Notes sent: revising.',
};

const DECIDE_RESULTS: Readonly<Record<string, string>> = {
  NOT_ALLOWED: 'You are not an approver.',
  NOT_OWNER: 'Only the owner can do this.',
  NOT_FOUND: 'This request no longer exists, or a newer version replaced it.',
  NOT_PENDING: 'Someone already decided this.',
  EXPIRED: 'This request has expired.',
  SUPERSEDED: 'A newer version replaced this request.',
  HASH_MISMATCH: 'This changed after the request was sent. Wait for the new request.',
  EMPTY_NOTE: 'Write your notes first.',
  NOT_SUPPORTED: 'This request does not take that action.',
  NEEDS_DECISION: 'That was the last round: the video now needs your decision.',
  USE_TELEGRAM: 'Decide this one on Telegram.',
};

export function decideMessage(result: string, action: DecideAction): string {
  return result === 'OK' ? DONE[action] : (DECIDE_RESULTS[result] ?? `Refused: ${result}.`);
}

const VIDEO_RESULTS: Readonly<Record<string, string>> = {
  NOT_APPROVER: 'You are not an approver.',
  NOT_OWNER: 'Only the owner can do this.',
  NOT_FOUND: 'This video no longer exists.',
  AMBIGUOUS: 'This id matches more than one video.',
  NOT_STOPPED: 'This video is not stopped, so there is nothing to retry.',
  NO_FAILED_JOB: 'No failed step to retry.',
  RETRY_LIMIT: 'This step has used all its retries.',
  NOT_ACTIVE: 'This video is archiving or finished: nothing is left to approve.',
  NOTHING: 'This video cannot be cancelled in its current state.',
  TOO_MANY: 'Too many videos at once.',
  NOT_REQUESTER: 'Only the person who asked can confirm this.',
  NOT_ALLOWED: 'You no longer have the role for this.',
  ALREADY: 'This was already settled.',
  EXPIRED: 'The confirmation expired. Press Cancel video again.',
  REJECTED: 'Kept the video.',
  CANCELLED: 'Video cancelled.',
  ALREADY_FINISHED: 'Not cancelled: the video had already finished.',
  STALE: 'Not cancelled: a newer version replaced it. Look at it and try again.',
  ERROR: 'Not cancelled: the cancellation failed. The video is still as it was.',
};

export function videoMessage(result: string): string {
  return VIDEO_RESULTS[result] ?? `Refused: ${result}.`;
}
