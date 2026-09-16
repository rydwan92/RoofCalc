import type { SceneSemanticGroup, TechnicalSceneEntity } from './scene';

/**
 * Pure presentation policy for a technical scene entity.
 *
 * Isolation, family filters and X-ray are transient renderer state. They
 * change what is drawn and never what is selected, and they never touch the
 * project document.
 */

export type SceneEntityVisibility = 'visible' | 'ghosted' | 'hidden';

export type SceneEntityEmphasis = 'selected' | 'related' | 'normal';

export interface SceneVisibilityPolicy {
  /** Semantic families the user has switched off. */
  hiddenGroups: ReadonlySet<SceneSemanticGroup>;
  /** Show only the selected element and its related context. */
  isolate: boolean;
  /** Make unselected context semi-transparent instead of opaque. */
  xray: boolean;
  /** Draw the translucent roof-plane context. */
  showRoofPlanes: boolean;
}

export const DEFAULT_SCENE_VISIBILITY_POLICY: SceneVisibilityPolicy = {
  hiddenGroups: new Set(),
  isolate: false,
  xray: false,
  showRoofPlanes: true,
};

export function resolveSceneEntityVisibility(
  entity: TechnicalSceneEntity,
  emphasis: SceneEntityEmphasis,
  policy: SceneVisibilityPolicy,
): SceneEntityVisibility {
  if (entity.kind === 'roof-plane')
    return policy.showRoofPlanes && !policy.isolate ? 'ghosted' : 'hidden';
  if (policy.hiddenGroups.has(entity.semanticGroup))
    // A hidden family stays hidden even while selected: the user asked for it,
    // and the Inspector still shows the selection in the DOM.
    return 'hidden';
  if (policy.isolate)
    return emphasis === 'selected'
      ? 'visible'
      : emphasis === 'related'
        ? 'ghosted'
        : 'hidden';
  if (policy.xray && emphasis === 'normal') return 'ghosted';
  return 'visible';
}
