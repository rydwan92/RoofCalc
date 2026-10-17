import {
  CONNECTION_TYPES,
  connectionTypesFor,
  ROOF_NODE_ORDER,
  ROOF_NODES,
  type CarpentryTypeId,
  type ConnectorTypeId,
  type FastenerTypeId,
  type RoofMemberRole,
  type RoofNodeKind,
} from './catalogue';
import type { PlannedNodeConnection, RoofConnectionPlan } from './plan';
import {
  fastenerRowFit,
  spacingEnvelopeEc5,
  type RowFit,
  type SpacingFastener,
} from './spacing';
import {
  DESIGN_BASIS_REFERENCES,
  referenceKey,
  type StandardReference,
} from './standards';

/**
 * The connection schedule (plan połączeń): every kind of node the roof
 * actually has, how many times it occurs, what the existing solvers already
 * model there, what the user planned, and a detailing check where one is
 * defined. Pure; the census comes from an adapter over the resolved roof.
 */

/** How the carpentry interface at a node is resolved today. */
export interface ModelledInterface {
  type: CarpentryTypeId;
  /**
   * `resolved` = cut geometry computed by the solver; `named` = chosen but
   * its geometry is not modelled; `undecided` = the project has not chosen.
   */
  status: 'resolved' | 'named' | 'undecided';
}

export interface RoofNodeOccurrence {
  kind: RoofNodeKind;
  /** How many times this node occurs in the roof (e.g. one per rafter). */
  count: number;
  /**
   * `node` (default): `count` discrete joints. `axis`: `count` member axes
   * along which the joint repeats (battens on a counter-batten) — a planned
   * fastener count per joint cannot be multiplied into a total.
   */
  unit?: 'node' | 'axis';
  modelled?: ModelledInterface;
}

export interface RoofConnectionCensus {
  nodes: readonly RoofNodeOccurrence[];
  /** Cross-section per role (width × depth, mm) where the roof defines it. */
  sections: Partial<
    Record<RoofMemberRole, { widthMm: number; depthMm: number }>
  >;
}

export type DetailingCheck =
  | {
      kind: 'row-fit';
      fastener: SpacingFastener;
      diameterMm: number;
      perNode: number;
      limitingRole: RoofMemberRole;
      table: 'Tablica 8.4' | 'Tablica 8.5';
      envelope: { a1: number; a2: number; a3: number; a4: number };
      fit: RowFit;
    }
  | {
      kind: 'not-computed';
      reason:
        | 'nails-table-not-verified'
        | 'screws-product-specific'
        | 'manufacturer-declared'
        | 'diameter-missing'
        | 'section-unknown'
        | 'layout-specific';
    };

export type ConnectionRowStatus = 'planned' | 'not-planned' | 'check-detailing';

export interface ConnectionScheduleRow {
  kind: RoofNodeKind;
  participants: readonly [RoofMemberRole, RoofMemberRole];
  count: number;
  unit: 'node' | 'axis';
  modelled?: ModelledInterface;
  planned?: PlannedNodeConnection;
  options: {
    carpentry: CarpentryTypeId[];
    fasteners: FastenerTypeId[];
    connectors: ConnectorTypeId[];
  };
  /** References for what is modelled and planned at this node. */
  references: StandardReference[];
  detailing?: DetailingCheck;
  /** Planned pieces over every occurrence — evidence, not a purchase list. */
  plannedQuantity?: { fasteners?: number; connectors?: number };
  status: ConnectionRowStatus;
}

