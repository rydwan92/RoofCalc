import { describe, expect, it } from 'vitest';
import request from 'supertest';
import type { CatalogImportBatchV1 } from '@cieslacalc/catalog-core';
import { createApp } from '../app';
import { MemoryCatalogRepository } from './memory-repository';
import { CatalogService } from './service';

const seed: CatalogImportBatchV1 = {
  schemaVersion: 1,
  source: { id: 'test', label: 'TEST' },
  manufacturers: [
    { id: 'm:a', slug: 'maker-a', name: 'Maker A', active: true },
    { id: 'm:b', slug: 'maker-b', name: 'Maker B', active: true },
  ],
  products: [
    {
      id: 'p:alpha',
      manufacturerId: 'm:a',
      slug: 'alpha',
      name: 'Alpha Tile',
      coveringKind: 'roof-tile',
      active: true,
    },
    {
      id: 'p:beta',
      manufacturerId: 'm:b',
      slug: 'beta',
      name: 'Beta Sheet',
      coveringKind: 'modular-sheet',
      active: true,
    },
    {
      id: 'p:gamma',
      manufacturerId: 'm:a',
      slug: 'gamma',
      name: 'Gamma Seam',
      coveringKind: 'standing-seam',
      active: true,
    },
  ],
  revisions: [
    {
      id: 'r:alpha:1',
      productId: 'p:alpha',
      revisionCode: '1',
      technicalSpec: {
        schemaVersion: 1,
        kind: 'roof-tile',
        installationModes: [
          {
            id: 'standard',
            coverWidthMm: 300,
            gaugeRangeMm: { min: 320, max: 360 },
            minPitchDeg: 20,
            coursePattern: {
              layers: [{ id: 'base', horizontalOffsetFraction: 0 }],
              battenRowOffsetCycle: [0],
            },
          },
        ],
      },
    },
    {
      id: 'r:beta:1',
      productId: 'p:beta',
      revisionCode: '1',
      technicalSpec: {
        schemaVersion: 1,
        kind: 'modular-sheet',
        effectiveWidthMm: 1100,
        lengthModel: { kind: 'fixed-sheet', effectiveLengthMm: 700 },
        moduleLengthMm: 350,
      },
    },
    {
      id: 'r:gamma:1',
      productId: 'p:gamma',
      revisionCode: '1',
      technicalSpec: {
        schemaVersion: 1,
        kind: 'standing-seam',
        installationModes: [{ id: 'standard', effectiveWidthMm: 500 }],
        minPanelLengthMm: 500,
        maxPanelLengthMm: 8000,
        seamHeightMm: 25,
      },
    },
  ],
  variants: [
    {
      id: 'v:alpha:red',
      productId: 'p:alpha',
      name: 'Red',
      active: true,
    },
  ],
};

const app = () =>
  createApp(undefined, new CatalogService(new MemoryCatalogRepository(seed)));

/**
 * V35: proves `membrane`/`timber-stock` round-trip through the same
 * search→detail→revision path as `roof-tile`, and that no kind leaks into
 * another's filtered results — a separate seed so it never perturbs the
 * roof-tile/modular-sheet/standing-seam assertions above (ordering, counts).
 */
const multiKindSeed: CatalogImportBatchV1 = {
  ...seed,
  products: [
    ...seed.products,
    {
      id: 'p:delta',
      manufacturerId: 'm:b',
      slug: 'delta',
      name: 'Delta Membrane',
      coveringKind: 'membrane',
      active: true,
    },
    {
      id: 'p:epsilon',
      manufacturerId: 'm:a',
      slug: 'epsilon',
      name: 'Epsilon Timber',
      coveringKind: 'timber-stock',
      active: true,
    },
  ],
  revisions: [
    ...seed.revisions,
    {
      id: 'r:delta:1',
      productId: 'p:delta',
      revisionCode: '1',
      technicalSpec: {
        schemaVersion: 1,
        kind: 'membrane',
        rollWidthMm: 1500,
        rollLengthMm: 50_000,
        minimumOverlapMm: 100,
        material: 'synthetic',
        salesUnit: 'roll',
      },
    },
    {
      id: 'r:epsilon:1',
      productId: 'p:epsilon',
      revisionCode: '1',
      technicalSpec: {
        schemaVersion: 1,
        kind: 'timber-stock',
        widthMm: 45,
        depthMm: 145,
        lengthMm: 4000,
        strengthClass: 'C24',
        salesUnit: 'piece',
      },
    },
  ],
};
const multiKindApp = () =>
  createApp(
    undefined,
    new CatalogService(new MemoryCatalogRepository(multiKindSeed)),
  );

