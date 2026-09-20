import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Link2, Link2Off, Search } from 'lucide-react';
import type { OrganizationAssortmentRow } from '@cieslacalc/business-core';
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
  onChanged: () => void;
}) {
  const { i18n } = useTranslation();
  const m = businessCopy(i18n.language);
  const { organizationId, client } = useBusiness();
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

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

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(undefined);
    try {
      await action();
      onChanged();
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
        <div>
          <dt>{m.columnPrice}</dt>
          <dd data-testid="detail-price">
            {row.price
              ? `${formatMoney(row.price.netAmountMinor, row.price.currencyCode, i18n.language)} / ${row.price.saleUnit}`
              : m.noWholesalePrice}
          </dd>
        </div>
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
          {row.item.active ? m.deactivate : m.activate}
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
                  void run(() =>
                    client.link(organizationId!, row.item.id, variantId),
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
function LinkVariants({
  productId,
  busy,
  onLink,
}: {
  productId: string;
  busy: boolean;
  onLink: (variantId: string) => void;
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
            onClick={() => onLink(variant.id)}
          >
            {variant.name} — {m.linkConfirm}
          </button>
        ))
      )}
    </div>
  );
}
