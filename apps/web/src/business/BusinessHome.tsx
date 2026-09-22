import { lazy, Suspense, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  Boxes,
  CircleDollarSign,
  Plus,
  Settings,
} from 'lucide-react';
import type { ProjectSummary } from '@cieslacalc/project-core';
import { useTranslation } from 'react-i18next';
import { businessCopy } from './copy';
import { useBusiness, type CustomerSnapshot } from './context';
import { useAssortment } from './use-assortment';

const AdminAssortment = lazy(() =>
  import('./admin/AdminAssortment').then((module) => ({
    default: module.AdminAssortment,
  })),
);

export interface NewEstimationInput {
  projectName: string;
  location?: string;
  customer: CustomerSnapshot;
}

/** Sales-desk first entry. Technical tools stay one explicit action away. */
export function BusinessHome({
  projects,
  onCreate,
  onOpenProject,
  onContinue,
}: {
  projects: readonly ProjectSummary[];
  onCreate: (input: NewEstimationInput) => Promise<void> | void;
  onOpenProject: (id: string) => Promise<void> | void;
  onContinue: () => void;
}) {
  const { i18n } = useTranslation();
  const m = businessCopy(i18n.language);
  const { organization, unavailable, estimation } = useBusiness();
  const assortment = useAssortment({ limit: 1 });
  const [creating, setCreating] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const summary = assortment.data?.summary;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const projectName = String(form.get('projectName') ?? '').trim();
    const customerName = String(form.get('customerName') ?? '').trim();
    if (!projectName || !customerName) return;
    const optional = (name: string) => {
      const value = String(form.get(name) ?? '').trim();
      return value || undefined;
    };
    setBusy(true);
    setError('');
    try {
      await onCreate({
        projectName,
        location: optional('location'),
        customer: {
          name: customerName,
          companyName: optional('companyName'),
          taxId: optional('taxId'),
          email: optional('email'),
          phone: optional('phone'),
          address: optional('address'),
        },
      });
    } catch {
      setError(m.estimationCreateFailed);
    } finally {
      setBusy(false);
    }
  }

  if (admin)
    return (
      <div className="bz-home bz-home-admin" data-testid="business-home">
        <Suspense fallback={<div className="a-loading-panel" />}>
          <AdminAssortment onClose={() => setAdmin(false)} />
        </Suspense>
      </div>
    );

  return (
    <main className="bz-home" data-testid="business-home">
      <header className="bz-home-hero">
        <div>
          <span>{m.salesDesk}</span>
          <h1>{organization?.name ?? m.business}</h1>
          <p>{m.salesDeskIntro}</p>
        </div>
        <button
          className="a-button"
          type="button"
          data-testid="business-home-continue"
          onClick={onContinue}
        >
          {estimation
            ? `${m.continueEstimation}: ${estimation.projectName}`
            : m.openTechnicalProject}
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      </header>

      {creating ? (
        <form className="bz-estimation-form" onSubmit={submit}>
          <div className="bz-section-heading">
            <div>
              <span>{m.newEstimation}</span>
              <h2>{m.customerAndProject}</h2>
            </div>
            <button
              type="button"
              className="a-button"
              onClick={() => setCreating(false)}
            >
              {m.cancel}
            </button>
          </div>
          <div className="bz-form-grid">
            <label>
              {m.customerName}
              <input
                name="customerName"
                required
                autoFocus
                placeholder={m.customerPlaceholder}
              />
            </label>
            <label>
              {m.investmentName}
              <input
                name="projectName"
                required
                placeholder={m.investmentPlaceholder}
              />
            </label>
            <label>
              {m.locationOptional}
              <input name="location" placeholder={m.locationPlaceholder} />
            </label>
          </div>
          <details className="bz-customer-details">
            <summary>{m.customerDetailsOptional}</summary>
            <div className="bz-form-grid">
              <label>
                {m.companyName}
                <input name="companyName" />
              </label>
              <label>
                {m.taxId}
                <input name="taxId" />
              </label>
              <label>
                {m.email}
                <input name="email" type="email" />
              </label>
              <label>
                {m.phone}
                <input name="phone" type="tel" />
              </label>
              <label className="bz-form-wide">
                {m.address}
                <input name="address" />
              </label>
            </div>
          </details>
          {error && <p role="alert">{error}</p>}
          <button
            className="a-button a-primary bz-create-estimation"
            disabled={busy}
          >
            {busy ? m.creatingEstimation : m.createAndOpenRoof}
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </form>
      ) : (
        <section className="bz-home-primary">
          <button
            className="bz-new-estimation"
            type="button"
            data-testid="business-new-estimation"
            onClick={() => setCreating(true)}
          >
            <Plus size={22} aria-hidden="true" />
            <span>
              <strong>{m.newRoofEstimation}</strong>
              <small>{m.newRoofEstimationHint}</small>
            </span>
          </button>
        </section>
      )}

      <div className="bz-home-grid">
        <section className="bz-home-section">
          <div className="bz-section-heading">
            <h2>{m.recent}</h2>
          </div>
          {projects.length ? (
            <ul className="bz-recent-list">
              {projects.slice(0, 5).map((project) => (
                <li key={project.id}>
                  <button
                    type="button"
                    onClick={() => void onOpenProject(project.id)}
                  >
                    <span>
                      <strong>{project.name}</strong>
                      <small>
                        {new Date(project.updatedAt).toLocaleDateString(
                          i18n.language,
                        )}
                      </small>
                    </span>
                    <ArrowRight size={16} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="bz-empty">{m.noRecentProjects}</p>
          )}
        </section>

        <section className="bz-home-section bz-home-commerce">
          <div className="bz-section-heading">
            <div>
              <Boxes size={18} aria-hidden="true" />
              <h2>{m.adminAssortment}</h2>
            </div>
            <button
              className="a-button"
              type="button"
              onClick={() => setAdmin(true)}
            >
              {m.openAssortment}
            </button>
          </div>
          {unavailable || assortment.isError ? (
            <p className="bz-unavailable">{m.unavailable}</p>
          ) : assortment.isPending ? (
            <p>{m.loading}</p>
          ) : (
            <dl className="bz-home-stats">
              <div>
                <dt>{m.countAssortment}</dt>
                <dd>{summary?.total ?? 0}</dd>
              </div>
              <div>
                <dt>{m.countUnmatched}</dt>
                <dd>{summary?.unmatched ?? 0}</dd>
              </div>
              <div>
                <dt>{m.countWithoutPrice}</dt>
                <dd>{summary?.withoutPrice ?? 0}</dd>
              </div>
            </dl>
          )}
        </section>

        <section className="bz-home-section bz-home-price-list">
          <div className="bz-section-heading">
            <div>
              <CircleDollarSign size={18} aria-hidden="true" />
              <h2>{m.priceListLabel}</h2>
            </div>
            <button
              className="a-button"
              type="button"
              onClick={() => setAdmin(true)}
            >
              <Settings size={15} aria-hidden="true" /> {m.priceListImport}
            </button>
          </div>
          <p>{m.organizationOnlyPricing}</p>
        </section>
      </div>
    </main>
  );
}
