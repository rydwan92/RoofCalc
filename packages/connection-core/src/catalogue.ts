import type { StandardReference } from './standards';

/**
 * The vocabulary of roof timber connections: member roles, the nodes
 * (węzły) where two roles meet, and the connection types used at them.
 *
 * Codes only — no translated text. A node kind is a structured fact about
 * the roof (which roles meet), never derived from an entity ID (ADR-007).
 */

/** What a member does in the roof, independent of its generated ID. */
export type RoofMemberRole =
  | 'common-rafter'
  | 'hip-rafter'
  | 'jack-rafter'
  | 'wall-plate'
  | 'ridge-board'
  | 'purlin'
  | 'collar-tie'
  | 'opening-header'
  | 'counter-batten'
  | 'batten'
  /** The supporting wall or ring beam a wall plate is anchored to. */
  | 'substrate';

/** A place where two roles meet; one kind per meaningful detail. */
export type RoofNodeKind =
  | 'rafter-wall-plate'
  | 'rafter-ridge'
  | 'rafter-purlin'
  | 'collar-tie-rafter'
  | 'hip-rafter-ridge'
  | 'hip-rafter-wall-plate'
  | 'jack-rafter-hip-rafter'
  | 'jack-rafter-wall-plate'
  | 'opening-header-rafter'
  | 'wall-plate-anchorage'
  | 'counter-batten-rafter'
  | 'batten-counter-batten';

export interface RoofNodeDefinition {
  kind: RoofNodeKind;
  participants: readonly [RoofMemberRole, RoofMemberRole];
  /**
   * The member a fastener row crosses, whose section limits how many
   * fasteners fit (edge distances). Absent where fasteners are driven along
   * the grain or the limit is product-specific.
   */
  limitingRoles?: readonly RoofMemberRole[];
}

export const ROOF_NODES: Record<RoofNodeKind, RoofNodeDefinition> = {
  'rafter-wall-plate': {
    kind: 'rafter-wall-plate',
    participants: ['common-rafter', 'wall-plate'],
  },
  'rafter-ridge': {
    kind: 'rafter-ridge',
    participants: ['common-rafter', 'ridge-board'],
    limitingRoles: ['common-rafter'],
  },
  'rafter-purlin': {
    kind: 'rafter-purlin',
    participants: ['common-rafter', 'purlin'],
  },
  'collar-tie-rafter': {
    kind: 'collar-tie-rafter',
    participants: ['collar-tie', 'common-rafter'],
    limitingRoles: ['collar-tie', 'common-rafter'],
  },
  'hip-rafter-ridge': {
    kind: 'hip-rafter-ridge',
    participants: ['hip-rafter', 'ridge-board'],
  },
  'hip-rafter-wall-plate': {
    kind: 'hip-rafter-wall-plate',
    participants: ['hip-rafter', 'wall-plate'],
  },
  'jack-rafter-hip-rafter': {
    kind: 'jack-rafter-hip-rafter',
    participants: ['jack-rafter', 'hip-rafter'],
  },
  'jack-rafter-wall-plate': {
    kind: 'jack-rafter-wall-plate',
    participants: ['jack-rafter', 'wall-plate'],
  },
  'opening-header-rafter': {
    kind: 'opening-header-rafter',
    participants: ['opening-header', 'common-rafter'],
  },
  'wall-plate-anchorage': {
    kind: 'wall-plate-anchorage',
    participants: ['wall-plate', 'substrate'],
  },
  'counter-batten-rafter': {
    kind: 'counter-batten-rafter',
    participants: ['counter-batten', 'common-rafter'],
  },
  'batten-counter-batten': {
    kind: 'batten-counter-batten',
    participants: ['batten', 'counter-batten'],
  },
};

/** Display order: from the wall up to the ridge, then build-up layers. */
export const ROOF_NODE_ORDER: readonly RoofNodeKind[] = [
  'wall-plate-anchorage',
  'rafter-wall-plate',
  'jack-rafter-wall-plate',
  'hip-rafter-wall-plate',
  'rafter-purlin',
  'collar-tie-rafter',
  'opening-header-rafter',
  'jack-rafter-hip-rafter',
  'rafter-ridge',
  'hip-rafter-ridge',
  'counter-batten-rafter',
  'batten-counter-batten',
];

