import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Search, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { createCatalogProductSelection } from '@cieslacalc/catalog-core';
import type { CoveringProductSelection } from '@cieslacalc/covering-core';
import type { OrganizationAssortmentRow } from '@cieslacalc/business-core';
import { catalogClient, type CatalogClient } from '../catalog/client';
import { useBusiness } from './context';
import { pickerRows, useAssortment } from './use-assortment';
import { businessCopy } from './copy';

/**
 * The "Asortyment firmy" tab of the product picker (§15, §16, §44).
 *
 * A salesperson searches what their own company sells — a few dozen or a few
 * hundred rows — not five thousand global catalogue products. Rows show the
 * warehouse code and whether a price exists, and nothing else administrative.
 *
 * Applying a row does **not** short-circuit the technical path. It fetches the
 * exact catalogue revision and builds the same `CoveringProductSelection` the
 * catalogue tab builds, so the technical snapshot a project stores is
 * identical whichever tab it was picked from — the organization contributed
 * availability and a code, never a dimension (§13, §71).
 */
export function BusinessAssortmentPicker({
  kind,
  onApply,
  onBrowseCatalog,
  catalog = catalogClient,
}: {
  kind: string;
  onApply: (selection: CoveringProductSelection) => void;
  onBrowseCatalog: () => void;
  catalog?: CatalogClient;
}) {
  const { i18n } = useTranslation();
  const { organization, unavailable } = useBusiness();
  const m = businessCopy(i18n.language);
  const [search, setSearch] = useState('');
  const [applyingId, setApplyingId] = useState<string>();
  const [error, setError] = useState<string>();
  const queryClient = useQueryClient();
  const assortment = useAssortment({ filter: 'active', kind, limit: 200 });

  const rows = useMemo(
    () => pickerRows(assortment.data?.items ?? [], kind),
    [assortment.data, kind],
  );
  const needle = search.trim().toLowerCase();
  const visible = needle
    ? rows.filter((row) =>
        [
          row.item.externalKey,
          row.item.displayNameOverride ?? row.item.sourceName,
          row.catalog?.productName,
          row.catalog?.manufacturerName,
          row.catalog?.variantName,
        ].some((value) => value?.toLowerCase().includes(needle)),
      )
    : rows;

  async function apply(row: OrganizationAssortmentRow) {
    if (!row.catalog) return;
    setApplyingId(row.item.id);
    setError(undefined);
    try {
      const exact = await queryClient.fetchQuery({
        queryKey: [
          'catalog',
          'revision',
          row.catalog.productId,
          row.catalog.currentRevisionId,
        ],
        queryFn: ({ signal }) =>
          catalog.getRevision(
            row.catalog!.productId,
            row.catalog!.currentRevisionId,
            signal,
          ),
        staleTime: Infinity,
      });
      const detail = await queryClient.fetchQuery({
        queryKey: ['catalog', 'product', row.catalog.productId],
        queryFn: ({ signal }) =>
          catalog.getProduct(row.catalog!.productId, signal),
        staleTime: 60_000,
      });
      const variant = detail.variants.find(
        (candidate) => candidate.id === row.catalog!.variantId,
      );
      onApply(
        createCatalogProductSelection({
          manufacturer: exact.manufacturer,
          product: exact.product,
          revision: exact.revision,
          ...(variant ? { variant } : {}),
        }),
      );
    } catch {
      setError(m.applyFailed);
    } finally {
      setApplyingId(undefined);
    }
  }

  if (unavailable)
    return (
      <div className="bz-picker" data-testid="business-picker">
        <p className="bz-unavailable" role="status">
          {m.unavailable}
        </p>
        <button className="a-button" onClick={onBrowseCatalog}>
          {m.browseCatalog}
        </button>
      </div>
    );

  return (
    <div className="bz-picker" data-testid="business-picker">
      <header className="bz-picker-head">
        <div>
          <strong>{m.companyAssortment}</strong>
          <small data-testid="business-picker-count">
            {m.productCount(rows.length)}
          </small>
        </div>
        <span className="bz-org-name">{organization?.name}</span>
      </header>
      <label className="bz-search">
        <span className="bz-visually-hidden">{m.searchAssortment}</span>
        <Search size={16} aria-hidden="true" />
        <input
          value={search}
          placeholder={m.searchAssortment}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      {assortment.isPending ? (
        <p aria-live="polite">{m.loading}</p>
      ) : assortment.isError ? (
        <p className="bz-unavailable" role="status">
          {m.unavailable}
        </p>
      ) : visible.length === 0 ? (
        <p className="bz-empty" data-testid="business-picker-empty">
          {rows.length === 0 ? m.noProductsOfKind : m.noSearchResults}
        </p>
      ) : (
        <ul className="bz-picker-list">
          {visible.map((row) => (
            <li key={row.item.id} data-testid="business-picker-row">
              <div className="bz-row-identity">
                <strong>
                  {row.item.displayNameOverride ?? row.item.sourceName}
                  {row.item.preferred && (
                    <span className="bz-preferred" title={m.preferredHint}>
                      <Star size={13} aria-hidden="true" /> {m.preferred}
                    </span>
                  )}
                </strong>
                <small>
                  {row.catalog?.manufacturerName} · {row.catalog?.productName}
                  {row.catalog?.variantName
                    ? ` · ${row.catalog.variantName}`
                    : ''}
                </small>
                <small className="bz-sku">
                  {m.wholesalerCode}: <code>{row.item.externalKey}</code>
                </small>
              </div>
              <div className="bz-row-commerce">
                <span
                  className="bz-price-state"
                  data-has-price={row.price ? 'yes' : 'no'}
                >
                  {row.price ? m.priceAvailable : m.priceMissing}
                </span>
                <button
                  className="a-button a-primary"
                  disabled={applyingId !== undefined}
                  onClick={() => void apply(row)}
                >
                  {applyingId === row.item.id ? m.applying : m.use}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <button className="a-button bz-browse-catalog" onClick={onBrowseCatalog}>
        {m.browseCatalog}
      </button>
    </div>
  );
}
