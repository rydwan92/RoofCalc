import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Plus, Upload, X } from 'lucide-react';
import {
  ASSORTMENT_FILTERS,
  type AssortmentFilter,
  type OrganizationAssortmentRow,
} from '@cieslacalc/business-core';
import { useBusiness } from '../context';
import { useDebouncedValue, useInfiniteAssortment } from '../use-assortment';
import { businessCopy, type BusinessCopy } from '../copy';
import { AssortmentDetail } from './AssortmentDetail';
import { AssortmentImport } from './AssortmentImport';
import { ManualAssortmentEntry } from './ManualAssortmentEntry';
import { catalogClient, type CatalogClient } from '../../catalog/client';

/**
 * ADMINISTRACJA → ASORTYMENT (§19, §37).
 *
 * A business screen, not an ERP and not an engineering console: the four
 * questions an assortment manager actually asks are *what do I sell*, *which
 * RoofCalc product is it*, *what is my code* and *what is my price*. Technical
 * revision JSON belongs nowhere near this view (§64).
 *
 * Writes only ever reach the server behind its local/dev capability gate. When
 * that gate is closed the screen still works as a read-only view and says so,
 * rather than offering buttons that will fail.
 */
export function AdminAssortment({
  onClose,
  initialFilter = 'all',
  catalog = catalogClient,
}: {
  onClose: () => void;
  initialFilter?: AssortmentFilter;
  catalog?: CatalogClient;
}) {
  const { i18n } = useTranslation();
  const m = businessCopy(i18n.language);
  const { organization, organizationId, client, unavailable, session } =
    useBusiness();
  const canManagePrices = !!session?.memberships
    .find((membership) => membership.organizationId === organizationId)
    ?.capabilities.includes('prices.manage');
  const [filter, setFilter] = useState<AssortmentFilter>(initialFilter);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search.trim());
  const [selectedId, setSelectedId] = useState<string>();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string>();
  const [bulkVat, setBulkVat] = useState('23,00');
  const [importing, setImporting] = useState(false);
  const [creating, setCreating] = useState(false);
  const queryClient = useQueryClient();
  const assortment = useInfiniteAssortment({
    filter,
    ...(debouncedSearch ? { q: debouncedSearch } : {}),
    limit: 50,
  });
  const catalogStatus = useQuery({
    queryKey: ['catalog', 'system-status'],
    queryFn: ({ signal }) => catalog.status!(signal),
    enabled: Boolean(catalog.status),
    retry: false,
  });

  const rows = useMemo(
    () => assortment.data?.pages.flatMap((page) => page.items) ?? [],
    [assortment.data],
  );
  const selected = rows.find((row) => row.item.id === selectedId);
  const summary = assortment.data?.pages[0]?.summary;
  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: ['business'] });

  useEffect(() => {
    setSelectedIds(new Set());
  }, [debouncedSearch, filter, organizationId]);

  async function applyBulk(flags: {
    active?: boolean;
    preferred?: boolean;
    vatRateBps?: number;
  }) {
    if (!organizationId || selectedIds.size === 0) return;
    setBulkBusy(true);
    setBulkError(undefined);
    try {
      await client.setFlagsBulk(organizationId, [...selectedIds], flags);
      setSelectedIds(new Set());
      refresh();
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : '';
      setBulkError(
        code === 'not-found'
          ? m.adminDisabled
          : (m.errorCode[code] ?? m.actionFailed),
      );
    } finally {
      setBulkBusy(false);
    }
  }

  if (unavailable)
    return (
      <section className="bz-admin" data-testid="admin-assortment">
        <AdminHeader m={m} name={organization?.name} onClose={onClose} />
        <p className="bz-unavailable" role="status">
          {m.unavailable}
        </p>
      </section>
    );

  if (importing)
    return (
      <section className="bz-admin" data-testid="admin-assortment">
        <AdminHeader m={m} name={organization?.name} onClose={onClose} />
        <AssortmentImport
          onDone={() => {
            setImporting(false);
            refresh();
          }}
          onCancel={() => setImporting(false)}
        />
      </section>
    );

  if (creating)
    return (
      <section className="bz-admin" data-testid="admin-assortment">
        <AdminHeader m={m} name={organization?.name} onClose={onClose} />
        <ManualAssortmentEntry
          onDone={() => {
            setCreating(false);
            refresh();
          }}
          onCancel={() => setCreating(false)}
        />
      </section>
    );

  if (selected)
    return (
      <section className="bz-admin" data-testid="admin-assortment">
        <AdminHeader m={m} name={organization?.name} onClose={onClose} />
        <button
          className="bz-back"
          onClick={() => setSelectedId(undefined)}
          type="button"
        >
          <ArrowLeft size={16} aria-hidden="true" /> {m.back}
        </button>
        <AssortmentDetail
          row={selected}
          onChanged={(action) => {
            if (action === 'linked') {
              const unresolved = rows.filter(
                (candidate) =>
                  candidate.state === 'unmatched' &&
                  candidate.item.id !== selected.item.id,
              );
              setSelectedId(unresolved[0]?.item.id);
            }
            refresh();
          }}
        />
      </section>
    );

  return (
    <section className="bz-admin" data-testid="admin-assortment">
      <AdminHeader m={m} name={organization?.name} onClose={onClose} />
      <section className="bz-system-status" data-testid="catalog-system-status">
        <div>
          <strong>{m.catalogData}</strong>
          <span>
            {catalogStatus.isError
              ? m.databaseUnavailable
              : catalogStatus.data
                ? m.databaseConnected
                : '…'}
          </span>
        </div>
        <Count
          label={m.technicalProducts}
          value={catalogStatus.data?.technicalProducts}
        />
        <Count
          label={m.technicalRevisions}
          value={catalogStatus.data?.technicalRevisions}
        />
        <Count
          label={m.commercialVariants}
          value={catalogStatus.data?.commercialVariants}
        />
        <Count
          label={m.priceEntries}
          value={
            summary
              ? Math.max(
                  0,
                  summary.total - summary.inactive - summary.withoutPrice,
                )
              : undefined
          }
        />
        <Count label={m.countAssortment} value={summary?.total} />
        {catalogStatus.data?.lastImportAt && (
          <small>
            {m.lastImport}: {catalogStatus.data.lastImportAt}
          </small>
        )}
      </section>
      {catalogStatus.data?.technicalProducts === 0 && (
        <section className="bz-catalog-empty">
          <strong>{m.catalogEmpty}</strong>
          <span>{m.initializationGuide}</span>
          {import.meta.env.DEV && <code>pnpm db:setup:local</code>}
        </section>
      )}
      <div className="bz-dashboard" data-testid="admin-dashboard">
        <Count label={m.countAssortment} value={summary?.total} />
        <Count label={m.countMatched} value={summary?.matched} />
        <Count
          label={m.countUnmatched}
          value={summary?.unmatched}
          tone={summary?.unmatched ? 'warning' : undefined}
        />
        <Count
          label={m.countWithoutPrice}
          value={summary?.withoutPrice}
          tone={summary?.withoutPrice ? 'warning' : undefined}
        />
        <Count
          label={m.countWithoutVat}
          value={summary?.withoutVat}
          tone={summary?.withoutVat ? 'warning' : undefined}
        />
        <Count label={m.countInactive} value={summary?.inactive} />
      </div>
      <section className="bz-quality" data-testid="admin-data-quality">
        <h3>{m.dataQuality}</h3>
        <div>
          <Count
            label={m.qualityUnmatched}
            value={summary?.unmatched}
            tone={summary?.unmatched ? 'warning' : undefined}
          />
          <Count
            label={m.qualityMatchedWithoutPrice}
            value={summary?.withoutPrice}
            tone={summary?.withoutPrice ? 'warning' : undefined}
          />
          <Count
            label={m.countWithoutVat}
            value={summary?.withoutVat}
            tone={summary?.withoutVat ? 'warning' : undefined}
          />
          <Count label={m.qualityWithoutSku} value={0} />
          <Count label={m.qualityInactive} value={summary?.inactive} />
          <Count
            label={m.qualityUnavailableToCompany}
            value={
              catalogStatus.data && summary
                ? Math.max(
                    0,
                    catalogStatus.data.technicalProducts - summary.matched,
                  )
                : undefined
            }
          />
        </div>
      </section>
      <div className="bz-admin-toolbar">
        <label>
          <span className="bz-visually-hidden">{m.searchAssortment}</span>
          <input
            value={search}
            placeholder={m.searchAssortment}
            onChange={(event) => setSearch(event.target.value)}
            data-testid="admin-search"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && rows[0]) {
                event.preventDefault();
                setSelectedId(rows[0].item.id);
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
        <div
          className="bz-filters"
          role="tablist"
          aria-label={m.adminAssortment}
        >
          {ASSORTMENT_FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={filter === value}
              data-filter={value}
              onClick={() => setFilter(value)}
            >
              {filterLabel(m, value)}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="a-button"
          onClick={() => setImporting(true)}
          data-testid="admin-import-open"
        >
          <Upload size={15} aria-hidden="true" /> {m.adminImport}
        </button>
        <button
          type="button"
          className="a-button"
          onClick={() => setCreating(true)}
          data-testid="admin-manual-open"
        >
          <Plus size={15} aria-hidden="true" /> {m.manualEntry}
        </button>
      </div>
      {selectedIds.size > 0 && (
        <div className="bz-bulk-actions" data-testid="admin-bulk-actions">
          <strong>{m.selectedCount(selectedIds.size)}</strong>
          <button
            type="button"
            className="a-button"
            disabled={bulkBusy}
            onClick={() => void applyBulk({ active: true })}
          >
            {m.bulkActivate}
          </button>
          <button
            type="button"
            className="a-button"
            disabled={bulkBusy}
            onClick={() => void applyBulk({ active: false })}
          >
            {m.bulkDeactivate}
          </button>
          <button
            type="button"
            className="a-button"
            disabled={bulkBusy}
            onClick={() => void applyBulk({ preferred: true })}
          >
            {m.bulkPrefer}
          </button>
          <button
            type="button"
            className="a-button"
            disabled={bulkBusy}
            onClick={() => void applyBulk({ preferred: false })}
          >
            {m.bulkUnprefer}
          </button>
          {canManagePrices && (
            <label>
              {m.vatRate}
              <input
                inputMode="decimal"
                value={bulkVat}
                onChange={(event) => setBulkVat(event.target.value)}
              />
            </label>
          )}
          {canManagePrices && (
            <button
              type="button"
              className="a-button"
              disabled={
                bulkBusy ||
                bulkVat.trim() === '' ||
                !Number.isFinite(Number(bulkVat.replace(',', '.'))) ||
                Number(bulkVat.replace(',', '.')) < 0 ||
                Number(bulkVat.replace(',', '.')) > 100
              }
              onClick={() =>
                void applyBulk({
                  vatRateBps: Math.round(
                    Number(bulkVat.replace(',', '.')) * 100,
                  ),
                })
              }
            >
              {m.bulkSetVat}
            </button>
          )}
        </div>
      )}
      {bulkError && <p role="alert">{bulkError}</p>}
      {assortment.isPending ? (
        <p aria-live="polite">{m.loading}</p>
      ) : assortment.isError ? (
        <p className="bz-unavailable" role="status">
          {m.unavailable}
        </p>
      ) : (
        <table className="bz-admin-table" data-testid="admin-table">
          <thead>
            <tr>
              <th scope="col">
                <input
                  type="checkbox"
                  aria-label={m.selectAllVisible}
                  checked={
                    rows.length > 0 &&
                    rows.every((row) => selectedIds.has(row.item.id))
                  }
                  onChange={(event) =>
                    setSelectedIds(
                      event.target.checked
                        ? new Set(rows.map((row) => row.item.id))
                        : new Set(),
                    )
                  }
                />
              </th>
              <th scope="col">{m.columnCode}</th>
              <th scope="col">{m.columnName}</th>
              <th scope="col">{m.columnMatch}</th>
              <th scope="col">{m.columnStatus}</th>
              <th scope="col">{m.columnPrice}</th>
              <th scope="col">{m.columnActive}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.item.id}
                data-testid="admin-row"
                data-state={row.state}
                tabIndex={0}
                role="button"
                onClick={() => setSelectedId(row.item.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelectedId(row.item.id);
                  }
                }}
              >
                <td onClick={(event) => event.stopPropagation()}>
                  <input
                    type="checkbox"
                    aria-label={`${m.selectRow}: ${row.item.externalKey}`}
                    checked={selectedIds.has(row.item.id)}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setSelectedIds((current) => {
                        const next = new Set(current);
                        if (checked) next.add(row.item.id);
                        else next.delete(row.item.id);
                        return next;
                      });
                    }}
                  />
                </td>
                <td>
                  <code>{row.item.externalKey}</code>
                </td>
                <td>{row.item.displayNameOverride ?? row.item.sourceName}</td>
                <td>{matchLabel(row, m)}</td>
                <td>
                  <span className="bz-state" data-state={row.state}>
                    {stateLabel(row.state, m)}
                  </span>
                </td>
                <td>
                  {row.price
                    ? formatMoney(
                        row.price.netAmountMinor,
                        row.price.currencyCode,
                        i18n.language,
                      )
                    : '—'}
                </td>
                <td>{row.item.active ? '✓' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!assortment.isPending && rows.length === 0 && (
        <p className="bz-empty">{m.noSearchResults}</p>
      )}
      {assortment.hasNextPage && (
        <button
          type="button"
          className="a-button bz-load-more"
          disabled={assortment.isFetchingNextPage}
          onClick={() => void assortment.fetchNextPage()}
        >
          {assortment.isFetchingNextPage ? m.loadingMore : m.loadMore}
        </button>
      )}
    </section>
  );
}

