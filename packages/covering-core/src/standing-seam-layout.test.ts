import { describe, expect, it } from 'vitest';
import {
  coveringAssignmentSpecSchema,
  standingSeamTechnicalSpecSchema,
  resolvePrimaryCoveringAssignments,
  type StandingSeamTechnicalSpec,
} from './index';
import {
  createStandingSeamQuantitySource,
  resolveStandingSeamLayout,
  type StandingSeamLayoutInput,
} from './standing-seam-layout';

const spec: StandingSeamTechnicalSpec = {
  schemaVersion: 1,
  kind: 'standing-seam',
  installationModes: [
    { id: 'wide', effectiveWidthMm: 500, totalWidthMm: 540 },
    { id: 'narrow', effectiveWidthMm: 250, totalWidthMm: 285 },
  ],
  minPanelLengthMm: 200,
  maxPanelLengthMm: 5000,
  seamHeightMm: 25,
  minPitchDeg: 8,
  transverseOverlap: { minimumOverlapMm: 200, minPitchDeg: 14 },
};
const plane = {
  roofPlaneId: 'left',
  pitchDeg: 35,
  netAreaMm2: 6_000_000,
  localPolygon: [
    { uMm: 0, vMm: 0 },
    { uMm: 1000, vMm: 0 },
    { uMm: 1000, vMm: 3000 },
    { uMm: 0, vMm: 3000 },
  ],
};
const base: StandingSeamLayoutInput = {
  assignmentId: 'seam-1',
  roofPlaneIds: ['left'],
  roofSurfaceGeometry: [plane],
  openings: [],
  productSpec: spec,
  selectedInstallationModeId: 'wide',
  layoutIntent: { kind: 'standing-seam', horizontalAlignment: 'from-u-min' },
};

