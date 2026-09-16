import { lazy, Suspense, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  MemberInstanceContext,
  RoofFabricationPackage,
} from '@cieslacalc/calculator-core';
import type { DetailPreviewModel } from '@cieslacalc/drawing-engine';
import {
  COLLAR_TIE_PROTOTYPE_ID,
  HIP_RAFTER_PROTOTYPE_ID,
  JACK_RAFTER_PROTOTYPE_ID,
  createOpeningFramingDraft,
  distributeRoofWindowsAlongEave,
  resolveOpeningFraming,
  resolveRoofFeatureCollisions,
  resolveNearestRoofWindowBay,
  roofPlaneIds,
  toMillimetres,
  type BattenLayoutResult,
  type CounterBattenLayoutResult,
  type RoofWindowAlignmentMode,
  type RoofSurfaceGeometryResult,
} from '@cieslacalc/roof-math';
import {
  membraneTechnicalSpecSchema,
  type MembraneTechnicalSpec,
} from '@cieslacalc/covering-core';
import type {
  ResolvedHipRafter,
  ResolvedRafterSpacing,
  RoofSkeleton,
  RoofWindowFeature,
} from '@cieslacalc/timber-model';
import { entityLabel } from './Canvas';
import { roofPlaneShortLabelKey } from './covering-presentation';
import { editableLength, formatLength, parseDecimal } from '../format';
import {
  CollarTieInputs,
  GeometryInputs,
  HipTimberInputs,
  NumberField,
  RidgeConnectionSelector,
  RoofTypeSelector,
  StructureSystemSelector,
  SupportInputs,
  TemplateInputs,
  TimberInputs,
  type Calculation,
} from './Inputs';
import { HipBoundaryDetailChooser } from './HipBoundaryDetail';
import { MemberInstanceInspector } from './MemberInstanceInspector';
import type { WorkbenchSelectionContext } from './selection';
import { useAssembly } from './store';
import {
  disabledBattenLayer,
  disabledCounterBattenLayer,
} from './build-up-defaults';
import { SpacingSummary } from './Summary';
import { memberInstanceCode } from './workbench';
import {
  BattenAutoRepair,
  BattenInstallationDetails,
} from './BattenInstallation';
import {
  evaluateBattenInstallation,
  uniformBattenGauge,
} from './batten-installation';
import type { BattenAutoComposition } from './batten-composition';
import type { BattenWorkflow } from './batten-workflow';
import {
  BattenReferences,
  BattenRowDetail,
  BattenWorkflowPanel,
  CounterBattenAxisDetail,
  CounterBattenExplanation,
  CounterBattenStatusLine,
  WorkflowActions,
  type InstallationWorkflowFacts,
} from './InstallationWorkflow';

const MembraneProductPicker = lazy(() =>
  import('../catalog/MembraneProductPicker').then((module) => ({
    default: module.MembraneProductPicker,
  })),
);

