import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProjectSummary } from '@cieslacalc/project-core';
import type { BusinessCustomer } from '@cieslacalc/business-core';
import { businessCopy } from './copy';
import { useBusiness, type CustomerSnapshot } from './context';
import { useAssortment } from './use-assortment';
import { BusinessLogin } from './auth/BusinessLogin';
import { Customers } from './customers/Customers';
import { NewEstimationForm } from './estimations/NewEstimationForm';
import { RecentEstimations } from './estimations/RecentEstimations';
import { EstimationDesk } from './estimations/EstimationDesk';
import { CompanySettings } from './CompanySettings';

const AdminAssortment = lazy(() =>
  import('./admin/AdminAssortment').then((module) => ({
    default: module.AdminAssortment,
  })),
);
export interface NewEstimationInput {
  projectName: string;
  location?: string;
  customer: CustomerSnapshot;
  customerId?: string;
}

export function BusinessHome({
  onCreate,
  onOpenProject,
  onContinue,
}: {
  projects?: readonly ProjectSummary[];
  onCreate: (input: NewEstimationInput) => Promise<void> | void;
  onOpenProject: (id: string) => Promise<void> | void;
  onContinue: () => void;
}) {
  const { i18n } = useTranslation(),
    pl = i18n.language.startsWith('pl'),
    m = businessCopy(i18n.language);
  const business = useBusiness();
  const { organization, unavailable, estimation } = business;
  const assortment = useAssortment({ limit: 1 });
  const [screen, setScreen] = useState<
    'home' | 'new' | 'customers' | 'admin' | 'estimations' | 'settings'
  >('home');
  const [customer, setCustomer] = useState<BusinessCustomer>();
  const capabilities =
    business.session?.memberships.find(
      (item) => item.organizationId === organization?.id,
    )?.capabilities ?? [];
  const canManage = capabilities.includes('assortment.manage');
  const canManageOrganization = capabilities.includes('organization.manage');
  if (business.authenticationRequired) return <BusinessLogin />;
  if (business.loading)
    return (
      <main className="bz-home" aria-busy="true">
        {m.loading}
      </main>
    );
  if (unavailable)
    return (
      <main className="bz-home">
        <p role="alert">
          {pl
            ? 'Nie udało się połączyć z danymi firmy. Kalkulatory techniczne nadal działają.'
            : 'Company data could not be reached. Technical calculators still work.'}
        </p>
        <button className="a-button" onClick={() => void business.retry?.()}>
          {pl ? 'Spróbuj ponownie' : 'Retry'}
        </button>
        <button
          className="a-button"
          data-testid="business-home-continue"
          onClick={onContinue}
        >
          {m.openTechnicalProject}
        </button>
        <button
          className="a-button"
          onClick={() => business.setMode('standard')}
        >
          Standard
        </button>
      </main>
    );
  if (!organization)
    return (
      <main className="bz-home">
        <p>
          {pl
            ? 'Konto nie ma aktywnego członkostwa w firmie. Skontaktuj się z administratorem.'
            : 'No active organization membership. Contact your administrator.'}
        </p>
        <button className="a-button" onClick={() => void business.signOut?.()}>
          {pl ? 'Wyloguj' : 'Sign out'}
        </button>
      </main>
    );
  if (screen === 'admin' && canManage)
    return (
      <div className="bz-home bz-home-admin">
        <Suspense fallback={<p>…</p>}>
          <AdminAssortment onClose={() => setScreen('home')} />
        </Suspense>
      </div>
    );
  return (
    <main className="bz-home" data-testid="business-home">
      <header className="bz-home-hero">
        <div>
          <span>ROOFCALC BUSINESS</span>
          <h1>{organization.name}</h1>
          <p>
            {pl
              ? 'Klienci, wyceny i oferty Twojej firmy.'
              : 'Your company customers, estimations and quotes.'}
          </p>
        </div>
        <button
          className="a-button"
          data-testid="business-home-continue"
          onClick={onContinue}
        >
          {estimation
            ? `${m.continueEstimation}: ${estimation.projectName}`
            : m.openTechnicalProject}
        </button>
      </header>
      <nav
        className="bz-sales-nav"
        aria-label={pl ? 'Pulpit sprzedaży' : 'Sales desk'}
      >
        {(
          [
            ['home', pl ? 'Strona główna' : 'Home'],
            ['customers', pl ? 'Klienci' : 'Customers'],
            ['estimations', pl ? 'Wyceny' : 'Estimations'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            aria-current={screen === value ? 'page' : undefined}
            onClick={() => setScreen(value)}
          >
            {label}
          </button>
        ))}
        {canManage && (
          <button
            className="bz-sales-secondary"
            onClick={() => setScreen('admin')}
          >
            {pl ? 'Asortyment i cennik' : 'Assortment and prices'}
          </button>
        )}
      </nav>
      {canManageOrganization && (
        <div className="bz-sales-settings-link">
          <button
            className="bz-back-link"
            onClick={() => setScreen('settings')}
          >
            {pl ? 'Ustawienia firmy' : 'Company settings'}
          </button>
        </div>
      )}
      {screen === 'settings' && canManageOrganization ? (
        <CompanySettings key={organization.id} />
      ) : screen === 'estimations' ? (
        <EstimationDesk
          key={organization.id}
          onOpen={onOpenProject}
          onNew={() => {
            setCustomer(undefined);
            setScreen('new');
          }}
        />
      ) : screen === 'customers' ? (
        <Customers
          onClose={() => setScreen('home')}
          onNewEstimation={(selected) => {
            setCustomer(selected);
            setScreen('new');
          }}
          onOpenEstimation={onOpenProject}
        />
      ) : screen === 'new' ? (
        <NewEstimationForm
          customer={customer}
          onCreate={onCreate}
          onCancel={() => setScreen('home')}
        />
      ) : (
        <>
          <section className="bz-section-heading">
            <button
              className="bz-new-estimation"
              data-testid="business-new-estimation"
              onClick={() => {
                setCustomer(undefined);
                setScreen('new');
              }}
            >
              <span>
                <strong>+ {pl ? 'Nowa wycena' : 'New estimation'}</strong>
                <small>{m.newRoofEstimationHint}</small>
              </span>
            </button>
          </section>
          <div className="bz-home-grid">
            <RecentEstimations onOpen={onOpenProject} />
            <section className="bz-home-section">
              <div className="bz-section-heading">
                <h2>{pl ? 'Wymaga uwagi' : 'Needs attention'}</h2>
                {canManage && (
                  <button
                    className="a-button"
                    onClick={() => setScreen('admin')}
                  >
                    {m.openAssortment}
                  </button>
                )}
              </div>
              {assortment.isError ? (
                <p role="alert">
                  {m.unavailable}{' '}
                  <button onClick={() => void assortment.refetch()}>
                    {pl ? 'Spróbuj ponownie' : 'Retry'}
                  </button>
                </p>
              ) : assortment.isPending ? (
                <p>{m.loading}</p>
              ) : (
                <dl className="bz-home-stats">
                  <div>
                    <dt>{m.countAssortment}</dt>
                    <dd>{assortment.data.summary.total}</dd>
                  </div>
                  <div>
                    <dt>{m.countUnmatched}</dt>
                    <dd>{assortment.data.summary.unmatched}</dd>
                  </div>
                  <div>
                    <dt>{m.countWithoutPrice}</dt>
                    <dd>{assortment.data.summary.withoutPrice}</dd>
                  </div>
                </dl>
              )}
            </section>
          </div>
          <nav
            className="bz-home-shortcuts"
            aria-label={pl ? 'Narzędzia hurtowni' : 'Business tools'}
          >
            <button onClick={() => setScreen('customers')}>
              <strong>{pl ? 'Klienci' : 'Customers'}</strong>
              <span>
                {pl
                  ? 'Dane kontaktowe i wyceny klientów'
                  : 'Contact details and customer estimations'}
              </span>
              <b>{pl ? 'Otwórz →' : 'Open →'}</b>
            </button>
            <button onClick={() => setScreen('estimations')}>
              <strong>{pl ? 'Wszystkie wyceny' : 'All estimations'}</strong>
              <span>
                {pl
                  ? 'Wyszukiwanie, warianty i porównanie ofert'
                  : 'Search, variants and quote comparison'}
              </span>
              <b>{pl ? 'Otwórz →' : 'Open →'}</b>
            </button>
          </nav>
        </>
      )}
    </main>
  );
}
