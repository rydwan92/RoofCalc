import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  formatLength,
  formatMetres,
  formatNumber,
  formatSquareMetres,
} from '../format';
import { ROOF_FAMILY_LABEL } from '../assembly/roof-family';
import { useAssembly } from '../assembly/store';
import { deriveProjectQuantities } from './project-quantities';
import type { ProjectSession, ProjectSessionState } from './session';
import { structureLabel } from './StructureBar';
import './structure-bar.css';

function cubicMetres(mm3: number | undefined, locale: string) {
  return mm3 === undefined
    ? '—'
    : `${formatNumber(mm3 / 1_000_000_000, locale, 3)} m³`;
}

/**
 * VNext-10E (ADR-017 §7): the quantities of a whole project of several roof
 * structures, above the material plan of the structure shown — each
 * structure's structural timber and roof area, the project's timber by
 * exact section with each structure's share. A row opens that structure.
 */
export function ProjectQuantityOverview({
  session,
  state,
}: {
  session: ProjectSession;
  state: ProjectSessionState;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const unit = useAssembly((assembly) => assembly.unit);
  // The open structure's edits re-derive the overview as they happen.
  const editedDocument = useAssembly((assembly) => assembly.projectDocument);
  const quantities = useMemo(() => {
    if (!state.structures) return undefined;
    const document = session.projectDocument();
    return document?.schemaVersion === 2
      ? deriveProjectQuantities(document)
      : undefined;
    // `editedDocument` re-derives on every edit of the open structure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, state.structures, editedDocument]);
  const structures = state.structures;
  if (!structures || !quantities) return null;
  const nameOf = (id: string) => {
    const index = structures.findIndex((structure) => structure.id === id);
    return structureLabel(structures[index] ?? {}, index, t);
  };
  const { timber } = quantities;
  // A volume without every member names how many it leaves out.
  const volume = (mm3: number | undefined, excluded: number) =>
    excluded > 0 ? (
      <>
        {cubicMetres(mm3 ?? 0, locale)}
        <small>
          {t('assembly.projectQuantities.volumeWithout', { count: excluded })}
        </small>
      </>
    ) : (
      cubicMetres(mm3, locale)
    );

  return (
    <section
      className="a-project-pricing a-project-quantities"
      data-testid="project-quantities"
      aria-label={t('assembly.projectQuantities.title')}
    >
      <header>
        <h3>{t('assembly.projectQuantities.title')}</h3>
        <p>{t('assembly.projectQuantities.hint')}</p>
      </header>
      <table>
        <thead>
          <tr>
            <th scope="col">{t('assembly.projectPricing.structure')}</th>
            <th scope="col">{t('assembly.projectQuantities.roofArea')}</th>
            <th scope="col">{t('assembly.projectQuantities.members')}</th>
            <th scope="col">{t('assembly.projectQuantities.length')}</th>
            <th scope="col">{t('assembly.projectQuantities.volume')}</th>
          </tr>
        </thead>
        <tbody>
          {quantities.structures.map((row, index) => {
            const structure = structures.find(
              (candidate) => candidate.id === row.id,
            );
            const active = row.id === state.activeStructureId;
            const name = structureLabel(structure ?? {}, index, t);
            return (
              <tr
                key={row.id}
                data-structure-id={row.id}
                aria-current={active ? 'true' : undefined}
              >
                <th scope="row">
                  <span className="a-project-pricing-name">
                    {active ? (
                      <strong>{name}</strong>
                    ) : (
                      <button
                        type="button"
                        className="a-link-button"
                        onClick={() => void session.selectStructure(row.id)}
                      >
                        {name}
                      </button>
                    )}
                    {structure && (
                      <small>{t(ROOF_FAMILY_LABEL[structure.family])}</small>
                    )}
                  </span>
                </th>
                <td>
                  {row.area
                    ? formatSquareMetres(row.area.grossMm2, locale)
                    : '—'}
                </td>
                <td>{row.timber.quantity}</td>
                <td>{formatMetres(row.timber.totalLengthMm, locale)}</td>
                <td>
                  {volume(
                    row.timber.volumeMm3,
                    row.timber.volumeExcludedQuantity,
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">{t('assembly.projectPricing.total')}</th>
            <td data-testid="project-quantities-area">
              {quantities.area
                ? formatSquareMetres(quantities.area.grossMm2, locale)
                : '—'}
            </td>
            <td data-testid="project-quantities-members">{timber.quantity}</td>
            <td>{formatMetres(timber.totalLengthMm, locale)}</td>
            <td>
              {volume(
                timber.volumeMm3,
                timber.unsectioned.reduce(
                  (sum, part) => sum + part.quantity,
                  0,
                ),
              )}
            </td>
          </tr>
        </tfoot>
      </table>
      {timber.sections.length > 0 && (
        <>
          <h4>{t('assembly.projectQuantities.bySection')}</h4>
          <table
            className="a-project-quantities-sections"
            data-testid="project-quantities-sections"
          >
            <thead>
              <tr>
                <th scope="col">{t('assembly.projectQuantities.section')}</th>
                <th scope="col">{t('assembly.projectQuantities.members')}</th>
                <th scope="col">{t('assembly.projectQuantities.length')}</th>
                <th scope="col">{t('assembly.projectQuantities.volume')}</th>
                <th scope="col">{t('assembly.projectQuantities.shares')}</th>
              </tr>
            </thead>
            <tbody>
              {timber.sections.map((row) => (
                <tr
                  key={`${row.section.widthMm}x${row.section.depthMm}`}
                  data-section={`${row.section.widthMm}x${row.section.depthMm}`}
                >
                  <th scope="row">
                    {formatLength(row.section.widthMm, unit, locale)} ×{' '}
                    {formatLength(row.section.depthMm, unit, locale)} {unit}
                  </th>
                  <td>{row.quantity}</td>
                  <td>{formatMetres(row.totalLengthMm, locale)}</td>
                  <td>{cubicMetres(row.volumeMm3, locale)}</td>
                  <td>
                    {row.parts.map((share) => (
                      <span key={share.key}>
                        {t('assembly.projectQuantities.share', {
                          name: nameOf(share.key),
                          count: share.quantity,
                        })}
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {timber.unsectioned.map((part) => (
        <p
          key={part.key}
          className="a-project-pricing-note"
          data-testid="project-quantities-unsectioned"
        >
          {t('assembly.projectQuantities.unsectioned', {
            name: nameOf(part.key),
            count: part.quantity,
          })}
        </p>
      ))}
      {timber.issueKeys.map((key) => (
        <p key={key} className="a-project-pricing-note">
          {t('assembly.projectQuantities.issues', { name: nameOf(key) })}
        </p>
      ))}
    </section>
  );
}
