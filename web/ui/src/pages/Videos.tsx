import { useEffect, useState } from 'react';
import type { VideoFilter } from '../../../shared/types';
import { api } from '../api';
import { ErrorNote, Link, Loading, VideoRow } from '../components';
import { usePoll } from '../hooks';

const PAGE_SIZE = 50;
const SEARCH_DELAY_MS = 300;

const FILTERS: readonly { value: VideoFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'In production' },
  { value: 'approval', label: 'Waiting for approval' },
  { value: 'stopped', label: 'Stopped' },
  { value: 'running', label: 'Running' },
  { value: 'waiting', label: 'Queued' },
  { value: 'done', label: 'Finished' },
];

function filterFromUrl(): VideoFilter {
  const wanted = new URLSearchParams(window.location.search).get('state');
  return FILTERS.find((filter) => filter.value === wanted)?.value ?? 'all';
}

export function Videos() {
  const [state, setState] = useState<VideoFilter>(filterFromUrl);
  const [typed, setTyped] = useState('');
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(typed.trim());
      setOffset(0);
    }, SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [typed]);

  const { data, error, isLoading } = usePoll(
    () => api.videos({ state, search, limit: PAGE_SIZE, offset }),
    `${state}|${search}|${offset}`,
  );
  const lastShown = offset + (data?.items.length ?? 0);

  return (
    <section aria-labelledby="videos">
      <h1 id="videos">Videos</h1>
      <p>
        <Link to="/videos/new" className="primary-link">
          New video
        </Link>
      </p>
      <div className="filters">
        <label>
          State
          <select
            value={state}
            onChange={(event) => {
              setState(event.target.value as VideoFilter);
              setOffset(0);
            }}
          >
            {FILTERS.map((filter) => (
              <option key={filter.value} value={filter.value}>
                {filter.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grow">
          Search by title or id
          <input
            type="search"
            name="search"
            autoComplete="off"
            spellCheck={false}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
          />
        </label>
      </div>
      {isLoading && <Loading />}
      {error && <ErrorNote error={error} />}
      {data?.total === 0 && (
        <p className="quiet">No video matches. Clear the search or change the state.</p>
      )}
      <ul className="video-list">
        {data?.items.map((video) => (
          <VideoRow key={video.video_id} video={video} />
        ))}
      </ul>
      {data && data.total > PAGE_SIZE && (
        <nav className="pager" aria-label="Pages">
          <button
            type="button"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          >
            Newer
          </button>
          <span>
            {offset + 1} to {lastShown} of {data.total}
          </span>
          <button
            type="button"
            disabled={lastShown >= data.total}
            onClick={() => setOffset(offset + PAGE_SIZE)}
          >
            Older
          </button>
        </nav>
      )}
    </section>
  );
}
