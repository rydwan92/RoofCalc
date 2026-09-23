import { Fragment, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Printer, RefreshCw, X } from 'lucide-react';
import {
  calculateQuoteLine,
  quoteIsStale,
  summarizeQuote,
  withQuoteDiscount,
  withQuoteIncluded,
  withQuoteQuantity,
  withQuoteUnitPrice,
  withQuoteVat,
  type QuoteDraft,
  type QuoteLineGroup,
} from '@cieslacalc/quote-core';
import { parseDecimal } from '../format';
import type { RemoteSaveStatus } from './workspace/autosave';

const GROUPS: readonly QuoteLineGroup[] = [
  'covering',
  'layers',
  'roof-system',
  'drainage',
  'construction',
  'other',
];

function money(value: number | undefined, currency: string, locale: string) {
  return value === undefined
    ? '—'
    : new Intl.NumberFormat(locale, { style: 'currency', currency }).format(
        value / 100,
      );
}

export function QuoteWorkspace({
  draft,
  currentFingerprint,
  locale,
  onChange,
  onRefresh,
  onOpenMaterials,
  onClose,
  saveStatus,
  onRetrySave,
  onReload,
  comparison,
}: {
  draft: QuoteDraft;
  currentFingerprint: string;
  locale: string;
  onChange: (draft: QuoteDraft) => void;
  onRefresh: () => void;
  onOpenMaterials: () => void;
  onClose: () => void;
  saveStatus?: RemoteSaveStatus;
  onRetrySave?: () => Promise<void>;
  onReload?: () => Promise<void>;
  comparison?: QuoteDraft;
}) {
  const pl = locale.startsWith('pl');
  const [preview, setPreview] = useState(false);
  const [attentionOnly, setAttentionOnly] = useState(false);
  const shellRef = useRef<HTMLElement>(null);
  const tableWrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);
  useEffect(() => {
    if (preview && tableWrapRef.current) tableWrapRef.current.scrollLeft = 0;
    if (shellRef.current) shellRef.current.scrollTop = 0;
  }, [preview]);
  const printQuote = () => {
    setPreview(true);
    globalThis.window.requestAnimationFrame(() => globalThis.window.print());
  };
  const summary = summarizeQuote(draft);
  const stale = quoteIsStale(draft, currentFingerprint);
  const groupLabel: Record<QuoteLineGroup, string> = pl
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
  const unit = (value: string) =>
    (
      ({
        piece: pl ? 'szt.' : 'pcs',
        pack: pl ? 'opak.' : 'packs',
        pallet: pl ? 'pal.' : 'pallets',
        roll: pl ? 'rol.' : 'rolls',
        flat: pl ? 'kpl.' : 'set',
      }) as Record<string, string>
    )[value] ?? value;

  return (
    <div className="bz-quote-layer" data-testid="quote-workspace">
      <button
        className="bz-quote-backdrop"
        aria-label={pl ? 'Zamknij ofertę' : 'Close quote'}
        onClick={onClose}
      />
      <article className="bz-quote-shell" data-preview={preview} ref={shellRef}>
        <header className="bz-quote-toolbar bz-no-print">
          {saveStatus && (
            <span role="status" data-testid="quote-save-status">
              {saveStatus === 'saved'
                ? pl
                  ? 'Zapisano'
                  : 'Saved'
                : saveStatus === 'saving'
                  ? pl
                    ? 'Zapisywanie…'
                    : 'Saving…'
                  : saveStatus === 'conflict'
                    ? pl
                      ? 'Oferta została zmieniona gdzie indziej.'
                      : 'Quote changed elsewhere.'
                    : pl
                      ? 'Błąd zapisu'
                      : 'Save failed'}
              {saveStatus === 'error' && (
                <button
                  className="a-button"
                  onClick={() => void onRetrySave?.().catch(() => undefined)}
                >
                  {pl ? 'Spróbuj ponownie' : 'Retry'}
                </button>
              )}
              {saveStatus === 'conflict' && (
                <button
                  className="a-button"
                  onClick={() => void onReload?.().catch(() => undefined)}
                >
                  {pl ? 'Wczytaj wersję serwera' : 'Load server version'}
                </button>
              )}
            </span>
          )}
          <button className="a-button" type="button" onClick={onClose}>
            <ArrowLeft size={16} aria-hidden="true" />{' '}
            {pl ? 'Wróć do wyceny' : 'Back to estimate'}
          </button>
          <div>
            <strong className="bz-quote-live-total">
              {pl ? 'Brutto' : 'Gross'}:{' '}
              {money(summary.grossMinor, draft.currencyCode, locale)}
            </strong>
            <button
              className="a-button"
              type="button"
              aria-pressed={preview}
              onClick={() => setPreview((value) => !value)}
            >
              {preview
                ? pl
                  ? 'Edytuj ofertę'
                  : 'Edit quote'
                : pl
                  ? 'Podgląd dla klienta'
                  : 'Customer preview'}
            </button>
            <button
              className="a-button a-primary"
              type="button"
              onClick={printQuote}
            >
              <Printer size={16} aria-hidden="true" />{' '}
              {pl ? 'Drukuj / Zapisz PDF' : 'Print / Save PDF'}
            </button>
            <button
              className="a-icon"
              type="button"
              aria-label={pl ? 'Zamknij' : 'Close'}
              onClick={onClose}
            >
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="bz-quote-document">
          <header className="bz-quote-head">
            <div>
              <span>{pl ? 'Oferta robocza' : 'Draft quote'}</span>
              <h1>{draft.organizationSnapshot.name}</h1>
              {draft.organizationSnapshot.taxId && (
                <small>NIP: {draft.organizationSnapshot.taxId}</small>
              )}
              {draft.organizationSnapshot.address && (
                <small>{draft.organizationSnapshot.address}</small>
              )}
            </div>
            <dl>
              <div>
                <dt>{pl ? 'Numer' : 'Number'}</dt>
                <dd>
                  {draft.number ??
                    (pl ? 'Numer po zapisaniu' : 'Number after saving')}
                </dd>
              </div>
              <div>
                <dt>{pl ? 'Data' : 'Date'}</dt>
                <dd>
                  {draft.issuedOn ??
                    new Date(draft.createdAt).toLocaleDateString(locale)}
                </dd>
              </div>
              {draft.validUntil && (
                <div>
                  <dt>{pl ? 'Ważna do' : 'Valid until'}</dt>
                  <dd>{draft.validUntil}</dd>
                </div>
              )}
              {draft.preparedBy && (
                <div>
                  <dt>{pl ? 'Przygotował/a' : 'Prepared by'}</dt>
                  <dd>{draft.preparedBy}</dd>
                </div>
              )}
              <div>
                <dt>{pl ? 'Projekt' : 'Project'}</dt>
                <dd>{draft.projectReference.name}</dd>
              </div>
            </dl>
          </header>

          <section className="bz-quote-parties">
            <div>
              <span>{pl ? 'Klient' : 'Customer'}</span>
              <strong>
                {draft.customerSnapshot.companyName ||
                  draft.customerSnapshot.name}
              </strong>
              {draft.customerSnapshot.companyName && (
                <small>{draft.customerSnapshot.name}</small>
              )}
              {draft.customerSnapshot.taxId && (
                <small>NIP: {draft.customerSnapshot.taxId}</small>
              )}
              {draft.customerSnapshot.address && (
                <small>{draft.customerSnapshot.address}</small>
              )}
              {draft.customerSnapshot.email && (
                <small>{draft.customerSnapshot.email}</small>
              )}
            </div>
            <div>
              <span>{pl ? 'Inwestycja' : 'Project'}</span>
              <strong>{draft.projectReference.name}</strong>
              {draft.projectReference.location && (
                <small>{draft.projectReference.location}</small>
              )}
            </div>
          </section>

          {!preview && (
            <section
              className="bz-quote-precheck bz-no-print"
              data-testid="quote-precheck"
            >
              <div>
                <strong>
                  {pl ? 'Oferta — sprawdzenie' : 'Quote precheck'}
                </strong>
                <span>
                  ✓ {summary.readyLineCount}{' '}
                  {pl ? 'pozycji gotowych' : 'ready items'}
                </span>
              </div>
              {summary.missingPriceCount > 0 && (
                <span>
                  ⚠ {summary.missingPriceCount}{' '}
                  {pl ? 'bez ceny' : 'without price'}
                </span>
              )}
              {summary.missingVatCount > 0 && (
                <span>
                  ⚠ {summary.missingVatCount} {pl ? 'bez VAT' : 'without VAT'}
                </span>
              )}
              {(summary.missingPriceCount > 0 ||
                summary.missingVatCount > 0) && (
                <button
                  className="a-button"
                  type="button"
                  onClick={() => setAttentionOnly(true)}
                >
                  {pl ? 'Uzupełnij braki' : 'Complete missing data'}
                </button>
              )}
            </section>
          )}
          {!preview && (
            <section
              className="bz-form-grid bz-no-print"
              aria-label={pl ? 'Dane oferty' : 'Quote details'}
            >
              <label>
                {pl ? 'Data oferty' : 'Issue date'}
                <input
                  type="date"
                  value={draft.issuedOn ?? draft.createdAt.slice(0, 10)}
                  onChange={(event) => {
                    if (event.target.value)
                      onChange({ ...draft, issuedOn: event.target.value });
                  }}
                />
              </label>
              <label>
                {pl ? 'Ważna do' : 'Valid until'}
                <input
                  type="date"
                  value={draft.validUntil ?? ''}
                  onChange={(event) =>
                    onChange({
                      ...draft,
                      validUntil: event.target.value || undefined,
                    })
                  }
                />
              </label>
              <label>
                {pl ? 'Przygotował/a' : 'Prepared by'}
                <input
                  value={draft.preparedBy ?? ''}
                  maxLength={240}
                  onChange={(event) =>
                    onChange({ ...draft, preparedBy: event.target.value })
                  }
                />
              </label>
              <label>
                {pl ? 'Notatki / warunki' : 'Notes / terms'}
                <textarea
                  value={draft.notes ?? ''}
                  maxLength={16000}
                  onChange={(event) =>
                    onChange({ ...draft, notes: event.target.value })
                  }
                />
              </label>
            </section>
          )}
          {stale && !preview && (
            <section
              className="bz-quote-stale bz-no-print"
              role="status"
              data-testid="quote-stale"
            >
              <div>
                <strong>
                  {pl ? 'Projekt zmienił się' : 'Project changed'}
                </strong>
                <p>
                  {pl
                    ? 'Wartości w ofercie pozostały bez zmian. Odśwież je jawnie po sprawdzeniu materiałów.'
                    : 'Quote values remain unchanged. Refresh explicitly after reviewing materials.'}
                </p>
              </div>
              {comparison && (
                <details>
                  <summary>
                    {pl ? 'Porównaj zmiany' : 'Compare changes'}
                  </summary>
                  <ul>
                    {comparison.lines
                      .filter(
                        (line) =>
                          draft.lines.find((old) => old.id === line.id)
                            ?.technicalQuantity.value !==
                          line.technicalQuantity.value,
                      )
                      .map((line) => (
                        <li key={line.id}>
                          {line.description}:{' '}
                          {draft.lines.find((old) => old.id === line.id)
                            ?.technicalQuantity.value ?? '—'}{' '}
                          → {line.technicalQuantity.value}{' '}
                          {unit(line.technicalQuantity.unit)}
                        </li>
                      ))}
                    {draft.lines
                      .filter(
                        (line) =>
                          !comparison.lines.some((next) => next.id === line.id),
                      )
                      .map((line) => (
                        <li key={line.id}>
                          {line.description}: {line.technicalQuantity.value} →{' '}
                          {pl ? 'usunięto' : 'removed'}
                        </li>
                      ))}
                  </ul>
                </details>
              )}
              <button
                className="a-button a-primary"
                type="button"
                onClick={onRefresh}
              >
                <RefreshCw size={15} aria-hidden="true" />{' '}
                {pl ? 'Odśwież ofertę' : 'Refresh quote'}
              </button>
            </section>
          )}

          <div className="bz-quote-table-wrap" ref={tableWrapRef}>
            {!preview && (
              <div className="bz-quote-filters bz-no-print">
                <button
                  className="a-button"
                  aria-pressed={!attentionOnly}
                  onClick={() => setAttentionOnly(false)}
                >
                  {pl ? 'Wszystkie pozycje' : 'All items'}
                </button>
                <button
                  className="a-button"
                  aria-pressed={attentionOnly}
                  onClick={() => setAttentionOnly(true)}
                >
                  {pl ? 'Wymaga uwagi' : 'Needs attention'} (
                  {
                    draft.lines.filter(
                      (line) =>
                        line.included &&
                        (line.unitNetAmountMinor === undefined ||
                          line.vatRateBps === undefined),
                    ).length
                  }
                  )
                </button>
                <button className="a-button" onClick={onOpenMaterials}>
                  {pl ? 'Materiały wyceny' : 'Estimate materials'}
                </button>
              </div>
            )}
            <table className="bz-quote-table">
              <thead>
                <tr>
                  <th>{pl ? 'Produkt' : 'Product'}</th>
                  <th>{pl ? 'Kod' : 'Code'}</th>
                  <th>{pl ? 'Ilość' : 'Quantity'}</th>
                  <th>{pl ? 'Cena netto' : 'Net price'}</th>
                  <th>{pl ? 'Rabat' : 'Discount'}</th>
                  <th>VAT</th>
                  <th>{pl ? 'Netto' : 'Net'}</th>
                </tr>
              </thead>
              <tbody>
                {GROUPS.map((group) => {
                  const lines = draft.lines.filter(
                    (line) =>
                      line.group === group &&
                      (preview
                        ? line.included
                        : !attentionOnly ||
                          (line.included &&
                            (line.unitNetAmountMinor === undefined ||
                              line.vatRateBps === undefined))),
                  );
                  if (!lines.length) return null;
                  return (
                    <Fragment key={group}>
                      <tr className="bz-quote-group">
                        <th colSpan={7}>{groupLabel[group]}</th>
                      </tr>
                      {lines.map((line) => {
                        const calculated = calculateQuoteLine(line);
                        return (
                          <tr key={line.id} data-testid="quote-line">
                            <td>
                              <label className="bz-quote-include bz-no-print bz-no-preview">
                                <input
                                  type="checkbox"
                                  checked={line.included}
                                  onChange={(event) =>
                                    onChange(
                                      withQuoteIncluded(
                                        draft,
                                        line.id,
                                        event.target.checked,
                                      ),
                                    )
                                  }
                                />
                                <span className="bz-visually-hidden">
                                  {pl ? 'Uwzględnij' : 'Include'}
                                </span>
                              </label>
                              <strong>{line.description}</strong>
                              <small className="bz-no-preview">
                                {line.priceSource === 'organization-price-list'
                                  ? pl
                                    ? 'Cennik hurtowni'
                                    : 'Company price list'
                                  : line.priceSource === 'manual-estimation'
                                    ? pl
                                      ? 'Ręcznie — ta wycena'
                                      : 'Manual — this estimate'
                                    : pl
                                      ? 'Brak ceny'
                                      : 'Missing price'}
                              </small>
                              {line.priceSource === 'manual-estimation' &&
                                line.organizationUnitNetAmountMinor !==
                                  undefined && (
                                  <small className="bz-no-preview">
                                    {!preview && (
                                      <button
                                        className="a-button"
                                        type="button"
                                        onClick={() =>
                                          onChange({
                                            ...withQuoteUnitPrice(
                                              draft,
                                              line.id,
                                              line.organizationUnitNetAmountMinor!,
                                            ),
                                            lines: draft.lines.map((entry) =>
                                              entry.id === line.id
                                                ? {
                                                    ...entry,
                                                    unitNetAmountMinor:
                                                      entry.organizationUnitNetAmountMinor,
                                                    priceSource:
                                                      'organization-price-list' as const,
                                                  }
                                                : entry,
                                            ),
                                          })
                                        }
                                      >
                                        {pl
                                          ? 'Przywróć cenę firmową'
                                          : 'Restore company price'}
                                      </button>
                                    )}
                                    {pl ? 'Cena cennikowa' : 'List price'}:{' '}
                                    {money(
                                      line.organizationUnitNetAmountMinor,
                                      draft.currencyCode,
                                      locale,
                                    )}
                                  </small>
                                )}
                            </td>
                            <td data-label={pl ? 'Kod' : 'Code'}>
                              {line.organizationSku ?? '—'}
                            </td>
                            <td data-label={pl ? 'Ilość' : 'Quantity'}>
                              <span className="bz-quote-technical bz-no-preview">
                                {pl ? 'Techniczna' : 'Technical'}:{' '}
                                {line.technicalQuantity.value.toLocaleString(
                                  locale,
                                )}{' '}
                                {unit(line.technicalQuantity.unit)}
                              </span>
                              {preview ? (
                                <strong>
                                  {line.offerQuantity.value.toLocaleString(
                                    locale,
                                  )}{' '}
                                  {unit(line.offerQuantity.unit)}
                                </strong>
                              ) : (
                                <label>
                                  {pl ? 'Ofertowa' : 'Quoted'}
                                  <input
                                    key={`${line.id}:qty:${line.offerQuantity.value}`}
                                    inputMode="decimal"
                                    defaultValue={line.offerQuantity.value.toLocaleString(
                                      locale,
                                    )}
                                    onBlur={(event) => {
                                      const value = parseDecimal(
                                        event.target.value,
                                      );
                                      if (value !== null && value >= 0)
                                        onChange(
                                          withQuoteQuantity(
                                            draft,
                                            line.id,
                                            value,
                                          ),
                                        );
                                    }}
                                  />
                                </label>
                              )}
                              {line.quantityOverridden && (
                                <small className="bz-quote-warning bz-no-preview">
                                  {pl
                                    ? 'Różni się od zapotrzebowania RoofCalc.'
                                    : 'Differs from the RoofCalc requirement.'}
                                  {' Δ '}
                                  {(
                                    line.offerQuantity.value -
                                    line.technicalQuantity.value
                                  ).toLocaleString(locale)}{' '}
                                  {unit(line.offerQuantity.unit)}
                                </small>
                              )}
                            </td>
                            <td data-label={pl ? 'Cena netto' : 'Net price'}>
                              {preview ? (
                                money(
                                  line.unitNetAmountMinor,
                                  draft.currencyCode,
                                  locale,
                                )
                              ) : (
                                <input
                                  aria-label={`${pl ? 'Cena netto' : 'Net price'} ${line.description}`}
                                  key={`${line.id}:price:${line.unitNetAmountMinor}`}
                                  inputMode="decimal"
                                  defaultValue={
                                    line.unitNetAmountMinor === undefined
                                      ? ''
                                      : (
                                          line.unitNetAmountMinor / 100
                                        ).toLocaleString(locale)
                                  }
                                  onBlur={(event) => {
                                    const value = parseDecimal(
                                      event.target.value,
                                    );
                                    onChange(
                                      withQuoteUnitPrice(
                                        draft,
                                        line.id,
                                        value === null
                                          ? undefined
                                          : Math.round(value * 100),
                                      ),
                                    );
                                  }}
                                />
                              )}
                            </td>
                            <td data-label={pl ? 'Rabat' : 'Discount'}>
                              {preview ? (
                                `${(line.discountBps ?? 0) / 100}%`
                              ) : (
                                <input
                                  aria-label={`${pl ? 'Rabat' : 'Discount'} ${line.description}`}
                                  key={`${line.id}:discount:${line.discountBps}`}
                                  inputMode="decimal"
                                  defaultValue={(line.discountBps ?? 0) / 100}
                                  onBlur={(event) => {
                                    const value = parseDecimal(
                                      event.target.value,
                                    );
                                    if (
                                      value !== null &&
                                      value >= 0 &&
                                      value <= 100
                                    )
                                      onChange(
                                        withQuoteDiscount(
                                          draft,
                                          line.id,
                                          Math.round(value * 100),
                                        ),
                                      );
                                  }}
                                />
                              )}
                            </td>
                            <td data-label="VAT">
                              {preview ? (
                                line.vatRateBps === undefined ? (
                                  '—'
                                ) : (
                                  `${line.vatRateBps / 100}%`
                                )
                              ) : (
                                <select
                                  aria-label={`VAT ${line.description}`}
                                  value={line.vatRateBps ?? ''}
                                  onChange={(event) =>
                                    onChange(
                                      withQuoteVat(
                                        draft,
                                        line.id,
                                        event.target.value === ''
                                          ? undefined
                                          : Number(event.target.value),
                                      ),
                                    )
                                  }
                                >
                                  <option value="">—</option>
                                  <option value="0">0%</option>
                                  <option value="500">5%</option>
                                  <option value="800">8%</option>
                                  <option value="2300">23%</option>
                                </select>
                              )}
                            </td>
                            <td data-label={pl ? 'Netto' : 'Net'}>
                              <strong>
                                {money(
                                  calculated.netMinor,
                                  draft.currencyCode,
                                  locale,
                                )}
                              </strong>
                            </td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <footer className="bz-quote-footer">
            <div>
              {draft.notes && <p>{draft.notes}</p>}
              <small>
                {pl
                  ? 'Oferta robocza — wymaga weryfikacji przed wysłaniem.'
                  : 'Draft quote — verify before sending.'}
              </small>
            </div>
            <dl>
              <div>
                <dt>
                  {pl ? 'Wartość netto przed rabatem' : 'Net before discount'}
                </dt>
                <dd>
                  {money(
                    summary.netBeforeDiscountMinor,
                    draft.currencyCode,
                    locale,
                  )}
                </dd>
              </div>
              <div>
                <dt>{pl ? 'Rabat' : 'Discount'}</dt>
                <dd>
                  − {money(summary.discountMinor, draft.currencyCode, locale)}
                </dd>
              </div>
              <div>
                <dt>Netto</dt>
                <dd>{money(summary.netMinor, draft.currencyCode, locale)}</dd>
              </div>
              {summary.vatTotals.map((vat) => (
                <div key={vat.vatRateBps}>
                  <dt>VAT {vat.vatRateBps / 100}%</dt>
                  <dd>{money(vat.taxMinor, draft.currencyCode, locale)}</dd>
                </div>
              ))}
              <div>
                <dt>VAT</dt>
                <dd>{money(summary.taxMinor, draft.currencyCode, locale)}</dd>
              </div>
              <div className="bz-quote-grand">
                <dt>Brutto</dt>
                <dd>{money(summary.grossMinor, draft.currencyCode, locale)}</dd>
              </div>
            </dl>
          </footer>
        </div>
      </article>
    </div>
  );
}
