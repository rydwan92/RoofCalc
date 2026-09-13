import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  catalogImportBatchV1Schema,
  createCatalogProductSelection,
} from '@cieslacalc/catalog-core';
import {
  coveringAssignmentSpecSchema,
  createCutToLengthSheetQuantitySource,
  resolveCutToLengthSheetLayout,
} from '@cieslacalc/covering-core';
import { createApp } from '../app';
import { CatalogImporter } from './importer';
import { MemoryCatalogRepository } from './memory-repository';
import { CatalogService } from './service';

const fixture = catalogImportBatchV1Schema.parse(
  JSON.parse(
    readFileSync(
      new URL('../data/demo-catalog.v1.json', import.meta.url),
      'utf8',
    ),
  ),
);
const productId = 'product:demo-roof:cut-350';
const revisionId = 'revision:demo-roof:cut-350:2026-01';

describe('DEMO cut-to-length catalogue path', () => {
  it('imports, serves, snapshots and calculates the same geometry offline and manually', async () => {
    const repository = new MemoryCatalogRepository();
    const importer = new CatalogImporter(repository);
    expect((await importer.import(fixture, { apply: true })).status).toBe(
      'applied',
    );
    const again = await importer.import(fixture, { apply: true });
    expect(again.revisions).toMatchObject({
      new: 0,
      unchanged: fixture.revisions.length,
    });

    const app = createApp(undefined, new CatalogService(repository));
    const search = await request(app).get(
      '/api/catalog/products?kind=modular-sheet&q=Cut+350',
    );
    expect(search.status).toBe(200);
    expect(search.body.items.map((item: { id: string }) => item.id)).toEqual([
      productId,
    ]);
    const detail = await request(app).get(`/api/catalog/products/${productId}`);
    const exact = await request(app).get(
      `/api/catalog/products/${productId}/revisions/${revisionId}`,
    );
    expect(exact.status).toBe(200);
    const selection = createCatalogProductSelection({
      manufacturer: exact.body.item.manufacturer,
      product: exact.body.item.product,
      revision: exact.body.item.revision,
      variant: detail.body.item.variants[0],
    });
    expect(selection.catalogRef?.technicalRevisionId).toBe(revisionId);
    expect(selection.displaySnapshot?.revisionCode).toBe('2026-01');
    const assignment = coveringAssignmentSpecSchema.parse({
      id: 'covering:test',
      roofPlaneIds: ['opaque-plane-81'],
      product: selection,
      layoutIntent: {
        kind: 'modular-sheet-cut-to-length',
        horizontalAlignment: 'from-u-min',
      },
    });
    const calculate = (stored: typeof assignment) => {
      const spec = stored.product.technicalSpecSnapshot;
      if (
        spec.kind !== 'modular-sheet' ||
        spec.lengthModel.kind !== 'cut-to-length'
      )
        throw new Error('wrong fixture');
      const intent = stored.layoutIntent;
      if (intent?.kind !== 'modular-sheet-cut-to-length')
        throw new Error('wrong intent');
      return resolveCutToLengthSheetLayout({
        assignmentId: stored.id,
        roofPlaneIds: stored.roofPlaneIds,
        roofSurfaceGeometry: [
          {
            roofPlaneId: 'opaque-plane-81',
            pitchDeg: 35,
            netAreaMm2: 2_200_000,
            localPolygon: [
              { uMm: 0, vMm: 0 },
              { uMm: 2200, vMm: 0 },
              { uMm: 2200, vMm: 1000 },
              { uMm: 0, vMm: 1000 },
            ],
          },
        ],
        openings: [],
        productSpec: { ...spec, lengthModel: spec.lengthModel },
        layoutIntent: intent,
      });
    };
    const layout = calculate(assignment);
    expect(layout.status).toBe('resolved');
    expect(layout.physicalRunCount).toBe(2);
    expect(createCutToLengthSheetQuantitySource({ layout })?.quantity).toBe(2);
    const reopened = coveringAssignmentSpecSchema.parse(
      JSON.parse(JSON.stringify(assignment)),
    );
    const manual = coveringAssignmentSpecSchema.parse({
      ...assignment,
      product: { technicalSpecSnapshot: selection.technicalSpecSnapshot },
    });
    expect(calculate(reopened)).toEqual(layout);
    expect(calculate(manual)).toEqual(layout);
    expect(
      (await request(createApp()).get('/api/catalog/products')).status,
    ).toBe(503);
    expect(calculate(reopened)).toEqual(layout);
  });

  it('preserves immutable revisions and accepts a new valid revision', async () => {
    const repository = new MemoryCatalogRepository();
    const importer = new CatalogImporter(repository);
    await importer.import(fixture, { apply: true });
    const changed = structuredClone(fixture);
    const revision = changed.revisions.find((item) => item.id === revisionId)!;
    if (revision.technicalSpec.kind !== 'modular-sheet')
      throw new Error('wrong fixture');
    revision.technicalSpec.effectiveWidthMm += 1;
    expect((await importer.import(changed, { apply: true })).status).toBe(
      'conflict',
    );
    expect(
      (await repository.getRevision(productId, revisionId))?.revision
        .technicalSpec,
    ).toEqual(
      fixture.revisions.find((item) => item.id === revisionId)?.technicalSpec,
    );
    revision.id = 'revision:demo-roof:cut-350:2026-02';
    revision.revisionCode = '2026-02';
    expect((await importer.import(changed, { apply: true })).status).toBe(
      'applied',
    );
    expect(
      (await repository.getRevision(productId, revision.id))?.revision.id,
    ).toBe(revision.id);
  });
});
