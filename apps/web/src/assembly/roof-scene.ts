import {
  projectPlaneLocalToWorld,
  resolveRoofPlaneBasis,
  type RoofFeatureTopology,
  type RoofSurfaceGeometryResult,
} from '@cieslacalc/roof-math';
import {
  assessRoofScene,
  roofSceneFromResolvedRoof,
  type RoofSceneAssessment,
  type RoofSceneGraph,
  type RoofSceneIssueCode,
} from '@cieslacalc/roof-topology-core';
import type { RoofTemplateSpec } from '@cieslacalc/timber-model';

/**
 * VNext-6.1 (ADR-015): the ONE place the workbench turns the solver's
 * resolved roof — the same `resolveRoofSurfaceGeometry` and
 * `resolveRoofFeatureTopology` results the drawing, covering, drainage,
 * materials and documents already read — into the neutral roof graph.
 * Nothing is recomputed: points, line kinds and IDs are copied.
 *
 * Today the graph is a consistency gate: a V1 gable/hip must come out
 * `complete` and `supported`; anything else stops documents rather than
 * printing geometry that does not close. Later solvers (mono-pitch first)
 * produce the same graph and plug in here.
 */
export const PROJECT_ROOF_STRUCTURE_ID = 'structure:roof';

/** Graph issues another readiness rule already reports to the user. */
const REPORTED_ELSEWHERE: ReadonlySet<RoofSceneIssueCode> = new Set([
  // Opening collisions and openings outside a plane: V47 opening checks.
  'openings-overlap',
  'opening-off-plane',
]);

export interface ProjectRoofScene {
  scene: RoofSceneGraph;
  assessment: RoofSceneAssessment;
  /** The gate readiness uses: issues no other rule reports. */
  gate: {
    geometry: RoofSceneAssessment['geometry'];
    calculation: RoofSceneAssessment['calculation'];
    issueCodes: RoofSceneIssueCode[];
  };
}

export function deriveProjectRoofScene(input: {
  template: RoofTemplateSpec;
  surface: RoofSurfaceGeometryResult;
  topology: RoofFeatureTopology;
}): ProjectRoofScene {
  const scene = roofSceneFromResolvedRoof({
    structureId: PROJECT_ROOF_STRUCTURE_ID,
    template: input.template.type,
    planes: input.surface.planes,
    lines: input.topology.features,
    openings: input.surface.planes.flatMap((plane) => {
      const basis = resolveRoofPlaneBasis(input.template, plane.roofPlaneId);
      return plane.openingPolygons.map((opening) => ({
        featureId: opening.featureId,
        roofPlaneId: plane.roofPlaneId,
        worldPolygon: opening.polygon.map((point) =>
          projectPlaneLocalToWorld(basis, point),
        ),
      }));
    }),
  });
  const assessment = assessRoofScene(scene);
  const gateIssues = assessment.issues.filter(
    (issue) => issue.severity !== 'note' && !REPORTED_ELSEWHERE.has(issue.code),
  );
  return {
    scene,
    assessment,
    gate: {
      geometry: gateIssues.some((issue) => issue.severity === 'invalid')
        ? 'invalid'
        : gateIssues.length
          ? 'partial'
          : 'complete',
      // The solver computes this roof unless the graph found a real gap.
      calculation:
        !gateIssues.length &&
        assessment.limits.every(
          (limit) => limit.code === 'geometry-not-complete',
        )
          ? 'supported'
          : 'not-supported',
      issueCodes: [...new Set(gateIssues.map((issue) => issue.code))],
    },
  };
}
