import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useBusiness } from '../context';
import { useAssortment } from '../use-assortment';
import { workspaceClient } from '../workspace/client';
import { CompanySettings } from '../CompanySettings';
import { AdminAssortment } from './AdminAssortment';
import { Team } from './Team';

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
  const [tab, setTab] = useState<'company' | 'team' | 'assortment'>('company');
  const capabilities =
    business.session?.memberships.find(
      (item) => item.organizationId === business.organizationId,
    )?.capabilities ?? [];
  if (
    !capabilities.includes('organization.manage') &&
    !capabilities.includes('assortment.manage')
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
          {tab === 'company' ? (
            <CompanySettings key={business.organizationId} />
          ) : tab === 'team' ? (
            <Team key={business.organizationId} />
          ) : (
            <AdminAssortment onClose={onClose} />
          )}
        </div>
      </div>
    </main>
  );
}
