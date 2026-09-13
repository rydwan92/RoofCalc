import { describe, expect, it } from 'vitest';
import {
  resolveVariablePanelPlane,
  type VariablePanelInput,
} from './variable-panel-layout';

const rectangle = [
  { uMm: 0, vMm: 0 },
  { uMm: 1000, vMm: 0 },
  { uMm: 1000, vMm: 3000 },
  { uMm: 0, vMm: 3000 },
];
const base: VariablePanelInput = {
  roofPlaneId: 'left',
  polygon: rectangle,
  openings: [],
  effectiveWidthMm: 400,
  horizontalAlignment: 'from-u-min',
  minPanelLengthMm: 100,
  maxPanelLengthMm: 5000,
};

describe('variable panel plane kernel', () => {
  it('uses one deterministic U grid and one full-slope run per rectangular strip', () => {
    const result = resolveVariablePanelPlane(base);
    expect(
      result.columns.map((column) => [
        column.nominalFromUMm,
        column.nominalToUMm,
      ]),
    ).toEqual([
      [0, 400],
      [400, 800],
      [800, 1200],
    ]);
    expect(
      result.columns.map((column) => column.runs.map((run) => run.lengthMm)),
    ).toEqual([[3000], [3000], [3000]]);
    expect(result.columns.map((column) => column.edgeClassification)).toEqual([
      'full-width',
      'full-width',
      'edge-cut-width',
    ]);
    expect(resolveVariablePanelPlane(base)).toEqual(result);
  });

  it('supports triangle and trapezoid roof polygons without roof-type branches', () => {
    const triangle = resolveVariablePanelPlane({
      ...base,
      polygon: [
        { uMm: 0, vMm: 0 },
        { uMm: 1000, vMm: 0 },
        { uMm: 500, vMm: 3000 },
      ],
    });
    const trapezoid = resolveVariablePanelPlane({
      ...base,
      polygon: [
        { uMm: 0, vMm: 0 },
        { uMm: 1000, vMm: 0 },
        { uMm: 800, vMm: 3000 },
        { uMm: 200, vMm: 3000 },
      ],
    });
    expect(
      triangle.columns.flatMap((column) => column.runs).length,
    ).toBeGreaterThan(0);
    expect(triangle.columns[0]!.runs[0]!.lengthMm).toBeLessThan(3000);
    expect(
      trapezoid.columns.flatMap((column) => column.runs).length,
    ).toBeGreaterThan(0);
    expect(trapezoid.columns[1]!.runs[0]!.lengthMm).toBe(3000);
  });

  it('keeps centered and manual offset grids plane-wide', () => {
    expect(
      resolveVariablePanelPlane({ ...base, horizontalAlignment: 'centered' })
        .horizontalOriginUMm,
    ).toBe(-100);
    expect(
      resolveVariablePanelPlane({
        ...base,
        horizontalAlignment: 'manual',
        manualOffsetMm: 75,
      }).horizontalOriginUMm,
    ).toBe(75);
  });

  it('splits one nominal strip into contiguous runs around one or multiple openings', () => {
    const one = resolveVariablePanelPlane({
      ...base,
      openings: [
        {
          id: 'O1',
          fromUMm: 0,
          toUMm: 400,
          fromVMm: 1000,
          toVMm: 1500,
        },
      ],
    });
    expect(one.columns[0]!.runs.map((run) => [run.fromVMm, run.toVMm])).toEqual(
      [
        [0, 1000],
        [1500, 3000],
      ],
    );
    expect(
      one.columns[0]!.runs.every((run) => run.openingIds.includes('O1')),
    ).toBe(true);
    expect(one.columns[1]!.runs).toHaveLength(1);
    const two = resolveVariablePanelPlane({
      ...base,
      openings: [
        { id: 'O2', fromUMm: 0, toUMm: 400, fromVMm: 2000, toVMm: 2300 },
        { id: 'O1', fromUMm: 0, toUMm: 400, fromVMm: 1000, toVMm: 1500 },
      ],
    });
    expect(two.columns[0]!.runs.map((run) => run.lengthMm)).toEqual([
      1000, 500, 700,
    ]);
    expect(two.columns[0]!.runs.map((run) => run.id)).toEqual([
      'left:panel:0:run:0',
      'left:panel:0:run:1',
      'left:panel:0:run:2',
    ]);
  });

  it('does not split for an opening outside the strip', () => {
    const result = resolveVariablePanelPlane({
      ...base,
      openings: [
        {
          id: 'O1',
          fromUMm: 450,
          toUMm: 700,
          fromVMm: 1000,
          toVMm: 1500,
        },
      ],
    });
    expect(result.columns[0]!.runs).toHaveLength(1);
  });

  it('accepts convex void polygons as well as rectangular opening shorthand', () => {
    const rectangular = resolveVariablePanelPlane({
      ...base,
      openings: [
        { id: 'O1', fromUMm: 0, toUMm: 400, fromVMm: 1000, toVMm: 1500 },
      ],
    });
    const polygonal = resolveVariablePanelPlane({
      ...base,
      openings: [
        {
          id: 'O1',
          polygon: [
            { uMm: 0, vMm: 1000 },
            { uMm: 400, vMm: 1000 },
            { uMm: 400, vMm: 1500 },
            { uMm: 0, vMm: 1500 },
          ],
        },
      ],
    });
    expect(polygonal.columns[0]!.runs.map((run) => run.lengthMm)).toEqual(
      rectangular.columns[0]!.runs.map((run) => run.lengthMm),
    );
    const triangular = resolveVariablePanelPlane({
      ...base,
      openings: [
        {
          id: 'O2',
          polygon: [
            { uMm: 0, vMm: 1000 },
            { uMm: 400, vMm: 1000 },
            { uMm: 200, vMm: 1500 },
          ],
        },
      ],
    });
    expect(
      triangular.columns[0]!.runs.every((run) => Number.isFinite(run.lengthMm)),
    ).toBe(true);
  });

  it('reports short and long runs but does not create a transverse joint', () => {
    const result = resolveVariablePanelPlane({
      ...base,
      minPanelLengthMm: 1100,
      maxPanelLengthMm: 1800,
      openings: [
        { id: 'O1', fromUMm: 0, toUMm: 400, fromVMm: 1000, toVMm: 1500 },
      ],
    });
    expect(result.columns[0]!.runs[0]!.issues).toContain(
      'below-min-panel-length',
    );
    expect(result.columns[1]!.runs[0]!.issues).toContain(
      'exceeds-max-panel-length',
    );
    expect(result.columns[1]!.runs).toHaveLength(1);
  });

  it('rejects non-finite geometry and non-finite grid offsets', () => {
    expect(() =>
      resolveVariablePanelPlane({
        ...base,
        polygon: [{ uMm: NaN, vMm: 0 }, ...rectangle.slice(1)],
      }),
    ).toThrow();
    expect(() =>
      resolveVariablePanelPlane({
        ...base,
        horizontalAlignment: 'manual',
        manualOffsetMm: Infinity,
      }),
    ).toThrow();
  });
});
