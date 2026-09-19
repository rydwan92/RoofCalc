import { describe, expect, it } from 'vitest';
import {
  createManualDrainageSystem,
  distributeAvoidingJoints,
  flashingCompatibility,
  HOOK_JOINT_CLEARANCE_MM,
  planCommercialSections,
  planGutterPurchase,
  resolveDrainagePlan,
  resolveOpeningSystems,
  resolveRoofLineComponents,
  roofLineComponentIntentSchema,
  roofSystemComponentTechnicalSpecSchema,
  roofSystemIntentSchema,
  roofWindowComponentTechnicalSpecSchema,
  type RoofLineComponentIntent,
  type RoofLineFeatureInput,
  type RoofWindowComponentTechnicalSpec,
} from './index';

const gaps = (positions: readonly number[]) =>
  positions.slice(1).map((value, index) => value - positions[index]!);

describe('V52 hooks vs gutter joints', () => {
  it('never places a hook within the clearance of a joint, and every gap ≤ max', () => {
    for (const lengthMm of [
      3000, 4100, 6010, 8400, 9200, 12345, 13000, 17999,
    ]) {
      const assembly = planCommercialSections(lengthMm, [3000, 4000]);
      const plan = distributeAvoidingJoints({
        lengthMm,
        maxSpacingMm: 600,
        jointStationsMm: assembly.jointStationsMm,
        clearanceMm: HOOK_JOINT_CLEARANCE_MM,
      });
      for (const joint of assembly.jointStationsMm)
        for (const hook of plan.positionsMm)
          expect(Math.abs(hook - joint)).toBeGreaterThanOrEqual(
            HOOK_JOINT_CLEARANCE_MM - 1e-6,
          );
      expect(Math.max(...gaps(plan.positionsMm))).toBeLessThanOrEqual(
        600 + 1e-6,
      );
      expect(plan.positionsMm[0]).toBe(0);
      expect(plan.positionsMm.at(-1)).toBeCloseTo(lengthMm, 6);
    }
  });

  it('is deterministic and adds a hook only when a joint forces it', () => {
    const args = {
      lengthMm: 9200,
      maxSpacingMm: 600,
      jointStationsMm: [4000, 8000],
      clearanceMm: 100,
    };
    expect(distributeAvoidingJoints(args)).toEqual(
      distributeAvoidingJoints(args),
    );
    // Without joints 17 hooks suffice; with these joints 18.
    expect(
      distributeAvoidingJoints({ ...args, jointStationsMm: [] }).count,
    ).toBe(17);
    expect(distributeAvoidingJoints(args).count).toBe(18);
    // A joint the even layout already misses costs nothing.
    expect(
      distributeAvoidingJoints({ ...args, jointStationsMm: [4300] }).count,
    ).toBe(17);
  });

  it('the section assembly reports its installed pieces and joint stations', () => {
    const assembly = planCommercialSections(9200, [4000]);
    expect(assembly.piecesMm).toEqual([4000, 4000, 1200]);
    expect(assembly.jointStationsMm).toEqual([4000, 8000]);
  });

  it('the drainage plan keeps hooks off connector stations', () => {
    const plan = resolveDrainagePlan({
      eaves: [{ id: 'e1', ordinal: 1, lengthMm: 8400 }],
      corners: [],
      intent: {
        enabled: true,
        mode: 'auto',
        system: createManualDrainageSystem({
          name: 'T',
          gutterLengthsMm: [3000],
          downpipeLengthsMm: [3000],
          hookMaxSpacingMm: 600,
        }),
      },
    });
    const segment = plan.runs[0]!.segments[0]!;
    expect(segment.jointStationsMm).toEqual([3000, 6000]);
    for (const joint of segment.jointStationsMm)
      expect(
        segment.hookPositionsMm.every(
          (hook) => Math.abs(hook - joint) >= HOOK_JOINT_CLEARANCE_MM - 1e-6,
        ),
      ).toBe(true);
    expect(plan.hooks.jointClearanceMm).toBe(HOOK_JOINT_CLEARANCE_MM);
  });
});

