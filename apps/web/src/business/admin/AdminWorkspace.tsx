import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useBusiness } from '../context';
import type { AssortmentFilter } from '@cieslacalc/business-core';
import { useAssortment } from '../use-assortment';
import { workspaceClient } from '../workspace/client';
import { CompanySettings } from '../CompanySettings';
import { AdminAssortment } from './AdminAssortment';
import { Team } from './Team';
import { PricingWorkspace } from './PricingWorkspace';
import { SystemStatus } from './SystemStatus';

export function SetupStatus({ onContinue }: { onContinue: () => void }) {
  const { i18n } = useTranslation(),
    pl = i18n.language.startsWith('pl');
  const { organization: org, session } = useBusiness();
  const allowed = !!session?.memberships
    .find((item) => item.organizationId === org?.id)
    ?.capabilities.includes('users.manage');
  const team = useQuery({
    queryKey: ['business', org?.id, 'users', '', 0],
    queryFn: () => workspaceClient.team(org!.id),
    enabled: allowed,
    retry: false,
  });
  const assortment = useAssortment({ limit: 1 });
  if (!allowed || !org || !team.data || !assortment.data) return null;
  const summary = assortment.data.summary;
  const steps = [
    [
      pl ? 'Dane firmy' : 'Company details',
      !!(org.name && org.taxId && org.address),
    ],
    [pl ? 'Użytkownicy' : 'Users', team.data.activeUsers > 0],
    [pl ? 'Asortyment' : 'Assortment', summary.total > 0],
    [
      pl ? 'Cennik' : 'Prices',
      summary.total - summary.inactive - summary.withoutPrice > 0,
    ],
  ] as const;
  if (steps.every(([, ready]) => ready)) return null;
  return (
    <section className="bz-setup" data-testid="business-setup">
      <strong>{pl ? 'Przygotuj hurtownię' : 'Set up your company'}</strong>
      <ul>
        {steps.map(([label, ready]) => (
          <li key={label}>
            {ready ? '✓' : '○'} {label}
          </li>
        ))}
      </ul>
      <button className="a-button" onClick={onContinue}>
        {pl ? 'Kontynuuj konfigurację' : 'Continue setup'}
      </button>
    </section>
  );
}
export function AdminWorkspace({ onClose }: { onClose: () => void }) {
  const { i18n } = useTranslation(),
    pl = i18n.language.startsWith('pl');
  const business = useBusiness();
  const capabilities =
    business.session?.memberships.find(
      (item) => item.organizationId === business.organizationId,
    )?.capabilities ?? [];
  const [tab, setTab] = useState<AdminTab>(
    capabilities.includes('assortment.manage')
      ? 'overview'
      : capabilities.includes('organization.manage')
        ? 'company'
        : 'pricing',
  );
  const [assortmentFilter, setAssortmentFilter] =
    useState<AssortmentFilter>('all');
  const [assortmentPanel, setAssortmentPanel] = useState<
    'template' | 'import'
  >();
  const openAssortment = (
    filter: AssortmentFilter,
    panel?: 'template' | 'import',
  ) => {
    setAssortmentFilter(filter);
    setAssortmentPanel(panel);
    setTab('assortment');
  };
  if (
    !capabilities.includes('organization.manage') &&
    !capabilities.includes('assortment.manage') &&
    !capabilities.includes('prices.manage')
  )
    return null;
  return (
    <main className="bz-admin-workspace" data-testid="admin-workspace">
      <header className="bz-section-heading">
        <div>
          <h1>{pl ? 'Administracja hurtowni' : 'Wholesale administration'}</h1>
          <p>{business.organization?.name}</p>
        </div>
        <button className="a-button" onClick={onClose}>
          ← {pl ? 'Sprzedaż' : 'Sales'}
        </button>
      </header>
      <SetupStatus onContinue={() => setTab('company')} />
      <div className="bz-admin-layout">
        <nav
          aria-label={pl ? 'Administracja hurtowni' : 'Company administration'}
        >
          {(
            [
              ['overview', pl ? 'Przegląd' : 'Overview', 'assortment.manage'],
              [
                'company',
                pl ? 'Dane firmy' : 'Company details',
                'organization.manage',
              ],
              ['team', pl ? 'Użytkownicy' : 'Users', 'users.manage'],
              [
                'assortment',
                pl ? 'Asortyment' : 'Assortment',
                'assortment.manage',
              ],
              ['pricing', pl ? 'Cennik' : 'Pricing', 'prices.manage'],
              [
                'quality',
                pl ? 'Jakość danych' : 'Data quality',
                'assortment.manage',
              ],
              ['system', pl ? 'Stan systemu' : 'System status', 'users.manage'],
            ] as const
          )
            .filter(([, , capability]) => capabilities.includes(capability))
            .map(([value, label]) => (
              <button
                key={value}
                aria-current={tab === value ? 'page' : undefined}
                onClick={() => setTab(value)}
              >
                {label}
              </button>
            ))}
        </nav>
        <div className="bz-admin-content">
          {tab === 'overview' ? (
            <AdminOverview
              capabilities={capabilities}
              onOpen={setTab}
              onAssortment={openAssortment}
            />
          ) : tab === 'company' ? (
            <CompanySettings key={business.organizationId} />
          ) : tab === 'team' ? (
            <Team key={business.organizationId} />
          ) : tab === 'quality' ? (
            <DataQuality onOpen={openAssortment} />
          ) : tab === 'system' ? (
            <SystemStatus />
          ) : tab === 'pricing' ? (
            <PricingWorkspace />
          ) : (
            <AdminAssortment
              key={`${assortmentFilter}:${assortmentPanel ?? ''}`}
              onClose={onClose}
              initialFilter={assortmentFilter}
              {...(assortmentPanel ? { initialPanel: assortmentPanel } : {})}
            />
          )}
        </div>
      </div>
    </main>
  );
}

