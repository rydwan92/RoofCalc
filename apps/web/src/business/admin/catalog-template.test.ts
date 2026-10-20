import { describe, expect, it } from 'vitest';
import {
  mapAssortmentRows,
  parseAssortmentCsv,
} from '@cieslacalc/business-core';
import type { CatalogProductDetail } from '@cieslacalc/catalog-core';
import { catalogTemplateCsv } from './catalog-template';
import { guessMapping } from './AssortmentImport';

const manufacturer = {
  id: 'manufacturer:galeco',
  slug: 'galeco',
  name: 'Galeco',
  countryCode: 'PL',
  active: true,
};
const detail = (
  slug: string,
  name: string,
  variants: CatalogProductDetail['variants'],
): CatalogProductDetail =>
  ({
    manufacturer,
    product: {
      id: `product:galeco:${slug}`,
      manufacturerId: manufacturer.id,
      slug,
      name,
      coveringKind: 'roof-drainage-component',
      active: true,
    },
    currentRevision: {} as CatalogProductDetail['currentRevision'],
    variants,
  }) as CatalogProductDetail;

describe('catalogue template for the assortment import', () => {
  const template = catalogTemplateCsv([
    detail('stal2-rynna-3m', 'STAL² Rynna 3 m', [
      {
        id: 'variant:galeco:stal2-rynna-3m:czarny-ral-9005',
        productId: 'product:galeco:stal2-rynna-3m',
        name: 'Czarny RAL 9005',
        active: true,
      },
    ]),
    detail('stal2-mufa', 'STAL² Mufa', []),
  ]);

  it('one row per active variant with its RoofCalc ID; nothing invented', () => {
    expect(template.rows).toBe(1);
    expect(template.withoutVariants).toEqual(['Galeco STAL² Mufa']);
    const lines = template.csv.replace(/^﻿/, '').trim().split('\r\n');
    expect(lines[0]).toBe('Kod;Nazwa;Producent;EAN;Cena netto;VAT;Jednostka;ID RoofCalc');
    // Code, EAN, price, VAT and unit are the wholesaler's to fill.
    expect(lines[1]).toBe(
      ';STAL² Rynna 3 m — Czarny RAL 9005;Galeco;;;;;variant:galeco:stal2-rynna-3m:czarny-ral-9005',
    );
  });

  it('round-trips through the import: the columns map themselves and link exactly', () => {
    const filled = template.csv.replace(
      ';STAL² Rynna 3 m',
      'GAL-R3-CZ;STAL² Rynna 3 m',
    );
    const parsed = parseAssortmentCsv(filled.replace(/^﻿/, ''));
    const mapping = guessMapping(parsed.headers);
    expect(mapping).toMatchObject({
      externalKey: 'Kod',
      sourceName: 'Nazwa',
      manufacturerName: 'Producent',
      netAmount: 'Cena netto',
      catalogVariantId: 'ID RoofCalc',
    });
    const { rows } = mapAssortmentRows(parsed, {
      externalKey: mapping.externalKey!,
      sourceName: mapping.sourceName!,
      ...(mapping.catalogVariantId
        ? { catalogVariantId: mapping.catalogVariantId }
        : {}),
    });
    expect(rows[0]).toMatchObject({
      externalKey: 'GAL-R3-CZ',
      catalogVariantId: 'variant:galeco:stal2-rynna-3m:czarny-ral-9005',
    });
  });
});
