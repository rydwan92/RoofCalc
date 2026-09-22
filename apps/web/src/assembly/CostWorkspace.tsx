import { Fragment, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  acceptProjectQuantity,
  addCostLine,
  calculateLine,
  createCostLine,
  keepManualQuantity,
  linesByCategory,
  projectQuantityDiverged,
  removeCostLine,
  replaceCostLine,
  restoreFromProject,
  setScenarioTaxRateBps,
  summarizeCostScenario,
  withIncluded,
  withManualQuantity,
  withUnitPrice,
  type CostLine,
  type CostLineCategory,
  type CostScenario,
  type QuantityUnit,
} from '@cieslacalc/cost-core';
import { newProjectId } from '@cieslacalc/project-core';
import { formatNumber, parseDecimal } from '../format';
import {
  createCostSuggestions,
  currentSuggestionQuantityValue,
  supersededByTilePlan,
  type CostSuggestion,
} from './cost-adapter';
import { downloadCostEstimateCsv } from './cost-csv';
import type { ExportFacts } from './export-adapter';
import { materialCopy, materialText } from './material-copy';
import { useBusiness } from '../business/context';

const QUANTITY_UNITS: readonly QuantityUnit[] = [
  'piece',
  'm',
  'm2',
  'm3',
  'kg',
  'hour',
  'flat',
];
const CATEGORIES: readonly CostLineCategory[] = [
  'material',
  'labour',
  'transport',
  'equipment',
  'other',
];
const VAT_PRESETS = [0, 500, 800, 2300];

function suggestionLabelKey(suggestion: CostSuggestion): string {
  switch (suggestion.kind) {
    case 'tile-purchase':
      return 'tilePurchase';
    case 'tile-accessory':
      return 'tileAccessory';
    case 'k1-stock':
      return 'k1Stock';
    // V48: one row per commercial length, so the label names the material.
    case 'linear-stock':
      return suggestion.material === 'batten' ? 'battens' : 'counterBattens';
    case 'battens':
      return 'battens';
    case 'counter-battens':
      return 'counterBattens';
    case 'membrane':
      return 'membrane';
    case 'covering-positions':
      return 'coveringPositions';
    case 'covering-runs':
      return 'coveringRuns';
    case 'covering-consumption':
      return 'coveringConsumption';
    case 'roof-system':
      return 'roofSystem';
  }
}

/**
 * V49: a linear-stock line names its section, commercial length and product,
 * because a roof usually buys several lengths and two lines that both read
 * "Łaty" could not be told apart or priced correctly.
 */
function suggestionLabel(
  suggestion: CostSuggestion,
  t: (key: string) => string,
  locale = 'pl',
): string {
  // V51: roof-system rows name the element, its length and the product.
  if (suggestion.kind === 'roof-system')
    return [
      `${materialText(locale, suggestion.labelKey)}${
        suggestion.lengthMm !== undefined
          ? ` ${(suggestion.lengthMm / 1000).toLocaleString(locale)} m`
          : ''
      }`,
      suggestion.productName,
    ]
      .filter(Boolean)
      .join(' · ');
  const base = t(`assembly.cost.suggestion.${suggestionLabelKey(suggestion)}`);
  if (
    suggestion.kind === 'tile-purchase' ||
    suggestion.kind === 'tile-accessory'
  )
    return `${base} · ${suggestion.productName}`;
  if (suggestion.kind !== 'linear-stock') return base;
  // Smaller dimension first, as catalogues and the purchase panel name it.
  const section =
    suggestion.sectionWidthMm && suggestion.sectionDepthMm
      ? ` ${Math.min(suggestion.sectionWidthMm, suggestion.sectionDepthMm)}×${Math.max(suggestion.sectionWidthMm, suggestion.sectionDepthMm)}`
      : '';
  const length = ` × ${(suggestion.stockLengthMm / 1000).toLocaleString('pl-PL')} m`;
  return `${base}${section}${length}${suggestion.productName ? ` · ${suggestion.productName}` : ''}`;
}

function money(
  minor: number | undefined,
  currencyCode: string,
  locale: string,
) {
  if (minor === undefined) return '—';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
  }).format(minor / 100);
}

