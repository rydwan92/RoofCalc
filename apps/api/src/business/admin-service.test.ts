import { describe, expect, it } from 'vitest';
import { InMemoryBusinessRepository } from './memory-repository';
import { BusinessAdminError, BusinessAdminService } from './admin-service';
import { BusinessService } from './service';
import { adminDevModeEnabled, adminWritesAllowed } from './capability';

const KODA = 'variant:swissporton:koda:antracytowa-angoba';
const TITANIA = 'variant:swissporton:titania:antracytowa-angoba';

function store() {
  return new InMemoryBusinessRepository({
    organizations: [
      {
        id: 'org:a',
        slug: 'hurtownia-a',
        name: 'Hurtownia A',
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
        variantId: KODA,
        variantName: 'Antracytowa angoba',
        variantSku: 'SWT-KODA-AN',
      },
      {
        productId: 'product:swissporton:titania',
        productName: 'TITANIA',
        manufacturerId: 'manufacturer:swissporton',
        manufacturerName: 'swissporTON',
        kind: 'roof-tile',
        currentRevisionId: 'revision:titania:1',
        variantId: TITANIA,
        variantName: 'Antracytowa angoba',
      },
    ],
    assortment: [
      {
        id: 'oai:a:1',
        organizationId: 'org:a',
        externalKey: 'A-DACH-001',
        sourceName: 'Dachówka bez powiązania',
        active: true,
        preferred: false,
      },
      {
        id: 'oai:a:2',
        organizationId: 'org:a',
        commercialVariantId: KODA,
        externalKey: 'A-DACH-002',
        sourceName: 'KODA antracyt',
        active: true,
        preferred: false,
      },
    ],
  });
}

function admin() {
  const repository = store();
  return {
    repository,
    admin: new BusinessAdminService(repository, repository, repository),
    read: new BusinessService(repository, repository),
  };
}

