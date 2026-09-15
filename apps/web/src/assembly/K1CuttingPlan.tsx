import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  aggregateStockRequirements,
  createCuttingPlan,
  type CuttingPlan,
  type CuttingSettings,
  type OptimizationObjective,
  type StockUsage,
} from '@cieslacalc/procurement-core';
import {
  fromMillimetres,
  toMillimetres,
  type LengthUnit,
} from '@cieslacalc/roof-math';
import { formatLength, parseDecimal } from '../format';
import type { TimberStockCatalogPick } from '../catalog/TimberStockProductPicker';
import type { VariantPrice } from '../pricing/client';
import { usePricesForVariants } from '../pricing/use-prices';
import { MobileSheet } from './MobileSheet';
import {
  k1RequirementSignature,
  type K1CuttingRequirement,
} from './k1-cutting-adapter';

const TimberStockProductPicker = lazy(() =>
  import('../catalog/TimberStockProductPicker').then((module) => ({
    default: module.TimberStockProductPicker,
  })),
);

type ResolvedRequirement = Extract<
  K1CuttingRequirement,
  { status: 'resolved' }
>;
type StockDraft = {
  id: number;
  length: string;
  availability: string;
  sourceLabel?: string;
  commercialVariantId?: string;
};
type Scenario = {
  unit: LengthUnit;
  stocks: StockDraft[];
  kerf: string;
  endTrim: string;
  remnant: string;
};
export interface K1SessionPlan {
  signature: string;
  value: CuttingPlan;
  settings: CuttingSettings;
  scenario: Scenario;
  objective: OptimizationObjective;
}

function convertDraft(raw: string, from: LengthUnit, to: LengthUnit) {
  const number = parseDecimal(raw);
  return number === null
    ? raw
    : String(fromMillimetres(toMillimetres(number, from), to));
}

function initialScenario(unit: LengthUnit): Scenario {
  return {
    unit,
    stocks: [{ id: 1, length: '', availability: '' }],
    kerf: '0',
    endTrim: '0',
    remnant: '0',
  };
}

function formatMm(mm: number, unit: LengthUnit, locale: string) {
  return `${formatLength(mm, unit, locale)} ${unit}`;
}

