import { beforeEach, describe, expect, it } from 'vitest';
import { createRoofTechnicalScene } from '@cieslacalc/technical-scene';
import { useAssembly } from '../store';
import { workbenchProjectResolver } from '../workbench-project';
import {
  initialWorkbenchViewState,
  supportsTechnical3D,
  type WorkbenchViewState,
} from '../workbench';
import {
  SCENE_GROUP_COLOR,
  sceneEntityEmphasis,
  sceneFamilyFacets,
  sceneInstanceKey,
  scenePickOffsets,
  scenePickTolerance,
  sceneSelectionFacts,
  selectedSceneEntity,
} from './scene-presentation';

/**
 * V38 web-layer behaviour that needs no WebGL: the 2D/3D switch is transient,
 * and 3D emphasis is driven by the one canonical workbench selection.
 */

beforeEach(() => {
  useAssembly.getState().reset();
});

function currentScene() {
  const state = useAssembly.getState();
  return createRoofTechnicalScene({
    skeleton: workbenchProjectResolver.resolve(state.template).skeleton,
  });
}

function view(patch: Partial<WorkbenchViewState> = {}): WorkbenchViewState {
  return { ...initialWorkbenchViewState, ...patch };
}

describe('workspace renderer switch', () => {
  it('defaults to 2D and never records project history', () => {
    expect(useAssembly.getState().workbench.workspaceRenderer).toBe('2d');
    const before = useAssembly.getState().projectDocument;
    useAssembly.getState().setWorkspaceRenderer('3d');
    const state = useAssembly.getState();
    expect(state.workbench.workspaceRenderer).toBe('3d');
    expect(state.historyPast).toHaveLength(0);
    expect(state.historyFuture).toHaveLength(0);
    expect(state.projectDocument).toBe(before);
  });

  it('keeps the selection, task and project across a 2D ↔ 3D switch', () => {
    const store = useAssembly.getState();
    store.setViewPreset('construction');
    const rafter = workbenchProjectResolver
      .resolve(store.template)
      .skeleton.members.find((member) => member.kind === 'rafter')!;
    useAssembly.getState().select(rafter.selectionId, rafter.prototypeId);
    const selectedBefore = useAssembly.getState().workbench.selectedId;
    useAssembly.getState().setWorkspaceRenderer('3d');
    expect(useAssembly.getState().workbench.selectedId).toBe(selectedBefore);
    useAssembly.getState().setWorkspaceRenderer('2d');
    expect(useAssembly.getState().workbench).toMatchObject({
      selectedId: selectedBefore,
      viewPreset: 'construction',
      workspaceRenderer: '2d',
    });
  });

  it('offers 3D only where a technical workspace exists, and falls back otherwise', () => {
    expect(supportsTechnical3D('construction')).toBe(true);
    expect(supportsTechnical3D('cuts')).toBe(true);
    for (const preset of [
      'covering',
      'materials',
      'costing',
      'documents',
    ] as const)
      expect(supportsTechnical3D(preset)).toBe(false);
    useAssembly.getState().setWorkspaceRenderer('3d');
    useAssembly.getState().setViewPreset('covering');
    expect(useAssembly.getState().workbench.workspaceRenderer).toBe('2d');
    // Asking for 3D where there is no 3D workspace stays a no-op.
    useAssembly.getState().setWorkspaceRenderer('3d');
    expect(useAssembly.getState().workbench.workspaceRenderer).toBe('2d');
  });

  it('isolation is the same transient workbench flag in both renderers', () => {
    useAssembly.getState().setWorkspaceRenderer('3d');
    useAssembly.getState().setIsolation(true);
    expect(useAssembly.getState().workbench.isolateSelection).toBe(true);
    expect(useAssembly.getState().historyPast).toHaveLength(0);
    useAssembly.getState().setIsolation(false);
    expect(useAssembly.getState().workbench.isolateSelection).toBe(false);
  });
});

describe('3D emphasis follows the one canonical selection', () => {
  it('selecting a member in the workbench emphasises exactly that scene entity', () => {
    const scene = currentScene();
    const target = scene.entities.find(
      (entity) => entity.semanticGroup === 'common-rafter',
    )!;
    const selected = view({
      selectedId: target.sourceRef.selectionId!,
      selectedInstanceId: target.sourceRef.memberId,
      selectedPrototypeId: target.sourceRef.prototypeId,
    });
    expect(sceneEntityEmphasis(target, selected)).toBe('selected');
    expect(selectedSceneEntity(scene, selected)?.id).toBe(target.id);
    const other = scene.entities.find(
      (entity) =>
        entity.semanticGroup === 'wall-plate' &&
        entity.sourceRef.memberId !== target.sourceRef.memberId,
    )!;
    expect(sceneEntityEmphasis(other, selected)).toBe('normal');
  });

  it('a prototype selection makes the whole family related, not selected', () => {
    const scene = currentScene();
    const target = scene.entities.find(
      (entity) => entity.semanticGroup === 'common-rafter',
    )!;
    const prototypeView = view({
      selectedId: 'roof',
      selectedPrototypeId: target.sourceRef.prototypeId,
    });
    expect(sceneEntityEmphasis(target, prototypeView)).toBe('related');
  });

  it('explicit related IDs mark the selected element’s context', () => {
    const scene = currentScene();
    const ridge = scene.entities.find(
      (entity) => entity.semanticGroup === 'ridge',
    )!;
    const emphasis = sceneEntityEmphasis(
      ridge,
      view({ selectedId: 'roof' }),
      new Set([ridge.sourceRef.selectionId!]),
    );
    expect(emphasis).toBe('related');
  });

  it('nothing is selected when the roof itself is', () => {
    const scene = currentScene();
    expect(selectedSceneEntity(scene, view({ selectedId: 'roof' }))).toBe(
      undefined,
    );
  });
});

