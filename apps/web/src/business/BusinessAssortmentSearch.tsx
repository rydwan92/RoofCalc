import { useMemo, useState } from 'react';
import { Search, Star, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { OrganizationAssortmentRow } from '@cieslacalc/business-core';
import { useBusiness } from './context';
import {
  pickerRows,
  useDebouncedValue,
  useInfiniteAssortment,
} from './use-assortment';
import { businessCopy } from './copy';

/** Reusable organization-assortment search/list shell; product adapters stay specific. */
export function BusinessAssortmentSearch({
  kind,
  onSelect,
  onBrowseCatalog,
}: {
  kind: string;
  onSelect: (row: OrganizationAssortmentRow) => Promise<void> | void;
  onBrowseCatalog: () => void;
}) {
  const { i18n } = useTranslation();
  const { organization, unavailable } = useBusiness();
  const m = businessCopy(i18n.language);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search.trim());
  const [applyingId, setApplyingId] = useState<string>();
  const [error, setError] = useState<string>();
  const assortment = useInfiniteAssortment({
    filter: 'active',
    kind,
    ...(debouncedSearch ? { q: debouncedSearch } : {}),
    limit: 40,
  });
  const rows = useMemo(
    () =>
      pickerRows(
        assortment.data?.pages.flatMap((page) => page.items) ?? [],
        kind,
      ),
    [assortment.data, kind],
  );
  const needle = search.trim().toLocaleLowerCase();
  const visible = needle
    ? rows.filter((row) =>
        [
          row.item.externalKey,
          row.item.ean,
          row.item.displayNameOverride ?? row.item.sourceName,
          row.catalog?.productName,
          row.catalog?.manufacturerName,
          row.catalog?.variantName,
          row.catalog?.variantSku,
        ].some((value) => value?.toLocaleLowerCase().startsWith(needle)),
      )
    : rows;

  async function select(row: OrganizationAssortmentRow) {
    setApplyingId(row.item.id);
    setError(undefined);
    try {
      await onSelect(row);
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
          onKeyDown={(event) => {
            if (event.key === 'Enter' && visible[0]) {
              event.preventDefault();
              void select(visible[0]);
            }
          }}
        />
        {search && (
          <button
            type="button"
            className="bz-search-clear"
            aria-label={m.clearSearch}
            onClick={() => setSearch('')}
          >
            <X size={15} aria-hidden="true" />
          </button>
        )}
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
          {debouncedSearch ? m.noSearchResults : m.noProductsOfKind}
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
                  {row.price
                    ? m.organizationPrice(
                        new Intl.NumberFormat(i18n.language, {
                          style: 'currency',
                          currency: row.price.currencyCode,
                        }).format(row.price.netAmountMinor / 100),
                        m.saleUnit[row.price.saleUnit] ?? row.price.saleUnit,
                      )
                    : m.priceMissing}
                </span>
                <button
                  className="a-button a-primary"
                  disabled={applyingId !== undefined}
                  onClick={() => void select(row)}
                >
                  {applyingId === row.item.id ? m.applying : m.detailsAndChoose}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {assortment.hasNextPage && (
        <button
          className="a-button bz-load-more"
          type="button"
          disabled={assortment.isFetchingNextPage}
          onClick={() => void assortment.fetchNextPage()}
        >
          {assortment.isFetchingNextPage ? m.loadingMore : m.loadMore}
        </button>
      )}
      <button className="a-button bz-browse-catalog" onClick={onBrowseCatalog}>
        {m.browseCatalog}
      </button>
    </div>
  );
}
