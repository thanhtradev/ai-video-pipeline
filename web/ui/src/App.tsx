import { useEffect, useState } from 'react';
import type { Me } from '../../shared/types';
import { api, ApiError } from './api';
import { Card, ErrorNote, Link, Loading, PageHeader } from './components';
import { SIGNED_OUT_EVENT, usePath } from './hooks';
import { LibraryPage } from './pages/LibraryPage';
import { NewVideoPage } from './pages/NewVideoPage';
import { Overview } from './pages/Overview';
import { ReportPage } from './pages/ReportPage';
import { SignIn } from './pages/SignIn';
import { VideoPage } from './pages/VideoPage';
import { Videos } from './pages/Videos';
import { WorkerPage, Workers } from './pages/Workers';
import { Shell } from './shell/Shell';

/** A truncated pasted link can hold a broken escape; the API then refuses the id with a message. */
function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function Page({ path, me }: { path: string; me: Me }) {
  if (path === '/videos/new') return <NewVideoPage />;
  const video = /^\/videos\/([^/]+)$/.exec(path);
  if (video) return <VideoPage key={video[1]!} id={decodeSegment(video[1]!)} me={me} />;
  const worker = /^\/workers\/([^/]+)$/.exec(path);
  if (worker) return <WorkerPage key={worker[1]!} id={decodeSegment(worker[1]!)} />;
  if (path === '/') return <Overview />;
  if (path === '/videos') return <Videos />;
  if (path === '/library') return <LibraryPage />;
  if (path === '/workers') return <Workers />;
  if (path === '/report') return <ReportPage />;
  return (
    <>
      <PageHeader title="Page not found" />
      <Card>
        <p>
          <Link to="/">Go to the dashboard</Link>
        </p>
      </Card>
    </>
  );
}

type Session =
  | { kind: 'loading' }
  | { kind: 'out' }
  | { kind: 'in'; me: Me }
  | { kind: 'error'; error: ApiError };

export function App() {
  const path = usePath();
  const [session, setSession] = useState<Session>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [signOutFailed, setSignOutFailed] = useState(false);

  useEffect(() => {
    let isActive = true;
    api
      .me()
      .then((me) => {
        if (isActive) setSession({ kind: 'in', me });
      })
      .catch((error: unknown) => {
        if (!isActive) return;
        if (error instanceof ApiError && error.status !== 401) setSession({ kind: 'error', error });
        else setSession({ kind: 'out' });
      });
    return () => {
      isActive = false;
    };
  }, [attempt]);

  useEffect(() => {
    const onSignedOut = (): void => setSession({ kind: 'out' });
    window.addEventListener(SIGNED_OUT_EVENT, onSignedOut);
    return () => window.removeEventListener(SIGNED_OUT_EVENT, onSignedOut);
  }, []);

  if (session.kind === 'loading')
    return (
      <main className="sign-in">
        <Loading />
      </main>
    );
  if (session.kind === 'error') {
    return (
      <main className="sign-in">
        <Card>
          <h1>Video pipeline</h1>
          <ErrorNote error={session.error} />
          <button type="button" onClick={() => setAttempt(attempt + 1)}>
            Try again
          </button>
        </Card>
      </main>
    );
  }
  if (session.kind === 'out' || path === '/login') {
    return <SignIn isSignedIn={session.kind === 'in'} onSignedIn={() => setAttempt(attempt + 1)} />;
  }

  const signOut = async (): Promise<void> => {
    try {
      await api.logout();
      setSession({ kind: 'out' });
    } catch {
      setSignOutFailed(true);
    }
  };

  return (
    <Shell path={path} me={session.me} onSignOut={() => void signOut()}>
      {signOutFailed && (
        <p className="error-note" role="alert">
          You are not signed out: the console did not answer. Try again.
        </p>
      )}
      <Page path={path} me={session.me} />
    </Shell>
  );
}
