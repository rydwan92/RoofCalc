import { useTranslation } from 'react-i18next';
import type {
  RoofTileLayoutResult,
  TilePosition,
} from '@cieslacalc/covering-core';
import { tilePositionContribution } from '@cieslacalc/tile-procurement';
import { roofPlaneLabelKey } from './covering-presentation';
import type { TilePurchasePlan } from './tile-purchase';
import type { TileHighlight } from './workbench';
import './tile-purchase.css';

/** One highlight filter maps onto the layout's own position classes. */
export function matchesTileHighlight(
  classification: string,
  highlight: TileHighlight,
): boolean {
  switch (highlight) {
    case 'full':
      return classification === 'full';
    case 'cut':
      return classification !== 'full';
    case 'edge':
      return classification === 'cut-roof-edge';
    case 'opening':
      return classification === 'cut-opening';
    case 'split':
      return classification === 'split-by-opening';
  }
}

/**
 * V50 compact commercial summary above the covering drawing. It shows the
 * plan's numbers and hands off to the Material Plan; it never replaces the
 * technical covering view.
 */
export function TileDemandSummary({
  layout,
  plan,
  onOpenMaterials,
}: {
  layout: RoofTileLayoutResult;
  plan?: TilePurchasePlan;
  onOpenMaterials?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const number = (value: number) =>
    new Intl.NumberFormat(i18n.language).format(value);
  if (layout.status !== 'resolved') return null;
  const requirement = plan?.requirement;
  const toBuy = requirement
    ? (requirement.purchase?.purchasedPieces ?? requirement.requiredPieces)
    : undefined;
  return (
    <div className="a-tile-demand" data-testid="covering-tile-demand">
      <strong>{t('assembly.tileEvidence.demand')}</strong>
      <span>
        {t('assembly.tileEvidence.full')} <b>{number(layout.fullPositions)}</b>
      </span>
      <span>
        {t('assembly.tileEvidence.cut')} <b>{number(layout.cutPositions)}</b>
      </span>
      {toBuy !== undefined ? (
        <span data-testid="covering-tile-demand-buy">
          {t('assembly.tileEvidence.toBuy')}{' '}
          <b>
            {number(toBuy)} {t('assembly.cost.unitLabel.piece')}
          </b>
        </span>
      ) : (
        <span>{t('assembly.tileEvidence.planNotPrepared')}</span>
      )}
      {onOpenMaterials && (
        <button
          type="button"
          className="a-button a-ghost"
          data-testid="covering-open-material-plan"
          onClick={onOpenMaterials}
        >
          {t('assembly.tileEvidence.openMaterials')}
        </button>
      )}
    </div>
  );
}

/** Explains one position so a roofer can trust the count behind it. */
export function TileInspector({
  planeId,
  position,
  courseNumber,
  layerIndex,
  planPrepared,
  onClose,
}: {
  planeId: string;
  position: TilePosition;
  courseNumber: number;
  layerIndex: number;
  planPrepared: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const contribution = tilePositionContribution(position);
  return (
    <section
      className="a-tile-inspector"
      data-testid="tile-inspector"
      data-tile-class={position.classification}
    >
      <header>
        <strong>{t('assembly.tileEvidence.inspector')}</strong>
        <button
          type="button"
          className="a-tile-inspector-close"
          aria-label={t('assembly.tileEvidence.close')}
          onClick={onClose}
        >
          <span aria-hidden="true">×</span>
        </button>
      </header>
      <dl>
        <div>
          <dt>{t('assembly.tileEvidence.plane')}</dt>
          <dd>{t(roofPlaneLabelKey(planeId))}</dd>
        </div>
        <div>
          <dt>{t('assembly.tileEvidence.course')}</dt>
          <dd>
            {courseNumber}
            {layerIndex > 0
              ? ` · ${t('assembly.tileEvidence.layer', { layer: layerIndex + 1 })}`
              : ''}
          </dd>
        </div>
        <div>
          <dt>{t('assembly.tileEvidence.column')}</dt>
          <dd>{position.columnIndex + 1}</dd>
        </div>
        <div>
          <dt>{t('assembly.tileEvidence.type')}</dt>
          <dd data-testid="tile-inspector-class">
            {t(`assembly.tileEvidence.class.${position.classification}`)}
          </dd>
        </div>
        <div>
          <dt>{t('assembly.tileEvidence.openings')}</dt>
          <dd>
            {position.openingIds.length
              ? t('assembly.tileEvidence.openingCount', {
                  count: position.openingIds.length,
                })
              : t('assembly.tileEvidence.noOpening')}
          </dd>
        </div>
        {position.classification === 'split-by-opening' && (
          <div>
            <dt>{t('assembly.tileEvidence.fragments')}</dt>
            <dd>{position.visibleFragments.length}</dd>
          </div>
        )}
      </dl>
      <p data-testid="tile-inspector-contribution">
        {t(`assembly.tileEvidence.contribution.${contribution.basis}`, {
          count: contribution.baseTiles,
        })}
        {!planPrepared && ` ${t('assembly.tileEvidence.onceprepared')}`}
      </p>
    </section>
  );
}