type AdminTab =
  | 'overview'
  | 'company'
  | 'team'
  | 'assortment'
  | 'pricing'
  | 'quality'
  | 'system';

/**
 * VNext-4: the administration landing page — what is set up, what needs
 * attention right now, and one click to each fix. Counts come from the
 * same assortment summary as the lists; nothing is computed here.
 */
function AdminOverview({
  capabilities,
  onOpen,
  onAssortment,
}: {
  capabilities: readonly string[];
  onOpen: (tab: AdminTab) => void;
  onAssortment: (
    filter: AssortmentFilter,
    panel?: 'template' | 'import',
  ) => void;
}) {
  const { i18n } = useTranslation();
  const pl = i18n.language.startsWith('pl');
  const { organization: org } = useBusiness();
  const assortment = useAssortment({ limit: 1 });
  const summary = assortment.data?.summary;
  const canUsers = capabilities.includes('users.manage');
  const canCompany = capabilities.includes('organization.manage');
  const team = useQuery({
    queryKey: ['business', org?.id, 'users', '', 0],
    queryFn: () => workspaceClient.team(org!.id),
    enabled: canUsers && !!org,
    retry: false,
  });
  const company = !!(org?.name && org.taxId && org.address);
  const active = summary ? summary.total - summary.inactive : undefined;
  const attention = summary
    ? summary.withoutPrice + summary.withoutVat + summary.unmatched
    : undefined;
  const number = (value: number | undefined) =>
    value === undefined ? '—' : String(value);
  /**
   * VNext-11: a problem with nothing to fix says so — no disabled button
   * for a count of zero.
   */
  const fix = (
    count: number | undefined,
    label: string,
    onClick: () => void,
  ) =>
    count === 0 ? (
      <p className="bz-overview-ok">✓ {pl ? 'W porządku' : 'All good'}</p>
    ) : (
      <button
        type="button"
        className="a-button"
        disabled={count === undefined}
        onClick={onClick}
      >
        {label}
      </button>
    );
  return (
    <section className="bz-overview" data-testid="admin-overview">
      <header>
        <h2>{pl ? 'Przegląd hurtowni' : 'Wholesale overview'}</h2>
        <p>
          {attention === 0
            ? pl
              ? 'Wszystko gotowe do wycen — asortyment ma ceny i powiązania z katalogiem.'
              : 'Ready for estimates — the assortment has prices and catalogue links.'
            : pl
              ? 'Co wymaga uwagi, żeby wyceny miały ceny i dane techniczne z katalogu.'
              : 'What needs attention so estimates get prices and catalogue data.'}
        </p>
      </header>
      {assortment.isError && (
        <p role="alert">{pl ? 'Dane niedostępne' : 'Data unavailable'}</p>
      )}
      <div className="bz-overview-grid">
        <article>
          <small>{pl ? 'Asortyment' : 'Assortment'}</small>
          <strong data-testid="overview-assortment">{number(active)}</strong>
          <span>
            {pl ? 'aktywnych pozycji' : 'active items'}
            {summary?.inactive
              ? ` · ${summary.inactive} ${pl ? 'nieaktywnych' : 'inactive'}`
              : ''}
          </span>
          <button
            type="button"
            className="a-button"
            onClick={() => onAssortment('all')}
          >
            {pl ? 'Otwórz asortyment' : 'Open assortment'}
          </button>
        </article>
        <article data-tone={summary?.withoutPrice ? 'warn' : 'ok'}>
          <small>{pl ? 'Bez ceny' : 'Without price'}</small>
          <strong data-testid="overview-without-price">
            {number(summary?.withoutPrice)}
          </strong>
          <span>
            {pl
              ? 'aktywne pozycje — w wycenie pokażą „brak ceny”'
              : 'active items — estimates show “no price”'}
          </span>
          {fix(
            summary?.withoutPrice,
            pl ? 'Uzupełnij ceny' : 'Add prices',
            () => onAssortment('without-price'),
          )}
        </article>
        <article data-tone={summary?.withoutVat ? 'warn' : 'ok'}>
          <small>{pl ? 'Bez stawki VAT' : 'Without VAT rate'}</small>
          <strong>{number(summary?.withoutVat)}</strong>
          <span>
            {pl ? 'oferta nie pokaże ceny brutto' : 'offers cannot show gross'}
          </span>
          {fix(summary?.withoutVat, pl ? 'Ustaw VAT' : 'Set VAT', () =>
            onAssortment('without-vat'),
          )}
        </article>
        <article data-tone={summary?.unmatched ? 'warn' : 'ok'}>
          <small>
            {pl ? 'Bez powiązania z katalogiem' : 'Not linked to catalogue'}
          </small>
          <strong>{number(summary?.unmatched)}</strong>
          <span>
            {pl
              ? 'bez danych technicznych RoofCalc (wymiary, krycie)'
              : 'without RoofCalc technical data'}
          </span>
          {fix(summary?.unmatched, pl ? 'Powiąż' : 'Link', () =>
            onAssortment('unmatched'),
          )}
        </article>
        {canUsers && (
          <article>
            <small>{pl ? 'Zespół' : 'Team'}</small>
            <strong>{number(team.data?.activeUsers)}</strong>
            <span>{pl ? 'aktywnych użytkowników' : 'active users'}</span>
            <button
              type="button"
              className="a-button"
              onClick={() => onOpen('team')}
            >
              {pl ? 'Zarządzaj' : 'Manage'}
            </button>
          </article>
        )}
        {canCompany && (
          <article data-tone={company ? 'ok' : 'warn'}>
            <small>{pl ? 'Dane firmy' : 'Company details'}</small>
            <strong>{company ? '✓' : '!'}</strong>
            <span>
              {company
                ? pl
                  ? 'na ofertach i dokumentach'
                  : 'on offers and documents'
                : pl
                  ? 'uzupełnij NIP i adres — trafią na oferty'
                  : 'add the tax ID and address for offers'}
            </span>
            <button
              type="button"
              className="a-button"
              onClick={() => onOpen('company')}
            >
              {pl ? 'Edytuj' : 'Edit'}
            </button>
          </article>
        )}
      </div>
      <section
        className="bz-overview-actions"
        aria-label={pl ? 'Szybkie akcje' : 'Quick actions'}
      >
        <h3>{pl ? 'Szybkie akcje' : 'Quick actions'}</h3>
        <div>
          {capabilities.includes('prices.manage') && (
            <button
              type="button"
              className="a-button a-primary"
              onClick={() => onOpen('pricing')}
            >
              {pl ? 'Aktualizuj ceny z CSV' : 'Update prices from CSV'}
            </button>
          )}
          <button
            type="button"
            className="a-button"
            data-testid="overview-template"
            onClick={() => onAssortment('all', 'template')}
          >
            {pl
              ? 'Szablon asortymentu z katalogu'
              : 'Assortment template from catalogue'}
          </button>
          <button
            type="button"
            className="a-button"
            onClick={() => onAssortment('all', 'import')}
          >
            {pl ? 'Importuj asortyment (CSV)' : 'Import assortment (CSV)'}
          </button>
        </div>
      </section>
    </section>
  );
}

