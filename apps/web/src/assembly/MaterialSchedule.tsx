import { ChevronRight, Cuboid, Ruler, Shapes } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  QuantitySection,
  RoofMemberSchedule,
  RoofMemberScheduleRow,
} from '@cieslacalc/quantity-core';
import type { LengthUnit } from '@cieslacalc/roof-math';
import { formatLength } from '../format';
import { memberInstanceCode } from './workbench';
import { useAssembly } from './store';

function metres(valueMm: number, locale: string) {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(valueMm / 1000)} m`;
}

function cubicMetres(valueMm3: number | undefined, locale: string) {
  return valueMm3 === undefined
    ? '—'
    : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(valueMm3 / 1_000_000_000)} m³`;
}

function displayLength(valueMm: number, unit: LengthUnit, locale: string) {
  return `${formatLength(valueMm, unit, locale)} ${unit}`;
}

function sectionText(
  section: QuantitySection,
  unit: LengthUnit,
  locale: string,
) {
  if (section.completeness !== 'complete' || section.depthMm === undefined)
    return section.widthMm === undefined
      ? '—'
      : `${formatLength(section.widthMm, unit, locale)} ${unit} · ?`;
  return `${formatLength(section.widthMm!, unit, locale)} × ${formatLength(section.depthMm, unit, locale)} ${unit}`;
}

function sectionPresentationKey(section: QuantitySection) {
  return `${section.completeness}:${section.widthMm ?? 'unknown'}x${section.depthMm ?? 'unknown'}`;
}

function buildUpCountKey(memberKind: RoofMemberScheduleRow['memberKind']) {
  return memberKind === 'batten'
    ? 'assembly.battenRowsCount'
    : 'assembly.counterBattenAxesCount';
}

function rowName(
  row: RoofMemberScheduleRow,
  t: ReturnType<typeof useTranslation>['t'],
) {
  if (row.memberKind === 'opening-header')
    return t(
      `assembly.${row.role === 'upper' ? 'upperHeader' : 'lowerHeader'}`,
    );
  if (row.memberKind === 'rafter-segment')
    return t(
      `assembly.${row.role === 'upper' ? 'upperRafterSegment' : 'lowerRafterSegment'}`,
    );
  if (row.memberKind === 'counter-batten') return t('assembly.counterBattens');
  return t(`assembly.scheduleKind.${row.memberKind}`);
}

function instanceName(
  id: string,
  row: RoofMemberScheduleRow,
  t: ReturnType<typeof useTranslation>['t'],
) {
  if (row.memberKind === 'opening-header')
    return `${row.familyKey} · ${rowName(row, t)}`;
  if (row.memberKind === 'rafter-segment') {
    const source = /instance:(?:rafter-pair|hip-common-pair)-(\d+):/.exec(id);
    return `${source ? `K1-${source[1]!.padStart(2, '0')}` : row.familyKey} · ${rowName(row, t)}`;
  }
  return memberInstanceCode(id);
}