/* ------------------------------------------------------------------------ */
/* Connection types                                                          */
/* ------------------------------------------------------------------------ */

/**
 * Carpentry interfaces shape the timber itself (cut, notch, lap). EN 1995-1-1
 * Section 8 covers connections with metal fasteners only; a carpentry joint
 * is checked through member rules (bearing, notches) and practice.
 */
export type CarpentryTypeId =
  | 'seat-notch'
  | 'ridge-board-butt'
  | 'rafters-direct-butt'
  | 'ridge-half-lap'
  | 'ridge-bridle'
  | 'collar-lap'
  | 'hip-ridge-cheek-cut'
  | 'hip-face-butt';

/** Dowel-type fasteners, EN 1995-1-1 Section 8. */
export type FastenerTypeId = 'nails' | 'screws' | 'bolts' | 'dowels';

/** Steel connectors, declared by the manufacturer (EN 14545 / EN 912 / ETA). */
export type ConnectorTypeId =
  | 'angle-bracket'
  | 'rafter-tie'
  | 'joist-hanger'
  | 'punched-metal-plate'
  | 'toothed-plate-connector'
  | 'perforated-strap'
  | 'anchor-rod';

export type ConnectionTypeId =
  CarpentryTypeId | FastenerTypeId | ConnectorTypeId;

export type ConnectionFamily = 'carpentry' | 'fastener' | 'connector';

/** Machining a connection implies on a timber member. */
export type FabricationOperationKind =
  | 'plumb-end-cut'
  | 'seat-notch'
  | 'lap-notch'
  | 'mortise-and-tenon'
  | 'compound-cheek-cut'
  | 'square-butt'
  | 'pre-drill';

/** Which minimum-spacing rule a fastener follows. */
export type SpacingRule =
  /** EN 1995-1-1 Table 8.4 — implemented (`minimumSpacingsEc5`). */
  | 'ec5-table-8.4-bolts'
  /** EN 1995-1-1 Table 8.5 — implemented. */
  | 'ec5-table-8.5-dowels'
  /** EN 1995-1-1 Table 8.2 — referenced, not computed (not yet verified). */
  | 'ec5-table-8.2-nails'
  /** EN 1995-1-1 8.7.1: d ≤ 6 mm as nails, d > 6 mm as bolts. */
  | 'ec5-8.7.1-screws'
  /** Declared by the manufacturer (ETA / declaration of performance). */
  | 'manufacturer-declared';

/**
 * How far RoofCalc resolves a type today. `geometry` = the cut geometry is
 * computed by the existing solvers; `catalogued` = named, referenced and
 * plannable, but its geometry/capacity is not computed.
 */
export type ModellingLevel = 'geometry' | 'catalogued';

export interface ConnectionTypeDefinition {
  id: ConnectionTypeId;
  family: ConnectionFamily;
  nodes: readonly RoofNodeKind[];
  operations: readonly FabricationOperationKind[];
  references: readonly StandardReference[];
  modelling: ModellingLevel;
  spacing?: SpacingRule;
  /** Typical diameters offered for planning (mm); not a recommendation. */
  diameters?: readonly number[];
}

const EC5 = 'PN-EN 1995-1-1' as const;
const BEARING: StandardReference = {
  standard: EC5,
  clause: '6.1.5',
  subject: 'bearing-perpendicular-to-grain',
};
const NOTCH: StandardReference = {
  standard: EC5,
  clause: '6.5',
  subject: 'notched-member',
};
const DETAILING: StandardReference = {
  standard: EC5,
  clause: '10.4',
  subject: 'detailing-mechanical',
};
const MULTIPLE: StandardReference = {
  standard: EC5,
  clause: '8.1.2',
  subject: 'multiple-fasteners',
};
const FASTENER_PRODUCT: StandardReference = {
  standard: 'PN-EN 14592',
  subject: 'fastener-product',
};
const CONNECTOR_PRODUCT: StandardReference = {
  standard: 'PN-EN 14545',
  subject: 'connector-product',
};

