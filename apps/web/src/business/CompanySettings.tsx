import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { organizationProfileSchema } from '@cieslacalc/business-core';
import { useBusiness } from './context';
import { workspaceClient } from './workspace/client';

export function CompanyLogo({ url, name }: { url?: string; name: string }) {
  const [failedUrl, setFailedUrl] = useState<string>();
  if (!url || failedUrl === url) return null;
  return (
    <img
      className="bz-company-logo"
      src={url}
      alt={name}
      referrerPolicy="no-referrer"
      onError={() => setFailedUrl(url)}
    />
  );
}

export function CompanySettings() {
  const { i18n } = useTranslation(),
    pl = i18n.language.startsWith('pl');
  const business = useBusiness(),
    organization = business.organization!;
  const cache = useQueryClient();
  const [logo, setLogo] = useState(organization.logoUrl ?? '');
  const [status, setStatus] = useState<
    'idle' | 'saving' | 'saved' | 'error' | 'invalid'
  >('idle');
  const allowed = business.session?.memberships
    .find((item) => item.organizationId === organization.id)
    ?.capabilities.includes('organization.manage');
  if (!allowed) return null;
  return (
    <form
      className="bz-company-settings"
      data-testid="company-settings"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const parsed = organizationProfileSchema.safeParse({
          ...Object.fromEntries(form),
          defaultValidityDays: Number(form.get('defaultValidityDays')),
        });
        if (!parsed.success) {
          setStatus('invalid');
          return;
        }
        setStatus('saving');
        try {
          await workspaceClient.updateOrganizationProfile(
            organization.id,
            parsed.data,
          );
          await cache.invalidateQueries({ queryKey: ['business'] });
          setStatus('saved');
        } catch {
          setStatus('error');
        }
      }}
    >
      <h2>{pl ? 'Ustawienia firmy' : 'Company settings'}</h2>
      <p>
        {pl
          ? 'Dane zostaną użyte w nowych ofertach. Zapisane oferty zachowują dotychczasowe dane firmy.'
          : 'Used for new quotes. Saved quotes retain their existing company details.'}
      </p>
      <h3>{pl ? 'Dane firmy' : 'Company details'}</h3>
      <div className="bz-form-grid">
        {(
          [
            ['name', pl ? 'Nazwa firmy' : 'Company name', 'text', 240],
            ['taxId', 'NIP', 'text', 64],
            ['address', pl ? 'Adres' : 'Address', 'text', 400],
            ['phone', pl ? 'Telefon' : 'Phone', 'tel', 64],
            ['email', 'E-mail', 'email', 254],
            ['website', 'WWW', 'url', 2048],
          ] as const
        ).map(([key, label, type, maxLength]) => (
          <label key={key}>
            {label}
            <input
              name={key}
              type={type}
              required={key === 'name'}
              maxLength={maxLength}
              defaultValue={organization[key] ?? ''}
              onChange={() => setStatus('idle')}
            />
          </label>
        ))}
        <label>
          {pl ? 'Logo — adres URL' : 'Logo URL'}
          <input
            name="logoUrl"
            type="url"
            maxLength={2048}
            value={logo}
            onChange={(e) => {
              setLogo(e.target.value);
              setStatus('idle');
            }}
          />
        </label>
        <CompanyLogo url={logo} name={organization.name} />
      </div>
      <h3>{pl ? 'Ustawienia ofert' : 'Quote defaults'}</h3>
      <div className="bz-form-grid">
        <label>
          {pl ? 'Domyślna ważność (dni)' : 'Default validity (days)'}
          <input
            name="defaultValidityDays"
            type="number"
            required
            min={1}
            max={365}
            defaultValue={organization.defaultValidityDays ?? 14}
            onChange={() => setStatus('idle')}
          />
        </label>
        <label className="bz-form-wide">
          {pl ? 'Stopka / warunki' : 'Footer / terms'}
          <textarea
            name="offerFooter"
            rows={5}
            maxLength={16000}
            defaultValue={organization.offerFooter ?? ''}
            onChange={() => setStatus('idle')}
          />
        </label>
      </div>
      <div className="bz-section-heading">
        <button className="a-button a-primary" disabled={status === 'saving'}>
          {pl ? 'Zapisz' : 'Save'}
        </button>
        <span
          role={status === 'error' || status === 'invalid' ? 'alert' : 'status'}
        >
          {status === 'saved'
            ? pl
              ? 'Zapisano ustawienia firmy.'
              : 'Company settings saved.'
            : status === 'saving'
              ? pl
                ? 'Zapisywanie…'
                : 'Saving…'
              : status === 'invalid'
                ? pl
                  ? 'Sprawdź dane, adresy URL i liczbę dni.'
                  : 'Check fields, URLs and validity days.'
                : status === 'error'
                  ? pl
                    ? 'Nie udało się zapisać. Spróbuj ponownie.'
                    : 'Save failed. Try again.'
                  : ''}
        </span>
      </div>
    </form>
  );
}
