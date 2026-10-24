import { describe, expect, it } from 'vitest';
import type { MonoPitchRoofTemplateSpec } from '@cieslacalc/timber-model';
import { assemblyDefaults } from './assembly';
import { gableTemplateFromAssembly } from './gable-roof';
import {
  createMonoPitchSkeleton,
  resolveMonoPitchFraming,
  type MonoPitchFramingSpec,
} from './mono-pitch-framing';
import { resolveMonoPitchBattens } from './mono-pitch-layers';
import { MONO_PITCH_PLANE_ID, resolveMonoPitchRoof } from './mono-pitch-roof';
import {
  assemblyFromMonoPitchTemplate,
  monoPitchFramingFromTemplate,
  monoPitchRoofTemplateSchema,
  monoPitchTemplateFromAssembly,
  monoPitchTemplateFromFraming,
} from './mono-pitch-template';
import { resolveBattenLayout, resolveRoofPlaneBasis } from './roof-features';
import { resolveRoofSurfaceGeometry, roofPlaneIds } from './roof-surface';
import { resolveRoofFeatureTopology } from './roof-topology';
import {
  convertRoofTemplate,
  createRoofSkeleton,
  isRidgedRoofTemplate,
  resolveRoofTemplate,
  roofTemplateSchema,
  roofTemplateSpanMm,
} from './roof-template';

/** F1 of docs/domain/MONO_PITCH_ROOF.md §8: 6 × 4 m at 15° on 14 × 14 plates. */
const F1: MonoPitchFramingSpec = {
  roof: {
    type: 'mono-pitch',
    id: 'template:mono-pitch-1',
    buildingLengthMm: 6000,
    runMm: 4000,
    pitchDeg: 15,
    lowEaveOverhangMm: 500,
    topEdge: 'free',
    highOverhangMm: 300,
    vergeOverhangMm: 300,
  },
  rafter: {
    section: { widthMm: 80, depthMm: 200 },
    spacing: { mode: 'max-even-spacing', spacingMm: 900 },
  },
  lowSupport: { kind: 'wall-plate', widthMm: 140, heightMm: 140, seatMm: 100 },
  highSupport: {
    kind: 'wall-plate',
    widthMm: 140,
    heightMm: 140,
    seatMm: 100,
  },
};
const template = (
  change: Partial<MonoPitchRoofTemplateSpec> = {},
): MonoPitchRoofTemplateSpec => ({
  ...monoPitchTemplateFromFraming(F1),
  ...change,
});

