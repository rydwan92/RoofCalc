type Point = [number, number, number];

export interface RegularHipRecognition {
  evidence: string[];
  proposed: {
    buildingLengthMm: number;
    buildingWidthMm: number;
    pitchDeg: number;
  };
  geometry: {
    ridgeDirection: readonly [number, number];
    eaveLevelMm: number;
    ridgeLevelMm: number;
    planCentreMm: readonly [number, number];
    halfRunMm: number;
    ridgeLengthMm: number;
  };
}

/**
 * Regular hip roof: four planar faces with one equal pitch over a
 * rectangular plan, one horizontal ridge centred in the outline and four hip
 * edges at 45° in plan. Evidence is the complete triangulated surface, never a
 * bounding box:
 * - every vertex lies on z = rise · min(h − |v|, u − u0, u1 − u) / h;
 * - every triangle lies entirely in one face's plane (no fold, no cross-face);
 * - each face's plan area equals the ideal trapezoid / triangle area;
 * - every boundary edge lies on the rectangular outline (no holes).
 * A pyramid (no ridge), unequal pitches or any extra face are rejected.
 *
 * `points` are millimetres relative to an arbitrary origin, Z up.
 */
export function recognizeRegularHip(
  points: readonly Point[],
  triangles: readonly (readonly [number, number, number])[],
  min: readonly number[],
  max: readonly number[],
  tolerance: number,
): RegularHipRecognition | undefined {
  const near = (a: number, b: number, scale = 1) =>
    Math.abs(a - b) <= tolerance * scale;
  const rise = max[2]! - min[2]!;
  if (rise <= tolerance * 10 || triangles.length < 4) return undefined;
  const top = points.filter((p) => near(p[2], max[2]!));
  if (!top.length) return undefined;
  const farthest = (from: Point) =>
    top.reduce((best, p) =>
      Math.hypot(p[0] - from[0], p[1] - from[1]) >
      Math.hypot(best[0] - from[0], best[1] - from[1])
        ? p
        : best,
    );
  const a = farthest(top[0]!);
  const b = farthest(a);
  const ridgeLength = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (ridgeLength <= tolerance * 10) return undefined;
  const dx = (b[0] - a[0]) / ridgeLength;
  const dy = (b[1] - a[1]) / ridgeLength;
  const projected: Point[] = points.map((p) => [
    (p[0] - a[0]) * dx + (p[1] - a[1]) * dy,
    -(p[0] - a[0]) * dy + (p[1] - a[1]) * dx,
    p[2] - min[2]!,
  ]);
  let u0 = Infinity;
  let u1 = -Infinity;
  let v0 = Infinity;
  let v1 = -Infinity;
  for (const [u, v] of projected) {
    u0 = Math.min(u0, u);
    u1 = Math.max(u1, u);
    v0 = Math.min(v0, v);
    v1 = Math.max(v1, v);
  }
  const halfRun = (v1 - v0) / 2;
  if (halfRun <= tolerance * 10) return undefined;
  // Equal pitch: the ridge is centred and each hip end runs back exactly h.
  if (
    !near(v0, -v1, 2) ||
    !near(-u0, halfRun, 2) ||
    !near(u1 - ridgeLength, halfRun, 2)
  )
    return undefined;
  const slope = rise / halfRun;
  const terms = ([u, v]: Point) =>
    [halfRun - v, halfRun + v, u - u0, u1 - u] as const;
  const surface = (p: Point) => slope * Math.max(0, Math.min(...terms(p)));
  const residual = tolerance * Math.max(4, slope * 4);
  if (projected.some((p) => Math.abs(p[2] - surface(p)) > residual))
    return undefined;

  const welded = new Map<string, number>();
  const ids = projected.map((p) => {
    const key = p.map((value) => Math.round(value / tolerance)).join(',');
    if (!welded.has(key)) welded.set(key, welded.size);
    return welded.get(key)!;
  });
  const faces = new Set<string>();
  const edges = new Map<string, { count: number; a: Point; b: Point }>();
  const areas = [0, 0, 0, 0];
  for (const triangle of triangles) {
    const key = triangle
      .map((id) => ids[id]!)
      .sort((x, y) => x - y)
      .join(':');
    if (faces.has(key)) return undefined;
    faces.add(key);
    const [p, q, r] = triangle.map((id) => projected[id]!) as [
      Point,
      Point,
      Point,
    ];
    const centroid: Point = [
      (p[0] + q[0] + r[0]) / 3,
      (p[1] + q[1] + r[1]) / 3,
      0,
    ];
    const centroidTerms = terms(centroid);
    const face = centroidTerms.indexOf(Math.min(...centroidTerms));
    // All three vertices on this face's own plane: planar, not folded.
    if (
      [p, q, r].some(
        (vertex) =>
          Math.abs(vertex[2] - slope * terms(vertex)[face]!) > residual,
      )
    )
      return undefined;
    const area =
      Math.abs((q[0] - p[0]) * (r[1] - p[1]) - (r[0] - p[0]) * (q[1] - p[1])) /
      2;
    if (area <= tolerance * tolerance) return undefined;
    areas[face]! += area;
    for (let i = 0; i < 3; i++) {
      const start = triangle[i]!;
      const end = triangle[(i + 1) % 3]!;
      const edgeKey = [ids[start]!, ids[end]!].sort((x, y) => x - y).join(':');
      const edge = edges.get(edgeKey);
      if (edge) edge.count++;
      else
        edges.set(edgeKey, {
          count: 1,
          a: projected[start]!,
          b: projected[end]!,
        });
    }
  }
  const length = u1 - u0;
  const sideArea = ((length + ridgeLength) / 2) * halfRun;
  const endArea = halfRun * halfRun;
  const areaTolerance = tolerance * (length + halfRun) * 4;
  if (
    [sideArea, sideArea, endArea, endArea].some(
      (expected, face) => Math.abs(areas[face]! - expected) > areaTolerance,
    )
  )
    return undefined;
  const onOutline = (p: Point, q: Point) =>
    (near(p[0], u0, 2) && near(q[0], u0, 2)) ||
    (near(p[0], u1, 2) && near(q[0], u1, 2)) ||
    (near(p[1], v0, 2) && near(q[1], v0, 2)) ||
    (near(p[1], v1, 2) && near(q[1], v1, 2));
  for (const edge of edges.values()) {
    if (edge.count === 2) continue;
    if (edge.count !== 1 || !onOutline(edge.a, edge.b)) return undefined;
  }
  return {
    evidence: [
      'horizontal-ridge',
      'four-planar-faces',
      'equal-slopes',
      'rectangular-footprint',
      'consistent-hip-edges',
    ],
    proposed: {
      buildingLengthMm: length,
      buildingWidthMm: halfRun * 2,
      pitchDeg: (Math.atan(slope) * 180) / Math.PI,
    },
    geometry: {
      ridgeDirection: [dx, dy],
      planCentreMm: [
        a[0] + dx * ((u0 + u1) / 2) - dy * ((v0 + v1) / 2),
        a[1] + dy * ((u0 + u1) / 2) + dx * ((v0 + v1) / 2),
      ],
      eaveLevelMm: min[2]!,
      ridgeLevelMm: max[2]!,
      halfRunMm: halfRun,
      ridgeLengthMm: ridgeLength,
    },
  };
}
