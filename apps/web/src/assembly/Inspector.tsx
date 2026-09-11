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
  resolveOpeningFraming,
  resolveBattenLayout,
  resolveRoofFeatureCollisions,
  resolveNearestRoofWindowBay,
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
          {roofWindow && (
            <RoofWindowInspector feature={roofWindow} skeleton={skeleton} />
          )}
          {workbench.viewPreset === 'battens' && <BattenLayoutInspector />}
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

function DraftMillimetreField({
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
  const [raw, setRaw] = useState(String(value));
  useEffect(() => setRaw(String(value)), [value]);
  const parsed = Number(raw.replace(',', '.'));
  const invalid = raw.trim() === '' || !Number.isFinite(parsed) || parsed < min;
  const restore = () => setRaw(String(value));
  const commit = () => {
    if (invalid) {
      state.cancelTransaction();
      restore();
      return;
    }
    onCommit(parsed);
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
        <span>mm</span>
      </div>
      {invalid && <small>{t('assembly.invalidField')}</small>}
    </label>
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
  const planeName = (id: string) =>
    t(`assembly.${id.replace('roof-plane:', '')}`);
  return (
    <section className="a-batten-inspector" data-testid="batten-inspector">
      <h3>{t('assembly.battens')}</h3>
      <p>{t('assembly.battenGeometricNote')}</p>
      <h4>{t('assembly.battenGeometry')}</h4>
      {(
        [
          ['battenWidthMm', 'battenWidth'],
          ['battenHeightMm', 'battenHeight'],
        ] as const
      ).map(([field, label]) => (
        <DraftMillimetreField
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
        <DraftMillimetreField
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
          <dd>{layout.gaugeMm} mm</dd>
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
              <dd>{Math.round(selectedRow.stationMm)} mm</dd>
            </div>
            <div>
              <dt>{t('assembly.battenLength')}</dt>
              <dd>{Math.round(selectedRow.usableLengthMm)} mm</dd>
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
                {Math.round(segment.toUMm - segment.fromUMm)} mm
              </li>
            ))}
          </ol>
        </section>
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
  const { t } = useTranslation();
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
      <h3>
        {t('assembly.geometricOpening')}{' '}
        {feature.id.replace('feature:roof-window-', 'O')}
      </h3>
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
      {(
        [
          ['widthMm', 'windowWidth', feature.widthMm],
          ['heightMm', 'windowHeight', feature.heightMm],
          ['uMm', 'windowPositionU', feature.position.uMm],
          ['vMm', 'windowPositionV', feature.position.vMm],
        ] as const
      ).map(([field, label, value]) => (
        <DraftMillimetreField
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
          {Math.round(nearestBay.availableWidthMm)} mm
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
            ? `${t('assembly.openingTooWide')} ${Math.round(feedback.requiredWidthMm ?? feature.widthMm)} mm / ${Math.round(feedback.availableWidthMm)} mm.`
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
                <dd>{Math.round(framing.upperFramingMember!.lengthMm)} mm</dd>
              </div>
              <div>
                <dt>{t('assembly.lowerHeader')}</dt>
                <dd>{Math.round(framing.lowerFramingMember!.lengthMm)} mm</dd>
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
