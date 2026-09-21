import { describe, expect, it } from 'vitest';
import {
  applicablePreviewRows,
  buildAssortmentImportPreview,
  createMatchIndex,
  mapAssortmentRows,
  matchAssortmentRow,
  normalizeSaleUnit,
  parseAssortmentCsv,
  parseMoneyMinor,
  problemPreviewRows,
  sniffDelimiter,
  type AssortmentMatchCandidate,
  type OrganizationAssortmentItem,
} from './index';

const MAPPING = {
  externalKey: 'KOD_TOW',
  sourceName: 'NAZWA',
  netAmount: 'CENA_NETTO',
  ean: 'EAN',
};

const CANDIDATES: AssortmentMatchCandidate[] = [
  {
    commercialVariantId: 'variant:creaton:koda:anthracite-nuance',
    sku: 'CRE-KODA-AN-NU',
    manufacturerName: 'CREATON',
    productName: 'KODA',
    variantName: 'Antracytowa (NUANCE, angobowana)',
  },
  {
    commercialVariantId: 'variant:swissporton:domino:natural-red',
    sku: 'SWT-DOM-NAT',
    ean: '5901234123457',
    manufacturerName: 'swissporTON',
    productName: 'DOMINO',
    variantName: 'Czerwona naturalna',
  },
  {
    commercialVariantId: 'variant:dup:one',
    manufacturerName: 'Duplikat',
    productName: 'Ten sam',
  },
  {
    commercialVariantId: 'variant:dup:two',
    manufacturerName: 'Duplikat',
    productName: 'Ten sam',
  },
];

describe('CSV parsing', () => {
  it('sniffs the delimiter and keeps quoted fields intact', () => {
    const text =
      'KOD_TOW;NAZWA;CENA_NETTO\r\nDACH-1;"Dachówka KODA; antracyt";4,82\r\nDACH-2;Domino;3.10\r\n';
    expect(sniffDelimiter(text)).toBe(';');
    const parsed = parseAssortmentCsv(text);
    expect(parsed.headers).toEqual(['KOD_TOW', 'NAZWA', 'CENA_NETTO']);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]!.values.NAZWA).toBe('Dachówka KODA; antracyt');
    expect(parsed.rows[0]!.sourceLine).toBe(2);
  });

  it('strips a UTF-8 BOM and drops blank lines', () => {
    const parsed = parseAssortmentCsv('﻿a,b\n\n1,2\n');
    expect(parsed.headers).toEqual(['a', 'b']);
    expect(parsed.rows).toHaveLength(1);
  });

  it('handles an embedded newline and a doubled quote', () => {
    const parsed = parseAssortmentCsv('a,b\n"line\nbreak","say ""hi"""\n');
    expect(parsed.rows[0]!.values.a).toBe('line\nbreak');
    expect(parsed.rows[0]!.values.b).toBe('say "hi"');
  });

  it('reads both decimal conventions and rejects nonsense', () => {
    expect(parseMoneyMinor('4,82')).toBe(482);
    expect(parseMoneyMinor('4.82')).toBe(482);
    expect(parseMoneyMinor('1 234,50 zł')).toBe(123450);
    expect(parseMoneyMinor('1.234,50')).toBe(123450);
    expect(parseMoneyMinor('na zapytanie')).toBeUndefined();
    expect(parseMoneyMinor('')).toBeUndefined();
  });

  it('normalizes Polish sale-unit spellings', () => {
    expect(normalizeSaleUnit('szt.')).toBe('piece');
    expect(normalizeSaleUnit('M²')).toBe('m2');
    expect(normalizeSaleUnit('mb')).toBe('m');
    expect(normalizeSaleUnit('wagon')).toBeUndefined();
  });
});

