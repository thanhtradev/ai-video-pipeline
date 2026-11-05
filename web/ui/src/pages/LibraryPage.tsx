import { useState } from 'react';
import { LIBRARY_PAGE_SIZE, type LibraryGroupBy, type LibraryItem } from '../../../shared/types';
import { api } from '../api';
import { Card, EmptyState, ErrorNote, Link, Loading, PageHeader, Pager } from '../components';
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
      <div className="list-main">
        <Link to={`/videos/${item.video_id}`}>
          <span lang={item.language}>{item.title ?? shortId(item.video_id)}</span>
        </Link>
        <span className="cell-sub">
          {STATUS_NOTE[item.status] ? (
            <span className="warn">{STATUS_NOTE[item.status]}, </span>
          ) : null}
          {item.duration_seconds ? `${formatDuration(item.duration_seconds)}, ` : ''}
          {formatTime(item.archived_at)}
        </span>
      </div>
      <span className="list-side">
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
    <>
      <PageHeader
        title="Library"
        lead="Archived videos on Drive. Links open only for Google accounts with access to the archive folder."
      />
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
        <EmptyState
          title={search === '' ? 'Nothing archived yet' : 'No video matches'}
          hint={
            search === ''
              ? 'Videos appear here once they are archived on Drive.'
              : 'Clear the search.'
          }
        />
      )}
      {data?.groups.map((entry) => {
        const items = data.items.filter((item) => item.group_slug === entry.slug);
        if (items.length === 0) return null;
        const heading = `${entry.label ?? OTHER_GROUP} (${entry.count})`;
        const headingId = `library-group-${entry.slug ?? 'other'}`;
        return (
          <Card key={headingId} id={headingId} title={heading} className="library-group">
            <ul className="list">
              {items.map((item) => (
                <LibraryRow key={item.video_id} item={item} />
              ))}
            </ul>
          </Card>
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
    </>
  );
}