export function MaterialSchedule({
  schedule,
  selectedRowId,
  selectedInstanceId,
  onSelectRow,
  onSelectInstance,
}: {
  schedule: RoofMemberSchedule;
  selectedRowId?: string;
  selectedInstanceId?: string;
  onSelectRow: (row: RoofMemberScheduleRow) => void;
  onSelectInstance: (row: RoofMemberScheduleRow, instanceId: string) => void;
}) {
  const state = useAssembly();
  const { t, i18n } = useTranslation();
  const [perspective, setPerspective] = useState<'families' | 'sections'>(
    'families',
  );
  const families = useMemo(() => {
    const result = new Map<string, RoofMemberScheduleRow[]>();
    schedule.timberRows.forEach((row) =>
      result.set(row.familyKey, [...(result.get(row.familyKey) ?? []), row]),
    );
    return [...result.entries()];
  }, [schedule.timberRows]);
  const buildUpGroups = useMemo(() => {
    const result = new Map<string, RoofMemberScheduleRow[]>();
    schedule.buildUpRows.forEach((row) => {
      const key = `${row.memberKind}:${sectionPresentationKey(row.section)}`;
      result.set(key, [...(result.get(key) ?? []), row]);
    });
    return [...result.entries()].map(([id, rows]) => ({
      id,
      rows,
      quantity: rows.reduce((total, row) => total + row.quantity, 0),
      totalLengthMm: rows.reduce((total, row) => total + row.totalLengthMm, 0),
    }));
  }, [schedule.buildUpRows]);
  const volumeLabel =
    schedule.timberSummary.volumeStatus === 'complete'
      ? t('assembly.geometricVolume')
      : t('assembly.partialGeometricVolume');
  return (
    <section
      className="a-material-schedule"
      aria-label={t('assembly.memberSchedule')}
      data-testid="material-schedule"
    >
      <header className="a-schedule-heading">
        <div>
          <small>{t('assembly.geometryBased')}</small>
          <h2>{t('assembly.memberSchedule')}</h2>
        </div>
        <span>{t('assembly.scheduleCurrentAssembly')}</span>
      </header>
      <div className="a-schedule-summary">
        <article>
          <Shapes size={18} />
          <span>{t('assembly.elements')}</span>
          <strong>{schedule.timberSummary.quantity}</strong>
        </article>
        <article>
          <Ruler size={18} />
          <span>{t('assembly.totalGeometricLength')}</span>
          <strong>
            {metres(schedule.timberSummary.totalLengthMm, i18n.language)}
          </strong>
        </article>
        <article data-volume-status={schedule.timberSummary.volumeStatus}>
          <Cuboid size={18} />
          <span>{volumeLabel}</span>
          <strong>
            {cubicMetres(schedule.timberSummary.totalVolumeMm3, i18n.language)}
          </strong>
        </article>
      </div>
      <p className="a-schedule-boundary-note">
        {t('assembly.scheduleBoundaryNote')}
      </p>
      {schedule.timberSummary.volumeStatus !== 'complete' && (
        <p className="a-schedule-warning" role="note">
          {t('assembly.partialVolumeNote', {
            count: schedule.timberSummary.excludedVolumeQuantity,
          })}
        </p>
      )}
      <div
        className="a-schedule-perspective"
        role="tablist"
        aria-label={t('assembly.schedulePerspective')}
      >
        {(['families', 'sections'] as const).map((view) => (
          <button
            key={view}
            role="tab"
            aria-selected={perspective === view}
            onClick={() => setPerspective(view)}
          >
            {t(`assembly.${view}Perspective`)}
          </button>
        ))}
      </div>
      {perspective === 'families' && (
        <div className="a-schedule-families">
          {families.map(([familyKey, rows]) => (
            <section key={familyKey} className="a-schedule-family">
              <header>
                <strong>{familyKey}</strong>
                <span>{rowName(rows[0]!, t)}</span>
                <small>
                  {sectionText(rows[0]!.section, state.unit, i18n.language)} ·{' '}
                  {rows.reduce((total, row) => total + row.quantity, 0)}{' '}
                  {t('assembly.piecesShort')}
                </small>
              </header>
              {rows.map((row) => (
                <article
                  key={row.id}
                  className={selectedRowId === row.id ? 'is-selected' : ''}
                  data-testid="material-schedule-row"
                  data-row-id={row.id}
                  data-family={row.familyKey}
                  data-member-kind={row.memberKind}
                >
                  <button
                    type="button"
                    aria-pressed={selectedRowId === row.id}
                    onClick={() => onSelectRow(row)}
                  >
                    <span>
                      <b>{rowName(row, t)}</b>
                      <small>
                        {sectionText(row.section, state.unit, i18n.language)}
                      </small>
                    </span>
                    <strong>
                      {displayLength(row.lengthMm, state.unit, i18n.language)}
                    </strong>
                    <span>
                      {row.quantity} {t('assembly.piecesShort')}
                      <small>{metres(row.totalLengthMm, i18n.language)}</small>
                    </span>
                    <ChevronRight size={16} />
                  </button>
                  <details className="a-schedule-instances">
                    <summary>
                      {t('assembly.sourceMembers')} (
                      {row.sourceInstanceIds.length})
                    </summary>
                    <div>
                      {row.sourceInstanceIds.map((id) => (
                        <button
                          key={id}
                          type="button"
                          aria-pressed={selectedInstanceId === id}
                          onClick={() => onSelectInstance(row, id)}
                        >
                          {instanceName(id, row, t)}
                        </button>
                      ))}
                    </div>
                  </details>
                </article>
              ))}
            </section>
          ))}
        </div>
      )}
      {perspective === 'sections' && (
        <section className="a-section-groups">
          <header>
            <small>{t('assembly.sectionSummary')}</small>
            <h3>{t('assembly.timberBySection')}</h3>
          </header>
          <div>
            {schedule.sectionGroups.map((group) => (
              <article key={group.id}>
                <strong>
                  {sectionText(group.section, state.unit, i18n.language)}
                </strong>
                <span>{group.familyKeys.join(' · ')}</span>
                <dl>
                  <div>
                    <dt>{t('assembly.elements')}</dt>
                    <dd>{group.quantity}</dd>
                  </div>
                  <div>
                    <dt>{t('assembly.totalGeometricLength')}</dt>
                    <dd>{metres(group.totalLengthMm, i18n.language)}</dd>
                  </div>
                  <div>
                    <dt>{t('assembly.geometricVolume')}</dt>
                    <dd>{cubicMetres(group.volumeMm3, i18n.language)}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        </section>
      )}
      {(schedule.buildUpRows.length > 0 ||
        schedule.surfaceBuildUpRows.length > 0) && (
        <section
          className="a-batten-quantity"
          data-testid="batten-quantity"
          data-build-up-quantity="true"
        >
          <header>
            <small>{t('assembly.roofBuildUp')}</small>
            <h3>{t('assembly.roofLayers')}</h3>
          </header>
          <div className="a-build-up-quantity-groups">
            {schedule.surfaceBuildUpRows.map((row) => (
              <article key={row.id} className="a-build-up-surface-summary">
                <span>
                  <b>{t('assembly.membrane')}</b>
                  <small>{t('assembly.netGeometric')}</small>
                </span>
                <strong>
                  {new Intl.NumberFormat(i18n.language, {
                    maximumFractionDigits: 2,
                  }).format(row.areaMm2 / 1_000_000)}{' '}
                  m²
                </strong>
              </article>
            ))}
            {buildUpGroups.map((group) => {
              const first = group.rows[0]!;
              return (
                <article
                  key={group.id}
                  className="a-build-up-quantity-group"
                  data-testid="material-build-up-summary"
                  data-member-kind={first.memberKind}
                  data-total-length-mm={group.totalLengthMm}
                >
                  <div className="a-build-up-quantity-summary">
                    <span>
                      <b>
                        {rowName(first, t)} ·{' '}
                        {sectionText(first.section, state.unit, i18n.language)}
                      </b>
                      <small>
                        {t(buildUpCountKey(first.memberKind), {
                          count: group.quantity,
                        })}
                      </small>
                    </span>
                    <strong>
                      {metres(group.totalLengthMm, i18n.language)}
                    </strong>
                  </div>
                  <details className="a-build-up-lengths">
                    <summary>
                      {t('assembly.showExactLengths', {
                        count: group.rows.length,
                      })}
                    </summary>
                    <div>
                      {group.rows.map((row) => (
                        <button
                          key={row.id}
                          type="button"
                          className={
                            selectedRowId === row.id ? 'is-selected' : ''
                          }
                          aria-pressed={selectedRowId === row.id}
                          data-testid="material-build-up-exact-row"
                          data-row-id={row.id}
                          data-total-length-mm={row.totalLengthMm}
                          onClick={() => onSelectRow(row)}
                        >
                          <span>
                            <b>
                              {displayLength(
                                row.lengthMm,
                                state.unit,
                                i18n.language,
                              )}
                            </b>
                            <small>
                              {row.quantity} {t('assembly.piecesShort')}
                            </small>
                          </span>
                          <strong>
                            {metres(row.totalLengthMm, i18n.language)}
                          </strong>
                        </button>
                      ))}
                    </div>
                  </details>
                </article>
              );
            })}
          </div>
          <p>{t('assembly.buildUpQuantityBoundary')}</p>
        </section>
      )}
      {schedule.coveringRows.length > 0 && (
        <section
          className="a-covering-quantity"
          data-testid="covering-quantity"
        >
          <header>
            <small>{t('assembly.covering')}</small>
            <h3>{t('assembly.coveringsSchedule')}</h3>
          </header>
          <div>
            {schedule.coveringRows.map((row) => (
              <article key={row.id}>
                <span>
                  <b>
                    {t(
                      row.basis.startsWith('standing-seam')
                        ? 'assembly.standingSeam'
                        : row.basis.startsWith('cut-to-length')
                          ? 'assembly.cutToLengthSheet'
                          : row.basis.startsWith('fixed-modular-sheet')
                            ? 'assembly.modularSheet'
                            : 'assembly.roofTile',
                    )}{' '}
                    —{' '}
                    {row.productDisplay?.familyName ??
                      t(
                        row.basis.startsWith('standing-seam')
                          ? 'assembly.manualStandingSeam'
                          : row.basis.startsWith('cut-to-length')
                            ? 'assembly.manualCutToLengthSheet'
                            : row.basis.startsWith('fixed-modular-sheet')
                              ? 'assembly.manualModularSheet'
                              : 'assembly.manualRoofTile',
                      )}
                  </b>
                  <small>
                    {t(
                      row.basis.startsWith('standing-seam')
                        ? 'assembly.geometricPanelRunLayout'
                        : row.basis.startsWith('cut-to-length')
                          ? 'assembly.geometricCutSheetLayout'
                          : row.basis.startsWith('fixed-modular-sheet')
                            ? 'assembly.geometricSheetLayout'
                            : 'assembly.geometricTileLayout',
                    )}
                  </small>
                </span>
                <strong>
                  {row.basis.startsWith('standing-seam')
                    ? t('assembly.panelRunCountShort', { count: row.quantity })
                    : row.basis.startsWith('cut-to-length')
                      ? t('assembly.sheetRunCountShort', {
                          count: row.quantity,
                        })
                      : `${row.quantity} ${t('assembly.piecesShort')}`}
                </strong>
                {row.totalLengthMm !== undefined && (
                  <small>
                    {t('assembly.geometricPanelLength')}:{' '}
                    {metres(row.totalLengthMm, i18n.language)}
                  </small>
                )}
                {row.basis.startsWith('cut-to-length') &&
                  row.lengthGroups?.length && (
                    <small>
                      {t('assembly.runLengthRange')}:{' '}
                      {displayLength(
                        Math.min(
                          ...row.lengthGroups.map((group) => group.lengthMm),
                        ),
                        state.unit,
                        i18n.language,
                      )}
                      –
                      {displayLength(
                        Math.max(
                          ...row.lengthGroups.map((group) => group.lengthMm),
                        ),
                        state.unit,
                        i18n.language,
                      )}
                    </small>
                  )}
                {row.lengthGroups && row.lengthGroups.length > 0 && (
                  <details className="a-panel-lengths">
                    <summary>
                      {t('assembly.showExactLengths', {
                        count: row.lengthGroups.length,
                      })}
                    </summary>
                    <div>
                      {row.lengthGroups.map((group, index) => (
                        <span key={`${group.lengthMm}:${index}`}>
                          <b>
                            {displayLength(
                              group.lengthMm,
                              state.unit,
                              i18n.language,
                            )}
                          </b>
                          <small>× {group.quantity}</small>
                        </span>
                      ))}
                    </div>
                  </details>
                )}
                {row.totalLengthMm === undefined && (
                  <small>
                    {t('assembly.fullTiles')}: {row.fullPositions ?? 0} ·{' '}
                    {t('assembly.cutTiles')}: {row.cutPositions ?? 0}
                  </small>
                )}
                {row.netAreaMm2 !== undefined && (
                  <small>
                    {new Intl.NumberFormat(i18n.language, {
                      maximumFractionDigits: 2,
                    }).format(row.netAreaMm2 / 1_000_000)}{' '}
                    m² {t('assembly.netGeometric')}
                  </small>
                )}
                {row.declaredQuantityRange && (
                  <small>
                    {t('assembly.declaredConsumption')}:{' '}
                    {new Intl.NumberFormat(i18n.language, {
                      maximumFractionDigits: 1,
                    }).format(row.declaredQuantityRange.minimum)}
                    –
                    {new Intl.NumberFormat(i18n.language, {
                      maximumFractionDigits: 1,
                    }).format(row.declaredQuantityRange.maximum)}{' '}
                    {t('assembly.piecesShort')}
                  </small>
                )}
              </article>
            ))}
          </div>
          <p>{t('assembly.coveringQuantityBoundary')}</p>
        </section>
      )}
    </section>
  );
}

export function MaterialScheduleInspector({
  schedule,
}: {
  schedule: RoofMemberSchedule;
}) {
  const state = useAssembly();
  const { t, i18n } = useTranslation();
  const row = schedule.rows.find(
    (candidate) => candidate.id === state.workbench.selectedScheduleRowId,
  );
  return (
    <aside
      className={`a-inspector ${state.workbench.inspectorOpen ? 'is-open' : ''}`}
      aria-label={t('assembly.inspector')}
      data-testid="schedule-inspector"
    >
      <button
        className="a-inspector-heading"
        aria-expanded={state.workbench.inspectorOpen}
        onClick={() => state.setInspectorOpen(!state.workbench.inspectorOpen)}
      >
        <span>
          <small>{t('assembly.inspector')}</small>
          <strong>
            {row
              ? `${row.familyKey} · ${rowName(row, t)}`
              : t('assembly.memberSchedule')}
          </strong>
        </span>
        <span>{state.workbench.inspectorOpen ? '−' : '+'}</span>
      </button>
      {state.workbench.inspectorOpen && (
        <div className="a-inspector-body">
          <span className="a-context-badge">
            {t('assembly.scheduleContext')}
          </span>
          {row ? (
            <dl className="a-facts">
              <div>
                <dt>{t('assembly.family')}</dt>
                <dd>{row.familyKey}</dd>
              </div>
              <div>
                <dt>{t('assembly.section')}</dt>
                <dd>{sectionText(row.section, state.unit, i18n.language)}</dd>
              </div>
              <div>
                <dt>{t('assembly.geometricLength')}</dt>
                <dd>
                  {displayLength(row.lengthMm, state.unit, i18n.language)}
                </dd>
              </div>
              <div>
                <dt>{t('assembly.pieceCount')}</dt>
                <dd>{row.quantity}</dd>
              </div>
              <div>
                <dt>{t('assembly.totalGeometricLength')}</dt>
                <dd>{metres(row.totalLengthMm, i18n.language)}</dd>
              </div>
              <div>
                <dt>{t('assembly.geometricVolume')}</dt>
                <dd>{cubicMetres(row.volumeMm3, i18n.language)}</dd>
              </div>
            </dl>
          ) : (
            <p className="a-help">{t('assembly.selectScheduleRow')}</p>
          )}
          <p className="a-limit-note">{t('assembly.scheduleBoundaryNote')}</p>
        </div>
      )}
    </aside>
  );
}
