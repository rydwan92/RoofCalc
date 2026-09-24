import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useBusiness } from '../context';
import { sessionClient } from './client';
import { BusinessClientError } from '../client';

const errors: Record<string, [string, string]> = {
  'invalid-credentials': [
    'Nieprawidłowy e-mail lub hasło.',
    'Invalid email or password.',
  ],
  'auth-not-configured': [
    'Logowanie RoofCalc Business nie zostało jeszcze skonfigurowane.',
    'RoofCalc Business sign-in is not configured yet.',
  ],
  'database-unavailable': [
    'Nie można połączyć się z bazą RoofCalc Business.',
    'Cannot connect to the RoofCalc Business database.',
  ],
  'bootstrap-invalid-token': [
    'Nieprawidłowy kod konfiguracji.',
    'Invalid setup code.',
  ],
  'bootstrap-closed': [
    'Pierwsze konto zostało już utworzone.',
    'The first account has already been created.',
  ],
  'bootstrap-rate-limited': [
    'Zbyt wiele prób. Spróbuj ponownie za minutę.',
    'Too many attempts. Try again in a minute.',
  ],
  'bootstrap-organization-ambiguous': [
    'W bazie jest więcej niż jedna firma. Wymagana jest konfiguracja przez operatora.',
    'Multiple companies exist. Operator setup is required.',
  ],
  'bootstrap-invalid-request': [
    'Sprawdź dane i hasło (12–128 znaków).',
    'Check the fields and password (12–128 characters).',
  ],
};

