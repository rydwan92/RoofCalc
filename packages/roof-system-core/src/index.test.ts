import { describe, expect, it } from 'vitest';
import {
  createManualDrainageSystem,
  distributeAlongLength,
  drainageIntentSchema,
  planCommercialSections,
  resolveDrainagePlan,
  resolveRoofLineComponents,
  ROOF_SYSTEM_ROLE_GROUP,
  ROOF_SYSTEM_ROLES,
  roofDrainageComponentTechnicalSpecSchema,
  TILE_ACCESSORY_SYSTEM_ROLE,
  type DrainageCornerInput,
  type DrainageEaveInput,
  type DrainageIntent,
  type DrainageSystemSnapshot,
} from './index';

const system = (
  overrides: Partial<Parameters<typeof createManualDrainageSystem>[0]> = {},
): DrainageSystemSnapshot =>
  createManualDrainageSystem({
    name: 'Test',
    gutterLengthsMm: [4000],
    downpipeLengthsMm: [3000],
    hookMaxSpacingMm: 600,
    clampMaxSpacingMm: 1800,
    ...overrides,
  });

const gableEaves: DrainageEaveInput[] = [
  { id: 'e1', ordinal: 1, lengthMm: 9200 },
  { id: 'e2', ordinal: 2, lengthMm: 9200 },
];
// A hip roof read from topology: four eaves in a loop, four external corners.
const hipEaves: DrainageEaveInput[] = [
  { id: 'e1', ordinal: 1, lengthMm: 13000 },
  { id: 'e2', ordinal: 2, lengthMm: 9000 },
  { id: 'e3', ordinal: 3, lengthMm: 13000 },
  { id: 'e4', ordinal: 4, lengthMm: 9000 },
];
const hipCorners: DrainageCornerInput[] = [
  { id: 'c1', endingEaveId: 'e1', startingEaveId: 'e2', kind: 'external' },
  { id: 'c2', endingEaveId: 'e2', startingEaveId: 'e3', kind: 'external' },
  { id: 'c3', endingEaveId: 'e3', startingEaveId: 'e4', kind: 'external' },
  { id: 'c4', endingEaveId: 'e4', startingEaveId: 'e1', kind: 'external' },
];

const quantity = (plan: ReturnType<typeof resolveDrainagePlan>, key: string) =>
  plan.bom.find((row) => row.key === key)?.quantity;

describe('roles', () => {
  it('every role belongs to exactly one group and V50 roles map onto them', () => {
    for (const role of ROOF_SYSTEM_ROLES)
      expect(ROOF_SYSTEM_ROLE_GROUP[role]).toBeDefined();
    for (const role of Object.values(TILE_ACCESSORY_SYSTEM_ROLE))
      expect(ROOF_SYSTEM_ROLE_GROUP[role]).toBe('covering-system');
  });
});

describe('hook spacing', () => {
  it('keeps every interval ≤ 600 mm without accumulating rounding', () => {
    for (const lengthMm of [600, 601, 1199, 1200, 1201, 9200, 12345.6]) {
      const plan = distributeAlongLength({ lengthMm, maxSpacingMm: 600 });
      const gaps = plan.positionsMm
        .slice(1)
        .map((value, index) => value - plan.positionsMm[index]!);
      expect(Math.max(...gaps)).toBeLessThanOrEqual(600 + 1e-9);
      expect(plan.positionsMm[0]).toBe(0);
      expect(plan.positionsMm.at(-1)).toBeCloseTo(lengthMm, 9);
      // Evenly distributed: all gaps equal.
      for (const gap of gaps) expect(gap).toBeCloseTo(plan.intervalMm, 9);
    }
  });

  it('boundary values: exactly 600 → 2 hooks, 601 → 3, 1200 → 3', () => {
    expect(
      distributeAlongLength({ lengthMm: 600, maxSpacingMm: 600 }).count,
    ).toBe(2);
    expect(
      distributeAlongLength({ lengthMm: 601, maxSpacingMm: 600 }).count,
    ).toBe(3);
    expect(
      distributeAlongLength({ lengthMm: 1200, maxSpacingMm: 600 }).count,
    ).toBe(3);
    expect(
      distributeAlongLength({ lengthMm: 9200, maxSpacingMm: 600 }),
    ).toMatchObject({ count: 17 });
  });

  it('respects an end offset', () => {
    const plan = distributeAlongLength({
      lengthMm: 5000,
      maxSpacingMm: 600,
      endOffsetMm: 150,
    });
    expect(plan.positionsMm[0]).toBe(150);
    expect(plan.positionsMm.at(-1)).toBeCloseTo(4850, 9);
    expect(plan.intervalMm).toBeLessThanOrEqual(600);
  });
});