describe('mono-pitch as a roof template (VNext-8, ADR-016)', () => {
  it('resolves exactly what the mono-pitch solver resolves (F1)', () => {
    const resolved = resolveRoofTemplate(template());
    const framing = resolveMonoPitchFraming(F1);
    expect(resolved.template.type).toBe('mono-pitch');
    expect(resolved.calculation).toEqual(framing.calculation);
    expect(resolved.rafterSpacing).toEqual(framing.rafterSpacing);
    expect(resolved.memberPrototypes).toEqual(framing.memberPrototypes);
    // The reference stock of F1, unchanged by the template route.
    expect(resolved.calculation.plan.minimumStockLengthMm).toBeCloseTo(
      5022.916,
      3,
    );
    expect(createRoofSkeleton(template())).toEqual(
      createMonoPitchSkeleton(framing),
    );
  });

  it('round-trips with the framing input and with the rafter cross section', () => {
    expect(monoPitchFramingFromTemplate(template())).toEqual(F1);
    const withPurlin = template({
      intermediateSupports: [
        { positionMm: 2000, widthMm: 100, heightMm: 160, seatMm: 60 },
      ],
    });
    expect(
      monoPitchTemplateFromAssembly(
        assemblyFromMonoPitchTemplate(withPurlin),
        withPurlin,
      ),
    ).toEqual(withPurlin);
    const abutment = template({
      topEdge: 'abutment',
      highOverhangMm: 0,
      highSupport: { kind: 'ledger', widthMm: 60, heightMm: 120, seatMm: 50 },
    });
    expect(
      monoPitchTemplateFromAssembly(
        assemblyFromMonoPitchTemplate(abutment),
        abutment,
      ),
    ).toEqual(abutment);
  });

  it('a low plate moved up the slope keeps every length measured from its face', () => {
    const current = template({
      intermediateSupports: [
        { positionMm: 2000, widthMm: 100, heightMm: 160, seatMm: 60 },
      ],
    });
    const assembly = assemblyFromMonoPitchTemplate(current);
    assembly.supports[0]!.placement.xMm = 100;
    expect(monoPitchTemplateFromAssembly(assembly, current)).toMatchObject({
      runMm: 3900,
      eaveOverhangMm: 600,
      highOverhangMm: 300,
      intermediateSupports: [{ positionMm: 1900 }],
    });
  });

  it('states framing rules on the template fields', () => {
    const issues = (value: MonoPitchRoofTemplateSpec) =>
      monoPitchRoofTemplateSchema
        .safeParse(value)
        .error?.issues.map((issue) => [issue.path.join('.'), issue.message]);
    expect(issues(template())).toBeUndefined();
    expect(
      issues(template({ topEdge: 'abutment', highOverhangMm: 0 })),
    ).toEqual([['highSupport.kind', 'abutment_needs_ledger']]);
    expect(
      issues(
        template({
          lowSupport: {
            kind: 'wall-plate',
            widthMm: 140,
            heightMm: 140,
            seatMm: 150,
          },
        }),
      ),
    ).toEqual([['lowSupport.seatMm', 'seat_exceeds_support']]);
    expect(issues(template({ topEdge: 'abutment' }))).toEqual(
      expect.arrayContaining([['highOverhangMm', 'abutment_overhang']]),
    );
    expect(roofTemplateSchema.safeParse(template()).success).toBe(true);
  });

  it('gives the shared surface, plane frame and battens one mono-pitch plane', () => {
    const roof = resolveMonoPitchRoof(F1.roof);
    expect(roofPlaneIds(template())).toEqual([MONO_PITCH_PLANE_ID]);
    expect(resolveRoofPlaneBasis(template(), MONO_PITCH_PLANE_ID)).toEqual(
      roof.planes[0].basis,
    );
    const surface = resolveRoofSurfaceGeometry({
      template: template(),
      features: [],
    });
    expect(surface.status).toBe('resolved');
    expect(surface.grossAreaMm2).toBeCloseTo(roof.grossAreaMm2, 6);
    expect(surface.planes[0]).toMatchObject({
      eaveLengthMm: 6600,
      ridgeBoundaryLengthMm: 6600,
      hipBoundaryLengthMm: 0,
    });
    const layout = {
      enabled: true,
      mode: 'manual' as const,
      gaugeMm: 340,
      eaveOffsetMm: 50,
      battenWidthMm: 60,
      battenHeightMm: 40,
    };
    expect(resolveBattenLayout({ template: template(), layout })).toEqual(
      resolveMonoPitchBattens(roof, layout),
    );
    // Against a wall the top line is an abutment, not a ridge.
    expect(
      resolveRoofSurfaceGeometry({
        template: template({
          topEdge: 'abutment',
          highOverhangMm: 0,
          highSupport: {
            kind: 'ledger',
            widthMm: 60,
            heightMm: 120,
            seatMm: 50,
          },
        }),
        features: [],
      }).planes[0]?.ridgeBoundaryLengthMm,
    ).toBe(0);
  });

  it('converts to and from the ridged families, keeping the building', () => {
    const gable = gableTemplateFromAssembly(assemblyDefaults, {
      id: 'template:gable-1',
      buildingLengthMm: 9000,
      rafterSpacing: { mode: 'max-even-spacing', spacingMm: 800 },
    });
    const mono = convertRoofTemplate(gable, 'mono-pitch');
    expect(mono).toMatchObject({
      type: 'mono-pitch',
      buildingLengthMm: 9000,
      runMm: gable.halfRunMm * 2,
      pitchDeg: gable.pitchDeg,
      eaveOverhangMm: gable.eaveOverhangMm,
      rafterSection: gable.rafterSection,
      rafterSpacing: gable.rafterSpacing,
      topEdge: 'free',
    });
    expect(roofTemplateSpanMm(mono)).toBe(roofTemplateSpanMm(gable));
    expect(isRidgedRoofTemplate(mono)).toBe(false);
    expect(() => resolveRoofTemplate(mono)).not.toThrow();
    const back = convertRoofTemplate(mono, 'gable');
    expect(back).toMatchObject({
      type: 'gable',
      halfRunMm: gable.halfRunMm,
      pitchDeg: gable.pitchDeg,
      wallPlate: { section: gable.wallPlate.section },
    });
    expect(convertRoofTemplate(mono, 'hip').type).toBe('hip');
  });

  it('names the top line a ridge when free and an abutment against a wall', () => {
    const kinds = (value: MonoPitchRoofTemplateSpec) =>
      resolveRoofFeatureTopology(
        resolveRoofSurfaceGeometry({ template: value, features: [] }),
      ).features.map((feature) => feature.kind);
    expect(kinds(template())).toEqual(['eave', 'ridge', 'verge', 'verge']);
    const abutment = kinds(
      template({
        topEdge: 'abutment',
        highOverhangMm: 0,
        highSupport: { kind: 'ledger', widthMm: 60, heightMm: 120, seatMm: 50 },
      }),
    );
    expect(abutment).toEqual(['eave', 'verge', 'verge', 'abutment']);
  });
});
