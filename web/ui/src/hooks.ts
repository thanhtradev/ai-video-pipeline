import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ApiError } from './api';

const POLL_MS = 15_000;

export interface Polled<T> {
  data: T | null;
  error: ApiError | null;
  isLoading: boolean;
  /** Fetch again now, keeping what is on screen until the answer arrives. */
  reload: () => void;
}

/** Fetches now and every 15 seconds while the tab is visible. `key` restarts it. */
export function usePoll<T>(fetcher: () => Promise<T>, key: string): Polled<T> {
  const [state, setState] = useState<Omit<Polled<T>, 'reload'>>({
    data: null,
    error: null,
    isLoading: true,
  });
  const loadNow = useRef<() => void>(() => undefined);
  const reload = useCallback(() => loadNow.current(), []);
  const latest = useRef(fetcher);
  latest.current = fetcher;

  useEffect(() => {
    let isCurrent = true;
    setState((previous) => ({ ...previous, data: null, error: null, isLoading: true }));

    const load = async (): Promise<void> => {
      try {
        const data = await latest.current();
        if (isCurrent) setState({ data, error: null, isLoading: false });
      } catch (error: unknown) {
        if (!isCurrent) return;
        const apiError = error instanceof ApiError ? error : new ApiError(0, 'Something failed.');
        if (apiError.status === 401) window.dispatchEvent(new Event(SIGNED_OUT_EVENT));
        // Keep what is on screen: a missed poll should not blank the page.
        setState((previous) => ({ ...previous, error: apiError, isLoading: false }));
      }
    };
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void load();
    };

    loadNow.current = () => void load();
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, POLL_MS);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      isCurrent = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [key]);

  return { ...state, reload };
}

export const SIGNED_OUT_EVENT = 'aivideo:signed-out';

const NAVIGATE_EVENT = 'aivideo:navigate';

function subscribeToLocation(onChange: () => void): () => void {
  window.addEventListener('popstate', onChange);
  window.addEventListener(NAVIGATE_EVENT, onChange);
  return () => {
    window.removeEventListener('popstate', onChange);
    window.removeEventListener(NAVIGATE_EVENT, onChange);
  };
}

export function usePath(): string {
  return useSyncExternalStore(subscribeToLocation, () => window.location.pathname);
}

export function navigate(path: string): void {
  window.history.pushState(null, '', path);
  window.dispatchEvent(new Event(NAVIGATE_EVENT));
  window.scrollTo(0, 0);
}

export function useLinkHandler(path: string): (event: React.MouseEvent) => void {
  return useCallback(
    (event: React.MouseEvent) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
      event.preventDefault();
      navigate(path);
    },
    [path],
  );
}
