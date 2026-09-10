export interface Point {
  x: number;
  y: number;
}
export interface Point3D {
  x: number;
  y: number;
  z: number;
}
export interface AxonometricProjectionOptions {
  horizontalFactor?: number;
  depthFactor?: number;
}
/** Projects y-up world XYZ into a renderer-neutral 2D axonometric plane. */
export function projectAxonometric(
  point: Point3D,
  options: AxonometricProjectionOptions = {},
): Point {
  const horizontalFactor = options.horizontalFactor ?? Math.sqrt(3) / 2;
  const depthFactor = options.depthFactor ?? 0.5;
  if (
    ![point.x, point.y, point.z, horizontalFactor, depthFactor].every(
      Number.isFinite,
    )
  )
    throw new RangeError('invalid_projection');
  return {
    x: (point.x - point.y) * horizontalFactor,
    y: point.z - (point.x + point.y) * depthFactor,
  };
}
export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
export interface DrawingLine {
  id: string;
  from: Point;
  to: Point;
  role: 'member' | 'reference' | 'tail' | 'cut' | 'axis';
  selectionId?: string;
}
export interface DrawingDimension {
  id: string;
  from: Point;
  to: Point;
  valueMm: number;
  kind: 'horizontal' | 'vertical' | 'aligned';
  offsetPx?: number;
  labelKey?: string;
  edge?: 'top' | 'bottom';
  fromDatum?: string;
  toDatum?: string;
  fromLabel?: string;
  toLabel?: string;
  group?: 'primary' | 'support' | 'joint';
  priority?: number;
}
export interface DrawingAngle {
  id: string;
  at: Point;
  degrees: number;
}
export interface DrawingModel {
  bounds: Bounds;
  lines: DrawingLine[];
  dimensions: DrawingDimension[];
  angles: DrawingAngle[];
  polygons?: DrawingPolygon[];
  markers?: DrawingMarker[];
  labels?: DrawingLabel[];
}
export interface DrawingPolygon {
  id: string;
  points: Point[];
  role: 'member' | 'support' | 'stock';
  selectionId?: string;
}
export interface DrawingMarker {
  id: string;
  label?: string;
  at: Point;
  selectionId?: string;
}
export interface DrawingLabel {
  id: string;
  at: Point;
  textKey: string;
}
export interface Viewport {
  width: number;
  height: number;
  padding: number;
}

export function boundsFromPoints(points: Point[]): Bounds {
  if (
    !points.length ||
    !points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
  )
    throw new RangeError('invalid_points');
  return {
    minX: Math.min(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)),
    maxX: Math.max(...points.map((p) => p.x)),
    maxY: Math.max(...points.map((p) => p.y)),
  };
}

/** Clip a polygon to a detail viewport, preserving the actual shape of retained material. */
export function clipPolygon(points: Point[], bounds: Bounds): Point[] {
  let output = points;
  for (const edge of ['left', 'right', 'bottom', 'top'] as const) {
    const axis = edge === 'left' || edge === 'right' ? 'x' : 'y';
    const value =
      edge === 'left'
        ? bounds.minX
        : edge === 'right'
          ? bounds.maxX
          : edge === 'bottom'
            ? bounds.minY
            : bounds.maxY;
    const inside = (p: Point) =>
      edge === 'left' || edge === 'bottom'
        ? p[axis] >= value
        : p[axis] <= value;
    const next: Point[] = [];
    for (let i = 0; i < output.length; i++) {
      const a = output[i]!,
        b = output[(i + 1) % output.length]!;
      if (inside(a)) next.push(a);
      if (inside(a) !== inside(b)) {
        const ratio = (value - a[axis]) / (b[axis] - a[axis]);
        next.push({
          x: a.x + (b.x - a.x) * ratio,
          y: a.y + (b.y - a.y) * ratio,
        });
      }
    }
    output = next;
  }
  return output;
}

export interface DimensionLayout {
  a: Point;
  b: Point;
  label: Point;
  rotationDeg: number;
  extensionA: Point;
  extensionB: Point;
}
/** Screen-space annotation layout belongs to the drawing engine, never to calculation code. */
export function layoutDimension(
  dimension: DrawingDimension,
  project: (point: Point) => Point,
): DimensionLayout {
  const a = project(dimension.from),
    b = project(dimension.to);
  const offset = dimension.offsetPx ?? 34;
  if (dimension.kind === 'horizontal') {
    const y = Math.max(a.y, b.y) + offset;
    return {
      a: { x: a.x, y },
      b: { x: b.x, y },
      extensionA: a,
      extensionB: b,
      label: { x: (a.x + b.x) / 2, y: y + 18 },
      rotationDeg: 0,
    };
  }
  if (dimension.kind === 'vertical') {
    const x = Math.max(a.x, b.x) + offset;
    return {
      a: { x, y: a.y },
      b: { x, y: b.y },
      extensionA: a,
      extensionB: b,
      label: { x: x + 16, y: (a.y + b.y) / 2 },
      rotationDeg: -90,
    };
  }
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  const ox = length > 1e-8 ? (dy / length) * offset : 0;
  const oy = length > 1e-8 ? (-dx / length) * offset : -offset;
  return {
    a: { x: a.x + ox, y: a.y + oy },
    b: { x: b.x + ox, y: b.y + oy },
    extensionA: a,
    extensionB: b,
    label: { x: (a.x + b.x) / 2 + ox, y: (a.y + b.y) / 2 + oy - 8 },
    rotationDeg: (Math.atan2(dy, dx) * 180) / Math.PI,
  };
}

/** Uniform scale, y-up domain coordinates -> y-down display coordinates. */
export function fitDrawing(bounds: Bounds, viewport: Viewport) {
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  if (
    ![width, height, viewport.width, viewport.height, viewport.padding].every(
      Number.isFinite,
    ) ||
    width <= 0 ||
    height < 0 ||
    viewport.padding < 0 ||
    viewport.width <= 2 * viewport.padding ||
    viewport.height <= 2 * viewport.padding
  )
    throw new RangeError('invalid_bounds');
  const scale = Math.min(
    (viewport.width - 2 * viewport.padding) / Math.max(width, 1),
    (viewport.height - 2 * viewport.padding) / Math.max(height, 1),
  );
  const left = (viewport.width - width * scale) / 2;
  const top = (viewport.height - height * scale) / 2;
  return {
    scale,
    unproject: (point: Point): Point => ({
      x: bounds.minX + (point.x - left) / scale,
      y: bounds.maxY - (point.y - top) / scale,
    }),
    project: (point: Point): Point => ({
      x: left + (point.x - bounds.minX) * scale,
      y: top + (bounds.maxY - point.y) * scale,
    }),
  };
}

export * from './interaction';
export * from './lanes';
