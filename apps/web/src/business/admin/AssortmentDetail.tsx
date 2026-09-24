import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Link2, Link2Off, Search } from 'lucide-react';
import {
  SALE_UNITS,
  type OrganizationAssortmentRow,
} from '@cieslacalc/business-core';
import { catalogClient } from '../../catalog/client';
import { useBusiness } from '../context';
import { businessCopy } from '../copy';
import { formatMoney } from './AdminAssortment';

/**
 * ADMIN → ASORTYMENT → detail (§20, §21, §22).
 *
 * The screen where an operator answers "which RoofCalc product is this?".
 * Three rules it enforces:
 *
 * - linking is **explicit**. The catalogue search suggests; the operator
 *   presses `Połącz`. Nothing is auto-linked on a resemblance (§27);
 * - linking never touches the global catalogue — it writes one
 *   organization-owned column (§21);
 * - unlinking clears that column and keeps the row. Nothing is deleted (§22).
 */
export function AssortmentDetail({
  row,
  onChanged,
}: {
  row: OrganizationAssortmentRow;
  onChanged: (action?: 'linked') => void;
}) {
  const { i18n } = useTranslation();
  const m = businessCopy(i18n.language);
  const { organizationId, client } = useBusiness();
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [vat, setVat] = useState(
    row.item.vatRateBps === undefined
      ? ''
      : String(row.item.vatRateBps / 100).replace('.', ','),
  );
  const details = useQuery({
    queryKey: ['business', organizationId, 'assortment-detail', row.item.id],
    queryFn: ({ signal }) =>
      client.assortmentDetail(organizationId!, row.item.id, signal),
    enabled: Boolean(organizationId),
    retry: false,
  });

  const candidates = useQuery({
    queryKey: ['catalog', 'products', 'admin-link', search.trim()],
    queryFn: ({ signal }) =>
      catalogClient.searchProducts(
        { q: search.trim() || undefined, limit: 20 },
        signal,
      ),
    enabled: search.trim().length > 1,
    retry: false,
    staleTime: 60_000,
  });

  async function run(action: () => Promise<unknown>, completed?: 'linked') {
    setBusy(true);
    setError(undefined);
    try {
      await action();
      onChanged(completed);
    } catch (cause) {
      // The client throws with the server's stable error code as its message,
      // so the operator is told what actually went wrong rather than a
      // generic failure — "this variant is already linked to another active
      // row" is actionable; "something failed" is not.
      const code = cause instanceof Error ? cause.message : '';
      setError(
        code === 'not-found'
          ? m.adminDisabled
          : (m.errorCode[code] ?? m.actionFailed),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="bz-detail" data-testid="assortment-detail">
      <header>
        <h3>{m.detailTitle}</h3>
        <span className="bz-state" data-state={row.state}>
          {row.state === 'unmatched' ? m.stateUnmatched : m.stateMatched}
        </span>
      </header>
      <h4>
        {i18n.language.startsWith('pl') ? 'Dane hurtowni' : 'Wholesaler data'}
      </h4>
      <dl className="bz-detail-facts">
        <div>
          <dt>{m.internalSku}</dt>
          <dd>
            <code>{row.item.externalKey}</code>
          </dd>
        </div>
        <div>
          <dt>{m.importedName}</dt>
          <dd>{row.item.sourceName}</dd>
        </div>
        {row.item.ean && (
          <div>
            <dt>{m.ean}</dt>
            <dd>{row.item.ean}</dd>
          </div>
        )}
        <div>
          <dt>{m.columnPrice}</dt>
          <dd data-testid="detail-price">
            {row.price
              ? `${formatMoney(row.price.netAmountMinor, row.price.currencyCode, i18n.language)} / ${row.price.saleUnit}`
              : m.noWholesalePrice}
          </dd>
        </div>
        <div>
          <dt>VAT</dt>
          <dd>
            {row.item.vatRateBps === undefined
              ? i18n.language.startsWith('pl')
                ? 'BRAK VAT'
                : 'NO VAT'
              : `${row.item.vatRateBps / 100}%`}
          </dd>
        </div>
        <div>
          <dt>{m.saleUnitLabel}</dt>
          <dd>{row.price?.saleUnit ?? '—'}</dd>
        </div>
      </dl>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const parsed = Number(vat.replace(',', '.'));
          if (
            vat.trim() !== '' &&
            Number.isFinite(parsed) &&
            parsed >= 0 &&
            parsed <= 100
          )
            void run(() =>
              client.setFlags(organizationId!, row.item.id, {
                vatRateBps: Math.round(parsed * 100),
              }),
            );
        }}
      >
        <label>
          {m.vatRate}
          <input
            inputMode="decimal"
            value={vat}
            onChange={(event) => setVat(event.target.value)}
          />
        </label>
        <button
          className="a-button"
          disabled={
            busy ||
            vat.trim() === '' ||
            !Number.isFinite(Number(vat.replace(',', '.'))) ||
            Number(vat.replace(',', '.')) < 0 ||
            Number(vat.replace(',', '.')) > 100
          }
        >
          {i18n.language.startsWith('pl') ? 'Zapisz VAT' : 'Save VAT'}
        </button>
      </form>
      <h4>
        {i18n.language.startsWith('pl')
          ? 'Dane techniczne RoofCalc'
          : 'RoofCalc technical data'}
      </h4>
      <dl className="bz-detail-facts">
        <div>
          <dt>{m.matchedProduct}</dt>
          <dd data-testid="detail-match">
            {row.catalog
              ? `${row.catalog.manufacturerName} · ${row.catalog.productName}`
              : m.stateUnmatched}
          </dd>
        </div>
        {row.catalog?.variantName && (
          <div>
            <dt>{m.commercialVariant}</dt>
            <dd>
              {row.catalog.variantName}
              {row.catalog.variantSku ? ` (${row.catalog.variantSku})` : ''}
            </dd>
          </div>
        )}
      </dl>

      {row.state === 'unmatched' && (
        <p className="bz-warning" role="note">
          <AlertTriangle size={15} aria-hidden="true" /> {m.unmatchedWarning}
        </p>
      )}

      {error && <p role="alert">{error}</p>}

      <div className="bz-detail-actions">
        <button
          type="button"
          className="a-button"
          disabled={busy}
          onClick={() =>
            void run(() =>
              client.setFlags(organizationId!, row.item.id, {
                preferred: !row.item.preferred,
              }),
            )
          }
        >
          {row.item.preferred ? m.unmarkPreferred : m.markPreferred}
        </button>
        <button
          type="button"
          className="a-button"
          disabled={busy}
          onClick={() =>
            void run(() =>
              client.setFlags(organizationId!, row.item.id, {
                active: !row.item.active,
              }),
            )
          }
        >
          {row.item.active
            ? row.state === 'unmatched'
              ? m.skip
              : m.deactivate
            : m.activate}
        </button>
        {row.item.commercialVariantId && (
          <button
            type="button"
            className="a-button"
            disabled={busy}
            data-testid="detail-unlink"
            onClick={() =>
              void run(() => client.unlink(organizationId!, row.item.id))
            }
          >
            <Link2Off size={15} aria-hidden="true" /> {m.unlink}
          </button>
        )}
      </div>

      {row.item.commercialVariantId && (
        <PriceEditor
          busy={busy}
          currencyCode={details.data?.row.price?.currencyCode ?? 'PLN'}
          history={details.data?.priceHistory ?? []}
          onSave={(input) =>
            void run(async () => {
              await client.addPrice(organizationId!, {
                itemId: row.item.id,
                ...input,
              });
              await details.refetch();
            })
          }
        />
      )}

      <section className="bz-link" aria-label={m.link}>
        <h4>{m.link}</h4>
        <label className="bz-search">
          <span className="bz-visually-hidden">{m.searchCatalog}</span>
          <Search size={16} aria-hidden="true" />
          <input
            value={search}
            placeholder={m.searchCatalog}
            onChange={(event) => setSearch(event.target.value)}
            data-testid="link-search"
          />
        </label>
        {candidates.isFetching && <p aria-live="polite">{m.loading}</p>}
        <ul className="bz-link-results">
          {(candidates.data?.items ?? []).map((product) => (
            <li key={product.id} data-testid="link-candidate">
              <div>
                <strong>{product.name}</strong>
                <small>
                  {product.manufacturer.name} · {product.kind}
                </small>
              </div>
              <LinkVariants
                productId={product.id}
                busy={busy}
                onLink={(variantId) =>
                  void run(
                    () => client.link(organizationId!, row.item.id, variantId),
                    'linked',
                  )
                }
              />
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}

/**
 * A product's commercial variants, loaded on demand. A link always points at a
 * *variant*, never at a product family: colour and finish are commercial
 * identity, and the wholesaler's code refers to one of them specifically.
 */
export function LinkVariants({
  productId,
  busy,
  onLink,
}: {
  productId: string;
  busy: boolean;
  onLink: (variantId: string, label: string) => void;
}) {
  const { i18n } = useTranslation();
  const m = businessCopy(i18n.language);
  const [open, setOpen] = useState(false);
  const detail = useQuery({
    queryKey: ['catalog', 'product', productId],
    queryFn: ({ signal }) => catalogClient.getProduct(productId, signal),
    enabled: open,
    retry: false,
    staleTime: 60_000,
  });
  if (!open)
    return (
      <button type="button" className="a-button" onClick={() => setOpen(true)}>
        <Link2 size={15} aria-hidden="true" /> {m.commercialVariant}
      </button>
    );
  const variants = detail.data?.variants ?? [];
  return (
    <div className="bz-link-variants">
      {detail.isPending ? (
        <span>{m.loading}</span>
      ) : detail.isError ? (
        <span className="bz-hint">{m.unavailable}</span>
      ) : variants.length === 0 ? (
        /*
         * A link always points at a commercial variant, so a product family
         * with none cannot be linked yet. Say that plainly instead of showing
         * an empty area the operator would read as a broken button.
         */
        <span className="bz-hint" data-testid="link-no-variants">
          {m.noVariantsToLink}
        </span>
      ) : (
        variants.map((variant) => (
          <button
            key={variant.id}
            type="button"
            className="a-button a-primary"
            disabled={busy}
            data-testid="link-confirm"
            onClick={() => onLink(variant.id, variant.name)}
          >
            {variant.name} — {m.linkConfirm}
          </button>
        ))
      )}
    </div>
  );
}

function PriceEditor({
  busy,
  currencyCode,
  history,
  onSave,
}: {
  busy: boolean;
  currencyCode: string;
  history: Array<{
    entryId: string;
    netAmountMinor: number;
    currencyCode: string;
    saleUnit: (typeof SALE_UNITS)[number];
    validFrom: string;
  }>;
  onSave: (input: {
    netAmountMinor: number;
    saleUnit: (typeof SALE_UNITS)[number];
    validFrom: string;
    vatRateBps?: number;
  }) => void;
}) {
  const { i18n } = useTranslation();
  const m = businessCopy(i18n.language);
  const [amount, setAmount] = useState('');
  const [saleUnit, setSaleUnit] =
    useState<(typeof SALE_UNITS)[number]>('piece');
  const [vat, setVat] = useState('');
  const [validFrom, setValidFrom] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const parsedAmount = Number(amount.replace(',', '.'));
  const parsedVat = vat ? Number(vat.replace(',', '.')) : undefined;
  const valid =
    Number.isFinite(parsedAmount) &&
    parsedAmount >= 0 &&
    (parsedVat === undefined ||
      (Number.isFinite(parsedVat) && parsedVat >= 0 && parsedVat <= 100));
  return (
    <section className="bz-price-editor" data-testid="price-editor">
      <h4>{m.priceEditor}</h4>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!valid) return;
          onSave({
            netAmountMinor: Math.round(parsedAmount * 100),
            saleUnit,
            validFrom,
            ...(parsedVat !== undefined
              ? { vatRateBps: Math.round(parsedVat * 100) }
              : {}),
          });
          setAmount('');
        }}
      >
        <label>
          {m.netPrice}
          <input
            inputMode="decimal"
            required
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
            required
            value={validFrom}
            onChange={(event) => setValidFrom(event.target.value)}
          />
        </label>
        <button className="a-button a-primary" disabled={busy || !valid}>
          {m.saveNewPrice}
        </button>
      </form>
      <h4>{m.priceHistory}</h4>
      {detailsMessage(history, m.noPriceHistory)}
      {history.length > 0 && (
        <ol className="bz-price-history" data-testid="price-history">
          {history.map((price) => (
            <li key={price.entryId}>
              <time dateTime={price.validFrom}>{price.validFrom}</time>
              <strong>
                {formatMoney(
                  price.netAmountMinor,
                  price.currencyCode || currencyCode,
                  i18n.language,
                )}{' '}
                / {m.saleUnit[price.saleUnit]}
              </strong>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function detailsMessage(history: readonly unknown[], empty: string) {
  return history.length === 0 ? <p className="bz-hint">{empty}</p> : null;
}