const RAFTER_ENDS: readonly RoofNodeKind[] = [
  'rafter-wall-plate',
  'jack-rafter-wall-plate',
  'hip-rafter-wall-plate',
  'rafter-purlin',
];
const ALL_TIMBER_NODES = (Object.keys(ROOF_NODES) as RoofNodeKind[]).filter(
  (kind) => kind !== 'wall-plate-anchorage',
);

export const CONNECTION_TYPES: Record<
  ConnectionTypeId,
  ConnectionTypeDefinition
> = {
  'seat-notch': {
    id: 'seat-notch',
    family: 'carpentry',
    nodes: RAFTER_ENDS,
    operations: ['seat-notch'],
    references: [BEARING, NOTCH],
    modelling: 'geometry',
  },
  'ridge-board-butt': {
    id: 'ridge-board-butt',
    family: 'carpentry',
    nodes: ['rafter-ridge'],
    operations: ['plumb-end-cut'],
    references: [BEARING],
    modelling: 'geometry',
  },
  'rafters-direct-butt': {
    id: 'rafters-direct-butt',
    family: 'carpentry',
    nodes: ['rafter-ridge'],
    operations: ['plumb-end-cut'],
    references: [BEARING],
    modelling: 'geometry',
  },
  'ridge-half-lap': {
    id: 'ridge-half-lap',
    family: 'carpentry',
    nodes: ['rafter-ridge'],
    operations: ['lap-notch'],
    references: [NOTCH],
    modelling: 'catalogued',
  },
  'ridge-bridle': {
    id: 'ridge-bridle',
    family: 'carpentry',
    nodes: ['rafter-ridge'],
    operations: ['mortise-and-tenon'],
    references: [BEARING],
    modelling: 'catalogued',
  },
  'collar-lap': {
    id: 'collar-lap',
    family: 'carpentry',
    nodes: ['collar-tie-rafter'],
    operations: ['lap-notch'],
    references: [NOTCH],
    modelling: 'catalogued',
  },
  'hip-ridge-cheek-cut': {
    id: 'hip-ridge-cheek-cut',
    family: 'carpentry',
    nodes: ['hip-rafter-ridge'],
    operations: ['compound-cheek-cut'],
    references: [BEARING],
    modelling: 'geometry',
  },
  'hip-face-butt': {
    id: 'hip-face-butt',
    family: 'carpentry',
    nodes: ['jack-rafter-hip-rafter'],
    operations: ['square-butt'],
    references: [BEARING],
    modelling: 'geometry',
  },
  nails: {
    id: 'nails',
    family: 'fastener',
    nodes: ALL_TIMBER_NODES,
    operations: [],
    references: [
      { standard: EC5, clause: '8.3', subject: 'nailed-connection' },
      { standard: EC5, clause: 'Tablica 8.2', subject: 'spacing-nails' },
      MULTIPLE,
      DETAILING,
      FASTENER_PRODUCT,
    ],
    modelling: 'catalogued',
    spacing: 'ec5-table-8.2-nails',
    diameters: [3.1, 3.4, 4, 5, 6],
  },
  screws: {
    id: 'screws',
    family: 'fastener',
    nodes: ALL_TIMBER_NODES,
    operations: ['pre-drill'],
    references: [
      { standard: EC5, clause: '8.7', subject: 'screwed-connection' },
      MULTIPLE,
      DETAILING,
      FASTENER_PRODUCT,
    ],
    modelling: 'catalogued',
    spacing: 'ec5-8.7.1-screws',
    diameters: [6, 8, 10, 12],
  },
  bolts: {
    id: 'bolts',
    family: 'fastener',
    nodes: [
      'rafter-ridge',
      'collar-tie-rafter',
      'rafter-purlin',
      'hip-rafter-ridge',
      'opening-header-rafter',
    ],
    operations: ['pre-drill'],
    references: [
      { standard: EC5, clause: '8.5', subject: 'bolted-connection' },
      { standard: EC5, clause: 'Tablica 8.4', subject: 'spacing-bolts' },
      MULTIPLE,
      DETAILING,
      FASTENER_PRODUCT,
    ],
    modelling: 'catalogued',
    spacing: 'ec5-table-8.4-bolts',
    diameters: [10, 12, 16, 20],
  },
  dowels: {
    id: 'dowels',
    family: 'fastener',
    nodes: ['collar-tie-rafter', 'rafter-ridge', 'opening-header-rafter'],
    operations: ['pre-drill'],
    references: [
      { standard: EC5, clause: '8.6', subject: 'dowelled-connection' },
      { standard: EC5, clause: 'Tablica 8.5', subject: 'spacing-dowels' },
      MULTIPLE,
      DETAILING,
      FASTENER_PRODUCT,
    ],
    modelling: 'catalogued',
    spacing: 'ec5-table-8.5-dowels',
    diameters: [8, 10, 12, 16],
  },
  'angle-bracket': {
    id: 'angle-bracket',
    family: 'connector',
    nodes: [
      'rafter-wall-plate',
      'jack-rafter-wall-plate',
      'hip-rafter-wall-plate',
      'rafter-purlin',
      'opening-header-rafter',
    ],
    operations: [],
    references: [CONNECTOR_PRODUCT, DETAILING],
    modelling: 'catalogued',
    spacing: 'manufacturer-declared',
  },
  'rafter-tie': {
    id: 'rafter-tie',
    family: 'connector',
    nodes: [
      'rafter-wall-plate',
      'jack-rafter-wall-plate',
      'hip-rafter-wall-plate',
      'rafter-purlin',
    ],
    operations: [],
    references: [CONNECTOR_PRODUCT, DETAILING],
    modelling: 'catalogued',
    spacing: 'manufacturer-declared',
  },
  'joist-hanger': {
    id: 'joist-hanger',
    family: 'connector',
    nodes: ['opening-header-rafter', 'jack-rafter-hip-rafter'],
    operations: [],
    references: [CONNECTOR_PRODUCT, DETAILING],
    modelling: 'catalogued',
    spacing: 'manufacturer-declared',
  },
  'punched-metal-plate': {
    id: 'punched-metal-plate',
    family: 'connector',
    nodes: ['rafter-ridge', 'collar-tie-rafter'],
    operations: [],
    references: [
      { standard: EC5, clause: '8.8', subject: 'punched-metal-plate' },
      CONNECTOR_PRODUCT,
    ],
    modelling: 'catalogued',
    spacing: 'manufacturer-declared',
  },
  'toothed-plate-connector': {
    id: 'toothed-plate-connector',
    family: 'connector',
    nodes: ['collar-tie-rafter', 'rafter-ridge'],
    operations: ['pre-drill'],
    references: [
      { standard: EC5, clause: '8.10', subject: 'toothed-plate-connector' },
      { standard: 'PN-EN 912', subject: 'ring-connector-product' },
    ],
    modelling: 'catalogued',
    spacing: 'manufacturer-declared',
  },
  'perforated-strap': {
    id: 'perforated-strap',
    family: 'connector',
    nodes: [
      'rafter-wall-plate',
      'jack-rafter-wall-plate',
      'hip-rafter-wall-plate',
      'wall-plate-anchorage',
    ],
    operations: [],
    references: [CONNECTOR_PRODUCT, DETAILING],
    modelling: 'catalogued',
    spacing: 'manufacturer-declared',
  },
  'anchor-rod': {
    id: 'anchor-rod',
    family: 'connector',
    nodes: ['wall-plate-anchorage'],
    operations: ['pre-drill'],
    references: [
      { standard: 'PN-EN 1992-4', subject: 'anchorage-in-concrete' },
      DETAILING,
    ],
    modelling: 'catalogued',
    spacing: 'manufacturer-declared',
    diameters: [12, 16],
  },
};

export function connectionTypesFor(
  node: RoofNodeKind,
  family?: ConnectionFamily,
): ConnectionTypeDefinition[] {
  return Object.values(CONNECTION_TYPES).filter(
    (type) =>
      type.nodes.includes(node) &&
      (family === undefined || type.family === family),
  );
}

export function isFastenerType(id: string): id is FastenerTypeId {
  return id === 'nails' || id === 'screws' || id === 'bolts' || id === 'dowels';
}

export function isConnectorType(id: string): id is ConnectorTypeId {
  return CONNECTION_TYPES[id as ConnectionTypeId]?.family === 'connector';
}