function uniqueReferences(
  references: readonly StandardReference[],
): StandardReference[] {
  const seen = new Set<string>();
  return references.filter((reference) => {
    const key = referenceKey(reference);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function detailingFor(
  kind: RoofNodeKind,
  planned: PlannedNodeConnection | undefined,
  sections: RoofConnectionCensus['sections'],
): DetailingCheck | undefined {
  const fastening = planned?.fastening;
  if (!fastening) {
    if (planned?.connector)
      return { kind: 'not-computed', reason: 'manufacturer-declared' };
    return undefined;
  }
  if (fastening.type === 'nails')
    return { kind: 'not-computed', reason: 'nails-table-not-verified' };
  if (fastening.type === 'screws')
    return { kind: 'not-computed', reason: 'screws-product-specific' };
  if (fastening.diameterMm === undefined)
    return { kind: 'not-computed', reason: 'diameter-missing' };
  const roles = ROOF_NODES[kind].limitingRoles;
  if (!roles?.length)
    return { kind: 'not-computed', reason: 'layout-specific' };
  const depths = roles.flatMap((role) => {
    const section = sections[role];
    return section ? [{ role, depthMm: section.depthMm }] : [];
  });
  if (depths.length !== roles.length)
    return { kind: 'not-computed', reason: 'section-unknown' };
  const limiting = depths.reduce((a, b) => (b.depthMm < a.depthMm ? b : a));
  const fastener: SpacingFastener =
    fastening.type === 'bolts' ? 'bolt' : 'dowel';
  if (fastening.diameterMm < 6 || fastening.diameterMm > 30)
    return { kind: 'not-computed', reason: 'diameter-missing' };
  const perNode = fastening.perNode ?? 1;
  return {
    kind: 'row-fit',
    fastener,
    diameterMm: fastening.diameterMm,
    perNode,
    limitingRole: limiting.role,
    table: fastener === 'bolt' ? 'Tablica 8.4' : 'Tablica 8.5',
    envelope: spacingEnvelopeEc5({
      fastener,
      diameterMm: fastening.diameterMm,
    }),
    fit: fastenerRowFit({
      fastener,
      diameterMm: fastening.diameterMm,
      count: perNode,
      memberDepthMm: limiting.depthMm,
    }),
  };
}

/** The schedule for a roof: only nodes that occur, wall to ridge. */
export function deriveConnectionSchedule(
  census: RoofConnectionCensus,
  plan?: RoofConnectionPlan,
): ConnectionScheduleRow[] {
  const byKind = new Map(census.nodes.map((node) => [node.kind, node]));
  return ROOF_NODE_ORDER.flatMap((kind): ConnectionScheduleRow[] => {
    const occurrence = byKind.get(kind);
    if (!occurrence || occurrence.count <= 0) return [];
    const planned = plan?.nodes[kind];
    const detailing = detailingFor(kind, planned, census.sections);
    const modelledReferences = occurrence.modelled
      ? CONNECTION_TYPES[occurrence.modelled.type].references
      : [];
    const plannedReferences = [
      ...(planned?.fastening
        ? CONNECTION_TYPES[planned.fastening.type].references
        : []),
      ...(planned?.connector
        ? CONNECTION_TYPES[planned.connector].references
        : []),
    ];
    const unit = occurrence.unit ?? 'node';
    const fasteners =
      planned?.fastening && unit === 'node'
        ? occurrence.count * (planned.fastening.perNode ?? 1)
        : undefined;
    const connectors =
      planned?.connector && unit === 'node' ? occurrence.count : undefined;
    const status: ConnectionRowStatus =
      detailing?.kind === 'row-fit' && detailing.fit.status !== 'fits'
        ? 'check-detailing'
        : planned?.fastening || planned?.connector
          ? 'planned'
          : 'not-planned';
    return [
      {
        kind,
        participants: ROOF_NODES[kind].participants,
        count: occurrence.count,
        unit,
        ...(occurrence.modelled ? { modelled: occurrence.modelled } : {}),
        ...(planned ? { planned } : {}),
        options: {
          carpentry: connectionTypesFor(kind, 'carpentry').map(
            (type) => type.id as CarpentryTypeId,
          ),
          fasteners: connectionTypesFor(kind, 'fastener').map(
            (type) => type.id as FastenerTypeId,
          ),
          connectors: connectionTypesFor(kind, 'connector').map(
            (type) => type.id as ConnectorTypeId,
          ),
        },
        references: uniqueReferences([
          ...modelledReferences,
          ...plannedReferences,
        ]),
        ...(detailing ? { detailing } : {}),
        ...(fasteners !== undefined || connectors !== undefined
          ? {
              plannedQuantity: {
                ...(fasteners !== undefined ? { fasteners } : {}),
                ...(connectors !== undefined ? { connectors } : {}),
              },
            }
          : {}),
        status,
      },
    ];
  });
}

/** What every row of a roof shares: loads, material, design basis. */
export function scheduleDesignBasis(): readonly StandardReference[] {
  return DESIGN_BASIS_REFERENCES;
}

/** Counts for the summary: nothing here is a structural verdict. */
export function summarizeConnectionSchedule(
  rows: readonly ConnectionScheduleRow[],
) {
  return {
    nodeKinds: rows.length,
    occurrences: rows
      .filter((row) => row.unit === 'node')
      .reduce((sum, row) => sum + row.count, 0),
    planned: rows.filter((row) => row.status !== 'not-planned').length,
    checkDetailing: rows.filter((row) => row.status === 'check-detailing')
      .length,
  };
}
