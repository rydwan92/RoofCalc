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
import { formatLength } from '../format';
import { useAssembly } from './store';

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
}: {
  instances: MemberInstanceContext[];
  activeInstance?: MemberInstanceContext;
  roofPackage: RoofFabricationPackage;
  activeOperation?: FabricationOperationSummary;
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
        <button
          onClick={() => state.select('roof')}
          aria-current={
            state.workbench.selectedId === 'roof' ? 'page' : undefined
          }
        >
          {t(`assembly.${roofPackage.roofType}Roof`)}
        </button>
        {family && (
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
              {t('assembly.instanceShort', {
                current: activeInstance.instanceIndex,
                total: activeInstance.instanceCount,
              })}
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
