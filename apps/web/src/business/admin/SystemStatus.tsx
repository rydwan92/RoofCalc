import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { resolveApiBaseUrl } from '../../api-base';
import { requestJson } from '../client';

const state = z.enum(['current', 'missing', 'outdated']);
const schema = z.object({
  database: z.literal('connected'),
  migrations: z.object({ state, applied: z.number(), expected: z.number() }),
  seeds: z.object({
    catalogue: z.object({ state, current: z.number(), expected: z.number() }),
    pricing: z.object({ state, current: z.number(), expected: z.number() }),
    business: z.object({ state, current: z.number(), expected: z.number() }),
  }),
});

export function SystemStatus() {
  const { i18n } = useTranslation(),
    pl = i18n.language.startsWith('pl');
  const status = useQuery({
    queryKey: ['business', 'system-status'],
    queryFn: () =>
      requestJson(`${resolveApiBaseUrl()}/business/system/status`, schema),
    retry: false,
    staleTime: 30_000,
  });
  const label = (value: z.infer<typeof state>) =>
    value === 'current'
      ? pl
        ? 'Aktualne'
        : 'Current'
      : value === 'missing'
        ? pl
          ? 'Brak'
          : 'Missing'
        : pl
          ? 'Wymagają aktualizacji'
          : 'Needs update';
  return (
    <section className="bz-system-panel" data-testid="business-system-status">
      <h2>{pl ? 'Stan systemu' : 'System status'}</h2>
      {status.isPending && (
        <p role="status">{pl ? 'Sprawdzanie bazy…' : 'Checking database…'}</p>
      )}
      {status.isError && (
        <p role="alert">
          {pl
            ? 'Baza danych — Problem. Nie można odczytać stanu.'
            : 'Database — Problem. Could not read status.'}{' '}
          <button className="a-button" onClick={() => void status.refetch()}>
            {pl ? 'Ponów' : 'Retry'}
          </button>
        </p>
      )}
      {status.data && (
        <>
          <dl>
            <div>
              <dt>{pl ? 'Baza danych' : 'Database'}</dt>
              <dd>{pl ? 'Połączono' : 'Connected'}</dd>
            </div>
            <div>
              <dt>{pl ? 'Migracje' : 'Migrations'}</dt>
              <dd>
                {label(status.data.migrations.state)} (
                {status.data.migrations.applied}/
                {status.data.migrations.expected})
              </dd>
            </div>
            <div>
              <dt>{pl ? 'Katalog techniczny' : 'Technical catalogue'}</dt>
              <dd>
                {label(status.data.seeds.catalogue.state)} (
                {status.data.seeds.catalogue.current}/
                {status.data.seeds.catalogue.expected})
              </dd>
            </div>
            <div>
              <dt>{pl ? 'Cenniki' : 'Pricing'}</dt>
              <dd>
                {label(status.data.seeds.pricing.state)} (
                {status.data.seeds.pricing.current}/
                {status.data.seeds.pricing.expected})
              </dd>
            </div>
            <div>
              <dt>
                {pl ? 'Dane demonstracyjne hurtowni' : 'Demo wholesaler data'}
              </dt>
              <dd>
                {label(status.data.seeds.business.state)} (
                {status.data.seeds.business.current}/
                {status.data.seeds.business.expected})
              </dd>
            </div>
          </dl>
          <p>
            {pl
              ? 'To jest odczyt bazy. Aktualizacje wykonuje operator poza przeglądarką.'
              : 'This is a database readout. The operator runs updates outside the browser.'}
          </p>
        </>
      )}
    </section>
  );
}
