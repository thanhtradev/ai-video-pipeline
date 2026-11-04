import { useEffect, useState } from 'react';
import type { Me } from '../../shared/types';
import { api, ApiError } from './api';
import { ErrorNote, Link, Loading } from './components';
import { SIGNED_OUT_EVENT, usePath } from './hooks';
import { Overview } from './pages/Overview';
import { ReportPage } from './pages/ReportPage';
import { SignIn } from './pages/SignIn';
import { VideoPage } from './pages/VideoPage';
import { Videos } from './pages/Videos';
import { WorkerPage, Workers } from './pages/Workers';

const NAV = [
  { to: '/', label: 'Overview' },
  { to: '/videos', label: 'Videos' },
  { to: '/workers', label: 'Workers' },
  { to: '/report', label: 'Report' },
] as const;

/** A truncated pasted link can hold a broken escape; the API then refuses the id with a message. */
function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function isCurrent(path: string, to: string): boolean {
  return to === '/' ? path === '/' : path === to || path.startsWith(`${to}/`);
}

function Page({ path, me }: { path: string; me: Me }) {
  const video = /^\/videos\/([^/]+)$/.exec(path);
  if (video) return <VideoPage key={video[1]!} id={decodeSegment(video[1]!)} me={me} />;
  const worker = /^\/workers\/([^/]+)$/.exec(path);
  if (worker) return <WorkerPage key={worker[1]!} id={decodeSegment(worker[1]!)} />;
  if (path === '/') return <Overview />;
  if (path === '/videos') return <Videos />;
  if (path === '/workers') return <Workers />;
  if (path === '/report') return <ReportPage />;
  return (
    <section>
      <h1>Page not found</h1>
      <p>
        <Link to="/">Go to the overview</Link>
      </p>
    </section>
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
        <h1>Video pipeline</h1>
        <ErrorNote error={session.error} />
        <button type="button" onClick={() => setAttempt(attempt + 1)}>
          Try again
        </button>
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
    <>
      <a className="skip" href="#content">
        Skip to content
      </a>
      <header className="topbar">
        <span className="brand">Video pipeline</span>
        <nav aria-label="Main">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={isCurrent(path, item.to) ? 'nav-link nav-current' : 'nav-link'}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <span className="who">
          {session.me.name}
          <button type="button" className="text-button" onClick={() => void signOut()}>
            Sign out
          </button>
        </span>
      </header>
      <main id="content" className="content">
        {signOutFailed && (
          <p className="error-note" role="alert">
            You are not signed out: the console did not answer. Try again.
          </p>
        )}
        <Page path={path} me={session.me} />
      </main>
    </>
  );
}