export function Inspector({
  result,
  hip,
  skeleton,
  context,
  spacingEntries,
  detailPreviews,
  activeInstance,
  roofPackage,
  surfaceGeometry,
  battens,
  battenAutoComposition,
  counterBattens,
  installation,
}: {
  result: Calculation | null;
  hip?: ResolvedHipRafter;
  skeleton: RoofSkeleton;
  context: WorkbenchSelectionContext;
  spacingEntries: {
    spacing: ResolvedRafterSpacing;
    stationLabelKey: 'rafterPairs' | 'spacingAxes';
    headingKey?: 'commonRafterRegionSpacing' | 'jackRafterRegionSpacing';
  }[];
  detailPreviews: DetailPreviewModel[];
  activeInstance?: MemberInstanceContext;
  roofPackage: RoofFabricationPackage;
  surfaceGeometry: RoofSurfaceGeometryResult;
  battens: BattenLayoutResult;
  battenAutoComposition: BattenAutoComposition;
  counterBattens: CounterBattenLayoutResult;
  installation: InstallationWorkflowFacts;
}) {
  const state = useAssembly();
  const { t } = useTranslation();
  const workbench = state.workbench;
  const support = state.spec.supports.find(
    (candidate) =>
      candidate.id === workbench.selectedId ||
      `joint:${candidate.id}` === workbench.selectedId,
  );
  const isRafter =
    workbench.selectedId === state.spec.member.id ||
    workbench.selectedPrototypeId === state.spec.member.id;
  const isHip =
    workbench.selectedId === HIP_RAFTER_PROTOTYPE_ID ||
    workbench.selectedPrototypeId === HIP_RAFTER_PROTOTYPE_ID;
  const isJack =
    workbench.selectedId === JACK_RAFTER_PROTOTYPE_ID ||
    workbench.selectedPrototypeId === JACK_RAFTER_PROTOTYPE_ID;
  const isCollarTie =
    workbench.selectedId.endsWith(':collar-tie') ||
    workbench.selectedPrototypeId === COLLAR_TIE_PROTOTYPE_ID;
  const roofWindow = state.projectDocument.project.features.find(
    (feature): feature is RoofWindowFeature =>
      feature.id === workbench.selectedId && feature.kind === 'roof-window',
  );
  const selectedRoofWindows = state.projectDocument.project.features.filter(
    (feature): feature is RoofWindowFeature =>
      feature.kind === 'roof-window' &&
      workbench.selectedFeatureIds.includes(feature.id),
  );
  return (
    <aside
      className={`a-inspector ${workbench.inspectorOpen ? 'is-open' : ''}`}
      aria-label={t('assembly.inspector')}
    >
      <button
        className="a-inspector-heading"
        aria-expanded={workbench.inspectorOpen}
        onClick={() => state.setInspectorOpen(!workbench.inspectorOpen)}
      >
        <span>
          <small>{t('assembly.inspector')}</small>
          <strong>
            {selectedRoofWindows.length > 1
              ? t('assembly.selectedWindows', {
                  count: selectedRoofWindows.length,
                })
              : entityLabel(workbench.selectedId, state, t)}
          </strong>
        </span>
        <span>{workbench.inspectorOpen ? '−' : '+'}</span>
      </button>
      {workbench.inspectorOpen && (
        <div className="a-inspector-body">
          <span className="a-context-badge">
            {t(`assembly.${context.kind}Context`)}
          </span>
          {activeInstance && (
            <MemberInstanceInspector
              instance={activeInstance}
              skeleton={skeleton}
              roofPackage={roofPackage}
            />
          )}
          {workbench.selectedId === 'roof' && (
            <>
              <RoofTypeSelector context="roof" />
              {state.template.type === 'gable' && <StructureSystemSelector />}
              <section className="a-inspector-group is-primary">
                <h3>{t('assembly.mainParameters')}</h3>
                <GeometryInputs />
              </section>
              <TemplateInputs />
              <section className="a-inspector-group is-result">
                <h3>{t('assembly.result')}</h3>
                {spacingEntries.map((entry) => (
                  <SpacingSummary
                    key={`${entry.headingKey ?? 'gable'}:${entry.spacing.mode}`}
                    spacing={entry.spacing}
                    stationLabelKey={entry.stationLabelKey}
                    headingKey={entry.headingKey}
                  />
                ))}
              </section>
              <details className="a-inspector-advanced">
                <summary>{t('assembly.advanced')}</summary>
                <div>
                  <h3>K1 · {t('assembly.commonRafter')}</h3>
                  <TimberInputs />
                  {state.template.type === 'hip' && (
                    <>
                      <h3>H1 · {t('assembly.hipRafter')}</h3>
                      <HipTimberInputs />
                    </>
                  )}
                  {state.template.type === 'gable' &&
                    state.template.structure?.collarTie && (
                      <>
                        <h3>{t('assembly.collar-tie')}</h3>
                        <CollarTieInputs />
                      </>
                    )}
                  <h3>{t('assembly.ridge')}</h3>
                  <NumberField
                    field="ridge.thicknessMm"
                    label="ridgeWidth"
                    max={1000}
                  />
                  <NumberField
                    field="ridge.depthMm"
                    label="ridgeDepth"
                    min={1}
                    max={2000}
                    optional
                  />
                  <RidgeConnectionSelector />
                </div>
              </details>
            </>
          )}
          {selectedRoofWindows.length > 1 ? (
            <RoofWindowGroupInspector features={selectedRoofWindows} />
          ) : roofWindow ? (
            <RoofWindowInspector feature={roofWindow} skeleton={skeleton} />
          ) : null}
          {workbench.viewPreset === 'layers' &&
            workbench.buildUpView === 'membrane' && (
              <MembraneInspector geometry={surfaceGeometry} />
            )}
          {workbench.viewPreset === 'layers' &&
            workbench.buildUpView === 'counterBattens' && (
              <CounterBattenInspector
                result={counterBattens}
                installation={installation}
              />
            )}
          {workbench.viewPreset === 'layers' &&
            workbench.buildUpView === 'battens' && (
              <BattenLayoutInspector
                result={battens}
                composition={battenAutoComposition}
                workflow={installation.battens}
              />
            )}
          {workbench.viewPreset === 'layers' &&
            workbench.buildUpView === 'installation' && (
              <InstallationInspector
                battens={battens}
                counterBattens={counterBattens}
                installation={installation}
              />
            )}
          {(isRafter || isJack || workbench.selectedId === 'cut:eave') && (
            <TimberInputs />
          )}
          {isHip && hip && (
            <>
              <HipTimberInputs />
              <button className="a-button" onClick={() => state.setView('hip')}>
                {t('assembly.prepareHip')} H1
              </button>
            </>
          )}
          {(workbench.selectedId === state.spec.ridge.id ||
            workbench.selectedId === 'cut:ridge') && (
            <>
              <NumberField
                field="ridge.thicknessMm"
                label="ridgeWidth"
                max={1000}
              />
              <NumberField
                field="ridge.depthMm"
                label="ridgeDepth"
                min={1}
                max={2000}
                optional
              />
              <RidgeConnectionSelector />
            </>
          )}
          {isCollarTie && (
            <>
              <h3>{t('assembly.collar-tie')}</h3>
              <CollarTieInputs />
            </>
          )}
          {support && <SupportInputs support={support} result={result} />}
          {detailPreviews.length > 0 && (
            <section className="a-inspector-details">
              <h3>{t('assembly.availableDetails')}</h3>
              {detailPreviews.map((preview) => (
                <button
                  key={preview.id}
                  className="a-button"
                  onClick={() =>
                    state.activateOperation({
                      operationId: preview.sourceSelectionId,
                      prototypeId: preview.subjectMemberId,
                      selectionId: preview.sourceSelectionId,
                      instanceId:
                        activeInstance?.prototypeId === preview.subjectMemberId
                          ? activeInstance.instanceId
                          : undefined,
                      previewId: preview.id,
                    })
                  }
                >
                  {preview.subjectCode} · {t(`assembly.${preview.titleKey}`)}
                </button>
              ))}
            </section>
          )}
        </div>
      )}
    </aside>
  );
}

