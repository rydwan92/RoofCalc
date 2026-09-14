import type {
  Point2D,
  ResolvedAssembly,
  TimberSection,
} from '@cieslacalc/timber-model';

export type K1BlankUnresolvedReason =
  | 'ridge-board-not-modeled'
  | 'incomplete-cuts'
  | 'invalid-section'
  | 'geometry-outside-blank'
  | 'stock-envelope-mismatch';

export type K1FabricationBlankResolution =
  | {
      status: 'resolved';
      familyCode: 'K1';
      section: TimberSection;
      finishedGeometryReference: {
        memberPrototypeId: string;
        endCutIds: string[];
        jointIds: string[];
      };
      requiredBlankLengthMm: number;
      basis: 'modeled-k1-cut-envelope';
      ridgeConnection: 'centered-vertical-ridge-board-near-face-butt';
      fabricationAllowanceMm: 0;
    }
  | { status: 'unresolved'; reason: K1BlankUnresolvedReason };

const toleranceMm = 1e-6;

/**
 * Proves an unmachined rectangular blank for the currently modeled K1 cuts.
 * The eave station is local x=0; the longitudinal extent is derived from all
 * finished and removed-cut vertices, not from minimumStockLengthMm.
 */
export function resolveK1FabricationBlank(
  assembly: ResolvedAssembly,
  ridgeBoardThicknessMm: number,
): K1FabricationBlankResolution {
  if (!Number.isFinite(ridgeBoardThicknessMm) || ridgeBoardThicknessMm <= 0)
    return { status: 'unresolved', reason: 'ridge-board-not-modeled' };

  const section = assembly.member.section;
  if (
    !Number.isFinite(section.widthMm) ||
    !Number.isFinite(section.depthMm) ||
    section.widthMm <= 0 ||
    section.depthMm <= 0
  )
    return { status: 'unresolved', reason: 'invalid-section' };

  const eave = assembly.endCuts.filter((cut) => cut.end === 'eave');
  const ridge = assembly.endCuts.filter((cut) => cut.end === 'ridge');
  if (
    eave.length !== 1 ||
    ridge.length !== 1 ||
    ridge[0]!.supportId === undefined ||
    !assembly.joints.length ||
    assembly.joints.some((joint) => joint.kind !== 'seat-notch')
  )
    return { status: 'unresolved', reason: 'incomplete-cuts' };

  const points: Point2D[] = [
    ...assembly.member.profile,
    ...assembly.member.datums.map((datum) => datum.localPoint),
    ...assembly.endCuts.flatMap((cut) => cut.line),
    ...assembly.joints.flatMap((joint) => [
      ...joint.removedProfile,
      ...joint.seatLine,
      ...joint.plumbLine,
    ]),
  ];
  if (
    !points.length ||
    points.some(
      (point) =>
        !Number.isFinite(point.x) ||
        !Number.isFinite(point.y) ||
        point.x < -toleranceMm ||
        point.y < -toleranceMm ||
        point.y > section.depthMm + toleranceMm,
    )
  )
    return { status: 'unresolved', reason: 'geometry-outside-blank' };

  const lengthMm = Math.max(...points.map((point) => point.x));
  const stock = assembly.member.stockProfile;
  if (
    !Number.isFinite(lengthMm) ||
    lengthMm <= 0 ||
    stock.length !== 4 ||
    stock.some(
      (point) =>
        !Number.isFinite(point.x) ||
        !Number.isFinite(point.y) ||
        point.x < -toleranceMm ||
        point.x > lengthMm + toleranceMm ||
        point.y < -toleranceMm ||
        point.y > section.depthMm + toleranceMm,
    ) ||
    Math.abs(assembly.member.minimumStockLengthMm - lengthMm) > toleranceMm
  )
    return { status: 'unresolved', reason: 'stock-envelope-mismatch' };

  return {
    status: 'resolved',
    familyCode: 'K1',
    section: { ...section },
    finishedGeometryReference: {
      memberPrototypeId: assembly.member.id,
      endCutIds: assembly.endCuts.map((cut) => cut.id),
      jointIds: assembly.joints.map((joint) => joint.id),
    },
    requiredBlankLengthMm: lengthMm,
    basis: 'modeled-k1-cut-envelope',
    ridgeConnection: 'centered-vertical-ridge-board-near-face-butt',
    fabricationAllowanceMm: 0,
  };
}
