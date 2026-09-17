import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Info,
  PencilRuler,
} from 'lucide-react';
import type {
  CoveringAssignmentSpec,
  RoofTileInstallationMode,
} from '@cieslacalc/covering-core';
import type {
  BattenLayoutResult,
  CounterBattenLayoutResult,
} from '@cieslacalc/roof-math';
import { roofPlaneIds as resolveRoofPlaneIds } from '@cieslacalc/roof-math';
import { formatLength } from '../format';
import { useAssembly } from './store';
import { SourceBadge } from './SourceBadge';
import { workbenchLocation, memberInstanceCode } from './workbench';
import type {
  BattenWorkflow,
  BattenWorkflowAction,
  CounterBattenWorkflow,
} from './batten-workflow';
import {
  battenLayerForWholeRoof,
  newBattenLayer,
  newCounterBattenLayer,
} from './build-up-defaults';
import {
  installationModeLabelKey,
  roofPlaneShortLabelKey,
} from './covering-presentation';

/**
 * V43B installation workflow surfaces.
 *
 * Pure composition of `BattenWorkflow` / `CounterBattenWorkflow` (already
 * derived from resolver output in Page). No component here calculates a
 * length, a gauge or a status of its own.
 */

export interface InstallationWorkflowFacts {
  battens: BattenWorkflow;
  counterBattens: CounterBattenWorkflow;
  /** Length the `paired-plane-runs` hip detail would add (hip roofs only). */
  hipPairedRunsPreviewMm?: number;
}

export type InstallationUiAction =
  | BattenWorkflowAction
  | 'enable-counter-battens'
  | 'choose-hip-detail'
  | 'open-details';

function useLength() {
  const { i18n } = useTranslation();
  const unit = useAssembly((state) => state.unit);
  return (valueMm: number) =>
    `${formatLength(valueMm, unit, i18n.language)} ${unit}`;
}

function useMetres() {
  const { i18n } = useTranslation();
  return (valueMm: number) =>
    `${new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }).format(valueMm / 1000)} m`;
}

/** One action vocabulary for every workflow surface; each is one history entry at most. */
export function useInstallationActions() {
  const state = useAssembly();
  return (action: InstallationUiAction, seedGaugeMm?: number) => {
    const project = state.projectDocument.project;
    const layout = project.buildUp.battenLayout;
    const openLayer = (view: 'battens' | 'counterBattens' | 'installation') => {
      state.navigateTo(workbenchLocation('layers'));
      state.setBuildUpView(view);
      // Selecting a layer inside the installation plan keeps that plan open.
      state.select(
        view === 'counterBattens' ? 'layer:counter-battens' : 'layer:battens',
      );
    };
    switch (action) {
      case 'enable-auto':
      case 'fit-auto':
        state.setBattenLayout(
          layout
            ? { ...layout, enabled: true, mode: 'auto-from-covering' }
            : newBattenLayer(),
        );
        return;
      case 'set-manual': {
        const base = layout ?? newBattenLayer();
        state.setBattenLayout({
          ...base,
          enabled: true,
          mode: 'manual',
          // A manual value is a tape-measurable intent: seed it at 0.1 mm,
          // never as 349.636363… from the whole-interval fit (V44).
          gaugeMm:
            seedGaugeMm !== undefined
              ? Math.round(seedGaugeMm * 10) / 10
              : base.gaugeMm,
        });
        openLayer('battens');
        return;
      }
      case 'fit-roof':
        state.fitInstallationToRoof();
        return;
      case 'extend-scope-to-roof':
        if (layout) state.setBattenLayout(battenLayerForWholeRoof(layout));
        return;
      case 'choose-covering':
      case 'choose-installation-mode':
        state.navigateTo(workbenchLocation('covering'));
        return;
      case 'assign-covering-to-roof': {
        const planeIds = resolveRoofPlaneIds(state.template);
        const coverings = project.coverings;
        if (coverings.length !== 1) {
          state.navigateTo(workbenchLocation('covering'));
          return;
        }
        state.setCoveringAssignments([
          { ...structuredClone(coverings[0]!), roofPlaneIds: planeIds },
        ]);
        return;
      }
      case 'enable-counter-battens':
        state.setCounterBattenLayout(
          project.buildUp.counterBattens
            ? { ...project.buildUp.counterBattens, enabled: true }
            : newCounterBattenLayer(),
        );
        return;
      case 'choose-hip-detail':
        openLayer('counterBattens');
        requestAnimationFrame(() =>
          document
            .querySelector('[data-testid="hip-boundary-detail"]')
            ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }),
        );
        return;
      case 'open-details':
        openLayer('installation');
        return;
    }
  };
}

