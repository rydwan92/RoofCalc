import {
  calculateRafterWorkbench,
  workbenchInputSchema,
  memberToWorld,
  type RafterWorkbenchResult,
  type WorkbenchInput,
} from '@cieslacalc/roof-math';
import type { Point2D } from '@cieslacalc/timber-model';
import {
  boundsFromPoints,
  clipPolygon,
  type Bounds,
  type DrawingDimension,
  type DrawingModel,
} from '@cieslacalc/drawing-engine';
import type { CalculatorDefinition } from './index';

export type WorkbenchView = 'assembly' | 'member' | 'detail';
export type WorkbenchObject =
  'geometry' | 'rafter' | 'wall-plate' | 'ridge' | 'birdsmouth' | 'ridge-cut';

export function createWorkbenchDrawing(
  input: WorkbenchInput,
  result: RafterWorkbenchResult,
  view: WorkbenchView = 'assembly',
  selected: WorkbenchObject = 'geometry',
): DrawingModel {
  const fabrication = view === 'member';
  const convert = (point: Point2D) =>
    fabrication ? point : memberToWorld(point, result.member.frame);
  const points = result.member.profile.map(convert);
  const memberShape = {
    id: 'rafter',
    selectionId: 'rafter',
    points,
    role: 'member' as const,
  };
  const supports = fabrication
    ? []
    : result.supports
        .filter((s) => s.worldProfile.length > 0)
        .map((support) => ({
          id: support.id,
          selectionId: support.id,
          points: support.worldProfile,
          role: 'support' as const,
        }));
  let bounds = boundsFromPoints([
    ...points,
    ...supports.flatMap((s) => s.points),
  ]);
  const lines = result.operations.flatMap((operation) => {
    const segments =
      operation.kind === 'end-cut'
        ? [operation.line]
        : [operation.plumbLine, operation.seatLine];
    return segments.map(([from, to], i) => ({
      id: `${operation.id}-${i}`,
      ...(operation.id !== 'eave-cut' ? { selectionId: operation.id } : {}),
      from: convert(from),
      to: convert(to),
      role: 'cut' as const,
    }));
  });
  const axis = result.supports.find((s) => s.kind === 'ridge')!.topReference;
  const datums = result.member.datums.map((datum) => ({
    id: datum.id,
    at: convert(datum.point),
    selectionId:
      datum.id === 'D'
        ? 'ridge-cut'
        : datum.id === 'B' || datum.id === 'C'
          ? 'birdsmouth'
          : 'rafter',
  }));
  const at = (id: string) => datums.find((d) => d.id === id)!.at;
  let dimensions: DrawingDimension[] = [
    {
      id: 'A-D',
      from: at('A'),
      to: at('D'),
      kind: 'aligned',
      valueMm: result.member.referenceLengthMm,
      offsetPx: 40,
      fromDatum: 'A',
      toDatum: 'D',
      edge: 'top',
    },
  ];
  if (fabrication) {
    dimensions.push(
      ...result.stations.slice(0, 3).map((station) => ({
        id: station.id,
        from: at(station.from),
        to: at(station.to),
        kind: 'aligned' as const,
        valueMm: station.distanceMm,
        offsetPx: station.id === 'B-C' ? -108 : -72,
        fromDatum: station.from,
        toDatum: station.to,
        edge: station.edge,
      })),
    );
  } else {
    dimensions.push({
      id: 'run',
      from: { x: 0, y: 0 },
      to: { x: input.geometry.runMm, y: 0 },
      valueMm: input.geometry.runMm,
      kind: 'horizontal',
      offsetPx: 35,
      labelKey: 'fields.geometry.runMm',
    });
  }
  let polygons = [...supports, memberShape];
  let markers = datums;
  let labels: DrawingModel['labels'] = [];
  if (view === 'detail') {
    const isRidge = selected === 'ridge' || selected === 'ridge-cut';
    const focus = isRidge
      ? result.ridgeEnd.line.map(convert)
      : [
          ...result.seatNotch.removedProfile.map(convert),
          convert(result.member.datums.find((d) => d.id === 'B')!.point),
        ];
    const raw = boundsFromPoints(focus);
    const margin = Math.max(
      input.timber.depthMm * 0.65,
      input.wallPlate.seatLengthMm * 0.4,
      40,
    );
    bounds = {
      minX: raw.minX - margin,
      maxX: raw.maxX + margin,
      minY: raw.minY - margin,
      maxY: raw.maxY + margin,
    };
    polygons = polygons
      .map((shape) => ({ ...shape, points: clipPolygon(shape.points, bounds) }))
      .filter((shape) => shape.points.length >= 3);
    markers = datums.filter((d) => within(d.at, bounds));
    if (isRidge) {
      const [a, b] = result.ridgeEnd.line.map(convert) as [Point2D, Point2D];
      dimensions = [
        {
          id: 'ridge-height',
          from: a,
          to: b,
          valueMm: result.ridge.cutLengthMm,
          kind: 'vertical',
          offsetPx: 40,
          labelKey: 'cutHeight',
        },
      ];
      if (input.ridge.thicknessMm > 0)
        dimensions.push({
          id: 'ridge-thickness',
          from: { x: result.ridge.nearFaceXmm, y: b.y },
          to: { x: result.ridge.nearFaceXmm + input.ridge.thicknessMm, y: b.y },
          kind: 'horizontal',
          valueMm: input.ridge.thicknessMm,
          offsetPx: -44,
          labelKey: 'fields.ridge.thicknessMm',
        });
    } else {
      const [a, b] = result.seatNotch.seatLine.map(convert) as [
        Point2D,
        Point2D,
      ];
      const [bottom, heel] = result.seatNotch.plumbLine.map(convert) as [
        Point2D,
        Point2D,
      ];
      dimensions = [
        {
          id: 'seat',
          from: a,
          to: b,
          valueMm: input.wallPlate.seatLengthMm,
          kind: 'horizontal',
          offsetPx: 40,
          labelKey: 'seat',
        },
        {
          id: 'vertical-rise',
          from: bottom,
          to: heel,
          valueMm: result.notch.verticalRiseAcrossSeatMm,
          kind: 'vertical',
          offsetPx: -45,
          labelKey: 'heelHeight',
        },
      ];
    }
  } else if (!fabrication) {
    labels = [
      {
        id: 'plate-label',
        at: { x: input.wallPlate.widthMm / 2, y: -140 },
        textKey: 'objects.wall-plate',
      },
      { id: 'ridge-label', at: axis[1], textKey: 'ridgeAxis' },
    ];
  }
  return {
    bounds,
    polygons,
    markers,
    labels,
    dimensions,
    angles: [],
    lines: [
      ...(!fabrication
        ? [
            {
              id: 'ridge-axis',
              selectionId: 'ridge',
              from: axis[0],
              to: axis[1],
              role: 'axis' as const,
            },
          ]
        : []),
      ...lines.filter(
        (line) =>
          view !== 'detail' ||
          within(line.from, bounds) ||
          within(line.to, bounds),
      ),
    ].filter(
      (line) =>
        view !== 'detail' ||
        within(line.from, bounds) ||
        within(line.to, bounds),
    ),
  };
}
function within(point: Point2D, bounds: Bounds) {
  return (
    point.x >= bounds.minX &&
    point.x <= bounds.maxX &&
    point.y >= bounds.minY &&
    point.y <= bounds.maxY
  );
}

/** Same stable calculator ID; explicit v2 fabrication behavior, v1 remains available. */
export const rafterWorkbench: CalculatorDefinition<
  WorkbenchInput,
  RafterWorkbenchResult
> = {
  id: 'common-rafter',
  version: '2.0.0',
  category: 'rafters',
  titleKey: 'commonRafter',
  inputSchema: workbenchInputSchema,
  calculate: calculateRafterWorkbench,
  createDrawing: (input, result) => createWorkbenchDrawing(input, result),
  requiredEntitlement: 'calculator.common-rafter',
};
