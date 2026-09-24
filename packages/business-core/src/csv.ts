import {
  canonicalJson,
  SALE_UNITS,
  type AssortmentColumnMapping,
} from './persistence';
import { createMatchIndex, matchAssortmentRow } from './matching';
import type {
  AssortmentImportIssue,
  AssortmentImportPreview,
  AssortmentImportPreviewRow,
  AssortmentImportRow,
  AssortmentMatchCandidate,
  OrganizationAssortmentItem,
} from './model';

/**
 * CSV is the first real import path (§23). Deliberately the *only* one: an
 * XLSX/XML/API adapter must terminate at `AssortmentImportRow[]`, exactly as a
 * catalogue provider adapter terminates at `CatalogImportBatchV1`, so no
 * wholesaler-specific parsing logic ever leaks further in.
 */

export interface ParsedCsv {
  headers: string[];
  /** One record per data line, keyed by header. Blank lines are dropped. */
  rows: Array<{ sourceLine: number; values: Record<string, string> }>;
}

/**
 * RFC-4180-style parser with delimiter sniffing: Polish exports are as often
 * semicolon-separated as comma-separated, and quoting a field containing the
 * delimiter is normal. Written by hand rather than pulled in as a dependency —
 * this package stays zero-runtime-dependency apart from Zod.
 */
export function parseAssortmentCsv(
  text: string,
  delimiter = sniffDelimiter(text),
): ParsedCsv {
  const records = splitRecords(stripBom(text), delimiter);
  const headerRecord = records.find((record) =>
    record.fields.some((field) => field.trim() !== ''),
  );
  if (!headerRecord) return { headers: [], rows: [] };
  const headers = headerRecord.fields.map((field) => field.trim());
  const rows = records
    .filter(
      (record) =>
        record !== headerRecord &&
        record.fields.some((field) => field.trim() !== ''),
    )
    .map((record) => ({
      sourceLine: record.line,
      values: Object.fromEntries(
        headers.map((header, column) => [
          header,
          (record.fields[column] ?? '').trim(),
        ]),
      ),
    }));
  return { headers, rows };
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function sniffDelimiter(text: string): string {
  const firstLine = stripBom(text).split(/\r?\n/, 1)[0] ?? '';
  const counts = [';', ',', '\t', '|'].map(
    (candidate) => [candidate, firstLine.split(candidate).length - 1] as const,
  );
  const best = counts.sort((a, b) => b[1] - a[1])[0];
  return best && best[1] > 0 ? best[0] : ',';
}

function splitRecords(text: string, delimiter: string) {
  const records: Array<{ line: number; fields: string[] }> = [];
  let fields: string[] = [];
  let field = '';
  let quoted = false;
  let line = 1;
  let recordLine = 1;
  const pushRecord = () => {
    fields.push(field);
    records.push({ line: recordLine, fields });
    fields = [];
    field = '';
    recordLine = line;
  };
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else quoted = false;
      } else {
        if (character === '\n') line += 1;
        field += character;
      }
      continue;
    }
    if (character === '"') {
      quoted = true;
      continue;
    }
    if (character === delimiter) {
      fields.push(field);
      field = '';
      continue;
    }
    if (character === '\r') continue;
    if (character === '\n') {
      line += 1;
      pushRecord();
      continue;
    }
    field += character;
  }
  if (field !== '' || fields.length) pushRecord();
  return records;
}

/**
 * Accepts both `1234,56` and `1234.56`, and tolerates a thousands separator
 * and a trailing currency word, because real exports contain all of them.
 * Anything else is rejected rather than coerced — a misread price is worse
 * than a reported problem.
 */
export function parseMoneyMinor(raw: string): number | undefined {
  const cleaned = raw
    .replace(/[\s\u00a0]/g, '')
    .replace(/(?:zł|pln|eur|€)$/i, '')
    .trim();
  if (!cleaned) return undefined;
  const normalized = /,\d{1,2}$/.test(cleaned)
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned.replace(/,/g, '');
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return undefined;
  return Math.round(Number(normalized) * 100);
}

function parseBoolean(raw: string): boolean | undefined {
  const value = raw.trim().toLowerCase();
  if (['1', 'true', 'tak', 'yes', 'y', 't', 'aktywny'].includes(value))
    return true;
  if (['0', 'false', 'nie', 'no', 'n', 'f', 'nieaktywny'].includes(value))
    return false;
  return undefined;
}

function parseRateBps(raw: string): number | undefined {
  const cleaned = raw.replace(/\s|%/g, '').replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/.test(cleaned)) return undefined;
  const value = Math.round(Number(cleaned) * 100);
  return value <= 10_000 ? value : undefined;
}