describe('commercial sections', () => {
  it('9.2 m run from 4 m stock, no reuse: 3 sections, 2 joints', () => {
    const plan = planCommercialSections(9200, [4000]);
    expect(plan.sectionsMm).toEqual([4000, 4000, 4000]);
    expect(plan.purchasedLengthMm).toBeGreaterThanOrEqual(9200);
    expect(plan.joints).toBe(plan.sectionsMm.length - 1);
    expect(plan.commercialOverageMm).toBe(2800);
    expect(plan.finalCut).toBe(true);
    expect(plan.policy).toBe('no-reuse-between-runs');
  });

  it('chooses a sensible mix from 2/3/4 m sections', () => {
    const plan = planCommercialSections(9200, [2000, 3000, 4000]);
    expect(plan.sectionsMm).toHaveLength(3);
    expect(plan.purchasedLengthMm).toBe(10000);
    expect(plan.commercialOverageMm).toBeCloseTo(800, 9);
  });

  it('exact multiple has no cut and no overage', () => {
    expect(planCommercialSections(8000, [4000])).toMatchObject({
      sectionsMm: [4000, 4000],
      commercialOverageMm: 0,
      finalCut: false,
      joints: 1,
    });
  });

  it('downpipe 5.4 m from 3 m pipes: 2 pieces, 0.6 m commercial overage', () => {
    const plan = planCommercialSections(5400, [3000]);
    expect(plan.sectionsMm).toEqual([3000, 3000]);
    expect(plan.commercialOverageMm).toBeCloseTo(600, 9);
  });
});

describe('drainage — gable, two independent eaves', () => {
  const intent: DrainageIntent = {
    enabled: true,
    mode: 'manual',
    system: system(),
    gutteredEaveIds: ['e1', 'e2'],
    outlets: [
      {
        id: 'o1',
        eaveId: 'e1',
        station: 0.9,
        downpipeHeightMm: 5400,
        elbowCount: 2,
      },
      {
        id: 'o2',
        eaveId: 'e2',
        station: 0.1,
        downpipeHeightMm: 5400,
        elbowCount: 2,
      },
    ],
  };
  const plan = resolveDrainagePlan({ eaves: gableEaves, corners: [], intent });

  it('has two runs with the eave lengths and four end caps', () => {
    expect(plan.runs).toHaveLength(2);
    expect(plan.runs.map((run) => run.lengthMm)).toEqual([9200, 9200]);
    expect(plan.runs.every((run) => run.openEnds === 2)).toBe(true);
    expect(quantity(plan, 'gutter-end-cap')).toBe(4);
    expect(quantity(plan, 'gutter-corner-external')).toBeUndefined();
  });

  it('counts sections and connectors from each run assembly', () => {
    expect(quantity(plan, 'gutter-section:4000')).toBe(6);
    expect(quantity(plan, 'gutter-connector')).toBe(4);
  });

  it('hooks are placed per run with every interval ≤ 600 mm and off the joints', () => {
    // V51 placed 17 even hooks per 9,2 m eave (575 mm); the 8th landed 25 mm
    // from the 4 m joint. V52 keeps hooks off joints (source requirement), so
    // each eave needs one more: 18 at 541 mm.
    expect(quantity(plan, 'gutter-hook')).toBe(36);
    expect(plan.hooks.actualIntervalMm).toBeLessThanOrEqual(600);
    expect(plan.hooks.actualIntervalMm).toBeCloseTo(9200 / 17, 6);
    expect(plan.hooks.avoidsJoints).toBe(true);
  });

  it('outlets, downpipes, elbows and clamps follow the explicit outlets', () => {
    expect(plan.outlets.map((item) => item.positionMm)).toEqual([8280, 920]);
    expect(quantity(plan, 'gutter-outlet')).toBe(2);
    expect(quantity(plan, 'downpipe:3000')).toBe(4);
    expect(quantity(plan, 'downpipe-connector')).toBe(2);
    expect(quantity(plan, 'downpipe-elbow')).toBe(4);
    // ceil(5400 / 1800) intervals + 1 = 4 clamps per pipe.
    expect(quantity(plan, 'downpipe-clamp')).toBe(8);
    expect(plan.status).toBe('complete');
  });

  it('one selected eave: the other eave creates no material', () => {
    const one = resolveDrainagePlan({
      eaves: gableEaves,
      corners: [],
      intent: {
        ...intent,
        gutteredEaveIds: ['e1'],
        outlets: [intent.outlets![0]!],
      },
    });
    expect(one.runs).toHaveLength(1);
    expect(quantity(one, 'gutter-section:4000')).toBe(3);
    expect(quantity(one, 'gutter-end-cap')).toBe(2);
    expect(one.totalGutterLengthMm).toBe(9200);
  });
});