describe('V52 gutter purchase policy', () => {
  const assemblies = [
    planCommercialSections(4500, [3000]),
    planCommercialSections(4500, [3000]),
  ];

  it('no reuse (default) buys every run from whole sections', () => {
    const purchase = planGutterPurchase({
      assemblies,
      stockLengthsMm: [3000],
      policy: 'no-reuse-between-runs',
    });
    expect(purchase.sections).toEqual([{ lengthMm: 3000, quantity: 4 }]);
    expect(purchase.commercialSurplusMm).toBe(3000);
  });

  it('reuse of straight remainders lets two 1,5 m pieces share one section', () => {
    const purchase = planGutterPurchase({
      assemblies,
      stockLengthsMm: [3000],
      policy: 'reuse-straight-remainders',
    });
    expect(purchase.sections).toEqual([{ lengthMm: 3000, quantity: 3 }]);
    expect(purchase.purchasedLengthMm).toBe(9000);
    expect(purchase.commercialSurplusMm).toBe(0);
    expect(purchase.sharedStockPieces).toBe(1);
  });

  it('reuse never changes the installed assembly (connectors stay per run)', () => {
    const intent = (policy?: 'reuse-straight-remainders') => ({
      enabled: true,
      mode: 'auto' as const,
      purchasePolicy: policy,
      system: createManualDrainageSystem({
        name: 'T',
        gutterLengthsMm: [3000],
        downpipeLengthsMm: [3000],
        hookMaxSpacingMm: 600,
      }),
    });
    const eaves = [
      { id: 'e1', ordinal: 1, lengthMm: 4500 },
      { id: 'e2', ordinal: 2, lengthMm: 4500 },
    ];
    const plain = resolveDrainagePlan({ eaves, corners: [], intent: intent() });
    const reuse = resolveDrainagePlan({
      eaves,
      corners: [],
      intent: intent('reuse-straight-remainders'),
    });
    const q = (plan: typeof plain, key: string) =>
      plan.bom.find((row) => row.key === key)?.quantity;
    expect(q(plain, 'gutter-section:3000')).toBe(4);
    expect(q(reuse, 'gutter-section:3000')).toBe(3);
    expect(q(reuse, 'gutter-connector')).toBe(q(plain, 'gutter-connector'));
    expect(q(reuse, 'gutter-hook')).toBe(q(plain, 'gutter-hook'));
  });
});

describe('V52 downpipe route', () => {
  const run = (route?: {
    kind: 'straight' | 'offset';
    offsetPipeLengthMm?: number;
    dischargeElbow?: boolean;
  }) =>
    resolveDrainagePlan({
      eaves: [{ id: 'e1', ordinal: 1, lengthMm: 6000 }],
      corners: [],
      intent: {
        enabled: true,
        mode: 'auto',
        system: createManualDrainageSystem({
          name: 'T',
          gutterLengthsMm: [3000],
          downpipeLengthsMm: [1000, 3000],
          hookMaxSpacingMm: 600,
          clampMaxSpacingMm: 1800,
        }),
        outlets: [
          {
            id: 'o1',
            eaveId: 'e1',
            station: 0.9,
            downpipeHeightMm: 5000,
            ...(route
              ? {
                  route:
                    route.kind === 'offset'
                      ? {
                          kind: 'offset' as const,
                          offsetPipeLengthMm: route.offsetPipeLengthMm!,
                          dischargeElbow: route.dischargeElbow,
                        }
                      : {
                          kind: 'straight' as const,
                          dischargeElbow: route.dischargeElbow,
                        },
                }
              : {}),
          },
        ],
      },
    });
  const q = (plan: ReturnType<typeof run>, key: string) =>
    plan.bom.find((row) => row.key === key);

  it('an offset route derives exactly two elbows and an offset pipe', () => {
    const plan = run({ kind: 'offset', offsetPipeLengthMm: 400 });
    const elbow = q(plan, 'downpipe-elbow')!;
    expect(elbow.quantity).toBe(2);
    expect(elbow.status).toBe('resolved');
    expect(elbow.rule).toBe('one-per-route-elbow');
    expect(
      plan.issues.some((issue) => issue.code === 'elbows-unconfirmed'),
    ).toBe(false);
    const pipe = plan.outlets[0]!.downpipe;
    expect(pipe.offsetAssembly?.sectionsMm).toEqual([1000]);
    // 5 m vertical = 3 + 3 (fewest sections) plus the 1 m offset piece.
    expect(q(plan, 'downpipe:1000')?.quantity).toBe(1);
  });

  it('a straight pipe needs no offset elbows; a discharge elbow is explicit', () => {
    expect(q(run({ kind: 'straight' }), 'downpipe-elbow')).toBeUndefined();
    expect(
      q(run({ kind: 'straight', dischargeElbow: true }), 'downpipe-elbow')
        ?.quantity,
    ).toBe(1);
    expect(
      q(
        run({ kind: 'offset', offsetPipeLengthMm: 400, dischargeElbow: true }),
        'downpipe-elbow',
      )?.quantity,
    ).toBe(3);
  });

  it('without a route the elbows stay a manual confirmation (V51)', () => {
    const plan = run();
    expect(q(plan, 'downpipe-elbow')?.status).toBe('requires-decision');
  });
});