describe('standing seam strategy', () => {
  it('parses technical snapshot and requires explicit mode for multiple widths', () => {
    expect(
      standingSeamTechnicalSpecSchema.parse(spec).installationModes,
    ).toHaveLength(2);
    expect(
      resolveStandingSeamLayout({
        ...base,
        selectedInstallationModeId: undefined,
      }).status,
    ).toBe('incomplete');
    expect(
      resolveStandingSeamLayout({
        ...base,
        selectedInstallationModeId: 'missing',
      }).issueCodes,
    ).toContain('installation-mode-not-found');
  });

  it('uses selected effective width, counts runs, sums exact lengths and groups them', () => {
    const wide = resolveStandingSeamLayout(base);
    const narrow = resolveStandingSeamLayout({
      ...base,
      selectedInstallationModeId: 'narrow',
    });
    expect(wide.status).toBe('resolved');
    expect(wide.columnCount).toBe(2);
    expect(narrow.columnCount).toBe(4);
    expect(wide.panelRunCount).toBe(2);
    expect(wide.totalPanelLengthMm).toBe(6000);
    expect(wide.lengthGroups).toEqual([{ lengthMm: 3000, quantity: 2 }]);
    expect(resolveStandingSeamLayout(base)).toEqual(wide);
    const quantity = createStandingSeamQuantitySource({ layout: wide });
    expect(quantity).toMatchObject({
      quantity: 2,
      totalLengthMm: 6000,
      basis: 'standing-seam-geometric-panel-run-v1',
    });
    expect(quantity).not.toHaveProperty('purchaseQuantity');
    expect(quantity).not.toHaveProperty('waste');
  });

  it('resolves hip geometry and openings into distinct physical runs', () => {
    const hip = resolveStandingSeamLayout({
      ...base,
      selectedInstallationModeId: 'narrow',
      roofSurfaceGeometry: [
        {
          ...plane,
          localPolygon: [
            { uMm: 0, vMm: 0 },
            { uMm: 1000, vMm: 0 },
            { uMm: 500, vMm: 3000 },
          ],
        },
      ],
    });
    expect(hip.planes[0]!.columns.length).toBeGreaterThan(0);
    expect(hip.planes[0]!.columns[0]!.runs[0]!.lengthMm).toBeLessThan(3000);
    const opened = resolveStandingSeamLayout({
      ...base,
      openings: [
        {
          id: 'O1',
          roofPlaneId: 'left',
          fromUMm: 0,
          toUMm: 500,
          fromVMm: 1000,
          toVMm: 1400,
        },
        {
          id: 'O2',
          roofPlaneId: 'left',
          fromUMm: 0,
          toUMm: 500,
          fromVMm: 2200,
          toVMm: 2400,
        },
      ],
    });
    expect(opened.planes[0]!.columns[0]!.runs).toHaveLength(3);
    expect(opened.panelRunCount).toBe(4);
    expect(opened.totalPanelLengthMm).toBe(5400);
    expect(opened.openingInterruptedRuns).toBe(3);
  });

  it('keeps geometric quantity visible with length warnings but does not place a joint', () => {
    const result = resolveStandingSeamLayout({
      ...base,
      productSpec: { ...spec, minPanelLengthMm: 3500, maxPanelLengthMm: 4000 },
    });
    expect(result.status).toBe('limited');
    expect(result.issueCodes).toContain('below-min-panel-length');
    expect(createStandingSeamQuantitySource({ layout: result })?.quantity).toBe(
      2,
    );
    const long = resolveStandingSeamLayout({
      ...base,
      productSpec: { ...spec, maxPanelLengthMm: 2000 },
    });
    expect(long.issueCodes).toContain('transverse-joint-required');
    expect(long.planes[0]!.columns[0]!.runs).toHaveLength(1);
  });

  it('excludes incompatible pitch from trusted quantity', () => {
    const result = resolveStandingSeamLayout({
      ...base,
      roofSurfaceGeometry: [{ ...plane, pitchDeg: 5 }],
    });
    expect(result.status).toBe('incompatible');
    expect(
      createStandingSeamQuantitySource({ layout: result }),
    ).toBeUndefined();
    const modeLimited = resolveStandingSeamLayout({
      ...base,
      roofSurfaceGeometry: [{ ...plane, pitchDeg: 10 }],
      productSpec: {
        ...spec,
        installationModes: [
          { id: 'wide', effectiveWidthMm: 500, minPitchDeg: 14 },
        ],
      },
    });
    expect(modeLimited.issueCodes).toContain('below-minimum-pitch');
  });

  it('groups numerical noise but keeps distinct canonical millimetre lengths separate', () => {
    const makePlane = (roofPlaneId: string, height: number) => ({
      ...plane,
      roofPlaneId,
      localPolygon: [
        { uMm: 0, vMm: 0 },
        { uMm: 500, vMm: 0 },
        { uMm: 500, vMm: height },
        { uMm: 0, vMm: height },
      ],
    });
    const result = resolveStandingSeamLayout({
      ...base,
      roofPlaneIds: ['a', 'b', 'c'],
      roofSurfaceGeometry: [
        makePlane('a', 3000),
        makePlane('b', 3000.00000005),
        makePlane('c', 3001),
      ],
    });
    expect(result.lengthGroups).toEqual([
      { lengthMm: 3000, quantity: 2 },
      { lengthMm: 3001, quantity: 1 },
    ]);
  });

  it('uses the normal plane ownership flow and handles multiple planes', () => {
    const assignment = coveringAssignmentSpecSchema.parse({
      id: 'seam-1',
      roofPlaneIds: ['left', 'right'],
      product: { technicalSpecSnapshot: spec },
      selectedInstallationModeId: 'wide',
      layoutIntent: base.layoutIntent,
    });
    const competing = coveringAssignmentSpecSchema.parse({
      ...assignment,
      id: 'seam-2',
      roofPlaneIds: ['left'],
    });
    const ownership = resolvePrimaryCoveringAssignments([
      assignment,
      competing,
    ]);
    expect(ownership.trustedRoofPlaneIdsByAssignment['seam-1']).toEqual([
      'right',
    ]);
    const result = resolveStandingSeamLayout({
      ...base,
      roofPlaneIds: ['left', 'right'],
      roofSurfaceGeometry: [plane, { ...plane, roofPlaneId: 'right' }],
      layoutIntent: {
        kind: 'standing-seam',
        horizontalAlignment: 'manual',
        planeOffsetsMm: { left: 75 },
      },
    });
    expect(result.panelRunCount).toBe(5);
    expect(result.status).toBe('resolved');
  });
});
