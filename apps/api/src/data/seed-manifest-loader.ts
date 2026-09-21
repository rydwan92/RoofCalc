import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  canonicalJson,
  catalogImportBatchV1Schema,
} from '@cieslacalc/catalog-core';
import { priceImportBatchV1Schema } from '@cieslacalc/pricing-core';
import type { ExpectedSeed } from '../db/seed-status';
import {
  BUSINESS_SEED,
  CATALOGUE_SEED_BATCHES,
  PRICING_SEED_BATCHES,
} from './seed-manifest';

const here = dirname(fileURLToPath(import.meta.url));
const batchDirectory = resolve(here, 'import-batches');
const businessDirectory = resolve(here, 'business');
const checksum = (value: unknown) =>
  createHash('sha256').update(canonicalJson(value)).digest('hex');

/** Reads and validates every manifest entry without mutating the database. */
export async function loadExpectedSeeds(): Promise<ExpectedSeed[]> {
  const catalogue = await Promise.all(
    CATALOGUE_SEED_BATCHES.map(async (file) => {
      const batch = catalogImportBatchV1Schema.parse(
        JSON.parse(await readFile(resolve(batchDirectory, file), 'utf8')),
      );
      return {
        file,
        category: 'catalogue' as const,
        sourceId: batch.source.id,
        checksum: checksum(batch),
      };
    }),
  );
  const pricing = await Promise.all(
    PRICING_SEED_BATCHES.map(async (file) => {
      const batch = priceImportBatchV1Schema.parse(
        JSON.parse(await readFile(resolve(batchDirectory, file), 'utf8')),
      );
      return {
        file,
        category: 'pricing' as const,
        sourceId: batch.source.id,
        checksum: checksum(batch),
      };
    }),
  );
  const business = JSON.parse(
    await readFile(resolve(businessDirectory, BUSINESS_SEED.file), 'utf8'),
  ) as unknown;
  return [
    ...catalogue,
    ...pricing,
    {
      file: BUSINESS_SEED.file,
      category: 'business',
      sourceId: BUSINESS_SEED.organizationId,
      checksum: checksum(business),
    },
  ];
}
