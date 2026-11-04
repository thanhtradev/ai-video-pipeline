import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ApiError } from './api';

const POLL_MS = 15_000;

export interface Polled<T> {
  data: T | null;
  error: ApiError | null;
  isLoading: boolean;
  /** Fetch again now, keeping what is on screen until the answer arrives. */
  reload: () => void;
}

/**
 * Fetches now and every 15 seconds while the tab is visible. `key` restarts it. With `isLive` false it
 * fetches only when `key` changes, for data that rarely does.
 */
export function usePoll<T>(fetcher: () => Promise<T>, key: string, isLive = true): Polled<T> {
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
    if (!isLive) {
      return () => {
        isCurrent = false;
      };
    }
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, POLL_MS);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      isCurrent = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [key, isLive]);

  return { ...state, reload };
}

export function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
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

export function useSearchParams(): URLSearchParams {
  const search = useSyncExternalStore(subscribeToLocation, () => window.location.search);
  return useMemo(() => new URLSearchParams(search), [search]);
}

/** Changes the address without adding to the browser's history, and tells whoever reads it. */
export function replaceUrl(url: string): void {
  window.history.replaceState(null, '', url);
  window.dispatchEvent(new Event(NAVIGATE_EVENT));
}

/**
 * The offset of a paged list, back to 0 when `filterKey` changes. Derived, not reset by an effect,
 * which would first fetch the new filter at the old offset.
 */
export function usePageOffset(filterKey: string): [number, (offset: number) => void] {
  const [page, setPage] = useState({ filterKey, offset: 0 });
  const offset = page.filterKey === filterKey ? page.offset : 0;
  const setOffset = useCallback(
    (next: number) => setPage({ filterKey, offset: next }),
    [filterKey],
  );
  return [offset, setOffset];
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
