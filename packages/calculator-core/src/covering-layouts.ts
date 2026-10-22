import {
  createCutToLengthSheetQuantitySource,
  createModularSheetQuantitySource,
  createRoofTileQuantitySource,
  createStandingSeamQuantitySource,
  resolveCutToLengthSheetLayout,
  resolveModularSheetLayout,
  resolveRoofTileLayout,
  resolveStandingSeamLayout,
  type CoveringAssignmentSpec,
  type CoveringBattenRow,
  type CoveringOpeningGeometry,
  type CoveringQuantitySource,
  type CoveringRoofSurfaceGeometry,
  type CutToLengthSheetLayoutResult,
  type ModularSheetLayoutResult,
  type RoofTileLayoutResult,
  type StandingSeamLayoutResult,
} from '@cieslacalc/covering-core';

/**
 * VNext-7B: the ONE dispatch from a covering assignment to its layout
 * engine and quantity source, moved out of the workbench page so a
 * mono-pitch roof (and later every structure of a V2 project) lays its
 * covering by exactly the same rules as a gable or hip roof.
 */
export type ResolvedCoveringLayout =
  | RoofTileLayoutResult
  | ModularSheetLayoutResult
  | CutToLengthSheetLayoutResult
  | StandingSeamLayoutResult;

/** Resolved roof planes as every covering engine reads them. */
export interface CoveringLayoutGeometry {
  roofSurfaceGeometry: readonly CoveringRoofSurfaceGeometry[];
  openings: readonly CoveringOpeningGeometry[];
  battens: readonly CoveringBattenRow[];
}

type Snapshot = CoveringAssignmentSpec['product']['technicalSpecSnapshot'];
type AssignmentOf<TKind extends Snapshot['kind']> = CoveringAssignmentSpec & {
  product: CoveringAssignmentSpec['product'] & {
    technicalSpecSnapshot: Extract<Snapshot, { kind: TKind }>;
  };
};

type CutToLengthSpec = Parameters<
  typeof resolveCutToLengthSheetLayout
>[0]['productSpec'];
function isCutToLength(
  spec: Extract<Snapshot, { kind: 'modular-sheet' }>,
): spec is CutToLengthSpec {
  return spec.lengthModel.kind === 'cut-to-length';
}

function isKind<TKind extends Snapshot['kind']>(
  assignment: CoveringAssignmentSpec,
  kind: TKind,
): assignment is AssignmentOf<TKind> {
  return assignment.product.technicalSpecSnapshot.kind === kind;
}

/**
 * Lays one assignment on the planes it owns. `roofPlaneIds` is the trusted
 * ownership (the caller resolves conflicts first); an unknown product kind
 * yields no layout rather than a guess.
 */
export function resolveCoveringLayout(args: {
  assignment: CoveringAssignmentSpec;
  roofPlaneIds: readonly string[];
  geometry: CoveringLayoutGeometry;
}): ResolvedCoveringLayout | undefined {
  const { assignment } = args;
  const common = {
    assignmentId: assignment.id,
    roofPlaneIds: args.roofPlaneIds,
    roofSurfaceGeometry: args.geometry.roofSurfaceGeometry,
    openings: args.geometry.openings,
    battens: args.geometry.battens,
  };
  if (isKind(assignment, 'roof-tile'))
    return resolveRoofTileLayout({
      ...common,
      productSpec: assignment.product.technicalSpecSnapshot,
      selectedInstallationModeId: assignment.selectedInstallationModeId,
      layoutIntent:
        assignment.layoutIntent?.kind === 'roof-tile'
          ? assignment.layoutIntent
          : { kind: 'roof-tile', horizontalAlignment: 'centered' },
    });
  if (isKind(assignment, 'modular-sheet')) {
    const spec = assignment.product.technicalSpecSnapshot;
    const previous = assignment.layoutIntent;
    if (isCutToLength(spec))
      return resolveCutToLengthSheetLayout({
        ...common,
        productSpec: spec,
        layoutIntent:
          previous?.kind === 'modular-sheet-cut-to-length'
            ? previous
            : previous?.kind === 'modular-sheet'
              ? { ...previous, kind: 'modular-sheet-cut-to-length' }
              : {
                  kind: 'modular-sheet-cut-to-length',
                  horizontalAlignment: 'centered',
                },
      });
    return resolveModularSheetLayout({
      ...common,
      productSpec: spec,
      layoutIntent:
        previous?.kind === 'modular-sheet'
          ? previous
          : { kind: 'modular-sheet', horizontalAlignment: 'centered' },
    });
  }
  if (isKind(assignment, 'standing-seam'))
    return resolveStandingSeamLayout({
      ...common,
      productSpec: assignment.product.technicalSpecSnapshot,
      selectedInstallationModeId: assignment.selectedInstallationModeId,
      layoutIntent:
        assignment.layoutIntent?.kind === 'standing-seam'
          ? assignment.layoutIntent
          : { kind: 'standing-seam', horizontalAlignment: 'centered' },
    });
  return undefined;
}

/** The quantity source of a resolved layout; none while it is incomplete. */
export function coveringLayoutQuantitySource(
  layout: ResolvedCoveringLayout,
  assignment?: CoveringAssignmentSpec,
): CoveringQuantitySource | undefined {
  const productDisplay = assignment?.product.displaySnapshot;
  switch (layout.kind) {
    case 'roof-tile':
      return createRoofTileQuantitySource({ layout, productDisplay });
    case 'modular-sheet-cut-to-length':
      return createCutToLengthSheetQuantitySource({ layout, productDisplay });
    case 'modular-sheet':
      return createModularSheetQuantitySource({ layout, productDisplay });
    default:
      return createStandingSeamQuantitySource({ layout, productDisplay });
  }
}
