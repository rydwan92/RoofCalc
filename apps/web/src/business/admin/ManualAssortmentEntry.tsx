import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  SALE_UNITS,
  type AssortmentCreateRequest,
} from '@cieslacalc/business-core';
import { catalogClient } from '../../catalog/client';
import { useBusiness } from '../context';
import { businessCopy } from '../copy';
import { LinkVariants } from './AssortmentDetail';

export function ManualAssortmentEntry({
  onDone,
  onCancel,
}: {
  onDone: () => void;
  onCancel: () => void;
}) {
  const { i18n } = useTranslation();
  const m = businessCopy(i18n.language);
  const { organizationId, client } = useBusiness();
  const [externalKey, setExternalKey] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [ean, setEan] = useState('');
  const [search, setSearch] = useState('');
  const [variant, setVariant] = useState<{ id: string; label: string }>();
  const [amount, setAmount] = useState('');
  const [saleUnit, setSaleUnit] =
    useState<(typeof SALE_UNITS)[number]>('piece');
  const [vat, setVat] = useState('');
  const [validFrom, setValidFrom] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const products = useQuery({
    queryKey: ['catalog', 'products', 'manual-assortment', search.trim()],
    queryFn: ({ signal }) =>
      catalogClient.searchProducts({ q: search.trim(), limit: 12 }, signal),
    enabled: search.trim().length > 1,
    retry: false,
  });

  async function submit() {
    if (!organizationId) return;
    const net = amount ? Number(amount.replace(',', '.')) : undefined;
    const vatPercent = vat ? Number(vat.replace(',', '.')) : undefined;
    if (
      (net !== undefined && (!Number.isFinite(net) || net < 0 || !variant)) ||
      (vatPercent !== undefined &&
        (!Number.isFinite(vatPercent) || vatPercent < 0 || vatPercent > 100))
    ) {
      setError(m.invalidManualEntry);
      return;
    }
    const input: AssortmentCreateRequest = {
      externalKey: externalKey.trim(),
      sourceName: sourceName.trim(),
      ...(ean.trim() ? { ean: ean.trim() } : {}),
      ...(variant ? { commercialVariantId: variant.id } : {}),
      active: true,
      preferred: false,
      ...(net !== undefined
        ? {
            price: {
              netAmountMinor: Math.round(net * 100),
              saleUnit,
              validFrom,
              ...(vatPercent !== undefined
                ? { vatRateBps: Math.round(vatPercent * 100) }
                : {}),
            },
          }
        : {}),
    };
    setBusy(true);
    setError(undefined);
    try {
      await client.createItem(organizationId, input);
      onDone();
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : '';
      setError(m.errorCode[code] ?? m.actionFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="bz-manual-entry" data-testid="manual-assortment-entry">
      <h3>{m.manualEntry}</h3>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label>
          {m.internalSku}
          <input
            required
            value={externalKey}
            onChange={(event) => setExternalKey(event.target.value)}
          />
        </label>
        <label>
          {m.importedName}
          <input
            required
            value={sourceName}
            onChange={(event) => setSourceName(event.target.value)}
          />
        </label>
        <label>
          {m.ean}
          <input value={ean} onChange={(event) => setEan(event.target.value)} />
        </label>
        <fieldset>
          <legend>{m.matchedProduct}</legend>
          <input
            value={search}
            placeholder={m.searchCatalog}
            onChange={(event) => setSearch(event.target.value)}
          />
          {variant && (
            <p data-testid="manual-selected-variant">{variant.label}</p>
          )}
          <ul className="bz-link-results">
            {(products.data?.items ?? []).map((product) => (
              <li key={product.id}>
                <span>
                  {product.manufacturer.name} · {product.name}
                </span>
                <LinkVariants
                  productId={product.id}
                  busy={busy}
                  onLink={(id, label) => setVariant({ id, label })}
                />
              </li>
            ))}
          </ul>
        </fieldset>
        <fieldset>
          <legend>{m.optionalPrice}</legend>
          <label>
            {m.netPrice}
            <input
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          <label>
            {m.saleUnitLabel}
            <select
              value={saleUnit}
              onChange={(event) =>
                setSaleUnit(event.target.value as (typeof SALE_UNITS)[number])
              }
            >
              {SALE_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {m.saleUnit[unit]}
                </option>
              ))}
            </select>
          </label>
          <label>
            {m.vatRate}
            <input
              inputMode="decimal"
              value={vat}
              onChange={(event) => setVat(event.target.value)}
            />
          </label>
          <label>
            {m.validFrom}
            <input
              type="date"
              value={validFrom}
              onChange={(event) => setValidFrom(event.target.value)}
            />
          </label>
        </fieldset>
        {error && <p role="alert">{error}</p>}
        <div className="bz-detail-actions">
          <button className="a-button a-primary" disabled={busy}>
            {m.addProduct}
          </button>
          <button type="button" className="a-button" onClick={onCancel}>
            {m.cancel}
          </button>
        </div>
      </form>
    </section>
  );
}
