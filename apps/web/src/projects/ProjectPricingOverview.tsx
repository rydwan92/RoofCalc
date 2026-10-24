import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  summarizeCostScenarioParts,
  type CostScenario,
} from '@cieslacalc/cost-core';
import { formatMoney } from '../format';
import { ROOF_FAMILY_LABEL } from '../assembly/roof-family';
import { LocalCostRepository } from './cost-repository';
import type { ProjectSession, ProjectSessionState } from './session';
import { structureLabel } from './StructureBar';
import './structure-bar.css';

/**
 * VNext-10B (ADR-017 §7): the estimate of a whole project of several roof
 * structures. Each structure keeps its own estimate (Kosztorys of the
 * structure shown); this sums them — one currency, no structure counted as
 * zero — and opens a structure's estimate on a click.
 */
export function ProjectPricingOverview({
  session,
  state,
  activeScenario,
}: {
  session: ProjectSession;
  state: ProjectSessionState;
  /** The open structure's estimate, live (not yet re-read from storage). */
  activeScenario?: CostScenario;
}) {
  const { t, i18n } = useTranslation();
  const projectId = state.active?.id;
  const structures = state.structures;
  const [stored, setStored] = useState<Record<string, CostScenario>>({});
  const ids = useMemo(
    () => structures?.map((structure) => structure.id) ?? [],
    [structures],
  );

  useEffect(() => {
    if (!projectId || !ids.length) return;
    let cancelled = false;
    void new LocalCostRepository().getMany(projectId, ids).then((rows) => {
      if (cancelled) return;
      setStored(
        Object.fromEntries(
          rows.flatMap((row) =>
            row.scenario ? [[row.structureId, row.scenario]] : [],
          ),
        ),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, ids, state.activeStructureId]);

  if (!structures || !projectId) return null;
  const scenarioOf = (id: string) =>
    id === state.activeStructureId ? activeScenario : stored[id];
  const total = summarizeCostScenarioParts(
    structures.map((structure) => {
      const scenario = scenarioOf(structure.id);
      return { key: structure.id, ...(scenario ? { scenario } : {}) };
    }),
  );
  const summaryOf = (id: string) =>
    total.summed.find((part) => part.key === id)?.summary;
  const currency = total.currencyCode;
  const money = (minor?: number) =>
    minor === undefined || !currency
      ? '—'
      : formatMoney(minor, currency, i18n.language);

  return (
    <section
      className="a-project-pricing"
      data-testid="project-pricing"
      aria-label={t('assembly.projectPricing.title')}
    >
      <header>
        <h3>{t('assembly.projectPricing.title')}</h3>
        <p>{t('assembly.projectPricing.hint')}</p>
      </header>
      <table>
        <thead>
          <tr>
            <th scope="col">{t('assembly.projectPricing.structure')}</th>
            <th scope="col">{t('assembly.projectPricing.lines')}</th>
            <th scope="col">{t('assembly.projectPricing.net')}</th>
            <th scope="col">{t('assembly.projectPricing.gross')}</th>
            <th scope="col">{t('assembly.projectPricing.state')}</th>
          </tr>
        </thead>
        <tbody>
          {structures.map((structure, index) => {
            const summary = summaryOf(structure.id);
            const missing = total.missingKeys.includes(structure.id);
            const otherCurrency = total.otherCurrencyKeys.includes(
              structure.id,
            );
            const active = structure.id === state.activeStructureId;
            return (
              <tr
                key={structure.id}
                data-structure-id={structure.id}
                aria-current={active ? 'true' : undefined}
              >
                <th scope="row">
                  <span className="a-project-pricing-name">
                    {active ? (
                      <strong>{structureLabel(structure, index, t)}</strong>
                    ) : (
                      <button
                        type="button"
                        className="a-link-button"
                        onClick={() =>
                          void session.selectStructure(structure.id)
                        }
                      >
                        {structureLabel(structure, index, t)}
                      </button>
                    )}
                    <small>{t(ROOF_FAMILY_LABEL[structure.family])}</small>
                  </span>
                </th>
                <td>{summary ? summary.includedLineCount : '—'}</td>
                <td>{money(summary?.netMinor)}</td>
                <td>{money(summary?.grossMinor)}</td>
                <td
                  data-state={
                    missing
                      ? 'missing'
                      : otherCurrency
                        ? 'currency'
                        : summary?.complete
                          ? 'complete'
                          : 'partial'
                  }
                >
                  {missing
                    ? t('assembly.projectPricing.missing')
                    : otherCurrency
                      ? t('assembly.projectPricing.otherCurrency')
                      : summary?.complete
                        ? t('assembly.projectPricing.complete')
                        : t('assembly.projectPricing.needsPrice', {
                            count: summary?.needsPriceCount ?? 0,
                          })}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">{t('assembly.projectPricing.total')}</th>
            <td>
              {total.summed.reduce(
                (sum, part) => sum + part.summary.includedLineCount,
                0,
              )}
            </td>
            <td data-testid="project-pricing-net">{money(total.netMinor)}</td>
            <td data-testid="project-pricing-gross">
              {money(total.grossMinor)}
            </td>
            <td data-state={total.complete ? 'complete' : 'partial'}>
              {total.complete
                ? t('assembly.projectPricing.complete')
                : t('assembly.projectPricing.incomplete')}
            </td>
          </tr>
        </tfoot>
      </table>
      {total.missingKeys.length > 0 && (
        <p className="a-project-pricing-note">
          {t('assembly.projectPricing.missingNote', {
            count: total.missingKeys.length,
          })}
        </p>
      )}
      {total.otherCurrencyKeys.length > 0 && (
        <p className="a-project-pricing-note">
          {t('assembly.projectPricing.currencyNote')}
        </p>
      )}
    </section>
  );
}
