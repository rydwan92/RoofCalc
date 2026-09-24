import { describe, expect, it } from 'vitest';
import { assortmentQuerySchema } from '@cieslacalc/business-core';
import { InMemoryBusinessRepository } from './memory-repository';
import { BusinessService, BusinessServiceError } from './service';

const SHARED_VARIANT = 'variant:swissporton:koda:antracytowa-angoba';
const OTHER_VARIANT = 'variant:swissporton:titania:antracytowa-angoba';

function repository() {
  return new InMemoryBusinessRepository({
    organizations: [
      {
        id: 'org:a',
        slug: 'hurtownia-a',
        name: 'Hurtownia A',
        currencyCode: 'PLN',
        active: true,
      },
      {
        id: 'org:b',
        slug: 'hurtownia-b',
        name: 'Hurtownia B',
        currencyCode: 'PLN',
        active: true,
      },
    ],
    catalog: [
      {
        productId: 'product:swissporton:koda',
        productName: 'KODA',
        manufacturerId: 'manufacturer:swissporton',
        manufacturerName: 'swissporTON',
        kind: 'roof-tile',
        currentRevisionId: 'revision:koda:1',
        variantId: SHARED_VARIANT,
        variantName: 'Antracytowa angoba',
      },
      {
        productId: 'product:swissporton:titania',
        productName: 'TITANIA',
        manufacturerId: 'manufacturer:swissporton',
        manufacturerName: 'swissporTON',
        kind: 'roof-tile',
        currentRevisionId: 'revision:titania:1',
        variantId: OTHER_VARIANT,
        variantName: 'Antracytowa angoba',
      },
    ],
    assortment: [
      {
        id: 'oai:a:1',
        organizationId: 'org:a',
        commercialVariantId: SHARED_VARIANT,
        externalKey: 'A-DACH-001',
        sourceName: 'KODA antracyt (A)',
        active: true,
        preferred: true,
      },
      {
        id: 'oai:a:2',
        organizationId: 'org:a',
        externalKey: 'A-MEM-900',
        sourceName: 'Membrana 150',
        active: true,
        preferred: false,
      },
      {
        id: 'oai:a:3',
        organizationId: 'org:a',
        commercialVariantId: OTHER_VARIANT,
        externalKey: 'A-DACH-002',
        sourceName: 'TITANIA antracyt (A)',
        active: true,
        preferred: false,
      },
      {
        id: 'oai:b:1',
        organizationId: 'org:b',
        commercialVariantId: SHARED_VARIANT,
        externalKey: 'B-KOD-777',
        sourceName: 'KODA antracyt (B)',
        active: true,
        preferred: false,
      },
    ],
    priceLists: [
      {
        id: 'price-list:global',
        ownerLabel: 'rabatplus.pl (retail)',
        currencyCode: 'PLN',
        validFrom: '2026-01-01',
      },
      {
        id: 'price-list:a',
        organizationId: 'org:a',
        ownerLabel: 'Hurtownia A — cennik',
        currencyCode: 'PLN',
        validFrom: '2026-01-01',
      },
      {
        id: 'price-list:b',
        organizationId: 'org:b',
        ownerLabel: 'Hurtownia B — cennik',
        currencyCode: 'PLN',
        validFrom: '2026-01-01',
      },
    ],
    entries: [
      {
        id: 'e:global',
        priceListId: 'price-list:global',
        commercialVariantId: SHARED_VARIANT,
        saleUnit: 'piece',
        netAmountMinor: 924,
        validFrom: '2026-01-01',
      },
      {
        id: 'e:a',
        priceListId: 'price-list:a',
        commercialVariantId: SHARED_VARIANT,
        saleUnit: 'piece',
        netAmountMinor: 482,
        validFrom: '2026-01-01',
      },
      {
        id: 'e:b',
        priceListId: 'price-list:b',
        commercialVariantId: SHARED_VARIANT,
        saleUnit: 'piece',
        netAmountMinor: 401,
        validFrom: '2026-01-01',
      },
    ],
  });
}

function service() {
  const store = repository();
  return { store, service: new BusinessService(store, store) };
}

const query = (overrides: Record<string, unknown> = {}) =>
  assortmentQuerySchema.parse(overrides);

