import { lazy, Suspense, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { CostScenario } from '@cieslacalc/cost-core';
import type { MembraneProductSelection } from '@cieslacalc/covering-core';
import { catalogClient } from '../catalog/client';
import { parseDecimal } from '../format';
import { usePriceOptions } from '../pricing/use-prices';
import { useAssembly } from './store';
import { materialCopy, materialText } from './material-copy';
import {
  acceptMaterialRow,
  compatibleMaterialPrices,
  createMaterialPlanRows,
  MATERIAL_CATEGORY_ORDER,
  materialValue,
  type MaterialSubgroup,
  type MaterialPlanRow,
  type MaterialPriceSelection,
} from './material-plan';
import { downloadMaterialCsv } from './material-csv';
import { MembraneMaterialCard } from './MembraneMaterialCard';
import type { ExportFacts } from './export-adapter';
import type {
  ProjectReadiness,
  ReadinessAction,
  ReadinessIssue,
} from './project-readiness';
import { readinessIssueText } from './readiness-copy';
import { LinearPurchasePanel } from './LinearPurchase';
import { TilePurchasePanel } from './TilePurchase';
import {
  DrainageGroupHead,
  LineComponentAdder,
  RoofSystemSummary,
} from './RoofSystemMaterials';
import type { RoofTileLayoutResult } from '@cieslacalc/covering-core';
import type {
  LinearMaterialKind,
  LinearMaterialRequirement,
  LinearPurchasePlan,
} from './linear-material-plan';
import type { LinearStockSelectionSpec } from '@cieslacalc/timber-model';

/**
 * V48: everything the Material Plan needs to turn a geometric requirement into
 * a purchase plan. Supplied by the workbench, which owns the resolved facts.
 */
export interface LinearPlanSurface {
  requirements: Partial<Record<LinearMaterialKind, LinearMaterialRequirement>>;
  selections: Partial<Record<LinearMaterialKind, LinearStockSelectionSpec>>;
  plans: Partial<Record<LinearMaterialKind, LinearPurchasePlan>>;
  onSelectionChange: (
    kind: LinearMaterialKind,
    selection?: LinearStockSelectionSpec,
  ) => void;
  onFixBlocker?: (kind: LinearMaterialKind, blocker: string) => void;
  /** V49: an explicit user decision to adopt a catalogue section. */
  onChangeSection?: (
    kind: LinearMaterialKind,
    section: { widthMm: number; depthMm: number },
  ) => void;
}

/** Which linear material a Material Plan row is, if any. */
function linearKindOf(labelKey: string): LinearMaterialKind | undefined {
  if (labelKey === 'battens') return 'batten';
  if (labelKey === 'counterBattens') return 'counter-batten';
  return undefined;
}

/** V47: which readiness issues explain a material row. */
function rowIssues(
  row: MaterialPlanRow,
  readiness: ProjectReadiness | undefined,
): ReadinessIssue[] {
  if (!readiness) return [];
  const matches = (issue: ReadinessIssue) =>
    row.labelKey === 'counterBattens'
      ? issue.code === 'hip-detail-required' ||
        issue.code === 'counter-battens-invalid'
      : row.labelKey === 'battens'
        ? issue.code.startsWith('battens')
        : row.labelKey === 'membrane'
          ? issue.code.startsWith('membrane')
          : row.category === 'drainage'
            ? false
            : row.category === 'covering'
              ? issue.code.startsWith('covering') ||
                issue.code === 'plane-scope-stale' ||
                issue.code === 'tile-eave-projection'
              : false;
  return readiness.issues.filter(
    (issue) => issue.severity !== 'info' && matches(issue),
  );
}

function RowReadiness({
  issues,
  onAction,
}: {
  issues: ReadinessIssue[];
  onAction?: (action: ReadinessAction) => void;
}) {
  const { t, i18n } = useTranslation();
  const unit = useAssembly((state) => state.unit);
  const issue = issues[0];
  if (!issue) return null;
  const text = readinessIssueText(t, issue, unit, i18n.language);
  return (
    <div
      className="mp-readiness"
      data-severity={issue.severity}
      data-testid="material-row-readiness"
    >
      <span aria-hidden="true">{issue.severity === 'blocker' ? '✕' : '⚠'}</span>
      <div>
        <strong>{text.title}</strong>
        <small>{text.description}</small>
      </div>
      {issue.action && onAction && (
        <button
          type="button"
          className="a-primary"
          data-readiness-action={issue.action}
          onClick={() => onAction(issue.action!)}
        >
          {t(`assembly.readiness.action.${issue.action}`)}
        </button>
      )}
    </div>
  );
}

const MembraneProductPicker = lazy(() =>
  import('../catalog/MembraneProductPicker').then((module) => ({
    default: module.MembraneProductPicker,
  })),
);

export function MaterialPlan({
  facts,
  membrane,
  scenario,
  prices,
  onPricesChange,
  onScenarioChange,
  onOpenCutting,
  onOpenLayers,
  onOpenCovering,
  onOpenCosting,
  onOpenExport,
  readiness,
  onReadinessAction,
  linear,
}: {
  facts: ExportFacts;
  readiness?: ProjectReadiness;
  onReadinessAction?: (action: ReadinessAction) => void;
  /** V48: resolved commercial planning surface for battens/counter-battens. */
  linear?: LinearPlanSurface;
  membrane?: MembraneProductSelection;
  scenario?: CostScenario;
  prices: Record<string, MaterialPriceSelection>;
  onPricesChange: (prices: Record<string, MaterialPriceSelection>) => void;
  onScenarioChange: (scenario: CostScenario) => void;
  onOpenCutting: () => void;
  onOpenLayers: () => void;
  onOpenCovering: () => void;
  onOpenCosting: () => void;
  onOpenExport: () => void;
}) {
  const { i18n } = useTranslation();
  const locale = i18n.language;
  const m = materialCopy(locale);
  const state = useAssembly();
  const [picker, setPicker] = useState(false);
  const [review, setReview] = useState<string>();
  const [kept, setKept] = useState<Record<string, string>>({});
  // V51: the drainage workspace; the first click also switches drainage on.
  const openDrainage = () => state.setMaterialsView('drainage');
  const rows = createMaterialPlanRows(facts, membrane);
  const options = usePriceOptions(
    rows.flatMap((row) =>
      row.product?.variantId ? [row.product.variantId] : [],
    ),
  );
  const currency = scenario?.currencyCode ?? 'PLN';
  const catalogue = useQuery({
    queryKey: ['catalog', 'manufacturers'],
    queryFn: ({ signal }) => catalogClient.listManufacturers(signal),
    retry: false,
    staleTime: 60_000,
  });
  const number = (value: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
  const money = (minor: number) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency }).format(
      minor / 100,
    );
  const unit = (value: string) =>
    ({
      piece: locale.startsWith('pl') ? 'szt.' : 'pcs',
      m2: 'm²',
      roll: locale.startsWith('pl') ? 'rol.' : 'rolls',
      course: locale.startsWith('pl') ? 'pas.' : 'courses',
      'piece/m2': locale.startsWith('pl') ? 'szt./m²' : 'pcs/m²',
      pack: locale.startsWith('pl') ? 'opak.' : 'packs',
      row: locale.startsWith('pl') ? 'rz.' : 'courses',
      pallet: locale.startsWith('pl') ? 'pal.' : 'pallets',
      m: 'm',
    })[value] ?? value;
  const activePrice = (row: MaterialPlanRow) => {
    const price = prices[row.id];
    if (price?.currencyCode !== currency) return undefined;
    if (price.source === 'manual') return price;
    return price.variantId === row.product?.variantId &&
      price.saleUnit === row.unit
      ? price
      : undefined;
  };
  const totals = rows
    .filter((row) => !row.partial)
    .flatMap((row) => {
      const value = materialValue(row, activePrice(row));
      return value ? [value] : [];
    });
  const totalMin = totals.reduce((sum, value) => sum + value.min, 0);
  const totalMax = totals.reduce((sum, value) => sum + value.max, 0);
  const basis = (row: MaterialPlanRow) =>
    row.range
      ? m.manufacturer
      : row.basis === 'procurement-stock'
        ? m.procurement
        : row.basis === 'fabrication-requirement'
          ? m.fabrication
          : m.geometry;
  /**
   * One status per row, so the four summary counts always add up to the rows.
   * V48: a resolved commercial plan makes the row a purchase row, exactly as
   * the badge says — the counts and the badge can never disagree.
   */
  const hasPurchasePlan = (row: MaterialPlanRow) => {
    const kind = linearKindOf(row.labelKey);
    return kind !== undefined && linear?.plans[kind] !== undefined;
  };
  const statusOf = (row: MaterialPlanRow) =>
    row.partial || row.suitability === 'manual-required'
      ? 'needs-data'
      : row.basis === 'procurement-stock' || hasPurchasePlan(row)
        ? 'purchase'
        : row.range
          ? 'estimate'
          : 'geometry';
  const displayQuantity = (row: MaterialPlanRow) =>
    row.range
      ? `${number(row.range.min)}–${number(row.range.max)}`
      : row.quantity !== undefined
        ? number(row.quantity)
        : '—';
  return (
    <section className="mp-workspace" data-testid="material-plan">
      <header className="mp-header">
        <div>
          <h2>{m.title}</h2>
          <small
            data-status={catalogue.isError ? 'warning' : 'neutral'}
            data-testid="catalogue-status"
          >
            {catalogue.isPending
              ? m.loading
              : catalogue.isError
                ? m.offline
                : m.online}
          </small>
          {catalogue.isError && (
            <button
              type="button"
              className="mp-retry"
              onClick={() => void catalogue.refetch()}
            >
              {m.retry}
            </button>
          )}
        </div>
        <div className="mp-actions">
          <button
            onClick={() =>
              downloadMaterialCsv(
                rows,
                prices,
                facts.source.projectName,
                locale,
              )
            }
          >
            {m.csv}
          </button>
          <button onClick={onOpenExport}>{m.export}</button>
        </div>
      </header>
      <div className="mp-summary">
        <span>
          {m.count}
          <strong>{rows.length}</strong>
        </span>
        <span>
          {m.purchaseCount}
          <strong>
            {rows.filter((row) => statusOf(row) === 'purchase').length}
          </strong>
        </span>
        <span>
          {m.geometryCount}
          <strong>
            {rows.filter((row) => statusOf(row) === 'geometry').length}
          </strong>
        </span>
        <span>
          {m.estimates}
          <strong>
            {rows.filter((row) => statusOf(row) === 'estimate').length}
          </strong>
        </span>
        <span>
          {m.needsData}
          <strong>
            {rows.filter((row) => statusOf(row) === 'needs-data').length}
          </strong>
        </span>
        <span>
          {m.known}
          <strong>
            {totalMin === totalMax
              ? money(totalMin)
              : `${money(totalMin)}–${money(totalMax)}`}
          </strong>
        </span>
      </div>
      <small>{m.incomplete}</small>
      {!rows.length && <p>{m.empty}</p>}
      <RoofSystemSummary
        facts={facts}
        rows={rows}
        locale={locale}
        onOpenDrainage={openDrainage}
      />
      {(() => {
        const renderRow = (row: MaterialPlanRow) => {
          const price = activePrice(row);
          const candidates = compatibleMaterialPrices(row, options, currency);
          const value = materialValue(row, price);
          const existing = scenario?.lines.find(
            (line) => line.id === row.id || line.id === row.costSuggestionKey,
          );
          const fingerprint = JSON.stringify([row.quantity, row.basis, price]);
          const changed =
            !!existing &&
            (existing.quantity.value !== row.quantity ||
              existing.quantityBasis !== row.basis ||
              existing.unitPriceMinor !== price?.amountMinor);
          const linearKind = linearKindOf(row.labelKey);
          const linearRequirement = linearKind
            ? linear?.requirements[linearKind]
            : undefined;
          const linearPlan = linearKind ? linear?.plans[linearKind] : undefined;
          const section = linearRequirement?.section;
          /**
           * V48 §27: once a purchase plan exists the row headline is the
           * commercial quantity. The geometric requirement stays visible
           * as its own metric, so a geometric length is never mislabelled
           * as a purchase length.
           */
          const purchaseCount = linearPlan
            ? linearPlan.stock.reduce((sum, item) => sum + item.quantity, 0)
            : undefined;
          // V50: the covering row of a roof-tile assignment carries the
          // tile purchase panel; accessory rows are plain rows.
          const tileAssignment =
            row.tileAssignmentId &&
            (row.labelKey === 'tile' || row.labelKey === 'tileBase')
              ? facts.coverings.find((item) => item.id === row.tileAssignmentId)
              : undefined;
          const tileLayout = tileAssignment
            ? (facts.coveringLayouts ?? []).find(
                (item): item is RoofTileLayoutResult =>
                  item.kind === 'roof-tile' &&
                  item.assignmentId === tileAssignment.id,
              )
            : undefined;
          const label = `${materialText(locale, row.labelKey)}${
            section ? ` ${section.widthMm}×${section.depthMm}` : ''
          }${row.description ? ` · ${row.description}` : ''}`;
          return (
            <article
              key={row.id}
              className="mp-row"
              data-testid={`material-row-${row.labelKey}`}
            >
              <RowReadiness
                issues={rowIssues(row, readiness)}
                onAction={onReadinessAction}
              />
              {row.labelKey === 'membrane' ? (
                <MembraneMaterialCard row={row} locale={locale} />
              ) : (
                <>
                  <div className="mp-row-main">
                    <div>
                      <h4>{label}</h4>
                      <span
                        className="mp-badge"
                        data-status={
                          purchaseCount !== undefined ||
                          row.basis === 'procurement-stock'
                            ? 'success'
                            : 'neutral'
                        }
                        data-testid={`material-basis-${row.labelKey}`}
                      >
                        {purchaseCount !== undefined
                          ? m.procurement
                          : basis(row)}
                      </span>
                      {row.partial && (
                        <span className="mp-badge" data-status="warning">
                          {m.partial}
                        </span>
                      )}
                      {linearPlan && (
                        <p
                          className="mp-linear-identity"
                          data-testid={`material-identity-${row.labelKey}`}
                        >
                          <span className="mp-badge">
                            {Object.values(linearPlan.stockSources).some(
                              (origin) => origin.kind === 'catalogue',
                            )
                              ? m.sourceCatalogueBadge
                              : m.sourceManualBadge}
                          </span>{' '}
                          {[...linearPlan.stock]
                            .sort((a, b) => a.lengthMm - b.lengthMm)
                            .map((item) => {
                              const origin =
                                linearPlan.stockSources[item.stockOptionId];
                              return `${item.quantity} × ${number(item.lengthMm / 1000)} m${
                                origin?.kind === 'catalogue'
                                  ? ` (${origin.productName})`
                                  : ''
                              }`;
                            })
                            .join(' · ')}
                        </p>
                      )}
                      {row.product?.name && (
                        <p>
                          <small>
                            {row.category === 'timber'
                              ? m.commercial
                              : row.productSource === 'catalog'
                                ? m.catalogue
                                : ''}
                          </small>
                          <br />
                          {row.product.name}
                        </p>
                      )}
                    </div>
                    <strong
                      className="mp-quantity"
                      data-testid={`material-quantity-${row.labelKey}`}
                    >
                      {purchaseCount !== undefined
                        ? number(purchaseCount)
                        : displayQuantity(row)}{' '}
                      <small>
                        {purchaseCount !== undefined
                          ? unit('piece')
                          : unit(row.unit)}
                      </small>
                    </strong>
                  </div>
                  {row.metrics.length > 0 && row.labelKey !== 'tileBase' && (
                    <dl className="mp-metrics">
                      {row.metrics.map((metric) => (
                        <div key={metric.labelKey}>
                          <dt>{materialText(locale, metric.labelKey)}</dt>
                          <dd>
                            {number(metric.value)}
                            {metric.maxValue !== undefined
                              ? `–${number(metric.maxValue)}`
                              : ''}{' '}
                            {unit(metric.unit)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </>
              )}
              {tileAssignment && (
                <TilePurchasePanel
                  assignment={tileAssignment}
                  layout={tileLayout}
                  plan={row.tilePlan}
                  locale={locale}
                  onShowOnRoof={(highlight) => {
                    state.setSelectedCoveringAssignment(tileAssignment.id);
                    state.setTileHighlight(highlight);
                    onOpenCovering();
                  }}
                />
              )}
              {linearKind && linearRequirement && linear && (
                <LinearPurchasePanel
                  kind={linearKind}
                  requirement={linearRequirement}
                  selection={linear.selections[linearKind]}
                  plan={linearPlan}
                  locale={locale}
                  onChange={(selection) =>
                    linear.onSelectionChange(linearKind, selection)
                  }
                  {...(linear.onFixBlocker
                    ? {
                        onFixBlocker: (blocker: string) =>
                          linear.onFixBlocker?.(linearKind, blocker),
                      }
                    : {})}
                  {...(linear.onChangeSection && linearKind === 'batten'
                    ? {
                        onChangeSection: (section: {
                          widthMm: number;
                          depthMm: number;
                        }) => linear.onChangeSection?.(linearKind, section),
                      }
                    : {})}
                />
              )}
              {row.range && <p className="mp-note">{m.rangeNote}</p>}
              {purchaseCount !== undefined ? (
                // V49 §34: a planned row is bought per commercial piece, and
                // one row can hold several lengths, so a per-metre price
                // here would multiply the wrong unit. Pieces are priced
                // per length in the estimate.
                <p
                  className="mp-note"
                  data-testid={`material-piece-pricing-${row.labelKey}`}
                >
                  {m.piecePricingInCost}
                </p>
              ) : (
                <div className="mp-price">
                  <label>
                    {m.selectPrice}
                    <select
                      aria-label={`${m.selectPrice} · ${label}`}
                      value={
                        price?.source === 'manual'
                          ? 'manual'
                          : (price?.entryId ?? '')
                      }
                      onChange={(event) => {
                        const selected = candidates.find(
                          (candidate) =>
                            candidate.entry.id === event.target.value,
                        );
                        const next = { ...prices };
                        if (selected)
                          next[row.id] = {
                            source: 'price-list',
                            amountMinor: selected.entry.netAmountMinor,
                            currencyCode: selected.currencyCode,
                            entryId: selected.entry.id,
                            variantId: selected.variantId,
                            saleUnit: selected.entry.saleUnit,
                            provenance: [
                              selected.ownerLabel,
                              selected.entry.validFrom,
                              m.net,
                              selected.entry.sourceAmountBasis === 'gross'
                                ? m.gross
                                : '',
                              selected.entry.sourceVatRateBps !== undefined
                                ? `VAT ${selected.entry.sourceVatRateBps / 100}%`
                                : selected.taxContext,
                            ]
                              .filter(Boolean)
                              .join(' · '),
                          };
                        else if (event.target.value === 'manual')
                          next[row.id] = {
                            source: 'manual',
                            amountMinor: 0,
                            currencyCode: currency,
                            provenance: m.manual,
                            valid: false,
                          };
                        else delete next[row.id];
                        onPricesChange(next);
                      }}
                    >
                      <option value="">
                        {candidates.length ? m.selectPrice : m.noPrice}
                      </option>
                      {candidates.map((candidate) => (
                        <option
                          key={candidate.entry.id}
                          value={candidate.entry.id}
                        >
                          {candidate.ownerLabel ?? m.catalogue} ·{' '}
                          {candidate.entry.validFrom} ·{' '}
                          {money(candidate.entry.netAmountMinor)}/
                          {unit(candidate.entry.saleUnit)} · {m.net}
                          {candidate.entry.sourceVatRateBps !== undefined
                            ? ` · VAT ${candidate.entry.sourceVatRateBps / 100}%`
                            : ''}
                        </option>
                      ))}
                      {price?.source === 'price-list' &&
                        !candidates.some(
                          (candidate) => candidate.entry.id === price.entryId,
                        ) && (
                          <option value={price.entryId}>
                            {price.provenance} · {money(price.amountMinor)}
                          </option>
                        )}
                      <option value="manual">{m.manual}</option>
                    </select>
                  </label>
                  {price?.source === 'manual' && (
                    <label>
                      {m.manualPrice}
                      <input
                        aria-label={`${m.manualPrice} · ${label}`}
                        inputMode="decimal"
                        defaultValue={number(price.amountMinor / 100)}
                        onChange={() =>
                          onPricesChange({
                            ...prices,
                            [row.id]: { ...price, valid: false },
                          })
                        }
                        onBlur={(event) => {
                          const parsed = parseDecimal(event.target.value);
                          if (parsed !== null && parsed >= 0)
                            onPricesChange({
                              ...prices,
                              [row.id]: {
                                ...price,
                                amountMinor: Math.round(parsed * 100),
                                valid: true,
                              },
                            });
                        }}
                      />
                    </label>
                  )}
                  {price && (
                    <div>
                      <strong>
                        {money(price.amountMinor)}/{unit(row.unit)}
                      </strong>
                      <small>
                        {price.source === 'manual'
                          ? m.manual
                          : price.provenance}
                      </small>
                      {price.source === 'price-list' && (
                        <small>{m.verify}</small>
                      )}
                    </div>
                  )}
                  {value && (
                    <strong className="mp-value">
                      {value.min === value.max
                        ? money(value.min)
                        : `${money(value.min)}–${money(value.max)}`}
                      <small>{row.range ? m.rangeCost : m.value}</small>
                    </strong>
                  )}
                </div>
              )}
              <div className="mp-actions">
                {row.category === 'timber' && (
                  <button onClick={onOpenCutting}>{m.chooseTimber}</button>
                )}
                {row.labelKey === 'membrane' && (
                  <>
                    <button onClick={() => setPicker(true)}>
                      {m.chooseMembrane}
                    </button>
                    <button onClick={onOpenLayers}>{m.parameters}</button>
                  </>
                )}
                {row.labelKey === 'battens' ||
                row.labelKey === 'counterBattens' ? (
                  <button onClick={onOpenLayers}>{m.parameters}</button>
                ) : null}
                {row.category === 'covering' && (
                  <button onClick={onOpenCovering}>{m.chooseCovering}</button>
                )}
                {scenario &&
                  price &&
                  value &&
                  !row.range &&
                  (!existing || changed) &&
                  kept[row.id] !== fingerprint && (
                    <button
                      className="a-primary"
                      onClick={() => {
                        if (existing) setReview(row.id);
                        else
                          onScenarioChange(
                            acceptMaterialRow(scenario, row, price, label),
                          );
                      }}
                    >
                      {existing ? m.update : m.add}
                    </button>
                  )}
                {row.range && (
                  <button onClick={onOpenCosting}>{m.rangeAction}</button>
                )}
              </div>
              {review === row.id && existing && price && scenario && (
                <div className="mp-review" role="status">
                  <strong>{m.review}</strong>
                  <p>
                    {number(existing.quantity.value)}{' '}
                    {unit(existing.quantity.unit)} →{' '}
                    {existing.source === 'manual'
                      ? number(existing.quantity.value)
                      : displayQuantity(row)}{' '}
                    {unit(row.unit)}
                    <br />
                    {m.price}:{' '}
                    {existing.unitPriceMinor === undefined
                      ? '—'
                      : money(existing.unitPriceMinor)}{' '}
                    → {money(price.amountMinor)}
                  </p>
                  {existing.source === 'manual' && <p>{m.manualOwned}</p>}
                  <button
                    onClick={() => {
                      onScenarioChange(
                        acceptMaterialRow(scenario, row, price, label),
                      );
                      setReview(undefined);
                    }}
                  >
                    {m.update}
                  </button>
                  <button
                    onClick={() => {
                      setKept({ ...kept, [row.id]: fingerprint });
                      setReview(undefined);
                    }}
                  >
                    {m.keep}
                  </button>
                </div>
              )}
              <details>
                <summary>{m.details}</summary>
                <p>{basis(row)}</p>
                {row.product?.facts.map((fact) => (
                  <p key={fact}>{fact}</p>
                ))}
                {row.warnings.map((warning) => (
                  <p key={warning}>{materialText(locale, warning)}</p>
                ))}
              </details>
            </article>
          );
        };
        return MATERIAL_CATEGORY_ORDER.map((category) => {
          const categoryRows = rows.filter((row) => row.category === category);
          if (category === 'drainage')
            return (
              <div
                key={category}
                className="mp-group"
                data-testid="material-group-drainage"
              >
                <h3>{m.drainage}</h3>
                <DrainageGroupHead
                  facts={facts}
                  locale={locale}
                  onOpen={openDrainage}
                />
                {/* One readiness line for the whole group, not per row. */}
                <RowReadiness
                  issues={(readiness?.issues ?? []).filter((issue) =>
                    issue.code.startsWith('drainage'),
                  )}
                  onAction={onReadinessAction}
                />
                {categoryRows.map(renderRow)}
              </div>
            );
          if (category === 'eave')
            return (
              <div
                key={category}
                className="mp-group"
                data-testid="material-group-eave"
              >
                <h3>{m.eave}</h3>
                {categoryRows.map(renderRow)}
                <LineComponentAdder
                  facts={facts}
                  locale={locale}
                  roles={[
                    'eave-strip',
                    'eave-flashing',
                    'eave-comb',
                    'ventilation-comb',
                  ]}
                  empty={!categoryRows.length}
                />
              </div>
            );
          if (!categoryRows.length) return null;
          if (category === 'covering') {
            const order: MaterialSubgroup[] = [
              'tile',
              'ridge',
              'verge',
              'accessory',
            ];
            const present = order.filter((group) =>
              categoryRows.some((row) => (row.subgroup ?? 'tile') === group),
            );
            return (
              <div
                key={category}
                className="mp-group"
                data-testid="material-group-covering"
              >
                <h3>{m.covering}</h3>
                {present.map((group) => (
                  <div key={group} data-subgroup={group}>
                    {present.length > 1 && (
                      <p className="mp-subgroup">
                        {
                          m[
                            `subgroup${group[0]!.toUpperCase()}${group.slice(1)}` as 'subgroupTile'
                          ]
                        }
                      </p>
                    )}
                    {categoryRows
                      .filter((row) => (row.subgroup ?? 'tile') === group)
                      .map(renderRow)}
                  </div>
                ))}
                <LineComponentAdder
                  facts={facts}
                  locale={locale}
                  roles={['ridge-tape']}
                  empty={false}
                />
              </div>
            );
          }
          return (
            <div key={category} className="mp-group">
              <h3>{m[category]}</h3>
              {categoryRows.map(renderRow)}
            </div>
          );
        });
      })()}
      {picker && (
        <Suspense fallback={<p>{m.loading}</p>}>
          <MembraneProductPicker
            onApply={(product) => {
              state.setMembraneProduct(product);
              setPicker(false);
            }}
            onClose={() => setPicker(false)}
            onManual={() => {
              setPicker(false);
              onOpenLayers();
            }}
          />
        </Suspense>
      )}
    </section>
  );
}
