import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  parseAssortmentCsv,
  type PriceImportRequest,
  type PriceImportPreviewResponse,
  type OrganizationAssortmentRow,
} from '@cieslacalc/business-core';
import { useBusiness } from '../context';
import { useDebouncedValue, useInfiniteAssortment } from '../use-assortment';
import { AssortmentDetail } from './AssortmentDetail';

const hints: Record<keyof PriceImportRequest['mapping'], RegExp> = {
  externalKey: /^(sku|kod|kod[ _]?towaru|indeks)$/i,
  netAmount: /^(cena|cena[ _]?netto|netto)$/i,
  vatRate: /^(vat|stawka[ _]?vat)$/i,
  saleUnit: /^(jm|jednostka)$/i,
};

export function PricingWorkspace() {
  const { i18n } = useTranslation();
  const pl = i18n.language.startsWith('pl');
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'without-price' | 'without-vat'>(
    'all',
  );
  const [importing, setImporting] = useState(false);
  const [selected, setSelected] = useState<OrganizationAssortmentRow>();
  const assortment = useInfiniteAssortment({
    filter,
    q: useDebouncedValue(search.trim()),
    limit: 50,
  });
  const rows = assortment.data?.pages.flatMap((page) => page.items) ?? [];
  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: ['business'] });
  if (importing)
    return (
      <PriceCsvImport
        onDone={() => {
          setImporting(false);
          refresh();
        }}
        onCancel={() => setImporting(false)}
      />
    );
  if (selected)
    return (
      <section className="bz-admin">
        <button className="a-button" onClick={() => setSelected(undefined)}>
          {pl ? '← Cennik' : '← Pricing'}
        </button>
        <AssortmentDetail
          row={selected}
          onChanged={() => {
            refresh();
            setSelected(undefined);
          }}
        />
      </section>
    );
  return (
    <section className="bz-admin" data-testid="pricing-workspace">
      <header className="bz-section-heading">
        <h2>{pl ? 'Cennik' : 'Pricing'}</h2>
        <button
          className="a-button a-primary"
          onClick={() => setImporting(true)}
        >
          {pl ? 'Aktualizuj ceny z CSV' : 'Update prices from CSV'}
        </button>
      </header>
      <div className="bz-admin-toolbar">
        <input
          aria-label={pl ? 'Szukaj SKU lub nazwy' : 'Search SKU or name'}
          placeholder={pl ? 'Szukaj SKU lub nazwy' : 'Search SKU or name'}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="bz-filters">
          {(['all', 'without-price', 'without-vat'] as const).map((value) => (
            <button
              key={value}
              aria-current={filter === value ? 'true' : undefined}
              onClick={() => setFilter(value)}
            >
              {value === 'all'
                ? pl
                  ? 'Wszystkie'
                  : 'All'
                : value === 'without-price'
                  ? pl
                    ? 'Bez ceny'
                    : 'Without price'
                  : pl
                    ? 'Bez VAT'
                    : 'Without VAT'}
            </button>
          ))}
        </div>
      </div>
      {assortment.isError && (
        <p role="alert">{pl ? 'Cennik niedostępny' : 'Pricing unavailable'}</p>
      )}
      <table className="bz-admin-table">
        <thead>
          <tr>
            <th>{pl ? 'Kod' : 'Code'}</th>
            <th>{pl ? 'Produkt' : 'Product'}</th>
            <th>{pl ? 'Cena netto' : 'Net price'}</th>
            <th>JM</th>
            <th>VAT</th>
            <th>{pl ? 'Obowiązuje od' : 'Valid from'}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.item.id}
              onClick={() => setSelected(row)}
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter') setSelected(row);
              }}
            >
              <td>
                <code>{row.item.externalKey}</code>
              </td>
              <td>{row.item.displayNameOverride ?? row.item.sourceName}</td>
              <td>
                {row.price
                  ? new Intl.NumberFormat(i18n.language, {
                      style: 'currency',
                      currency: row.price.currencyCode,
                    }).format(row.price.netAmountMinor / 100)
                  : '—'}
              </td>
              <td>{row.price?.saleUnit ?? '—'}</td>
              <td>
                {row.item.vatRateBps === undefined
                  ? pl
                    ? 'BRAK VAT'
                    : 'NO VAT'
                  : `${row.item.vatRateBps / 100}%`}
              </td>
              <td>{row.price?.validFrom ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {assortment.hasNextPage && (
        <button
          className="a-button"
          disabled={assortment.isFetchingNextPage}
          onClick={() => void assortment.fetchNextPage()}
        >
          {pl ? 'Pokaż więcej' : 'Load more'}
        </button>
      )}
      {!assortment.isPending && rows.length === 0 && (
        <p>{pl ? 'Brak pozycji' : 'No items'}</p>
      )}
      <p>
        {pl
          ? 'Wybierz wiersz, aby ręcznie dodać cenę.'
          : 'Select a row to add a price manually.'}
      </p>
    </section>
  );
}