describe('column mapping', () => {
  it('maps arbitrary source headers onto business fields', () => {
    const parsed = parseAssortmentCsv(
      'KOD_TOW;NAZWA;CENA_NETTO;EAN\nDACH-00384;KODA antracyt;4,82;5901234123457\n',
    );
    const { rows, issues } = mapAssortmentRows(parsed, MAPPING);
    expect(issues).toEqual([]);
    expect(rows[0]).toEqual({
      sourceLine: 2,
      externalKey: 'DACH-00384',
      sourceName: 'KODA antracyt',
      netAmountMinor: 482,
      ean: '5901234123457',
    });
  });

  it('never invents a net price from a gross one without a VAT rate', () => {
    const parsed = parseAssortmentCsv('KOD;NAZWA;BRUTTO\nA;Produkt;12,30\n');
    const { rows, issues } = mapAssortmentRows(parsed, {
      externalKey: 'KOD',
      sourceName: 'NAZWA',
      grossAmount: 'BRUTTO',
    });
    expect(rows[0]!.netAmountMinor).toBeUndefined();
    expect(issues).toEqual([
      {
        sourceLine: 2,
        externalKey: 'A',
        code: 'gross-price-without-vat-rate',
        severity: 'warning',
      },
    ]);
  });

  it('derives net from gross when the source states the VAT rate', () => {
    const parsed = parseAssortmentCsv(
      'KOD;NAZWA;BRUTTO;VAT\nA;Produkt;12,30;23\n',
    );
    const { rows } = mapAssortmentRows(parsed, {
      externalKey: 'KOD',
      sourceName: 'NAZWA',
      grossAmount: 'BRUTTO',
      vatRate: 'VAT',
    });
    expect(rows[0]!.netAmountMinor).toBe(1000);
    expect(rows[0]!.vatRateBps).toBe(2300);
  });

  it('blocks rows with no code or no name, and flags a duplicate code', () => {
    const parsed = parseAssortmentCsv(
      'KOD;NAZWA;CENA_NETTO\n;Bez kodu;1,00\nB;;2,00\nC;Ok;3,00\nC;Znowu;4,00\n',
    );
    const { rows, issues } = mapAssortmentRows(parsed, {
      externalKey: 'KOD',
      sourceName: 'NAZWA',
      netAmount: 'CENA_NETTO',
    });
    expect(rows.map((row) => row.externalKey)).toEqual(['C', 'C']);
    expect(issues.map((issue) => issue.code)).toEqual([
      'missing-external-key',
      'missing-name',
      'duplicate-external-key',
    ]);
  });

  it('reports an unreadable price as a warning and keeps the row', () => {
    const parsed = parseAssortmentCsv(
      'KOD;NAZWA;CENA\nA;Produkt;na zapytanie\n',
    );
    const { rows, issues } = mapAssortmentRows(parsed, {
      externalKey: 'KOD',
      sourceName: 'NAZWA',
      netAmount: 'CENA',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.netAmountMinor).toBeUndefined();
    expect(issues[0]).toMatchObject({
      code: 'invalid-price',
      severity: 'warning',
    });
  });
});

describe('matching engine', () => {
  const index = createMatchIndex(CANDIDATES);
  const line = (externalKey: string, sourceName: string, extra = {}) => ({
    sourceLine: 2,
    externalKey,
    sourceName,
    ...extra,
  });

  it('matches on an exact commercial-variant SKU', () => {
    expect(
      matchAssortmentRow(line('CRE-KODA-AN-NU', 'cokolwiek'), index, new Map()),
    ).toEqual({
      state: 'matched',
      commercialVariantId: 'variant:creaton:koda:anthracite-nuance',
      reason: 'variant-sku',
    });
  });

  it('matches on an exact EAN when the catalogue carries one', () => {
    expect(
      matchAssortmentRow(
        line('WHATEVER', 'nazwa hurtowni', { ean: '5901234123457' }),
        index,
        new Map(),
      ),
    ).toEqual({
      state: 'matched',
      commercialVariantId: 'variant:swissporton:domino:natural-red',
      reason: 'ean',
    });
  });

  it('keeps an existing manual mapping above any inference', () => {
    const existing = new Map<string, OrganizationAssortmentItem>([
      [
        'DACH-1',
        {
          id: 'x',
          organizationId: 'org:a',
          externalKey: 'DACH-1',
          commercialVariantId: 'variant:manual:choice',
          sourceName: 'stara nazwa',
          active: true,
          preferred: false,
        },
      ],
    ]);
    expect(
      matchAssortmentRow(line('DACH-1', 'CREATON KODA'), index, existing),
    ).toEqual({
      state: 'matched',
      commercialVariantId: 'variant:manual:choice',
      reason: 'existing-mapping',
    });
  });

  it('only suggests a normalized name match, never applies it', () => {
    const result = matchAssortmentRow(
      line('DACH-99', 'koda antracytowa  (NUANCE, angobowana)', {
        manufacturerName: 'Creaton',
      }),
      index,
      new Map(),
    );
    expect(result.state).toBe('suggested');
    expect(result.commercialVariantId).toBeUndefined();
  });

  it('reports ambiguity instead of choosing', () => {
    const result = matchAssortmentRow(
      line('DACH-77', 'Ten sam', { manufacturerName: 'Duplikat' }),
      index,
      new Map(),
    );
    expect(result.state).toBe('ambiguous');
    expect(result.candidateIds).toEqual(['variant:dup:one', 'variant:dup:two']);
    expect(result.commercialVariantId).toBeUndefined();
  });

  it('returns no-match rather than guessing', () => {
    expect(
      matchAssortmentRow(line('X-1', 'Coś zupełnie innego'), index, new Map())
        .state,
    ).toBe('no-match');
  });
});

describe('import preview', () => {
  const csv =
    'KOD_TOW;NAZWA;CENA_NETTO;EAN\n' +
    'CRE-KODA-AN-NU;KODA antracyt;4,82;\n' +
    'DACH-00999;Membrana wysokoparoprzepuszczalna 150;12,90;\n' +
    'DACH-00777;Cena do ustalenia;na zapytanie;\n';
  const parsed = parseAssortmentCsv(csv);
  const mapped = mapAssortmentRows(parsed, MAPPING);

  const preview = (existing: OrganizationAssortmentItem[] = []) =>
    buildAssortmentImportPreview({
      organizationId: 'org:demo',
      rows: mapped.rows,
      issues: mapped.issues,
      existing,
      candidates: CANDIDATES,
    });

  it('reports matched, unmatched and price problems without writing anything', () => {
    const result = preview();
    expect(result.counts).toMatchObject({
      total: 3,
      matched: 1,
      noMatch: 2,
      invalidPrice: 1,
      create: 3,
      update: 0,
      unchanged: 0,
      skip: 0,
    });
    expect(problemPreviewRows(result)).toHaveLength(2);
    expect(applicablePreviewRows(result)).toHaveLength(3);
  });

  it('is idempotent: re-previewing an applied file reports unchanged', () => {
    const applied: OrganizationAssortmentItem[] = mapped.rows.map(
      (row, position) => ({
        id: `oai:${position}`,
        organizationId: 'org:demo',
        externalKey: row.externalKey,
        sourceName: row.sourceName,
        ...(row.ean ? { ean: row.ean } : {}),
        ...(row.externalKey === 'CRE-KODA-AN-NU'
          ? { commercialVariantId: 'variant:creaton:koda:anthracite-nuance' }
          : {}),
        active: true,
        preferred: false,
      }),
    );
    const result = preview(applied);
    expect(result.counts.create).toBe(0);
    expect(result.counts.unchanged).toBe(3);
    expect(applicablePreviewRows(result)).toEqual([]);
  });

  it('ignores another organization rows when deciding create vs update', () => {
    const otherTenant: OrganizationAssortmentItem[] = [
      {
        id: 'oai:other',
        organizationId: 'org:other',
        externalKey: 'CRE-KODA-AN-NU',
        sourceName: 'KODA antracyt',
        commercialVariantId: 'variant:creaton:koda:anthracite-nuance',
        active: true,
        preferred: false,
      },
    ];
    expect(preview(otherTenant).counts.create).toBe(3);
  });

  it('skips a blocked row so it is never written', () => {
    const bad = parseAssortmentCsv(
      'KOD_TOW;NAZWA;CENA_NETTO\n;Bez kodu;1,00\nA;Ok;2,00\n',
    );
    const badMapped = mapAssortmentRows(bad, {
      externalKey: 'KOD_TOW',
      sourceName: 'NAZWA',
      netAmount: 'CENA_NETTO',
    });
    const result = buildAssortmentImportPreview({
      organizationId: 'org:demo',
      rows: badMapped.rows,
      issues: badMapped.issues,
      existing: [],
      candidates: CANDIDATES,
    });
    expect(result.counts.total).toBe(1);
    expect(
      applicablePreviewRows(result).map((row) => row.row.externalKey),
    ).toEqual(['A']);
  });

  it('never marks an unmatched row technically usable', () => {
    const unmatched = preview().rows.find(
      (row) => row.row.externalKey === 'DACH-00999',
    );
    expect(unmatched?.match.state).toBe('no-match');
    expect(unmatched?.match.commercialVariantId).toBeUndefined();
  });

  it('parses, maps and matches a generated 5,000-row price list in linear time', () => {
    const size = 5_000;
    const candidates: AssortmentMatchCandidate[] = Array.from(
      { length: size },
      (_, index) => ({
        commercialVariantId: `variant:bulk:${index}`,
        sku: `SKU-${String(index).padStart(5, '0')}`,
        productName: `Produkt ${index}`,
      }),
    );
    const csv = [
      'KOD_TOW;NAZWA;CENA_NETTO',
      ...Array.from(
        { length: size },
        (_, index) =>
          `SKU-${String(index).padStart(5, '0')};Produkt ${index};4,82`,
      ),
    ].join('\n');
    const startedAt = performance.now();
    const parsed = parseAssortmentCsv(csv);
    const mapped = mapAssortmentRows(parsed, {
      externalKey: 'KOD_TOW',
      sourceName: 'NAZWA',
      netAmount: 'CENA_NETTO',
    });
    const result = buildAssortmentImportPreview({
      organizationId: 'org:bulk',
      rows: mapped.rows,
      issues: mapped.issues,
      existing: [],
      candidates,
    });
    const elapsedMs = performance.now() - startedAt;

    expect(result.counts).toMatchObject({ total: size, matched: size });
    expect(elapsedMs).toBeLessThan(2_000);
  });
});