function AdminHeader({
  m,
  name,
  onClose,
}: {
  m: BusinessCopy;
  name: string | undefined;
  onClose: () => void;
}) {
  return (
    <header className="bz-admin-head">
      <div>
        <h2>{m.admin}</h2>
        <strong>{name}</strong>
      </div>
      <button type="button" className="a-button" onClick={onClose}>
        {m.back}
      </button>
    </header>
  );
}

function Count({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | undefined;
  tone?: 'warning';
}) {
  return (
    <div className="bz-count" data-tone={tone} data-testid={`count-${label}`}>
      <span>{label}</span>
      <strong>{value ?? '—'}</strong>
    </div>
  );
}

function filterLabel(m: BusinessCopy, filter: AssortmentFilter): string {
  return filter === 'all'
    ? m.filterAll
    : filter === 'active'
      ? m.filterActive
      : filter === 'unmatched'
        ? m.filterUnmatched
        : filter === 'without-price'
          ? m.filterWithoutPrice
          : filter === 'without-vat'
            ? m.filterWithoutVat
            : filter === 'inactive'
              ? m.filterInactive
              : m.filterPreferred;
}

function stateLabel(
  state: OrganizationAssortmentRow['state'],
  m: BusinessCopy,
) {
  return state === 'matched'
    ? m.stateMatched
    : state === 'unmatched'
      ? m.stateUnmatched
      : m.stateInactive;
}

function matchLabel(row: OrganizationAssortmentRow, m: BusinessCopy): string {
  if (!row.catalog) return m.stateUnmatched;
  return [
    row.catalog.manufacturerName,
    row.catalog.productName,
    row.catalog.variantName,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function formatMoney(
  minor: number,
  currency: string,
  locale: string,
): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(
    minor / 100,
  );
}
