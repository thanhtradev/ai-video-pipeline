import { useState } from 'react';
import { api, ApiError } from '../api';
import { Link } from '../components';

/**
 * Opening the link changes nothing: signing in takes a press, so a link preview or prefetch cannot
 * use up the one-time token.
 */
export function SignIn({
  onSignedIn,
  isSignedIn,
}: {
  onSignedIn: () => void;
  isSignedIn: boolean;
}) {
  const token = new URLSearchParams(window.location.search).get('t');
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  async function signIn(): Promise<void> {
    if (!token) return;
    setIsBusy(true);
    setError(null);
    try {
      await api.login(token);
      window.history.replaceState(null, '', '/');
      onSignedIn();
    } catch (failure: unknown) {
      setIsBusy(false);
      setError(
        failure instanceof ApiError && failure.status === 401
          ? 'This link was already used or has expired. Send /web to the bot for a new one.'
          : failure instanceof ApiError
            ? failure.message
            : 'Sign-in failed. Send /web to the bot for a new link.',
      );
    }
  }

  return (
    <main className="sign-in">
      <div className="card">
        <span className="brand">
          <span className="brand-mark" aria-hidden="true">
            VP
          </span>
          Video pipeline
        </span>
        <h1>Sign in</h1>
        {token && !error ? (
          <button type="button" className="primary" disabled={isBusy} onClick={() => void signIn()}>
            {isBusy ? 'Signing in' : 'Sign in'}
          </button>
        ) : (
          <p role={error ? 'alert' : undefined}>
            {error ??
              'To sign in, send /web to the bot in a private chat and open the link it sends.'}
          </p>
        )}
        {isSignedIn && (
          <p>
            <Link to="/">Go to the dashboard</Link>
          </p>
        )}
      </div>
    </main>
  );
}