describe('BusinessService reads', () => {
  it('lists organizations', async () => {
    const { service: api } = service();
    expect((await api.listOrganizations()).map((item) => item.id)).toEqual([
      'org:a',
      'org:b',
    ]);
  });

  it('rejects an unknown organization instead of returning an empty list', async () => {
    const { service: api } = service();
    await expect(api.assortment('org:zzz', query())).rejects.toThrow(
      BusinessServiceError,
    );
    await expect(api.assortment('   ', query())).rejects.toMatchObject({
      code: 'business-invalid-request',
    });
  });

  it('joins catalogue identity and the organization own price', async () => {
    const { service: api } = service();
    const result = await api.assortment('org:a', query(), '2026-09-20');
    const koda = result.items.find(
      (row) => row.item.externalKey === 'A-DACH-001',
    );
    expect(koda?.state).toBe('matched');
    expect(koda?.catalog).toMatchObject({
      productName: 'KODA',
      manufacturerName: 'swissporTON',
      kind: 'roof-tile',
    });
    expect(koda?.price).toMatchObject({
      netAmountMinor: 482,
      priceListId: 'price-list:a',
      priceListLabel: 'Hurtownia A — cennik',
    });
  });

  it('reports an unmatched row without catalogue facts or a price', async () => {
    const { service: api } = service();
    const result = await api.assortment('org:a', query(), '2026-09-20');
    const membrane = result.items.find(
      (row) => row.item.externalKey === 'A-MEM-900',
    );
    expect(membrane?.state).toBe('unmatched');
    expect(membrane?.catalog).toBeUndefined();
    expect(membrane?.price).toBeUndefined();
  });

  it('sorts preferred rows first', async () => {
    const { service: api } = service();
    const result = await api.assortment('org:a', query(), '2026-09-20');
    expect(result.items[0]?.item.preferred).toBe(true);
  });

  it('summarises every row into exactly one state', async () => {
    const { service: api } = service();
    const { summary } = await api.assortment('org:a', query(), '2026-09-20');
    expect(summary).toEqual({
      total: 3,
      matched: 2,
      unmatched: 1,
      inactive: 0,
      withoutPrice: 2,
      withoutVat: 2,
    });
    expect(summary.matched + summary.unmatched + summary.inactive).toBe(
      summary.total,
    );
  });
});

describe('assortment filters and search', () => {
  it('filters unmatched rows', async () => {
    const { service: api } = service();
    const result = await api.assortment(
      'org:a',
      query({ filter: 'unmatched' }),
      '2026-09-20',
    );
    expect(result.items.map((row) => row.item.externalKey)).toEqual([
      'A-MEM-900',
    ]);
  });

  it('filters rows without a price', async () => {
    const { service: api } = service();
    const result = await api.assortment(
      'org:a',
      query({ filter: 'without-price' }),
      '2026-09-20',
    );
    expect(result.items.map((row) => row.item.externalKey).sort()).toEqual([
      'A-DACH-002',
      'A-MEM-900',
    ]);
  });

  it('searches the warehouse code and the catalogue name alike', async () => {
    const { service: api } = service();
    for (const [needle, expected] of [
      ['A-DACH-001', 'A-DACH-001'],
      ['titania', 'A-DACH-002'],
      ['swissporTON', 'A-DACH-001'],
    ] as const) {
      const result = await api.assortment(
        'org:a',
        query({ q: needle }),
        '2026-09-20',
      );
      expect(result.items.map((row) => row.item.externalKey)).toContain(
        expected,
      );
    }
  });

  it('narrows to a product kind and to preferred rows', async () => {
    const { service: api } = service();
    expect(
      (await api.assortment('org:a', query({ kind: 'membrane' }), '2026-09-20'))
        .items,
    ).toEqual([]);
    const preferred = await api.assortment(
      'org:a',
      query({ preferredOnly: 'true' }),
      '2026-09-20',
    );
    expect(preferred.items.map((row) => row.item.externalKey)).toEqual([
      'A-DACH-001',
    ]);
  });

  it('supports explicit state, active, preferred, price and manufacturer filters', async () => {
    const { store, service: api } = service();
    store.state.assortment[2]!.active = false;
    expect(
      (
        await api.assortment(
          'org:a',
          query({ state: 'inactive', active: 'false' }),
          '2026-09-20',
        )
      ).items.map((row) => row.item.externalKey),
    ).toEqual(['A-DACH-002']);
    expect(
      (
        await api.assortment(
          'org:a',
          query({ preferred: 'true', hasPrice: 'true' }),
          '2026-09-20',
        )
      ).items.map((row) => row.item.externalKey),
    ).toEqual(['A-DACH-001']);
    expect(
      (
        await api.assortment(
          'org:a',
          query({ manufacturer: 'swiss' }),
          '2026-09-20',
        )
      ).items.map((row) => row.item.externalKey),
    ).toEqual(['A-DACH-001', 'A-DACH-002']);
  });

  it('pages with an opaque cursor and rejects a malformed one', async () => {
    const { service: api } = service();
    const first = await api.assortment(
      'org:a',
      query({ limit: 2 }),
      '2026-09-20',
    );
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toBe('2');
    const second = await api.assortment(
      'org:a',
      query({ limit: 2, cursor: first.nextCursor }),
      '2026-09-20',
    );
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeUndefined();
    await expect(
      api.assortment('org:a', query({ cursor: 'nope' }), '2026-09-20'),
    ).rejects.toMatchObject({ code: 'business-invalid-request' });
  });

  it('finds an SKU near the end of a 5,000-row assortment without returning the dataset', async () => {
    const { store, service: api } = service();
    store.state.assortment.push(
      ...Array.from({ length: 5_000 }, (_, index) => ({
        id: `oai:a:bulk:${index}`,
        organizationId: 'org:a',
        externalKey: `BULK-${String(index).padStart(5, '0')}`,
        sourceName: `Produkt hurtowni ${index}`,
        active: true,
        preferred: false,
      })),
    );
    const result = await api.assortment(
      'org:a',
      query({ q: 'BULK-04999', limit: 40 }),
      '2026-09-20',
    );
    expect(result.items.map((row) => row.item.externalKey)).toEqual([
      'BULK-04999',
    ]);
    expect(result.nextCursor).toBeUndefined();
    expect(result.summary.total).toBe(5_003);
  });
});

