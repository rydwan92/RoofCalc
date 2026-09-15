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
  materialValue,
  type MaterialPlanRow,
  type MaterialPriceSelection,
} from './material-plan';
import { downloadMaterialCsv } from './material-csv';
import type { ExportFacts } from './export-adapter';

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
}: {
  facts: ExportFacts;
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
      'piece/m2': locale.startsWith('pl') ? 'szt./m²' : 'pcs/m²',
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
          <small data-status={catalogue.isError ? 'warning' : 'neutral'}>
            {catalogue.isPending
              ? m.loading
              : catalogue.isError
                ? m.offline
                : m.online}
          </small>
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
            {rows.filter((row) => row.basis === 'procurement-stock').length}
          </strong>
        </span>
        <span>
          {m.estimates}
          <strong>
            {
              rows.filter(
                (row) =>
                  row.basis !== 'procurement-stock' &&
                  row.suitability !== 'manual-required',
              ).length
            }
          </strong>
        </span>
        <span>
          {m.needsData}
          <strong>
            {
              rows.filter(
                (row) => row.partial || !materialValue(row, activePrice(row)),
              ).length
            }
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
      {(['timber', 'layers', 'covering', 'other'] as const).map((category) => (
        <div key={category} className="mp-group">
          <h3>{m[category]}</h3>
          {rows
            .filter((row) => row.category === category)
            .map((row) => {
              const price = activePrice(row);
              const candidates = compatibleMaterialPrices(
                row,
                options,
                currency,
              );
              const value = materialValue(row, price);
              const existing = scenario?.lines.find(
                (line) =>
                  line.id === row.id || line.id === row.costSuggestionKey,
              );
              const fingerprint = JSON.stringify([
                row.quantity,
                row.basis,
                price,
              ]);
              const changed =
                !!existing &&
                (existing.quantity.value !== row.quantity ||
                  existing.quantityBasis !== row.basis ||
                  existing.unitPriceMinor !== price?.amountMinor);
              const label = `${materialText(locale, row.labelKey)}${row.description ? ` · ${row.description}` : ''}`;
              return (
                <article
                  key={row.id}
                  className="mp-row"
                  data-testid={`material-row-${row.labelKey}`}
                >
                  <div className="mp-row-main">
                    <div>
                      <h4>{label}</h4>
                      <span
                        className="mp-badge"
                        data-status={
                          row.basis === 'procurement-stock'
                            ? 'success'
                            : 'neutral'
                        }
                      >
                        {basis(row)}
                      </span>
                      {row.partial && (
                        <span className="mp-badge" data-status="warning">
                          {m.partial}
                        </span>
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
                    <strong className="mp-quantity">
                      {displayQuantity(row)} <small>{unit(row.unit)}</small>
                    </strong>
                  </div>
                  {row.metrics.length > 0 && (
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
                  {row.range && <p className="mp-note">{m.rangeNote}</p>}
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
                      <button onClick={onOpenCovering}>
                        {m.chooseCovering}
                      </button>
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
            })}
        </div>
      ))}
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