function DraftLengthField({
  label,
  value,
  min = 0,
  onCommit,
}: {
  label: string;
  value: number;
  min?: number;
  onCommit: (value: number) => void;
}) {
  const state = useAssembly();
  const { t } = useTranslation();
  const [raw, setRaw] = useState(editableLength(value, state.unit));
  useEffect(
    () => setRaw(editableLength(value, state.unit)),
    [state.unit, value],
  );
  const parsed = parseDecimal(raw);
  const canonicalValue =
    parsed === null ? Number.NaN : toMillimetres(parsed, state.unit);
  const invalid = !Number.isFinite(canonicalValue) || canonicalValue < min;
  const restore = () => setRaw(editableLength(value, state.unit));
  const commit = () => {
    if (invalid) {
      state.cancelTransaction();
      restore();
      return;
    }
    onCommit(canonicalValue);
    state.commitTransaction();
  };
  return (
    <label className="a-field">
      <span>{label}</span>
      <div>
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          aria-label={label}
          aria-invalid={invalid}
          value={raw}
          onFocus={state.beginTransaction}
          onChange={(event) => setRaw(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commit();
              event.currentTarget.blur();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              state.cancelTransaction();
              restore();
              event.currentTarget.blur();
            }
          }}
        />
        <span>{state.unit}</span>
      </div>
      {invalid && <small>{t('assembly.invalidField')}</small>}
    </label>
  );
}