export interface MappedAssortmentRows {
  rows: AssortmentImportRow[];
  issues: AssortmentImportIssue[];
}

/**
 * Applies the admin's column mapping. Mapping failures become named issues on
 * the row rather than exceptions, so the preview can show *every* problem in
 * one pass instead of stopping at the first bad line.
 *
 * VAT (§31): a gross-only column with no VAT rate never becomes a net price.
 * The row is kept, the price is dropped and the admin is told exactly that.
 */
export function mapAssortmentRows(
  parsed: ParsedCsv,
  mapping: AssortmentColumnMapping,
): MappedAssortmentRows {
  const rows: AssortmentImportRow[] = [];
  const issues: AssortmentImportIssue[] = [];
  const seen = new Set<string>();
  for (const record of parsed.rows) {
    const read = (column: string | undefined) =>
      column === undefined ? '' : (record.values[column] ?? '');
    const externalKey = read(mapping.externalKey).trim();
    const sourceName = read(mapping.sourceName).trim();
    if (!externalKey) {
      issues.push({
        sourceLine: record.sourceLine,
        code: 'missing-external-key',
        severity: 'blocker',
      });
      continue;
    }
    if (!sourceName) {
      issues.push({
        sourceLine: record.sourceLine,
        externalKey,
        code: 'missing-name',
        severity: 'blocker',
      });
      continue;
    }
    if (seen.has(externalKey))
      issues.push({
        sourceLine: record.sourceLine,
        externalKey,
        code: 'duplicate-external-key',
        severity: 'blocker',
      });
    seen.add(externalKey);

    const row: AssortmentImportRow = {
      sourceLine: record.sourceLine,
      externalKey,
      sourceName,
    };
    const ean = read(mapping.ean).trim();
    if (ean) row.ean = ean;
    const manufacturerName = read(mapping.manufacturerName).trim();
    if (manufacturerName) row.manufacturerName = manufacturerName;

    const vatRaw = read(mapping.vatRate).trim();
    const vatRateBps = vatRaw ? parseRateBps(vatRaw) : undefined;
    if (vatRateBps !== undefined) row.vatRateBps = vatRateBps;
    else if (vatRaw)
      issues.push({
        sourceLine: record.sourceLine,
        externalKey,
        code: 'invalid-vat-rate',
        severity: 'warning',
      });

    const netRaw = read(mapping.netAmount).trim();
    const grossRaw = read(mapping.grossAmount).trim();
    if (netRaw) {
      const net = parseMoneyMinor(netRaw);
      if (net === undefined)
        issues.push({
          sourceLine: record.sourceLine,
          externalKey,
          code: 'invalid-price',
          severity: 'warning',
        });
      else row.netAmountMinor = net;
    } else if (grossRaw) {
      const gross = parseMoneyMinor(grossRaw);
      if (gross === undefined)
        issues.push({
          sourceLine: record.sourceLine,
          externalKey,
          code: 'invalid-price',
          severity: 'warning',
        });
      else if (vatRateBps === undefined)
        // §31: never invent a net price from a gross one without a stated rate.
        issues.push({
          sourceLine: record.sourceLine,
          externalKey,
          code: 'gross-price-without-vat-rate',
          severity: 'warning',
        });
      else row.netAmountMinor = Math.round(gross / (1 + vatRateBps / 10000));
    }

    const saleUnitRaw = read(mapping.saleUnit).trim();
    if (saleUnitRaw) {
      const saleUnit = normalizeSaleUnit(saleUnitRaw);
      if (saleUnit) row.saleUnit = saleUnit;
      else
        issues.push({
          sourceLine: record.sourceLine,
          externalKey,
          code: 'invalid-sale-unit',
          severity: 'warning',
        });
    }
    const activeRaw = read(mapping.active).trim();
    if (activeRaw) {
      const active = parseBoolean(activeRaw);
      if (active !== undefined) row.active = active;
    }
    rows.push(row);
  }
  return { rows, issues };
}

const SALE_UNIT_ALIASES: Record<string, AssortmentImportRow['saleUnit']> = {
  szt: 'piece',
  'szt.': 'piece',
  sztuka: 'piece',
  pcs: 'piece',
  piece: 'piece',
  opak: 'pack',
  'opak.': 'pack',
  paczka: 'pack',
  pack: 'pack',
  pal: 'pallet',
  'pal.': 'pallet',
  paleta: 'pallet',
  pallet: 'pallet',
  rol: 'roll',
  'rol.': 'roll',
  rolka: 'roll',
  roll: 'roll',
  mb: 'm',
  m: 'm',
  m2: 'm2',
  'm²': 'm2',
  m3: 'm3',
  'm³': 'm3',
  kg: 'kg',
};

