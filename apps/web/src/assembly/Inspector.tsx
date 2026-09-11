import { useTranslation } from 'react-i18next';
import type {
  MemberInstanceContext,
  RoofFabricationPackage,
} from '@cieslacalc/calculator-core';
import type { DetailPreviewModel } from '@cieslacalc/drawing-engine';
import {
  HIP_RAFTER_PROTOTYPE_ID,
  JACK_RAFTER_PROTOTYPE_ID,
  resolveBattenLayout,
  resolveRoofFeatureCollisions,
} from '@cieslacalc/roof-math';
import type {
  ResolvedHipRafter,
  ResolvedRafterSpacing,
  RoofSkeleton,
  RoofWindowFeature,
} from '@cieslacalc/timber-model';
import { entityLabel } from './Canvas';
import {
  GeometryInputs,
  HipTimberInputs,
  NumberField,
  SupportInputs,
  TimberInputs,
  type Calculation,
} from './Inputs';
import { MemberInstanceInspector } from './MemberInstanceInspector';
import type { WorkbenchSelectionContext } from './selection';
import { useAssembly } from './store';
import { SpacingSummary } from './Summary';

export function Inspector({
  result,
  hip,
  skeleton,
  context,
  spacingEntries,
  detailPreviews,
  activeInstance,
  roofPackage,
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
  const battenLayout = state.projectDocument.project.buildUp.battenLayout;

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
          <strong>{entityLabel(workbench.selectedId, state, t)}</strong>
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
              <GeometryInputs includeLayout />
              {spacingEntries.map((entry) => (
                <SpacingSummary
                  key={`${entry.headingKey ?? 'gable'}:${entry.spacing.mode}`}
                  spacing={entry.spacing}
                  stationLabelKey={entry.stationLabelKey}
                  headingKey={entry.headingKey}
                />
              ))}
            </>
          )}
          {roofWindow && <RoofWindowInspector feature={roofWindow} skeleton={skeleton} />}
          {(workbench.viewPreset === 'battens' || battenLayout) && (
            <BattenLayoutInspector />
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
            <NumberField
              field="ridge.thicknessMm"
              label="ridgeWidth"
              max={1000}
            />
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

function BattenLayoutInspector() {
  const state = useAssembly();
  const { t, i18n } = useTranslation();
  const layout = state.projectDocument.project.buildUp.battenLayout ?? {
    enabled: true,
    battenHeightMm: 40,
    battenWidthMm: 60,
    gaugeMm: 350,
    eaveOffsetMm: 250,
  };
  const result = resolveBattenLayout({
    template: state.template,
    layout,
    features: state.projectDocument.project.features,
  });
  const update = (field: keyof typeof layout, raw: string) => {
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) return;
    state.setBattenLayout({ ...layout, [field]: value, enabled: true });
  };
  return (
    <section className="a-batten-inspector" data-testid="batten-inspector">
      <h3>{t('assembly.battens')}</h3>
      <p>{t('assembly.battenGeometricNote')}</p>
      {([
        ['battenWidthMm', 'battenWidth'],
        ['battenHeightMm', 'battenHeight'],
        ['gaugeMm', 'battenGauge'],
        ['eaveOffsetMm', 'battenEaveOffset'],
      ] as const).map(([field, label]) => (
        <label className="a-field" key={field}>
          <span>{t(`assembly.${label}`)}</span>
          <div>
            <input
              type="number"
              min={field === 'eaveOffsetMm' ? 0 : 1}
              aria-label={t(`assembly.${label}`)}
              value={layout[field]}
              onChange={(event) => update(field, event.target.value)}
            />
            <span>mm</span>
          </div>
        </label>
      ))}
      <dl className="a-batten-results">
        <div><dt>{t('assembly.battenRows')}</dt><dd>{result.battens.length}</dd></div>
        <div><dt>{t('assembly.battenTotalLength')}</dt><dd>{new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }).format(result.totalLengthMm / 1000)} m</dd></div>
        <div><dt>{t('assembly.battenGauge')}</dt><dd>{layout.gaugeMm} mm</dd></div>
      </dl>
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
  const { t } = useTranslation();
  const collisions = resolveRoofFeatureCollisions({
    template: state.template,
    skeleton,
    feature,
  });
  const change = (
    field: 'widthMm' | 'heightMm' | 'uMm' | 'vMm',
    raw: string,
  ) => {
    const value = Number(raw);
    if (
      !Number.isFinite(value) ||
      ((field === 'widthMm' || field === 'heightMm') && value <= 0)
    )
      return;
    state.updateRoofWindow(
      feature.id,
      field === 'uMm' || field === 'vMm'
        ? { position: { ...feature.position, [field === 'uMm' ? 'uMm' : 'vMm']: value } }
        : { [field]: value },
    );
  };
  return (
    <section className="a-window-inspector">
      <h3>{t('assembly.roofWindow')} {feature.id.replace('feature:roof-window-', 'O')}</h3>
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
          {(state.template.type === 'gable'
            ? ['roof-plane:left', 'roof-plane:right']
            : [
                'roof-plane:left',
                'roof-plane:right',
                'roof-plane:front',
                'roof-plane:rear',
              ]
          ).map((planeId) => (
            <option key={planeId} value={planeId}>
              {t(`assembly.${planeId.replace('roof-plane:', '')}`)}
            </option>
          ))}
        </select>
      </label>
      {([
        ['widthMm', 'windowWidth', feature.widthMm],
        ['heightMm', 'windowHeight', feature.heightMm],
        ['uMm', 'windowPositionU', feature.position.uMm],
        ['vMm', 'windowPositionV', feature.position.vMm],
      ] as const).map(([field, label, value]) => (
        <label className="a-field" key={field}>
          <span>{t(`assembly.${label}`)}</span>
          <div>
            <input
              type="number"
              min={field === 'uMm' || field === 'vMm' ? 0 : 1}
              aria-label={t(`assembly.${label}`)}
              value={value}
              onChange={(event) => change(field, event.target.value)}
            />
            <span>mm</span>
          </div>
        </label>
      ))}
      <p className={collisions.length ? 'a-window-warning' : 'a-window-clear'}>
        {collisions.length
          ? `${t('assembly.windowCollision')}: ${collisions.map((collision) => collision.memberInstanceId).join(', ')}`
          : t('assembly.windowClear')}
      </p>
      <button className="a-button" onClick={() => state.placeRoofWindowBetweenRafters(feature.id)}>
        {t('assembly.placeBetweenRafters')}
      </button>
      <button className="a-button" onClick={() => state.removeRoofWindow(feature.id)}>
        {t('assembly.removeRoofWindow')}
      </button>
    </section>
  );
}
