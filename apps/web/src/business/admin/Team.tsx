import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { BusinessRole, TeamUser } from '@cieslacalc/business-core';
import { useBusiness } from '../context';
import { useDebouncedValue } from '../use-assortment';
import { workspaceClient } from '../workspace/client';

export function Team() {
  const { i18n } = useTranslation(),
    pl = i18n.language.startsWith('pl');
  const business = useBusiness(),
    org = business.organizationId!;
  const owner =
    business.session?.memberships.find((item) => item.organizationId === org)
      ?.role === 'owner';
  const cache = useQueryClient();
  const [search, setSearch] = useState(''),
    q = useDebouncedValue(search);
  const [offset, setOffset] = useState(0),
    [creating, setCreating] = useState(false),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(''),
    [result, setResult] = useState<{
      status: string;
      temporaryPassword?: string;
    }>();
  const query = useQuery({
    queryKey: ['business', org, 'users', q, offset],
    queryFn: () => workspaceClient.team(org, q, offset),
    retry: false,
  });
  const labels: Record<BusinessRole, string> = pl
    ? { owner: 'Właściciel', admin: 'Administrator', sales: 'Sprzedawca' }
    : { owner: 'Owner', admin: 'Administrator', sales: 'Salesperson' };
  const showError = (cause: unknown) =>
    setError(
      cause instanceof Error && cause.message.includes('last-owner-required')
        ? pl
          ? 'Firma musi mieć co najmniej jednego aktywnego właściciela.'
          : 'Keep at least one active organization owner.'
        : cause instanceof Error &&
            cause.message.includes('owner-management-required')
          ? pl
            ? 'Tylko właściciel może zmieniać dostęp właścicieli.'
            : 'Only an owner can manage owners.'
          : pl
            ? 'Nie udało się zapisać. Sprawdź dane i spróbuj ponownie.'
            : 'Save failed. Check the fields and try again.',
    );
  async function update(user: TeamUser, role: BusinessRole, active: boolean) {
    setBusy(true);
    setError('');
    try {
      await workspaceClient.changeTeamUser(org, user.id, { role, active });
      await cache.invalidateQueries({ queryKey: ['business'] });
    } catch (cause) {
      showError(cause);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="bz-team" data-testid="business-team">
      <div className="bz-section-heading">
        <h2>{pl ? 'Użytkownicy' : 'Users'}</h2>
        <button
          className="a-button a-primary"
          onClick={() => {
            setCreating(true);
            setResult(undefined);
          }}
        >
          {pl ? '+ Dodaj użytkownika' : '+ Add user'}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {result && (
        <section className="bz-team-result" role="status">
          <strong>
            {result.status === 'user-created'
              ? pl
                ? 'Użytkownik utworzony.'
                : 'User created.'
              : result.status === 'membership-added'
                ? pl
                  ? 'Dodano dostęp do firmy. Użytkownik loguje się dotychczasowym hasłem.'
                  : 'Company access added. The user keeps their existing password.'
                : pl
                  ? 'Ten użytkownik już należy do firmy. Jego dane logowania pozostają bez zmian.'
                  : 'This user already belongs to the company. Credentials remain unchanged.'}
          </strong>
          {result.temporaryPassword && (
            <>
              <label>
                {pl
                  ? 'Hasło tymczasowe — widoczne tylko teraz'
                  : 'Temporary password — available only now'}
                <input
                  type="text"
                  readOnly
                  autoComplete="off"
                  value={result.temporaryPassword}
                />
              </label>
              <button
                className="a-button"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(result.temporaryPassword!)
                    .catch(showError)
                }
              >
                {pl ? 'Kopiuj' : 'Copy'}
              </button>
            </>
          )}
          <button className="a-button" onClick={() => setResult(undefined)}>
            {pl ? 'Zamknij' : 'Close'}
          </button>
        </section>
      )}
      {creating && (
        <form
          className="bz-team-create"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            setBusy(true);
            setError('');
            try {
              const response = await workspaceClient.createTeamUser(org, {
                name: String(form.get('name')),
                email: String(form.get('email')),
                role: String(form.get('role')) as BusinessRole,
              });
              setResult(response);
              setCreating(false);
              await cache.invalidateQueries({
                queryKey: ['business', org, 'users'],
              });
            } catch (cause) {
              showError(cause);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            {pl ? 'Imię i nazwisko' : 'Full name'}
            <input name="name" required maxLength={240} />
          </label>
          <label>
            E-mail
            <input
              name="email"
              type="email"
              required
              maxLength={254}
              autoComplete="off"
            />
          </label>
          <label>
            {pl ? 'Rola' : 'Role'}
            <select name="role" defaultValue="sales">
              {(
                [
                  'sales',
                  'admin',
                  ...(owner ? ['owner'] : []),
                ] as BusinessRole[]
              ).map((role) => (
                <option key={role} value={role}>
                  {labels[role]}
                </option>
              ))}
            </select>
          </label>
          <button className="a-button a-primary" disabled={busy}>
            {pl ? 'Utwórz i wygeneruj hasło' : 'Create and generate password'}
          </button>
          <button
            type="button"
            className="a-button"
            onClick={() => setCreating(false)}
          >
            {pl ? 'Anuluj' : 'Cancel'}
          </button>
        </form>
      )}
      <label>
        {pl ? 'Szukaj użytkownika' : 'Search users'}
        <input
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setOffset(0);
          }}
        />
      </label>
      {query.isError ? (
        <p role="alert">
          {pl
            ? 'Lista użytkowników jest niedostępna.'
            : 'User list unavailable.'}
          <button onClick={() => void query.refetch()}>
            {pl ? 'Ponów' : 'Retry'}
          </button>
        </p>
      ) : query.isPending ? (
        <p>…</p>
      ) : (
        <>
          <div className="bz-desk-table-wrap">
            <table className="bz-desk-table">
              <thead>
                <tr>
                  <th>{pl ? 'Imię i nazwisko' : 'Name'}</th>
                  <th>E-mail</th>
                  <th>{pl ? 'Rola' : 'Role'}</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((user) => (
                  <tr key={user.id}>
                    <td>{user.name}</td>
                    <td>{user.email}</td>
                    <td>
                      <select
                        aria-label={`${pl ? 'Rola' : 'Role'} ${user.name}`}
                        value={user.role}
                        disabled={busy || (!owner && user.role === 'owner')}
                        onChange={(e) =>
                          void update(
                            user,
                            e.target.value as BusinessRole,
                            user.active,
                          )
                        }
                      >
                        {(
                          [
                            'sales',
                            'admin',
                            ...(owner || user.role === 'owner'
                              ? ['owner']
                              : []),
                          ] as BusinessRole[]
                        ).map((role) => (
                          <option key={role} value={role}>
                            {labels[role]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      {user.active
                        ? pl
                          ? 'Aktywny'
                          : 'Active'
                        : pl
                          ? 'Nieaktywny'
                          : 'Inactive'}
                    </td>
                    <td>
                      <button
                        className="a-button"
                        disabled={busy || (!owner && user.role === 'owner')}
                        onClick={() =>
                          void update(user, user.role, !user.active)
                        }
                      >
                        {user.active
                          ? pl
                            ? 'Dezaktywuj dostęp'
                            : 'Disable access'
                          : pl
                            ? 'Aktywuj dostęp'
                            : 'Enable access'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!query.data.items.length && (
            <p>
              {pl
                ? 'Brak użytkowników pasujących do wyszukiwania.'
                : 'No users match your search.'}
            </p>
          )}
          <div className="bz-section-heading">
            <button
              disabled={!offset}
              onClick={() => setOffset(Math.max(0, offset - 50))}
            >
              {pl ? 'Poprzedni' : 'Previous'}
            </button>
            <button
              disabled={query.data.nextOffset === undefined}
              onClick={() => setOffset(query.data.nextOffset!)}
            >
              {pl ? 'Następni' : 'Next'}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
