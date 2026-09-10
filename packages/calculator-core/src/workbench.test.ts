import { describe, expect, it } from 'vitest';
import {
  calculateRafterWorkbench,
  workbenchDefaults,
} from '@cieslacalc/roof-math';
import { createWorkbenchDrawing } from './workbench';
import { calculatorRegistry, calculatorVersions } from './index';

describe('workbench drawing adapter', () => {
  it('retains historical v1/v2 while launching explicit v3 under the stable calculator ID', () => {
    expect(calculatorRegistry['common-rafter'].version).toBe('3.0.0');
    expect(calculatorVersions['common-rafter@2.0.0'].version).toBe('2.0.0');
    expect(
      calculatorVersions['common-rafter@1.0.0'].calculate({
        runMm: 1000,
        pitchDeg: 30,
        overhangMm: 0,
      }).totalLengthMm,
    ).toBeCloseTo(1154.700538379252, 10);
  });
  it('draws real member/support polygons and selectable fabrication operations', () => {
    const result = calculateRafterWorkbench(workbenchDefaults);
    const drawing = createWorkbenchDrawing(workbenchDefaults, result);
    expect(drawing.polygons?.map((p) => p.id)).toEqual([
      'wall-plate',
      'ridge',
      'rafter',
    ]);
    expect(
      drawing.polygons?.find((p) => p.id === 'rafter')?.points.length,
    ).toBe(7);
    expect(
      drawing.lines.filter((line) => line.selectionId === 'birdsmouth').length,
    ).toBe(2);
  });
  it('member view uses local member coordinates and top-edge manufacturing dimensions', () => {
    const result = calculateRafterWorkbench(workbenchDefaults);
    const drawing = createWorkbenchDrawing(workbenchDefaults, result, 'member');
    expect(drawing.polygons?.length).toBe(1);
    expect(drawing.polygons?.[0]?.points).toEqual(result.member.profile);
    expect(
      drawing.markers?.every(
        (datum) => datum.at.y === workbenchDefaults.timber.depthMm,
      ),
    ).toBe(true);
    expect(drawing.dimensions.map((dimension) => dimension.id)).toEqual([
      'A-D',
      'A-B',
      'B-C',
      'C-D',
    ]);
  });
  it.each(['birdsmouth', 'ridge-cut'] as const)(
    'clips an enlarged %s to its actual detail region',
    (selection) => {
      const result = calculateRafterWorkbench(workbenchDefaults);
      const drawing = createWorkbenchDrawing(
        workbenchDefaults,
        result,
        'detail',
        selection,
      );
      for (const shape of drawing.polygons ?? []) {
        for (const p of shape.points) {
          expect(p.x).toBeGreaterThanOrEqual(drawing.bounds.minX - 1e-9);
          expect(p.x).toBeLessThanOrEqual(drawing.bounds.maxX + 1e-9);
          expect(p.y).toBeGreaterThanOrEqual(drawing.bounds.minY - 1e-9);
          expect(p.y).toBeLessThanOrEqual(drawing.bounds.maxY + 1e-9);
        }
      }
      expect(JSON.stringify(drawing)).not.toMatch(/null|NaN|Infinity/);
      expect(drawing.bounds.maxX - drawing.bounds.minX).toBeLessThan(1000);
    },
  );
});
