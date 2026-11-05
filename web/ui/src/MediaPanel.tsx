import { useEffect, useState } from 'react';
import type { VideoMediaList } from '../../shared/types';
import type { ApiError } from './api';
import { ErrorNote } from './components';

const PAGE_FILE = /^page-\d+\.jpg$/;

interface QaCheck {
  name: string;
  level: string;
  detail: string;
}

function isQaCheck(value: unknown): value is QaCheck {
  const check = value as Partial<QaCheck> | null;
  return typeof check?.name === 'string' && typeof check.level === 'string';
}

function ScriptText({ url }: { url: string }) {
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    fetch(url)
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        const body = await response.text();
        if (isCurrent) setText(body);
      })
      .catch(() => {
        if (isCurrent) setFailed(true);
      });
    return () => {
      isCurrent = false;
    };
  }, [url]);

  if (failed) return <p className="error-note">The worker holding the script did not answer.</p>;
  return text === null ? null : <pre className="script-text">{text}</pre>;
}

export function MediaPanel({
  videoId,
  media,
  error,
}: {
  videoId: string;
  media: VideoMediaList | null;
  error: ApiError | null;
}) {
  if (error && !media) return <ErrorNote error={error} />;
  if (!media) return null;
  const data = media;
  // The revision reloads a rewritten file, whose name stays the same; the key replaces its player.
  const revisionOf = (file: string): string | undefined =>
    data.files.find((candidate) => candidate.file === file)?.revision;
  const urlOf = (file: string): string =>
    `/api/videos/${encodeURIComponent(videoId)}/media/${encodeURIComponent(file)}?v=${revisionOf(file) ?? ''}`;
  const has = (file: string): boolean => revisionOf(file) !== undefined;
  const pages = data.files.map((entry) => entry.file).filter((file) => PAGE_FILE.test(file));
  const { metadata, qa_level: qaLevel, qa_checks: qaChecks } = data.review;
  const problems = Array.isArray(qaChecks)
    ? qaChecks.filter(isQaCheck).filter((check) => check.level !== 'PASS')
    : [];
  const isEmpty = data.files.length === 0 && !metadata && !qaLevel;
  if (isEmpty) return null;

  return (
    <section className="card media" aria-labelledby="media-heading">
      <div className="card-head">
        <h2 id="media-heading">Review material</h2>
      </div>
      <div className="media-grid">
        {qaLevel && (
          <p>
            Quality check: <strong className={`qa-${qaLevel.toLowerCase()}`}>{qaLevel}</strong>
          </p>
        )}
        {problems.length > 0 && (
          <ul className="plain">
            {problems.map((check) => (
              <li key={check.name} className={`qa-${check.level.toLowerCase()}`}>
                {check.name}: {check.detail}
              </li>
            ))}
          </ul>
        )}
        {metadata && (
          <div className="media-item" lang={data.language}>
            <p className="media-label" lang="en">
              Title and description for publishing
            </p>
            <p>
              <strong>{metadata.title}</strong>
            </p>
            <p className="prose">{metadata.description}</p>
            {metadata.tags && <p className="note">{metadata.tags.join(', ')}</p>}
            {metadata.hashtags && <p className="note">{metadata.hashtags.join(' ')}</p>}
          </div>
        )}
        {has('final.mp4') && (
          <figure className="media-item">
            <figcaption>Final video</figcaption>
            <video key={urlOf('final.mp4')} controls preload="metadata" src={urlOf('final.mp4')} />
          </figure>
        )}
        {has('preview.mp4') && (
          <figure className="media-item">
            <figcaption>Preview</figcaption>
            <video
              key={urlOf('preview.mp4')}
              controls
              preload="metadata"
              src={urlOf('preview.mp4')}
            />
          </figure>
        )}
        {has('thumbnail.jpg') && (
          <figure className="media-item">
            <figcaption>Thumbnail</figcaption>
            <img src={urlOf('thumbnail.jpg')} alt="Thumbnail of the video" loading="lazy" />
          </figure>
        )}
        {pages.length > 0 && (
          <div className="media-item">
            <p className="media-label">Storyboard</p>
            <div className="pages">
              {pages.map((page, index) => (
                <img
                  key={page}
                  src={urlOf(page)}
                  alt={`Storyboard page ${index + 1}`}
                  loading="lazy"
                  width={1280}
                  height={720}
                />
              ))}
            </div>
          </div>
        )}
        {has('mix.m4a') && (
          <figure className="media-item">
            <figcaption>Sound mix</figcaption>
            <audio key={urlOf('mix.m4a')} controls preload="none" src={urlOf('mix.m4a')} />
          </figure>
        )}
        {has('voice.m4a') && (
          <figure className="media-item">
            <figcaption>Voice</figcaption>
            <audio key={urlOf('voice.m4a')} controls preload="none" src={urlOf('voice.m4a')} />
          </figure>
        )}
        {has('script.md') && (
          <div className="media-item">
            <p className="media-label">Script</p>
            <div lang={data.language}>
              <ScriptText url={urlOf('script.md')} />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
