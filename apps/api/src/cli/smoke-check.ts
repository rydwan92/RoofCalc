import { createCatalogDatabase } from '../db/client';
import { DrizzleCatalogRepository } from '../db/catalog-repository';
import { DrizzlePricingRepository } from '../db/pricing-repository';

/** Every currently seeded product kind must be queryable after bootstrap. */
const SEEDED_KINDS = [
  'roof-tile',
  'modular-sheet',
  'standing-seam',
  'membrane',
  'timber-stock',
  'roof-tile-accessory',
  'roof-drainage-component',
] as const;

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
    // V50: a tile variant carries its source-backed packaging, and the
    // SIMPLA ridge tile round-trips with its declared compatibility.
    else if (
      !koda.variants.some(
        (variant) =>
          variant.metadata?.packaging?.piecesPerPack === 4 &&
          variant.metadata.packaging.piecesPerPallet === 168,
      )
    )
      problems.push('KODA variants carry no packaging');
    const ridge = await catalog.getProduct('product:swissporton:gasior-ps');
    const ridgeSpec = ridge?.currentRevision.technicalSpec;
    if (
      ridgeSpec?.kind !== 'roof-tile-accessory' ||
      !ridgeSpec.compatibleProductIds.includes('product:swissporton:simpla')
    )
      problems.push('SIMPLA ridge accessory missing or not compatible');

    // V51: a drainage component round-trips with its explicit system key.
    const hook = await catalog.getProduct('product:galeco:stal2-hak-doczolowy');
    const hookSpec = hook?.currentRevision.technicalSpec;
    if (
      hookSpec?.kind !== 'roof-drainage-component' ||
      hookSpec.systemKey !== 'galeco-stal2-125-80' ||
      hookSpec.maxSpacingMm !== 600
    )
      problems.push('Galeco STAL2 hook missing or without source spacing');

    const timberVariantId = 'variant:timber:c24-45x145x4000-treated:standard';
    const priced = await pricing.entriesForVariants([timberVariantId]);
    counts.timberPriceEntries = priced.length;
    if (!priced.length) problems.push(`no price entry for ${timberVariantId}`);

    // V49: a batten product round-trips with its source-declared application,
    // and the one dated BAT batten price is present.
    const batten = await catalog.getProduct(
      'product:timber:bat-lata-40x60x4000',
    );
    const battenSpec = batten?.currentRevision.technicalSpec;
    if (
      battenSpec?.kind !== 'timber-stock' ||
      !battenSpec.declaredApplications?.includes('batten')
    )
      problems.push(
        'product:timber:bat-lata-40x60x4000 missing or unclassified',
      );
    const battenPrices = await pricing.entriesForVariants([
      'variant:timber:bat-lata-40x60x4000:standard',
    ]);
    counts.battenPriceEntries = battenPrices.length;
    if (!battenPrices.some((entry) => entry.netAmountMinor === 1665))
      problems.push('expected dated BAT batten price missing');

    const ruukkiVariantId = 'variant:ruukki:finnera:qc50-pural-bt-mat';
    const ruukkiPrices = await pricing.entriesForVariants([ruukkiVariantId]);
    counts.ruukkiPriceEntries = ruukkiPrices.length;
    if (!ruukkiPrices.some((entry) => entry.netAmountMinor === 6979))
      problems.push(
        `expected dated Ruukki price missing for ${ruukkiVariantId}`,
      );

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
