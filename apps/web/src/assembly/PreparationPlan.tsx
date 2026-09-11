import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type {
  FabricationOperationSummary,
  MemberFabricationPackage,
  RoofFabricationPackage,
} from '@cieslacalc/calculator-core';
import { formatLength, formatNumber } from '../format';
import { detailStepText } from './DetailPreview';
import { useAssembly } from './store';

function familyName(
  family: MemberFabricationPackage,
  t: ReturnType<typeof useTranslation>['t'],
) {
  return t(
    `assembly.${
      family.code === 'K1'
        ? 'commonRafter'
        : family.code === 'H1'
          ? 'hipRafter'
          : 'jackRafter'
    }`,
  );
}

function operationName(
  operation: FabricationOperationSummary,
  t: ReturnType<typeof useTranslation>['t'],
) {
  const purlinNumber = /support:purlin-(\d+)$/.exec(
    operation.relatedSupportId ?? '',
  )?.[1];
  return `${operation.code} ${t(`assembly.${operation.labelKey}`)}${purlinNumber ? ` P${purlinNumber}` : ''}`;
}

export function PreparationPlan({
  roofPackage,
}: {
  roofPackage: RoofFabricationPackage;
}) {
  const state = useAssembly();
  const { t, i18n } = useTranslation();
  const selectedFamily =
    roofPackage.families.find(
      (family) =>
        family.prototypeId === state.workbench.selectedId ||
        family.prototypeId === state.workbench.selectedPrototypeId,
    ) ??
    roofPackage.families.find((family) =>
      family.operations.some(
        (operation) => operation.id === state.workbench.activeOperationId,
      ),
    );
  const activeOperation = selectedFamily?.operations.find(
    (operation) => operation.id === state.workbench.activeOperationId,
  );
  const activate = (operation: FabricationOperationSummary) =>
    state.activateOperation({
      operationId: operation.id,
      prototypeId: operation.memberPrototypeId,
      selectionId: operation.detailPreview
        ? operation.detailPreview.sourceSelectionId
        : operation.memberPrototypeId,
      previewId: operation.detailPreview?.id,
    });
  const navigate = (direction: -1 | 1) => {
    if (!selectedFamily?.operations.length) return;
    const current = Math.max(
      0,
      selectedFamily.operations.findIndex(
        (operation) => operation.id === activeOperation?.id,
      ),
    );
    const next =
      (current + direction + selectedFamily.operations.length) %
      selectedFamily.operations.length;
    activate(selectedFamily.operations[next]!);
  };
  const length = (value: number) =>
    `${formatLength(value, state.unit, i18n.language)} ${state.unit}`;
  const angle = (value: number) => formatNumber(value, i18n.language);
  const stepText = (
    step: FabricationOperationSummary['markingSteps'][number],
  ) => {
    if ('operationId' in step)
      return detailStepText(
        step,
        t,
        (value) => formatLength(value, state.unit, i18n.language),
        angle,
        state.unit,
      );
    switch (step.action) {
      case 'measure-to-hip-center-plane':
        return t('assembly.j1StepMeasure', {
          value: length(step.distanceMm),
        });
      case 'mark-wall-seat':
        return t('assembly.j1StepSeat', {
          seat: length(step.joint.seatLengthMm),
          depth: length(step.joint.normalDepthMm),
        });
      case 'mark-hip-plumb':
        return t('assembly.j1StepPlumb', {
          value: `${angle(step.angleDeg)}°`,
        });
      case 'mark-hip-top-face-line':
        return t('assembly.j1StepTopFace', {
          value: `${angle(step.angleDeg)}°`,
        });
    }
  };
  const dimensionValue = (
    dimension: FabricationOperationSummary['dimensions'][number],
  ) =>
    dimension.unit === 'length'
      ? length(dimension.value)
      : dimension.unit === 'angle'
        ? `${angle(dimension.value)}°`
        : `${angle(dimension.value * 100)}%`;
  return (
    <section
      className="a-fabrication a-roof-preparation"
      aria-label={t('assembly.roofPreparationPlan')}
      data-testid="roof-fabrication-package"
    >
      <header>
        <div>
          <small>{t('assembly.fabricationPackage')}</small>
          <h2>{t('assembly.roofPreparationPlan')}</h2>
        </div>
        <span>{t(`assembly.${roofPackage.roofType}Roof`)}</span>
      </header>
      <div className="a-preparation-groups">
        {roofPackage.families.map((family) => (
          <button
            key={family.prototypeId}
            className="a-preparation-card"
            aria-pressed={selectedFamily?.prototypeId === family.prototypeId}
            onClick={() => {
              state.select(family.prototypeId);
              state.setPreparationExpanded(true);
            }}
          >
            <strong>{family.code}</strong>
            <span>{familyName(family, t)}</span>
            <b>{t('assembly.pieces', { count: family.quantity })}</b>
            <small>
              {family.lengthGroups.length === 1
                ? length(family.lengthGroups[0]!.lengthMm)
                : t('assembly.lengthGroupCount', {
                    count: family.lengthGroups.length,
                  })}
            </small>
          </button>
        ))}
      </div>
      {selectedFamily && state.workbench.preparationExpanded && (
        <div className="a-member-preparation" data-family={selectedFamily.code}>
          <header>
            <div>
              <strong>
                {selectedFamily.code} · {familyName(selectedFamily, t)}
              </strong>
              <span>
                {t('assembly.pieces', { count: selectedFamily.quantity })} ·{' '}
                {length(selectedFamily.section.widthMm)} ×{' '}
                {length(selectedFamily.section.depthMm)}
              </span>
            </div>
            <button
              className="a-text-button"
              onClick={() => state.setPreparationExpanded(false)}
            >
              {t('assembly.collapsePreparation')}
            </button>
          </header>
          <div className="a-operation-navigation">
            <button
              aria-label={t('assembly.previousOperation')}
              disabled={!selectedFamily.operations.length}
              onClick={() => navigate(-1)}
            >
              <ChevronLeft size={16} />
            </button>
            <div role="tablist" aria-label={t('assembly.elementPreparation')}>
              {selectedFamily.operations.map((operation) => (
                <button
                  key={operation.id}
                  role="tab"
                  aria-selected={activeOperation?.id === operation.id}
                  data-operation-status={operation.status}
                  onClick={() => activate(operation)}
                >
                  {operationName(operation, t)}
                </button>
              ))}
            </div>
            <button
              aria-label={t('assembly.nextOperation')}
              disabled={!selectedFamily.operations.length}
              onClick={() => navigate(1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="a-length-groups">
            {selectedFamily.lengthGroups.map((group) => (
              <span key={`${group.lengthMm}:${group.quantity}`}>
                <strong>{group.quantity}×</strong> {length(group.lengthMm)}
              </span>
            ))}
          </div>
          {activeOperation && (
            <section
              className="a-active-operation-summary"
              aria-label={t('assembly.activeOperation')}
            >
              <dl>
                {activeOperation.dimensions.map((dimension) => (
                  <div key={dimension.id}>
                    <dt>{t(`assembly.${dimension.labelKey}`)}</dt>
                    <dd>{dimensionValue(dimension)}</dd>
                  </div>
                ))}
              </dl>
              <h3>{t('assembly.markingSteps')}</h3>
              <ol className="a-detail-steps">
                {activeOperation.markingSteps.map((step, index) => (
                  <li key={'id' in step ? step.id : `${step.action}:${index}`}>
                    <span>{index + 1}</span>
                    <p>{stepText(step)}</p>
                  </li>
                ))}
              </ol>
            </section>
          )}
          {(activeOperation?.warningKeys ?? selectedFamily.warningKeys).map(
            (warning) => (
              <p className="a-limit-note" key={warning}>
                {t(`assembly.${warning}`)}
              </p>
            ),
          )}
        </div>
      )}
    </section>
  );
}