function area(valueMm2: number, locale: string) {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(valueMm2 / 1_000_000)} m²`;
}

function MembraneInspector({
  geometry,
}: {
  geometry: RoofSurfaceGeometryResult;
}) {
  const state = useAssembly();
  const { t, i18n } = useTranslation();
  const layer = state.projectDocument.project.buildUp.membrane ?? {
    enabled: false,
  };
  const selectedPlaneId = state.workbench.selectedId.startsWith('surface:')
    ? state.workbench.selectedId.replace('surface:', '')
    : undefined;
  const selectedPlane = geometry.planes.find(
    (plane) => plane.roofPlaneId === selectedPlaneId,
  );
  const facts = selectedPlane ?? geometry;
  const planeIds = geometry.planes.map((plane) => plane.roofPlaneId);
  const activePlaneIds = layer.roofPlaneIds ?? planeIds;
  return (
    <section className="a-layer-inspector" data-testid="membrane-inspector">
      <h3>{t('assembly.membrane')}</h3>
      <dl className="a-facts">
        <div>
          <dt>{t('assembly.status')}</dt>
          <dd>{t(`assembly.${layer.enabled ? 'enabled' : 'disabled'}`)}</dd>
        </div>
        <div>
          <dt>{t('assembly.roofPlanes')}</dt>
          <dd>{activePlaneIds.length}</dd>
        </div>
        <div>
          <dt>{t('assembly.grossArea')}</dt>
          <dd>{area(facts.grossAreaMm2, i18n.language)}</dd>
        </div>
        <div>
          <dt>{t('assembly.openingArea')}</dt>
          <dd>{area(facts.openingAreaMm2, i18n.language)}</dd>
        </div>
        <div>
          <dt>{t('assembly.netGeometricArea')}</dt>
          <dd>{area(facts.netAreaMm2, i18n.language)}</dd>
        </div>
      </dl>
      <fieldset className="a-plane-choice">
        <legend>{t('assembly.roofPlanes')}</legend>
        {planeIds.map((planeId) => (
          <label key={planeId}>
            <input
              type="checkbox"
              checked={activePlaneIds.includes(planeId)}
              onChange={(event) => {
                const next = event.target.checked
                  ? [...new Set([...activePlaneIds, planeId])]
                  : activePlaneIds.filter((id) => id !== planeId);
                state.setMembraneLayer({
                  ...layer,
                  enabled: layer.enabled,
                  roofPlaneIds: next,
                });
              }}
            />
            {t(roofPlaneShortLabelKey(planeId), { id: planeId })}
          </label>
        ))}
      </fieldset>
      <MembraneProductForm />
      <p className="a-limit-note">{t('assembly.membraneBoundaryNote')}</p>
    </section>
  );
}

function MembraneProductForm() {
  const state = useAssembly();
  const { t, i18n } = useTranslation();
  const product = state.projectDocument.project.membraneProduct;
  const [draft, setDraft] = useState({
    rollWidth: '',
    rollLength: '',
    minimumOverlap: '',
  });
  const [error, setError] = useState('');
  const [catalogOpen, setCatalogOpen] = useState(false);
  if (product) {
    const spec = product.technicalSpecSnapshot;
    return (
      <fieldset
        className="a-membrane-product"
        data-testid="membrane-product-summary"
      >
        <legend>{t('assembly.membraneProduct')}</legend>
        {product.catalogRef && (
          <p className="a-catalogue-source">
            {[
              product.displaySnapshot?.manufacturer,
              product.displaySnapshot?.familyName,
              product.displaySnapshot?.variantName,
            ]
              .filter(Boolean)
              .join(' · ')}
            {product.displaySnapshot?.revisionCode
              ? ` · ${t('assembly.catalogRevision')} ${product.displaySnapshot.revisionCode}`
              : ''}
          </p>
        )}
        <dl className="a-facts">
          <div>
            <dt>{t('assembly.rollWidth')}</dt>
            <dd>{formatLength(spec.rollWidthMm, state.unit, i18n.language)}</dd>
          </div>
          <div>
            <dt>{t('assembly.rollLength')}</dt>
            <dd>
              {formatLength(spec.rollLengthMm, state.unit, i18n.language)}
            </dd>
          </div>
          <div>
            <dt>{t('assembly.minimumOverlap')}</dt>
            <dd>
              {formatLength(spec.minimumOverlapMm, state.unit, i18n.language)}
            </dd>
          </div>
        </dl>
        <button
          type="button"
          onClick={() => state.setMembraneProduct(undefined)}
        >
          {t('assembly.removeMembraneProduct')}
        </button>
      </fieldset>
    );
  }
  const field = (key: keyof typeof draft, label: string) => (
    <label className="a-field">
      <span>{label}</span>
      <span className="a-input-with-unit">
        <input
          data-manual-field={key}
          aria-label={label}
          inputMode="decimal"
          value={draft[key]}
          onChange={(event) => {
            setError('');
            setDraft((current) => ({
              ...current,
              [key]: event.target.value,
            }));
          }}
        />
        <small>{state.unit}</small>
      </span>
    </label>
  );
  if (catalogOpen)
    return (
      <Suspense fallback={<div className="a-loading-panel" />}>
        <MembraneProductPicker
          onApply={(selection) => {
            state.setMembraneProduct(selection);
            setCatalogOpen(false);
          }}
          onManual={() => setCatalogOpen(false)}
          onClose={() => setCatalogOpen(false)}
        />
      </Suspense>
    );
  return (
    <form
      className="a-membrane-product"
      data-testid="membrane-product-form"
      onSubmit={(event) => {
        event.preventDefault();
        const mm = (key: keyof typeof draft) => {
          const parsed = parseDecimal(draft[key]);
          if (parsed === null || parsed <= 0) throw new Error('required');
          return toMillimetres(parsed, state.unit);
        };
        try {
          const spec: MembraneTechnicalSpec = membraneTechnicalSpecSchema.parse(
            {
              schemaVersion: 1,
              kind: 'membrane',
              rollWidthMm: mm('rollWidth'),
              rollLengthMm: mm('rollLength'),
              minimumOverlapMm: mm('minimumOverlap'),
            },
          );
          state.setMembraneProduct({ technicalSpecSnapshot: spec });
          setDraft({ rollWidth: '', rollLength: '', minimumOverlap: '' });
        } catch {
          setError(t('assembly.membraneProductInvalid'));
        }
      }}
    >
      <legend>{t('assembly.membraneProduct')}</legend>
      <button
        type="button"
        data-testid="open-membrane-catalog"
        onClick={() => setCatalogOpen(true)}
      >
        {t('assembly.chooseFromCatalogue')}
      </button>
      {field('rollWidth', t('assembly.rollWidth'))}
      {field('rollLength', t('assembly.rollLength'))}
      {field('minimumOverlap', t('assembly.minimumOverlap'))}
      {error && <p className="a-field-error">{error}</p>}
      <button type="submit" data-testid="confirm-membrane-product">
        {t('assembly.addMembraneProduct')}
      </button>
      <p className="a-limit-note">{t('assembly.membraneProductNote')}</p>
    </form>
  );
}

/** V43B composite installation plan: both systems and their relationship. */
function InstallationInspector({
  battens,
  counterBattens,
  installation,
}: {
  battens: BattenLayoutResult;
  counterBattens: CounterBattenLayoutResult;
  installation: InstallationWorkflowFacts;
}) {
  const state = useAssembly();
  const { t } = useTranslation();
  const selectedId = state.workbench.selectedId;
  return (
    <section
      className="a-layer-inspector a-installation-inspector"
      data-testid="installation-inspector"
    >
      <h3>{t('assembly.install.title')}</h3>
      <h4>{t('assembly.install.battens')}</h4>
      <BattenWorkflowPanel workflow={installation.battens} />
      <BattenReferences workflow={installation.battens} />
      <h4>{t('assembly.install.counterBattens')}</h4>
      <CounterBattenStatusLine workflow={installation.counterBattens} />
      <CounterBattenExplanation
        workflow={installation.counterBattens}
        hipPairedRunsPreviewMm={installation.hipPairedRunsPreviewMm}
      />
      <WorkflowActions
        actions={
          installation.counterBattens.state === 'layer-off'
            ? ['enable-counter-battens']
            : installation.counterBattens.state === 'needs-hip-detail'
              ? ['choose-hip-detail']
              : []
        }
      />
      {selectedId.startsWith('batten:') && (
        <BattenRowDetail
          result={battens}
          rowId={selectedId}
          workflow={installation.battens}
        />
      )}
      {selectedId.startsWith('counter-batten:') && (
        <CounterBattenAxisDetail result={counterBattens} rowId={selectedId} />
      )}
      <p className="a-limit-note">{t('assembly.install.notPurchase')}</p>
    </section>
  );
}

function CounterBattenInspector({
  result,
  installation,
}: {
  result: CounterBattenLayoutResult;
  installation: InstallationWorkflowFacts;
}) {
  const state = useAssembly();
  const { t, i18n } = useTranslation();
  const layout =
    state.projectDocument.project.buildUp.counterBattens ??
    disabledCounterBattenLayer();
  const selected = result.rows.find(
    (row) => row.id === state.workbench.selectedId,
  );
  const planeIds = roofPlaneIds(state.template);
  const activePlaneIds = layout.roofPlaneIds ?? planeIds;
  const update = (field: 'widthMm' | 'heightMm', value: number) =>
    state.setCounterBattenLayout({ ...layout, [field]: value });
  const decisionStatus = result.warnings.some(
    (code) =>
      code === 'invalid-counter-batten-section' ||
      code === 'invalid-layout-geometry',
  )
    ? 'incompatible'
    : !result.rows.length
      ? 'no-data'
      : result.status === 'partial'
        ? 'partially-automatic'
        : 'ready';
  return (
    <section
      className="a-layer-inspector"
      data-testid="counter-batten-inspector"
    >
      <h3>{t('assembly.counterBattens')}</h3>
      <CounterBattenStatusLine workflow={installation.counterBattens} />
      <CounterBattenExplanation
        workflow={installation.counterBattens}
        hipPairedRunsPreviewMm={installation.hipPairedRunsPreviewMm}
      />
      {installation.counterBattens.state === 'layer-off' && (
        <WorkflowActions actions={['enable-counter-battens']} />
      )}
      <p>{t('assembly.counterBattenPlacement')}</p>
      <p className="a-installation-authority">
        {t('assembly.decisionSource.derived-geometry')}
      </p>
      <h4>{t('assembly.section')}</h4>
      <DraftLengthField
        label={t('assembly.width')}
        value={layout.widthMm}
        min={1}
        onCommit={(value) => update('widthMm', value)}
      />
      <DraftLengthField
        label={t('assembly.counterBattenDepth')}
        value={layout.heightMm}
        min={1}
        onCommit={(value) => update('heightMm', value)}
      />
      <details className="a-inspector-advanced">
        <summary>{t('assembly.perPlaneResults')}</summary>
        <fieldset className="a-plane-choice">
          <legend>{t('assembly.roofPlanes')}</legend>
          {planeIds.map((planeId) => (
            <label key={planeId}>
              <input
                type="checkbox"
                checked={activePlaneIds.includes(planeId)}
                onChange={(event) => {
                  const next = event.target.checked
                    ? [...new Set([...activePlaneIds, planeId])]
                    : activePlaneIds.filter((id) => id !== planeId);
                  state.setCounterBattenLayout({
                    ...layout,
                    roofPlaneIds: next,
                  });
                }}
              />
              {t(roofPlaneShortLabelKey(planeId), { id: planeId })}
            </label>
          ))}
        </fieldset>
      </details>
      <h4>{t('assembly.result')}</h4>
      <dl className="a-facts">
        <div>
          <dt>{t('assembly.axisSegmentCount')}</dt>
          <dd data-counter-batten-axes>
            {result.rows.length} /{' '}
            {result.rows.reduce((sum, row) => sum + row.segments.length, 0)}
          </dd>
        </div>
        {!!result.hipBoundaries.length && (
          <div>
            <dt>{t('assembly.hipBoundary.breakdown')}</dt>
            <dd data-counter-batten-breakdown>
              {t('assembly.hipBoundary.breakdownValue', {
                interior: result.interiorAxisCount,
                hip: result.hipBoundaryRunCount,
              })}
            </dd>
          </div>
        )}
        <div>
          <dt>{t('assembly.totalVisibleGeometricLength')}</dt>
          <dd data-counter-batten-total>
            {new Intl.NumberFormat(i18n.language, {
              maximumFractionDigits: 2,
            }).format(result.totalVisibleLengthMm / 1000)}{' '}
            m
          </dd>
        </div>
        <div>
          <dt>{t('assembly.roofPlanes')}</dt>
          <dd>{new Set(result.rows.map((row) => row.roofPlaneId)).size}</dd>
        </div>
      </dl>
      <p
        className={`a-installation-status is-${decisionStatus}`}
        data-testid="counter-batten-layout-status"
      >
        {t(
          result.status === 'disabled'
            ? 'assembly.disabled'
            : `assembly.installationStatus.${decisionStatus}`,
        )}
      </p>
      {selected && (
        <CounterBattenAxisDetail result={result} rowId={selected.id} />
      )}
      <HipBoundaryDetailChooser result={result} />
      {result.warnings
        .filter((code) => code !== 'hip-boundary-detail-unresolved')
        .map((code) => (
          <p className="a-limit-note" key={code}>
            {t(`assembly.counterBattenIssue.${code}`)}
          </p>
        ))}
    </section>
  );
}

function BattenLayoutInspector({
  result,
  composition,
  workflow,
}: {
  result: BattenLayoutResult;
  composition: BattenAutoComposition;
  workflow: BattenWorkflow;
}) {
  const state = useAssembly();
  const { t, i18n } = useTranslation();
  const layout =
    state.projectDocument.project.buildUp.battenLayout ?? disabledBattenLayer();
  const update = (field: keyof typeof layout, value: number) => {
    state.setBattenLayout({ ...layout, [field]: value, enabled: true });
  };
  const mode = layout.mode ?? 'manual';
  const actualGaugeMm = uniformBattenGauge(result);
  const setMode = (next: 'manual' | 'auto-from-covering') =>
    state.setBattenLayout({
      ...layout,
      mode: next,
      gaugeMm:
        next === 'manual' &&
        mode === 'auto-from-covering' &&
        actualGaugeMm &&
        result.planes.every((plane) => plane.actualGaugeMm === actualGaugeMm)
          ? actualGaugeMm
          : layout.gaugeMm,
      enabled: true,
    });
  const decision = evaluateBattenInstallation({ layout, result, composition });
  const selectedRow = result.battens.find(
    (batten) => batten.id === state.workbench.selectedId,
  );
  const planeName = (id: string) => t(roofPlaneShortLabelKey(id), { id });
  const length = (value: number) =>
    `${formatLength(value, state.unit, i18n.language)} ${state.unit}`;
  return (
    <section
      className="a-batten-inspector"
      data-testid="batten-inspector"
      data-decision-status={decision.status}
    >
      <h3>{t('assembly.battens')}</h3>
      <BattenWorkflowPanel workflow={workflow} />
      <div
        className="a-segmented"
        role="group"
        aria-label={t('assembly.battenMode')}
      >
        <button
          className={mode === 'auto-from-covering' ? 'is-active' : ''}
          aria-pressed={mode === 'auto-from-covering'}
          onClick={() => setMode('auto-from-covering')}
        >
          {t('assembly.battenModeAuto')}
        </button>
        <button
          className={mode === 'manual' ? 'is-active' : ''}
          aria-pressed={mode === 'manual'}
          onClick={() => setMode('manual')}
        >
          {t('assembly.battenModeManual')}
        </button>
      </div>
      {composition.source.status === 'resolved' ? (
        <p className="a-installation-range" data-testid="batten-auto-source">
          {t('assembly.battenAutoSourceReady', {
            product: composition.productLabel ?? t('assembly.roofTile'),
            min: length(composition.source.minimumGaugeMm),
            max: length(composition.source.maximumGaugeMm),
          })}
        </p>
      ) : mode === 'auto-from-covering' ? (
        <p
          className="a-layer-status is-warning"
          data-testid="batten-auto-source"
        >
          {t(
            `assembly.battenAutoSource.${composition.reason ?? 'tile-covering-missing'}`,
          )}
        </p>
      ) : null}
      {mode === 'manual' && (
        <DraftLengthField
          label={t('assembly.battenGauge')}
          value={layout.gaugeMm}
          min={1}
          onCommit={(value) => update('gaugeMm', value)}
        />
      )}
      <BattenAutoRepair layout={layout} />
      <BattenReferences workflow={workflow} />
      <dl className="a-batten-results">
        <div>
          <dt>{t('assembly.battenRows')}</dt>
          <dd data-batten-rows>{result.battens.length}</dd>
        </div>
        <div>
          <dt>{t('assembly.battenTotalLength')}</dt>
          <dd data-batten-total>
            {new Intl.NumberFormat(i18n.language, {
              maximumFractionDigits: 1,
            }).format(result.totalLengthMm / 1000)}{' '}
            m
          </dd>
        </div>
      </dl>
      <BattenInstallationDetails
        decision={decision}
        composition={composition}
        result={result}
      />
      <details className="a-layer-help">
        <summary>{t('assembly.geometryHelp')}</summary>
        <p>{t('assembly.battenGeometricNote')}</p>
      </details>
      <details className="a-inspector-advanced">
        <summary>{t('assembly.advanced')}</summary>
        <div>
          <h4>{t('assembly.battenGeometry')}</h4>
          {(
            [
              ['battenWidthMm', 'battenWidth'],
              ['battenHeightMm', 'battenHeight'],
            ] as const
          ).map(([field, label]) => (
            <DraftLengthField
              key={field}
              label={t(`assembly.${label}`)}
              value={layout[field]}
              min={1}
              onCommit={(value) => update(field, value)}
            />
          ))}
          <h4>{t('assembly.battenDistribution')}</h4>
          {(
            [
              ['eaveOffsetMm', 'battenEaveOffset'],
              ['ridgeOffsetMm', 'battenRidgeOffset'],
            ] as const
          ).map(([field, label]) => (
            <div key={field}>
              <small className="a-input-ownership">
                {t('assembly.manualOwnership')}
              </small>
              <DraftLengthField
                label={t(`assembly.${label}`)}
                value={layout[field] ?? 0}
                min={0}
                onCommit={(value) => update(field, value)}
              />
            </div>
          ))}
        </div>
      </details>
      {result.status === 'incomplete' && (
        <p className="a-limit-note">{t('assembly.battenAutoIncomplete')}</p>
      )}
      {result.planes.length > 0 && (
        <details className="a-layer-help" data-testid="batten-plane-evidence">
          <summary>{t('assembly.perPlaneResults')}</summary>
          <table className="a-plane-evidence">
            <tbody>
              {result.planes.map((plane) => (
                <tr
                  key={plane.roofPlaneId}
                  data-plane-evidence={plane.roofPlaneId}
                >
                  <th scope="row">{planeName(plane.roofPlaneId)}</th>
                  <td>
                    {plane.courseCount} {t('assembly.battenRows').toLowerCase()}
                  </td>
                  <td>
                    {plane.actualGaugeMm ? length(plane.actualGaugeMm) : '—'}
                  </td>
                  <td data-plane-length={plane.totalRowLengthMm}>
                    {new Intl.NumberFormat(i18n.language, {
                      maximumFractionDigits: 1,
                    }).format(plane.totalRowLengthMm / 1000)}{' '}
                    m
                  </td>
                  <td>
                    {plane.openingDeductionMm > 0
                      ? `−${new Intl.NumberFormat(i18n.language, {
                          maximumFractionDigits: 2,
                        }).format(plane.openingDeductionMm / 1000)} m`
                      : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
      {selectedRow && (
        <BattenRowDetail
          result={result}
          rowId={selectedRow.id}
          workflow={workflow}
        />
      )}
    </section>
  );
}

function RoofWindowGroupInspector({
  features,
}: {
  features: RoofWindowFeature[];
}) {
  const state = useAssembly();
  const { t, i18n } = useTranslation();
  const [distributionPreviewOpen, setDistributionPreviewOpen] = useState(false);
  const distribution = distributeRoofWindowsAlongEave({
    template: state.template,
    windows: features,
  });
  const align = (mode: RoofWindowAlignmentMode) => {
    setDistributionPreviewOpen(false);
    state.alignSelectedRoofWindows(mode);
  };
  const feedback = state.workbench.windowLayoutFeedback;
  const primary = features.find(
    (feature) => feature.id === state.workbench.selectedId,
  );
  return (
    <section className="a-window-group-inspector">
      <div className="a-window-inspector-title">
        <h3>{t('assembly.windowGroupTools')}</h3>
        <button className="a-button" onClick={state.clearRoofWindowSelection}>
          {t('assembly.clearWindowSelection')}
        </button>
      </div>
      <p className="a-help">
        {t('assembly.windowGroupAnchor', {
          id: primary?.id.replace('feature:roof-window-', 'O') ?? '—',
        })}
      </p>
      <div className="a-window-layout-actions" role="group">
        {(
          [
            ['lower-edge', 'alignLowerEdges'],
            ['centre', 'alignCentres'],
            ['upper-edge', 'alignUpperEdges'],
          ] as const
        ).map(([mode, label]) => (
          <button key={mode} className="a-button" onClick={() => align(mode)}>
            {t(`assembly.${label}`)}
          </button>
        ))}
      </div>
      {features.length < 3 ? (
        <p className="a-help">{t('assembly.distributionNeedsThree')}</p>
      ) : (
        <button
          className="a-button"
          onClick={() => setDistributionPreviewOpen(true)}
        >
          {t('assembly.previewWindowDistribution')}
        </button>
      )}
      {distributionPreviewOpen && (
        <div className="a-window-distribution-preview" role="status">
          {distribution.status === 'ready' ? (
            <>
              <strong>{t('assembly.windowDistributionPreview')}</strong>
              <span>
                {t('assembly.equalClearGap')}:{' '}
                {formatLength(
                  distribution.clearGapMm,
                  state.unit,
                  i18n.language,
                )}{' '}
                {state.unit}
              </span>
              <div className="a-framing-actions">
                <button
                  className="a-button a-primary"
                  onClick={() => {
                    state.distributeSelectedRoofWindows();
                    setDistributionPreviewOpen(false);
                  }}
                >
                  {t('assembly.apply')}
                </button>
                <button
                  className="a-button"
                  onClick={() => setDistributionPreviewOpen(false)}
                >
                  {t('assembly.cancel')}
                </button>
              </div>
            </>
          ) : (
            <p className="a-window-warning" role="alert">
              {t(`assembly.windowLayout_${distribution.reason}`)}
            </p>
          )}
        </div>
      )}
      {feedback?.status === 'rejected' && (
        <p className="a-window-warning" role="alert">
          {t(`assembly.windowLayout_${feedback.reason}`)}
        </p>
      )}
    </section>
  );
}

function RoofWindowInspector({
  feature,
  skeleton,
}: {
  feature: RoofWindowFeature;
  skeleton: RoofSkeleton;
}) {
  const state = useAssembly();
  const { t, i18n } = useTranslation();
  const length = (value: number) =>
    `${formatLength(value, state.unit, i18n.language)} ${state.unit}`;
  const collisions = resolveRoofFeatureCollisions({
    template: state.template,
    skeleton,
    feature,
  });
  const nearestBay = resolveNearestRoofWindowBay({
    template: state.template,
    skeleton,
    feature,
  });
  const framingSpec = state.projectDocument.project.openingFraming.find(
    (spec) => spec.featureId === feature.id,
  );
  const framing = resolveOpeningFraming({
    template: state.template,
    skeleton,
    feature,
    framingSpec:
      framingSpec ?? createOpeningFramingDraft(state.template, feature.id),
  });
  const proposalActive =
    state.workbench.openingFramingProposalFeatureId === feature.id;
  const feedback =
    state.workbench.placementFeedback?.featureId === feature.id
      ? state.workbench.placementFeedback
      : undefined;
  const change = (
    field: 'widthMm' | 'heightMm' | 'uMm' | 'vMm',
    value: number,
  ) => {
    state.updateRoofWindow(
      feature.id,
      field === 'uMm' || field === 'vMm'
        ? {
            position: {
              ...feature.position,
              [field === 'uMm' ? 'uMm' : 'vMm']: value,
            },
          }
        : { [field]: value },
    );
  };
  return (
    <section className="a-window-inspector">
      <div className="a-window-inspector-title">
        <h3>
          {t('assembly.geometricOpening')}{' '}
          {feature.id.replace('feature:roof-window-', 'O')}
        </h3>
        <button
          className="a-button"
          onClick={() => state.beginRoofWindowDuplicatePlacement(feature.id)}
        >
          {t('assembly.duplicateWindow')}
        </button>
      </div>
      <p className="a-help">{t('assembly.geometricOpeningNote')}</p>
      <label className="a-select-label">
        {t('assembly.roofPlane')}
        <select
          value={feature.roofPlaneId}
          onChange={(event) =>
            state.updateRoofWindow(feature.id, {
              roofPlaneId: event.target.value,
            })
          }
        >
          {roofPlaneIds(state.template).map((planeId) => (
            <option key={planeId} value={planeId}>
              {t(roofPlaneShortLabelKey(planeId), { id: planeId })}
            </option>
          ))}
        </select>
      </label>
      {(
        [
          ['widthMm', 'windowWidth', feature.widthMm],
          ['heightMm', 'windowHeight', feature.heightMm],
          ['uMm', 'windowPositionU', feature.position.uMm],
          ['vMm', 'windowPositionV', feature.position.vMm],
        ] as const
      ).map(([field, label, value]) => (
        <DraftLengthField
          key={field}
          label={t(`assembly.${label}`)}
          value={value}
          min={field === 'uMm' || field === 'vMm' ? 0 : 1}
          onCommit={(nextValue) => change(field, nextValue)}
        />
      ))}
      <p className={collisions.length ? 'a-window-warning' : 'a-window-clear'}>
        {collisions.length
          ? `${t('assembly.windowCollision')}: ${collisions.map((collision) => memberInstanceCode(collision.memberInstanceId)).join(', ')}`
          : t('assembly.windowClear')}
      </p>
      {nearestBay && (
        <p className="a-window-bay">
          {t('assembly.nearestBay')}:{' '}
          {nearestBay.memberInstanceIds.map(memberInstanceCode).join(' — ')} ·{' '}
          {length(nearestBay.availableWidthMm)}
        </p>
      )}
      {feedback?.status === 'placed' && feedback.memberInstanceIds && (
        <p className="a-window-success">
          {t('assembly.windowPlacedBetween')}:{' '}
          {feedback.memberInstanceIds.map(memberInstanceCode).join(' — ')}.
        </p>
      )}
      {feedback?.status === 'failed' && (
        <p className="a-window-warning" role="alert">
          {feedback.reason === 'opening-too-wide' &&
          feedback.availableWidthMm !== undefined
            ? `${t('assembly.openingTooWide')} ${length(feedback.requiredWidthMm ?? feature.widthMm)} / ${length(feedback.availableWidthMm)}.`
            : t('assembly.noRafterBay')}
        </p>
      )}
      <button
        className="a-button a-primary"
        onClick={() => state.placeRoofWindowBetweenRafters(feature.id)}
      >
        {t('assembly.placeBetweenRafters')}
      </button>
      <section
        className="a-opening-framing-inspector"
        data-framing-status={framing.status}
      >
        <h4>{t('assembly.openingFraming')}</h4>
        {framing.status === 'resolved' && (
          <>
            <dl>
              <div>
                <dt>{t('assembly.framingStatus')}</dt>
                <dd>
                  {t(
                    `assembly.${framing.reviewStatus === 'needs-review' ? 'framingNeedsReview' : framingSpec ? 'framingApplied' : 'framingAvailable'}`,
                  )}
                </dd>
              </div>
              <div>
                <dt>{t('assembly.boundingRafters')}</dt>
                <dd>
                  {framing.boundingMemberInstanceIds
                    .map(memberInstanceCode)
                    .join(' — ')}
                </dd>
              </div>
              <div>
                <dt>{t('assembly.interruptedRafters')}</dt>
                <dd>
                  {framing.affectedMemberInstanceIds
                    .map(memberInstanceCode)
                    .join(', ')}
                </dd>
              </div>
              <div>
                <dt>{t('assembly.upperHeader')}</dt>
                <dd>{length(framing.upperFramingMember!.lengthMm)}</dd>
              </div>
              <div>
                <dt>{t('assembly.lowerHeader')}</dt>
                <dd>{length(framing.lowerFramingMember!.lengthMm)}</dd>
              </div>
            </dl>
            <p className="a-limit-note">
              {t('assembly.openingFramingStructuralWarning')}
            </p>
            {proposalActive ? (
              <div className="a-framing-actions">
                <button
                  className="a-button a-primary"
                  onClick={() => state.applyOpeningFraming(feature.id)}
                >
                  {t('assembly.applyFraming')}
                </button>
                <button
                  className="a-button"
                  onClick={state.cancelOpeningFramingProposal}
                >
                  {t('assembly.cancelFraming')}
                </button>
              </div>
            ) : framingSpec ? (
              <div className="a-framing-actions">
                {framing.reviewStatus === 'needs-review' && (
                  <button
                    className="a-button a-primary"
                    onClick={() => state.planOpeningFraming(feature.id)}
                  >
                    {t('assembly.recheckFraming')}
                  </button>
                )}
                <button
                  className="a-button"
                  onClick={() => state.removeOpeningFraming(feature.id)}
                >
                  {t('assembly.removeFraming')}
                </button>
              </div>
            ) : (
              <button
                className="a-button a-primary"
                onClick={() => state.planOpeningFraming(feature.id)}
              >
                {t('assembly.planOpeningFraming')}
              </button>
            )}
          </>
        )}
        {framing.status === 'not-needed' && (
          <p className="a-window-clear">{t('assembly.framingNotNeeded')}</p>
        )}
        {framing.status !== 'resolved' && framing.status !== 'not-needed' && (
          <p className="a-window-warning" role="alert">
            {t(
              `assembly.${framing.status === 'unsupported-complex-boundary' ? 'framingUnsupported' : framing.status === 'no-bounding-rafters' ? 'framingNoBounds' : framing.status === 'conflict' ? 'framingConflict' : 'framingInvalid'}`,
            )}
          </p>
        )}
      </section>
      <button
        className="a-button"
        onClick={() => state.removeRoofWindow(feature.id)}
      >
        {t('assembly.removeRoofWindow')}
      </button>
    </section>
  );
}
