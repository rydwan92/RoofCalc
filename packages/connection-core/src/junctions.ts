/**
 * Roof-to-roof junctions (łączenia dachów) — research contract for the
 * compound-roof document (ADR-008). NOT resolved by any solver yet.
 *
 * ADR-008 places a junction above two structures (`RoofConnectionSpec`
 * referencing two structure IDs), never inside a roof template. What this
 * module fixes now is the vocabulary and, for each junction class, what it
 * changes in the timber and the covering and which inputs a user must give
 * before a resolver may run. A junction is never inferred from overlapping
 * polygons; it is an explicit user intent.
 */

export type RoofJunctionKind =
  /** Two roofs intersect; their planes meet in a valley (kosz). */
  | 'valley-intersection'
  /** A roof's ridge runs into the plane of a larger roof (T or L plan). */
  | 'ridge-into-roof-plane'
  /** A lower roof abuts the wall of a higher building (dach przyścienny). */
  | 'wall-abutment'
  /** A mono-pitch lean-to fixed to a wall (przybudówka, dach pulpitowy). */
  | 'lean-to'
  /** A dormer on a roof plane (lukarna). */
  | 'dormer';

/** Timber members a junction creates or adapts. */
export type JunctionMember =
  | 'valley-rafter'
  | 'valley-jack-rafter'
  | 'trimmer-rafter'
  | 'header'
  | 'ledger'
  | 'ridge-board'
  | 'cripple-rafter';

/** Covering details it requires (flashing, valley lining). */
export type JunctionCoveringDetail =
  | 'valley-lining'
  | 'abutment-flashing'
  | 'apron-flashing'
  | 'cheek-cladding'
  | 'ridge-junction';

/** Inputs without which a resolver must refuse to run. */
export type JunctionInput =
  | 'both-pitches'
  | 'eave-heights'
  | 'plan-position'
  | 'wall-face-position'
  | 'dormer-width'
  | 'dormer-pitch'
  | 'support-of-valley';

export interface RoofJunctionDefinition {
  kind: RoofJunctionKind;
  members: readonly JunctionMember[];
  covering: readonly JunctionCoveringDetail[];
  requiredInputs: readonly JunctionInput[];
  /** Load paths change at every junction; never decided by geometry. */
  requiresStructuralDesign: true;
  status: 'research';
}

export const ROOF_JUNCTIONS: Record<RoofJunctionKind, RoofJunctionDefinition> =
  {
    'valley-intersection': {
      kind: 'valley-intersection',
      members: ['valley-rafter', 'valley-jack-rafter'],
      covering: ['valley-lining'],
      requiredInputs: [
        'both-pitches',
        'eave-heights',
        'plan-position',
        'support-of-valley',
      ],
      requiresStructuralDesign: true,
      status: 'research',
    },
    'ridge-into-roof-plane': {
      kind: 'ridge-into-roof-plane',
      members: ['valley-rafter', 'valley-jack-rafter', 'ridge-board'],
      covering: ['valley-lining', 'ridge-junction'],
      requiredInputs: [
        'both-pitches',
        'eave-heights',
        'plan-position',
        'support-of-valley',
      ],
      requiresStructuralDesign: true,
      status: 'research',
    },
    'wall-abutment': {
      kind: 'wall-abutment',
      members: ['ledger'],
      covering: ['abutment-flashing'],
      requiredInputs: ['wall-face-position', 'eave-heights'],
      requiresStructuralDesign: true,
      status: 'research',
    },
    'lean-to': {
      kind: 'lean-to',
      members: ['ledger'],
      covering: ['apron-flashing', 'abutment-flashing'],
      requiredInputs: ['wall-face-position', 'eave-heights', 'both-pitches'],
      requiresStructuralDesign: true,
      status: 'research',
    },
    dormer: {
      kind: 'dormer',
      members: ['trimmer-rafter', 'header', 'cripple-rafter', 'valley-rafter'],
      covering: ['valley-lining', 'cheek-cladding', 'apron-flashing'],
      requiredInputs: ['dormer-width', 'dormer-pitch', 'plan-position'],
      requiresStructuralDesign: true,
      status: 'research',
    },
  };
