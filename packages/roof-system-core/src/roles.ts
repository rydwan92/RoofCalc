/**
 * V51 roof-system component roles and technical quantity rules.
 *
 * A role says what a component DOES on the roof; it is always a structured
 * field, never recovered from a product name, colour or SKU. Every role
 * belongs to exactly one system group. A role being listed here does not mean
 * RoofCalc derives a quantity for it — only the rules below do, and only from
 * source-backed or user-confirmed facts.
 */
export const ROOF_SYSTEM_ROLES = [
  // Covering system (roof-tile accessories, V50 compatible).
  'ridge-tile',
  'hip-ridge-tile',
  'verge-left',
  'verge-right',
  'half-tile',
  'ventilation-tile',
  // Ridge / hip build-up.
  'ridge-tape',
  'ridge-clip',
  'ridge-end',
  // Eave.
  'eave-comb',
  'ventilation-comb',
  'eave-ventilation-strip',
  'eave-strip',
  'drip-edge',
  'eave-flashing',
  'gutter-apron',
  // Verge (V52; verge tiles stay covering-system roles).
  'verge-flashing',
  'wind-board',
  // Roof openings (V52).
  'window-flashing-kit',
  'membrane-collar',
  'insulation-collar',
  // Drainage.
  'gutter-section',
  'gutter-connector',
  'gutter-corner-internal',
  'gutter-corner-external',
  'gutter-end-cap',
  'gutter-outlet',
  'gutter-hook',
  'downpipe',
  'downpipe-connector',
  'downpipe-elbow',
  'downpipe-clamp',
] as const;
export type RoofSystemRole = (typeof ROOF_SYSTEM_ROLES)[number];

export const ROOF_SYSTEM_GROUPS = [
  'covering-system',
  'ridge-hip',
  'eave',
  'verge',
  'opening',
  'drainage',
] as const;
export type RoofSystemGroup = (typeof ROOF_SYSTEM_GROUPS)[number];

export const ROOF_SYSTEM_ROLE_GROUP: Record<RoofSystemRole, RoofSystemGroup> = {
  'ridge-tile': 'covering-system',
  'hip-ridge-tile': 'covering-system',
  'verge-left': 'covering-system',
  'verge-right': 'covering-system',
  'half-tile': 'covering-system',
  'ventilation-tile': 'covering-system',
  'ridge-tape': 'ridge-hip',
  'ridge-clip': 'ridge-hip',
  'ridge-end': 'ridge-hip',
  'eave-comb': 'eave',
  'ventilation-comb': 'eave',
  'eave-ventilation-strip': 'eave',
  'eave-strip': 'eave',
  'drip-edge': 'eave',
  'eave-flashing': 'eave',
  'gutter-apron': 'eave',
  'verge-flashing': 'verge',
  'wind-board': 'verge',
  'window-flashing-kit': 'opening',
  'membrane-collar': 'opening',
  'insulation-collar': 'opening',
  'gutter-section': 'drainage',
  'gutter-connector': 'drainage',
  'gutter-corner-internal': 'drainage',
  'gutter-corner-external': 'drainage',
  'gutter-end-cap': 'drainage',
  'gutter-outlet': 'drainage',
  'gutter-hook': 'drainage',
  downpipe: 'drainage',
  'downpipe-connector': 'drainage',
  'downpipe-elbow': 'drainage',
  'downpipe-clamp': 'drainage',
};

/** V50 roof-tile accessory roles, mapped once onto the system vocabulary. */
export const TILE_ACCESSORY_SYSTEM_ROLE = {
  ridge: 'ridge-tile',
  'hip-ridge': 'hip-ridge-tile',
  'verge-left': 'verge-left',
  'verge-right': 'verge-right',
  half: 'half-tile',
  ventilation: 'ventilation-tile',
} as const satisfies Record<string, RoofSystemRole>;

/**
 * The finite vocabulary of technical quantity rules. Deliberately not an
 * expression language: a new rule is a code change with its own tests.
 */
export const QUANTITY_RULE_KINDS = [
  /** ceil(line length / installed cover length), per feature. */
  'linear-effective-cover',
  /** One element per resolved tile course at the edge it finishes. */
  'one-per-course',
  /** Evenly distributed positions with every interval ≤ the maximum. */
  'spacing-along-feature',
  /** One element at each open end of a resolved run. */
  'one-per-feature-end',
  /** One element per joint of an actual commercial assembly. */
  'one-per-joint',
  /** V52: a linear requirement bought in whole rolls (tape, strip). */
  'roll-length',
  /** V52: one element per resolved ridge/hip tile (e.g. a separate clip). */
  'one-per-ridge-tile',
  /** V52: one kit per compatible roof opening. */
  'one-per-opening',
  /** The user states the quantity. */
  'manual',
] as const;
export type QuantityRuleKind = (typeof QUANTITY_RULE_KINDS)[number];

/** Roof line kinds, mirrored structurally from the resolved topology. */
export type RoofLineKind = 'eave' | 'ridge' | 'hip' | 'verge' | 'valley';

/**
 * Roof line kinds a line-bound role belongs to. Ridge ends and clips are
 * bound to the ridge/hip network too: ends from its open ends, clips from
 * its resolved ridge tiles.
 */
export const LINE_ROLE_FEATURE_KINDS = {
  'ridge-tape': ['ridge', 'hip'],
  'ridge-end': ['ridge', 'hip'],
  'ridge-clip': ['ridge', 'hip'],
  'eave-comb': ['eave'],
  'ventilation-comb': ['eave'],
  'eave-ventilation-strip': ['eave'],
  'eave-strip': ['eave'],
  'drip-edge': ['eave'],
  'eave-flashing': ['eave'],
  'gutter-apron': ['eave'],
  'verge-flashing': ['verge'],
  'wind-board': ['verge'],
} as const satisfies Partial<Record<RoofSystemRole, readonly RoofLineKind[]>>;
export type RoofLineComponentRole = keyof typeof LINE_ROLE_FEATURE_KINDS;
export const ROOF_LINE_COMPONENT_ROLES = Object.keys(
  LINE_ROLE_FEATURE_KINDS,
) as RoofLineComponentRole[];

/**
 * V52: which quantity rules a line-bound role may use. A rule outside this
 * table is rejected — a ridge end is never priced per metre, tape never per
 * ridge tile.
 */
export const LINE_ROLE_RULES: Record<
  RoofLineComponentRole,
  readonly QuantityRuleKind[]
> = {
  'ridge-tape': ['roll-length', 'linear-effective-cover', 'manual'],
  'ridge-end': ['one-per-feature-end', 'manual'],
  'ridge-clip': ['one-per-ridge-tile', 'manual'],
  'eave-comb': ['linear-effective-cover', 'roll-length', 'manual'],
  'ventilation-comb': ['linear-effective-cover', 'roll-length', 'manual'],
  'eave-ventilation-strip': ['roll-length', 'linear-effective-cover', 'manual'],
  'eave-strip': ['linear-effective-cover', 'roll-length', 'manual'],
  'drip-edge': ['linear-effective-cover', 'manual'],
  'eave-flashing': ['linear-effective-cover', 'manual'],
  'gutter-apron': ['linear-effective-cover', 'manual'],
  'verge-flashing': ['linear-effective-cover', 'manual'],
  'wind-board': ['linear-effective-cover', 'manual'],
};