describe('manual mapping', () => {
  it('creates one manual row with an optional immutable organization price', async () => {
    const { admin: service, repository } = admin();
    const item = await service.createItem('org:a', {
      externalKey: 'A-DACH-003',
      sourceName: 'TITANIA ręcznie',
      commercialVariantId: TITANIA,
      active: true,
      preferred: false,
      price: {
        netAmountMinor: 599,
        saleUnit: 'piece',
        validFrom: '2026-09-20',
        vatRateBps: 2300,
      },
    });
    expect(item).toMatchObject({
      organizationId: 'org:a',
      externalKey: 'A-DACH-003',
      commercialVariantId: TITANIA,
    });
    expect(repository.state.priceLists[0]).toMatchObject({
      organizationId: 'org:a',
      currencyCode: 'PLN',
    });
    expect(repository.state.entries[0]).toMatchObject({
      commercialVariantId: TITANIA,
      netAmountMinor: 599,
      sourceVatRateBps: 2300,
    });
  });

  it('appends price versions and exposes newest-first history', async () => {
    const { admin: service, read, repository } = admin();
    await service.addPrice('org:a', {
      itemId: 'oai:a:2',
      netAmountMinor: 450,
      saleUnit: 'piece',
      validFrom: '2026-09-20',
    });
    await service.addPrice('org:a', {
      itemId: 'oai:a:2',
      netAmountMinor: 482,
      saleUnit: 'piece',
      validFrom: '2026-09-20',
    });
    expect(repository.state.entries).toHaveLength(2);
    const detail = await read.assortmentDetail('org:a', 'oai:a:2');
    expect(detail.row.price?.netAmountMinor).toBe(482);
    expect(detail.priceHistory.map((price) => price.netAmountMinor)).toEqual([
      482, 450,
    ]);
  });

  it('rejects a duplicate manual warehouse code', async () => {
    const { admin: service } = admin();
    await expect(
      service.createItem('org:a', {
        externalKey: 'A-DACH-002',
        sourceName: 'Duplicate',
        active: true,
        preferred: false,
      }),
    ).rejects.toMatchObject({ code: 'duplicate-external-key' });
  });

  it('links a row to a catalogue variant without touching the catalogue', async () => {
    const { admin: service, repository } = admin();
    const before = structuredClone(repository.state.catalog);
    const item = await service.link('org:a', 'oai:a:1', TITANIA);
    expect(item.commercialVariantId).toBe(TITANIA);
    expect(repository.state.catalog).toEqual(before);
  });

  it('refuses a variant that does not exist in the catalogue', async () => {
    const { admin: service } = admin();
    await expect(
      service.link('org:a', 'oai:a:1', 'variant:does-not-exist'),
    ).rejects.toMatchObject({ code: 'commercial-variant-not-found' });
  });

  it('refuses a second active row for the same variant', async () => {
    const { admin: service } = admin();
    await expect(service.link('org:a', 'oai:a:1', KODA)).rejects.toMatchObject({
      code: 'duplicate-active-variant',
    });
  });

  it('refuses an item belonging to another organization', async () => {
    const { admin: service } = admin();
    await expect(
      service.link('org:a', 'oai:nonexistent', TITANIA),
    ).rejects.toMatchObject({ code: 'assortment-item-not-found' });
  });

  it('unlinking keeps the organization row and deletes nothing global', async () => {
    const { admin: service, repository } = admin();
    const item = await service.unlink('org:a', 'oai:a:2');
    expect(item.commercialVariantId).toBeUndefined();
    expect(item.externalKey).toBe('A-DACH-002');
    expect(repository.state.assortment).toHaveLength(2);
    expect(repository.state.catalog).toHaveLength(2);
  });

  it('sets active, preferred and the display override', async () => {
    const { admin: service } = admin();
    const item = await service.setFlags('org:a', 'oai:a:2', {
      preferred: true,
      displayNameOverride: 'KODA antracyt (polecana)',
    });
    expect(item.preferred).toBe(true);
    expect(item.displayNameOverride).toBe('KODA antracyt (polecana)');
    const cleared = await service.setFlags('org:a', 'oai:a:2', {
      displayNameOverride: null,
    });
    expect(cleared.displayNameOverride).toBeUndefined();
  });

  it('deactivating retires a row rather than deleting it', async () => {
    const { admin: service, repository } = admin();
    await service.setFlags('org:a', 'oai:a:2', { active: false });
    expect(repository.state.assortment).toHaveLength(2);
    expect(
      repository.state.assortment.find((item) => item.id === 'oai:a:2')?.active,
    ).toBe(false);
  });

  it('applies safe flags to an explicit organization-scoped selection', async () => {
    const { admin: service, repository } = admin();
    const updated = await service.setFlagsBulk(
      'org:a',
      ['oai:a:1', 'oai:a:2'],
      { preferred: true },
    );
    expect(updated).toHaveLength(2);
    expect(repository.state.assortment.every((item) => item.preferred)).toBe(
      true,
    );
  });

  it('rejects an empty flags patch', async () => {
    const { admin: service } = admin();
    await expect(service.setFlags('org:a', 'oai:a:2', {})).rejects.toThrow(
      BusinessAdminError,
    );
  });
});

const CSV =
  'KOD_TOW;NAZWA;CENA_NETTO\n' +
  'SWT-KODA-AN;KODA antracyt hurtowa;4,82\n' +
  'MEM-900;Membrana 150 g;12,90\n' +
  'BAD-1;Cena do ustalenia;na zapytanie\n';
const MAPPING = {
  externalKey: 'KOD_TOW',
  sourceName: 'NAZWA',
  netAmount: 'CENA_NETTO',
};

