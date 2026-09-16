import {
  createTimberPrismBasis,
  type TimberPrismOrientation,
} from '@cieslacalc/drawing-engine';
import type {
  RoofSkeleton,
  SkeletonGuide3D,
  SkeletonMember3D,
  SkeletonMemberKind,
} from '@cieslacalc/timber-model';
import {
  SCENE_COORDINATE_SYSTEM,
  sceneBoundsOf,
  type SceneEntityLabel,
  type SceneGeometryLimitation,
  type SceneOrientedBox,
  type SceneSemanticGroup,
  type TechnicalScene,
  type TechnicalSceneEntity,
} from './scene';

/**
 * The one adapter from the resolved roof to the renderer-neutral scene (V38).
 *
 * It reads only structured fields that a solver has already resolved —
 * `from`/`to`, `section`, `kind`, `selectionId`, `prototypeId` — and copies
 * them. It derives no pitch, no length, no position and no cut, and it never
 * recovers a decision by parsing an ID (ADR-007).
 */

/** Structured member kind → semantic family. No ID parsing, no display code. */
const SEMANTIC_GROUP: Record<SkeletonMemberKind, SceneSemanticGroup> = {
  rafter: 'common-rafter',
  'rafter-segment': 'common-rafter',
  'hip-rafter': 'hip-rafter',
  'jack-rafter': 'jack-rafter',
  'collar-tie': 'collar-tie',
  'wall-plate': 'wall-plate',
  purlin: 'purlin',
  ridge: 'ridge',
  'opening-header': 'opening-framing',
};

/**
 * Generated display metadata per family. The code is a label the user reads;
 * identity always stays in `sourceRef`.
 */
const FAMILY_LABEL: Record<SceneSemanticGroup, SceneEntityLabel> = {
  'common-rafter': { familyCode: 'K1', nameKey: 'commonRafter' },
  'hip-rafter': { familyCode: 'H1', nameKey: 'hipRafter' },
  'jack-rafter': { familyCode: 'J1', nameKey: 'jackRafter' },
  'collar-tie': { familyCode: 'C1', nameKey: 'collar-tie' },
  'wall-plate': { nameKey: 'wall-plate' },
  purlin: { nameKey: 'purlin' },
  ridge: { nameKey: 'ridge' },
  'opening-framing': { nameKey: 'opening-header' },
  'roof-plane': { nameKey: 'roofPlane' },
};

/**
 * Families whose finished connection geometry is not resolved today.
 *
 * A hip rafter's face deductions/backing and a jack rafter's finished
 * meeting face are not modelled (see `docs/HIP_RAFTER_GEOMETRY.md` and
 * `docs/JACK_RAFTER_GEOMETRY.md`). Their solid is the resolved structural
 * reference prism and must be disclosed as such, never drawn as an exact
 * finished joint.
 */
const UNRESOLVED_CONNECTION_GROUPS: ReadonlySet<SceneSemanticGroup> = new Set([
  'hip-rafter',
  'jack-rafter',
]);

/**
 * The prism orientation already used by the 2D skeleton for each family, so
 * the two renderers describe the same physical timber.
 */
function prismOrientation(kind: SkeletonMemberKind): TimberPrismOrientation {
  return kind === 'rafter' ||
    kind === 'rafter-segment' ||
    kind === 'hip-rafter' ||
    kind === 'jack-rafter'
    ? 'along-roof'
    : 'along-building';
}

/** Builds the oriented timber solid centred exactly on the resolved axis. */
export function orientedBoxForMember(
  member: Pick<SkeletonMember3D, 'from' | 'to' | 'section' | 'kind'>,
): SceneOrientedBox {
  const basis = createTimberPrismBasis(
    { from: member.from, to: member.to },
    prismOrientation(member.kind),
  );
  return {
    kind: 'oriented-box',
    center: {
      x: (member.from.x + member.to.x) / 2,
      y: (member.from.y + member.to.y) / 2,
      z: (member.from.z + member.to.z) / 2,
    },
    basis: { width: basis.width, along: basis.along, depth: basis.depth },
    size: {
      widthMm: member.section.widthMm,
      alongMm: basis.lengthMm,
      depthMm: member.section.depthMm,
    },
    axis: { from: { ...member.from }, to: { ...member.to } },
  };
}