function metric(mm: number, locale: string) {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(mm / 1000)} m`;
}

function money(minor: number, currencyCode: string, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
  }).format(minor / 100);
}

function StockLayout({
  usage,
  labels,
  unit,
}: {
  usage: StockUsage;
  labels: Map<string, string>;
  unit: LengthUnit;
}) {
  const { t, i18n } = useTranslation();
  const segments: Array<{ kind: string; length: number; label: string }> = [];
  let cursor = 0;
  for (const cut of usage.cuts) {
    if (cut.fromMm > cursor) {
      segments.push({
        kind: cursor === 0 ? 'trim' : 'kerf',
        length: cut.fromMm - cursor,
        label: t(
          cursor === 0
            ? 'assembly.k1Cutting.endTrim'
            : 'assembly.k1Cutting.kerf',
        ),
      });
    }
    segments.push({
      kind: 'piece',
      length: cut.requiredBlankLengthMm,
      label: labels.get(cut.requiredPieceId) ?? 'K1',
    });
    cursor = cut.toMm;
  }
  const finalTrim = usage.endTrimLossMm / 2;
  const remainder = Math.max(0, usage.originalLengthMm - cursor - finalTrim);
  if (remainder > 0)
    segments.push({
      kind:
        usage.remnantClassification === 'reusable-remnant'
          ? 'reusable'
          : 'waste',
      length: remainder,
      label: t(
        usage.remnantClassification === 'reusable-remnant'
          ? 'assembly.k1Cutting.reusable'
          : 'assembly.k1Cutting.waste',
      ),
    });
  if (finalTrim > 0)
    segments.push({
      kind: 'trim',
      length: finalTrim,
      label: t('assembly.k1Cutting.endTrim'),
    });

  return (
    <div className="a-k1-stock-layout" data-testid="k1-stock-layout">
      <div
        className="a-k1-stock-bar"
        aria-label={t('assembly.k1Cutting.stockLayout')}
      >
        {segments.map((segment, index) => (
          <span
            key={`${segment.kind}-${index}`}
            className={`is-${segment.kind}`}
            style={{
              width: `${(segment.length / usage.originalLengthMm) * 100}%`,
            }}
            title={`${segment.label}: ${formatMm(segment.length, unit, i18n.language)}`}
          >
            {segment.kind === 'piece' && segment.label}
          </span>
        ))}
      </div>
      <small>
        {usage.cuts
          .map((cut) => labels.get(cut.requiredPieceId) ?? 'K1')
          .join(' · ')}
        {' · '}
        {t('assembly.k1Cutting.remainder')}:{' '}
        {formatMm(usage.remainingLengthMm, unit, i18n.language)}
        {' · '}
        {usage.remnantClassification === 'reusable-remnant'
          ? t('assembly.k1Cutting.reusable')
          : t('assembly.k1Cutting.waste')}
      </small>
    </div>
  );
}

function MaterialCost({
  plan,
  stockPricing,
  locale,
}: {
  plan: CuttingPlan;
  stockPricing: Map<string, VariantPrice>;
  locale: string;
}) {
  const { t } = useTranslation();
  const lines = plan.stockUsages.map((usage, index) => ({
    index,
    usage,
    price: stockPricing.get(usage.stockOptionId),
  }));
  const priced = lines.filter(
    (line): line is typeof line & { price: VariantPrice } =>
      line.price !== undefined,
  );
  if (!priced.length) return null;
  const currencyCode = priced[0]!.price.currencyCode;
  const sameCurrency = priced.every(
    (line) => line.price.currencyCode === currencyCode,
  );
  const totalMinor = sameCurrency
    ? priced.reduce((sum, line) => sum + line.price.entry.netAmountMinor, 0)
    : undefined;
  const unpricedCount = plan.stockUsages.length - priced.length;
  return (
    <section className="a-k1-material-cost" data-testid="k1-material-cost">
      <h3>{t('assembly.k1Cutting.materialCost')}</h3>
      <ul>
        {priced.map((line) => (
          <li key={line.usage.stockInstanceId}>
            <span>
              {t('assembly.k1Cutting.stockItem')} {line.index + 1}
            </span>
            <span>
              {money(
                line.price.entry.netAmountMinor,
                line.price.currencyCode,
                locale,
              )}
            </span>
          </li>
        ))}
      </ul>
      {totalMinor !== undefined && (
        <p className="a-k1-material-cost-total">
          <b>{t('assembly.k1Cutting.materialCostTotal')}</b>{' '}
          {money(totalMinor, currencyCode, locale)}
        </p>
      )}
      {unpricedCount > 0 && (
        <p className="a-k1-material-cost-unpriced">
          {t('assembly.k1Cutting.materialCostUnpriced', {
            count: unpricedCount,
          })}
        </p>
      )}
      <p className="a-k1-material-cost-disclaimer">
        {t('assembly.k1Cutting.materialCostDisclaimer')}
      </p>
    </section>
  );
}

function CuttingResult({
  plan,
  requirement,
  settings,
  projectName,
  unit,
  stockPricing,
}: {
  plan: CuttingPlan;
  requirement: ResolvedRequirement;
  settings: CuttingSettings;
  projectName?: string;
  unit: LengthUnit;
  stockPricing: Map<string, VariantPrice>;
}) {
  const { t, i18n } = useTranslation();
  const [copied, setCopied] = useState(false);
  const grouped = useMemo(() => {
    const byLength = new Map<number, number>();
    for (const row of aggregateStockRequirements(plan))
      byLength.set(
        row.lengthMm,
        (byLength.get(row.lengthMm) ?? 0) + row.quantity,
      );
    return [...byLength].sort((a, b) => a[0] - b[0]);
  }, [plan]);
  const labels = useMemo(
    () =>
      new Map(
        requirement.requiredPieces.map((piece, index) => [
          piece.id,
          `K1-${String(index + 1).padStart(2, '0')}`,
        ]),
      ),
    [requirement.requiredPieces],
  );
  const section = requirement.blank.section;
  const sectionLabel = `${formatLength(section.widthMm, unit, i18n.language)} × ${formatLength(section.depthMm, unit, i18n.language)} ${unit}`;
  const copyList = async () => {
    const lines = [
      ...(projectName ? [projectName] : []),
      `${t('assembly.k1Cutting.purchaseList')} — K1`,
      `${t('assembly.section')}: ${sectionLabel}`,
      ...grouped.map(
        ([lengthMm, quantity]) =>
          `${formatMm(lengthMm, unit, i18n.language)} × ${quantity} ${t('assembly.piecesShort')}`,
      ),
      `${t('assembly.k1Cutting.blank')}: ${formatMm(requirement.blank.requiredBlankLengthMm, unit, i18n.language)} × ${requirement.requiredPieces.length}`,
      `${t('assembly.k1Cutting.kerf')}: ${formatMm(settings.kerfMm, unit, i18n.language)}; ${t('assembly.k1Cutting.endTrim')}: ${formatMm(settings.endTrimMm, unit, i18n.language)}; ${t('assembly.k1Cutting.minimumRemnant')}: ${formatMm(settings.minimumReusableRemnantMm, unit, i18n.language)}`,
      ...(plan.unassignedPieces.length
        ? [
            `${t('assembly.k1Cutting.unassigned')}: ${plan.unassignedPieces.length}`,
          ]
        : []),
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="a-k1-result" data-testid="k1-cutting-result">
      <section className="a-k1-purchase" data-testid="k1-purchase-list">
        <header>
          <div>
            <small>{t('assembly.k1Cutting.materialPlan')}</small>
            <h3>{t('assembly.k1Cutting.purchaseList')}</h3>
          </div>
          <button
            type="button"
            className="a-button"
            onClick={() => void copyList()}
          >
            {copied
              ? t('assembly.k1Cutting.copied')
              : t('assembly.k1Cutting.copyList')}
          </button>
        </header>
        <p>K1 · {sectionLabel}</p>
        {grouped.length ? (
          <ul>
            {grouped.map(([lengthMm, quantity]) => (
              <li key={lengthMm}>
                <strong>{formatMm(lengthMm, unit, i18n.language)}</strong>
                <span>
                  × {quantity} {t('assembly.piecesShort')}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p>{t('assembly.k1Cutting.noStockAssigned')}</p>
        )}
      </section>
      <MaterialCost
        plan={plan}
        stockPricing={stockPricing}
        locale={i18n.language}
      />
      {plan.unassignedPieces.length > 0 && (
        <div
          className="a-k1-unassigned"
          role="alert"
          data-testid="k1-unassigned-warning"
        >
          <strong>
            {t('assembly.k1Cutting.unassigned')}: {plan.unassignedPieces.length}
          </strong>
          <p>
            {t(
              `assembly.k1Cutting.reason.${plan.unassignedPieces[0]!.reason}`,
              {
                count: plan.unassignedPieces.length,
                blank: formatMm(
                  plan.unassignedPieces[0]!.requiredBlankLengthMm,
                  unit,
                  i18n.language,
                ),
              },
            )}
          </p>
        </div>
      )}
      <div className="a-k1-metrics">
        <span>
          {t('assembly.k1Cutting.required')}:{' '}
          <b>{plan.summary.requiredPieceCount}</b>
        </span>
        <span>
          {t('assembly.k1Cutting.assigned')}:{' '}
          <b>{plan.summary.assignedPieceCount}</b>
        </span>
        <span>
          {t('assembly.k1Cutting.unassigned')}:{' '}
          <b>{plan.summary.unassignedPieceCount}</b>
        </span>
        <span>
          {t('assembly.k1Cutting.stockCount')}:{' '}
          <b>{plan.summary.stockItemCount}</b>
        </span>
        <span>
          {t('assembly.k1Cutting.purchasedLength')}:{' '}
          <b>{metric(plan.summary.purchasedStockLengthMm, i18n.language)}</b>
        </span>
        <span>
          {t('assembly.k1Cutting.utilization')}:{' '}
          <b>
            {new Intl.NumberFormat(i18n.language, {
              maximumFractionDigits: 1,
            }).format(plan.summary.utilizationRatio * 100)}
            %
          </b>
        </span>
      </div>
      <details className="a-k1-losses">
        <summary>{t('assembly.k1Cutting.lossDetails')}</summary>
        <p>
          {t('assembly.k1Cutting.kerfLoss')}:{' '}
          {metric(plan.summary.kerfLossMm, i18n.language)}
        </p>
        <p>
          {t('assembly.k1Cutting.waste')}:{' '}
          {metric(plan.summary.wasteLengthMm, i18n.language)}
        </p>
        <p>
          {t('assembly.k1Cutting.reusable')}:{' '}
          {metric(plan.summary.reusableRemnantLengthMm, i18n.language)}
        </p>
      </details>
      {plan.stockUsages.length > 0 && (
        <section className="a-k1-layouts">
          <h3>{t('assembly.k1Cutting.layouts')}</h3>
          {plan.stockUsages.map((usage, index) => (
            <details key={usage.stockInstanceId}>
              <summary>
                {t('assembly.k1Cutting.stockItem')} {index + 1} ·{' '}
                {formatMm(usage.originalLengthMm, unit, i18n.language)} ·{' '}
                {usage.cuts.length} K1
              </summary>
              <StockLayout usage={usage} labels={labels} unit={unit} />
            </details>
          ))}
        </section>
      )}
    </div>
  );
}

export function K1CuttingPlan({
  requirement,
  projectName,
  unit,
  mobile,
  onClose,
  initialPlan,
  onPlanChange,
}: {
  requirement: ResolvedRequirement;
  projectName?: string;
  unit: LengthUnit;
  mobile: boolean;
  onClose: () => void;
  initialPlan?: K1SessionPlan;
  onPlanChange?: (plan: K1SessionPlan | undefined) => void;
}) {
  const { t, i18n } = useTranslation();
  const [scenario, setScenario] = useState(
    () => initialPlan?.scenario ?? initialScenario(unit),
  );
  const [nextId, setNextId] = useState(
    () =>
      Math.max(
        1,
        ...(initialPlan?.scenario.stocks.map((stock) => stock.id) ?? [1]),
      ) + 1,
  );
  const [objective, setObjective] = useState<OptimizationObjective>(
    initialPlan?.objective ?? 'minimum-purchased-length',
  );
  const [plan, setPlan] = useState<K1SessionPlan | undefined>(initialPlan);
  const [error, setError] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const signature = k1RequirementSignature(requirement);
  const activePlan = plan?.signature === signature ? plan : undefined;
  const variantIds = useMemo(
    () => [
      ...new Set(
        scenario.stocks.flatMap((stock) =>
          stock.commercialVariantId ? [stock.commercialVariantId] : [],
        ),
      ),
    ],
    [scenario.stocks],
  );
  const prices = usePricesForVariants(variantIds);
  const stockPricing = useMemo(() => {
    const map = new Map<string, VariantPrice>();
    for (const stock of scenario.stocks) {
      if (!stock.commercialVariantId) continue;
      const price = prices.get(stock.commercialVariantId);
      if (price) map.set(`k1-stock-${stock.id}`, price);
    }
    return map;
  }, [scenario.stocks, prices]);

  useEffect(() => {
    if (scenario.unit === unit) return;
    setScenario((current) => ({
      ...current,
      unit,
      stocks: current.stocks.map((stock) => ({
        ...stock,
        length: convertDraft(stock.length, current.unit, unit),
      })),
      kerf: convertDraft(current.kerf, current.unit, unit),
      endTrim: convertDraft(current.endTrim, current.unit, unit),
      remnant: convertDraft(current.remnant, current.unit, unit),
    }));
  }, [scenario.unit, unit]);

  const updateStock = (
    id: number,
    field: 'length' | 'availability',
    value: string,
  ) => {
    setScenario((current) => ({
      ...current,
      stocks: current.stocks.map((stock) =>
        stock.id === id
          ? {
              ...stock,
              [field]: value,
              ...(field === 'length'
                ? { sourceLabel: undefined, commercialVariantId: undefined }
                : {}),
            }
          : stock,
      ),
    }));
    setPlan(undefined);
    onPlanChange?.(undefined);
  };
  const applyCatalogPick = (pick: TimberStockCatalogPick) => {
    setScenario((current) => ({
      ...current,
      stocks: [
        ...current.stocks,
        {
          id: nextId,
          length: String(fromMillimetres(pick.lengthMm, scenario.unit)),
          availability: '',
          sourceLabel: pick.sourceLabel,
          commercialVariantId: pick.commercialVariantId,
        },
      ],
    }));
    setNextId(nextId + 1);
    setPlan(undefined);
    onPlanChange?.(undefined);
    setCatalogOpen(false);
  };
  const updateSetting = (
    field: 'kerf' | 'endTrim' | 'remnant',
    value: string,
  ) => {
    setScenario((current) => ({ ...current, [field]: value }));
    setPlan(undefined);
    onPlanChange?.(undefined);
  };
  const run = () => {
    const parsed = scenario.stocks.map((stock) => ({
      ...stock,
      mm: parseDecimal(stock.length),
      available:
        stock.availability.trim() === ''
          ? undefined
          : parseDecimal(stock.availability),
    }));
    const kerf = parseDecimal(scenario.kerf);
    const trim = parseDecimal(scenario.endTrim);
    const remnant = parseDecimal(scenario.remnant);
    if (
      !parsed.length ||
      parsed.some(
        (stock) =>
          stock.mm === null ||
          stock.mm <= 0 ||
          (stock.available !== undefined &&
            (stock.available === null ||
              !Number.isInteger(stock.available) ||
              stock.available < 0)),
      ) ||
      kerf === null ||
      kerf < 0 ||
      trim === null ||
      trim < 0 ||
      remnant === null ||
      remnant < 0
    ) {
      setError(true);
      return;
    }
    const settings: CuttingSettings = {
      kerfMm: toMillimetres(kerf, scenario.unit),
      endTrimMm: toMillimetres(trim, scenario.unit),
      minimumReusableRemnantMm: toMillimetres(remnant, scenario.unit),
    };
    try {
      const value = createCuttingPlan({
        requiredPieces: requirement.requiredPieces,
        stockOptions: parsed.map((stock) => ({
          id: `k1-stock-${stock.id}`,
          stockClassId: requirement.stockClassId,
          lengthMm: toMillimetres(stock.mm!, scenario.unit),
          ...(stock.available === undefined
            ? {}
            : { availability: stock.available as number }),
        })),
        settings,
        objective,
      });
      const next = { signature, value, settings, scenario, objective };
      setPlan(next);
      onPlanChange?.(next);
      setError(false);
    } catch {
      setError(true);
    }
  };

  const content = (
    <div className="a-k1-cutting" data-testid="k1-cutting-panel">
      <div className="a-k1-requirement">
        <small>{t('assembly.k1Cutting.requirement')}</small>
        <strong>
          {requirement.requiredPieces.length} K1 ·{' '}
          {formatMm(
            requirement.blank.requiredBlankLengthMm,
            unit,
            i18n.language,
          )}
        </strong>
        <span>
          {t('assembly.section')}:{' '}
          {formatMm(requirement.blank.section.widthMm, unit, i18n.language)} ×{' '}
          {formatMm(requirement.blank.section.depthMm, unit, i18n.language)}
        </span>
        {requirement.excludedRafterCount > 0 && (
          <p>
            {t('assembly.k1Cutting.excluded', {
              count: requirement.excludedRafterCount,
            })}
          </p>
        )}
      </div>
      <div
        className="a-k1-stages"
        aria-label={t('assembly.resultLayers.label')}
      >
        {(
          ['geometry', 'execution', 'cutting', 'purchase', 'cost'] as const
        ).map((layer) => {
          const status =
            layer === 'geometry' || layer === 'execution'
              ? 'resolved'
              : layer === 'cost'
                ? 'future'
                : activePlan
                  ? activePlan.value.status === 'complete'
                    ? 'resolved'
                    : 'partial'
                  : 'pending';
          return (
            <span key={layer} data-layer={layer} data-state={status}>
              {t(`assembly.k1Cutting.stage.${layer}`)}{' '}
              <b>{t(`assembly.k1Cutting.stage.${status}`)}</b>
            </span>
          );
        })}
      </div>
      <section className="a-k1-input-section">
        <h3>{t('assembly.k1Cutting.commercialLengths')}</h3>
        {scenario.stocks.map((stock, index) => (
          <div className="a-k1-stock-input" key={stock.id}>
            <label>
              <span>
                {t('assembly.k1Cutting.commercialLength')} {index + 1} ({unit})
              </span>
              <input
                data-testid="k1-stock-length"
                inputMode="decimal"
                value={stock.length}
                onChange={(event) =>
                  updateStock(stock.id, 'length', event.target.value)
                }
              />
              {stock.sourceLabel && (
                <small
                  className="a-k1-stock-source"
                  data-testid="k1-stock-source"
                >
                  {stock.sourceLabel}
                </small>
              )}
            </label>
            <label>
              <span>{t('assembly.k1Cutting.availability')}</span>
              <input
                inputMode="numeric"
                value={stock.availability}
                onChange={(event) =>
                  updateStock(stock.id, 'availability', event.target.value)
                }
              />
            </label>
            <button
              type="button"
              className="a-button"
              aria-label={`${t('assembly.k1Cutting.removeLength')} ${index + 1}`}
              onClick={() => {
                setScenario((current) => ({
                  ...current,
                  stocks: current.stocks.filter((row) => row.id !== stock.id),
                }));
                setPlan(undefined);
                onPlanChange?.(undefined);
              }}
            >
              ×
            </button>
          </div>
        ))}
        <div className="a-k1-input-actions">
          <button
            type="button"
            className="a-button"
            onClick={() => {
              setScenario((current) => ({
                ...current,
                stocks: [
                  ...current.stocks,
                  { id: nextId, length: '', availability: '' },
                ],
              }));
              setNextId(nextId + 1);
              setPlan(undefined);
              onPlanChange?.(undefined);
            }}
          >
            {t('assembly.k1Cutting.addLength')}
          </button>
          <button
            type="button"
            className="a-button"
            data-testid="k1-add-from-catalogue"
            onClick={() => setCatalogOpen(true)}
          >
            {t('assembly.k1Cutting.addFromCatalogue')}
          </button>
        </div>
        {catalogOpen && (
          <Suspense fallback={<div className="a-loading-panel" />}>
            <TimberStockProductPicker
              requiredSection={{
                widthMm: requirement.blank.section.widthMm,
                depthMm: requirement.blank.section.depthMm,
              }}
              onApply={applyCatalogPick}
              onClose={() => setCatalogOpen(false)}
            />
          </Suspense>
        )}
      </section>
      <details className="a-k1-advanced">
        <summary>
          {t('assembly.k1Cutting.advanced')}{' '}
          <small>
            · {t('assembly.k1Cutting.kerf')} {scenario.kerf} {unit},{' '}
            {t('assembly.k1Cutting.endTrim')} {scenario.endTrim} {unit}
          </small>
        </summary>
        {(
          [
            ['kerf', 'kerf'],
            ['endTrim', 'endTrim'],
            ['remnant', 'minimumRemnant'],
          ] as const
        ).map(([field, label]) => (
          <label key={field}>
            <span>
              {t(`assembly.k1Cutting.${label}`)} ({unit})
            </span>
            <input
              inputMode="decimal"
              value={scenario[field]}
              onChange={(event) => updateSetting(field, event.target.value)}
            />
          </label>
        ))}
      </details>
      <label className="a-k1-objective">
        <span>{t('assembly.k1Cutting.objective')}</span>
        <select
          data-testid="k1-objective"
          value={objective}
          onChange={(event) => {
            setObjective(event.target.value as OptimizationObjective);
            setPlan(undefined);
            onPlanChange?.(undefined);
          }}
        >
          {(
            [
              'minimum-purchased-length',
              'minimum-waste',
              'minimum-stock-count',
            ] as const
          ).map((value) => (
            <option value={value} key={value}>
              {t(`assembly.k1Cutting.objectives.${value}`)}
            </option>
          ))}
        </select>
      </label>
      <div className="a-k1-action">
        {error && <p role="alert">{t('assembly.k1Cutting.invalidInput')}</p>}
        <button
          type="button"
          className="a-button is-primary"
          data-testid="k1-run-plan"
          onClick={run}
        >
          {t('assembly.k1Cutting.calculate')}
        </button>
      </div>
      {activePlan && (
        <CuttingResult
          plan={activePlan.value}
          settings={activePlan.settings}
          requirement={requirement}
          projectName={projectName}
          unit={unit}
          stockPricing={stockPricing}
        />
      )}
    </div>
  );

  return mobile ? (
    <MobileSheet
      title={t('assembly.k1Cutting.title')}
      onClose={onClose}
      expanded
    >
      {content}
    </MobileSheet>
  ) : (
    <div className="a-k1-dialog-layer">
      <button
        className="a-k1-dialog-backdrop"
        aria-label={t('assembly.close')}
        onClick={onClose}
      />
      <section
        className="a-k1-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t('assembly.k1Cutting.title')}
      >
        <header>
          <h2>{t('assembly.k1Cutting.title')}</h2>
          <button type="button" className="a-button" onClick={onClose}>
            {t('assembly.close')}
          </button>
        </header>
        {content}
      </section>
    </div>
  );
}
