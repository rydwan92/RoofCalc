import { describe, expect, it } from 'vitest';
import type {
  GableRoofTemplateSpec,
  RoofTemplateSpec,
} from '@cieslacalc/timber-model';
import { assemblyDefaults, resolveAssembly } from './assembly';
import { resolveCounterBattenLayout } from './counter-battens';
import {
  assemblyFromGableTemplate,
  gableTemplateFromAssembly,
} from './gable-roof';
import { calculateHipRafter } from './hip-rafter';
import { resolveBattenLayout, resolveMembraneLayout } from './roof-features';
import { resolveRoofSurfaceGeometry } from './roof-surface';
import { createRoofSkeleton, resolveRoofTemplate } from './roof-template';

/**
 * V44 calculator trust tests.
 *
 * ORACLES recompute a result with an independent, textbook relation (never by
 * calling the production helper in a different order). METAMORPHIC tests
 * assert how a result must move when one input moves. SYMMETRY tests assert
 * that mirrored members/planes carry equal facts. None of this is a solver.
 */

const rad = (deg: number) => (deg * Math.PI) / 180;
const gable = (overrides: Partial<RoofTemplateSpec> = {}) =>
  ({
    ...gableTemplateFromAssembly(assemblyDefaults, {
      id: 'template:oracle',
      buildingLengthMm: 8000,
      rafterSpacing: { mode: 'max-even-spacing', spacingMm: 800 },
    }),
    ...overrides,
  }) as RoofTemplateSpec;
const hip = (overrides: Partial<RoofTemplateSpec> = {}) =>
  ({
    ...gable(),
    type: 'hip',
    buildingLengthMm: 12000,
    hipRafterSection: { widthMm: 80, depthMm: 240 },
    ...overrides,
  }) as RoofTemplateSpec;

function k1(overrides: {
  runMm?: number;
  pitchDeg?: number;
  overhangMm?: number;
}) {
  const spec = structuredClone(assemblyDefaults);
  Object.assign(spec.roof, overrides);
  return resolveAssembly(spec).member;
}

describe('V44 K1 oracles', () => {
  it.each([
    [4000, 35, 500],
    [3200, 22.5, 300],
    [5100, 48, 0],
  ])(
    'run %i, pitch %f°, eave %i: top edge = (run − ridge/2 + eave) / cos θ',
    (runMm, pitchDeg, overhangMm) => {
      const member = k1({ runMm, pitchDeg, overhangMm });
      const ridgeHalf = assemblyDefaults.ridge.thicknessMm / 2;
      expect(member.referenceLengthMm).toBeCloseTo(
        (runMm - ridgeHalf + overhangMm) / Math.cos(rad(pitchDeg)),
        6,
      );
      // The geometric blank adds exactly the plumb-cut offset of the section.
      expect(
        member.minimumStockLengthMm - member.referenceLengthMm,
      ).toBeCloseTo(
        assemblyDefaults.member.section.depthMm * Math.tan(rad(pitchDeg)),
        6,
      );
    },
  );

  it('ridge plumb cut is 90° − pitch to the member', () => {
    const template = gable({ pitchDeg: 38 });
    const ridge = resolveRoofTemplate(template).calculation.plan.endCuts.find(
      (cut) => cut.end === 'ridge',
    );
    expect(ridge?.angleToMemberDeg).toBeCloseTo(52, 9);
  });

  it('Quick K1 and Creator K1 are the same facts for the same geometry', () => {
    // Quick resolves an AssemblySpec; Creator resolves a template that maps to
    // one. Same geometry must give identical (not merely similar) K1 facts.
    const template = gable({ pitchDeg: 41, halfRunMm: 3700 });
    const creator = resolveRoofTemplate(template).calculation.plan;
    const quick = resolveAssembly(
      assemblyFromGableTemplate(template as GableRoofTemplateSpec),
    ).member;
    expect(creator.minimumStockLengthMm).toBe(quick.minimumStockLengthMm);
    expect(creator.referenceLengthMm).toBe(quick.referenceLengthMm);
  });

  it('metamorphic: longer run, steeper pitch or longer eave never shortens K1', () => {
    const base = k1({});
    expect(k1({ runMm: 4500 }).minimumStockLengthMm).toBeGreaterThan(
      base.minimumStockLengthMm,
    );
    expect(k1({ pitchDeg: 45 }).minimumStockLengthMm).toBeGreaterThan(
      base.minimumStockLengthMm,
    );
    expect(k1({ overhangMm: 800 }).minimumStockLengthMm).toBeGreaterThan(
      base.minimumStockLengthMm,
    );
  });
});

describe('V44 H1 oracles', () => {
  it.each([
    [4000, 35, 500],
    [2800, 45, 300],
  ])(
    'run %i, pitch %f°, eave %i: regular hip trigonometry',
    (run, pitch, eave) => {
      const r = calculateHipRafter({
        id: 'member:hip-oracle',
        commonRunMm: run,
        pitchDeg: pitch,
        overhangMm: eave,
        section: { widthMm: 80, depthMm: 240 },
        ridgeThicknessMm: 0,
      }).result;
      // Plan diagonal of a square corner; hip slope rises by tan θ / √2.
      expect(r.planRunMm).toBeCloseTo(run * Math.SQRT2, 6);
      expect(Math.tan(rad(r.hipSlopeDeg))).toBeCloseTo(
        Math.tan(rad(pitch)) / Math.SQRT2,
        9,
      );
      const rise = run * Math.tan(rad(pitch));
      const tailRise = eave * Math.tan(rad(pitch));
      expect(r.totalTheoreticalLineLengthMm).toBeCloseTo(
        Math.hypot((run + eave) * Math.SQRT2, rise + tailRise),
        6,
      );
    },
  );
});