const hipFeatures: RoofLineFeatureInput[] = [
  { id: 'r1', kind: 'ridge', lengthMm: 4000 },
  { id: 'h1', kind: 'hip', lengthMm: 5800 },
  { id: 'h2', kind: 'hip', lengthMm: 5800 },
  { id: 'h3', kind: 'hip', lengthMm: 5800 },
  { id: 'h4', kind: 'hip', lengthMm: 5800 },
  { id: 'e1', kind: 'eave', lengthMm: 8400 },
  { id: 'e2', kind: 'eave', lengthMm: 8400 },
  { id: 'v1', kind: 'verge', lengthMm: 5000 },
];
const component = (
  overrides: Partial<RoofLineComponentIntent> &
    Pick<RoofLineComponentIntent, 'rule' | 'role'>,
): RoofLineComponentIntent => ({ id: 'c1', name: 'Test', ...overrides });

describe('V52 ridge / hip line components', () => {
  it('ridge + hips 27,2 m with a 5 m roll → 6 rolls, surplus 2,8 m', () => {
    const [tape] = resolveRoofLineComponents({
      features: hipFeatures,
      components: [
        component({
          role: 'ridge-tape',
          rule: { kind: 'roll-length', rollLengthMm: 5000 },
        }),
      ],
    });
    expect(tape!.lineLengthMm).toBe(27200);
    expect(tape!.requirementMm).toBe(27200);
    expect(tape!.quantity).toBe(6);
    expect(tape!.unit).toBe('roll');
    expect(tape!.commercialSurplusMm).toBe(2800);
    expect(tape!.featureIds).toEqual(['r1', 'h1', 'h2', 'h3', 'h4']);
  });

  it('an explicit allowance is added as entered — never a hidden percentage', () => {
    const [tape] = resolveRoofLineComponents({
      features: hipFeatures,
      components: [
        component({
          role: 'ridge-tape',
          allowanceMm: 3000,
          rule: { kind: 'roll-length', rollLengthMm: 5000 },
        }),
      ],
    });
    expect(tape!.requirementMm).toBe(30200);
    expect(tape!.quantity).toBe(7);
  });

  it('ridge ends count open ends from topology, not 2 × features', () => {
    const ends = [
      { featureId: 'r1', open: false },
      { featureId: 'r1', open: false },
      ...['h1', 'h2', 'h3', 'h4'].flatMap((featureId) => [
        { featureId, open: true },
        { featureId, open: false },
      ]),
    ];
    const [end] = resolveRoofLineComponents({
      features: hipFeatures,
      lineEnds: ends,
      components: [
        component({ role: 'ridge-end', rule: { kind: 'one-per-feature-end' } }),
      ],
    });
    expect(end!.quantity).toBe(4);
    const gable = resolveRoofLineComponents({
      features: [{ id: 'r1', kind: 'ridge', lengthMm: 8000 }],
      lineEnds: [
        { featureId: 'r1', open: true },
        { featureId: 'r1', open: true },
      ],
      components: [
        component({ role: 'ridge-end', rule: { kind: 'one-per-feature-end' } }),
      ],
    });
    expect(gable[0]!.quantity).toBe(2);
  });

  it('clips follow the resolved ridge tiles, or wait for them', () => {
    const clip = component({
      role: 'ridge-clip',
      rule: { kind: 'one-per-ridge-tile' },
    });
    expect(
      resolveRoofLineComponents({
        features: hipFeatures,
        components: [clip],
        ridgeTileCount: 69,
      })[0]!.quantity,
    ).toBe(69);
    const waiting = resolveRoofLineComponents({
      features: hipFeatures,
      components: [clip],
    })[0]!;
    expect(waiting.status).toBe('requires-decision');
    expect(waiting.quantity).toBeUndefined();
  });

  it('rejects a rule a role may not use', () => {
    expect(
      roofLineComponentIntentSchema.safeParse(
        component({
          role: 'ridge-end',
          rule: { kind: 'roll-length', rollLengthMm: 5000 },
        }),
      ).success,
    ).toBe(false);
  });
});

