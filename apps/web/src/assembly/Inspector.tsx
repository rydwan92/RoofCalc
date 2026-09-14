import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  MemberInstanceContext,
  RoofFabricationPackage,
} from '@cieslacalc/calculator-core';
import type { DetailPreviewModel } from '@cieslacalc/drawing-engine';
import {
  HIP_RAFTER_PROTOTYPE_ID,
  JACK_RAFTER_PROTOTYPE_ID,
  createOpeningFramingDraft,
  distributeRoofWindowsAlongEave,
  resolveOpeningFraming,
  resolveBattenLayout,
  resolveRoofFeatureCollisions,
  resolveNearestRoofWindowBay,
  roofPlaneIds,
  toMillimetres,
  type CounterBattenLayoutResult,
  type RoofWindowAlignmentMode,
  type RoofSurfaceGeometryResult,
} from '@cieslacalc/roof-math';
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
  GeometryInputs,
  HipTimberInputs,
  NumberField,
  RoofTypeSelector,
  SupportInputs,
  TemplateInputs,
  TimberInputs,
  type Calculation,
} from './Inputs';
import { MemberInstanceInspector } from './MemberInstanceInspector';
import type { WorkbenchSelectionContext } from './selection';
import { useAssembly } from './store';
import { SpacingSummary } from './Summary';
import { memberInstanceCode } from './workbench';

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
  counterBattens,
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
  counterBattens: CounterBattenLayoutResult;
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
              <CounterBattenInspector result={counterBattens} />
            )}
          {workbench.viewPreset === 'layers' &&
            workbench.buildUpView === 'battens' && <BattenLayoutInspector />}
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
      <p className="a-limit-note">{t('assembly.membraneBoundaryNote')}</p>
    </section>
  );
}

function CounterBattenInspector({
  result,
}: {
  result: CounterBattenLayoutResult;
}) {
  const state = useAssembly();
  const { t, i18n } = useTranslation();
  const layout = state.projectDocument.project.buildUp.counterBattens ?? {
    enabled: false,
    widthMm: 40,
    heightMm: 60,
  };
  const selected = result.rows.find(
    (row) => row.id === state.workbench.selectedId,
  );
  const length = (value: number) =>
    `${formatLength(value, state.unit, i18n.language)} ${state.unit}`;
  const planeIds = roofPlaneIds(state.template);
  const activePlaneIds = layout.roofPlaneIds ?? planeIds;
  const update = (field: 'widthMm' | 'heightMm', value: number) =>
    state.setCounterBattenLayout({ ...layout, [field]: value });
  return (
    <section
      className="a-layer-inspector"
      data-testid="counter-batten-inspector"
    >
      <h3>{t('assembly.counterBattens')}</h3>
      <h4>{t('assembly.section')}</h4>
      <DraftLengthField
        label={t('assembly.width')}
        value={layout.widthMm}
        min={1}
        onCommit={(value) => update('widthMm', value)}
      />
      <DraftLengthField
        label={t('assembly.height')}
        value={layout.heightMm}
        min={1}
        onCommit={(value) => update('heightMm', value)}
      />
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
      <h4>{t('assembly.result')}</h4>
      <dl className="a-facts">
        <div>
          <dt>{t('assembly.axisSegmentCount')}</dt>
          <dd>
            {result.rows.length} /{' '}
            {result.rows.reduce((sum, row) => sum + row.segments.length, 0)}
          </dd>
        </div>
        <div>
          <dt>{t('assembly.totalVisibleGeometricLength')}</dt>
          <dd>
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
      {selected && (
        <p className="a-layer-selection-detail">
          {memberInstanceCode(selected.sourceMemberId)} ·{' '}
          {length(selected.visibleLengthMm)} · {selected.segments.length}{' '}
          {t('assembly.segments').toLowerCase()}
        </p>
      )}
      {result.status === 'limited' && (
        <p className="a-limit-note">{t('assembly.counterBattenLimited')}</p>
      )}
    </section>
  );
}

function BattenLayoutInspector() {
  const state = useAssembly();
  const { t, i18n } = useTranslation();
  const layout = state.projectDocument.project.buildUp.battenLayout ?? {
    enabled: true,
    battenHeightMm: 40,
    battenWidthMm: 60,
    gaugeMm: 350,
    eaveOffsetMm: 250,
    ridgeOffsetMm: 0,
  };
  const result = resolveBattenLayout({
    template: state.template,
    layout,
    features: state.projectDocument.project.features,
  });
  const update = (field: keyof typeof layout, value: number) => {
    state.setBattenLayout({ ...layout, [field]: value, enabled: true });
  };
  const selectedRow = result.battens.find(
    (batten) => batten.id === state.workbench.selectedId,
  );
  const planeName = (id: string) => t(roofPlaneShortLabelKey(id), { id });
  const length = (value: number) =>
    `${formatLength(value, state.unit, i18n.language)} ${state.unit}`;
  return (
    <section className="a-batten-inspector" data-testid="batten-inspector">
      <h3>{t('assembly.battens')}</h3>
      <details className="a-layer-help">
        <summary>{t('assembly.geometryHelp')}</summary>
        <p>{t('assembly.battenGeometricNote')}</p>
      </details>
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
          ['gaugeMm', 'battenGauge'],
          ['eaveOffsetMm', 'battenEaveOffset'],
          ['ridgeOffsetMm', 'battenRidgeOffset'],
        ] as const
      ).map(([field, label]) => (
        <DraftLengthField
          key={field}
          label={t(`assembly.${label}`)}
          value={layout[field] ?? 0}
          min={field === 'gaugeMm' ? 1 : 0}
          onCommit={(value) => update(field, value)}
        />
      ))}
      <h4>{t('assembly.battenResult')}</h4>
      <dl className="a-batten-results">
        <div>
          <dt>{t('assembly.battenRows')}</dt>
          <dd>{result.battens.length}</dd>
        </div>
        <div>
          <dt>{t('assembly.battenTotalLength')}</dt>
          <dd>
            {new Intl.NumberFormat(i18n.language, {
              maximumFractionDigits: 1,
            }).format(result.totalLengthMm / 1000)}{' '}
            m
          </dd>
        </div>
        <div>
          <dt>{t('assembly.battenGauge')}</dt>
          <dd>{length(layout.gaugeMm)}</dd>
        </div>
      </dl>
      {selectedRow && (
        <section
          className="a-batten-row-detail"
          data-testid="batten-row-detail"
        >
          <h4>
            {t('assembly.battenRow')} {selectedRow.id.split(':').at(-1)}
          </h4>
          <dl>
            <div>
              <dt>{t('assembly.roofPlane')}</dt>
              <dd>{planeName(selectedRow.roofPlaneId)}</dd>
            </div>
            <div>
              <dt>{t('assembly.battenPosition')}</dt>
              <dd>{length(selectedRow.stationMm)}</dd>
            </div>
            <div>
              <dt>{t('assembly.battenLength')}</dt>
              <dd>{length(selectedRow.usableLengthMm)}</dd>
            </div>
            <div>
              <dt>{t('assembly.battenSegments')}</dt>
              <dd>{selectedRow.segments.length}</dd>
            </div>
          </dl>
          <ol>
            {selectedRow.segments.map((segment, index) => (
              <li key={`${segment.fromUMm}:${segment.toUMm}`}>
                {t('assembly.segment')} {index + 1}:{' '}
                {length(segment.toUMm - segment.fromUMm)}
              </li>
            ))}
          </ol>
        </section>
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
