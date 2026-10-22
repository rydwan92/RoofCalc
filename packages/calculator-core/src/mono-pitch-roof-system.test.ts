import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { CoveringAssignmentSpec } from '@cieslacalc/covering-core';
import {
  MONO_PITCH_PLANE_ID,
  type MonoPitchFramingSpec,
} from '@cieslacalc/roof-math';
import { roofProjectDocumentV1Schema } from './project-document';
import { resolveMonoPitchRoofSystem } from './mono-pitch-roof-system';

/**
 * VNext-7B: a mono-pitch roof through the SAME engines as the reference
 * projects. The roof tile of reference project 05 (≥ 20°, 9.8–10.7 pcs/m²)
 * is laid on the mono-pitch plane exactly as on a gable plane.
 */
const tileProject = roofProjectDocumentV1Schema.parse(
  JSON.parse(
    readFileSync(
      fileURLToPath(
        new URL(
          '../../../fixtures/projects/05-gable-roof-tile.cieslacalc.json',
          import.meta.url,
        ),
      ),
      'utf8',
    ),
  ).document,
);
const tile: CoveringAssignmentSpec = {
  ...tileProject.project.coverings[0]!,
  roofPlaneIds: [MONO_PITCH_PLANE_ID],
};

const framing = (pitchDeg: number): MonoPitchFramingSpec => ({
  roof: {
    type: 'mono-pitch',
    id: 'template:lean-to',
    buildingLengthMm: 6000,
    runMm: 4000,
    pitchDeg,
    lowEaveOverhangMm: 500,
    topEdge: 'free',
    highOverhangMm: 300,
    vergeOverhangMm: 300,
  },
  rafter: {
    section: { widthMm: 80, depthMm: 200 },
    spacing: { mode: 'max-even-spacing', spacingMm: 900 },
  },
  lowSupport: { kind: 'wall-plate', widthMm: 140, heightMm: 140, seatMm: 100 },
  highSupport: { kind: 'wall-plate', widthMm: 140, heightMm: 140, seatMm: 100 },
});
const battens = {
  enabled: true,
  mode: 'manual' as const,
  battenWidthMm: 60,
  battenHeightMm: 40,
  gaugeMm: 340,
  eaveOffsetMm: 50,
};

describe('mono-pitch roof system (framing → battens → covering)', () => {
  it('refuses a 20° tile on a 15° roof by the same compatibility rule', () => {
    const system = resolveMonoPitchRoofSystem({
      framing: framing(15),
      battens,
      coverings: [tile],
    });
    expect(system.coveringCompatibility[tile.id]).toMatchObject({
      status: 'incompatible',
      issues: [expect.objectContaining({ code: 'below-minimum-pitch' })],
    });
  });

  it('lays the tile on a 25° mono-pitch plane and gives its quantity evidence', () => {
    const system = resolveMonoPitchRoofSystem({
      framing: framing(25),
      battens,
      coverings: [tile],
    });
    expect(system.coveringCompatibility[tile.id]!.status).toBe('compatible');
    const [layout] = system.coveringLayouts;
    if (layout?.kind !== 'roof-tile') throw new Error('expected a tile layout');
    expect(layout).toMatchObject({
      kind: 'roof-tile',
      status: 'resolved',
      roofPlaneIds: [MONO_PITCH_PLANE_ID],
    });
    const [source] = system.coveringQuantitySources;
    if (source?.layoutKind !== 'roof-tile')
      throw new Error('expected a tile quantity source');
    expect(source.quantity).toBe(layout.totalPositions);
    // Net area = W · (R + e_low + e_high) / cos 25° = 6600 · 4800 / cos 25°.
    const areaM2 = (6600 * 4800) / Math.cos((25 * Math.PI) / 180) / 1e6;
    expect(source.netAreaMm2! / 1e6).toBeCloseTo(areaM2, 6);
    expect(source.declaredConsumptionReferenceRange).toEqual({
      minimum: expect.closeTo(areaM2 * 9.8, 6),
      maximum: expect.closeTo(areaM2 * 10.7, 6),
    });
    // The layout sits inside the declared consumption band (± one row).
    expect(layout.totalPositions).toBeGreaterThan(areaM2 * 9.8 * 0.9);
    expect(layout.totalPositions).toBeLessThan(areaM2 * 10.7 * 1.1);
  });

  it('counts the rafters as evidence: 8 × one shared stock length', () => {
    const system = resolveMonoPitchRoofSystem({ framing: framing(15) });
    expect(system.rafters).toEqual({
      prototypeId: system.framing.memberPrototypes[0]!.id,
      code: 'K1',
      section: { widthMm: 80, depthMm: 200 },
      count: 8,
      stockLengthMm: expect.closeTo(5022.915504, 5),
      totalStockLengthMm: expect.closeTo(8 * 5022.915504, 4),
    });
    expect(system.coveringLayouts).toEqual([]);
    expect(system.battens).toBeUndefined();
  });

  it('ignores planes of another roof and reports two coverings on one plane', () => {
    const foreign = resolveMonoPitchRoofSystem({
      framing: framing(25),
      battens,
      coverings: [{ ...tile, roofPlaneIds: ['roof-plane:left'] }],
    });
    expect(foreign.coveringLayouts[0]!.roofPlaneIds).toEqual([]);
    const twice = resolveMonoPitchRoofSystem({
      framing: framing(25),
      battens,
      coverings: [tile, { ...tile, id: 'covering:tile-2' }],
    });
    expect(twice.coveringConflicts).toEqual([
      {
        roofPlaneId: MONO_PITCH_PLANE_ID,
        assignmentIds: ['covering:tile-1', 'covering:tile-2'],
      },
    ]);
  });
});
