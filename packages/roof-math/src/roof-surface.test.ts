import { describe, expect, it } from 'vitest';
import type { RoofWindowFeature } from '@cieslacalc/timber-model';
import { assemblyDefaults } from './assembly';
import { gableTemplateFromAssembly } from './gable-roof';
import { resolveRoofSurfaceGeometry } from './roof-surface';

const gable = () =>
  gableTemplateFromAssembly(assemblyDefaults, {
    id: 'template:surface-gable',
    buildingLengthMm: 8100,
    rafterSpacing: { mode: 'max-even-spacing', spacingMm: 1000 },
  });

const opening = (
  id: string,
  roofPlaneId: string,
  uMm: number,
  vMm: number,
): RoofWindowFeature => ({
  id,
  kind: 'roof-window',
  roofPlaneId,
  widthMm: 600,
  heightMm: 900,
  position: { uMm, vMm },
});

describe('roof surface geometry', () => {
  it('resolves exact gable gross plane and total areas', () => {
    const roof = gable();
    const result = resolveRoofSurfaceGeometry({ template: roof });
    const slopeLength =
      (roof.halfRunMm + roof.eaveOverhangMm) /
      Math.cos((roof.pitchDeg * Math.PI) / 180);
    expect(result.planes.map((plane) => plane.roofPlaneId)).toEqual([
      'roof-plane:left',
      'roof-plane:right',
    ]);
    expect(result.planes[0]!.grossAreaMm2).toBeCloseTo(
      roof.buildingLengthMm * slopeLength,
      6,
    );
    expect(result.grossAreaMm2).toBeCloseTo(
      roof.buildingLengthMm * slopeLength * 2,
      6,
    );
  });

  it('resolves symmetric finite hip plane areas and boundaries', () => {
    const source = gable();
    const roof = {
      ...source,
      id: 'template:surface-hip',
      type: 'hip' as const,
      buildingLengthMm: 10000,
      hipRafterSection: { widthMm: 100, depthMm: 240 },
    };
    const result = resolveRoofSurfaceGeometry({ template: roof });
    expect(result.planes).toHaveLength(4);
    expect(result.planes[0]!.grossAreaMm2).toBeCloseTo(
      result.planes[1]!.grossAreaMm2,
      6,
    );
    expect(result.planes[2]!.grossAreaMm2).toBeCloseTo(
      result.planes[3]!.grossAreaMm2,
      6,
    );
    expect(result.planes.every((plane) => plane.hipBoundaryLengthMm > 0)).toBe(
      true,
    );
    expect(JSON.stringify(result)).not.toMatch(/NaN|Infinity/);
  });

  it('deducts one or two openings only from their assigned plane', () => {
    const roof = gable();
    const features = [
      opening('feature:roof-window-1', 'roof-plane:left', 900, 1200),
      opening('feature:roof-window-2', 'roof-plane:left', 2100, 1700),
    ];
    const result = resolveRoofSurfaceGeometry({ template: roof, features });
    const left = result.planes[0]!;
    const right = result.planes[1]!;
    expect(left.openingAreaMm2).toBe(2 * 600 * 900);
    expect(left.netAreaMm2).toBe(left.grossAreaMm2 - left.openingAreaMm2);
    expect(right.openingAreaMm2).toBe(0);
    expect(right.netAreaMm2).toBe(right.grossAreaMm2);
  });

  it('uses opening union area so overlapping voids are not double-counted', () => {
    const roof = gable();
    const result = resolveRoofSurfaceGeometry({
      template: roof,
      features: [
        opening('feature:roof-window-1', 'roof-plane:left', 900, 1200),
        opening('feature:roof-window-2', 'roof-plane:left', 1200, 1500),
      ],
    });
    expect(result.planes[0]!.openingAreaMm2).toBe(600 * 900 * 2 - 300 * 600);
  });

  it('keeps exact polynomial surface deductions beyond bit-mask-sized opening sets', () => {
    const roof = gable();
    const features = Array.from({ length: 35 }, (_, index) => ({
      ...opening(
        `feature:roof-window-${index + 1}`,
        'roof-plane:left',
        100 + index * 200,
        500,
      ),
      widthMm: 100,
      heightMm: 100,
    }));
    const result = resolveRoofSurfaceGeometry({ template: roof, features });
    expect(result.planes[0]!.openingAreaMm2).toBe(35 * 100 * 100);
  });

  it('clips partial openings and flags invalid or out-of-plane geometry deterministically', () => {
    const roof = gable();
    const result = resolveRoofSurfaceGeometry({
      template: roof,
      features: [
        opening('feature:roof-window-1', 'roof-plane:left', -300, 100),
        opening('feature:roof-window-2', 'roof-plane:left', 900, 100000),
        opening('feature:roof-window-3', 'roof-plane:unknown', 0, 0),
      ],
    });
    expect(result.status).toBe('invalid');
    expect(result.issues.map((issue) => issue.code)).toEqual([
      'opening-clipped-to-plane',
      'opening-outside-plane',
      'unknown-roof-plane',
    ]);
    expect(JSON.stringify(result)).not.toMatch(/NaN|Infinity/);
  });
});
