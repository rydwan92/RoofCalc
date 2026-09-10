import {
  fitDrawing,
  layoutDimension,
  type Bounds,
  type DimensionLayout,
  type DrawingDimension,
  type Point,
  type Viewport,
} from './index';

/** Spreadsheet-style labels are presentation metadata; semantic IDs never depend on ordering. */
export function datumDisplayLabel(index: number): string {
  let result = '',
    n = index + 1;
  while (n > 0) {
    n--;
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26);
  }
  return result;
}
export interface DimensionLane {
  dimension: DrawingDimension;
  lane: number;
  layout: DimensionLayout;
}
/** Reserve projected span AND label footprint. Reuse lanes only for disjoint intervals.
 * Offsets are chosen here, never stored in the assembly or keyed to datum letters. */
export function layoutDimensionLanes(
  dimensions: DrawingDimension[],
  project: (p: Point) => Point,
  labelWidth: (d: DrawingDimension) => number,
): DimensionLane[] {
  const lanes: { min: number; max: number }[][] = [];
  return [...dimensions]
    .sort(
      (a, b) =>
        (b.priority ?? 0) - (a.priority ?? 0) || a.id.localeCompare(b.id),
    )
    .map((dimension) => {
      const a = project(dimension.from),
        b = project(dimension.to);
      const center = (a.x + b.x) / 2,
        half = labelWidth(dimension) / 2 + 12;
      const interval = {
        min: Math.min(a.x, b.x, center - half),
        max: Math.max(a.x, b.x, center + half),
      };
      let lane =
        dimension.group === 'primary' ? 0 : dimension.group === 'joint' ? 2 : 1;
      while (
        lanes[lane]?.some(
          (other) =>
            interval.min <= other.max + 12 && interval.max >= other.min - 12,
        )
      )
        lane++;
      (lanes[lane] ??= []).push(interval);
      return {
        dimension,
        lane,
        layout: layoutDimension(
          { ...dimension, offsetPx: 38 + lane * 32 },
          project,
        ),
      };
    });
}

export function dimensionLabelBounds(
  layout: DimensionLayout,
  width: number,
): Bounds {
  const angle = (layout.rotationDeg * Math.PI) / 180;
  const halfX =
    (Math.abs(Math.cos(angle)) * width) / 2 + Math.abs(Math.sin(angle)) * 12;
  const halfY =
    (Math.abs(Math.sin(angle)) * width) / 2 + Math.abs(Math.cos(angle)) * 12;
  return {
    minX: layout.label.x - halfX,
    maxX: layout.label.x + halfX,
    minY: layout.label.y - halfY,
    maxY: layout.label.y + halfY,
  };
}

/** Fit geometry AND semantic annotations. Extra lanes reserve viewport space instead of clipping.
 * Labels retain their screen-space size while the domain bounds grow to accommodate them. */
export function fitDimensionedDrawing(
  bounds: Bounds,
  viewport: Viewport,
  dimensions: DrawingDimension[],
  labelWidth: (d: DrawingDimension) => number,
) {
  const fittedBounds = { ...bounds };
  let projection = fitDrawing(fittedBounds, viewport);
  for (let pass = 0; pass < 20; pass++) {
    const lanes = layoutDimensionLanes(
      dimensions,
      projection.project,
      labelWidth,
    );
    const boxes = lanes.map(({ dimension, layout }) => {
      const box = dimensionLabelBounds(layout, labelWidth(dimension));
      return {
        minX: Math.min(box.minX, layout.a.x, layout.b.x),
        maxX: Math.max(box.maxX, layout.a.x, layout.b.x),
        minY: Math.min(box.minY, layout.a.y, layout.b.y),
        maxY: Math.max(box.maxY, layout.a.y, layout.b.y),
      };
    });
    const left = Math.max(0, ...boxes.map((b) => 14 - b.minX));
    const right = Math.max(
      0,
      ...boxes.map((b) => b.maxX - viewport.width + 14),
    );
    const top = Math.max(0, ...boxes.map((b) => 14 - b.minY));
    const bottom = Math.max(
      0,
      ...boxes.map((b) => b.maxY - viewport.height + 14),
    );
    if (Math.max(left, right, top, bottom) < 0.1) break;
    fittedBounds.minX -= left / projection.scale;
    fittedBounds.maxX += right / projection.scale;
    fittedBounds.minY -= bottom / projection.scale;
    fittedBounds.maxY += top / projection.scale;
    projection = fitDrawing(fittedBounds, viewport);
  }
  return projection;
}