export function CostWorkspace({
  facts,
  scenario,
  onScenarioChange,
  onOpenDocuments,
  materialsAttention = 0,
  onOpenMaterials,
  onOpenQuote,
}: {
  facts: ExportFacts;
  scenario: CostScenario;
  onScenarioChange: (next: CostScenario) => void;
  onOpenDocuments: () => void;
  /** V53: material rows still needing a decision (guides an empty estimate). */
  materialsAttention?: number;
  onOpenMaterials?: () => void;
  onOpenQuote?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const business = useBusiness();
  const businessMode = business.mode === 'business';
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [addingManual, setAddingManual] = useState(false);
  // V53: an empty estimate first points at unfinished materials (transient).
  const [continueAnyway, setContinueAnyway] = useState(false);
  // V47: status counts focus the affected rows instead of a generic verdict.
  const [focus, setFocus] = useState<
    'needs-price' | 'needs-quantity' | 'estimate'
  >();

  const suggestions = createCostSuggestions(facts);
  const addedKeys = new Set(scenario.lines.map((line) => line.id));
  const openSuggestions = suggestions.filter(
    (suggestion) =>
      !addedKeys.has(suggestion.key) && !dismissed.has(suggestion.key),
  );
  const summary = summarizeCostScenario(scenario);
  const estimateCount = scenario.lines.filter(
    (line) => line.included && line.suitability === 'geometric-estimate',
  ).length;
  const lineFocus = (line: CostLine) => {
    if (!focus) return undefined;
    const computed = calculateLine(line, scenario.taxRateBps);
    const match =
      focus === 'needs-price'
        ? line.included && !computed.priced
        : focus === 'needs-quantity'
          ? line.included && !computed.hasQuantity
          : line.included && line.suitability === 'geometric-estimate';
    return match ? 'match' : 'dim';
  };
  const focusButton = (
    kind: 'needs-price' | 'needs-quantity' | 'estimate',
    label: string,
  ) => (
    <button
      type="button"
      className="cw-status-filter"
      data-status="warning"
      data-testid={`cost-focus-${kind}`}
      aria-pressed={focus === kind}
      onClick={() =>
        setFocus((current) => (current === kind ? undefined : kind))
      }
    >
      {label}
    </button>
  );
  const grouped = linesByCategory(scenario);

  const addSuggestion = (suggestion: CostSuggestion, manual: boolean) => {
    const quantity =
      suggestion.kind === 'covering-consumption'
        ? { value: 0, unit: 'piece' as const }
        : 'quantity' in suggestion
          ? suggestion.quantity
          : { value: 0, unit: suggestion.manualUnit };
    const catalogPrice =
      (suggestion.kind === 'covering-consumption' ||
        suggestion.kind === 'linear-stock' ||
        suggestion.kind === 'tile-purchase') &&
      suggestion.unitPriceMinor !== undefined &&
      suggestion.currencyCode === scenario.currencyCode
        ? suggestion.unitPriceMinor
        : undefined;
    const line = createCostLine({
      id: suggestion.key,
      category: suggestion.category,
      label: suggestionLabel(suggestion, t, i18n.language),
      quantity,
      quantityBasis: suggestion.quantityBasis,
      suitability: suggestion.suitability,
      currencyCode: scenario.currencyCode,
      unitPriceMinor: catalogPrice,
      source: manual
        ? 'manual'
        : catalogPrice !== undefined
          ? 'price-list'
          : 'project-derived',
      noteKeys: suggestion.noteKeys,
      projectQuantityValue: manual ? undefined : quantity.value,
    });
    onScenarioChange(addCostLine(scenario, line));
  };

  const updateLine = (next: CostLine) =>
    onScenarioChange(replaceCostLine(scenario, next));

  return (
    <div className="cw-workspace">
      <header className="cw-summary">
        <div className="cw-summary-main">
          <h2>
            {businessMode
              ? locale.startsWith('pl')
                ? 'Wycena materiałów'
                : 'Material estimate'
              : t('assembly.cost.title')}
          </h2>
          <span>{t('assembly.cost.totalNet')}</span>
          <strong data-testid="cost-total-net">
            {money(summary.netMinor, scenario.currencyCode, locale)}
          </strong>
          {summary.grossMinor !== undefined && (
            <small>
              {t('assembly.cost.totalGross')}:{' '}
              {money(summary.grossMinor, scenario.currencyCode, locale)}
            </small>
          )}
        </div>
        <div className="cw-summary-categories">
          {summary.categoryTotals.map((total) => (
            <span key={total.category}>
              {t(`assembly.cost.category.${total.category}`)}:{' '}
              <strong>
                {money(total.netMinor, scenario.currencyCode, locale)}
              </strong>
            </span>
          ))}
        </div>
        <div className="cw-summary-status" data-testid="cost-status">
          <span>
            {t('assembly.cost.statusPriced', {
              count: summary.pricedLineCount,
            })}
          </span>
          {summary.needsPriceCount > 0 && focus !== 'needs-price' && (
            <button
              type="button"
              className="a-button a-primary"
              data-testid="cost-fill-prices"
              onClick={() => setFocus('needs-price')}
            >
              {t('assembly.cost.fillPrices', {
                count: summary.needsPriceCount,
              })}
            </button>
          )}
          {businessMode && onOpenQuote && (
            <button
              type="button"
              className="a-button a-primary"
              data-testid="cost-prepare-quote"
              onClick={onOpenQuote}
            >
              {locale.startsWith('pl') ? 'Przygotuj ofertę' : 'Prepare quote'}
            </button>
          )}
          {summary.needsPriceCount > 0 &&
            focusButton(
              'needs-price',
              t('assembly.cost.statusNeedsPrice', {
                count: summary.needsPriceCount,
              }),
            )}
          {summary.needsQuantityCount > 0 &&
            focusButton(
              'needs-quantity',
              t('assembly.cost.statusNeedsQuantity', {
                count: summary.needsQuantityCount,
              }),
            )}
          {estimateCount > 0 &&
            focusButton(
              'estimate',
              t('assembly.cost.statusEstimates', { count: estimateCount }),
            )}
        </div>
        <div className="cw-vat">
          <label>
            {t('assembly.cost.vat')}
            <select
              value={scenario.taxRateBps ?? ''}
              onChange={(event) =>
                onScenarioChange(
                  setScenarioTaxRateBps(
                    scenario,
                    event.target.value === ''
                      ? undefined
                      : Number(event.target.value),
                  ),
                )
              }
            >
              <option value="">{t('assembly.cost.vatUnset')}</option>
              {VAT_PRESETS.map((bps) => (
                <option key={bps} value={bps}>
                  {(bps / 100).toFixed(0)}%
                </option>
              ))}
            </select>
          </label>
          {!VAT_PRESETS.includes(scenario.taxRateBps ?? -1) &&
            scenario.taxRateBps !== undefined && (
              <small>({(scenario.taxRateBps / 100).toFixed(0)}%)</small>
            )}
        </div>
        <div className="cw-actions">
          <button type="button" onClick={onOpenDocuments}>
            {t('assembly.cost.openInDocuments')}
          </button>
          <button
            type="button"
            disabled={!scenario.lines.some((line) => line.included)}
            onClick={() =>
              downloadCostEstimateCsv(
                scenario,
                facts.source.projectName,
                locale,
              )
            }
          >
            {t('assembly.cost.exportCsv')}
          </button>
        </div>
      </header>

      {openSuggestions.length > 0 && (
        <section
          className="cw-suggestions"
          aria-label={t('assembly.cost.suggestionsHeading')}
        >
          <h3>{t('assembly.cost.suggestionsHeading')}</h3>
          <p className="cw-intro">{t('assembly.cost.intro')}</p>
          <ul>
            {openSuggestions.map((suggestion) => (
              <li
                key={suggestion.key}
                data-suitability={suggestion.suitability}
              >
                <div>
                  <strong>
                    {suggestionLabel(suggestion, t, i18n.language)}
                  </strong>
                  <small>
                    {t(`assembly.cost.suitability.${suggestion.suitability}`)}
                  </small>
                  {/*
                   * V49 §33: a catalogue price is a dated observation, so its
                   * source, date and a verification note travel with it.
                   */}
                  {(suggestion.kind === 'linear-stock' ||
                    suggestion.kind === 'tile-purchase') &&
                    suggestion.unitPriceMinor !== undefined &&
                    suggestion.priceProvenance && (
                      <small
                        className="cw-provenance"
                        data-testid="cost-price-provenance"
                      >
                        {t('assembly.cost.catalogueProvenance', {
                          price: money(
                            suggestion.unitPriceMinor,
                            suggestion.currencyCode ?? scenario.currencyCode,
                            locale,
                          ),
                          source:
                            suggestion.priceProvenance.ownerLabel ??
                            t('assembly.cost.catalogueSource'),
                          date: suggestion.priceProvenance.validFrom,
                        })}
                      </small>
                    )}
                  {suggestion.kind === 'covering-consumption' ? (
                    <span>
                      {t('assembly.cost.consumptionRange', {
                        min: formatNumber(suggestion.minimumPieces, locale, 0),
                        max: formatNumber(suggestion.maximumPieces, locale, 0),
                      })}
                    </span>
                  ) : 'quantity' in suggestion ? (
                    <span>
                      {formatNumber(suggestion.quantity.value, locale, 2)}{' '}
                      {t(`assembly.cost.unitLabel.${suggestion.quantity.unit}`)}
                    </span>
                  ) : (
                    <span>
                      {t('assembly.cost.notPurchaseFact', {
                        count: formatNumber(
                          suggestion.kind === 'covering-positions'
                            ? suggestion.totalPositions
                            : suggestion.totalLengthMm / 1000,
                          locale,
                          2,
                        ),
                        unit: t(
                          `assembly.cost.unitLabel.${suggestion.manualUnit}`,
                        ),
                      })}
                    </span>
                  )}
                </div>
                <div className="cw-suggestion-actions">
                  <button
                    type="button"
                    onClick={() =>
                      addSuggestion(
                        suggestion,
                        suggestion.suitability === 'manual-required' ||
                          suggestion.kind === 'covering-consumption',
                      )
                    }
                  >
                    {suggestion.suitability === 'manual-required' ||
                    suggestion.kind === 'covering-consumption'
                      ? t('assembly.cost.fillManually')
                      : t('assembly.cost.add')}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDismissed((current) =>
                        new Set(current).add(suggestion.key),
                      )
                    }
                  >
                    {t('assembly.cost.skip')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="cw-lines">
        {scenario.lines.length === 0 &&
        materialsAttention > 0 &&
        onOpenMaterials &&
        !continueAnyway ? (
          <div className="cw-empty-state" data-testid="cost-materials-first">
            <strong>{t('assembly.cost.materialsFirstTitle')}</strong>
            <p className="cw-empty">
              {t('assembly.cost.materialsFirst', { count: materialsAttention })}
            </p>
            <div className="cw-empty-actions">
              <button
                type="button"
                className="a-button a-primary"
                data-testid="cost-open-materials"
                onClick={onOpenMaterials}
              >
                {t('assembly.cost.openMaterials')}
              </button>
              <button
                type="button"
                className="a-link-button"
                data-testid="cost-continue-anyway"
                onClick={() => setContinueAnyway(true)}
              >
                {t('assembly.cost.continueAnyway')}
              </button>
            </div>
          </div>
        ) : scenario.lines.length === 0 ? (
          <div className="cw-empty-state" data-testid="cost-empty-state">
            <strong>{t('assembly.cost.noLinesTitle')}</strong>
            <p className="cw-empty">{t('assembly.cost.noLines')}</p>
            {!addingManual && (
              <button
                type="button"
                className="a-button a-primary"
                onClick={() => setAddingManual(true)}
              >
                + {t('assembly.cost.addManualLine')}
              </button>
            )}
          </div>
        ) : (
          CATEGORIES.filter((category) => grouped.has(category)).map(
            (category) => (
              <div className="cw-category-group" key={category}>
                <h4>{t(`assembly.cost.category.${category}`)}</h4>
                <table className="cw-table">
                  <thead>
                    <tr>
                      <th />
                      <th>{t('assembly.cost.item')}</th>
                      <th>{t('assembly.cost.basisHeader')}</th>
                      <th>{t('assembly.cost.quantity')}</th>
                      <th>{t('assembly.cost.unit')}</th>
                      <th>{t('assembly.cost.unitPrice')}</th>
                      <th>{t('assembly.cost.net')}</th>
                      <th>{t('assembly.cost.status')}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {grouped.get(category)!.map((line) => {
                      const computed = calculateLine(line, scenario.taxRateBps);
                      const liveValue = currentSuggestionQuantityValue(
                        facts,
                        line.id,
                      );
                      const diverged = projectQuantityDiverged(line, liveValue);
                      const canRestore =
                        line.source === 'manual' &&
                        line.quantityBasis !== 'manual' &&
                        liveValue !== undefined;
                      return (
                        <Fragment key={line.id}>
                          <tr data-focus={lineFocus(line)}>
                            <td>
                              <input
                                type="checkbox"
                                aria-label={t('assembly.cost.include')}
                                checked={line.included}
                                onChange={(event) =>
                                  updateLine(
                                    withIncluded(line, event.target.checked),
                                  )
                                }
                              />
                            </td>
                            <td>{line.label}</td>
                            <td>
                              {t(`assembly.cost.basis.${line.quantityBasis}`)}
                            </td>
                            <td>
                              <input
                                key={`${line.id}:${line.quantity.value}`}
                                type="text"
                                inputMode="decimal"
                                defaultValue={formatNumber(
                                  line.quantity.value,
                                  locale,
                                  3,
                                )}
                                onBlur={(event) => {
                                  const parsed = parseDecimal(
                                    event.target.value,
                                  );
                                  if (parsed !== null && parsed >= 0)
                                    updateLine(
                                      withManualQuantity(line, parsed),
                                    );
                                  else
                                    event.target.value = formatNumber(
                                      line.quantity.value,
                                      locale,
                                      3,
                                    );
                                }}
                              />
                            </td>
                            <td>
                              {t(
                                `assembly.cost.unitLabel.${line.quantity.unit}`,
                              )}
                            </td>
                            <td>
                              <input
                                key={`${line.id}:${line.unitPriceMinor ?? ''}`}
                                type="text"
                                inputMode="decimal"
                                defaultValue={
                                  line.unitPriceMinor !== undefined
                                    ? formatNumber(
                                        line.unitPriceMinor / 100,
                                        locale,
                                        2,
                                      )
                                    : ''
                                }
                                onBlur={(event) => {
                                  const parsed = parseDecimal(
                                    event.target.value,
                                  );
                                  if (parsed !== null && parsed >= 0)
                                    updateLine(
                                      withUnitPrice(
                                        line,
                                        Math.round(parsed * 100),
                                      ),
                                    );
                                }}
                              />
                              {line.priceProvenance && (
                                <small>
                                  {line.priceProvenance.source === 'manual'
                                    ? materialCopy(locale).manual
                                    : line.priceProvenance.label}
                                </small>
                              )}
                              {line.priceProvenance?.source ===
                                'price-list' && (
                                <small>{materialCopy(locale).verify}</small>
                              )}
                            </td>
                            <td>
                              {money(
                                computed.netMinor,
                                line.currencyCode,
                                locale,
                              )}
                            </td>
                            <td>
                              {!computed.priced
                                ? t('assembly.cost.statusNeedsPrice', {
                                    count: 1,
                                  })
                                : !computed.hasQuantity
                                  ? t('assembly.cost.statusNeedsQuantity', {
                                      count: 1,
                                    })
                                  : t('assembly.cost.statusPriced', {
                                      count: 1,
                                    })}
                            </td>
                            <td>
                              <button
                                type="button"
                                aria-label={t('assembly.cost.remove')}
                                onClick={() =>
                                  onScenarioChange(
                                    removeCostLine(scenario, line.id),
                                  )
                                }
                              >
                                ×
                              </button>
                            </td>
                          </tr>
                          {diverged && liveValue !== undefined && (
                            <tr className="cw-diff-row">
                              <td />
                              <td colSpan={8}>
                                {t('assembly.cost.projectChanged', {
                                  from: formatNumber(
                                    line.projectQuantityValue ?? 0,
                                    locale,
                                    2,
                                  ),
                                  to: formatNumber(liveValue, locale, 2),
                                })}
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateLine(
                                      acceptProjectQuantity(line, liveValue),
                                    )
                                  }
                                >
                                  {t('assembly.cost.update')}
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateLine(keepManualQuantity(line))
                                  }
                                >
                                  {t('assembly.cost.keepManual')}
                                </button>
                              </td>
                            </tr>
                          )}
                          {supersededByTilePlan(facts, line.id) && (
                            <tr
                              className="cw-diff-row"
                              data-testid="cost-line-superseded"
                            >
                              <td />
                              <td colSpan={8}>
                                {t('assembly.cost.supersededByTilePlan')}
                                <button
                                  type="button"
                                  onClick={() =>
                                    onScenarioChange(
                                      removeCostLine(scenario, line.id),
                                    )
                                  }
                                >
                                  {t('assembly.cost.removeSuperseded')}
                                </button>
                              </td>
                            </tr>
                          )}
                          {canRestore && (
                            <tr className="cw-diff-row">
                              <td />
                              <td colSpan={8}>
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateLine(
                                      restoreFromProject(line, liveValue!),
                                    )
                                  }
                                >
                                  {t('assembly.cost.restoreFromProject')}
                                </button>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ),
          )
        )}
      </section>

      {addingManual ? (
        <ManualLineForm
          currencyCode={scenario.currencyCode}
          onCancel={() => setAddingManual(false)}
          onCreate={(input) => {
            onScenarioChange(
              addCostLine(
                scenario,
                createCostLine({
                  id: newProjectId(),
                  category: input.category,
                  label: input.label,
                  quantity: { value: input.quantityValue, unit: input.unit },
                  quantityBasis: 'manual',
                  suitability: 'manual-required',
                  currencyCode: scenario.currencyCode,
                  unitPriceMinor: input.unitPriceMinor,
                  source: 'manual',
                }),
              ),
            );
            setAddingManual(false);
          }}
        />
      ) : scenario.lines.length === 0 ? null : (
        <button
          type="button"
          className="cw-add-manual"
          onClick={() => setAddingManual(true)}
        >
          + {t('assembly.cost.addManualLine')}
        </button>
      )}
    </div>
  );
}

function ManualLineForm({
  currencyCode,
  onCreate,
  onCancel,
}: {
  currencyCode: string;
  onCreate: (input: {
    label: string;
    category: CostLineCategory;
    unit: QuantityUnit;
    quantityValue: number;
    unitPriceMinor?: number;
  }) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [label, setLabel] = useState('');
  const [category, setCategory] = useState<CostLineCategory>('material');
  const [unit, setUnit] = useState<QuantityUnit>('piece');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');

  return (
    <form
      className="cw-manual-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!label.trim()) return;
        const quantityValue = parseDecimal(quantity) ?? 0;
        const priceValue = parseDecimal(price);
        onCreate({
          label: label.trim(),
          category,
          unit,
          quantityValue: quantityValue >= 0 ? quantityValue : 0,
          unitPriceMinor:
            priceValue !== null && priceValue >= 0
              ? Math.round(priceValue * 100)
              : undefined,
        });
      }}
    >
      <label>
        {t('assembly.cost.manualLabel')}
        <input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          required
        />
      </label>
      <label>
        {t('assembly.cost.manualCategory')}
        <select
          value={category}
          onChange={(event) =>
            setCategory(event.target.value as CostLineCategory)
          }
        >
          {CATEGORIES.map((value) => (
            <option key={value} value={value}>
              {t(`assembly.cost.category.${value}`)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('assembly.cost.quantity')}
        <input
          type="text"
          inputMode="decimal"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
        />
      </label>
      <label>
        {t('assembly.cost.manualUnit')}
        <select
          value={unit}
          onChange={(event) => setUnit(event.target.value as QuantityUnit)}
        >
          {QUANTITY_UNITS.map((value) => (
            <option key={value} value={value}>
              {t(`assembly.cost.unitLabel.${value}`)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('assembly.cost.unitPrice')} ({currencyCode})
        <input
          type="text"
          inputMode="decimal"
          value={price}
          onChange={(event) => setPrice(event.target.value)}
        />
      </label>
      <div>
        <button type="submit">{t('assembly.cost.createLine')}</button>
        <button type="button" onClick={onCancel}>
          {t('assembly.cost.cancel')}
        </button>
      </div>
    </form>
  );
}
