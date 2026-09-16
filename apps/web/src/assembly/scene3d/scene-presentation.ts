import type {
  SceneSemanticGroup,
  TechnicalScene,
  TechnicalSceneEntity,
} from '@cieslacalc/technical-scene';
import {
  resolveMemberRefVisualState,
  type WorkbenchViewState,
} from '../workbench';

/**
 * Presentation policy for the technical 3D viewport (V38).
 *
 * Pure and renderer-free on purpose: colours, emphasis, HUD facts and family
 * counts are all decided here and merely applied by the Three.js viewport, so
 * they can be unit-tested without WebGL.
 */

/**
 * Semantic timber colours, matching the 2D skeleton exactly so that a member
 * looks like the same member in both views. The lit face is the light tone and
 * the shaded faces the dark one, as in the 2D axonometric solid.
 */
export const SCENE_GROUP_COLOR: Record<
  SceneSemanticGroup,
  { base: string; shade: string }
> = {
  'common-rafter': { base: '#d49a62', shade: '#b87949' },
  'hip-rafter': { base: '#bc7848', shade: '#8e5837' },
  'jack-rafter': { base: '#d3ad82', shade: '#a77750' },
  'collar-tie': { base: '#c98aa8', shade: '#8a4a6b' },
  'wall-plate': { base: '#719184', shade: '#49695d' },
  purlin: { base: '#ae7b4d', shade: '#765234' },
  ridge: { base: '#8397aa', shade: '#4d657d' },
  'opening-framing': { base: '#d8c9ef', shade: '#8b6ab8' },
  'roof-plane': { base: '#91b5a5', shade: '#78968a' },
};

/**
 * Emphasis colours, matching the 2D skeleton's own language: a timber keeps
 * its semantic family colour in every state, and selection/relation are
 * carried by the **edge** stroke (`--a-selection` / `--a-related`) plus a
 * small lift or fade on the body. Selection is therefore never colour alone
 * (UX contract §3, §44).
 */
export const SCENE_EMPHASIS_COLOR = {
  selected: '#007f73',
  related: '#4f8175',
  hover: '#159689',
  edge: '#3c2d20',
};

export type SceneEmphasis = 'selected' | 'related' | 'normal';

/**
 * Which selection emphasis a scene entity carries.
 *
 * It reuses the single workbench rule, so a member emphasised in 2D is the
 * same member emphasised in 3D — there is no second selection state.
 */
export function sceneEntityEmphasis(
  entity: TechnicalSceneEntity,
  view: WorkbenchViewState,
  relatedIds?: ReadonlySet<string>,
): SceneEmphasis {
  if (entity.kind !== 'timber-member') return 'normal';
  const state = resolveMemberRefVisualState({
    ref: entity.sourceRef,
    view,
    relatedIds,
  });
  return state === 'selected'
    ? 'selected'
    : state === 'related'
      ? 'related'
      : 'normal';
}

/** The entity the workbench selection currently points at, if any. */
export function selectedSceneEntity(
  scene: TechnicalScene,
  view: WorkbenchViewState,
): TechnicalSceneEntity | undefined {
  return scene.entities.find(
    (entity) =>
      entity.selectable && sceneEntityEmphasis(entity, view) === 'selected',
  );
}

export interface SceneFamilyFacet {
  group: SceneSemanticGroup;
  /** Generated display code, when the family has one. */
  code?: string;
  nameKey: string;
  count: number;
}

/**
 * Families actually present in this scene, in a stable technical order, so a
 * gable roof never offers an H1 filter it cannot draw.
 */
export function sceneFamilyFacets(scene: TechnicalScene): SceneFamilyFacet[] {
  const order: SceneSemanticGroup[] = [
    'common-rafter',
    'hip-rafter',
    'jack-rafter',
    'collar-tie',
    'purlin',
    'wall-plate',
    'ridge',
    'opening-framing',
  ];
  return order.flatMap((group) => {
    const entities = scene.entities.filter(
      (entity) =>
        entity.kind === 'timber-member' && entity.semanticGroup === group,
    );
    if (entities.length === 0) return [];
    return [
      {
        group,
        code: entities[0]!.label.familyCode,
        nameKey: entities[0]!.label.nameKey,
        count: entities.length,
      },
    ];
  });
}

export interface SceneSelectionFacts {
  code?: string;
  nameKey: string;
  sectionWidthMm?: number;
  sectionDepthMm?: number;
  lengthMm?: number;
  /** Truthfulness limits to disclose next to the facts. */
  limitations: TechnicalSceneEntity['limitations'];
}

/**
 * The small HUD card over the viewport. It restates already-resolved values
 * and owns no editing: the Inspector remains the one exact-edit surface.
 */
export function sceneSelectionFacts(
  entity: TechnicalSceneEntity,
): SceneSelectionFacts {
  return {
    code: entity.label.familyCode,
    nameKey: entity.label.nameKey,
    sectionWidthMm: entity.section?.widthMm,
    sectionDepthMm: entity.section?.depthMm,
    lengthMm: entity.lengthMm,
    limitations: entity.limitations,
  };
}

/**
 * Instancing key: entities sharing it can share one geometry and one draw
 * call. Repeated K1 and J1 rafters collapse into a couple of instanced meshes
 * while every instance keeps its own canonical identity.
 */
export function sceneInstanceKey(entity: TechnicalSceneEntity): string {
  if (entity.geometry.kind !== 'oriented-box') return entity.id;
  const { widthMm, depthMm, alongMm } = entity.geometry.size;
  return [
    entity.semanticGroup,
    widthMm.toFixed(3),
    depthMm.toFixed(3),
    alongMm.toFixed(3),
  ].join('|');
}