function StateIcon({ tone }: { tone: BattenWorkflow['tone'] }) {
  if (tone === 'ready') return <CheckCircle2 size={15} aria-hidden="true" />;
  if (tone === 'off') return <CircleDashed size={15} aria-hidden="true" />;
  if (tone === 'attention') return <Info size={15} aria-hidden="true" />;
  return <AlertTriangle size={15} aria-hidden="true" />;
}

/** Owner badge: AUTO / RĘCZNIE. Never shown without a value next to it. */
export function OwnerBadge({ owner }: { owner: 'auto' | 'manual' }) {
  return <SourceBadge source={owner} />;
}

export function WorkflowActions({
  actions,
  seedGaugeMm,
  compact,
}: {
  actions: readonly InstallationUiAction[];
  seedGaugeMm?: number;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const run = useInstallationActions();
  if (!actions.length) return null;
  return (
    <div className={`a-workflow-actions ${compact ? 'is-compact' : ''}`}>
      {actions.map((action, index) => (
        <button
          key={action}
          type="button"
          className={`a-button ${index === 0 ? 'a-primary' : ''}`}
          data-workflow-action={action}
          onClick={() => run(action, seedGaugeMm)}
        >
          {t(`assembly.install.action.${action}`)}
        </button>
      ))}
    </div>
  );
}

/** "ŁATY 34,2 cm · 22 rzędy / 1 034,6 m / AUTO · zgodne z pokryciem". */
export function BattenStatusLine({ workflow }: { workflow: BattenWorkflow }) {
  const { t } = useTranslation();
  const length = useLength();
  const metres = useMetres();
  const hasRows = workflow.rowCount > 0;
  return (
    <div
      className={`a-workflow-status is-${workflow.tone}`}
      data-testid="batten-workflow-status"
      data-workflow-state={workflow.state}
      data-owner={workflow.owner}
    >
      {hasRows && (
        <p className="a-workflow-figures">
          <span className="a-figure is-lead">
            <strong data-batten-gauge>
              {workflow.gaugeMm !== undefined
                ? length(workflow.gaugeMm)
                : t('assembly.install.perPlane')}
            </strong>
            <small>{t('assembly.install.actualGauge')}</small>
          </span>
          <span className="a-figure" data-batten-rows={workflow.rowCount}>
            <b>
              {workflow.rowsPerPlane !== undefined && workflow.planeCount > 1
                ? `${t('assembly.install.rows', { count: workflow.rowsPerPlane })} ${t('assembly.install.perPlaneSuffix')}`
                : `${t('assembly.install.rows', { count: workflow.rowCount })}${workflow.planeCount > 1 ? ` ${t('assembly.install.totalSuffix')}` : ''}`}
            </b>
          </span>
          <span
            className="a-figure"
            data-batten-total-length={workflow.totalLengthMm}
          >
            <b>{metres(workflow.totalLengthMm)}</b>
            <small>{t('assembly.install.geometricLength')}</small>
          </span>
        </p>
      )}
      <p className="a-workflow-state">
        <StateIcon tone={workflow.tone} />
        {workflow.owner !== 'none' && hasRows && (
          <OwnerBadge owner={workflow.owner} />
        )}
        <span>{t(`assembly.install.state.${workflow.state}`)}</span>
      </p>
      {workflow.scope.kind === 'subset' && (
        <p className="a-workflow-scope" data-testid="batten-scope-subset">
          {t('assembly.install.scopeSubset', {
            count: workflow.scope.planeCount,
            total: workflow.scope.knownCount,
          })}
        </p>
      )}
    </div>
  );
}

export function CounterBattenStatusLine({
  workflow,
}: {
  workflow: CounterBattenWorkflow;
}) {
  const { t } = useTranslation();
  const metres = useMetres();
  return (
    <div
      className={`a-workflow-status is-${workflow.tone}`}
      data-testid="counter-batten-workflow-status"
      data-workflow-state={workflow.state}
    >
      {workflow.runCount > 0 && (
        <p className="a-workflow-figures">
          <span className="a-figure is-lead">
            <strong data-counter-batten-total-length={workflow.totalLengthMm}>
              {metres(workflow.totalLengthMm)}
            </strong>
            <small>{t('assembly.install.geometricLength')}</small>
          </span>
          <span className="a-figure">
            <b>{t('assembly.install.axes', { count: workflow.runCount })}</b>
          </span>
        </p>
      )}
      <p className="a-workflow-state">
        <StateIcon tone={workflow.tone} />
        <span>{t(`assembly.install.counter.${workflow.state}`)}</span>
        {workflow.state === 'needs-hip-detail' && (
          <small>
            {' · '}
            {t('assembly.install.counter.hips', {
              count: workflow.unresolvedHipBoundaryCount,
            })}{' '}
            {t('assembly.install.counter.hipsNeedChoice')}
          </small>
        )}
      </p>
    </div>
  );
}

/** Why a counter-batten layer is complete or partial, with the one next action. */
export function CounterBattenExplanation({
  workflow,
  hipPairedRunsPreviewMm,
}: {
  workflow: CounterBattenWorkflow;
  hipPairedRunsPreviewMm?: number;
}) {
  const { t } = useTranslation();
  const metres = useMetres();
  if (workflow.state === 'layer-off') return null;
  return (
    <section
      className="a-counter-batten-explanation"
      data-testid="counter-batten-explanation"
    >
      <p className="a-help">{t('assembly.install.counter.source')}</p>
      <dl className="a-workflow-checklist">
        <div data-check="interior">
          <dt>{t('assembly.install.counter.interior')}</dt>
          <dd className={workflow.interiorAxisCount ? 'is-ready' : ''}>
            {workflow.interiorAxisCount ? '✓ ' : ''}
            {t('assembly.install.counter.interiorReady')} ·{' '}
            {t('assembly.install.axes', { count: workflow.interiorAxisCount })}
          </dd>
        </div>
        {workflow.hipBoundaryCount > 0 && (
          <div data-check="hips">
            <dt>
              {t('assembly.install.counter.hips', {
                count: workflow.hipBoundaryCount,
              })}
            </dt>
            <dd
              className={
                workflow.unresolvedHipBoundaryCount
                  ? 'is-attention'
                  : 'is-ready'
              }
            >
              {workflow.unresolvedHipBoundaryCount
                ? t('assembly.install.counter.hipsNeedChoice')
                : `✓ ${t('assembly.install.counter.hipsDecided')}`}
            </dd>
          </div>
        )}
      </dl>
      {workflow.unresolvedHipBoundaryCount > 0 &&
        hipPairedRunsPreviewMm !== undefined && (
          <p className="a-help" data-testid="hip-detail-quantity-preview">
            {t('assembly.hipBoundary.option.no-dedicated-run.label')}:{' '}
            {t('assembly.install.counter.previewNone')} ·{' '}
            {t('assembly.hipBoundary.option.paired-plane-runs.label')}:{' '}
            {t('assembly.install.counter.preview', {
              value: metres(hipPairedRunsPreviewMm).replace(' m', ''),
            })}
          </p>
        )}
    </section>
  );
}

/**
 * Section along the slope: first batten (eave detail), regular gauge, last
 * batten (ridge detail). Schematic only — never a dimension source.
 */
export function BattenEdgeSketch() {
  const { t } = useTranslation();
  const rows = [52, 88, 124, 160, 196];
  return (
    <svg
      className="a-batten-edge-sketch"
      viewBox="0 0 260 96"
      role="img"
      aria-label={`${t('assembly.install.eaveDetail')}, ${t('assembly.install.regularGauge')}, ${t('assembly.install.ridgeDetail')}`}
    >
      <line className="sk-rafter" x1="14" y1="72" x2="246" y2="26" />
      {[18, ...rows, 232].map((x, index, all) => {
        const y = 72 - ((x - 14) * 46) / 232;
        const edge = index === 0 || index === all.length - 1;
        return (
          <rect
            key={x}
            className={edge ? 'sk-batten is-edge' : 'sk-batten'}
            x={x - 4}
            y={y - 11}
            width="8"
            height="6"
          />
        );
      })}
      <text x="8" y="92">
        {t('assembly.install.eaveDetail')}
      </text>
      <text x="96" y="92">
        {t('assembly.install.regularGauge')}
      </text>
      <text x="190" y="14">
        {t('assembly.install.ridgeDetail')}
      </text>
      <path className="sk-dim" d="M52 84 H88" />
      <path className="sk-dim" d="M88 84 H124" />
    </svg>
  );
}

/** ROZSTAW REGULARNY (owner) with DETAL OKAPU / DETAL KALENICY below. */
export function BattenReferences({ workflow }: { workflow: BattenWorkflow }) {
  const { t } = useTranslation();
  const length = useLength();
  if (workflow.owner === 'none') return null;
  const regular =
    workflow.owner === 'manual' && workflow.manualGaugeMm !== undefined
      ? length(workflow.manualGaugeMm)
      : workflow.gaugeMm !== undefined
        ? length(workflow.gaugeMm)
        : workflow.rowCount > 0
          ? t('assembly.install.perPlane')
          : '—';
  return (
    <section className="a-batten-references" data-testid="batten-references">
      <dl>
        <div
          className="is-primary"
          title={t('assembly.install.regularGaugeHint')}
        >
          <dt>{t('assembly.install.regularGauge')}</dt>
          <dd data-reference="regular">
            <strong>{regular}</strong>
            <OwnerBadge owner={workflow.owner} />
          </dd>
          {workflow.allowedRangeMm && (
            <small>
              {t('assembly.install.allowedRange', {
                min: length(workflow.allowedRangeMm.min),
                max: length(workflow.allowedRangeMm.max),
              })}
            </small>
          )}
          {workflow.fixedSupportGaugeMm !== undefined && (
            <small>
              {t('assembly.install.fixedModule', {
                value: length(workflow.fixedSupportGaugeMm),
              })}
            </small>
          )}
        </div>
        <div title={t('assembly.install.eaveDetailHint')}>
          <dt>{t('assembly.install.eaveDetail')}</dt>
          <dd data-reference="eave">
            {length(workflow.eaveReferenceMm ?? 0)}
            <OwnerBadge owner="manual" />
          </dd>
        </div>
        <div title={t('assembly.install.ridgeDetailHint')}>
          <dt>{t('assembly.install.ridgeDetail')}</dt>
          <dd data-reference="ridge">
            {length(workflow.ridgeReferenceMm ?? 0)}
            <OwnerBadge owner="manual" />
          </dd>
        </div>
      </dl>
      <details className="a-layer-help">
        <summary>
          <PencilRuler size={14} aria-hidden="true" />{' '}
          {t('assembly.install.eaveDetail')} ·{' '}
          {t('assembly.install.regularGauge')} ·{' '}
          {t('assembly.install.ridgeDetail')}
        </summary>
        <BattenEdgeSketch />
        <p>{t('assembly.install.eaveDetailHint')}</p>
        <p>{t('assembly.install.regularGaugeHint')}</p>
        <p>{t('assembly.install.ridgeDetailHint')}</p>
      </details>
    </section>
  );
}

function modeLabel(
  t: (key: string, options?: Record<string, unknown>) => string,
  mode: RoofTileInstallationMode,
) {
  return mode.id === 'standard' || mode.id === 'manual-standard'
    ? t('assembly.install.modeStandard')
    : t(installationModeLabelKey(mode.id), { id: mode.id });
}

/**
 * MONTAŻ POKRYCIA — the compact block in Pokrycie. Composition only: product,
 * installation mode, pitch, battens and counter-battens as already derived.
 */
export function CoveringInstallationBlock({
  assignment,
  facts,
}: {
  assignment: CoveringAssignmentSpec;
  facts: InstallationWorkflowFacts;
}) {
  const { t } = useTranslation();
  const state = useAssembly();
  const run = useInstallationActions();
  const battens = facts.battens;
  const counter = facts.counterBattens;
  const spec = assignment.product.technicalSpecSnapshot;
  const modes = spec.kind === 'roof-tile' ? spec.installationModes : [];
  const label =
    assignment.product.displaySnapshot?.familyName ??
    assignment.product.displaySnapshot?.manufacturer ??
    t('assembly.roofTile');
  const batteActions: BattenWorkflowAction[] = battens.actions.filter(
    (action) =>
      action !== 'choose-covering' && action !== 'choose-installation-mode',
  );
  return (
    <section
      className="a-installation-block"
      data-testid="covering-installation-block"
      aria-label={t('assembly.install.title')}
    >
      <header>
        <small>{t('assembly.install.title')}</small>
        <strong>{label}</strong>
      </header>
      <dl className="a-installation-rows">
        {spec.kind === 'roof-tile' && (
          <div data-row="mode">
            <dt>{t('assembly.install.installationMode')}</dt>
            <dd>
              {modes.length > 1 ? (
                <select
                  aria-label={t('assembly.install.installationMode')}
                  data-testid="installation-mode-select"
                  value={assignment.selectedInstallationModeId ?? ''}
                  onChange={(event) => {
                    const next = structuredClone(assignment);
                    next.selectedInstallationModeId =
                      event.currentTarget.value || undefined;
                    state.setCoveringAssignments(
                      state.projectDocument.project.coverings.map((item) =>
                        item.id === next.id ? next : item,
                      ),
                    );
                  }}
                >
                  <option value="">{t('assembly.install.modeChoose')}</option>
                  {modes.map((mode) => (
                    <option key={mode.id} value={mode.id}>
                      {modeLabel(t, mode)}
                    </option>
                  ))}
                </select>
              ) : modes[0] ? (
                modeLabel(t, modes[0])
              ) : (
                '—'
              )}
            </dd>
          </div>
        )}
        <div data-row="pitch" data-pitch-status={battens.pitch.status}>
          <dt>{t('assembly.install.pitch')}</dt>
          <dd>
            {battens.pitch.actualDeg}°{' '}
            {battens.pitch.status === 'compatible' ? (
              <span className="is-ready">
                ✓{' '}
                {t('assembly.install.pitchMinimum', {
                  value: battens.pitch.minimumDeg,
                })}
              </span>
            ) : battens.pitch.status === 'below-minimum' ? (
              <span className="is-blocked">
                {t('assembly.install.pitchBelow', {
                  value: battens.pitch.minimumDeg,
                })}
              </span>
            ) : (
              <span className="is-muted">
                {t('assembly.install.pitchUnknown')}
              </span>
            )}
          </dd>
        </div>
        <div data-row="battens">
          <dt>{t('assembly.install.battens')}</dt>
          <dd>
            <BattenStatusLine workflow={battens} />
            {battens.state === 'manual-incompatible' &&
              battens.allowedRangeMm &&
              battens.manualGaugeMm !== undefined && (
                <ManualMismatch workflow={battens} />
              )}
            <WorkflowActions
              compact
              actions={batteActions}
              seedGaugeMm={battens.gaugeMm}
            />
          </dd>
        </div>
        {(battens.capability?.usesStructureDerivedCounterBattens ?? true) && (
          <div data-row="counter-battens">
            <dt>{t('assembly.install.counterBattens')}</dt>
            <dd>
              <CounterBattenStatusLine workflow={counter} />
              <WorkflowActions
                compact
                actions={
                  counter.state === 'layer-off'
                    ? ['enable-counter-battens']
                    : counter.state === 'needs-hip-detail'
                      ? ['choose-hip-detail']
                      : []
                }
              />
            </dd>
          </div>
        )}
      </dl>
      <footer>
        <button
          type="button"
          className="a-button"
          data-testid="open-installation-details"
          onClick={() => run('open-details')}
        >
          {t('assembly.install.details')}
        </button>
        <small>{t('assembly.install.notPurchase')}</small>
      </footer>
    </section>
  );
}

export function ManualMismatch({ workflow }: { workflow: BattenWorkflow }) {
  const { t } = useTranslation();
  const length = useLength();
  if (!workflow.allowedRangeMm || workflow.manualGaugeMm === undefined)
    return null;
  return (
    <p className="a-workflow-mismatch" data-testid="manual-gauge-mismatch">
      {t('assembly.install.stateHelp.manual-incompatible', {
        gauge: length(workflow.manualGaugeMm),
        min: length(workflow.allowedRangeMm.min),
        max: length(workflow.allowedRangeMm.max),
      })}
    </p>
  );
}

/** Headline block at the top of the batten Inspector. */
export function BattenWorkflowPanel({
  workflow,
}: {
  workflow: BattenWorkflow;
}) {
  const { t } = useTranslation();
  const help = [
    'awaiting-covering',
    'awaiting-covering-scope',
    'awaiting-installation-mode',
    'unsupported-support-model',
    'manual-unverified',
    'auto-incompatible',
  ].includes(workflow.state)
    ? t(`assembly.install.stateHelp.${workflow.state}`)
    : undefined;
  return (
    <section
      className="a-batten-workflow-panel"
      data-testid="batten-workflow-panel"
    >
      <BattenStatusLine workflow={workflow} />
      {help && <p className="a-help">{help}</p>}
      {workflow.state === 'manual-incompatible' && (
        <ManualMismatch workflow={workflow} />
      )}
      <WorkflowActions
        actions={workflow.actions.filter((action) => action !== 'fit-auto')}
        seedGaugeMm={workflow.gaugeMm}
      />
    </section>
  );
}

/** Details of one clicked batten row, from resolver output only. */
export function BattenRowDetail({
  result,
  rowId,
  workflow,
}: {
  result: BattenLayoutResult;
  rowId: string;
  workflow: BattenWorkflow;
}) {
  const { t } = useTranslation();
  const length = useLength();
  const row = result.battens.find((candidate) => candidate.id === rowId);
  if (!row) return null;
  const plane = result.planes.find(
    (candidate) => candidate.roofPlaneId === row.roofPlaneId,
  );
  const stations = plane?.stations ?? [];
  const index = row.rowNumber - 1;
  const minV = (plane?.firstStationMm ?? 0) - (workflow.eaveReferenceMm ?? 0);
  const previous = index > 0 ? row.stationMm - stations[index - 1]! : undefined;
  const next =
    index < stations.length - 1
      ? stations[index + 1]! - row.stationMm
      : undefined;
  return (
    <section className="a-batten-row-detail" data-testid="batten-row-detail">
      <h4>{t('assembly.install.row.title', { number: row.rowNumber })}</h4>
      <dl>
        <div>
          <dt>{t('assembly.install.row.plane')}</dt>
          <dd>{t(roofPlaneShortLabelKey(row.roofPlaneId))}</dd>
        </div>
        <div>
          <dt>{t('assembly.install.row.number')}</dt>
          <dd data-row-number>
            {row.rowNumber} / {stations.length}
            {index === 0 && (
              <small> · {t('assembly.install.row.firstRow')}</small>
            )}
            {index === stations.length - 1 && index > 0 && (
              <small> · {t('assembly.install.row.lastRow')}</small>
            )}
          </dd>
        </div>
        <div>
          <dt>{t('assembly.install.row.fromEave')}</dt>
          <dd data-row-from-eave>{length(row.stationMm - minV)}</dd>
        </div>
        <div>
          <dt>{t('assembly.install.row.previous')}</dt>
          <dd>{previous !== undefined ? length(previous) : '—'}</dd>
        </div>
        <div>
          <dt>{t('assembly.install.row.next')}</dt>
          <dd>{next !== undefined ? length(next) : '—'}</dd>
        </div>
        <div>
          <dt>{t('assembly.install.row.visible')}</dt>
          <dd data-row-visible-length>{length(row.usableLengthMm)}</dd>
        </div>
        <div>
          <dt>{t('assembly.install.row.source')}</dt>
          <dd>
            {workflow.owner !== 'none' && <OwnerBadge owner={workflow.owner} />}{' '}
            {t(`assembly.install.state.${workflow.state}`)}
          </dd>
        </div>
      </dl>
      {row.segments.length > 1 && (
        <details className="a-layer-help">
          <summary>
            {t('assembly.install.row.openings')}: {row.segments.length - 1}
          </summary>
          <ol>
            {row.segments.map((segment, segmentIndex) => (
              <li key={`${segment.fromUMm}:${segment.toUMm}`}>
                {t('assembly.segment')} {segmentIndex + 1}:{' '}
                {length(segment.toUMm - segment.fromUMm)}
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}

/** Details of one clicked counter-batten run. */
export function CounterBattenAxisDetail({
  result,
  rowId,
}: {
  result: CounterBattenLayoutResult;
  rowId: string;
}) {
  const { t } = useTranslation();
  const length = useLength();
  const row = result.rows.find((candidate) => candidate.id === rowId);
  if (!row) return null;
  const code = memberInstanceCode(row.sourceMemberId);
  return (
    <section
      className="a-batten-row-detail"
      data-testid="counter-batten-axis-detail"
    >
      <h4>{t('assembly.install.axis.title', { code })}</h4>
      <dl>
        <div>
          <dt>{t('assembly.install.axis.sourceMember')}</dt>
          <dd>{code}</dd>
        </div>
        <div>
          <dt>{t('assembly.install.axis.plane')}</dt>
          <dd>{t(roofPlaneShortLabelKey(row.roofPlaneId))}</dd>
        </div>
        <div>
          <dt>{t('assembly.install.axis.visible')}</dt>
          <dd data-axis-visible-length>{length(row.visibleLengthMm)}</dd>
        </div>
        <div>
          <dt>{t('assembly.install.axis.interruptions')}</dt>
          <dd>{Math.max(0, row.segments.length - 1)}</dd>
        </div>
        <div>
          <dt>{t('assembly.install.axis.type')}</dt>
          <dd data-axis-role={row.role}>
            {t(
              row.role === 'hip-boundary-run'
                ? 'assembly.install.axis.boundary'
                : 'assembly.install.axis.interior',
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}

/** Compact legend + toggles for the composite installation plan. */
export function InstallationLegend() {
  const { t } = useTranslation();
  const state = useAssembly();
  const visibility = state.workbench.layerVisibility;
  return (
    <div
      className="a-installation-legend"
      data-testid="installation-legend"
      aria-label={t('assembly.install.legend.title')}
    >
      {(
        [
          ['covering', 'covering'],
          ['battens', 'battens'],
          ['counterBattens', 'counterBattens'],
        ] as const
      ).map(([layer, label]) => (
        <label key={layer} data-legend={layer}>
          <input
            type="checkbox"
            checked={visibility[layer]}
            onChange={(event) =>
              state.setLayerVisibility(layer, event.target.checked)
            }
          />
          <i aria-hidden="true" className={`sw-${layer}`} />
          {t(`assembly.install.legend.${label}`)}
        </label>
      ))}
    </div>
  );
}