describe('V52 eave line components', () => {
  it('uses only the selected eaves, per feature, in commercial pieces', () => {
    const [strip] = resolveRoofLineComponents({
      features: hipFeatures,
      components: [
        component({
          role: 'drip-edge',
          featureIds: ['e1'],
          rule: {
            kind: 'linear-effective-cover',
            effectiveCoverLengthMm: 1900,
          },
        }),
      ],
    });
    expect(strip!.featureIds).toEqual(['e1']);
    expect(strip!.lineLengthMm).toBe(8400);
    expect(strip!.quantity).toBe(5);
    expect(strip!.unit).toBe('piece');
  });

  it('an unselected eave gets nothing; an empty selection needs a decision', () => {
    const [none] = resolveRoofLineComponents({
      features: hipFeatures,
      components: [
        component({
          role: 'eave-comb',
          featureIds: [],
          rule: {
            kind: 'linear-effective-cover',
            effectiveCoverLengthMm: 1000,
          },
        }),
      ],
    });
    expect(none!.status).toBe('requires-decision');
    expect(none!.quantity).toBeUndefined();
  });

  it('a roll product on eaves converts to whole rolls', () => {
    const [strip] = resolveRoofLineComponents({
      features: hipFeatures,
      components: [
        component({
          role: 'eave-ventilation-strip',
          rule: { kind: 'roll-length', rollLengthMm: 5000 },
        }),
      ],
    });
    expect(strip!.quantity).toBe(4);
    expect(strip!.unit).toBe('roll');
  });
});

describe('V52 roof-system-component catalogue spec', () => {
  it('validates role-bound rules structurally', () => {
    const base = {
      schemaVersion: 1,
      kind: 'roof-system-component',
      role: 'ridge-tape',
      compatibility: { scope: 'universal' },
    } as const;
    expect(
      roofSystemComponentTechnicalSpecSchema.safeParse({
        ...base,
        rollLengthMm: 5000,
        quantityRule: 'roll-length',
      }).success,
    ).toBe(true);
    expect(
      roofSystemComponentTechnicalSpecSchema.safeParse({
        ...base,
        quantityRule: 'roll-length',
      }).success,
    ).toBe(false);
    expect(
      roofSystemComponentTechnicalSpecSchema.safeParse({
        ...base,
        quantityRule: 'one-per-feature-end',
      }).success,
    ).toBe(false);
    expect(
      roofSystemComponentTechnicalSpecSchema.safeParse({
        ...base,
        colour: 'red',
      }).success,
    ).toBe(false);
  });

  it('a V51 document with manual line components still parses', () => {
    expect(
      roofSystemIntentSchema.safeParse({
        lineComponents: [
          {
            id: 'line-component-1',
            role: 'ridge-tape',
            name: 'Taśma',
            rule: {
              kind: 'linear-effective-cover',
              effectiveCoverLengthMm: 5000,
            },
          },
        ],
      }).success,
    ).toBe(true);
  });
});

