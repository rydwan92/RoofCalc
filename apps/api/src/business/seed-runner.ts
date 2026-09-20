import type { OrganizationAssortmentItem } from '@cieslacalc/business-core';
import type { PriceListEntry } from '@cieslacalc/pricing-core';
import type {
  BusinessAdminRepository,
  BusinessCatalogReader,
} from './repository';
import type { ResolvedBusinessSeed } from './seed';

export interface BusinessSeedReport {
  organizationId: string;
  organizationName: string;
  counts: ResolvedBusinessSeed['counts'];
  /** Rows whose declared variant is not in the catalogue on this database. */
  droppedVariantReferences: string[];
  pricesWritten: number;
}

/**
 * Applies a resolved demo seed. Separated from the CLI so it is testable
 * without a database and without `process.argv`.
 *
 * One safety behaviour worth naming: a row referencing a commercial variant
 * this database does not have is imported **unmatched** rather than skipped or
 * force-linked. A foreign key would reject the link anyway, and silently
 * dropping the row would under-report the wholesaler's own assortment — the
 * same reasoning that makes `commercial_variant_id` nullable in the first
 * place (§6, §7).
 */
export async function seedBusinessOrganization(
  admin: BusinessAdminRepository,
  catalog: BusinessCatalogReader,
  seed: ResolvedBusinessSeed,
  options: { apply: boolean },
): Promise<BusinessSeedReport> {
  const declared = [
    ...new Set(
      seed.assortment.flatMap((item) =>
        item.commercialVariantId ? [item.commercialVariantId] : [],
      ),
    ),
  ];
  const known = new Set(
    (await catalog.factsForVariants(declared)).map((facts) => facts.variantId),
  );
  const dropped = declared.filter((variantId) => !known.has(variantId));
  const assortment: OrganizationAssortmentItem[] = seed.assortment.map(
    (item) => {
      if (!item.commercialVariantId || known.has(item.commercialVariantId))
        return item;
      // The declared variant is absent here: keep the row, drop the link.
      const withoutLink: OrganizationAssortmentItem = { ...item };
      delete withoutLink.commercialVariantId;
      return withoutLink;
    },
  );
  const entries: PriceListEntry[] = seed.entries.filter((entry) =>
    known.has(entry.commercialVariantId),
  );

  if (options.apply) {
    await admin.upsertOrganization(seed.organization);
    await admin.upsertAssortmentItems(seed.organization.id, assortment);
    if (entries.length)
      await admin.upsertOrganizationPrices({
        priceList: seed.priceList,
        entries,
      });
  }

  return {
    organizationId: seed.organization.id,
    organizationName: seed.organization.name,
    counts: {
      ...seed.counts,
      matched: assortment.filter(
        (item) => item.active && item.commercialVariantId,
      ).length,
      unmatched: assortment.filter(
        (item) => item.active && !item.commercialVariantId,
      ).length,
      prices: entries.length,
    },
    droppedVariantReferences: dropped,
    pricesWritten: options.apply ? entries.length : 0,
  };
}