export function BusinessLogin() {
  const { i18n } = useTranslation(),
    pl = i18n.language.startsWith('pl');
  const business = useBusiness();
  const setup = useQuery({
    queryKey: ['business', 'setup-status'],
    queryFn: sessionClient.setupStatus,
    retry: false,
  });
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const state = setup.data;
  const unavailable = setup.isError || state?.database === 'unavailable';
  const authMissing = state?.auth === 'unconfigured';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(undefined);
    try {
      if (creating) {
        await sessionClient.bootstrap({
          name: String(form.get('name')).trim(),
          email: String(form.get('email')).trim().toLowerCase(),
          password: String(form.get('password')),
          confirmPassword: String(form.get('confirmPassword')),
          token: String(form.get('token')),
          ...(state?.organization === 'new'
            ? { companyName: String(form.get('companyName')).trim() }
            : {}),
        });
        setCreating(false);
        await setup.refetch();
      } else {
        await sessionClient.signIn(
          String(form.get('email')).trim().toLowerCase(),
          String(form.get('password')),
        );
        await business.retry?.();
      }
    } catch (failure) {
      const code =
        failure instanceof BusinessClientError
          ? failure.code
          : 'business-unavailable';
      setError(
        (errors[code] ?? [
          'Usługa jest chwilowo niedostępna.',
          'The service is temporarily unavailable.',
        ])[pl ? 0 : 1],
      );
      if (code === 'bootstrap-closed') await setup.refetch();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="bz-home bz-login">
      <form
        className="bz-estimation-form"
        onSubmit={(event) => void submit(event)}
        data-testid="business-login"
      >
        <span className="bz-login-brand">ROOFCALC BUSINESS</span>
        <h1>
          {creating
            ? pl
              ? 'Pierwsza konfiguracja RoofCalc Business'
              : 'First RoofCalc Business setup'
            : pl
              ? 'Zaloguj się do hurtowni'
              : 'Sign in to your company'}
        </h1>
        {setup.isPending ? (
          <p role="status">
            {pl
              ? 'Sprawdzanie konfiguracji serwera…'
              : 'Checking server setup…'}
          </p>
        ) : unavailable || authMissing ? (
          <p role="alert">
            {unavailable
              ? pl
                ? 'Nie można połączyć się z bazą danych RoofCalc Business.'
                : 'Cannot connect to the RoofCalc Business database.'
              : pl
                ? 'RoofCalc Business wymaga dokończenia konfiguracji serwera.'
                : 'RoofCalc Business requires server configuration.'}
          </p>
        ) : creating ? (
          <p>
            {pl
              ? 'Utwórz pierwsze konto administratora.'
              : 'Create the first administrator account.'}
          </p>
        ) : state?.firstOwner === 'unknown' ? (
          <p role="alert">
            {pl
              ? 'Baza jest połączona, ale stan kont nie jest dostępny. Operator musi sprawdzić migracje.'
              : 'Database connected, but account status is unavailable. The operator must check migrations.'}
          </p>
        ) : state?.firstOwner === 'required' ? (
          <p>
            {pl
              ? 'Nie utworzono jeszcze konta administratora.'
              : 'No administrator account has been created yet.'}
          </p>
        ) : (
          <p>
            {pl
              ? 'Zaloguj się do przestrzeni swojej firmy.'
              : 'Sign in to your company workspace.'}
          </p>
        )}
        {state?.firstOwner === 'required' &&
          state.bootstrap === 'unavailable' &&
          !unavailable &&
          !authMissing && (
            <p role="alert">
              {state.organization === 'ambiguous'
                ? pl
                  ? 'W bazie jest więcej niż jedna firma. Poproś operatora o konfigurację konta.'
                  : 'Multiple companies exist. Ask the operator to provision the first account.'
                : pl
                  ? 'Pierwsza konfiguracja w przeglądarce jest niedostępna. Skontaktuj się z operatorem.'
                  : 'Browser setup is unavailable. Contact the operator.'}
            </p>
          )}
        {!unavailable &&
          !authMissing &&
          (creating || state?.firstOwner === 'configured') && (
            <div className="bz-form-grid">
              {creating && (
                <label>
                  {pl ? 'Imię i nazwisko' : 'Full name'}
                  <input
                    name="name"
                    autoComplete="name"
                    required
                    maxLength={240}
                  />
                </label>
              )}
              <label>
                {pl ? 'E-mail' : 'Email'}
                <input
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                />
              </label>
              <label>
                {pl ? 'Hasło' : 'Password'}
                <input
                  name="password"
                  type="password"
                  autoComplete={creating ? 'new-password' : 'current-password'}
                  minLength={creating ? 12 : undefined}
                  required
                />
              </label>
              {creating && (
                <>
                  <label>
                    {pl ? 'Powtórz hasło' : 'Confirm password'}
                    <input
                      name="confirmPassword"
                      type="password"
                      autoComplete="new-password"
                      minLength={12}
                      required
                    />
                  </label>
                  {state?.organization === 'new' && (
                    <label>
                      {pl ? 'Nazwa firmy' : 'Company name'}
                      <input name="companyName" required maxLength={240} />
                    </label>
                  )}
                  <label>
                    {pl ? 'Kod konfiguracji' : 'Setup code'}
                    <input
                      name="token"
                      type="password"
                      autoComplete="off"
                      required
                    />
                  </label>
                </>
              )}
            </div>
          )}
        {error && <p role="alert">{error}</p>}
        {!unavailable &&
          !authMissing &&
          (creating || state?.firstOwner === 'configured') && (
            <button className="a-button a-primary" disabled={busy}>
              {busy
                ? pl
                  ? 'Proszę czekać…'
                  : 'Please wait…'
                : creating
                  ? pl
                    ? 'Utwórz konto właściciela'
                    : 'Create owner account'
                  : pl
                    ? 'Zaloguj'
                    : 'Sign in'}
            </button>
          )}
        {!creating &&
          state?.bootstrap === 'available' &&
          !unavailable &&
          !authMissing && (
            <button
              className="a-button a-primary"
              type="button"
              onClick={() => {
                setError(undefined);
                setCreating(true);
              }}
            >
              {pl ? 'Skonfiguruj pierwsze konto' : 'Set up first account'}
            </button>
          )}
        {creating && (
          <button
            className="a-button"
            type="button"
            onClick={() => setCreating(false)}
          >
            {pl ? 'Wróć do logowania' : 'Back to sign in'}
          </button>
        )}
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
