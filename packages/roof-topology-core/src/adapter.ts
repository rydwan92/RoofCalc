import { createRoofEdge, createRoofPlane } from './build';
import {
  ROOF_SCENE_CONTRACT_VERSION,
  type RoofSceneGraph,
  type Vec3,
} from './model';

/**
 * The adapter from today's solver output to the neutral graph. Input is
 * STRUCTURAL — the shapes of roof-math's resolved surface planes and
 * canonical roof lines — so this package imports no solver and recomputes
 * nothing: every point is copied, every line kind is the solver's own, and
 * the solver's IDs travel as opaque `source.ref` values (ADR-007).
 */
export interface ResolvedRoofPlaneInput {
  roofPlaneId: string;
  worldPolygon: readonly Vec3[];
}

export interface ResolvedRoofLineInput {
  id: string;
  /** `abutment`: a mono-pitch top edge against a wall (VNext-7A). */
  kind: 'eave' | 'ridge' | 'hip' | 'verge' | 'valley' | 'abutment';
  start: Vec3;
  end: Vec3;
  incidentPlaneIds: readonly string[];
}

export interface ResolvedRoofOpeningInput {
  featureId: string;
  roofPlaneId: string;
  worldPolygon: readonly Vec3[];
}

export function roofSceneFromResolvedRoof(input: {
  /** Scene-unique; the single roof of a V1 project is one structure. */
  structureId: string;
  name?: string;
  /**
   * `mono-pitch` (VNext-7A) is adapted the same way; the assessment still
   * reports it `not-supported` until its downstream modules exist.
   */
  template: 'gable' | 'hip' | 'mono-pitch';
  planes: readonly ResolvedRoofPlaneInput[];
  lines: readonly ResolvedRoofLineInput[];
  openings?: readonly ResolvedRoofOpeningInput[];
}): RoofSceneGraph {
  const solver = (ref: string) => ({
    kind: 'solver' as const,
    ref,
    stage: 'computed' as const,
  });
  // Scene IDs are minted here and are opaque; the solver's own ID is kept
  // in `source.ref` so a consumer maps back without parsing anything.
  const planeIds = new Map(
    input.planes.map((plane, index) => [
      plane.roofPlaneId,
      `${input.structureId}/plane-${index + 1}`,
    ]),
  );
  return {
    contractVersion: ROOF_SCENE_CONTRACT_VERSION,
    structures: [
      {
        id: input.structureId,
        ...(input.name ? { name: input.name } : {}),
        transform: {
          translation: { x: 0, y: 0, z: 0 },
          rotationAboutVerticalDeg: 0,
        },
        template: input.template,
        status: 'resolved',
        source: solver(input.structureId),
      },
    ],
    planes: input.planes.map((plane) =>
      createRoofPlane({
        id: planeIds.get(plane.roofPlaneId)!,
        structureId: input.structureId,
        polygon: plane.worldPolygon,
        source: solver(plane.roofPlaneId),
      }),
    ),
    edges: input.lines.map((line, index) =>
      createRoofEdge({
        id: `${input.structureId}/edge-${index + 1}`,
        kind: line.kind,
        from: line.start,
        to: line.end,
        // An unknown plane reference is kept, so the assessment reports it
        // instead of the line silently losing a plane.
        planeIds: line.incidentPlaneIds.map((id) => planeIds.get(id) ?? id),
        source: solver(line.id),
      }),
    ),
    openings: (input.openings ?? []).flatMap((opening, index) => {
      const planeId = planeIds.get(opening.roofPlaneId);
      return planeId
        ? [
            {
              id: `${input.structureId}/opening-${index + 1}`,
              planeId,
              kind: 'roof-window' as const,
              polygon: opening.worldPolygon.map((point) => ({ ...point })),
              status: 'resolved' as const,
              source: solver(opening.featureId),
            },
          ]
        : [];
    }),
    connections: [],
  };
}
