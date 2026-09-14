import { describe, expect, it } from 'vitest';
import {
  coveringAssignmentSpecSchema,
  createCutToLengthSheetQuantitySource,
  resolveCutToLengthSheetLayout,
  type CutToLengthSheetLayoutInput,
} from './index';

const rectangle = [
  { uMm: 0, vMm: 0 },
  { uMm: 2000, vMm: 0 },
  { uMm: 2000, vMm: 1000 },
  { uMm: 0, vMm: 1000 },
];
const spec = {
  schemaVersion: 1 as const,
  kind: 'modular-sheet' as const,
  effectiveWidthMm: 500,
  totalWidthMm: 550,
  moduleLengthMm: 350,
  minPitchDeg: 9,
  lengthModel: {
    kind: 'cut-to-length' as const,
    minPanelLengthMm: 100,
    maxPanelLengthMm: 2000,
  },
};

function input(
  overrides: Partial<CutToLengthSheetLayoutInput> = {},
): CutToLengthSheetLayoutInput {
  return {
    assignmentId: 'assignment-a',
    roofPlaneIds: ['opaque-plane-81'],
    roofSurfaceGeometry: [
      {
        roofPlaneId: 'opaque-plane-81',
        pitchDeg: 35,
        localPolygon: rectangle,
        netAreaMm2: 2_000_000,
      },
    ],
    openings: [],
    productSpec: spec,
    layoutIntent: {
      kind: 'modular-sheet-cut-to-length',
      horizontalAlignment: 'from-u-min',
    },
    ...overrides,
  };
}

