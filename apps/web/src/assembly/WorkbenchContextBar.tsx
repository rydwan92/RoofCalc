import {
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  adjacentMemberInstance,
  memberInstanceFabrication,
  type FabricationOperationSummary,
  type MemberInstanceContext,
  type RoofFabricationPackage,
} from '@cieslacalc/calculator-core';
import type { RoofMemberScheduleRow } from '@cieslacalc/quantity-core';
import { formatLength } from '../format';
import { useAssembly } from './store';
import { memberInstanceCode } from './workbench';

function familyName(
  code: MemberInstanceContext['familyCode'],
  t: ReturnType<typeof useTranslation>['t'],
) {
  return t(
    `assembly.${code === 'K1' ? 'commonRafter' : code === 'H1' ? 'hipRafter' : 'jackRafter'}`,
  );
}

function operationName(
  operation: FabricationOperationSummary,
  t: ReturnType<typeof useTranslation>['t'],
) {
  const purlin = /support:purlin-(\d+)$/.exec(
    operation.relatedSupportId ?? '',
  )?.[1];
  return `${operation.code} ${t(`assembly.${operation.labelKey}`)}${purlin ? ` P${purlin}` : ''}`;
}

export function WorkbenchContextBar({
  instances,
  activeInstance,
  roofPackage,
  activeOperation,
  selectedScheduleRow,
  openingSummary,
}: {
  instances: MemberInstanceContext[];
  activeInstance?: MemberInstanceContext;
  roofPackage: RoofFabricationPackage;
  activeOperation?: FabricationOperationSummary;
  selectedScheduleRow?: RoofMemberScheduleRow;
  openingSummary: {
    total: number;
    collisions: number;
    acceptedFraming: number;
    needsReview: number;
  };
}) {
  const state = useAssembly();
  const { t, i18n } = useTranslation();
  const prototypeId =
    activeInstance?.prototypeId ?? state.workbench.selectedPrototypeId;
  const family = roofPackage.families.find(
    (candidate) => candidate.prototypeId === prototypeId,
  );
  const fabrication = activeInstance
    ? memberInstanceFabrication(activeInstance, roofPackage)
    : undefined;
  const previous = activeInstance
    ? adjacentMemberInstance(instances, activeInstance.instanceId, -1)
    : undefined;
  const next = activeInstance
    ? adjacentMemberInstance(instances, activeInstance.instanceId, 1)
    : undefined;
  const goTo = (instance?: MemberInstanceContext) => {
    if (!instance) return;
    state.navigateToInstance({
      instanceId: instance.instanceId,
      prototypeId: instance.prototypeId,
      operationIds: instance.relatedOperationIds,
    });
  };
  const length = (value: number) =>
    `${formatLength(value, state.unit, i18n.language)} ${state.unit}`;
  const selectedId = state.workbench.selectedId;
  const selectedWindow = state.projectDocument.project.features.find(
    (feature) => feature.id === selectedId && feature.kind === 'roof-window',
  );
  const selectedPlane = /roof-plane:(left|right|front|rear)/.exec(
    selectedId,
  )?.[1];
  const scheduleSection = selectedScheduleRow?.section.widthMm
    ? selectedScheduleRow.section.depthMm === undefined
      ? `${length(selectedScheduleRow.section.widthMm)} × ?`
      : `${length(selectedScheduleRow.section.widthMm)} × ${length(selectedScheduleRow.section.depthMm)}`
    : selectedScheduleRow?.familyKey;
  const scheduleSelection = selectedScheduleRow
    ? `${scheduleSection} · ${selectedScheduleRow.quantity} ${t('assembly.piecesShort')}`
    : undefined;
  const simpleSelection =
    (state.workbench.selectedFeatureIds.length > 1
      ? t('assembly.selectedWindows', {
          count: state.workbench.selectedFeatureIds.length,
        })
      : undefined) ??
    scheduleSelection ??
    (selectedId.startsWith('surface:roof-plane:')
      ? t(`assembly.${selectedId.replace('surface:roof-plane:', '')}`)
      : selectedId.startsWith('counter-batten:')
        ? `${t('assembly.counterBattens')} · ${selectedPlane ? t(`assembly.${selectedPlane}`) : ''}`
        : selectedId.startsWith('batten:')
          ? `${t('assembly.battens')} · ${selectedPlane ? t(`assembly.${selectedPlane}`) : ''}`
          : selectedId.startsWith('feature:roof-window-')
            ? `${t('assembly.roofWindow')} O${selectedId.split('-').at(-1)}${selectedWindow ? ` · ${t(`assembly.${selectedWindow.roofPlaneId.replace('roof-plane:', '')}`)}` : ''}`
            : selectedId.startsWith('support:purlin-')
              ? `${t('assembly.purlins')} P${selectedId.split('-').at(-1)}`
              : selectedId === 'layer:membrane'
                ? t('assembly.membrane')
                : selectedId === 'layer:counter-battens'
                  ? t('assembly.counterBattens')
                  : selectedId === 'layer:battens'
                    ? t('assembly.battens')
                    : undefined);
  return (
    <section
      className="a-context-bar"
      aria-label={t('assembly.workbenchContext')}
      data-testid="workbench-context-bar"
    >
      <nav
        className="a-context-breadcrumb"
        aria-label={t('assembly.breadcrumb')}
      >
        <strong className="a-context-task">
          {t(`assembly.${state.workbench.viewPreset}Preset`)}
        </strong>
        {state.workbench.viewPreset === 'layers' && (
          <>
            <span aria-hidden="true">·</span>
            <strong>
              {t(`assembly.${state.workbench.buildUpView}LayerView`)}
            </strong>
          </>
        )}
        {!activeInstance && !simpleSelection && !activeOperation && (
          <>
            <span aria-hidden="true">·</span>
            <button
              onClick={() => state.select('roof')}
              aria-current={
                state.workbench.selectedId === 'roof' ? 'page' : undefined
              }
            >
              {t(`assembly.${roofPackage.roofType}Roof`)}
            </button>
          </>
        )}
        {simpleSelection && (
          <>
            <span aria-hidden="true">·</span>
            <strong aria-current="page">{simpleSelection}</strong>
          </>
        )}
        {family && !activeInstance && (
          <>
            <span aria-hidden="true">›</span>
            <button
              onClick={() => {
                state.select(family.prototypeId, family.prototypeId);
                state.setView('skeleton');
              }}
            >
              {family.code} {familyName(family.code, t)}
            </button>
          </>
        )}
        {activeInstance && (
          <>
            <span aria-hidden="true">›</span>
            <button onClick={() => goTo(activeInstance)}>
              {memberInstanceCode(activeInstance.instanceId)} ·{' '}
              {familyName(activeInstance.familyCode, t)}
            </button>
          </>
        )}
        {activeOperation && (
          <>
            <span aria-hidden="true">›</span>
            <strong aria-current="page">
              {operationName(activeOperation, t)}
            </strong>
          </>
        )}
      </nav>
      {state.workbench.viewPreset === 'openings' && (
        <div
          className="a-opening-context-facts"
          aria-label={t('assembly.openingSummary')}
        >
          <span>
            {t('assembly.openingCount', { count: openingSummary.total })}
          </span>
          <span>
            {t('assembly.openingCollisionCount', {
              count: openingSummary.collisions,
            })}
          </span>
          <span>
            {t('assembly.acceptedFramingCount', {
              count: openingSummary.acceptedFraming,
            })}
          </span>
          <span>
            {t('assembly.framingReviewCount', {
              count: openingSummary.needsReview,
            })}
          </span>
        </div>
      )}
      {activeInstance && (
        <div className="a-instance-navigator" data-testid="instance-navigator">
          <div className="a-instance-navigator-title">
            <strong>
              {activeInstance.familyCode} {activeInstance.instanceIndex}/
              {activeInstance.instanceCount}
            </strong>
            <span>
              {t(
                `assembly.${activeInstance.roofPlaneId ?? activeInstance.side}`,
              )}
              {activeInstance.hipCorner
                ? ` · ${t(`assembly.${activeInstance.hipCorner}`)}`
                : ''}
            </span>
          </div>
          <div className="a-instance-navigator-facts">
            <span>{length(activeInstance.lengthMm)}</span>
            <span>
              {t('assembly.sharedPrototype')} {activeInstance.familyCode}
            </span>
            <span>
              {t('assembly.lengthGroup')}{' '}
              {activeInstance.lengthGroupId.split(':').at(-1)}
              {fabrication
                ? ` · ${t('assembly.pieces', { count: fabrication.lengthGroup.quantity })}`
                : ''}
            </span>
          </div>
          <div className="a-instance-navigator-actions">
            <button
              aria-label={t('assembly.previousMember')}
              title={t('assembly.previousMember')}
              onClick={() => goTo(previous)}
            >
              <ChevronLeft size={17} />
              <span>{t('assembly.previous')}</span>
            </button>
            <button
              onClick={() => {
                state.setView('skeleton');
                state.setFocusId(undefined);
                state.setIsolation(false);
              }}
            >
              <Crosshair size={17} />
              <span>{t('assembly.showOnRoof')}</span>
            </button>
            <button
              aria-pressed={state.workbench.isolateSelection}
              onClick={() =>
                state.setIsolation(!state.workbench.isolateSelection)
              }
            >
              {state.workbench.isolateSelection ? (
                <Eye size={17} />
              ) : (
                <EyeOff size={17} />
              )}
              <span>
                {t(
                  `assembly.${state.workbench.isolateSelection ? 'showWholeRoof' : 'isolateElement'}`,
                )}
              </span>
            </button>
            <button
              aria-label={t('assembly.nextMember')}
              title={t('assembly.nextMember')}
              onClick={() => goTo(next)}
            >
              <span>{t('assembly.next')}</span>
              <ChevronRight size={17} />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
