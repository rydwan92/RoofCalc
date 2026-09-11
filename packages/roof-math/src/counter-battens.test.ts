import { describe, expect, it } from 'vitest';
import type {
  RoofOpeningFramingSpec,
  RoofWindowFeature,
} from '@cieslacalc/timber-model';
import { assemblyDefaults } from './assembly';
import { resolveCounterBattenLayout } from './counter-battens';
import { gableTemplateFromAssembly } from './gable-roof';
import {
  createOpeningFramingDraft,
  resolveOpeningFraming,
  resolveOpeningFramingSet,
} from './opening-framing';
import { createRoofSkeleton } from './roof-template';

const template = () =>
  gableTemplateFromAssembly(assemblyDefaults, {
    id: 'template:counter-battens',
    buildingLengthMm: 8100,
    rafterSpacing: { mode: 'max-even-spacing', spacingMm: 1000 },
  });
const layout = {
  enabled: true,
  widthMm: 40,
  heightMm: 60,
};
const opening = (id = 'feature:roof-window-1'): RoofWindowFeature => ({
  id,
  kind: 'roof-window',
  roofPlaneId: 'roof-plane:left',
  widthMm: 780,
  heightMm: 1180,
  position: { uMm: 800, vMm: 1200 },
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
    throw new Error('expected resolved framing');
  return { ...draft, acceptedGeometrySignature: result.geometrySignature };
}

describe('counter-batten geometry', () => {
  it('derives deterministic gable axes from physical common rafters', () => {
    const roof = template();
    const skeleton = createRoofSkeleton(roof);
    const result = resolveCounterBattenLayout({
      template: roof,
      skeleton,
      layout,
    });
    const rafters = skeleton.members.filter(
      (member) => member.kind === 'rafter',
    );
    expect(result.status).toBe('resolved');
    expect(result.rows).toHaveLength(rafters.length);
    expect(result.rows[0]).toMatchObject({
      section: { widthMm: 40, depthMm: 60 },
      status: 'resolved',
    });
    expect(result.rows.map((row) => row.id)).toEqual(
      [...result.rows.map((row) => row.id)].sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true }),
      ),
    );
    expect(result.totalVisibleLengthMm).toBeCloseTo(
      result.rows.reduce((sum, row) => sum + row.visibleLengthMm, 0),
      8,
    );
  });

  it('splits only axes crossed by one or multiple geometric openings', () => {
    const roof = template();
    const skeleton = createRoofSkeleton(roof);
    const first = opening();
    const second = {
      ...opening('feature:roof-window-2'),
      position: { uMm: 800, vMm: 2800 },
    };
    const result = resolveCounterBattenLayout({
      template: roof,
      skeleton,
      layout,
      features: [first, second],
    });
    expect(result.rows.some((row) => row.segments.length === 3)).toBe(true);
    expect(result.totalVisibleLengthMm).toBeLessThan(
      resolveCounterBattenLayout({ template: roof, skeleton, layout })
        .totalVisibleLengthMm,
    );
  });

  it('does not double-count an accepted composed interrupted rafter', () => {
    const roof = template();
    const base = createRoofSkeleton(roof);
    const feature = opening();
    const composed = resolveOpeningFramingSet({
      template: roof,
      skeleton: base,
      features: [feature],
      framingSpecs: [acceptedSpec(roof, feature)],
    }).composedSkeleton;
    const baseResult = resolveCounterBattenLayout({
      template: roof,
      skeleton: base,
      layout,
      features: [feature],
    });
    const composedResult = resolveCounterBattenLayout({
      template: roof,
      skeleton: composed,
      layout,
      features: [feature],
    });
    expect(composedResult.rows).toHaveLength(baseResult.rows.length);
    expect(composedResult.totalVisibleLengthMm).toBeCloseTo(
      baseResult.totalVisibleLengthMm,
      8,
    );
  });

  it('returns an explicit limited result for current hip complexity', () => {
    const source = template();
    const roof = {
      ...source,
      id: 'template:counter-batten-hip',
      type: 'hip' as const,
      buildingLengthMm: 10000,
      hipRafterSection: { widthMm: 100, depthMm: 240 },
    };
    const result = resolveCounterBattenLayout({
      template: roof,
      skeleton: createRoofSkeleton(roof),
      layout,
    });
    expect(result).toMatchObject({
      status: 'limited',
      rows: [],
      warnings: ['unsupported-hip-counter-battens'],
    });
  });

  it('rejects non-finite sections and never emits non-finite geometry', () => {
    const roof = template();
    expect(() =>
      resolveCounterBattenLayout({
        template: roof,
        skeleton: createRoofSkeleton(roof),
        layout: { ...layout, widthMm: Number.NaN },
      }),
    ).toThrow('invalid_counter_batten_section');
    expect(
      JSON.stringify(
        resolveCounterBattenLayout({
          template: roof,
          skeleton: createRoofSkeleton(roof),
          layout,
        }),
      ),
    ).not.toMatch(/NaN|Infinity/);
  });
});
