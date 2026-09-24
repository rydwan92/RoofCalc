import { and, eq, sql } from 'drizzle-orm';
import type { CatalogDatabase } from './client';
import { catalogImportBatches } from './schema';
import { pricingImportBatches } from './pricing-schema';
import { organizationImportBatches } from './business-schema';
import {
  classifySeedStatus,
  type ObservedSeed,
  type SeedCategory,
  type SeedState,
} from './seed-status';
import {
  EXPECTED_MIGRATION_TIMES,
  EXPECTED_SEEDS,
} from '../data/readiness-manifest';

export interface SystemStatus {
  database: 'connected';
  migrations: {
    state: 'current' | 'missing' | 'outdated';
    applied: number;
    expected: number;
  };
  seeds: Record<
    SeedCategory,
    { state: SeedState; current: number; expected: number }
  >;
}

function missingTable(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ER_NO_SUCH_TABLE'
  );
}

async function orEmpty<T>(read: () => Promise<T[]>) {
  try {
    return await read();
  } catch (error) {
    if (missingTable(error)) return [] as T[];
    throw error;
  }
}

export function projectSystemStatus(
  migrationRows: readonly number[],
  observed: readonly ObservedSeed[],
): SystemStatus {
  const migrations = {
    state:
      migrationRows.length === 0
        ? ('missing' as const)
        : migrationRows.length === EXPECTED_MIGRATION_TIMES.length &&
            migrationRows.every(
              (value, index) => value === EXPECTED_MIGRATION_TIMES[index],
            )
          ? ('current' as const)
          : ('outdated' as const),
    applied: migrationRows.length,
    expected: EXPECTED_MIGRATION_TIMES.length,
  };
  const classified = classifySeedStatus(EXPECTED_SEEDS, observed);
  const categories = ['catalogue', 'pricing', 'business'] as const;
  const seeds = Object.fromEntries(
    categories.map((category) => {
      const entries = classified.filter((seed) => seed.category === category);
      const current = entries.filter((seed) => seed.state === 'current').length;
      return [
        category,
        {
          state: entries.some((seed) => seed.state === 'outdated')
            ? 'outdated'
            : current === entries.length
              ? 'current'
              : 'missing',
          current,
          expected: entries.length,
        },
      ];
    }),
  ) as SystemStatus['seeds'];
  return { database: 'connected', migrations, seeds };
}

export async function readSystemStatus(
  db: CatalogDatabase,
): Promise<SystemStatus> {
  await db.execute(sql`SELECT 1`);
  const migrationRows = await orEmpty(async () => {
    const [rows] = await db.execute(
      sql`SELECT created_at FROM __drizzle_migrations ORDER BY id`,
    );
    return (rows as unknown as Array<{ created_at: number | string }>).map(
      (row) => Number(row.created_at),
    );
  });
  const observed: ObservedSeed[] = [
    ...(
      await orEmpty(() =>
        db
          .select({
            sourceId: catalogImportBatches.sourceId,
            checksum: catalogImportBatches.checksum,
          })
          .from(catalogImportBatches)
          .where(eq(catalogImportBatches.status, 'completed')),
      )
    ).map((row) => ({ category: 'catalogue' as const, ...row })),
    ...(
      await orEmpty(() =>
        db
          .select({
            sourceId: pricingImportBatches.sourceId,
            checksum: pricingImportBatches.checksum,
          })
          .from(pricingImportBatches)
          .where(eq(pricingImportBatches.status, 'completed')),
      )
    ).map((row) => ({ category: 'pricing' as const, ...row })),
    ...(
      await orEmpty(() =>
        db
          .select({
            sourceId: organizationImportBatches.organizationId,
            checksum: organizationImportBatches.checksum,
          })
          .from(organizationImportBatches)
          .where(
            and(
              eq(
                organizationImportBatches.sourceLabel,
                'roofcalc-starter-business',
              ),
              eq(organizationImportBatches.status, 'completed'),
            ),
          ),
      )
    ).map((row) => ({ category: 'business' as const, ...row })),
  ];
  return projectSystemStatus(migrationRows, observed);
}
