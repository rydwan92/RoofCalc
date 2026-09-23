import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Building2, Home, Settings } from 'lucide-react';
import { useBusiness } from './context';
import { businessCopy } from './copy';

const AdminAssortment = lazy(() =>
  import('./admin/AdminAssortment').then((module) => ({
    default: module.AdminAssortment,
  })),
);

/**
 * The quiet header presence of Business mode (§38, §39).
 *
 * Two requirements pull against each other here. The user must always know
 * *whose prices they are looking at* — so the active wholesaler is named in
 * the header, not hidden in a settings page. But Admin must not clutter a
 * roofer's navigation — so it lives behind this secondary control rather than
 * becoming a sixth perspective beside Projekt / Wykonanie / Materiały /
 * Kosztorys / Dokumenty.
 *
 * In STANDARD mode this renders **nothing at all**: no badge, no selector, no
 * Admin entry (§65).
 */
export function BusinessHeader({ onHome }: { onHome?: () => Promise<void> }) {
  const { i18n } = useTranslation();
  const m = businessCopy(i18n.language);
  const {
    mode,
    organization,
    organizations,
    setOrganizationId,
    unavailable,
    loading,
    setHomeOpen,
    session,
    signOut,
  } = useBusiness();
  const [admin, setAdmin] = useState(false);
  const [logoutError, setLogoutError] = useState(false);

  if (mode !== 'business') return null;
  const canManage = session?.memberships
    .find((item) => item.organizationId === organization?.id)
    ?.capabilities.includes('assortment.manage');

  return (
    <div className="bz-header" data-testid="business-header">
      <Building2 size={15} aria-hidden="true" />
      <button
        type="button"
        className="bz-admin-entry"
        data-testid="business-home-entry"
        onClick={() => {
          if (onHome) void onHome();
          else setHomeOpen(true);
        }}
        title={m.salesDesk}
      >
        <Home size={15} aria-hidden="true" />
        <span>{m.salesDesk}</span>
      </button>
      <span className="bz-header-label">{m.priceListLabel}:</span>
      {unavailable ? (
        <strong data-testid="business-header-offline">{m.unavailable}</strong>
      ) : loading ? (
        <strong>{m.loading}</strong>
      ) : organizations.length > 1 ? (
        <label>
          <span className="bz-visually-hidden">{m.chooseOrganization}</span>
          <select
            value={organization?.id ?? ''}
            data-testid="business-organization-select"
            onChange={(event) => setOrganizationId(event.target.value)}
          >
            {organizations.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <strong data-testid="business-organization-name">
          {organization?.name ?? m.chooseOrganization}
        </strong>
      )}
      {canManage && (
        <button
          type="button"
          className="bz-admin-entry"
          data-testid="business-admin-entry"
          onClick={() => setAdmin(true)}
          title={m.admin}
        >
          <Settings size={15} aria-hidden="true" />
          <span>{m.admin}</span>
        </button>
      )}
      {session && (
        <button
          className="bz-admin-entry"
          onClick={() => {
            setLogoutError(false);
            void signOut?.().catch(() => setLogoutError(true));
          }}
        >
          {i18n.language.startsWith('pl') ? 'Wyloguj' : 'Sign out'} ·{' '}
          {session.user.name}
        </button>
      )}
      {logoutError && (
        <span role="alert">
          {i18n.language.startsWith('pl')
            ? 'Nie udało się wylogować. Spróbuj ponownie.'
            : 'Sign out failed. Try again.'}
        </span>
      )}
      {admin && canManage && (
        <div className="bz-admin-layer">
          <button
            className="bz-admin-backdrop"
            aria-label={m.back}
            onClick={() => setAdmin(false)}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-label={m.admin}
            className="bz-admin-dialog"
          >
            <Suspense fallback={<div className="a-loading-panel" />}>
              <AdminAssortment onClose={() => setAdmin(false)} />
            </Suspense>
          </section>
        </div>
      )}
    </div>
  );
}

/**
 * The mode switch itself. Placed with the other application preferences (unit,
 * language) rather than in the roof workbench, because it is an application
 * capability, not a project setting (§12, §14, §49).
 */
export function BusinessModeToggle() {
  const { i18n } = useTranslation();
  const m = businessCopy(i18n.language);
  const { mode, setMode } = useBusiness();
  return (
    <label className="bz-mode-toggle" data-testid="business-mode-toggle">
      <span>{m.mode}</span>
      <select
        value={mode}
        aria-label={m.mode}
        onChange={(event) =>
          setMode(event.target.value === 'business' ? 'business' : 'standard')
        }
      >
        <option value="standard">{m.standard}</option>
        <option value="business">{m.business}</option>
      </select>
    </label>
  );
}
