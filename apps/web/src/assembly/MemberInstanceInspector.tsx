import { useTranslation } from 'react-i18next';
import type {
  MemberInstanceContext,
  RoofFabricationPackage,
} from '@cieslacalc/calculator-core';
import type { RoofSkeleton } from '@cieslacalc/timber-model';
import { formatLength } from '../format';
import { OrientationMiniMap } from './OrientationMiniMap';
import { useAssembly } from './store';

export function MemberInstanceInspector({
  instance,
  skeleton,
  roofPackage,
}: {
  instance: MemberInstanceContext;
  skeleton: RoofSkeleton;
  roofPackage: RoofFabricationPackage;
}) {
  const state = useAssembly();
  const { t, i18n } = useTranslation();
  const family = roofPackage.families.find(
    (candidate) => candidate.prototypeId === instance.prototypeId,
  );
  const length = (value: number) =>
    `${formatLength(value, state.unit, i18n.language)} ${state.unit}`;
  return (
    <section
      className="a-member-instance-inspector"
      data-testid="member-instance-inspector"
      data-family={instance.familyCode}
      aria-label={t('assembly.instanceInspector')}
    >
      <header>
        <span className="a-context-badge">
          {t('assembly.physicalInstance')}
        </span>
        <strong>
          {instance.familyCode} ·{' '}
          {t(
            `assembly.${instance.familyCode === 'K1' ? 'commonRafter' : instance.familyCode === 'H1' ? 'hipRafter' : 'jackRafter'}`,
          )}
        </strong>
        <small>
          {t('assembly.instanceOf', {
            current: instance.instanceIndex,
            total: instance.instanceCount,
          })}
        </small>
      </header>
      <OrientationMiniMap skeleton={skeleton} instance={instance} />
      <dl className="a-facts">
        <div>
          <dt>{t('assembly.stableId')}</dt>
          <dd className="a-technical-id">{instance.instanceId}</dd>
        </div>
        <div>
          <dt>{t('assembly.roofPlane')}</dt>
          <dd>{t(`assembly.${instance.roofPlaneId ?? instance.side}`)}</dd>
        </div>
        {instance.hipCorner && (
          <div>
            <dt>{t('assembly.corner')}</dt>
            <dd>{t(`assembly.${instance.hipCorner}`)}</dd>
          </div>
        )}
        {instance.buildingStationMm !== undefined && (
          <div>
            <dt>{t('assembly.positionAlongBuilding')}</dt>
            <dd>{length(instance.buildingStationMm)}</dd>
          </div>
        )}
        <div>
          <dt>{t('assembly.exactLength')}</dt>
          <dd>{length(instance.lengthMm)}</dd>
        </div>
        <div>
          <dt>{t('assembly.section')}</dt>
          <dd>
            {length(instance.section.widthMm)} ×{' '}
            {length(instance.section.depthMm)}
          </dd>
        </div>
        <div>
          <dt>{t('assembly.lengthGroup')}</dt>
          <dd>{instance.lengthGroupId.split(':').at(-1)}</dd>
        </div>
        <div>
          <dt>{t('assembly.prototype')}</dt>
          <dd>
            {instance.familyCode} ·{' '}
            {t('assembly.sharedByPieces', {
              count: family?.quantity ?? instance.instanceCount,
            })}
          </dd>
        </div>
      </dl>
      <p className="a-help">{t('assembly.sharedPrototypeEditNote')}</p>
      <div
        className="a-instance-operation-list"
        aria-label={t('assembly.instanceOperations')}
      >
        <h3>{t('assembly.instanceOperations')}</h3>
        {instance.operations.map((operation) => (
          <button
            key={operation.operationId}
            aria-pressed={
              state.workbench.activeOperationId === operation.operationId
            }
            data-operation-status={operation.status}
            onClick={() =>
              state.activateOperation({
                operationId: operation.operationId,
                prototypeId: instance.prototypeId,
                selectionId: operation.operationId,
                instanceId: instance.instanceId,
                previewId: operation.detailPreviewId,
              })
            }
          >
            <strong>{operation.code}</strong>
            <span>{t(`assembly.${operation.labelKey}`)}</span>
            <small>
              {t(
                `assembly.${operation.status === 'resolved' ? 'operationResolved' : 'operationLimited'}`,
              )}
            </small>
          </button>
        ))}
      </div>
      {instance.warningKeys.map((warning) => (
        <p className="a-limit-note" key={warning}>
          {t(`assembly.${warning}`)}
        </p>
      ))}
    </section>
  );
}