describe('drainage — hip roof topology', () => {
  const base: DrainageIntent = {
    enabled: true,
    mode: 'manual',
    system: system(),
    gutteredEaveIds: ['e1', 'e2', 'e3', 'e4'],
  };

  it('connected perimeter: one closed run, corners from adjacency, no end caps', () => {
    const plan = resolveDrainagePlan({
      eaves: hipEaves,
      corners: hipCorners,
      intent: {
        ...base,
        corners: hipCorners.map((corner) => ({
          endingEaveId: corner.endingEaveId,
          startingEaveId: corner.startingEaveId,
          connection: 'connected' as const,
        })),
      },
    });
    expect(plan.runs).toHaveLength(1);
    expect(plan.runs[0]!.closed).toBe(true);
    expect(plan.runs[0]!.lengthMm).toBe(44000);
    expect(quantity(plan, 'gutter-corner-external')).toBe(hipCorners.length);
    expect(quantity(plan, 'gutter-end-cap')).toBeUndefined();
    // Two proposed outlets on a closed loop, never counted.
    expect(plan.proposedOutlets).toHaveLength(2);
    expect(quantity(plan, 'gutter-outlet')).toBeUndefined();
  });

  it('separate runs: four runs, eight end caps, no corners', () => {
    const plan = resolveDrainagePlan({
      eaves: hipEaves,
      corners: hipCorners,
      intent: {
        ...base,
        corners: hipCorners.map((corner) => ({
          endingEaveId: corner.endingEaveId,
          startingEaveId: corner.startingEaveId,
          connection: 'separate' as const,
        })),
      },
    });
    expect(plan.runs).toHaveLength(4);
    expect(quantity(plan, 'gutter-end-cap')).toBe(8);
    expect(quantity(plan, 'gutter-corner-external')).toBeUndefined();
  });

  it('one connected corner joins two eaves into one open run', () => {
    const plan = resolveDrainagePlan({
      eaves: hipEaves,
      corners: hipCorners,
      intent: {
        ...base,
        gutteredEaveIds: ['e1', 'e2'],
        corners: [
          { endingEaveId: 'e1', startingEaveId: 'e2', connection: 'connected' },
        ],
      },
    });
    expect(plan.runs).toHaveLength(1);
    expect(plan.runs[0]!.segments.map((s) => s.eaveId)).toEqual(['e1', 'e2']);
    expect(quantity(plan, 'gutter-corner-external')).toBe(1);
    expect(quantity(plan, 'gutter-end-cap')).toBe(2);
  });

  it('manual mode without a corner decision reports it and keeps runs separate', () => {
    const plan = resolveDrainagePlan({
      eaves: hipEaves,
      corners: hipCorners,
      intent: base,
    });
    expect(plan.corners.filter((c) => c.state === 'undecided')).toHaveLength(4);
    expect(
      plan.issues.filter((i) => i.code === 'corner-undecided'),
    ).toHaveLength(4);
    expect(plan.runs).toHaveLength(4);
  });

  it('auto mode proposes the continuous perimeter from the actual corners', () => {
    const plan = resolveDrainagePlan({
      eaves: hipEaves,
      corners: hipCorners.slice(0, 2),
      intent: { enabled: true, mode: 'auto', system: system() },
    });
    expect(plan.corners.every((c) => c.source === 'proposed')).toBe(true);
    expect(quantity(plan, 'gutter-corner-external')).toBe(2);
    expect(plan.runs).toHaveLength(2);
  });
});