function PriceCsvImport({
  onDone,
  onCancel,
}: {
  onDone: () => void;
  onCancel: () => void;
}) {
  const { i18n } = useTranslation();
  const pl = i18n.language.startsWith('pl');
  const { organizationId, client } = useBusiness();
  const [csv, setCsv] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<
    Partial<PriceImportRequest['mapping']>
  >({});
  const [validFrom, setValidFrom] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [preview, setPreview] = useState<PriceImportPreviewResponse>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ready = !!(
    csv &&
    mapping.externalKey &&
    mapping.netAmount &&
    validFrom
  );
  async function run(apply: boolean) {
    if (!ready || !organizationId) return;
    setBusy(true);
    setError('');
    try {
      const result = await client.importPricesCsv(organizationId, {
        csv,
        mapping: mapping as PriceImportRequest['mapping'],
        validFrom,
        apply,
      });
      setPreview(result);
      if (apply) onDone();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  }
  async function readFile(file: File) {
    const text =
      typeof file.text === 'function'
        ? await file.text()
        : await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result ?? ''));
            reader.onerror = () => reject(reader.error);
            reader.readAsText(file);
          });
    const parsed = parseAssortmentCsv(text);
    const suggested: Partial<PriceImportRequest['mapping']> = {};
    for (const field of Object.keys(hints) as Array<
      keyof PriceImportRequest['mapping']
    >) {
      const matches = parsed.headers.filter((header) =>
        hints[field].test(header.trim()),
      );
      if (matches.length === 1) suggested[field] = matches[0];
    }
    setCsv(text);
    setHeaders(parsed.headers);
    setMapping(suggested);
    setPreview(undefined);
  }
  return (
    <section className="bz-import" data-testid="price-csv-import">
      <header>
        <h2>{pl ? 'Aktualizacja cennika' : 'Price update'}</h2>
        <button className="a-button" onClick={onCancel}>
          {pl ? 'Wróć' : 'Back'}
        </button>
      </header>
      <label>
        {pl ? 'Plik CSV' : 'CSV file'}{' '}
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void readFile(file);
          }}
        />
      </label>
      {headers.length > 0 && (
        <div className="bz-mapping">
          {(
            Object.keys(hints) as Array<keyof PriceImportRequest['mapping']>
          ).map((field) => (
            <label key={field}>
              {field}
              {(field === 'externalKey' || field === 'netAmount') && ' *'}
              <select
                value={mapping[field] ?? ''}
                onChange={(event) => {
                  setMapping((current) => ({
                    ...current,
                    [field]: event.target.value || undefined,
                  }));
                  setPreview(undefined);
                }}
              >
                <option value="">—</option>
                {headers.map((header) => (
                  <option key={header} value={header}>
                    {header}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      )}
      <label>
        {pl ? 'Obowiązuje od' : 'Valid from'}{' '}
        <input
          type="date"
          value={validFrom}
          onChange={(event) => {
            setValidFrom(event.target.value);
            setPreview(undefined);
          }}
        />
      </label>
      <button
        className="a-button"
        disabled={!ready || busy}
        onClick={() => void run(false)}
      >
        {pl ? 'Pokaż podgląd' : 'Preview'}
      </button>
      {error && <p role="alert">{error}</p>}
      {preview && (
        <div className="bz-preview" data-testid="price-import-preview">
          <p>
            {preview.counts.total} {pl ? 'wierszy' : 'rows'} ·{' '}
            {preview.counts.changed} {pl ? 'zmian' : 'changes'} ·{' '}
            {preview.counts.unchanged} {pl ? 'bez zmian' : 'unchanged'} ·{' '}
            {preview.counts.unknown} {pl ? 'nieznanych SKU' : 'unknown SKUs'} ·{' '}
            {preview.counts.invalid} {pl ? 'błędnych' : 'invalid'}
          </p>
          <p>
            VAT: {preview.counts.withVat} {pl ? 'dostarczonych' : 'provided'} ·{' '}
            {preview.counts.withoutVat} {pl ? 'bez informacji' : 'missing'}
          </p>
          <table className="bz-preview-problems">
            <thead>
              <tr>
                <th>#</th>
                <th>SKU</th>
                <th>{pl ? 'Cena netto' : 'Net price'}</th>
                <th>VAT</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {[...preview.rows]
                .sort(
                  (a, b) =>
                    (a.status === 'invalid' || a.status === 'unknown-sku'
                      ? -1
                      : 0) -
                    (b.status === 'invalid' || b.status === 'unknown-sku'
                      ? -1
                      : 0),
                )
                .slice(0, 100)
                .map((row) => (
                  <tr key={row.sourceLine}>
                    <td>{row.sourceLine}</td>
                    <td>{row.externalKey}</td>
                    <td>
                      {row.netAmountMinor === undefined
                        ? '—'
                        : new Intl.NumberFormat(i18n.language, {
                            minimumFractionDigits: 2,
                          }).format(row.netAmountMinor / 100)}
                    </td>
                    <td>
                      {row.vatRateBps === undefined
                        ? '—'
                        : `${row.vatRateBps / 100}%`}
                    </td>
                    <td>
                      {row.status === 'unknown-sku'
                        ? 'UNKNOWN SKU'
                        : row.status}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          <button
            className="a-button a-primary"
            disabled={busy}
            onClick={() => void run(true)}
          >
            {pl ? 'Zastosuj aktualizację' : 'Apply update'}
          </button>
        </div>
      )}
    </section>
  );
}
