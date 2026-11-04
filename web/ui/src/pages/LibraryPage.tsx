import { useState } from 'react';
import { LIBRARY_PAGE_SIZE, type LibraryGroupBy, type LibraryItem } from '../../../shared/types';
import { api } from '../api';
import { ErrorNote, Link, Loading, Pager } from '../components';
import { formatDuration, formatTime, shortId } from '../format';
import { replaceUrl, useDebounced, usePageOffset, usePoll, useSearchParams } from '../hooks';

const SEARCH_DELAY_MS = 300;
const OTHER_GROUP = 'Other';

const GROUPINGS: readonly { value: LibraryGroupBy; label: string }[] = [
  { value: 'kit', label: 'Kit' },
  { value: 'character', label: 'Character' },
];

/** Finished and archived is the normal case; anything else is worth saying, the copy is still there. */
const STATUS_NOTE: Readonly<Record<string, string>> = {
  CANCELLED: 'Cancelled',
  FAILED: 'Failed',
};

function LibraryRow({ item }: { item: LibraryItem }) {
  return (
    <li className="library-row">
      <Link to={`/videos/${item.video_id}`} className="video-title">
        <span lang={item.language}>{item.title ?? shortId(item.video_id)}</span>
      </Link>
      <span className="library-links">
        {item.file_url ? (
          <a href={item.file_url} target="_blank" rel="noopener noreferrer">
            Open in Drive
          </a>
        ) : (
          <span className="note">No Drive link yet</span>
        )}
        {item.folder_url && (
          <a href={item.folder_url} target="_blank" rel="noopener noreferrer">
            Folder
          </a>
        )}
      </span>
      <span className="note">
        {STATUS_NOTE[item.status] ? (
          <span className="warn">{STATUS_NOTE[item.status]}, </span>
        ) : null}
        {item.duration_seconds ? `${formatDuration(item.duration_seconds)}, ` : ''}
        {formatTime(item.archived_at)}
      </span>
    </li>
  );
}

export function LibraryPage() {
  // The address is the one source, so the nav link and a reload always show what it says.
  const group: LibraryGroupBy =
    useSearchParams().get('group') === 'character' ? 'character' : 'kit';
  const [typed, setTyped] = useState('');
  const search = useDebounced(typed.trim(), SEARCH_DELAY_MS);
  const [offset, setOffset] = usePageOffset(`${group}|${search}`);

  const { data, error, isLoading } = usePoll(
    () => api.library({ group, search, limit: LIBRARY_PAGE_SIZE, offset }),
    `${group}|${search}|${offset}`,
    false,
  );

  function chooseGroup(value: LibraryGroupBy): void {
    replaceUrl(value === 'kit' ? '/library' : `/library?group=${value}`);
  }

  return (
    <section aria-labelledby="library">
      <h1 id="library">Library</h1>
      <p className="note library-note">
        Links open only for Google accounts with access to the archive folder on Drive.
      </p>
      <div className="filters">
        <div className="segmented" role="group" aria-label="Group by">
          {GROUPINGS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={group === option.value}
              onClick={() => chooseGroup(option.value)}
            >
              {option.label}
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
        <p className="quiet">
          {search === ''
            ? 'Videos appear here once they are archived on Drive.'
            : 'No video matches. Clear the search.'}
        </p>
      )}
      {data?.groups.map((entry) => {
        const items = data.items.filter((item) => item.group_slug === entry.slug);
        if (items.length === 0) return null;
        const heading = `${entry.label ?? OTHER_GROUP} (${entry.count})`;
        const headingId = `library-group-${entry.slug ?? 'other'}`;
        return (
          <section key={headingId} className="library-group" aria-labelledby={headingId}>
            <h2 id={headingId}>{heading}</h2>
            <ul className="video-list">
              {items.map((item) => (
                <LibraryRow key={item.video_id} item={item} />
              ))}
            </ul>
          </section>
        );
      })}
      {data && (
        <Pager
          offset={offset}
          pageSize={LIBRARY_PAGE_SIZE}
          shown={data.items.length}
          total={data.total}
          previousLabel="Previous"
          nextLabel="Next"
          onChange={setOffset}
        />
      )}
    </section>
  );
}
