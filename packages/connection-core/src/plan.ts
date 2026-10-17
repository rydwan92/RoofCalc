import { z } from 'zod';
import {
  CONNECTION_TYPES,
  ROOF_NODES,
  type ConnectorTypeId,
  type FastenerTypeId,
  type RoofNodeKind,
} from './catalogue';
import { SPACING_LIMITS } from './spacing';

/**
 * The connection plan: the carpenter's chosen fastening for each kind of
 * node in the roof — canonical project intent (ADR-002), stored as
 * `project.connectionPlan`. It holds decisions only: no counts, no derived
 * spacing, no capacity. Carpentry interfaces that already have a canonical
 * home (wall-plate seat notch, ridge connection, hip execution) stay there
 * and are not duplicated here.
 *
 * Keyed by node *kind*, a structured fact (ADR-007): a gable roof has one
 * "rafter–wall plate" detail repeated at every rafter, not one per member
 * ID. A future multi-structure document (ADR-008) holds one plan per
 * structure.
 */

export const CONNECTION_PLAN_VERSION = 1 as const;

export interface PlannedFastening {
  type: FastenerTypeId;
  /** Nominal fastener diameter d (mm). */
  diameterMm?: number;
  /** Fasteners at each occurrence of the node. */
  perNode?: number;
}

export interface PlannedNodeConnection {
  fastening?: PlannedFastening;
  connector?: ConnectorTypeId;
  /** Free text: product name, designer's reference, site remark. */
  note?: string;
}

export interface RoofConnectionPlan {
  version: typeof CONNECTION_PLAN_VERSION;
  nodes: Partial<Record<RoofNodeKind, PlannedNodeConnection>>;
}

export const CONNECTION_PLAN_LIMITS = {
  maxPerNode: 50,
  maxNoteLength: 240,
} as const;

const nodeKindSchema = z.enum(
  Object.keys(ROOF_NODES) as [RoofNodeKind, ...RoofNodeKind[]],
);
const fastenerSchema = z.enum(['nails', 'screws', 'bolts', 'dowels']);
const connectorSchema = z.enum([
  'angle-bracket',
  'rafter-tie',
  'joist-hanger',
  'punched-metal-plate',
  'toothed-plate-connector',
  'perforated-strap',
  'anchor-rod',
]);

const plannedNodeSchema = z.object({
  fastening: z
    .object({
      type: fastenerSchema,
      diameterMm: z
        .number()
        .finite()
        .min(2)
        .max(SPACING_LIMITS.maxDiameterMm)
        .optional(),
      perNode: z
        .number()
        .int()
        .min(1)
        .max(CONNECTION_PLAN_LIMITS.maxPerNode)
        .optional(),
    })
    .optional(),
  connector: connectorSchema.optional(),
  note: z.string().max(CONNECTION_PLAN_LIMITS.maxNoteLength).optional(),
});

/**
 * Validates a stored plan, including that every chosen fastener and
 * connector is one the catalogue offers for that node — a plan can never
 * describe a hanger anchoring a wall plate.
 */
export const roofConnectionPlanSchema = z
  .object({
    version: z.literal(CONNECTION_PLAN_VERSION),
    nodes: z.record(nodeKindSchema, plannedNodeSchema),
  })
  .superRefine((plan, context) => {
    for (const [kind, planned] of Object.entries(plan.nodes) as [
      RoofNodeKind,
      PlannedNodeConnection | undefined,
    ][]) {
      if (!planned) continue;
      for (const id of [planned.fastening?.type, planned.connector])
        if (id && !CONNECTION_TYPES[id].nodes.includes(kind))
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['nodes', kind],
            message: `${id} is not offered for ${kind}`,
          });
    }
  }) as unknown as z.ZodType<RoofConnectionPlan>;

export function parseRoofConnectionPlan(value: unknown): RoofConnectionPlan {
  return roofConnectionPlanSchema.parse(value);
}

function isEmpty(planned: PlannedNodeConnection): boolean {
  return !planned.fastening && !planned.connector && !planned.note?.trim();
}

/**
 * Immutable update of one node. An emptied node is removed, and a plan
 * with no nodes left becomes `undefined`, so a project that never planned
 * a connection keeps no `connectionPlan` field at all.
 */
export function withPlannedConnection(
  plan: RoofConnectionPlan | undefined,
  kind: RoofNodeKind,
  planned: PlannedNodeConnection | undefined,
): RoofConnectionPlan | undefined {
  const nodes = { ...(plan?.nodes ?? {}) };
  if (!planned || isEmpty(planned)) delete nodes[kind];
  else
    nodes[kind] = {
      ...(planned.fastening ? { fastening: { ...planned.fastening } } : {}),
      ...(planned.connector ? { connector: planned.connector } : {}),
      ...(planned.note?.trim() ? { note: planned.note.trim() } : {}),
    };
  return Object.keys(nodes).length
    ? { version: CONNECTION_PLAN_VERSION, nodes }
    : undefined;
}