describe('CSV import', () => {
  it('previews without writing anything', async () => {
    const { admin: service, repository } = admin();
    const before = structuredClone(repository.state.assortment);
    const preview = await service.importCsv('org:a', {
      sourceLabel: 'test.csv',
      csv: CSV,
      mapping: MAPPING,
      apply: false,
    });
    expect(preview.applied).toBe(false);
    expect(preview.counts).toMatchObject({
      total: 3,
      matched: 1,
      noMatch: 2,
      invalidPrice: 1,
      create: 3,
    });
    expect(repository.state.assortment).toEqual(before);
    expect(repository.state.audits).toEqual([]);
  });

  it('applies only on an explicit second call, and records an audit', async () => {
    const { admin: service, repository } = admin();
    const applied = await service.importCsv('org:a', {
      sourceLabel: 'test.csv',
      csv: CSV,
      mapping: MAPPING,
      apply: true,
    });
    expect(applied.applied).toBe(true);
    expect(repository.state.assortment).toHaveLength(5);
    expect(repository.state.audits).toHaveLength(1);
    expect(repository.state.audits[0]).toMatchObject({
      organizationId: 'org:a',
      sourceLabel: 'test.csv',
      status: 'completed',
    });
  });

  it('is idempotent: a second identical import creates no duplicates', async () => {
    const { admin: service, repository } = admin();
    const input = {
      sourceLabel: 'test.csv',
      csv: CSV,
      mapping: MAPPING,
      apply: true,
    };
    await service.importCsv('org:a', input);
    const afterFirst = repository.state.assortment.length;
    const second = await service.importCsv('org:a', input);
    expect(repository.state.assortment).toHaveLength(afterFirst);
    expect(second.counts.create).toBe(0);
    expect(second.counts.unchanged).toBe(3);
  });

  it('writes an organization-scoped price list, never a global one', async () => {
    const { admin: service, repository } = admin();
    await service.importCsv('org:a', {
      sourceLabel: 'test.csv',
      csv: CSV,
      mapping: MAPPING,
      apply: true,
    });
    const lists = repository.state.priceLists;
    expect(lists).toHaveLength(1);
    expect(lists[0]).toMatchObject({
      organizationId: 'org:a',
      currencyCode: 'PLN',
    });
    // Only the row that matched a catalogue variant can carry a price.
    expect(repository.state.entries).toHaveLength(1);
    expect(repository.state.entries[0]).toMatchObject({
      commercialVariantId: KODA,
      netAmountMinor: 482,
    });
  });

  it('persists imported VAT and preserves it when the next CSV omits VAT', async () => {
    const { admin: service, repository, read } = admin();
    await service.importCsv('org:a', {
      sourceLabel: 'vat.csv',
      csv: 'SKU;Name;VAT\nA-DACH-002;KODA;23',
      mapping: { externalKey: 'SKU', sourceName: 'Name', vatRate: 'VAT' },
      apply: true,
    });
    expect(
      repository.state.assortment.find(
        (item) => item.externalKey === 'A-DACH-002',
      )?.vatRateBps,
    ).toBe(2300);
    await service.importCsv('org:a', {
      sourceLabel: 'later.csv',
      csv: 'SKU;Name\nA-DACH-002;KODA newer',
      mapping: { externalKey: 'SKU', sourceName: 'Name' },
      apply: true,
    });
    expect(
      repository.state.assortment.find(
        (item) => item.externalKey === 'A-DACH-002',
      )?.vatRateBps,
    ).toBe(2300);
    expect(
      (await read.pricesForVariants('org:a', [KODA])).items[0]?.vatRateBps,
    ).toBe(2300);
  });

  it('previews and applies price-only CSV by organization SKU with immutable history', async () => {
    const { admin: service, repository, read } = admin();
    const beforeCatalog = structuredClone(repository.state.catalog);
    const input = {
      csv: 'SKU;Cena netto;VAT\nA-DACH-002;4,82;23\nUNKNOWN;5,10;8',
      mapping: { externalKey: 'SKU', netAmount: 'Cena netto', vatRate: 'VAT' },
      validFrom: '2026-09-24',
    };
    const preview = await service.importPricesCsv('org:a', {
      ...input,
      apply: false,
    });
    expect(preview.counts).toMatchObject({
      changed: 1,
      unknown: 1,
      withVat: 2,
    });
    expect(repository.state.entries).toHaveLength(0);
    await service.importPricesCsv('org:a', { ...input, apply: true });
    expect(repository.state.catalog).toEqual(beforeCatalog);
    expect(
      repository.state.assortment.find(
        (item) => item.externalKey === 'A-DACH-002',
      )?.vatRateBps,
    ).toBe(2300);
    expect(
      (await read.pricesForVariants('org:a', [KODA], '2026-09-24')).items[0]
        ?.price?.netAmountMinor,
    ).toBe(482);
    await service.importPricesCsv('org:a', { ...input, apply: true });
    expect(repository.state.entries).toHaveLength(1);
    await service.importPricesCsv('org:a', {
      ...input,
      csv: 'SKU;Cena netto;VAT\nA-DACH-002;5,10;5',
      apply: true,
    });
    expect(repository.state.entries).toHaveLength(2);
    expect(
      (await read.pricesForVariants('org:a', [KODA], '2026-09-24')).items[0]
        ?.price?.netAmountMinor,
    ).toBe(510);
    expect(
      (await read.assortmentDetail('org:a', 'oai:a:2')).priceHistory.map(
        (price) => price.netAmountMinor,
      ),
    ).toEqual([510, 482]);
  });

  it('makes a same-day correction current ahead of a legacy price entry', async () => {
    const { admin: service, repository, read } = admin();
    repository.state.priceLists.push({
      id: 'legacy-list',
      organizationId: 'org:a',
      ownerLabel: 'Legacy',
      currencyCode: 'PLN',
      validFrom: '2000-01-01',
    });
    repository.state.entries.push({
      id: 'price:legacy:1',
      priceListId: 'legacy-list',
      commercialVariantId: KODA,
      saleUnit: 'piece',
      netAmountMinor: 450,
      validFrom: '2026-09-24',
    });
    await service.importPricesCsv('org:a', {
      csv: 'SKU;Cena\nA-DACH-002;4,82',
      mapping: { externalKey: 'SKU', netAmount: 'Cena' },
      validFrom: '2026-09-24',
      apply: true,
    });
    expect(
      repository.state.entries.map((entry) => entry.netAmountMinor),
    ).toEqual([450, 482]);
    expect(
      (await read.pricesForVariants('org:a', [KODA], '2026-09-24')).items[0]
        ?.price?.netAmountMinor,
    ).toBe(482);
  });

  it('keeps an unmatched row without ever calling it a technical product', async () => {
    const { admin: service, repository, read } = admin();
    await service.importCsv('org:a', {
      sourceLabel: 'test.csv',
      csv: CSV,
      mapping: MAPPING,
      apply: true,
    });
    const membrane = repository.state.assortment.find(
      (item) => item.externalKey === 'MEM-900',
    );
    expect(membrane).toBeDefined();
    expect(membrane?.commercialVariantId).toBeUndefined();
    const prices = await read.pricesForVariants(
      'org:a',
      [KODA],
      new Date().toISOString().slice(0, 10),
    );
    expect(prices.items[0]?.price).toBeDefined();
  });

  it('never overwrites an admin preferred flag on re-import', async () => {
    const { admin: service, repository } = admin();
    const input = {
      sourceLabel: 'test.csv',
      csv: CSV,
      mapping: MAPPING,
      apply: true,
    };
    await service.importCsv('org:a', input);
    const row = repository.state.assortment.find(
      (item) => item.externalKey === 'MEM-900',
    )!;
    row.preferred = true;
    await service.importCsv('org:a', input);
    expect(
      repository.state.assortment.find((item) => item.externalKey === 'MEM-900')
        ?.preferred,
    ).toBe(true);
  });

  it('rejects a mapping that omits a required column', async () => {
    const { admin: service } = admin();
    await expect(
      service.importCsv('org:a', {
        sourceLabel: 'test.csv',
        csv: CSV,
        mapping: { sourceName: 'NAZWA' },
        apply: false,
      }),
    ).rejects.toMatchObject({ code: 'business-invalid-request' });
  });

  it('rejects an unknown organization before reading the file', async () => {
    const { admin: service } = admin();
    await expect(
      service.importCsv('org:zzz', {
        sourceLabel: 'test.csv',
        csv: CSV,
        mapping: MAPPING,
        apply: true,
      }),
    ).rejects.toMatchObject({ code: 'organization-not-found' });
  });
});

