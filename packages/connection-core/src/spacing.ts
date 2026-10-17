/**
 * Minimum spacings and edge/end distances for dowel-type fasteners,
 * PN-EN 1995-1-1 Table 8.4 (bolts) and Table 8.5 (dowels).
 *
 * This is **detailing geometry**: where a fastener may sit in the timber so
 * that the design rules of Section 8 apply. It says nothing about capacity —
 * how many fasteners a node needs is a structural design result.
 *
 * Symbols (EN 1995-1-1 Figure 8.7), d = fastener diameter, α = angle
 * between the force and the grain:
 *   a1  spacing parallel to the grain
 *   a2  spacing perpendicular to the grain
 *   a3,t / a3,c  distance to the loaded / unloaded end
 *   a4,t / a4,c  distance to the loaded / unloaded edge
 *
 * Sources and the hand-checked vectors are in
 * `docs/domain/ROOF_TIMBER_CONNECTIONS_AND_STANDARDS.md`. Table 8.2 (nails)
 * is deliberately absent until its values are verified against the text of
 * the standard.
 */

export type SpacingFastener = 'bolt' | 'dowel';

export interface SpacingValue {
  /** Millimetres, rounded to 0.1 mm. */
  mm: number;
  /** The table row the value comes from. */
  rule: string;
}

export interface MinimumSpacings {
  fastener: SpacingFastener;
  diameterMm: number;
  angleDeg: number;
  table: 'Tablica 8.4' | 'Tablica 8.5';
  a1: SpacingValue;
  a2: SpacingValue;
  /** The end distance that applies at this angle: loaded or unloaded end. */
  a3: SpacingValue & { end: 'loaded' | 'unloaded' };
  /** The edge distance that applies at this angle. */
  a4: SpacingValue & { edge: 'loaded' | 'unloaded' };
  /** Both end and edge values, for a force whose direction may reverse. */
  a3t: SpacingValue;
  a3c: SpacingValue;
  a4t: SpacingValue;
  a4c: SpacingValue;
}

const round = (value: number) => Math.round(value * 10) / 10;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** α in [0, 360). */
export function normalizeAngle(angleDeg: number): number {
  const value = angleDeg % 360;
  return value < 0 ? value + 360 : value;
}

export const SPACING_LIMITS = {
  /** Bolts EN 1995-1-1 8.5; dowels 8.6 (6–30 mm). */
  minDiameterMm: 6,
  maxDiameterMm: 30,
  /** Minimum loaded end distance for bolts and dowels. */
  minLoadedEndMm: 80,
} as const;

/**
 * Minimum spacings and distances for one bolt or dowel diameter at one
 * force-to-grain angle. Throws on a diameter outside 6–30 mm, the range
 * Section 8.5/8.6 is written for.
 */
