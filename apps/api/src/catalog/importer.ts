import { createHash, randomUUID } from 'node:crypto';
import {
  canonicalJson,
  catalogImportBatchV1Schema,
  compareTechnicalRevision,
  type CatalogImportBatchV1,
  type CommercialVariant,
  type Manufacturer,
  type TechnicalProductFamily,
  type TechnicalProductRevision,
} from '@cieslacalc/catalog-core';
import type { CatalogImportRepository, CatalogImportState } from './repository';

export interface CatalogImportCounts {
  total: number;
  new: number;
  unchanged: number;
  updated: number;
  conflicts: number;
}

export interface CatalogImportConflict {
  entity: 'manufacturer' | 'product' | 'revision' | 'variant';
  id: string;
  code:
    | 'immutable-manufacturer-reference'
    | 'immutable-covering-kind'
    | 'immutable-technical-revision'
    | 'immutable-product-reference';
}

export interface CatalogImportReport {
  batchId: string;
  checksum: string;
  dryRun: boolean;
  status: 'valid' | 'applied' | 'conflict';
  manufacturers: CatalogImportCounts;
  products: CatalogImportCounts;
  revisions: CatalogImportCounts;
  variants: CatalogImportCounts;
  conflicts: CatalogImportConflict[];
}

const emptyCounts = (total: number): CatalogImportCounts => ({
  total,
  new: 0,
  unchanged: 0,
  updated: 0,
  conflicts: 0,
});

function equal(left: unknown, right: unknown) {
  return canonicalJson(left) === canonicalJson(right);
}

function planMutable<T extends { id: string }>(
  incoming: T[],
  existing: T[],
  counts: CatalogImportCounts,
  conflict: (
    oldItem: T,
    nextItem: T,
  ) => CatalogImportConflict['code'] | undefined,
  entity: CatalogImportConflict['entity'],
  conflicts: CatalogImportConflict[],
) {
  const byId = new Map(existing.map((item) => [item.id, item]));
  const writes: T[] = [];
  for (const item of incoming) {
    const oldItem = byId.get(item.id);
    if (!oldItem) {
      counts.new++;
      writes.push(item);
    } else if (equal(oldItem, item)) counts.unchanged++;
    else {
      const code = conflict(oldItem, item);
      if (code) {
        counts.conflicts++;
        conflicts.push({ entity, id: item.id, code });
      } else {
        counts.updated++;
        writes.push(item);
      }
    }
  }
  return writes;
}

function createPlan(batch: CatalogImportBatchV1, existing: CatalogImportState) {
  const conflicts: CatalogImportConflict[] = [];
  const manufacturers = emptyCounts(batch.manufacturers.length);
  const products = emptyCounts(batch.products.length);
  const revisions = emptyCounts(batch.revisions.length);
  const variants = emptyCounts(batch.variants.length);
  const manufacturerWrites = planMutable<Manufacturer>(
    batch.manufacturers,
    existing.manufacturers,
    manufacturers,
    () => undefined,
    'manufacturer',
    conflicts,
  );
  const productWrites = planMutable<TechnicalProductFamily>(
    batch.products,
    existing.products,
    products,
    (oldItem, nextItem) =>
      oldItem.manufacturerId !== nextItem.manufacturerId
        ? 'immutable-manufacturer-reference'
        : oldItem.coveringKind !== nextItem.coveringKind
          ? 'immutable-covering-kind'
          : undefined,
    'product',
    conflicts,
  );
  const existingRevisions = new Map(
    existing.revisions.map((item) => [item.id, item]),
  );
  const revisionWrites: TechnicalProductRevision[] = [];
  for (const revision of batch.revisions) {
    const result = compareTechnicalRevision(
      existingRevisions.get(revision.id),
      revision,
    );
    if (result === 'new') {
      revisions.new++;
      revisionWrites.push(revision);
    } else if (result === 'unchanged') revisions.unchanged++;
    else {
      revisions.conflicts++;
      conflicts.push({
        entity: 'revision',
        id: revision.id,
        code: 'immutable-technical-revision',
      });
    }
  }
  const variantWrites = planMutable<CommercialVariant>(
    batch.variants,
    existing.variants,
    variants,
    (oldItem, nextItem) =>
      oldItem.productId !== nextItem.productId
        ? 'immutable-product-reference'
        : undefined,
    'variant',
    conflicts,
  );
  return {
    conflicts,
    counts: { manufacturers, products, revisions, variants },
    writes: {
      manufacturers: manufacturerWrites,
      products: productWrites,
      revisions: revisionWrites,
      variants: variantWrites,
    },
  };
}

export class CatalogImporter {
  constructor(private readonly repository: CatalogImportRepository) {}

  async import(
    input: unknown,
    options: { apply?: boolean } = {},
  ): Promise<CatalogImportReport> {
    // Full schema and cross-reference validation always precede repository writes.
    const batch = catalogImportBatchV1Schema.parse(input);
    const checksum = createHash('sha256')
      .update(canonicalJson(batch))
      .digest('hex');
    const batchId = randomUUID();
    const state = await this.repository.readImportState({
      manufacturerIds: batch.manufacturers.map((item) => item.id),
      productIds: batch.products.map((item) => item.id),
      revisionIds: batch.revisions.map((item) => item.id),
      variantIds: batch.variants.map((item) => item.id),
    });
    const plan = createPlan(batch, state);
    const base = {
      batchId,
      checksum,
      dryRun: !options.apply,
      ...plan.counts,
      conflicts: plan.conflicts,
    };
    if (plan.conflicts.length) return { ...base, status: 'conflict' as const };
    if (!options.apply) return { ...base, status: 'valid' as const };
    const startedAt = new Date().toISOString();
    await this.repository.applyImport({
      ...plan.writes,
      audit: {
        id: batchId,
        sourceId: batch.source.id,
        sourceLabel: batch.source.label,
        checksum,
        startedAt,
        completedAt: new Date().toISOString(),
        status: 'completed',
        counts: plan.counts,
      },
    });
    return { ...base, dryRun: false, status: 'applied' };
  }
}