describe('V44 roof surface oracles and symmetry', () => {
  it('gable area = 2 · length · (run + eave) / cos θ', () => {
    const template = gable({ pitchDeg: 30 });
    const surface = resolveRoofSurfaceGeometry({ template, features: [] });
    expect(surface.grossAreaMm2).toBeCloseTo(
      (2 *
        template.buildingLengthMm *
        (template.halfRunMm + template.eaveOverhangMm)) /
        Math.cos(rad(30)),
      0,
    );
  });

  it('regular hip area = eave footprint / cos θ, with mirrored planes equal', () => {
    const template = hip({ pitchDeg: 40 });
    const surface = resolveRoofSurfaceGeometry({ template, features: [] });
    const e = template.eaveOverhangMm;
    expect(surface.grossAreaMm2).toBeCloseTo(
      ((template.buildingLengthMm + 2 * e) * (2 * template.halfRunMm + 2 * e)) /
        Math.cos(rad(40)),
      0,
    );
    const area = (id: string) =>
      surface.planes.find((plane) => plane.roofPlaneId === id)!.grossAreaMm2;
    expect(area('roof-plane:left')).toBeCloseTo(area('roof-plane:right'), 3);
    expect(area('roof-plane:front')).toBeCloseTo(area('roof-plane:rear'), 3);
  });

  it('symmetric roofs: mirrored K1/J1 lengths, battens and counter-battens agree', () => {
    for (const template of [gable(), hip()]) {
      const skeleton = createRoofSkeleton(template);
      const lengths = (side: string, kind: string) =>
        skeleton.members
          .filter((member) => member.side === side && member.kind === kind)
          .map((member) =>
            Math.hypot(
              member.to.x - member.from.x,
              member.to.y - member.from.y,
              member.to.z - member.from.z,
            ),
          )
          .sort((a, b) => a - b);
      const left = lengths('left', 'rafter');
      expect(left.length).toBeGreaterThan(0);
      left.forEach((value, index) =>
        expect(value).toBeCloseTo(lengths('right', 'rafter')[index]!, 6),
      );
      const battens = resolveBattenLayout({
        template,
        layout: {
          enabled: true,
          battenWidthMm: 60,
          battenHeightMm: 40,
          gaugeMm: 350,
          eaveOffsetMm: 250,
        },
      });
      const plane = (id: string) =>
        battens.planes.find((candidate) => candidate.roofPlaneId === id);
      expect(plane('roof-plane:left')!.totalRowLengthMm).toBeCloseTo(
        plane('roof-plane:right')!.totalRowLengthMm,
        6,
      );
      const counter = resolveCounterBattenLayout({
        template,
        skeleton,
        layout: { enabled: true, widthMm: 40, heightMm: 60 },
      });
      const run = (id: string) =>
        counter.rows
          .filter((row) => row.roofPlaneId === id)
          .reduce((sum, row) => sum + row.visibleLengthMm, 0);
      expect(run('roof-plane:left')).toBeCloseTo(run('roof-plane:right'), 6);
      if (template.type === 'hip') {
        expect(plane('roof-plane:front')!.totalRowLengthMm).toBeCloseTo(
          plane('roof-plane:rear')!.totalRowLengthMm,
          6,
        );
        expect(run('roof-plane:front')).toBeCloseTo(run('roof-plane:rear'), 6);
        const j1 = (side: string) => lengths(side, 'jack-rafter');
        expect(j1('left').length).toBeGreaterThan(0);
        j1('left').forEach((value, index) => {
          expect(value).toBeCloseTo(j1('right')[index]!, 6);
        });
        j1('front').forEach((value, index) => {
          expect(value).toBeCloseTo(j1('rear')[index]!, 6);
        });
      }
    }
  });
});

describe('V44 build-up metamorphic checks', () => {
  const membrane = (minimumOverlapMm: number, template = gable()) =>
    resolveMembraneLayout({
      template,
      layout: { enabled: true },
      product: { rollWidthMm: 1500, rollLengthMm: 50000, minimumOverlapMm },
    });

  it('membrane gross is never below net and never shrinks with more overlap', () => {
    for (const template of [gable(), hip()]) {
      const net = resolveRoofSurfaceGeometry({
        template,
        features: [],
      }).netAreaMm2;
      let previous = 0;
      for (const overlap of [50, 100, 150, 250]) {
        const result = membrane(overlap, template);
        expect(result.status).toBe('resolved');
        expect(result.grossAreaMm2).toBeGreaterThanOrEqual(net - 1);
        expect(result.grossAreaMm2).toBeGreaterThanOrEqual(previous - 1e-6);
        previous = result.grossAreaMm2;
      }
    }
  });

  it('a smaller maximum Auto gauge never yields fewer courses', () => {
    const template = gable();
    let previous = 0;
    for (const maximumGaugeMm of [430, 400, 370, 350]) {
      const result = resolveBattenLayout({
        template,
        layout: {
          enabled: true,
          mode: 'auto-from-covering',
          battenWidthMm: 60,
          battenHeightMm: 40,
          gaugeMm: 350,
          eaveOffsetMm: 250,
        },
        autoSource: { status: 'resolved', minimumGaugeMm: 300, maximumGaugeMm },
      });
      const courses = result.planes[0]!.courseCount;
      expect(courses).toBeGreaterThanOrEqual(previous);
      previous = courses;
    }
  });
});
