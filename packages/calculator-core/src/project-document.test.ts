import { describe, expect, it } from 'vitest';
import {
  assemblyDefaults,
  gableTemplateFromAssembly,
} from '@cieslacalc/roof-math';
import {
  createRoofProjectDocument,
  parseRoofProjectDocument,
  serializeRoofProjectDocument,
} from './project-document';

describe('RoofProjectDocumentV1', () => {
  it('round-trips canonical roof input without transient workbench state', () => {
    const roof = gableTemplateFromAssembly(assemblyDefaults);
    const document = createRoofProjectDocument(roof);
    const serialized = serializeRoofProjectDocument(document);

    expect(parseRoofProjectDocument(serialized)).toEqual(document);
    expect(JSON.parse(serialized)).toEqual({
      schemaVersion: 1,
      project: {
        roof,
        features: [],
        openingFraming: [],
        buildUp: {},
        coverings: [],
      },
    });
    expect(serialized).not.toMatch(
      /selected|hover|camera|drawer|toolbox|viewport|dimensionLevel|measurement|workspaceFocus/,
    );
  });

  it('round-trips roof windows and batten settings while accepting earlier V1 documents', () => {
    const roof = gableTemplateFromAssembly(assemblyDefaults);
    const document = createRoofProjectDocument(roof, {
      features: [
        {
          id: 'feature:roof-window-1',
          kind: 'roof-window',
          roofPlaneId: 'roof-plane:left',
          widthMm: 780,
          heightMm: 1180,
          position: { uMm: 900, vMm: 1200 },
        },
      ],
      buildUp: {
        battenLayout: {
          enabled: true,
          mode: 'auto-from-covering',
          battenHeightMm: 40,
          battenWidthMm: 60,
          gaugeMm: 350,
          eaveOffsetMm: 250,
        },
      },
    });
    expect(
      parseRoofProjectDocument(serializeRoofProjectDocument(document)),
    ).toEqual(document);
    expect(
      parseRoofProjectDocument(
        JSON.stringify({ schemaVersion: 1, project: { roof } }),
      ).project,
    ).toMatchObject({
      features: [],
      openingFraming: [],
      buildUp: {},
      coverings: [],
    });
    const legacy = structuredClone(document);
    delete legacy.project.buildUp.battenLayout!.mode;
    expect(
      parseRoofProjectDocument(serializeRoofProjectDocument(legacy)).project
        .buildUp.battenLayout,
    ).not.toHaveProperty('mode');
  });

  it('round-trips membrane and counter-batten intent without changing the V1 schema', () => {
    const roof = gableTemplateFromAssembly(assemblyDefaults);
    const document = createRoofProjectDocument(roof, {
      buildUp: {
        membrane: {
          enabled: true,
          roofPlaneIds: ['roof-plane:left'],
        },
        counterBattens: {
          enabled: true,
          roofPlaneIds: ['roof-plane:left', 'roof-plane:right'],
          widthMm: 50,
          heightMm: 30,
        },
      },
    });

    const parsed = parseRoofProjectDocument(
      serializeRoofProjectDocument(document),
    );
    expect(parsed).toEqual(document);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.project.buildUp.counterBattens?.widthMm).toBe(50);
  });

  it('round-trips optional V14 opening-framing intent while keeping V13 documents compatible', () => {
    const roof = gableTemplateFromAssembly(assemblyDefaults);
    const document = createRoofProjectDocument(roof, {
      features: [
        {
          id: 'feature:roof-window-1',
          kind: 'roof-window',
          roofPlaneId: 'roof-plane:left',
          widthMm: 780,
          heightMm: 1180,
          position: { uMm: 900, vMm: 1200 },
        },
      ],
      openingFraming: [
        {
          id: 'opening-framing:feature:roof-window-1',
          kind: 'roof-opening-framing',
          featureId: 'feature:roof-window-1',
          headerSection: { widthMm: 80, depthMm: 200 },
          edgeOffsetMm: 80,
          acceptedGeometrySignature: 'geometry-v14',
        },
      ],
    });
    expect(
      parseRoofProjectDocument(serializeRoofProjectDocument(document)),
    ).toEqual(document);
    const v13 = parseRoofProjectDocument(
      JSON.stringify({
        schemaVersion: 1,
        project: { roof, features: document.project.features, buildUp: {} },
      }),
    );
    expect(v13.project.openingFraming).toEqual([]);
  });

  it('rejects unknown document versions and invalid roof input', () => {
    expect(() =>
      parseRoofProjectDocument(
        JSON.stringify({ schemaVersion: 2, project: { roof: {} } }),
      ),
    ).toThrow();
  });

  it('round-trips an optional ridge section depth and accepts older roofs without it', () => {
    const roof = gableTemplateFromAssembly(assemblyDefaults);
    roof.ridge.depthMm = 220;
    const document = createRoofProjectDocument(roof);

    expect(
      parseRoofProjectDocument(serializeRoofProjectDocument(document)).project
        .roof.ridge.depthMm,
    ).toBe(220);

    delete roof.ridge.depthMm;
    expect(
      parseRoofProjectDocument(
        JSON.stringify({ schemaVersion: 1, project: { roof } }),
      ).project.roof.ridge.depthMm,
    ).toBeUndefined();
  });

  it('preserves a covering technical snapshot while older V17 documents normalize to no assignments', () => {
    const roof = gableTemplateFromAssembly(assemblyDefaults);
    const technicalSpecSnapshot = {
      schemaVersion: 1 as const,
      kind: 'roof-tile' as const,
      physicalWidthMm: 330,
      physicalLengthMm: 420,
      installationModes: [
        {
          id: 'standard',
          coverWidthMm: 300,
          gaugeRangeMm: { min: 312, max: 345 },
          coursePattern: {
            layers: [{ id: 'base', horizontalOffsetFraction: 0 }],
            battenRowOffsetCycle: [0, 0.5],
          },
          minPitchDeg: 22,
        },
      ],
    };
    const document = createRoofProjectDocument(roof, {
      coverings: [
        {
          id: 'covering:main',
          roofPlaneIds: ['roof-plane:left', 'roof-plane:right'],
          selectedInstallationModeId: 'standard',
          product: {
            catalogRef: {
              productId: 'product:tile-family',
              technicalRevisionId: 'technical-revision:R1',
              variantId: 'variant:red',
            },
            displaySnapshot: {
              manufacturer: 'Example',
              familyName: 'Tile family',
              variantName: 'Red',
            },
            technicalSpecSnapshot,
          },
          layoutIntent: {
            kind: 'roof-tile',
            horizontalAlignment: 'manual',
            planeOffsetsMm: { 'roof-plane:left': 75 },
          },
        },
      ],
    });

    const parsed = parseRoofProjectDocument(
      serializeRoofProjectDocument(document),
    );
    expect(parsed.project.coverings).toEqual(document.project.coverings);
    expect(parsed.project.coverings[0]!.product.technicalSpecSnapshot).toEqual(
      technicalSpecSnapshot,
    );
    expect(parsed.project.coverings[0]!.layoutIntent).toEqual(
      document.project.coverings[0]!.layoutIntent,
    );
    expect(serializeRoofProjectDocument(document)).not.toMatch(
      /tile-course:|visibleFragments|totalPositions/,
    );

    const v17 = parseRoofProjectDocument(
      JSON.stringify({
        schemaVersion: 1,
        project: { roof, features: [], openingFraming: [], buildUp: {} },
      }),
    );
    expect(v17.project.coverings).toEqual([]);
  });

  it('accepts a manual covering product without a catalogue reference', () => {
    const roof = gableTemplateFromAssembly(assemblyDefaults);
    const document = createRoofProjectDocument(roof, {
      coverings: [
        {
          id: 'covering:manual',
          roofPlaneIds: ['roof-plane:left'],
          product: {
            technicalSpecSnapshot: {
              schemaVersion: 1,
              kind: 'modular-sheet',
              effectiveWidthMm: 1190,
              lengthModel: {
                kind: 'fixed-sheet',
                effectiveLengthMm: 700,
              },
              moduleLengthMm: 350,
            },
          },
        },
      ],
    });
    expect(document.project.coverings[0]!.product.catalogRef).toBeUndefined();
  });

  it('round-trips standing-seam snapshots without serializing derived panel runs', () => {
    const roof = gableTemplateFromAssembly(assemblyDefaults);
    const document = createRoofProjectDocument(roof, {
      coverings: [
        {
          id: 'covering:standing-seam-1',
          roofPlaneIds: ['roof-plane:left'],
          selectedInstallationModeId: 'narrow',
          layoutIntent: {
            kind: 'standing-seam',
            horizontalAlignment: 'manual',
            planeOffsetsMm: { 'roof-plane:left': 75 },
          },
          product: {
            technicalSpecSnapshot: {
              schemaVersion: 1,
              kind: 'standing-seam',
              installationModes: [
                { id: 'wide', effectiveWidthMm: 500 },
                { id: 'narrow', effectiveWidthMm: 250 },
              ],
              minPanelLengthMm: 200,
              maxPanelLengthMm: 8000,
              seamHeightMm: 25,
            },
          },
        },
      ],
    });
    const serialized = serializeRoofProjectDocument(document);
    expect(parseRoofProjectDocument(serialized)).toEqual(document);
    expect(serialized).not.toMatch(
      /columns|runs|lengthGroups|totalPanelLengthMm/,
    );
  });

  it('normalizes a V34C raw membrane spec into a V35 selection wrapper on parse', () => {
    const roof = gableTemplateFromAssembly(assemblyDefaults);
    const v34c = parseRoofProjectDocument(
      JSON.stringify({
        schemaVersion: 1,
        project: {
          roof,
          buildUp: { membrane: { enabled: true } },
          membraneProduct: {
            schemaVersion: 1,
            kind: 'membrane',
            rollWidthMm: 1500,
            rollLengthMm: 50_000,
            minimumOverlapMm: 100,
          },
        },
      }),
    );
    expect(v34c.project.membraneProduct).toEqual({
      technicalSpecSnapshot: {
        schemaVersion: 1,
        kind: 'membrane',
        rollWidthMm: 1500,
        rollLengthMm: 50_000,
        minimumOverlapMm: 100,
      },
    });
  });

  it('round-trips a V35 catalogue-backed membrane selection unchanged', () => {
    const roof = gableTemplateFromAssembly(assemblyDefaults);
    const document = createRoofProjectDocument(roof, {
      buildUp: {
        membrane: { enabled: true, roofPlaneIds: ['roof-plane:left'] },
      },
      membraneProduct: {
        catalogRef: {
          productId: 'product:dorken:delta-maxx-plus',
          technicalRevisionId: 'revision:dorken:delta-maxx-plus:2026-09',
        },
        displaySnapshot: {
          manufacturer: 'DÖRKEN',
          familyName: 'DELTA-MAXX PLUS',
        },
        technicalSpecSnapshot: {
          schemaVersion: 1,
          kind: 'membrane',
          rollWidthMm: 1500,
          rollLengthMm: 50_000,
          minimumOverlapMm: 100,
          material: 'synthetic',
          salesUnit: 'roll',
        },
      },
    });
    expect(
      parseRoofProjectDocument(serializeRoofProjectDocument(document)),
    ).toEqual(document);
    expect(document.project.membraneProduct?.catalogRef?.productId).toBe(
      'product:dorken:delta-maxx-plus',
    );
  });

  it('does not serialize catalogue browsing or transient selection state', () => {
    const roof = gableTemplateFromAssembly(assemblyDefaults);
    const parsed = parseRoofProjectDocument(
      JSON.stringify({
        schemaVersion: 1,
        project: {
          roof,
          catalogBrowser: { query: 'tile', manufacturer: 'Example' },
          selectedFeatureIds: ['feature:roof-window-1'],
        },
      }),
    );
    const serialized = serializeRoofProjectDocument(parsed);
    expect(serialized).not.toMatch(/catalogBrowser|query|manufacturer/);
    expect(serialized).not.toContain('selectedFeatureIds');
  });
});
