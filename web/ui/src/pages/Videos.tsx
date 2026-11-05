import { useState } from 'react';
import type { VideoFilter } from '../../../shared/types';
import { api } from '../api';
import { EmptyState, ErrorNote, Link, Loading, PageHeader, Pager, VideoRow } from '../components';
import { replaceUrl, useDebounced, usePageOffset, usePoll, useSearchParams } from '../hooks';

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

function filterOf(params: URLSearchParams): VideoFilter {
  const wanted = params.get('state');
  return FILTERS.find((filter) => filter.value === wanted)?.value ?? 'all';
}

export function Videos() {
  // The address holds the filter, so a link from the dashboard and a reload show the same list.
  const state = filterOf(useSearchParams());
  const [typed, setTyped] = useState('');
  const search = useDebounced(typed.trim(), SEARCH_DELAY_MS);
  const [offset, setOffset] = usePageOffset(`${state}|${search}`);

  const { data, error, isLoading } = usePoll(
    () => api.videos({ state, search, limit: PAGE_SIZE, offset }),
    `${state}|${search}|${offset}`,
  );

  function chooseState(value: VideoFilter): void {
    replaceUrl(value === 'all' ? '/videos' : `/videos?state=${value}`);
  }

  return (
    <>
      <PageHeader
        title="Videos"
        actions={
          <Link to="/videos/new" className="primary-link">
            New video
          </Link>
        }
      />
      <div className="filters">
        <div className="chips" role="group" aria-label="State">
          {FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              aria-pressed={state === filter.value}
              onClick={() => chooseState(filter.value)}
            >
              {filter.label}
            </button>
          ))}
        </div>
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
        <EmptyState title="No video matches" hint="Clear the search or choose another state." />
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
    </>
  );
}
