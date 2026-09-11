import { describe, expect, it } from 'vitest';
import type {
  RoofOpeningFramingSpec,
  RoofWindowFeature,
} from '@cieslacalc/timber-model';
import { assemblyDefaults } from './assembly';
import { gableTemplateFromAssembly } from './gable-roof';
import { createRoofSkeleton } from './roof-template';
import {
  composeRoofSkeleton,
  createOpeningFramingDraft,
  resolveOpeningFraming,
  resolveOpeningFramingSet,
} from './opening-framing';

const template = () =>
  gableTemplateFromAssembly(assemblyDefaults, {
    id: 'template:gable-opening',
    buildingLengthMm: 8100,
    rafterSpacing: { mode: 'max-even-spacing', spacingMm: 1000 },
  });
const opening = (
  id = 'feature:roof-window-1',
  position = { uMm: 800, vMm: 1200 },
  widthMm = 780,
): RoofWindowFeature => ({
  id,
  kind: 'roof-window',
  roofPlaneId: 'roof-plane:left',
  widthMm,
  heightMm: 1180,
  position,
});

function acceptedSpec(
  roof: ReturnType<typeof template>,
  feature: RoofWindowFeature,
): RoofOpeningFramingSpec {
  const draft = createOpeningFramingDraft(roof, feature.id);
  const result = resolveOpeningFraming({
    template: roof,
    skeleton: createRoofSkeleton(roof),
    feature,
    framingSpec: draft,
  });
  if (result.status !== 'resolved' || !result.geometrySignature)
    throw new Error('expected resolved proposal');
  return { ...draft, acceptedGeometrySignature: result.geometrySignature };
}