export function minimumSpacingsEc5(input: {
  fastener: SpacingFastener;
  diameterMm: number;
  angleDeg: number;
}): MinimumSpacings {
  const d = input.diameterMm;
  if (
    !Number.isFinite(d) ||
    d < SPACING_LIMITS.minDiameterMm ||
    d > SPACING_LIMITS.maxDiameterMm
  )
    throw new RangeError(`fastener diameter ${d} mm outside 6–30 mm`);
  const alpha = normalizeAngle(input.angleDeg);
  const sin = Math.sin(rad(alpha));
  const absCos = Math.abs(Math.cos(rad(alpha)));
  const absSin = Math.abs(sin);
  const bolt = input.fastener === 'bolt';

  const a3tMm = Math.max(7 * d, SPACING_LIMITS.minLoadedEndMm);
  const a3t = { mm: round(a3tMm), rule: 'max(7d; 80 mm)' };
  // Unloaded end, 90° ≤ α ≤ 270°. Outside that band the end is loaded; the
  // a3,c formula is still evaluated with |sin α| so a force that may reverse
  // can be enveloped (see `spacingEnvelopeEc5`).
  let a3c: SpacingValue;
  if (bolt) {
    a3c =
      alpha >= 150 && alpha < 210
        ? { mm: round(4 * d), rule: '4d' }
        : {
            mm: round(Math.max((1 + 6 * absSin) * d, 4 * d)),
            rule: 'max((1 + 6|sin α|)d; 4d)',
          };
  } else {
    a3c =
      alpha >= 150 && alpha < 210
        ? { mm: round(3 * d), rule: '3d' }
        : {
            mm: round(Math.max(a3tMm * absSin, 3 * d)),
            rule: 'max(a3,t|sin α|; 3d)',
          };
  }
  const a4t: SpacingValue = {
    mm: round(Math.max((2 + 2 * absSin) * d, 3 * d)),
    rule: 'max((2 + 2 sin α)d; 3d)',
  };
  const a4c: SpacingValue = { mm: round(3 * d), rule: '3d' };
  const a1: SpacingValue = bolt
    ? { mm: round((4 + absCos) * d), rule: '(4 + |cos α|)d' }
    : { mm: round((3 + 2 * absCos) * d), rule: '(3 + 2|cos α|)d' };
  const a2: SpacingValue = bolt
    ? { mm: round(4 * d), rule: '4d' }
    : { mm: round(3 * d), rule: '3d' };

  // Loaded end: −90° ≤ α ≤ 90°; loaded edge: 0° ≤ α ≤ 180°.
  const loadedEnd = alpha <= 90 || alpha >= 270;
  const loadedEdge = alpha <= 180;
  return {
    fastener: input.fastener,
    diameterMm: d,
    angleDeg: alpha,
    table: bolt ? 'Tablica 8.4' : 'Tablica 8.5',
    a1,
    a2,
    a3: loadedEnd ? { ...a3t, end: 'loaded' } : { ...a3c, end: 'unloaded' },
    a4: loadedEdge ? { ...a4t, edge: 'loaded' } : { ...a4c, edge: 'unloaded' },
    a3t,
    a3c,
    a4t,
    a4c,
  };
}

/**
 * The governing (largest) value of each distance over every force
 * direction. A roof member sees wind suction and pressure, so before a
 * designer fixes the force direction the envelope is the safe layout basis.
 */
export function spacingEnvelopeEc5(input: {
  fastener: SpacingFastener;
  diameterMm: number;
}): {
  a1: number;
  a2: number;
  a3: number;
  a4: number;
} {
  let a1 = 0;
  let a2 = 0;
  let a3 = 0;
  let a4 = 0;
  for (let angle = 0; angle < 360; angle += 5) {
    const spacing = minimumSpacingsEc5({ ...input, angleDeg: angle });
    a1 = Math.max(a1, spacing.a1.mm);
    a2 = Math.max(a2, spacing.a2.mm);
    a3 = Math.max(a3, spacing.a3t.mm, spacing.a3c.mm);
    a4 = Math.max(a4, spacing.a4t.mm, spacing.a4c.mm);
  }
  return { a1, a2, a3, a4 };
}

export type RowFit =
  | {
      status: 'fits';
      requiredDepthMm: number;
      availableDepthMm: number;
    }
  | {
      status: 'too-shallow';
      requiredDepthMm: number;
      availableDepthMm: number;
      /** How many fasteners one row across this depth can take. */
      maxCount: number;
    };

/**
 * Does one row of `count` fasteners across the grain fit in a member of
 * the given depth? Needs an edge distance on each side and a2 between
 * fasteners: 2·a4 + (n − 1)·a2 ≤ depth, with the direction-independent
 * envelope. Detailing feasibility only.
 */
export function fastenerRowFit(input: {
  fastener: SpacingFastener;
  diameterMm: number;
  count: number;
  memberDepthMm: number;
}): RowFit {
  const envelope = spacingEnvelopeEc5(input);
  const count = Math.max(1, Math.floor(input.count));
  const requiredDepthMm = round(2 * envelope.a4 + (count - 1) * envelope.a2);
  if (requiredDepthMm <= input.memberDepthMm + 1e-9)
    return {
      status: 'fits',
      requiredDepthMm,
      availableDepthMm: input.memberDepthMm,
    };
  const room = input.memberDepthMm - 2 * envelope.a4;
  return {
    status: 'too-shallow',
    requiredDepthMm,
    availableDepthMm: input.memberDepthMm,
    maxCount: room < 0 ? 0 : 1 + Math.floor(room / envelope.a2 + 1e-9),
  };
}
