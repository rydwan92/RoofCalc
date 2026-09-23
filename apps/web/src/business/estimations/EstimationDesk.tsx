import { useState } from 'react';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { EstimationListQuery } from '@cieslacalc/business-core';
import {
  compareQuoteTotals,
  summarizeQuote,
  summarizeQuoteByGroup,
} from '@cieslacalc/quote-core';
import { useBusiness } from '../context';
import { useDebouncedValue } from '../use-assortment';
import { workspaceClient, type EstimationDetail } from '../workspace/client';

export function EstimationDesk({
  onOpen,
  onNew,
}: {
  onOpen: (id: string) => Promise<void> | void;
  onNew: () => void;
}) {
  const { i18n } = useTranslation(),
    pl = i18n.language.startsWith('pl');
  const { organizationId: org } = useBusiness();
  const cache = useQueryClient();
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search);
  const [status, setStatus] = useState<EstimationListQuery['status']>('active');
  const [quote, setQuote] = useState<EstimationListQuery['quote']>('all');
  const [sort, setSort] = useState<EstimationListQuery['sort']>('updated');
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);
  const [duplicate, setDuplicate] = useState<{ id: string; name: string }>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  const query = useQuery({
    queryKey: ['business', org, 'estimations', q, status, quote, sort, offset],
    queryFn: () =>
      workspaceClient.estimations(org!, undefined, offset, {
        q,
        status,
        quote,
        sort,
      }),
    enabled: !!org,
    retry: false,
  });
  const comparisons = useQueries({
    queries: (comparing ? selected : []).map((id) => ({
      queryKey: ['business', org, 'comparison', id],
      queryFn: () => workspaceClient.estimation(org!, id),
      enabled: !!org,
      staleTime: 0,
      retry: false,
    })),
  });
  async function run(action: () => Promise<unknown> | void) {
    setBusy(true);
    setError(false);
    try {
      await action();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  const statusLabel = (value: string) =>
    ({
      draft: pl ? 'Robocza' : 'Draft',
      quoted: pl ? 'Oferta' : 'Quoted',
      archived: pl ? 'Archiwalna' : 'Archived',
    })[value] ?? value;
  const money = (value: number | undefined, currency = 'PLN') =>
    value === undefined
      ? '—'
      : new Intl.NumberFormat(i18n.language, {
          style: 'currency',
          currency,
        }).format(value / 100);
  const records = comparisons.flatMap((result) =>
    result.data ? [result.data] : [],
  );
  return (
    <section className="bz-desk" data-testid="estimation-desk">
      <div className="bz-section-heading">
        <div>
          <h2>{pl ? 'Wyceny' : 'Estimations'}</h2>
          <p>
            {pl
              ? 'Inwestycje, warianty i oferty klientów'
              : 'Customer projects, variants and quotes'}
          </p>
        </div>
        <button className="a-button a-primary" onClick={onNew}>
          + {pl ? 'Nowa wycena' : 'New estimation'}
        </button>
      </div>
      <div className="bz-desk-filters">
        <label>
          {pl ? 'Szukaj wyceny' : 'Search estimations'}
          <input
            type="search"
            placeholder={
              pl
                ? 'Inwestycja, klient, lokalizacja, oferta…'
                : 'Project, customer, location, quote…'
            }
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setOffset(0);
            }}
          />
        </label>
        <label>
          Status
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as typeof status);
              setOffset(0);
            }}
          >
            {[
              ['active', pl ? 'Aktywne' : 'Active'],
              ['all', pl ? 'Wszystkie' : 'All'],
              ['draft', pl ? 'Robocze' : 'Draft'],
              ['quoted', pl ? 'Z ofertą' : 'Quoted'],
              ['archived', pl ? 'Archiwalne' : 'Archived'],
            ].map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          {pl ? 'Oferta' : 'Quote'}
          <select
            value={quote}
            onChange={(e) => {
              setQuote(e.target.value as typeof quote);
              setOffset(0);
            }}
          >
            <option value="all">{pl ? 'Wszystkie' : 'All'}</option>
            <option value="with">{pl ? 'Z ofertą' : 'With quote'}</option>
            <option value="without">
              {pl ? 'Bez oferty' : 'Without quote'}
            </option>
          </select>
        </label>
        <label>
          {pl ? 'Sortuj' : 'Sort'}
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as typeof sort);
              setOffset(0);
            }}
          >
            <option value="updated">
              {pl ? 'Ostatnia zmiana' : 'Last updated'}
            </option>
            <option value="customer">{pl ? 'Klient' : 'Customer'}</option>
            <option value="name">
              {pl ? 'Nazwa wyceny' : 'Estimation name'}
            </option>
          </select>
        </label>
      </div>
      {error && (
        <p role="alert">
          {pl
            ? 'Nie udało się wykonać operacji. Twoje dane pozostają zapisane. Spróbuj ponownie.'
            : 'Operation failed. Your saved data remains intact. Try again.'}
        </p>
      )}
      {duplicate && (
        <form
          className="bz-duplicate-form"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const next = await workspaceClient.duplicateEstimation(
                org!,
                duplicate.id,
                duplicate.name,
              );
              await cache.invalidateQueries({
                queryKey: ['business', org, 'estimations'],
              });
              setDuplicate(undefined);
              await onOpen(next.estimation.id);
            });
          }}
        >
          <label>
            {pl ? 'Nazwa nowego wariantu' : 'New variant name'}
            <input
              autoFocus
              required
              maxLength={240}
              value={duplicate.name}
              onChange={(e) =>
                setDuplicate({ ...duplicate, name: e.target.value })
              }
            />
          </label>
          <button className="a-button a-primary" disabled={busy}>
            {pl ? 'Utwórz wariant' : 'Create variant'}
          </button>
          <button
            type="button"
            className="a-button"
            onClick={() => setDuplicate(undefined)}
          >
            {pl ? 'Anuluj' : 'Cancel'}
          </button>
          <small>
            {pl
              ? 'Niezależny projekt dla tego samego klienta. Oferta nie zostanie skopiowana.'
              : 'Independent project for the same customer. The quote will not be copied.'}
          </small>
        </form>
      )}
      <div className="bz-section-heading">
        <span>
          {pl
            ? 'Wybierz 2–3 wyceny do porównania'
            : 'Select 2–3 estimations to compare'}
        </span>
        <button
          className="a-button"
          disabled={selected.length < 2}
          onClick={() => setComparing(true)}
        >
          {pl ? 'Porównaj wyceny' : 'Compare estimations'} ({selected.length})
        </button>
      </div>
      {query.isError ? (
        <p role="alert">
          {pl ? 'Nie można pobrać wycen.' : 'Estimations unavailable.'}{' '}
          <button onClick={() => void query.refetch()}>
            {pl ? 'Ponów' : 'Retry'}
          </button>
        </p>
      ) : query.isPending ? (
        <p aria-busy="true">…</p>
      ) : (
        <>
          <div className="bz-desk-table-wrap">
            <table className="bz-desk-table">
              <thead>
                <tr>
                  {[
                    '',
                    pl ? 'Wycena / inwestycja' : 'Estimation / project',
                    pl ? 'Klient' : 'Customer',
                    pl ? 'Lokalizacja' : 'Location',
                    'Status',
                    pl ? 'Oferta' : 'Quote',
                    pl ? 'Wartość' : 'Value',
                    pl ? 'Ostatnia zmiana' : 'Last updated',
                    '',
                  ].map((label, index) => (
                    <th key={index}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`${pl ? 'Porównaj' : 'Compare'} ${row.name}`}
                        checked={selected.includes(row.id)}
                        disabled={
                          !selected.includes(row.id) && selected.length === 3
                        }
                        onChange={(e) => {
                          setSelected(
                            e.target.checked
                              ? [...selected, row.id]
                              : selected.filter((id) => id !== row.id),
                          );
                          setComparing(false);
                        }}
                      />
                    </td>
                    <td>
                      <strong>{row.name}</strong>
                    </td>
                    <td>{row.customerName}</td>
                    <td>{row.location || '—'}</td>
                    <td>{statusLabel(row.status)}</td>
                    <td>
                      {row.quoteNumber ? (
                        <button
                          className="bz-back-link"
                          onClick={() => void run(() => onOpen(row.id))}
                          aria-label={`${pl ? 'Otwórz ofertę' : 'Open quote'} ${row.quoteNumber}`}
                        >
                          {row.quoteNumber}
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      {money(row.grossMinor ?? row.netMinor, row.currencyCode)}
                      {row.netMinor !== undefined && (
                        <small>
                          {row.grossMinor === undefined
                            ? pl
                              ? 'netto · niepełna'
                              : 'net · incomplete'
                            : pl
                              ? 'brutto'
                              : 'gross'}
                        </small>
                      )}
                    </td>
                    <td>
                      {new Date(row.updatedAt).toLocaleDateString(
                        i18n.language,
                      )}
                    </td>
                    <td className="bz-desk-actions">
                      <button
                        className="a-button"
                        disabled={busy}
                        onClick={() => void run(() => onOpen(row.id))}
                      >
                        {pl ? 'Otwórz' : 'Open'}
                      </button>
                      <details>
                        <summary
                          aria-label={`${pl ? 'Działania' : 'Actions'} ${row.name}`}
                        >
                          •••
                        </summary>
                        <div>
                          <button
                            disabled={busy}
                            onClick={() =>
                              setDuplicate({
                                id: row.id,
                                name: `${row.name} — ${pl ? 'wariant 2' : 'variant 2'}`,
                              })
                            }
                          >
                            {pl
                              ? 'Duplikuj jako wariant'
                              : 'Duplicate as variant'}
                          </button>
                          {row.status !== 'archived' && (
                            <button
                              disabled={busy}
                              onClick={() =>
                                void run(async () => {
                                  await workspaceClient.archiveEstimation(
                                    org!,
                                    row.id,
                                  );
                                  await cache.invalidateQueries({
                                    queryKey: ['business', org, 'estimations'],
                                  });
                                })
                              }
                            >
                              {pl ? 'Archiwizuj' : 'Archive'}
                            </button>
                          )}
                        </div>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!query.data.items.length && (
            <p className="bz-empty">
              {pl
                ? 'Brak wycen pasujących do filtrów. Zmień wyszukiwanie lub utwórz nową wycenę.'
                : 'No matching estimations. Adjust filters or create an estimation.'}
            </p>
          )}
          <div className="bz-section-heading">
            <button
              className="a-button"
              disabled={!offset}
              onClick={() => setOffset(Math.max(0, offset - 30))}
            >
              {pl ? 'Poprzednie' : 'Previous'}
            </button>
            <span>
              {pl ? 'Strona' : 'Page'} {Math.floor(offset / 30) + 1}
            </span>
            <button
              className="a-button"
              disabled={query.data.nextOffset === undefined}
              onClick={() => setOffset(query.data.nextOffset!)}
            >
              {pl ? 'Następne' : 'Next'}
            </button>
          </div>
        </>
      )}
      {comparing && (
        <section className="bz-comparison" data-testid="estimation-comparison">
          <div className="bz-section-heading">
            <h3>{pl ? 'Porównanie wycen' : 'Estimation comparison'}</h3>
            <button className="a-button" onClick={() => setComparing(false)}>
              {pl ? 'Zamknij porównanie' : 'Close comparison'}
            </button>
          </div>
          {comparisons.some((result) => result.isError) ? (
            <p role="alert">
              {pl ? 'Nie można pobrać porównania.' : 'Comparison unavailable.'}
              <button
                onClick={() =>
                  comparisons.forEach((result) => void result.refetch())
                }
              >
                {pl ? 'Ponów' : 'Retry'}
              </button>
            </p>
          ) : records.length !== selected.length ? (
            <p>…</p>
          ) : (
            <>
              {new Set(records.map((record) => record.customer.id)).size >
                1 && (
                <p role="status">
                  {pl
                    ? 'Wybrane wyceny dotyczą różnych klientów.'
                    : 'Selected estimations belong to different customers.'}
                </p>
              )}
              <div
                className="bz-comparison-grid"
                style={{
                  gridTemplateColumns: `repeat(${records.length}, minmax(240px, 1fr))`,
                }}
              >
                {records.map((record, index) => (
                  <Comparison
                    key={record.estimation.id}
                    record={record}
                    base={index ? records[0] : undefined}
                    locale={i18n.language}
                  />
                ))}
              </div>
            </>
          )}
        </section>
      )}
    </section>
  );
}

function Comparison({
  record,
  base,
  locale,
}: {
  record: EstimationDetail;
  base?: EstimationDetail;
  locale: string;
}) {
  const pl = locale.startsWith('pl'),
    draft = record.quote?.snapshot;
  const summary = draft ? summarizeQuote(draft) : undefined;
  const difference =
    draft && base?.quote
      ? compareQuoteTotals(base.quote.snapshot, draft)
      : undefined;
  const money = (value?: number) =>
    value === undefined
      ? '—'
      : new Intl.NumberFormat(locale, {
          style: 'currency',
          currency: draft!.currencyCode,
          signDisplay: 'auto',
        }).format(value / 100);
  const groups = pl
    ? {
        covering: 'Pokrycie',
        layers: 'Warstwy',
        'roof-system': 'System dachu',
        drainage: 'Odwodnienie',
        construction: 'Konstrukcja',
        other: 'Pozostałe',
      }
    : {
        covering: 'Covering',
        layers: 'Layers',
        'roof-system': 'Roof system',
        drainage: 'Drainage',
        construction: 'Construction',
        other: 'Other',
      };
  return (
    <article>
      <h4>{record.estimation.name}</h4>
      <p>{record.customer.companyName || record.customer.name}</p>
      <small>
        {record.estimation.status === 'archived'
          ? pl
            ? 'Archiwalna'
            : 'Archived'
          : draft
            ? pl
              ? 'Oferta'
              : 'Quoted'
            : pl
              ? 'Robocza'
              : 'Draft'}
      </small>
      <p>{record.quote?.number ?? (pl ? 'BRAK OFERTY' : 'NO QUOTE')}</p>
      {draft && summary && (
        <>
          <strong>
            {draft.lines.find(
              (line) => line.included && line.group === 'covering',
            )?.description ?? '—'}
          </strong>
          <dl>
            {Object.entries(summarizeQuoteByGroup(draft)).map(
              ([group, value]) => (
                <div key={group}>
                  <dt>{groups[group as keyof typeof groups]}</dt>
                  <dd>
                    {money(value.netMinor)}
                    {value.missingPriceCount ? ' *' : ''}
                  </dd>
                </div>
              ),
            )}
            <div>
              <dt>Netto</dt>
              <dd>{money(summary.netMinor)}</dd>
            </div>
            <div>
              <dt>VAT</dt>
              <dd>{money(summary.taxMinor)}</dd>
            </div>
            <div>
              <dt>Brutto</dt>
              <dd>{money(summary.grossMinor)}</dd>
            </div>
          </dl>
          <p>
            {pl ? 'Brak cen' : 'Missing prices'}: {summary.missingPriceCount} ·{' '}
            {pl ? 'Brak VAT' : 'Missing VAT'}: {summary.missingVatCount}
          </p>
          {base && (
            <p>
              {pl ? 'Różnica netto względem' : 'Net difference from'}{' '}
              {base.estimation.name}:{' '}
              <strong>{money(difference?.netDifferenceMinor)}</strong>
            </p>
          )}
        </>
      )}
    </article>
  );
}