describe('catalogue read API', () => {
  it('lists manufacturers and searches by query/kind/manufacturer', async () => {
    const manufacturers = await request(app()).get(
      '/api/catalog/manufacturers',
    );
    expect(manufacturers.status).toBe(200);
    expect(manufacturers.body.items).toHaveLength(2);

    const search = await request(app()).get('/api/catalog/products?q=maker+a');
    expect(search.status).toBe(200);
    expect(search.body.items.map((item: { id: string }) => item.id)).toEqual([
      'p:alpha',
      'p:gamma',
    ]);
    const filtered = await request(app()).get(
      '/api/catalog/products?kind=roof-tile&manufacturerId=m:a',
    );
    expect(filtered.body.items).toHaveLength(1);
    expect(filtered.body.items[0]).toMatchObject({
      id: 'p:alpha',
      currentRevisionId: 'r:alpha:1',
      variantCount: 1,
      technicalPreview: { effectiveWidthMm: 300, minPitchDeg: 20 },
    });
  });

  it('uses deterministic bounded cursor pagination', async () => {
    const first = await request(app()).get('/api/catalog/products?limit=1');
    expect(first.body.items[0].id).toBe('p:alpha');
    expect(first.body.nextCursor).toBeTypeOf('string');
    const second = await request(app()).get(
      `/api/catalog/products?limit=1&cursor=${first.body.nextCursor}`,
    );
    expect(second.body.items[0].id).toBe('p:beta');
  });

  it('returns full product/revision detail and stable missing codes', async () => {
    const product = await request(app()).get('/api/catalog/products/p:alpha');
    expect(product.status).toBe(200);
    expect(product.body.item.currentRevision.technicalSpec.kind).toBe(
      'roof-tile',
    );
    expect(product.body.item.variants).toHaveLength(1);
    const revision = await request(app()).get(
      '/api/catalog/products/p:alpha/revisions/r:alpha:1',
    );
    expect(revision.status).toBe(200);
    expect(revision.body.item.revision.id).toBe('r:alpha:1');
    const missing = await request(app()).get('/api/catalog/products/p:missing');
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({
      error: { code: 'catalog-product-not-found' },
    });
  });

  it('rejects invalid queries and returns controlled unavailable state', async () => {
    const invalid = await request(app()).get('/api/catalog/products?limit=500');
    expect(invalid.status).toBe(400);
    expect(invalid.body).toEqual({
      error: { code: 'catalog-invalid-request' },
    });
    const unavailable = await request(createApp()).get('/api/catalog/products');
    expect(unavailable.status).toBe(503);
    expect(unavailable.body).toEqual({
      error: { code: 'catalog-unavailable' },
    });
  });

  it('exposes no anonymous catalogue mutation route', async () => {
    const response = await request(app())
      .post('/api/catalog/products')
      .send({ name: 'Injected product' });
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: { code: 'not-found' } });
  });

  it('round-trips a membrane product through search→detail→revision, exactly like roof-tile', async () => {
    const search = await request(multiKindApp()).get(
      '/api/catalog/products?kind=membrane',
    );
    expect(search.status).toBe(200);
    expect(search.body.items.map((item: { id: string }) => item.id)).toEqual([
      'p:delta',
    ]);
    expect(search.body.items[0].technicalPreview).toMatchObject({
      rollWidthMm: 1500,
      rollLengthMm: 50_000,
      minimumOverlapMm: 100,
    });
    const product = await request(multiKindApp()).get(
      '/api/catalog/products/p:delta',
    );
    expect(product.status).toBe(200);
    expect(product.body.item.currentRevision.technicalSpec.kind).toBe(
      'membrane',
    );
    const revision = await request(multiKindApp()).get(
      '/api/catalog/products/p:delta/revisions/r:delta:1',
    );
    expect(revision.status).toBe(200);
    expect(revision.body.item.revision.id).toBe('r:delta:1');
  });

  it('round-trips a timber-stock product through search→detail→revision, exactly like roof-tile', async () => {
    const search = await request(multiKindApp()).get(
      '/api/catalog/products?kind=timber-stock',
    );
    expect(search.status).toBe(200);
    expect(search.body.items.map((item: { id: string }) => item.id)).toEqual([
      'p:epsilon',
    ]);
    expect(search.body.items[0].technicalPreview).toMatchObject({
      sectionWidthMm: 45,
      sectionDepthMm: 145,
      lengthMm: 4000,
      strengthClass: 'C24',
    });
    const product = await request(multiKindApp()).get(
      '/api/catalog/products/p:epsilon',
    );
    expect(product.status).toBe(200);
    expect(product.body.item.currentRevision.technicalSpec.kind).toBe(
      'timber-stock',
    );
    const revision = await request(multiKindApp()).get(
      '/api/catalog/products/p:epsilon/revisions/r:epsilon:1',
    );
    expect(revision.status).toBe(200);
    expect(revision.body.item.revision.id).toBe('r:epsilon:1');
  });

  it('never leaks a membrane or timber-stock product into another kind filter', async () => {
    const tileOnly = await request(multiKindApp()).get(
      '/api/catalog/products?kind=roof-tile',
    );
    const tileIds = tileOnly.body.items.map((item: { id: string }) => item.id);
    expect(tileIds).not.toContain('p:delta');
    expect(tileIds).not.toContain('p:epsilon');

    const membraneOnly = await request(multiKindApp()).get(
      '/api/catalog/products?kind=membrane',
    );
    expect(
      membraneOnly.body.items.map((item: { id: string }) => item.id),
    ).toEqual(['p:delta']);

    const timberOnly = await request(multiKindApp()).get(
      '/api/catalog/products?kind=timber-stock',
    );
    expect(
      timberOnly.body.items.map((item: { id: string }) => item.id),
    ).toEqual(['p:epsilon']);
  });
});
