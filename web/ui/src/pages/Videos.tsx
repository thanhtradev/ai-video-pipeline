import { useState } from 'react';
import type { VideoFilter } from '../../../shared/types';
import { api } from '../api';
import { ErrorNote, Link, Loading, Pager, VideoRow } from '../components';
import { useDebounced, usePageOffset, usePoll } from '../hooks';

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
  const search = useDebounced(typed.trim(), SEARCH_DELAY_MS);
  const [offset, setOffset] = usePageOffset(`${state}|${search}`);

  const { data, error, isLoading } = usePoll(
    () => api.videos({ state, search, limit: PAGE_SIZE, offset }),
    `${state}|${search}|${offset}`,
  );

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
      {data && (
        <Pager
          offset={offset}
          pageSize={PAGE_SIZE}
          shown={data.items.length}
          total={data.total}
          previousLabel="Newer"
          nextLabel="Older"
          onChange={setOffset}
        />
      )}
    </section>
  );
}