describe('cut-to-length modular sheet layout', () => {
  it('parses the dedicated intent and leaves fixed-sheet snapshots compatible', () => {
    expect(
      coveringAssignmentSpecSchema.parse({
        id: 'a',
        roofPlaneIds: ['opaque-plane-81'],
        product: { technicalSpecSnapshot: spec },
        layoutIntent: {
          kind: 'modular-sheet-cut-to-length',
          horizontalAlignment: 'centered',
        },
      }).layoutIntent?.kind,
    ).toBe('modular-sheet-cut-to-length');
    expect(
      coveringAssignmentSpecSchema.safeParse({
        id: 'a',
        roofPlaneIds: ['opaque-plane-81'],
        product: {
          technicalSpecSnapshot: {
            ...spec,
            lengthModel: { kind: 'fixed-sheet', effectiveLengthMm: 700 },
          },
        },
        layoutIntent: {
          kind: 'modular-sheet',
          horizontalAlignment: 'centered',
        },
      }).success,
    ).toBe(true);
    expect(
      coveringAssignmentSpecSchema.safeParse({
        id: 'a',
        roofPlaneIds: ['opaque-plane-81'],
        product: { technicalSpecSnapshot: spec },
        layoutIntent: {
          kind: 'standing-seam',
          horizontalAlignment: 'centered',
        },
      }).success,
    ).toBe(false);
  });

  it('uses effective width and returns exact rectangular runs and quantity', () => {
    const result = resolveCutToLengthSheetLayout(input());
    expect(result.status).toBe('resolved');
    expect(result.stripCount).toBe(4);
    expect(result.physicalRunCount).toBe(4);
    expect(result.fullWidthStrips).toBe(4);
    expect(result.edgeCutStrips).toBe(0);
    expect(result.totalGeometricLengthMm).toBe(4000);
    expect(result.lengthGroups).toEqual([{ lengthMm: 1000, quantity: 4 }]);
    expect(
      result.planes[0]?.columns.map((column) => column.nominalFromUMm),
    ).toEqual([0, 500, 1000, 1500]);
    expect(
      createCutToLengthSheetQuantitySource({ layout: result }),
    ).toMatchObject({
      layoutKind: 'modular-sheet-cut-to-length',
      semantic: 'geometric-panel-run',
      unit: 'geometric-run',
      quantity: 4,
      totalLengthMm: 4000,
      requirementReadiness: 'geometric-only',
    });
  });

  it('keeps a coherent centred grid and classifies edge strips', () => {
    const result = resolveCutToLengthSheetLayout(
      input({
        roofSurfaceGeometry: [
          {
            roofPlaneId: 'opaque-plane-81',
            pitchDeg: 35,
            netAreaMm2: 1_200_000,
            localPolygon: rectangle.map((point) => ({
              ...point,
              uMm: point.uMm * 0.6,
            })),
          },
        ],
        layoutIntent: {
          kind: 'modular-sheet-cut-to-length',
          horizontalAlignment: 'centered',
        },
      }),
    );
    expect(result.stripCount).toBe(3);
    expect(result.planes[0]?.horizontalOriginUMm).toBe(-150);
    expect(result.edgeCutStrips).toBe(2);
  });

  it('uses the supplied manual millimetre offset', () => {
    const result = resolveCutToLengthSheetLayout(
      input({
        layoutIntent: {
          kind: 'modular-sheet-cut-to-length',
          horizontalAlignment: 'manual',
          planeOffsetsMm: { 'opaque-plane-81': 100 },
        },
      }),
    );
    expect(result.planes[0]?.horizontalOriginUMm).toBe(100);
    expect(result.planes[0]?.columns[0]?.columnIndex).toBe(-1);
  });

  it.each([
    [
      'triangular',
      [
        { uMm: 0, vMm: 0 },
        { uMm: 2000, vMm: 0 },
        { uMm: 1000, vMm: 1000 },
      ],
    ],
    [
      'trapezoidal',
      [
        { uMm: 0, vMm: 0 },
        { uMm: 2000, vMm: 0 },
        { uMm: 1500, vMm: 1000 },
        { uMm: 500, vMm: 1000 },
      ],
    ],
  ])(
    'resolves a %s hip plane without interpreting its ID',
    (_label, polygon) => {
      const result = resolveCutToLengthSheetLayout(
        input({
          roofSurfaceGeometry: [
            {
              roofPlaneId: 'opaque-plane-81',
              pitchDeg: 35,
              netAreaMm2: 1_000_000,
              localPolygon: polygon,
            },
          ],
        }),
      );
      expect(result.status).toBe('resolved');
      expect(result.physicalRunCount).toBeGreaterThan(0);
      expect(result.edgeCutStrips).toBeGreaterThan(0);
      expect(result.totalGeometricLengthMm).toBeGreaterThan(0);
      expect(
        result.planes[0]?.columns.every((column) =>
          column.runs.every(
            (run) =>
              Number.isFinite(run.geometricLengthMm) &&
              run.id.includes('opaque-plane-81'),
          ),
        ),
      ).toBe(true);
    },
  );

  it('splits a strip into distinct physical runs across an opening', () => {
    const result = resolveCutToLengthSheetLayout(
      input({
        openings: [
          {
            id: 'window-a',
            roofPlaneId: 'opaque-plane-81',
            fromUMm: 0,
            toUMm: 500,
            fromVMm: 300,
            toVMm: 700,
          },
        ],
      }),
    );
    const runs = result.planes[0]!.columns[0]!.runs;
    expect(runs.map((run) => [run.fromVMm, run.toVMm])).toEqual([
      [0, 300],
      [700, 1000],
    ]);
    expect(result.physicalRunCount).toBe(5);
    expect(result.openingInterruptedRuns).toBe(2);
    expect(runs[0]?.id).not.toBe(runs[1]?.id);
  });

  it('handles multiple openings and exact length groups deterministically', () => {
    const value = input({
      openings: [
        {
          id: 'a',
          roofPlaneId: 'opaque-plane-81',
          fromUMm: 0,
          toUMm: 500,
          fromVMm: 200,
          toVMm: 300,
        },
        {
          id: 'b',
          roofPlaneId: 'opaque-plane-81',
          fromUMm: 0,
          toUMm: 500,
          fromVMm: 600,
          toVMm: 700,
        },
      ],
    });
    const a = resolveCutToLengthSheetLayout(value);
    const b = resolveCutToLengthSheetLayout(value);
    expect(a).toEqual(b);
    expect(a.planes[0]?.columns[0]?.runs).toHaveLength(3);
    expect(a.lengthGroups.reduce((sum, group) => sum + group.quantity, 0)).toBe(
      a.physicalRunCount,
    );
  });

  it('reports minimum and maximum violations without silently segmenting', () => {
    const result = resolveCutToLengthSheetLayout(
      input({
        productSpec: {
          ...spec,
          lengthModel: {
            kind: 'cut-to-length',
            minPanelLengthMm: 400,
            maxPanelLengthMm: 800,
          },
        },
        openings: [
          {
            id: 'window-a',
            roofPlaneId: 'opaque-plane-81',
            fromUMm: 0,
            toUMm: 500,
            fromVMm: 200,
            toVMm: 300,
          },
        ],
      }),
    );
    expect(result.status).toBe('limited');
    expect(result.issueCodes).toEqual([
      'below-min-panel-length',
      'segmentation-required',
    ]);
    expect(result.planes[0]?.columns[0]?.runs).toHaveLength(2);
    expect(result.physicalRunCount).toBe(5);
    expect(
      result.issues.some(
        (issue) =>
          issue.code === 'segmentation-required' && issue.required === 800,
      ),
    ).toBe(true);
    expect(
      result.planes
        .flatMap((plane) => plane.columns.flatMap((column) => column.runs))
        .every((run) => run.orderLengthMm === undefined),
    ).toBe(true);
  });

  it('does not trust missing, invalid or pitch-incompatible geometry for quantities', () => {
    for (const value of [
      input({ roofSurfaceGeometry: [] }),
      input({
        roofSurfaceGeometry: [
          {
            roofPlaneId: 'opaque-plane-81',
            pitchDeg: 35,
            netAreaMm2: 1,
            localPolygon: [{ uMm: 0, vMm: 0 }],
          },
        ],
      }),
      input({
        roofSurfaceGeometry: [
          {
            roofPlaneId: 'opaque-plane-81',
            pitchDeg: 5,
            netAreaMm2: 2_000_000,
            localPolygon: rectangle,
          },
        ],
      }),
    ]) {
      const result = resolveCutToLengthSheetLayout(value);
      expect(['invalid', 'incompatible']).toContain(result.status);
      expect(
        createCutToLengthSheetQuantitySource({ layout: result }),
      ).toBeUndefined();
    }
  });
});