export interface RoofTechnicalSceneInput {
  skeleton: RoofSkeleton;
  /** Include translucent roof-plane context entities. Presentation only. */
  includeRoofPlanes?: boolean;
}

/**
 * Mints one scene-local identity namespace. The adapter owns this namespace,
 * so allocating the next ordinal is generation, not inference (ADR-007).
 */
function sceneEntityId(ordinal: number) {
  return `scene:entity:${ordinal}`;
}

function memberEntity(
  member: SkeletonMember3D,
  ordinal: number,
): TechnicalSceneEntity | undefined {
  const group = SEMANTIC_GROUP[member.kind];
  if (!group) return undefined;
  if (
    !Number.isFinite(member.section?.widthMm) ||
    !Number.isFinite(member.section?.depthMm) ||
    member.section.widthMm <= 0 ||
    member.section.depthMm <= 0
  )
    return undefined;
  let geometry: SceneOrientedBox;
  try {
    geometry = orientedBoxForMember(member);
  } catch {
    // A degenerate axis is a resolver limitation, not something to invent a
    // solid for. The member is simply absent from the scene.
    return undefined;
  }
  // V38 subtracts no cut solid anywhere, so every timber solid is reference
  // geometry. H1/J1 carry the additional unresolved-connection limit.
  const limitations: SceneGeometryLimitation[] = ['no-cut-solids'];
  if (UNRESOLVED_CONNECTION_GROUPS.has(group))
    limitations.push('compound-connection-not-resolved');
  return {
    id: sceneEntityId(ordinal),
    kind: 'timber-member',
    semanticGroup: group,
    label: FAMILY_LABEL[group],
    geometry,
    selectable: true,
    sourceRef: {
      kind: 'skeleton-member',
      memberId: member.id,
      selectionId: member.selectionId,
      prototypeId: member.prototypeId,
    },
    geometryStatus: 'reference',
    limitations,
    section: {
      widthMm: member.section.widthMm,
      depthMm: member.section.depthMm,
    },
    lengthMm: geometry.size.alongMm,
  };
}

function planeEntity(
  guide: SkeletonGuide3D,
  ordinal: number,
): TechnicalSceneEntity | undefined {
  if (guide.points.length < 3) return undefined;
  return {
    id: sceneEntityId(ordinal),
    kind: 'roof-plane',
    semanticGroup: 'roof-plane',
    label: FAMILY_LABEL['roof-plane'],
    geometry: { kind: 'polygon', points: guide.points.map((p) => ({ ...p })) },
    // Plane context is orientation help, never a selection target: the
    // canonical plane selection stays with the 2D surface layer.
    selectable: false,
    sourceRef: { kind: 'roof-plane', roofPlaneId: guide.id },
    geometryStatus: 'reference',
    limitations: [],
  };
}

/**
 * Turns one already-resolved roof skeleton into a renderer-neutral scene.
 *
 * Pure: the same skeleton always produces the same scene, and nothing about
 * the camera, the screen, the session or the project document enters it.
 */
export function createRoofTechnicalScene(
  input: RoofTechnicalSceneInput,
): TechnicalScene {
  const entities: TechnicalSceneEntity[] = [];
  let ordinal = 0;
  for (const member of input.skeleton.members) {
    const entity = memberEntity(member, ordinal);
    if (!entity) continue;
    entities.push(entity);
    ordinal += 1;
  }
  if (input.includeRoofPlanes !== false)
    for (const guide of input.skeleton.guides ?? []) {
      const entity = planeEntity(guide, ordinal);
      if (!entity) continue;
      entities.push(entity);
      ordinal += 1;
    }
  return {
    coordinateSystem: SCENE_COORDINATE_SYSTEM,
    bounds: sceneBoundsOf(entities),
    entities,
  };
}

/** The semantic families a renderer may offer as visibility filters. */
export const SCENE_TIMBER_GROUPS: readonly SceneSemanticGroup[] = [
  'common-rafter',
  'hip-rafter',
  'jack-rafter',
  'collar-tie',
  'wall-plate',
  'purlin',
  'ridge',
  'opening-framing',
];
