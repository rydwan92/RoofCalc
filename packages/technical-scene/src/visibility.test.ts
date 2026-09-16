import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCENE_VISIBILITY_POLICY,
  resolveSceneEntityVisibility,
  type SceneSemanticGroup,
  type TechnicalSceneEntity,
} from './index';

function entity(
  semanticGroup: SceneSemanticGroup,
  kind: TechnicalSceneEntity['kind'] = 'timber-member',
): TechnicalSceneEntity {
  return {
    id: `scene:entity:${semanticGroup}`,
    kind,
    semanticGroup,
    label: { nameKey: semanticGroup },
    geometry: {
      kind: 'line',
      from: { x: 0, y: 0, z: 0 },
      to: { x: 1, y: 0, z: 0 },
    },
    selectable: kind === 'timber-member',
    sourceRef: { kind: 'skeleton-member', memberId: 'instance:x' },
    geometryStatus: 'reference',
    limitations: [],
  };
}

const K1 = entity('common-rafter');
const PLANE = entity('roof-plane', 'roof-plane');

describe('scene visibility policy', () => {
  it('shows everything by default', () => {
    expect(
      resolveSceneEntityVisibility(
        K1,
        'normal',
        DEFAULT_SCENE_VISIBILITY_POLICY,
      ),
    ).toBe('visible');
  });

  it('isolation keeps the selection prominent and its context quiet', () => {
    const policy = { ...DEFAULT_SCENE_VISIBILITY_POLICY, isolate: true };
    expect(resolveSceneEntityVisibility(K1, 'selected', policy)).toBe(
      'visible',
    );
    expect(resolveSceneEntityVisibility(K1, 'related', policy)).toBe('ghosted');
    expect(resolveSceneEntityVisibility(K1, 'normal', policy)).toBe('hidden');
    expect(resolveSceneEntityVisibility(PLANE, 'normal', policy)).toBe(
      'hidden',
    );
  });

  it('a family filter hides that family and nothing else', () => {
    const policy = {
      ...DEFAULT_SCENE_VISIBILITY_POLICY,
      hiddenGroups: new Set<SceneSemanticGroup>(['jack-rafter']),
    };
    expect(resolveSceneEntityVisibility(K1, 'normal', policy)).toBe('visible');
    expect(
      resolveSceneEntityVisibility(entity('jack-rafter'), 'normal', policy),
    ).toBe('hidden');
    expect(
      resolveSceneEntityVisibility(entity('jack-rafter'), 'selected', policy),
    ).toBe('hidden');
  });

  it('X-ray quietens only unselected context', () => {
    const policy = { ...DEFAULT_SCENE_VISIBILITY_POLICY, xray: true };
    expect(resolveSceneEntityVisibility(K1, 'selected', policy)).toBe(
      'visible',
    );
    expect(resolveSceneEntityVisibility(K1, 'related', policy)).toBe('visible');
    expect(resolveSceneEntityVisibility(K1, 'normal', policy)).toBe('ghosted');
  });

  it('roof planes are context that can be switched off', () => {
    expect(
      resolveSceneEntityVisibility(
        PLANE,
        'normal',
        DEFAULT_SCENE_VISIBILITY_POLICY,
      ),
    ).toBe('ghosted');
    expect(
      resolveSceneEntityVisibility(PLANE, 'normal', {
        ...DEFAULT_SCENE_VISIBILITY_POLICY,
        showRoofPlanes: false,
      }),
    ).toBe('hidden');
  });
});