export function normalizeSaleUnit(
  raw: string,
): AssortmentImportRow['saleUnit'] {
  const value = raw.trim().toLowerCase();
  const alias = SALE_UNIT_ALIASES[value];
  if (alias) return alias;
  return (SALE_UNITS as readonly string[]).includes(value)
    ? (value as AssortmentImportRow['saleUnit'])
    : undefined;
}

export interface AssortmentPreviewInput {
  organizationId: string;
  rows: readonly AssortmentImportRow[];
  /** Mapping issues produced while reading the file. */
  issues?: readonly AssortmentImportIssue[];
  /** The organization's existing rows, keyed by `externalKey`. */
  existing: readonly OrganizationAssortmentItem[];
  candidates: readonly AssortmentMatchCandidate[];
}

/**
 * The dry run (§26). Nothing is written; every row gets an explicit action and
 * a named match state, and the counts are derived from the rows themselves so
 * the summary can never disagree with the list beneath it.
 */
export function buildAssortmentImportPreview(
  input: AssortmentPreviewInput,
): AssortmentImportPreview {
  const existing = new Map(
    input.existing
      .filter((item) => item.organizationId === input.organizationId)
      .map((item) => [item.externalKey, item]),
  );
  const index = createMatchIndex(input.candidates);
  const issuesByLine = new Map<number, AssortmentImportIssue[]>();
  for (const issue of input.issues ?? []) {
    const bucket = issuesByLine.get(issue.sourceLine);
    if (bucket) bucket.push(issue);
    else issuesByLine.set(issue.sourceLine, [issue]);
  }

  const rows: AssortmentImportPreviewRow[] = input.rows.map((row) => {
    const issues = issuesByLine.get(row.sourceLine) ?? [];
    const match = matchAssortmentRow(row, index, existing);
    const previous = existing.get(row.externalKey);
    const blocked = issues.some((issue) => issue.severity === 'blocker');
    const action: AssortmentImportPreviewRow['action'] = blocked
      ? 'skip'
      : !previous
        ? 'create'
        : unchanged(previous, row, match.commercialVariantId)
          ? 'unchanged'
          : 'update';
    return { row, action, match, issues };
  });

  const count = (
    predicate: (row: AssortmentImportPreviewRow) => boolean,
  ): number => rows.filter(predicate).length;
  return {
    organizationId: input.organizationId,
    rows,
    counts: {
      total: rows.length,
      matched: count((row) => row.match.state === 'matched'),
      needsReview: count(
        (row) =>
          row.match.state === 'suggested' || row.match.state === 'ambiguous',
      ),
      noMatch: count((row) => row.match.state === 'no-match'),
      invalidPrice: count((row) =>
        row.issues.some(
          (issue) =>
            issue.code === 'invalid-price' ||
            issue.code === 'gross-price-without-vat-rate',
        ),
      ),
      create: count((row) => row.action === 'create'),
      update: count((row) => row.action === 'update'),
      unchanged: count((row) => row.action === 'unchanged'),
      skip: count((row) => row.action === 'skip'),
    },
  };
}

/**
 * Idempotence (§29): a second run of the same file must report `unchanged`
 * and write nothing new. Only the mutable commercial facts an import owns are
 * compared — never the row's ID, timestamps or an admin's manual `preferred`
 * flag, which an import has no business overwriting.
 */
function unchanged(
  previous: OrganizationAssortmentItem,
  row: AssortmentImportRow,
  matchedVariantId: string | undefined,
): boolean {
  return (
    canonicalJson({
      sourceName: previous.sourceName,
      ean: previous.ean,
      active: previous.active,
      commercialVariantId: previous.commercialVariantId,
      vatRateBps: previous.vatRateBps,
    }) ===
    canonicalJson({
      sourceName: row.sourceName,
      ean: row.ean,
      active: row.active ?? previous.active,
      commercialVariantId: matchedVariantId ?? previous.commercialVariantId,
      vatRateBps: row.vatRateBps ?? previous.vatRateBps,
    })
  );
}

/** Rows a preview would actually write. Skipped rows never reach the database. */
export function applicablePreviewRows(
  preview: AssortmentImportPreview,
): AssortmentImportPreviewRow[] {
  return preview.rows.filter(
    (row) => row.action === 'create' || row.action === 'update',
  );
}

/** Rows an admin must look at before trusting the import (§26's "Pokaż problemy"). */
export function problemPreviewRows(
  preview: AssortmentImportPreview,
): AssortmentImportPreviewRow[] {
  return preview.rows.filter(
    (row) =>
      row.issues.length > 0 ||
      row.match.state === 'ambiguous' ||
      row.match.state === 'suggested' ||
      row.match.state === 'no-match',
  );
}
