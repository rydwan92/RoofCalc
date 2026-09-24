import { describe, expect, it } from 'vitest';
import {
  activeVariantIds,
  assortmentForOrganization,
  assortmentItemForVariant,
  assortmentLabel,
  assortmentState,
  assortmentSummary,
  isTechnicallyUsable,
  organizationAssortmentItemSchema,
  organizationSchema,
  sortForPicker,
  validateAssortmentUniqueness,
  type OrganizationAssortmentItem,
} from './index';

function item(
  overrides: Partial<OrganizationAssortmentItem> &
    Pick<OrganizationAssortmentItem, 'id' | 'organizationId' | 'externalKey'>,
): OrganizationAssortmentItem {
  return {
    sourceName: `Produkt ${overrides.externalKey}`,
    active: true,
    preferred: false,
    ...overrides,
  };
}

describe('organization schema', () => {
  it('accepts a minimal organization and rejects a bad slug or currency', () => {
    expect(
      organizationSchema.parse({
        id: 'org:demo',
        slug: 'hurtownia-demo',
        name: 'Hurtownia Demo',
        currencyCode: 'PLN',
        active: true,
      }).slug,
    ).toBe('hurtownia-demo');
    for (const bad of [
      { slug: 'Hurtownia Demo' },
      { currencyCode: 'zl' },
      { currencyCode: 'PLNX' },
    ])
      expect(
        organizationSchema.safeParse({
          id: 'org:demo',
          slug: 'hurtownia-demo',
          name: 'Hurtownia Demo',
          currencyCode: 'PLN',
          active: true,
          ...bad,
        }).success,
      ).toBe(false);
  });

  it('keeps commercialVariantId optional so an unmatched row survives', () => {
    const unmatched = organizationAssortmentItemSchema.parse({
      id: 'oai:1',
      organizationId: 'org:demo',
      externalKey: 'DACH-00999',
      sourceName: 'Membrana X 150',
      active: true,
      preferred: false,
    });
    expect(unmatched.commercialVariantId).toBeUndefined();
    expect(assortmentState(unmatched)).toBe('unmatched');
  });

  it('rejects an unknown field rather than silently dropping it', () => {
    expect(
      organizationAssortmentItemSchema.safeParse({
        id: 'oai:1',
        organizationId: 'org:demo',
        externalKey: 'A',
        sourceName: 'A',
        active: true,
        preferred: false,
        netAmountMinor: 100,
      }).success,
    ).toBe(false);
  });
});

describe('assortment state', () => {
  it('names the three commercial states and never calls unmatched usable', () => {
    const matched = item({
      id: '1',
      organizationId: 'org:a',
      externalKey: 'A',
      commercialVariantId: 'variant:x',
    });
    const unmatched = item({
      id: '2',
      organizationId: 'org:a',
      externalKey: 'B',
    });
    const inactive = item({
      id: '3',
      organizationId: 'org:a',
      externalKey: 'C',
      commercialVariantId: 'variant:y',
      active: false,
    });
    expect(assortmentState(matched)).toBe('matched');
    expect(assortmentState(unmatched)).toBe('unmatched');
    expect(assortmentState(inactive)).toBe('inactive');
    expect(isTechnicallyUsable(matched)).toBe(true);
    expect(isTechnicallyUsable(unmatched)).toBe(false);
    expect(isTechnicallyUsable(inactive)).toBe(false);
  });

  it('inactive outranks matched, so a retired mapped row is not offered', () => {
    expect(
      assortmentState(
        item({
          id: '1',
          organizationId: 'org:a',
          externalKey: 'A',
          commercialVariantId: 'variant:x',
          active: false,
        }),
      ),
    ).toBe('inactive');
  });
});

