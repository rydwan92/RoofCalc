import { describe, expect, it } from 'vitest';
import { PricingImporter } from './importer';
import { MemoryPricingRepository } from './memory-repository';

function batch(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    source: { id: 'test-source', label: 'Test source' },
    priceLists: [
      {
        id: 'list-1',
        ownerLabel: 'Test retailer',
        currencyCode: 'PLN',
        validFrom: '2026-09-01',
      },
    ],
    entries: [
      {
        id: 'entry-1',
        priceListId: 'list-1',
        commercialVariantId: 'variant:creaton:koda:copper-nuance',
        saleUnit: 'piece',
        netAmountMinor: 924,
        validFrom: '2026-09-01',
      },
    ],
    ...overrides,
  };
}

describe('PricingImporter', () => {
  it('validates a fresh batch as dry-run "valid" without writing anything', async () => {
    const repository = new MemoryPricingRepository();
    const report = await new PricingImporter(repository).import(batch());
    expect(report.status).toBe('valid');
    expect(report.dryRun).toBe(true);
    expect(report.priceLists).toMatchObject({ total: 1, new: 1 });
    expect(report.entries).toMatchObject({ total: 1, new: 1 });
    expect(
      (
        await repository.entriesForVariants([
          'variant:creaton:koda:copper-nuance',
        ])
      ).length,
    ).toBe(0);
  });

  it('applies a fresh batch when --apply is set', async () => {
    const repository = new MemoryPricingRepository();
    const report = await new PricingImporter(repository).import(batch(), {
      apply: true,
    });
    expect(report.status).toBe('applied');
    const entries = await repository.entriesForVariants([
      'variant:creaton:koda:copper-nuance',
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.netAmountMinor).toBe(924);
    expect(repository.audits).toHaveLength(1);
  });

  it('reports an already-applied identical batch as unchanged', async () => {
    const repository = new MemoryPricingRepository();
    await new PricingImporter(repository).import(batch(), { apply: true });
    const report = await new PricingImporter(repository).import(batch(), {
      apply: true,
    });
    expect(report.status).toBe('applied');
    expect(report.entries).toMatchObject({ new: 0, unchanged: 1 });
  });

  it('never silently overwrites a changed price under the same entry ID', async () => {
    const repository = new MemoryPricingRepository();
    await new PricingImporter(repository).import(batch(), { apply: true });
    const changedPrice = batch({
      entries: [
        {
          id: 'entry-1',
          priceListId: 'list-1',
          commercialVariantId: 'variant:creaton:koda:copper-nuance',
          saleUnit: 'piece',
          netAmountMinor: 1500,
          validFrom: '2026-09-01',
        },
      ],
    });
    const report = await new PricingImporter(repository).import(changedPrice, {
      apply: true,
    });
    expect(report.status).toBe('conflict');
    expect(report.conflicts).toEqual([
      { entity: 'entry', id: 'entry-1', code: 'immutable-price-entry' },
    ]);
    // The stored price must still be the original, untouched value.
    const entries = await repository.entriesForVariants([
      'variant:creaton:koda:copper-nuance',
    ]);
    expect(entries[0]!.netAmountMinor).toBe(924);
  });

  it('accepts a real price change as a brand-new entry ID', async () => {
    const repository = new MemoryPricingRepository();
    await new PricingImporter(repository).import(batch(), { apply: true });
    const newPrice = batch({
      entries: [
        {
          id: 'entry-2',
          priceListId: 'list-1',
          commercialVariantId: 'variant:creaton:koda:copper-nuance',
          saleUnit: 'piece',
          netAmountMinor: 1500,
          validFrom: '2026-10-01',
        },
      ],
    });
    const report = await new PricingImporter(repository).import(newPrice, {
      apply: true,
    });
    expect(report.status).toBe('applied');
    expect(report.entries).toMatchObject({ new: 1 });
    const entries = await repository.entriesForVariants([
      'variant:creaton:koda:copper-nuance',
    ]);
    expect(entries.map((e) => e.netAmountMinor).sort((a, b) => a - b)).toEqual([
      924, 1500,
    ]);
  });

  it('rejects a price list whose currency changes under the same ID', async () => {
    const repository = new MemoryPricingRepository();
    await new PricingImporter(repository).import(batch(), { apply: true });
    const changedCurrency = batch({
      priceLists: [
        {
          id: 'list-1',
          ownerLabel: 'Test retailer',
          currencyCode: 'EUR',
          validFrom: '2026-09-01',
        },
      ],
      entries: [],
    });
    const report = await new PricingImporter(repository).import(
      changedCurrency,
      { apply: true },
    );
    expect(report.status).toBe('conflict');
    expect(report.conflicts).toEqual([
      { entity: 'price-list', id: 'list-1', code: 'immutable-currency' },
    ]);
  });

  it('allows correcting a price list label under the same ID', async () => {
    const repository = new MemoryPricingRepository();
    await new PricingImporter(repository).import(batch(), { apply: true });
    const correctedLabel = batch({
      priceLists: [
        {
          id: 'list-1',
          ownerLabel: 'Corrected retailer name',
          currencyCode: 'PLN',
          validFrom: '2026-09-01',
        },
      ],
      entries: [],
    });
    const report = await new PricingImporter(repository).import(
      correctedLabel,
      { apply: true },
    );
    expect(report.status).toBe('applied');
    expect(report.priceLists).toMatchObject({ updated: 1 });
  });
});
