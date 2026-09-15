import { createCatalogDatabase } from '../db/client';
import { DrizzleCatalogRepository } from '../db/catalog-repository';
import { DrizzlePricingRepository } from '../db/pricing-repository';

/**
 * Only the kinds `seed-all.ts` actually seeds today — `modular-sheet` and
 * `standing-seam` are valid `CatalogProductKind` values with zero seeded
 * products, so checking the full kind enum here would flag a false gap.
 */
const SEEDED_KINDS = ['roof-tile', 'membrane', 'timber-stock'] as const;

async function main() {
  const connection = createCatalogDatabase();
  if (!connection)
    throw new Error('DATABASE_URL is required for the smoke check.');
  const problems: string[] = [];
  const counts: Record<string, number> = {};
  try {
    const catalog = new DrizzleCatalogRepository(connection.db);
    const pricing = new DrizzlePricingRepository(connection.db);

    const manufacturers = await catalog.listManufacturers();
    counts.manufacturers = manufacturers.length;
    if (!manufacturers.length) problems.push('no manufacturers seeded');

    for (const kind of SEEDED_KINDS) {
      const { items } = await catalog.searchProducts({
        kind,
        limit: 50,
        offset: 0,
      });
      counts[kind] = items.length;
      if (!items.length) problems.push(`no ${kind} products seeded`);
    }

    // One end-to-end round-trip through the canonical schema, for the
    // corrected V35 KODA revision specifically (not just a count).
    const koda = await catalog.getProduct('product:swissporton:koda');
    if (!koda) problems.push('product:swissporton:koda missing');
    else if (koda.currentRevision.technicalSpec.kind !== 'roof-tile')
      problems.push('product:swissporton:koda technical spec kind mismatch');

    const timberVariantId = 'variant:timber:c24-45x145x4000-treated:standard';
    const priced = await pricing.entriesForVariants([timberVariantId]);
    counts.timberPriceEntries = priced.length;
    if (!priced.length) problems.push(`no price entry for ${timberVariantId}`);

    const result = { ok: problems.length === 0, counts, problems };
    console.log(JSON.stringify(result, null, 2));
    if (problems.length) process.exitCode = 1;
  } finally {
    await connection.close();
  }
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      error: {
        code: 'smoke-check-failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    }),
  );
  process.exitCode = 1;
});
