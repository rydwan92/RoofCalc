import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useBusiness } from '../context';
import { sessionClient } from './client';
import { BusinessClientError } from '../client';

export function BusinessLogin() {
  const { i18n } = useTranslation(),
    pl = i18n.language.startsWith('pl');
  const business = useBusiness();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<'credentials' | 'unavailable'>();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(undefined);
    try {
      await sessionClient.signIn(
        String(form.get('email')).trim().toLowerCase(),
        String(form.get('password')),
      );
      await business.retry?.();
    } catch (failure) {
      setError(
        failure instanceof BusinessClientError &&
          failure.code === 'invalid-credentials'
          ? 'credentials'
          : 'unavailable',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="bz-home bz-login">
      <form
        className="bz-estimation-form"
        onSubmit={submit}
        data-testid="business-login"
      >
        <span className="bz-login-brand">ROOFCALC BUSINESS</span>
        <h1>{pl ? 'Zaloguj się do hurtowni' : 'Sign in to your wholesaler'}</h1>
        <p>
          {pl
            ? 'Kalkulatory techniczne RoofCalc pozostają dostępne bez logowania.'
            : 'Sign in to your company workspace. Standard calculators need no account.'}
        </p>
        <div className="bz-form-grid">
          <label>
            {pl ? 'E-mail' : 'Email'}
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
            {error === 'credentials'
              ? pl
                ? 'Nieprawidłowy e-mail lub hasło.'
                : 'Invalid email or password.'
              : pl
                ? 'Logowanie jest chwilowo niedostępne. Spróbuj ponownie.'
                : 'Sign-in is temporarily unavailable. Try again.'}
          </p>
        )}
        <button className="a-button" disabled={busy}>
          {busy
            ? pl
              ? 'Logowanie…'
              : 'Signing in…'
            : pl
              ? 'Zaloguj'
              : 'Sign in'}
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
