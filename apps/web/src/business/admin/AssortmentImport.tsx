import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ASSORTMENT_IMPORT_FIELDS,
  parseAssortmentCsv,
  type AssortmentImportField,
  type AssortmentPreviewResponse,
} from '@cieslacalc/business-core';
import { useBusiness } from '../context';
import { businessCopy, type BusinessCopy } from '../copy';

/**
 * ADMIN → IMPORTUJ (§23–§26).
 *
 * Four compact stages in one screen — file, mapping, preview, apply — not a
 * wizard. The mapping stage exists because no wholesaler's export uses
 * RoofCalc's column names (§25), and the preview stage exists because nobody
 * should write 1 248 rows into their assortment without first seeing how many
 * matched, how many need review and how many prices could not be read (§26).
 *
 * The preview is a real server dry run: the same code path that would write,
 * run with `apply: false`. It cannot disagree with the apply that follows it.
 */
export function AssortmentImport({
  onDone,
  onCancel,
}: {
  onDone: () => void;
  onCancel: () => void;
}) {
  const { i18n } = useTranslation();
  const m = businessCopy(i18n.language);
  const { organizationId, client } = useBusiness();
  const [fileName, setFileName] = useState<string>();
  const [csv, setCsv] = useState<string>();
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Partial<Record<string, string>>>({});
  const [preview, setPreview] = useState<AssortmentPreviewResponse>();
  const [showProblems, setShowProblems] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [applied, setApplied] = useState(false);

  async function readFile(file: File) {
    const text = await readFileText(file);
    const parsed = parseAssortmentCsv(text);
    setCsv(text);
    setFileName(file.name);
    setHeaders(parsed.headers);
    setPreview(undefined);
    setApplied(false);
    setMapping(guessMapping(parsed.headers));
  }

  const ready = Boolean(mapping.externalKey && mapping.sourceName && csv);

  async function run(apply: boolean) {
    if (!ready || !organizationId || !csv) return;
    setBusy(true);
    setError(undefined);
    try {
      const result = await client.importCsv(organizationId, {
        sourceLabel: fileName ?? 'import.csv',
        csv,
        mapping: Object.fromEntries(
          Object.entries(mapping).filter(([, value]) => Boolean(value)),
        ) as Record<string, string>,
        apply,
      });
      setPreview(result);
      if (apply) {
        setApplied(true);
        onDone();
      }
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : '';
      setError(
        code === 'not-found'
          ? m.adminDisabled
          : (m.errorCode[code] ?? m.importFailed),
      );
    } finally {
      setBusy(false);
    }
  }

  const problems = (preview?.rows ?? []).filter(
    (row) => row.issues.length > 0 || row.matchState !== 'matched',
  );

  return (
    <section className="bz-import" data-testid="assortment-import">
      <header>
        <h3>{m.importTitle}</h3>
        <button type="button" className="a-button" onClick={onCancel}>
          {m.back}
        </button>
      </header>

      <div className="bz-import-step">
        <strong>{m.importStepFile}</strong>
        <label className="a-button" htmlFor="bz-csv-file">
          {m.importChooseFile}
        </label>
        <input
          id="bz-csv-file"
          type="file"
          accept=".csv,text/csv"
          data-testid="import-file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void readFile(file);
          }}
        />
        {fileName && <span data-testid="import-filename">{fileName}</span>}
      </div>

      {headers.length > 0 && (
        <div className="bz-import-step">
          <strong>{m.importStepMapping}</strong>
          <div className="bz-mapping">
            {ASSORTMENT_IMPORT_FIELDS.map((field) => (
              <label key={field}>
                <span>
                  {fieldLabel(m, field)}
                  {(field === 'externalKey' || field === 'sourceName') && ' *'}
                </span>
                <select
                  value={mapping[field] ?? ''}
                  data-testid={`map-${field}`}
                  onChange={(event) =>
                    setMapping((current) => ({
                      ...current,
                      [field]: event.target.value || undefined,
                    }))
                  }
                >
                  <option value="">{m.mappingIgnore}</option>
                  {headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          {!ready && <p className="bz-hint">{m.mappingRequired}</p>}
        </div>
      )}

      {error && <p role="alert">{error}</p>}

      <div className="bz-import-step">
        <strong>{m.importStepPreview}</strong>
        <button
          type="button"
          className="a-button"
          disabled={!ready || busy}
          data-testid="import-dry-run"
          onClick={() => void run(false)}
        >
          {m.importDryRun}
        </button>
      </div>

      {preview && (
        <div className="bz-preview" data-testid="import-preview">
          <p className="bz-preview-total">
            {m.importRows(preview.counts.total)}
          </p>
          <ul className="bz-preview-counts">
            <li data-testid="preview-matched">
              ✓ {preview.counts.matched} {m.importMatched}
            </li>
            <li data-testid="preview-review" data-tone="warning">
              ⚠ {preview.counts.needsReview} {m.importNeedsReview}
            </li>
            <li data-testid="preview-no-match">
              — {preview.counts.noMatch} {m.importNoMatch}
            </li>
            <li data-testid="preview-invalid-price" data-tone="warning">
              {preview.counts.invalidPrice} {m.importInvalidPrice}
            </li>
          </ul>
          <p className="bz-preview-actions-summary">
            {preview.counts.create} {m.importCreate} · {preview.counts.update}{' '}
            {m.importUpdate} · {preview.counts.unchanged} {m.importUnchanged} ·{' '}
            {preview.counts.skip} {m.importSkip}
          </p>
          {problems.length > 0 && (
            <button
              type="button"
              className="a-button"
              data-testid="import-show-problems"
              onClick={() => setShowProblems((value) => !value)}
            >
              {showProblems ? m.importHideProblems : m.importShowProblems}
            </button>
          )}
          {showProblems && (
            <table
              className="bz-preview-problems"
              data-testid="import-problems"
            >
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">{m.columnCode}</th>
                  <th scope="col">{m.columnName}</th>
                  <th scope="col">{m.columnStatus}</th>
                </tr>
              </thead>
              <tbody>
                {problems.map((row) => (
                  <tr key={`${row.sourceLine}:${row.externalKey}`}>
                    <td>{row.sourceLine}</td>
                    <td>
                      <code>{row.externalKey}</code>
                    </td>
                    <td>{row.sourceName}</td>
                    <td>
                      {m.matchState[row.matchState] ?? row.matchState}
                      {row.issues.map((issue) => (
                        <small key={issue.code} data-severity={issue.severity}>
                          {' '}
                          · {m.issue[issue.code] ?? issue.code}
                        </small>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="bz-import-step">
            <strong>{m.importStepApply}</strong>
            <button
              type="button"
              className="a-button a-primary"
              disabled={busy || applied}
              data-testid="import-apply"
              onClick={() => void run(true)}
            >
              {m.importRun}
            </button>
            {applied && <span role="status">{m.importApplied}</span>}
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * `Blob.text()` is not universally available (older Safari, and jsdom in the
 * test environment), so fall back to `FileReader`. A CSV the operator picked
 * must never fail to open because of a platform gap.
 */
function readFileText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('read-failed'));
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsText(file);
  });
}

function fieldLabel(m: BusinessCopy, field: AssortmentImportField): string {
  return {
    externalKey: m.fieldExternalKey,
    sourceName: m.fieldSourceName,
    ean: m.fieldEan,
    manufacturerName: m.fieldManufacturer,
    netAmount: m.fieldNetAmount,
    grossAmount: m.fieldGrossAmount,
    vatRate: m.fieldVatRate,
    saleUnit: m.fieldSaleUnit,
    active: m.fieldActive,
  }[field];
}

/**
 * A first guess at the mapping from common Polish and English header names.
 * Only a convenience — the operator always sees and can change every choice,
 * because a wrong `Cena netto` column would put wrong money into a price list.
 */
const HEADER_HINTS: Array<[AssortmentImportField, RegExp]> = [
  ['externalKey', /^(kod|kod_tow|sku|indeks|symbol|code|item_?code)$/i],
  ['sourceName', /^(nazwa|nazwa_tow|name|opis|description)$/i],
  ['ean', /^(ean|ean13|barcode|kod_kreskowy)$/i],
  ['manufacturerName', /^(producent|marka|manufacturer|brand)$/i],
  ['netAmount', /^(cena_?netto|netto|net|net_?price|cena)$/i],
  ['grossAmount', /^(cena_?brutto|brutto|gross|gross_?price)$/i],
  ['vatRate', /^(vat|stawka_?vat|vat_?rate|podatek)$/i],
  ['saleUnit', /^(jm|j_?m|jednostka|unit|uom)$/i],
  ['active', /^(aktywny|active|status)$/i],
];

export function guessMapping(
  headers: readonly string[],
): Partial<Record<AssortmentImportField, string>> {
  const mapping: Partial<Record<AssortmentImportField, string>> = {};
  for (const [field, pattern] of HEADER_HINTS) {
    if (mapping[field]) continue;
    const match = headers.find((header) => pattern.test(header.trim()));
    if (match) mapping[field] = match;
  }
  return mapping;
}
