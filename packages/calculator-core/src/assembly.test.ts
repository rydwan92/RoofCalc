import { expect, it } from 'vitest';
import {
  addPurlin,
  assemblyDefaults,
  calculateAssembly,
} from '@cieslacalc/roof-math';
import {
  assemblyWorkbench,
  calculatorRegistry,
  calculatorVersions,
  createAssemblyDrawing,
} from './index';
import {
  dimensionLabelBounds,
  fitDimensionedDrawing,
  layoutDimensionLanes,
} from '@cieslacalc/drawing-engine';
it('keeps historical K1 versions while registering the new H1 module', () => {
  expect(calculatorRegistry['common-rafter']).toBe(assemblyWorkbench);
  expect(Object.keys(calculatorVersions)).toEqual([
    'common-rafter@1.0.0',
    'common-rafter@2.0.0',
    'common-rafter@3.0.0',
    'hip-rafter@1.0.0',
  ]);
});
it.each([1, 35, 80])(
  'fits dimension labels without clipping at %s degrees and mobile/desktop widths',
  (pitchDeg) => {
    const spec = addPurlin(assemblyDefaults);
    spec.roof.pitchDeg = pitchDeg;
    const result = calculateAssembly(spec);
    for (const width of [336, 820]) {
      for (const focus of [undefined, result.assembly.joints[1]!.id]) {
        const model = createAssemblyDrawing(result.assembly, focus);
        const dimensions = model.dimensions.filter(
          (d) => !!focus || width > 550 || d.group === 'primary',
        );
        const labelWidth = (d: (typeof dimensions)[number]) =>
          `${d.fromLabel ?? ''} → ${d.toLabel ?? ''} ${d.valueMm.toFixed(1)} mm`
            .length * 6.5;
        const viewport = {
          width,
          height: width > 550 ? 570 : 400,
          padding: width > 550 ? 115 : 48,
        };
        const fit = fitDimensionedDrawing(
          model.bounds,
          viewport,
          dimensions,
          labelWidth,
        );
        for (const lane of layoutDimensionLanes(
          dimensions,
          fit.project,
          labelWidth,
        )) {
          const box = dimensionLabelBounds(
            lane.layout,
            labelWidth(lane.dimension),
          );
          expect(box.minX).toBeGreaterThanOrEqual(13);
          expect(box.minY).toBeGreaterThanOrEqual(13);
          expect(box.maxX).toBeLessThanOrEqual(width - 13);
          expect(box.maxY).toBeLessThanOrEqual(viewport.height - 13);
        }
      }
    }
  },
);
it('draws the actual dynamic support/joint model with semantic dimension intents', () => {
  const spec = addPurlin(assemblyDefaults),
    result = calculateAssembly(spec),
    drawing = createAssemblyDrawing(result.assembly);
  expect(drawing.polygons?.map((p) => p.id)).toContain('support:purlin-1');
  expect(
    drawing.lines.some((l) => l.selectionId === result.assembly.joints[1]!.id),
  ).toBe(true);
  expect(drawing.markers?.map((m) => m.label)).toEqual([
    'A',
    'B',
    'C',
    'D',
    'E',
    'F',
  ]);
  expect(drawing.markers?.every((m) => m.id.startsWith('datum:'))).toBe(true);
  expect(
    drawing.dimensions.every(
      (d) =>
        d.fromDatum?.startsWith('datum:') && d.toDatum?.startsWith('datum:'),
    ),
  ).toBe(true);
  expect(
    drawing.dimensions.every(
      (d) => d.offsetPx === undefined && d.group && d.priority,
    ),
  ).toBe(true);
  spec.supports[1]!.placement.xMm += 100;
  expect(createAssemblyDrawing(calculateAssembly(spec).assembly)).not.toEqual(
    drawing,
  );
});
it('clips contextual detail from the same profile and filters unrelated dimensions', () => {
  const { assembly } = calculateAssembly(addPurlin(assemblyDefaults));
  const id = assembly.joints[1]!.id,
    drawing = createAssemblyDrawing(assembly, id);
  expect(drawing.lines.every((l) => l.selectionId === id)).toBe(true);
  expect(drawing.dimensions).toHaveLength(2);
  expect(drawing.dimensions[1]!.valueMm).toBeCloseTo(
    assembly.joints[1]!.normalDepthMm,
  );
  for (const p of drawing.polygons!.flatMap((p) => p.points)) {
    expect(p.x).toBeGreaterThanOrEqual(drawing.bounds.minX - 1e-8);
    expect(p.x).toBeLessThanOrEqual(drawing.bounds.maxX + 1e-8);
    expect(p.y).toBeGreaterThanOrEqual(drawing.bounds.minY - 1e-8);
    expect(p.y).toBeLessThanOrEqual(drawing.bounds.maxY + 1e-8);
  }
});
