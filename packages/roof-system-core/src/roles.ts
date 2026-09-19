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
  'eave-strip',
  'eave-flashing',
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
  'eave-strip': 'eave',
  'eave-flashing': 'eave',
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
  /** The user states the quantity. */
  'manual',
] as const;
export type QuantityRuleKind = (typeof QUANTITY_RULE_KINDS)[number];

/** Roof line kinds, mirrored structurally from the resolved topology. */
export type RoofLineKind = 'eave' | 'ridge' | 'hip' | 'verge' | 'valley';

/** Roof line kinds a line-running role is installed along. */
export const LINE_ROLE_FEATURE_KINDS = {
  'ridge-tape': ['ridge', 'hip'],
  'eave-comb': ['eave'],
  'ventilation-comb': ['eave'],
  'eave-strip': ['eave'],
  'eave-flashing': ['eave'],
} as const satisfies Partial<Record<RoofSystemRole, readonly RoofLineKind[]>>;
export type RoofLineComponentRole = keyof typeof LINE_ROLE_FEATURE_KINDS;
export const ROOF_LINE_COMPONENT_ROLES = Object.keys(
  LINE_ROLE_FEATURE_KINDS,
) as RoofLineComponentRole[];
