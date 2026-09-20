import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Upload } from 'lucide-react';
import {
  ASSORTMENT_FILTERS,
  type AssortmentFilter,
  type OrganizationAssortmentRow,
} from '@cieslacalc/business-core';
import { useBusiness } from '../context';
import { useAssortment } from '../use-assortment';
import { businessCopy, type BusinessCopy } from '../copy';
import { AssortmentDetail } from './AssortmentDetail';
import { AssortmentImport } from './AssortmentImport';

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
export function AdminAssortment({ onClose }: { onClose: () => void }) {
  const { i18n } = useTranslation();
  const m = businessCopy(i18n.language);
  const { organization, unavailable } = useBusiness();
  const [filter, setFilter] = useState<AssortmentFilter>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string>();
  const [importing, setImporting] = useState(false);
  const queryClient = useQueryClient();
  const assortment = useAssortment({
    filter,
    ...(search.trim() ? { q: search.trim() } : {}),
    limit: 200,
  });

  const rows = useMemo(() => assortment.data?.items ?? [], [assortment.data]);
  const selected = rows.find((row) => row.item.id === selectedId);
  const summary = assortment.data?.summary;
  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: ['business'] });

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
        <AssortmentDetail row={selected} onChanged={refresh} />
      </section>
    );

  return (
    <section className="bz-admin" data-testid="admin-assortment">
      <AdminHeader m={m} name={organization?.name} onClose={onClose} />
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
        <Count label={m.countInactive} value={summary?.inactive} />
      </div>
      <div className="bz-admin-toolbar">
        <label>
          <span className="bz-visually-hidden">{m.searchAssortment}</span>
          <input
            value={search}
            placeholder={m.searchAssortment}
            onChange={(event) => setSearch(event.target.value)}
            data-testid="admin-search"
          />
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
      </div>
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
        : m.filterWithoutPrice;
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
