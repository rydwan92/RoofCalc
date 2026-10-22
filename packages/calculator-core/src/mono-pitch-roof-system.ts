import {
  checkCoveringCompatibility,
  resolvePrimaryCoveringAssignments,
  type CoveringAssignmentSpec,
  type CoveringCompatibilityResult,
  type CoveringQuantitySource,
} from '@cieslacalc/covering-core';
import {
  resolveMonoPitchBattens,
  resolveMonoPitchFraming,
  type BattenLayoutResult,
  type MonoPitchFraming,
  type MonoPitchFramingSpec,
} from '@cieslacalc/roof-math';
import type { BattenLayoutSpec, TimberSection } from '@cieslacalc/timber-model';
import {
  coveringLayoutQuantitySource,
  resolveCoveringLayout,
  type ResolvedCoveringLayout,
} from './covering-layouts';

/**
 * VNext-7B: a mono-pitch roof composed from the SAME engines as a gable or
 * hip project — the shared rafter solver (framing), the plane-generic batten
 * engine and the one covering dispatch. Pure and derived: nothing here is
 * persisted (the V2 writer is still gated, ADR-015) and no UI reads it yet.
 */
export interface MonoPitchRoofSystemInput {
  framing: MonoPitchFramingSpec;
  battens?: BattenLayoutSpec;
  coverings?: readonly CoveringAssignmentSpec[];
}

/** Physical evidence of the rafters — not a purchase quantity. */
export interface MonoPitchRafterQuantity {
  prototypeId: string;
  code: 'K1';
  section: TimberSection;
  count: number;
  /** Shortest straight stock one rafter is cut from. */
  stockLengthMm: number;
  totalStockLengthMm: number;
}

export interface MonoPitchRoofSystem {
  framing: MonoPitchFraming;
  battens?: BattenLayoutResult;
  coveringLayouts: ResolvedCoveringLayout[];
  coveringQuantitySources: CoveringQuantitySource[];
  coveringCompatibility: Record<string, CoveringCompatibilityResult>;
  coveringConflicts: ReturnType<
    typeof resolvePrimaryCoveringAssignments
  >['conflicts'];
  rafters: MonoPitchRafterQuantity;
}

export function resolveMonoPitchRoofSystem(
  input: MonoPitchRoofSystemInput,
): MonoPitchRoofSystem {
  const framing = resolveMonoPitchFraming(input.framing);
  const [plane] = framing.surface.planes;
  const battens = input.battens
    ? resolveMonoPitchBattens(framing.surface, input.battens)
    : undefined;
  const coverings = input.coverings ?? [];
  const ownership = resolvePrimaryCoveringAssignments(coverings);
  const geometry = {
    roofSurfaceGeometry: [
      {
        roofPlaneId: plane.roofPlaneId,
        pitchDeg: framing.spec.roof.pitchDeg,
        localPolygon: plane.polygon,
        // No openings on a mono-pitch roof yet: net = gross.
        netAreaMm2: plane.grossAreaMm2,
      },
    ],
    openings: [],
    battens: (battens?.battens ?? []).map((batten) => ({
      id: batten.id,
      roofPlaneId: batten.roofPlaneId,
      stationVMm: batten.stationMm,
      segments: batten.segments,
    })),
  };
  const coveringLayouts = coverings.flatMap((assignment) => {
    const layout = resolveCoveringLayout({
      assignment,
      // Only this roof's plane can be owned; anything else is ignored.
      roofPlaneIds: (
        ownership.trustedRoofPlaneIdsByAssignment[assignment.id] ?? []
      ).filter((id) => id === plane.roofPlaneId),
      geometry,
    });
    return layout ? [layout] : [];
  });
  const gauge = battens?.planes[0]?.actualGaugeMm;
  const [prototype] = framing.memberPrototypes;
  return {
    framing,
    ...(battens ? { battens } : {}),
    coveringLayouts,
    coveringQuantitySources: coveringLayouts.flatMap((layout) => {
      const source = coveringLayoutQuantitySource(
        layout,
        coverings.find((assignment) => assignment.id === layout.assignmentId),
      );
      return source ? [source] : [];
    }),
    coveringCompatibility: Object.fromEntries(
      coverings.map((assignment) => [
        assignment.id,
        checkCoveringCompatibility({
          productSpec: assignment.product.technicalSpecSnapshot,
          roofPitchDeg: framing.spec.roof.pitchDeg,
          selectedInstallationModeId: assignment.selectedInstallationModeId,
          ...(gauge !== undefined ? { battenGaugeMm: gauge } : {}),
        }),
      ]),
    ),
    coveringConflicts: ownership.conflicts,
    rafters: {
      prototypeId: prototype!.id,
      code: 'K1',
      section: prototype!.section,
      count: prototype!.count,
      stockLengthMm: prototype!.lengthRangeMm.max,
      totalStockLengthMm: prototype!.count * prototype!.lengthRangeMm.max,
    },
  };
}
