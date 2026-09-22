import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useBusiness } from '../context';
import { sessionClient } from './client';

export function BusinessLogin() {
  const { i18n } = useTranslation(),
    pl = i18n.language.startsWith('pl');
  const business = useBusiness();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(false);
    try {
      await sessionClient.signIn(
        String(form.get('email')),
        String(form.get('password')),
      );
      await business.retry?.();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="bz-home">
      <form
        className="bz-estimation-form"
        onSubmit={submit}
        data-testid="business-login"
      >
        <h1>RoofCalc Business</h1>
        <p>
          {pl
            ? 'Zaloguj się do danych swojej firmy. Kalkulatory Standard nie wymagają konta.'
            : 'Sign in to your company workspace. Standard calculators need no account.'}
        </p>
        <div className="bz-form-grid">
          <label>
            Email
            <input name="email" type="email" autoComplete="username" required />
          </label>
          <label>
            {pl ? 'Hasło' : 'Password'}
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
        </div>
        {error && (
          <p role="alert">
            {pl
              ? 'Nie udało się zalogować. Sprawdź dane lub dostępność usługi.'
              : 'Sign-in failed. Check your credentials or service availability.'}
          </p>
        )}
        <button className="a-button" disabled={busy}>
          {busy ? '…' : pl ? 'Zaloguj' : 'Sign in'}
        </button>
        <button
          className="a-button"
          type="button"
          onClick={() => business.setMode('standard')}
        >
          Standard
        </button>
      </form>
    </main>
  );
}
