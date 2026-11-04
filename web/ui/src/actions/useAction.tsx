import { useState } from 'react';
import { ApiError } from '../api';

export interface ActionState {
  isBusy: boolean;
  message: string | null;
  isError: boolean;
  /** Runs one action at a time; the promise resolves to a message to show, or '' for none. */
  run: (work: () => Promise<string>) => void;
  clear: () => void;
}

export function useAction(onDone: () => void): ActionState {
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  return {
    isBusy,
    message,
    isError,
    clear: () => setMessage(null),
    run: (work) => {
      setIsBusy(true);
      setMessage(null);
      setIsError(false);
      work()
        .then((text) => {
          setMessage(text === '' ? null : text);
          onDone();
        })
        .catch((error: unknown) => {
          setIsError(true);
          setMessage(error instanceof ApiError ? error.message : 'The action failed. Try again.');
        })
        .finally(() => setIsBusy(false));
    },
  };
}

export function ActionMessage({ state }: { state: ActionState }) {
  if (!state.message) return null;
  return (
    <p
      className={state.isError ? 'error-note' : 'outcome'}
      role={state.isError ? 'alert' : 'status'}
    >
      {state.message}
    </p>
  );
}