function DataQuality({
  onOpen,
}: {
  onOpen: (filter: AssortmentFilter) => void;
}) {
  const { i18n } = useTranslation();
  const pl = i18n.language.startsWith('pl');
  const assortment = useAssortment({ limit: 1 });
  const summary = assortment.data?.summary;
  return (
    <section className="bz-quality" data-testid="admin-quality-workspace">
      <h2>{pl ? 'Jakość danych' : 'Data quality'}</h2>
      {assortment.isError && (
        <p role="alert">{pl ? 'Dane niedostępne' : 'Data unavailable'}</p>
      )}
      <p>
        {summary?.total ?? '—'} {pl ? 'produktów' : 'products'}
      </p>
      <div>
        <span>
          ✓ {summary?.matched ?? '—'} {pl ? 'powiązanych' : 'matched'}
        </span>
        <button type="button" onClick={() => onOpen('without-price')}>
          ⚠ {summary?.withoutPrice ?? '—'} {pl ? 'bez ceny' : 'without price'}
        </button>
        <button type="button" onClick={() => onOpen('without-vat')}>
          ⚠ {summary?.withoutVat ?? '—'} {pl ? 'bez VAT' : 'without VAT'}
        </button>
        <button type="button" onClick={() => onOpen('unmatched')}>
          ⚠ {summary?.unmatched ?? '—'} {pl ? 'niepowiązanych' : 'unmatched'}
        </button>
        <span>
          {summary?.inactive ?? '—'} {pl ? 'nieaktywnych' : 'inactive'}
        </span>
      </div>
    </section>
  );
}