describe('admin capability gate', () => {
  const local = { remoteAddress: '127.0.0.1', host: 'localhost:3001' };

  it('is disabled by default', () => {
    expect(adminDevModeEnabled({})).toBe(false);
    expect(adminWritesAllowed(local, {})).toBe(false);
  });

  it('requires both the flag and a loopback request', () => {
    const on = { BUSINESS_ADMIN_DEV_MODE: 'true' };
    expect(adminWritesAllowed(local, on)).toBe(true);
    expect(
      adminWritesAllowed({ ...local, remoteAddress: '203.0.113.7' }, on),
    ).toBe(false);
    expect(
      adminWritesAllowed({ ...local, host: 'roofcalc.example.com' }, on),
    ).toBe(false);
    expect(adminWritesAllowed({}, on)).toBe(false);
  });

  it('accepts the IPv6 loopback and its bracketed host form', () => {
    const on = { BUSINESS_ADMIN_DEV_MODE: 'true' };
    expect(
      adminWritesAllowed({ remoteAddress: '::1', host: '[::1]:3001' }, on),
    ).toBe(true);
    expect(
      adminWritesAllowed(
        { remoteAddress: '::ffff:127.0.0.1', host: '127.0.0.1:3001' },
        on,
      ),
    ).toBe(true);
  });

  it('treats any value other than the exact string "true" as off', () => {
    for (const value of ['1', 'TRUE', 'yes', ''])
      expect(
        adminWritesAllowed(local, { BUSINESS_ADMIN_DEV_MODE: value }),
      ).toBe(false);
  });
});