describe('viewport presentation helpers', () => {
  it('offers only the families this roof actually resolves', () => {
    const gable = sceneFamilyFacets(currentScene());
    expect(gable.map((family) => family.group)).not.toContain('hip-rafter');
    expect(gable.find((family) => family.group === 'common-rafter')?.code).toBe(
      'K1',
    );
    useAssembly.getState().setRoofType('hip');
    const hip = sceneFamilyFacets(currentScene());
    expect(hip.map((family) => family.group)).toEqual(
      expect.arrayContaining(['common-rafter', 'hip-rafter', 'jack-rafter']),
    );
    for (const family of hip) expect(family.count).toBeGreaterThan(0);
  });

  it('restates resolved facts for the HUD and never invents one', () => {
    const scene = currentScene();
    const rafter = scene.entities.find(
      (entity) => entity.semanticGroup === 'common-rafter',
    )!;
    const facts = sceneSelectionFacts(rafter);
    expect(facts.code).toBe('K1');
    expect(facts.sectionWidthMm).toBe(rafter.section!.widthMm);
    expect(facts.sectionDepthMm).toBe(rafter.section!.depthMm);
    expect(facts.lengthMm).toBe(rafter.lengthMm);
    expect(facts.limitations).toEqual(rafter.limitations);
  });

  it('groups identical repeated rafters into one instancing key', () => {
    const scene = currentScene();
    const rafters = scene.entities.filter(
      (entity) => entity.semanticGroup === 'common-rafter',
    );
    expect(rafters.length).toBeGreaterThan(4);
    expect(new Set(rafters.map(sceneInstanceKey)).size).toBeLessThan(
      rafters.length,
    );
    // Different families never share a key, so colours cannot bleed.
    const ridge = scene.entities.find(
      (entity) => entity.semanticGroup === 'ridge',
    )!;
    expect(sceneInstanceKey(ridge)).not.toBe(sceneInstanceKey(rafters[0]!));
  });

  it('gives every drawn family its own semantic colour', () => {
    const colors = Object.entries(SCENE_GROUP_COLOR)
      .filter(([group]) => group !== 'roof-plane')
      .map(([, value]) => value.base);
    expect(new Set(colors).size).toBe(colors.length);
  });
});

describe('3D pick aperture', () => {
  it('tries the exact point first, then the nearer ring, then the outer one', () => {
    const offsets = scenePickOffsets(16);
    expect(offsets[0]).toEqual({ dx: 0, dy: 0 });
    expect(offsets).toHaveLength(17);
    const radii = offsets.map(({ dx, dy }) => Math.hypot(dx, dy));
    expect(radii.slice(1, 9).every((r) => Math.abs(r - 8) < 0.01)).toBe(true);
    expect(radii.slice(9).every((r) => Math.abs(r - 16) < 0.01)).toBe(true);
  });

  it('is exact without a tolerance and wider for a finger than a mouse', () => {
    expect(scenePickOffsets(0)).toEqual([{ dx: 0, dy: 0 }]);
    expect(scenePickTolerance('mouse')).toBeLessThan(
      scenePickTolerance('touch'),
    );
    expect(scenePickTolerance('pen')).toBe(scenePickTolerance('touch'));
  });
});

describe('member family colours are one system', () => {
  it('CSS member tokens equal the 3D scene family colours', async () => {
    const { readFileSync } = await import('node:fs');
    const tokens = readFileSync(
      new URL('../../../../../packages/ui/src/tokens.css', import.meta.url),
      'utf8',
    );
    const token = (name: string) =>
      new RegExp(`--ui-member-${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(
        tokens,
      )?.[1];
    expect({
      rafter: token('rafter'),
      hip: token('hip'),
      jack: token('jack'),
      collar: token('collar'),
      wallPlate: token('wall-plate'),
      purlin: token('purlin'),
      ridge: token('ridge'),
      opening: token('opening'),
      counterBatten: token('counter-batten'),
    }).toEqual({
      rafter: SCENE_GROUP_COLOR['common-rafter'].base,
      hip: SCENE_GROUP_COLOR['hip-rafter'].base,
      jack: SCENE_GROUP_COLOR['jack-rafter'].base,
      collar: SCENE_GROUP_COLOR['collar-tie'].base,
      wallPlate: SCENE_GROUP_COLOR['wall-plate'].base,
      purlin: SCENE_GROUP_COLOR.purlin.base,
      ridge: SCENE_GROUP_COLOR.ridge.base,
      opening: SCENE_GROUP_COLOR['opening-framing'].base,
      counterBatten: SCENE_GROUP_COLOR['counter-batten'].base,
    });
  });
});
