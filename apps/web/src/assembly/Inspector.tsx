import { useTranslation } from 'react-i18next';
import type {
  MemberInstanceContext,
  RoofFabricationPackage,
} from '@cieslacalc/calculator-core';
import type { DetailPreviewModel } from '@cieslacalc/drawing-engine';
import {
  HIP_RAFTER_PROTOTYPE_ID,
  JACK_RAFTER_PROTOTYPE_ID,
} from '@cieslacalc/roof-math';
import type {
  ResolvedHipRafter,
  ResolvedRafterSpacing,
  RoofSkeleton,
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