describe('drainage — decisions and incompatibility', () => {
  it('disabled drainage is empty', () => {
    expect(
      resolveDrainagePlan({ eaves: gableEaves, corners: [], intent: undefined })
        .status,
    ).toBe('disabled');
  });

  it('enabled without a system: geometry resolves, no BOM', () => {
    const plan = resolveDrainagePlan({
      eaves: gableEaves,
      corners: [],
      intent: { enabled: true, mode: 'auto' },
    });
    expect(plan.status).toBe('system-missing');
    expect(plan.runs).toHaveLength(2);
    expect(plan.bom).toEqual([]);
    expect(plan.issues[0]!.code).toBe('system-missing');
  });

  it('manual hook spacing above the maximum is shown as incompatible, not corrected', () => {
    const plan = resolveDrainagePlan({
      eaves: gableEaves,
      corners: [],
      intent: {
        enabled: true,
        mode: 'auto',
        system: system(),
        hookSpacing: { mode: 'manual', spacingMm: 800 },
      },
    });
    expect(plan.hooks.status).toBe('incompatible');
    expect(plan.hooks.appliedSpacingMm).toBe(800);
    const hooks = plan.bom.find((row) => row.role === 'gutter-hook')!;
    expect(hooks.status).toBe('incompatible');
    expect(hooks.quantity).toBe(2 * 13);
  });

  it('no source-backed hook spacing requires a decision', () => {
    const plan = resolveDrainagePlan({
      eaves: gableEaves,
      corners: [],
      intent: {
        enabled: true,
        mode: 'auto',
        system: system({ hookMaxSpacingMm: undefined }),
      },
    });
    expect(plan.hooks.status).toBe('requires-decision');
    expect(
      plan.bom.find((row) => row.role === 'gutter-hook')!.quantity,
    ).toBeUndefined();
  });

  it('outlet without height: gutter plan exists, downpipe plan incomplete', () => {
    const plan = resolveDrainagePlan({
      eaves: gableEaves,
      corners: [],
      intent: {
        enabled: true,
        mode: 'auto',
        system: system(),
        outlets: [{ id: 'o1', eaveId: 'e1', station: 0.5 }],
      },
    });
    expect(quantity(plan, 'gutter-section:4000')).toBe(6);
    expect(quantity(plan, 'gutter-outlet')).toBe(1);
    const pipe = plan.bom.find((row) => row.role === 'downpipe')!;
    expect(pipe.quantity).toBeUndefined();
    expect(pipe.reason).toBe('downpipe-height-missing');
    expect(plan.issues.map((i) => i.code)).toContain('downpipe-height-missing');
  });

  it('an outlet on an unguttered eave never produces material', () => {
    const plan = resolveDrainagePlan({
      eaves: gableEaves,
      corners: [],
      intent: {
        enabled: true,
        mode: 'manual',
        system: system(),
        gutteredEaveIds: ['e1'],
        outlets: [
          { id: 'o1', eaveId: 'e2', station: 0.5, downpipeHeightMm: 3000 },
        ],
      },
    });
    expect(plan.outlets).toEqual([]);
    expect(plan.issues.map((i) => i.code)).toContain('outlet-outside-run');
  });

  it('the intent schema persists decisions only', () => {
    const parsed = drainageIntentSchema.parse({
      enabled: true,
      mode: 'manual',
      gutteredEaveIds: ['e1'],
      outlets: [{ id: 'o1', eaveId: 'e1', station: 0.25 }],
    });
    expect(Object.keys(parsed).sort()).toEqual([
      'enabled',
      'gutteredEaveIds',
      'mode',
      'outlets',
    ]);
    expect(() =>
      drainageIntentSchema.parse({
        enabled: true,
        mode: 'auto',
        outlets: [{ id: 'o', eaveId: 'e', station: 1.2 }],
      }),
    ).toThrow();
  });

  it('a gutter section spec must carry its commercial length', () => {
    const base = {
      schemaVersion: 1,
      kind: 'roof-drainage-component',
      systemKey: 'galeco-stal2-125-80',
      nominalSystemSize: '125/80×80',
    };
    expect(
      roofDrainageComponentTechnicalSpecSchema.safeParse({
        ...base,
        role: 'gutter-section',
      }).success,
    ).toBe(false);
    expect(
      roofDrainageComponentTechnicalSpecSchema.safeParse({
        ...base,
        role: 'gutter-section',
        lengthMm: 4000,
      }).success,
    ).toBe(true);
  });
});

describe('roof line components', () => {
  it('ridge tape follows ridges and hips, rounded up per feature', () => {
    const [tape] = resolveRoofLineComponents({
      features: [
        { id: 'r', kind: 'ridge', lengthMm: 4000 },
        { id: 'h1', kind: 'hip', lengthMm: 6100 },
        { id: 'e', kind: 'eave', lengthMm: 13000 },
      ],
      components: [
        {
          id: 'c1',
          role: 'ridge-tape',
          name: 'Taśma 5 m',
          rule: {
            kind: 'linear-effective-cover',
            effectiveCoverLengthMm: 5000,
          },
        },
      ],
    });
    expect(tape).toMatchObject({ quantity: 1 + 2, lineLengthMm: 10100 });
  });

  it('a component whose line does not exist is not applicable', () => {
    const [strip] = resolveRoofLineComponents({
      features: [{ id: 'r', kind: 'ridge', lengthMm: 4000 }],
      components: [
        {
          id: 'c1',
          role: 'eave-strip',
          name: 'Pas',
          rule: {
            kind: 'linear-effective-cover',
            effectiveCoverLengthMm: 2000,
          },
        },
      ],
    });
    expect(strip!.status).toBe('not-applicable');
    expect(strip!.quantity).toBeUndefined();
  });
});
