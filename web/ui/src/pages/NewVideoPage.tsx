import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { Catalog, CatalogOption, NewVideo, VideoDraft } from '../../../shared/types';
import { api, ApiError } from '../api';
import { Card, ErrorNote, Link, Loading, PageHeader } from '../components';
import { navigate, SIGNED_OUT_EVENT } from '../hooks';

const AUTOMATIC = '';

function defaultOf(options: CatalogOption[]): string {
  return (options.find((option) => option.is_default) ?? options[0])?.slug ?? '';
}

function messageOf(error: unknown): string {
  // Keeps the form: signing in from another tab lets this one go on.
  if (error instanceof ApiError && error.status === 401) {
    return 'Your session ended. Send /web to the bot, sign in from the link in a new tab, then try again here.';
  }
  return error instanceof ApiError ? error.message : 'The console did not answer. Try again.';
}

const CREATE_RESULTS: Readonly<Record<string, string>> = {
  EXPIRED: 'That draft expired. Press Review again.',
  NOT_PENDING: 'That draft was already settled, in another tab perhaps. Press Review again.',
  NOT_FOUND: 'That draft no longer exists. Press Review again.',
  NOT_ALLOWED: 'You are not an approver.',
};

function NewVideoForm({ catalog }: { catalog: Catalog }) {
  const [topic, setTopic] = useState('');
  const [minutes, setMinutes] = useState(AUTOMATIC);
  const [notes, setNotes] = useState('');
  const [kit, setKit] = useState(defaultOf(catalog.kits));
  const [character, setCharacter] = useState(defaultOf(catalog.characters));
  const [worker, setWorker] = useState(AUTOMATIC);
  const [auto, setAuto] = useState(false);
  const [draft, setDraft] = useState<VideoDraft | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const language = catalog.kits.find((option) => option.slug === kit)?.language ?? 'vi';
  // A kit's video has one language, so only a cast in that language can go with it (D-092).
  const characters = useMemo(
    () => catalog.characters.filter((option) => option.language === language),
    [catalog.characters, language],
  );
  const characterShown = characters.some((option) => option.slug === character)
    ? character
    : defaultOf(characters);

  async function review(event: FormEvent): Promise<void> {
    event.preventDefault();
    setIsBusy(true);
    setFailure(null);
    const video: NewVideo = {
      topic: topic.trim(),
      auto,
      // Left out when empty, so the database gives its own reason, in words.
      ...(kit === '' ? {} : { kit }),
      ...(characterShown === '' ? {} : { character_set: characterShown }),
      ...(minutes === AUTOMATIC ? {} : { duration_minutes: Number(minutes) }),
      ...(notes.trim() === '' ? {} : { notes: notes.trim() }),
      ...(worker === AUTOMATIC ? {} : { worker }),
    };
    try {
      const answer = await api.createDraft(video);
      if (answer.result === 'DRAFT' && answer.token) setDraft(answer);
      else setFailure(answer.error ?? `The video was refused: ${answer.result}.`);
    } catch (error: unknown) {
      setFailure(messageOf(error));
    } finally {
      setIsBusy(false);
    }
  }

  /**
   * Settles the draft and follows the answer. Either choice can find a video an earlier press made,
   * whose answer never arrived; it then opens that video, so nobody pays for a second one.
   */
  async function settle(confirm: boolean): Promise<void> {
    if (!draft?.token) return;
    setIsBusy(true);
    setFailure(null);
    try {
      const { result, video_id: videoId, error } = await api.createDecide(draft.token, confirm);
      if (videoId) {
        navigate(`/videos/${videoId}`);
        return;
      }
      setDraft(null);
      if (confirm || result !== 'OK') {
        setFailure(error ?? CREATE_RESULTS[result] ?? `The video was not created: ${result}.`);
      }
    } catch (error: unknown) {
      setFailure(messageOf(error));
    } finally {
      setIsBusy(false);
    }
  }

  if (draft) {
    return (
      <Card id="review-heading" title="Create this video?" tone="running">
        {failure && (
          <p className="error-note" role="alert">
            {failure}
          </p>
        )}
        <dl className="facts">
          <dt>Topic</dt>
          <dd lang={language}>{draft.brief?.topic}</dd>
          <dt>Length</dt>
          <dd>
            {draft.brief?.duration_minutes
              ? `${draft.brief.duration_minutes} minutes`
              : 'Automatic, about 6 minutes'}
          </dd>
          <dt>Kit</dt>
          <dd>{draft.selection?.kit?.label}</dd>
          <dt>Character</dt>
          <dd>{draft.selection?.character_set?.label}</dd>
          <dt>Worker</dt>
          <dd>{worker === AUTOMATIC ? 'Automatic' : worker}</dd>
          <dt>Automatic approval</dt>
          <dd>{draft.selection?.auto ? 'On' : 'Off'}</dd>
          {draft.brief?.notes && (
            <>
              <dt>Notes</dt>
              <dd className="prose" lang={language}>
                {draft.brief.notes}
              </dd>
            </>
          )}
        </dl>
        <div className="button-row">
          <button
            type="button"
            className="primary"
            disabled={isBusy}
            onClick={() => void settle(true)}
          >
            {isBusy ? 'Creating' : 'Create video'}
          </button>
          <button type="button" disabled={isBusy} onClick={() => void settle(false)}>
            Change something
          </button>
        </div>
      </Card>
    );
  }

  return (
    <form className="new-video" onSubmit={(event) => void review(event)}>
      {failure && (
        <p className="error-note" role="alert">
          {failure}
        </p>
      )}
      <Card title="What">
        <div className="form-section">
          <label>
            Topic
            <input
              name="topic"
              lang={language}
              required
              maxLength={500}
              autoComplete="off"
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
            />
          </label>
          <label>
            Notes for the script (optional)
            <textarea
              name="notes"
              lang={language}
              maxLength={2000}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
        </div>
      </Card>
      <Card title="How">
        <div className="form-section">
          <div className="field-pair">
            <label>
              Kit
              <select name="kit" value={kit} onChange={(event) => setKit(event.target.value)}>
                {catalog.kits.map((option) => (
                  <option key={option.slug} value={option.slug}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Character
              <select
                name="character"
                value={characterShown}
                onChange={(event) => setCharacter(event.target.value)}
              >
                {characters.map((option) => (
                  <option key={option.slug} value={option.slug}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Length
              <select
                name="minutes"
                value={minutes}
                onChange={(event) => setMinutes(event.target.value)}
              >
                <option value={AUTOMATIC}>Automatic, about 6 minutes</option>
                {catalog.minutes.map((value) => (
                  <option key={value} value={value}>
                    {value} minutes
                  </option>
                ))}
              </select>
            </label>
            <label>
              Worker
              <select
                name="worker"
                value={worker}
                onChange={(event) => setWorker(event.target.value)}
              >
                <option value={AUTOMATIC}>Automatic</option>
                {catalog.workers.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.online ? option.id : `${option.id} (offline)`}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={auto}
              onChange={(event) => setAuto(event.target.checked)}
            />
            <span>
              Approve every gate automatically. A QA failure still stops the video, and the Mac
              cleanup is never automatic.
            </span>
          </label>
          <p className="note">A full brief from a file still goes through /new on Telegram.</p>
        </div>
      </Card>
      <div className="button-row">
        <button type="submit" className="primary" disabled={isBusy || topic.trim() === ''}>
          {isBusy ? 'Checking' : 'Review'}
        </button>
        <Link to="/videos" className="text-button">
          Back to videos
        </Link>
      </div>
    </form>
  );
}

export function NewVideoPage() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  // Once, not polled: the choices rarely change, and a poll answering 401 would sign the page out
  // and lose what is being typed.
  useEffect(() => {
    let isCurrent = true;
    api
      .catalog()
      .then((answer) => {
        if (isCurrent) setCatalog(answer);
      })
      .catch((failure: unknown) => {
        if (!isCurrent) return;
        if (failure instanceof ApiError && failure.status === 401) {
          window.dispatchEvent(new Event(SIGNED_OUT_EVENT));
          return;
        }
        setError(failure instanceof ApiError ? failure : new ApiError(0, 'Something failed.'));
      });
    return () => {
      isCurrent = false;
    };
  }, []);

  return (
    <>
      <PageHeader title="New video" />
      {!catalog && !error && <Loading />}
      {error && <ErrorNote error={error} />}
      {catalog && <NewVideoForm catalog={catalog} />}
    </>
  );
}
