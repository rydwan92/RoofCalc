import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useBusiness } from '../context';
import { workspaceClient } from '../workspace/client';

export function RecentEstimations({
  customerId,
  onOpen,
}: {
  customerId?: string;
  onOpen: (id: string) => Promise<void> | void;
}) {
  const { i18n } = useTranslation(),
    pl = i18n.language.startsWith('pl');
  const { organizationId } = useBusiness();
  const [offset, setOffset] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  const query = useQuery({
    queryKey: ['business', organizationId, 'estimations', customerId, offset],
    queryFn: () =>
      workspaceClient.estimations(organizationId!, customerId, offset),
    enabled: !!organizationId,
    retry: false,
    staleTime: 0,
  });
  async function open(id: string) {
    setBusy(true);
    setError(false);
    try {
      await onOpen(id);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="bz-home-section">
      <h2>{pl ? 'Ostatnie wyceny' : 'Recent estimations'}</h2>
      {query.isError ? (
        <p role="alert">
          {pl ? 'Nie udało się pobrać wycen.' : 'Estimations unavailable.'}{' '}
          <button onClick={() => void query.refetch()}>
            {pl ? 'Spróbuj ponownie' : 'Retry'}
          </button>
        </p>
      ) : query.isPending ? (
        <p>…</p>
      ) : query.data.items.length ? (
        <ul className="bz-recent-list">
          {query.data.items.map((entry) => (
            <li key={entry.id}>
              <button disabled={busy} onClick={() => void open(entry.id)}>
                <span>
                  <strong>{entry.name}</strong>
                  <span>{entry.customerName}</span>
                  <small>
                    {new Date(entry.updatedAt).toLocaleDateString(
                      i18n.language,
                    )}{' '}
                    ·{' '}
                    {entry.quoteNumber ??
                      (pl ? 'Robocza · brak oferty' : 'Draft · no quote')}
                    {entry.missingPrices
                      ? ` · ${pl ? 'Brak cen' : 'Missing prices'}: ${entry.missingPrices}`
                      : ''}
                  </small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="bz-empty">
          {pl
            ? 'Nie masz jeszcze zapisanych wycen.'
            : 'No saved estimations yet.'}
        </p>
      )}
      {error && (
        <p role="alert">
          {pl
            ? 'Nie można otworzyć wyceny. Sprawdź zapis bieżących zmian.'
            : 'Cannot open estimation. Check pending changes.'}
        </p>
      )}
      {offset > 0 && (
        <button className="a-button" onClick={() => setOffset(offset - 30)}>
          {pl ? 'Poprzednie' : 'Previous'}
        </button>
      )}
      {query.data?.nextOffset !== undefined && (
        <button
          className="a-button"
          onClick={() => setOffset(query.data!.nextOffset!)}
        >
          {pl ? 'Następne' : 'Next'}
        </button>
      )}
    </section>
  );
}