/**
 * The single most important property in V54: two wholesalers may sell the
 * exact same catalogue product, and neither may ever see the other's SKU,
 * price or assortment row.
 */
describe('tenant isolation', () => {
  it('returns only the asking organization rows for a shared variant', async () => {
    const { service: api } = service();
    const a = await api.assortment('org:a', query(), '2026-09-20');
    const b = await api.assortment('org:b', query(), '2026-09-20');
    const keys = (result: typeof a) =>
      result.items.map((row) => row.item.externalKey);
    expect(keys(a)).toContain('A-DACH-001');
    expect(keys(a)).not.toContain('B-KOD-777');
    expect(keys(b)).toEqual(['B-KOD-777']);
    expect(JSON.stringify(b)).not.toContain('A-DACH-001');
  });

  it('never returns the other organization price for the shared variant', async () => {
    const { service: api } = service();
    const a = await api.pricesForVariants(
      'org:a',
      [SHARED_VARIANT],
      '2026-09-20',
    );
    const b = await api.pricesForVariants(
      'org:b',
      [SHARED_VARIANT],
      '2026-09-20',
    );
    expect(a.items[0]?.price?.netAmountMinor).toBe(482);
    expect(a.items[0]?.externalKey).toBe('A-DACH-001');
    expect(b.items[0]?.price?.netAmountMinor).toBe(401);
    expect(b.items[0]?.externalKey).toBe('B-KOD-777');
    expect(JSON.stringify(a)).not.toContain('price-list:b');
    expect(JSON.stringify(b)).not.toContain('price-list:a');
  });

  it('never silently falls back to the global catalogue price', async () => {
    const { store, service: api } = service();
    store.state.entries = store.state.entries.filter(
      (entry) => entry.priceListId !== 'price-list:a',
    );
    const result = await api.pricesForVariants(
      'org:a',
      [SHARED_VARIANT],
      '2026-09-20',
    );
    expect(result.items[0]?.price).toBeUndefined();
    expect(result.items[0]?.missing).toBe('no-organization-price');
  });

  it('names a product the organization does not sell, without pricing it', async () => {
    const { service: api } = service();
    const result = await api.pricesForVariants(
      'org:b',
      [OTHER_VARIANT],
      '2026-09-20',
    );
    expect(result.items[0]).toEqual({
      commercialVariantId: OTHER_VARIANT,
      missing: 'not-in-assortment',
    });
  });

  it('rejects a blank variant ID', async () => {
    const { service: api } = service();
    await expect(
      api.pricesForVariants('org:a', ['  '], '2026-09-20'),
    ).rejects.toMatchObject({ code: 'business-invalid-request' });
  });
});