const window = (sizeCode = 'MK06'): RoofWindowComponentTechnicalSpec => ({
  schemaVersion: 1,
  kind: 'roof-window-component',
  role: 'roof-window',
  windowSystemKey: 'velux-pitched',
  sizeCode,
  nominalWidthMm: 780,
  nominalHeightMm: sizeCode === 'MK06' ? 1180 : 980,
});
const kit = (
  overrides: Partial<RoofWindowComponentTechnicalSpec> = {},
): RoofWindowComponentTechnicalSpec => ({
  schemaVersion: 1,
  kind: 'roof-window-component',
  role: 'window-flashing-kit',
  windowSystemKey: 'velux-pitched',
  sizeCode: 'MK06',
  covering: { class: 'profiled', maxProfileHeightMm: 120 },
  pitchRangeDeg: { min: 15, max: 90 },
  installationDepth: 'standard',
  includes: ['window-flashing'],
  ...overrides,
});
const opening = {
  featureId: 'feature:w1',
  ordinal: 1,
  widthMm: 780,
  heightMm: 1180,
  pitchDeg: 35,
  rectangular: true,
};

describe('V52 roof window flashing', () => {
  it('window and kit specs validate', () => {
    expect(
      roofWindowComponentTechnicalSpecSchema.safeParse(window()).success,
    ).toBe(true);
    expect(
      roofWindowComponentTechnicalSpecSchema.safeParse(kit()).success,
    ).toBe(true);
    expect(
      roofWindowComponentTechnicalSpecSchema.safeParse(
        kit({ covering: undefined }),
      ).success,
    ).toBe(false);
  });

  it('a generic opening never gets a compatible kit', () => {
    expect(
      flashingCompatibility({
        kit: kit(),
        window: undefined,
        coveringClass: 'profiled',
        pitchDeg: 35,
        rectangular: true,
      }),
    ).toContain('window-generic');
    const [system] = resolveOpeningSystems({
      openings: [opening],
      intents: [],
    });
    expect(system!.flashing.status).toBe('requires-product');
  });

  it('a supported window with a matching kit resolves to one kit', () => {
    const [system] = resolveOpeningSystems({
      openings: [opening],
      intents: [
        {
          featureId: 'feature:w1',
          window: { name: 'VELUX MK06', spec: window() },
          coveringClass: 'profiled',
          flashing: {
            source: 'catalog',
            product: { name: 'VELUX EDW 0000 MK06', spec: kit() },
          },
        },
      ],
    });
    expect(system!.flashing.status).toBe('resolved');
    expect(system!.flashing.quantity).toBe(1);
    expect(system!.windowSizeDiffers).toBe(false);
  });

  it('incompatible kits are rejected with structural reasons, never by name', () => {
    const reasons = (overrides: Partial<RoofWindowComponentTechnicalSpec>) =>
      flashingCompatibility({
        kit: kit(overrides),
        window: window(),
        coveringClass: 'profiled',
        pitchDeg: 35,
        rectangular: true,
      });
    expect(reasons({ sizeCode: 'MK04' })).toEqual(['size-code-mismatch']);
    expect(reasons({ windowSystemKey: 'fakro-pitched' })).toEqual([
      'window-system-mismatch',
    ]);
    expect(
      reasons({ covering: { class: 'flat', maxThicknessMm: 16 } }),
    ).toEqual(['covering-class-mismatch']);
    expect(reasons({ pitchRangeDeg: { min: 40, max: 90 } })).toEqual([
      'pitch-out-of-range',
    ]);
    // Same technical facts, different marketing name → still compatible.
    expect(reasons({})).toEqual([]);
  });

  it('the covering class must be confirmed by the user', () => {
    expect(
      flashingCompatibility({
        kit: kit(),
        window: window(),
        coveringClass: undefined,
        pitchDeg: 35,
        rectangular: true,
      }),
    ).toEqual(['covering-class-unconfirmed']);
  });

  it('a manual flashing is accepted as RĘCZNIE with its own quantity', () => {
    const [system] = resolveOpeningSystems({
      openings: [opening],
      intents: [
        {
          featureId: 'feature:w1',
          flashing: { source: 'manual', name: 'Kołnierz X', quantity: 1 },
        },
      ],
    });
    expect(system!.flashing).toMatchObject({
      status: 'resolved',
      source: 'manual',
      quantity: 1,
    });
  });
});