describe('roof opening framing', () => {
  it('reports no framing need for an opening entirely between rafters', () => {
    const roof = template();
    const feature = opening(
      'feature:roof-window-1',
      { uMm: 60, vMm: 1200 },
      700,
    );
    expect(
      resolveOpeningFraming({
        template: roof,
        skeleton: createRoofSkeleton(roof),
        feature,
      }).status,
    ).toBe('not-needed');
  });

  it('resolves one interrupted common rafter, its boundaries, headers and deterministic segments', () => {
    const roof = template();
    const feature = opening();
    const result = resolveOpeningFraming({
      template: roof,
      skeleton: createRoofSkeleton(roof),
      feature,
      framingSpec: createOpeningFramingDraft(roof, feature.id),
    });
    expect(result.status).toBe('resolved');
    expect(result.affectedMemberInstanceIds).toEqual([
      'instance:rafter-pair-2:left',
    ]);
    expect(result.boundingMemberInstanceIds).toEqual([
      'instance:rafter-pair-1:left',
      'instance:rafter-pair-3:left',
    ]);
    expect(result.interruptedRafters).toHaveLength(1);
    expect(result.lowerFramingMember?.id).toBe(
      'instance:opening-framing:feature:roof-window-1:lower',
    );
    expect(result.upperFramingMember?.lengthMm).toBeGreaterThan(0);
    expect(result.interruptedRafters[0]!.lowerSegment.id).toContain(
      'instance:opening-rafter-segment:feature:roof-window-1:',
    );
  });

  it('resolves two interrupted rafters without non-finite geometry', () => {
    const roof = template();
    const feature = opening(
      'feature:roof-window-1',
      { uMm: 700, vMm: 1200 },
      1300,
    );
    const result = resolveOpeningFraming({
      template: roof,
      skeleton: createRoofSkeleton(roof),
      feature,
    });
    expect(result.status).toBe('resolved');
    expect(result.affectedMemberInstanceIds).toHaveLength(2);
    expect(result.interruptedRafters).toHaveLength(2);
    expect(JSON.stringify(result)).not.toMatch(/NaN|Infinity/);
  });

  it('replaces full affected rafters only in composed geometry and restores the untouched base', () => {
    const roof = template();
    const feature = opening();
    const base = createRoofSkeleton(roof);
    const spec = acceptedSpec(roof, feature);
    const result = resolveOpeningFraming({
      template: roof,
      skeleton: base,
      feature,
      framingSpec: spec,
    });
    const composed = composeRoofSkeleton(base, [result]);
    expect(
      composed.members.some(
        (member) => member.id === result.affectedMemberInstanceIds[0],
      ),
    ).toBe(false);
    expect(
      composed.members.filter((member) => member.kind === 'rafter-segment'),
    ).toHaveLength(2);
    expect(
      composed.members.filter((member) => member.kind === 'opening-header'),
    ).toHaveLength(2);
    expect(base).toEqual(createRoofSkeleton(roof));
    expect(composeRoofSkeleton(base, [])).toEqual(base);
  });

  it('keeps independent openings deterministic and rejects overlapping adaptations', () => {
    const roof = template();
    const base = createRoofSkeleton(roof);
    const first = opening('feature:roof-window-1');
    const second = opening('feature:roof-window-2', { uMm: 3500, vMm: 1200 });
    const independent = resolveOpeningFramingSet({
      template: roof,
      skeleton: base,
      features: [first, second],
      framingSpecs: [acceptedSpec(roof, first), acceptedSpec(roof, second)],
    });
    expect(
      independent.results.every((result) => result.status === 'resolved'),
    ).toBe(true);
    expect(
      new Set(independent.composedSkeleton.members.map((member) => member.id))
        .size,
    ).toBe(independent.composedSkeleton.members.length);

    const overlap = {
      ...first,
      id: 'feature:roof-window-3',
      position: { uMm: 900, vMm: 1300 },
    };
    const conflicting = resolveOpeningFramingSet({
      template: roof,
      skeleton: base,
      features: [first, overlap],
      framingSpecs: [acceptedSpec(roof, first), acceptedSpec(roof, overlap)],
    });
    expect(conflicting.results.map((result) => result.status)).toEqual([
      'conflict',
      'conflict',
    ]);
  });

  it('returns explicit unsupported and invalid states for complex/edge/orphan cases', () => {
    const roof = template();
    const edge = opening('feature:roof-window-edge', { uMm: 800, vMm: 0 });
    expect(
      resolveOpeningFraming({
        template: roof,
        skeleton: createRoofSkeleton(roof),
        feature: edge,
      }).status,
    ).toBe('unsupported-complex-boundary');

    const hip = {
      ...roof,
      type: 'hip' as const,
      id: 'template:hip-opening',
      buildingLengthMm: 10000,
      hipRafterSection: { widthMm: 100, depthMm: 240 },
    };
    const hipFeature = {
      ...opening(),
      roofPlaneId: 'roof-plane:front',
      position: { uMm: 0, vMm: 0 },
    };
    expect(
      resolveOpeningFraming({
        template: hip,
        skeleton: createRoofSkeleton(hip),
        feature: hipFeature,
      }).status,
    ).toBe('unsupported-complex-boundary');

    const orphanSpec = createOpeningFramingDraft(roof, 'feature:missing');
    expect(
      resolveOpeningFramingSet({
        template: roof,
        skeleton: createRoofSkeleton(roof),
        features: [],
        framingSpecs: [orphanSpec],
      }).results[0],
    ).toMatchObject({ status: 'invalid-opening', reviewStatus: 'invalid' });
  });

  it('marks accepted framing for review after roof or opening geometry changes', () => {
    const roof = template();
    const feature = opening();
    const spec = acceptedSpec(roof, feature);
    const changed = { ...roof, buildingLengthMm: 9000 };
    const result = resolveOpeningFraming({
      template: changed,
      skeleton: createRoofSkeleton(changed),
      feature,
      framingSpec: spec,
    });
    expect(result.reviewStatus).toBe('needs-review');
    expect(
      composeRoofSkeleton(createRoofSkeleton(changed), [result]).members.some(
        (member) => member.kind === 'opening-header',
      ),
    ).toBe(false);
  });
});
