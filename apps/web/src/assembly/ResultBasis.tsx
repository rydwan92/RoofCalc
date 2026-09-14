import { useTranslation } from 'react-i18next';
import type { QuantitySemanticKind } from '@cieslacalc/quantity-core';

const presentation = {
  'axis-geometric': {
    layer: 'geometry',
    title: 'axisGeometric',
  },
  'resolved-visible': {
    layer: 'geometry',
    title: 'resolvedVisible',
  },
  'net-geometric': {
    layer: 'geometry',
    title: 'netGeometric',
  },
  'effective-coverage-position': {
    layer: 'effectiveCoverage',
    title: 'effectiveCoveragePosition',
  },
  'geometric-panel-run': {
    layer: 'geometry',
    title: 'geometricPanelRun',
  },
} as const satisfies Record<
  QuantitySemanticKind,
  { layer: 'geometry' | 'effectiveCoverage'; title: string }
>;

export function ResultBasis({
  semantic,
  compact = false,
}: {
  semantic: QuantitySemanticKind;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const item = presentation[semantic];
  return (
    <details
      className={`a-result-basis ${compact ? 'is-compact' : ''}`}
      data-testid="result-basis"
      data-semantic={semantic}
    >
      <summary>
        <span className="a-result-basis-badge">
          {t(`assembly.resultBasis.layer.${item.layer}`)}
        </span>
        <span>{t(`assembly.resultBasis.title.${item.title}`)}</span>
      </summary>
      <p>{t(`assembly.resultBasis.detail.${item.title}`)}</p>
    </details>
  );
}

export function ResultLayerProgress({
  scope,
}: {
  scope: 'schedule' | 'covering';
}) {
  const { t } = useTranslation();
  return (
    <details
      className="a-result-layer-progress"
      data-testid={`result-layer-progress-${scope}`}
    >
      <summary>{t('assembly.resultLayers.summary')}</summary>
      <ol aria-label={t('assembly.resultLayers.label')}>
        <li data-layer="geometry" data-state="resolved">
          <span>{t('assembly.resultLayers.geometry')}</span>
          <strong>{t(`assembly.resultLayers.${scope}Geometry`)}</strong>
        </li>
        <li data-layer="execution" data-state="pending">
          <span>{t('assembly.resultLayers.execution')}</span>
          <strong>{t('assembly.resultLayers.executionPending')}</strong>
        </li>
        <li
          data-layer="cutting"
          data-state={scope === 'schedule' ? 'pending' : 'unavailable'}
        >
          <span>{t('assembly.resultLayers.cutting')}</span>
          <strong>{t(`assembly.resultLayers.${scope}Cutting`)}</strong>
        </li>
        <li data-layer="purchase" data-state="pending">
          <span>{t('assembly.resultLayers.purchase')}</span>
          <strong>{t('assembly.resultLayers.purchasePending')}</strong>
        </li>
      </ol>
    </details>
  );
}
