import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { businessSeedSchema, resolveBusinessSeed } from './seed';
import { seedBusinessOrganization } from './seed-runner';
import { InMemoryBusinessRepository } from './memory-repository';
import { BusinessService } from './service';
import { assortmentQuerySchema } from '@cieslacalc/business-core';

const here = dirname(fileURLToPath(import.meta.url));
const SEED_FILE = resolve(here, '../data/business/demo-wholesaler.v1.json');
const seed = businessSeedSchema.parse(
  JSON.parse(readFileSync(SEED_FILE, 'utf8')),
);

/** Every catalogue variant the seed file claims, as this test's fake catalogue. */
function catalogFor(variantIds: readonly string[]) {
  return variantIds.map((variantId, index) => ({
    productId: `product:${index}`,
    productName: `Produkt ${index}`,
    manufacturerId: `manufacturer:${index}`,
    manufacturerName: 'Producent',
    kind: 'roof-tile',
    currentRevisionId: `revision:${index}`,
    variantId,
    variantName: 'Wariant',
  }));
}

describe('demo wholesaler seed file', () => {
  it('parses and is openly labelled as demo data', () => {
    expect(seed.organization.id).toBe('org:demo-hurtownia');
    expect(seed.organization.name).toMatch(/DEMO/i);
    // §36: demo pricing must never read as observed market pricing.
    expect(seed.priceList.ownerLabel).toMatch(/DEMO/i);
    expect(seed.priceList.taxContext).toMatch(/DEMO|TEST/i);
  });

  it('covers tiles, metal and battens as matched, and keeps unmatched rows', () => {
    const resolved = resolveBusinessSeed(seed);
    expect(resolved.counts.matched).toBeGreaterThanOrEqual(8);
    expect(resolved.counts.unmatched).toBeGreaterThanOrEqual(4);
    expect(resolved.counts.inactive).toBe(1);
    const matchedVariants = resolved.assortment
      .flatMap((item) =>
        item.commercialVariantId ? [item.commercialVariantId] : [],
      )
      .join(' ');
    for (const family of ['koda', 'fiord', 'lata'])
      expect(matchedVariants).toContain(family);
  });

  it('never prices a row it could not map to a catalogue variant', () => {
    const resolved = resolveBusinessSeed(seed);
    const mapped = new Set(
      resolved.assortment.flatMap((item) =>
        item.commercialVariantId ? [item.commercialVariantId] : [],
      ),
    );
    for (const entry of resolved.entries)
      expect(mapped.has(entry.commercialVariantId)).toBe(true);
    expect(
      resolved.entries.every((entry) => entry.sourceAmountBasis === 'net'),
    ).toBe(true);
  });

  it('scopes its price list to the demo organization, never globally', () => {
    const resolved = resolveBusinessSeed(seed);
    expect(resolved.priceList.organizationId).toBe('org:demo-hurtownia');
    expect(resolved.priceList.currencyCode).toBe(
      resolved.organization.currencyCode,
    );
  });
});

describe('seed runner', () => {
  const resolved = resolveBusinessSeed(seed);
  const declared = [
    ...new Set(
      resolved.assortment.flatMap((item) =>
        item.commercialVariantId ? [item.commercialVariantId] : [],
      ),
    ),
  ];

  it('writes nothing on a dry run', async () => {
    const store = new InMemoryBusinessRepository({
      catalog: catalogFor(declared),
    });
    await seedBusinessOrganization(store, store, resolved, { apply: false });
    expect(store.state.organizations).toEqual([]);
    expect(store.state.assortment).toEqual([]);
  });

  it('applies the organization, assortment and prices', async () => {
    const store = new InMemoryBusinessRepository({
      catalog: catalogFor(declared),
    });
    const report = await seedBusinessOrganization(store, store, resolved, {
      apply: true,
    });
    expect(store.state.organizations).toHaveLength(1);
    expect(store.state.assortment).toHaveLength(resolved.assortment.length);
    expect(report.droppedVariantReferences).toEqual([]);
    expect(report.pricesWritten).toBe(resolved.entries.length);
  });

  it('is idempotent: re-seeding creates no duplicate rows', async () => {
    const store = new InMemoryBusinessRepository({
      catalog: catalogFor(declared),
    });
    await seedBusinessOrganization(store, store, resolved, { apply: true });
    const afterFirst = store.state.assortment.length;
    await seedBusinessOrganization(store, store, resolved, { apply: true });
    expect(store.state.assortment).toHaveLength(afterFirst);
    expect(store.state.organizations).toHaveLength(1);
    expect(store.state.priceLists).toHaveLength(1);
  });

  it('imports a row unmatched rather than dropping it when the variant is absent', async () => {
    const store = new InMemoryBusinessRepository({
      catalog: catalogFor(declared.slice(1)),
    });
    const report = await seedBusinessOrganization(store, store, resolved, {
      apply: true,
    });
    expect(report.droppedVariantReferences).toEqual([declared[0]]);
    expect(store.state.assortment).toHaveLength(resolved.assortment.length);
    expect(
      store.state.assortment.filter((item) => item.commercialVariantId),
    ).toHaveLength(declared.length - 1);
  });

  it('preserves user-created rows and manual edits to seeded organization, assortment and prices', async () => {
    const store = new InMemoryBusinessRepository({
      catalog: catalogFor(declared),
    });
    await seedBusinessOrganization(store, store, resolved, { apply: true });
    store.state.organizations[0]!.name = 'My edited organization';
    store.state.assortment[0]!.preferred = false;
    store.state.assortment[0]!.sourceName = 'My name';
    store.state.entries[0]!.netAmountMinor = 123;
    store.state.assortment.push({
      ...store.state.assortment[0]!,
      id: 'manual-item',
      externalKey: 'manual-item',
    });
    const before = structuredClone(store.state);
    await seedBusinessOrganization(store, store, resolved, { apply: true });
    await seedBusinessOrganization(store, store, resolved, { apply: true });
    expect(store.state).toEqual(before);
  });

  it('serves the seeded demo organization through the read service', async () => {
    const store = new InMemoryBusinessRepository({
      catalog: catalogFor(declared),
    });
    await seedBusinessOrganization(store, store, resolved, { apply: true });
    const service = new BusinessService(store, store);
    const result = await service.assortment(
      'org:demo-hurtownia',
      assortmentQuerySchema.parse({ limit: 200 }),
      '2026-09-20',
    );
    expect(result.summary.total).toBe(resolved.assortment.length);
    expect(result.summary.unmatched).toBeGreaterThan(0);
    expect(result.summary.withoutPrice).toBeGreaterThan(0);
    const priced = result.items.find(
      (row) => row.item.externalKey === 'DACH-00384',
    );
    expect(priced?.price?.netAmountMinor).toBe(482);
    expect(priced?.item.preferred).toBe(true);
  });
});