describe('tenant isolation in the pure layer', () => {
  const rows = [
    item({
      id: 'a1',
      organizationId: 'org:a',
      externalKey: 'A-001',
      commercialVariantId: 'variant:shared',
    }),
    item({
      id: 'b1',
      organizationId: 'org:b',
      externalKey: 'B-777',
      commercialVariantId: 'variant:shared',
    }),
  ];

  it('never returns another organization rows for the same variant', () => {
    expect(
      assortmentForOrganization(rows, 'org:a').map((row) => row.id),
    ).toEqual(['a1']);
    expect(
      assortmentItemForVariant(rows, 'org:a', 'variant:shared')?.externalKey,
    ).toBe('A-001');
    expect(
      assortmentItemForVariant(rows, 'org:b', 'variant:shared')?.externalKey,
    ).toBe('B-777');
    expect(
      assortmentItemForVariant(rows, 'org:c', 'variant:shared'),
    ).toBeUndefined();
  });

  it('scopes the active variant set per organization', () => {
    expect([...activeVariantIds(rows, 'org:a')]).toEqual(['variant:shared']);
    expect([...activeVariantIds(rows, 'org:c')]).toEqual([]);
  });

  it('prefers the active row when a retired row for the same variant exists', () => {
    const history = [
      item({
        id: 'old',
        organizationId: 'org:a',
        externalKey: 'A-OLD',
        commercialVariantId: 'variant:x',
        active: false,
      }),
      item({
        id: 'new',
        organizationId: 'org:a',
        externalKey: 'A-NEW',
        commercialVariantId: 'variant:x',
      }),
    ];
    expect(assortmentItemForVariant(history, 'org:a', 'variant:x')?.id).toBe(
      'new',
    );
  });
});

describe('picker ordering and labels', () => {
  it('sorts preferred first, then by display name', () => {
    const rows = [
      item({
        id: '1',
        organizationId: 'o',
        externalKey: 'Z',
        sourceName: 'Zebra',
      }),
      item({
        id: '2',
        organizationId: 'o',
        externalKey: 'A',
        sourceName: 'Alfa',
      }),
      item({
        id: '3',
        organizationId: 'o',
        externalKey: 'P',
        sourceName: 'Omega',
        preferred: true,
      }),
    ];
    expect(sortForPicker(rows).map((row) => row.sourceName)).toEqual([
      'Omega',
      'Alfa',
      'Zebra',
    ]);
  });

  it('uses the operator override when one is set', () => {
    expect(
      assortmentLabel(
        item({
          id: '1',
          organizationId: 'o',
          externalKey: 'A',
          sourceName: 'KODA ANTRACYT ANGOBA',
          displayNameOverride: 'KODA antracyt',
        }),
      ),
    ).toBe('KODA antracyt');
  });
});

describe('uniqueness and dashboard counts', () => {
  it('reports a duplicate external key and a second active row per variant', () => {
    const issues = validateAssortmentUniqueness([
      item({
        id: '1',
        organizationId: 'o',
        externalKey: 'A',
        commercialVariantId: 'v1',
      }),
      item({
        id: '2',
        organizationId: 'o',
        externalKey: 'A',
        commercialVariantId: 'v2',
      }),
      item({
        id: '3',
        organizationId: 'o',
        externalKey: 'B',
        commercialVariantId: 'v1',
      }),
    ]);
    expect(issues.map((issue) => issue.code)).toEqual([
      'duplicate-external-key',
      'duplicate-active-variant',
    ]);
  });

  it('allows unlimited inactive history for the same variant', () => {
    expect(
      validateAssortmentUniqueness([
        item({
          id: '1',
          organizationId: 'o',
          externalKey: 'A',
          commercialVariantId: 'v1',
          active: false,
        }),
        item({
          id: '2',
          organizationId: 'o',
          externalKey: 'B',
          commercialVariantId: 'v1',
          active: false,
        }),
        item({
          id: '3',
          organizationId: 'o',
          externalKey: 'C',
          commercialVariantId: 'v1',
        }),
      ]),
    ).toEqual([]);
  });

  it('counts every row into exactly one state', () => {
    const rows = [
      item({
        id: '1',
        organizationId: 'o',
        externalKey: 'A',
        commercialVariantId: 'v1',
      }),
      item({ id: '2', organizationId: 'o', externalKey: 'B' }),
      item({
        id: '3',
        organizationId: 'o',
        externalKey: 'C',
        commercialVariantId: 'v3',
        active: false,
      }),
      item({ id: '4', organizationId: 'other', externalKey: 'D' }),
    ];
    const summary = assortmentSummary(rows, 'o', (row) => row.id === '1');
    expect(summary).toEqual({
      total: 3,
      matched: 1,
      unmatched: 1,
      inactive: 1,
      withoutPrice: 1,
      withoutVat: 1,
    });
    expect(summary.matched + summary.unmatched + summary.inactive).toBe(
      summary.total,
    );
  });
});
