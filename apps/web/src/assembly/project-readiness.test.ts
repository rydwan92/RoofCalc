import { describe, expect, it } from 'vitest';
import {
  resolvePrimaryCoveringAssignments,
  resolveRoofTileLayout,
  type CoveringAssignmentSpec,
  type RoofTileTechnicalSpec,
} from '@cieslacalc/covering-core';
import type { CostScenarioSummary } from '@cieslacalc/cost-core';
import type { SectionCandidate } from '@cieslacalc/document-core';
import {
  assemblyDefaults,
  convertRoofTemplate,
  createRoofSkeleton,
  gableTemplateFromAssembly,
  resolveBattenLayout,
  resolveCounterBattenLayout,
  resolveRoofSurfaceGeometry,
  roofPlaneIds,
} from '@cieslacalc/roof-math';
import type { RoofBuildUp, RoofTemplateSpec } from '@cieslacalc/timber-model';
import { resolveBattenAutoComposition } from './batten-composition';
import { evaluateBattenInstallation } from './batten-installation';
import {
  deriveBattenWorkflow,
  deriveCounterBattenWorkflow,
} from './batten-workflow';
import {
  disabledBattenLayer,
  disabledCounterBattenLayer,
  newBattenLayer,
  newCounterBattenLayer,
} from './build-up-defaults';
import type { K1CuttingRequirement } from './k1-cutting-adapter';
import type { MaterialPlanRow } from './material-plan';
import {
  deriveProjectReadiness,
  type ReadinessFacts,
} from './project-readiness';

const gable = gableTemplateFromAssembly(assemblyDefaults);
const hip = convertRoofTemplate(gable, 'hip');

/** Seeded narrow tile family: 338–366 mm gauge, 10° minimum pitch. */
const TILE: RoofTileTechnicalSpec = {
  schemaVersion: 1,
  kind: 'roof-tile',
  physicalWidthMm: 298,
  physicalLengthMm: 500,
  installationModes: [
    {
      id: 'standard',
      coverWidthMm: 263,
      gaugeRangeMm: { min: 338, max: 366 },
      minPitchDeg: 10,
      declaredUnitsPerM2: { min: 10.4, max: 11.3 },
      coursePattern: {
        layers: [{ id: 'base', horizontalOffsetFraction: 0 }],
        battenRowOffsetCycle: [0],
      },
    },
  ],
};
const TWO_MODES: RoofTileTechnicalSpec = {
  ...TILE,
  installationModes: [
    TILE.installationModes[0]!,
    { ...TILE.installationModes[0]!, id: 'alternative' },
  ],
};

const tile = (
  planes: string[],
  spec: RoofTileTechnicalSpec = TILE,
): CoveringAssignmentSpec => ({
  id: 'covering:tile',
  roofPlaneIds: planes,
  product: {
    catalogRef: { productId: 'p', technicalRevisionId: 'r' },
    displaySnapshot: { familyName: 'Tile' },
    technicalSpecSnapshot: spec,
  },
});

const K1_RESOLVED = { status: 'resolved' } as unknown as K1CuttingRequirement;
const CANDIDATES: SectionCandidate[] = [
  'project-summary',
  'roof-overview',
  'member-schedule',
  'layers',
  'covering',
  'assumptions',
  'material-list',
].map((kind) => ({
  kind: kind as SectionCandidate['kind'],
  readiness: 'available',
  section: { kind } as never,
}));

function facts(args: {
  template?: RoofTemplateSpec;
  coverings?: CoveringAssignmentSpec[];
  buildUp?: RoofBuildUp;
  k1?: K1CuttingRequirement;
  hasCuttingPlan?: boolean;
  cost?: Partial<CostScenarioSummary>;
  materialRows?: MaterialPlanRow[];
  constructionReady?: boolean;
  membrane?: ReadinessFacts['membrane'];
}): ReadinessFacts {
  const template = args.template ?? gable;
  const coverings = args.coverings ?? [];
  const buildUp = args.buildUp ?? {};
  const battenLayout = buildUp.battenLayout ?? disabledBattenLayer();
  const composition = resolveBattenAutoComposition({
    layout: battenLayout,
    assignments: coverings,
    ownership: resolvePrimaryCoveringAssignments(coverings),
    roofPlaneIds: roofPlaneIds(template),
    roofPitchDeg: template.pitchDeg,
  });
  const battens = resolveBattenLayout({
    template,
    layout: battenLayout,
    autoSource: composition.source,
  });
  const counterLayout = buildUp.counterBattens ?? disabledCounterBattenLayer();
  const counter = resolveCounterBattenLayout({
    template,
    skeleton: createRoofSkeleton(template),
    layout: counterLayout,
  });
  const surface = resolveRoofSurfaceGeometry({ template });
  const ownership = resolvePrimaryCoveringAssignments(coverings);
  return {
    template,
    constructionReady: args.constructionReady ?? true,
    surfaceIssueCount: 0,
    openingWarningCount: 0,
    coverings,
    coveringLayouts: coverings.map((assignment) =>
      resolveRoofTileLayout({
        assignmentId: assignment.id,
        roofPlaneIds:
          ownership.trustedRoofPlaneIdsByAssignment[assignment.id] ?? [],
        roofSurfaceGeometry: surface.planes.map((plane) => ({
          roofPlaneId: plane.roofPlaneId,
          pitchDeg: template.pitchDeg,
          localPolygon: plane.polygon,
          netAreaMm2: plane.netAreaMm2,
        })),
        openings: [],
        battens: battens.battens.map((row) => ({
          id: row.id,
          roofPlaneId: row.roofPlaneId,
          stationVMm: row.stationMm,
          segments: row.segments,
        })),
        productSpec: assignment.product
          .technicalSpecSnapshot as RoofTileTechnicalSpec,
        layoutIntent: { kind: 'roof-tile', horizontalAlignment: 'centered' },
      }),
    ),
    buildUp,
    battenWorkflow: deriveBattenWorkflow({
      layout: buildUp.battenLayout,
      result: battens,
      composition,
      decision: evaluateBattenInstallation({
        layout: battenLayout,
        result: battens,
        composition,
      }),
      assignments: coverings,
      roofPitchDeg: template.pitchDeg,
    }),
    counterBattenWorkflow: deriveCounterBattenWorkflow({
      layout: buildUp.counterBattens,
      result: counter,
    }),
    membrane: args.membrane ?? { enabled: false, hasProduct: false },
    k1: args.k1 ?? K1_RESOLVED,
    hasCuttingPlan: args.hasCuttingPlan ?? true,
    materialRows: args.materialRows ?? [],
    cost: args.cost
      ? ({
          includedLineCount: 3,
          needsPriceCount: 0,
          needsQuantityCount: 0,
          complete: true,
          ...args.cost,
        } as CostScenarioSummary)
      : undefined,
    candidates: CANDIDATES,
  };
}

const codes = (value: ReturnType<typeof deriveProjectReadiness>) =>
  value.issues.map((issue) => issue.code);

describe('V47 project readiness', () => {
  it('valid gable: no blocker or warning, execution document ready', () => {
    const readiness = deriveProjectReadiness(
      facts({
        coverings: [tile(roofPlaneIds(gable))],
        buildUp: { battenLayout: newBattenLayer() },
        cost: {},
      }),
    );
    expect(
      readiness.issues.filter((issue) => issue.severity !== 'info'),
    ).toEqual([]);
    expect(readiness.documents.execution.state).toBe('ready');
    expect(readiness.documents.materials.state).toBe('ready');
    expect(readiness.primary).toBeUndefined();
    expect(readiness.progress.ready).toBe(readiness.progress.total);
  });

  it('valid hip with Auto battens and a decided H1 detail is ready', () => {
    const readiness = deriveProjectReadiness(
      facts({
        template: hip,
        coverings: [tile(roofPlaneIds(hip))],
        buildUp: {
          battenLayout: newBattenLayer(),
          counterBattens: {
            ...newCounterBattenLayer(),
            hipBoundaryDetail: 'no-dedicated-run',
          },
        },
      }),
    );
    expect(readiness.documents.execution.state).toBe('ready');
    expect(codes(readiness)).not.toContain('hip-detail-required');
  });

  it('no covering is an info next step, never a blocker, and not counted as done', () => {
    const readiness = deriveProjectReadiness(facts({}));
    expect(readiness.primary).toMatchObject({
      code: 'covering-missing',
      severity: 'info',
      action: 'choose-covering',
    });
    expect(readiness.documents.execution.state).toBe('ready');
    const covering = readiness.areas.find((area) => area.area === 'covering')!;
    expect(covering).toMatchObject({ state: 'pending', counted: true });
    // Optional cost that has not started does not count against progress.
    expect(readiness.areas.find((area) => area.area === 'cost')!.counted).toBe(
      false,
    );
    // Layers are not applicable without a covering or an enabled layer.
    expect(readiness.areas.find((area) => area.area === 'layers')!.state).toBe(
      'not-applicable',
    );
  });

  it('stale covering plane scope blocks quantity documents with a safe repair', () => {
    const readiness = deriveProjectReadiness(
      facts({
        coverings: [tile(['roof-plane:front', 'roof-plane:left'])],
        buildUp: { battenLayout: newBattenLayer() },
      }),
    );
    expect(readiness.primary).toMatchObject({
      code: 'plane-scope-stale',
      severity: 'blocker',
      action: 'fit-roof',
      safeRepair: true,
    });
    expect(readiness.documents.execution.state).toBe('blocked');
    expect(readiness.documents.cost.blockerIds).toContain('plane-scope-stale');
    expect(readiness.safeRepair.changes).toContainEqual({
      kind: 'covering-planes',
      planeCount: 2,
    });
  });

  it('invalid product data blocks quantities and routes to the covering, never auto-repaired', () => {
    const noRange: RoofTileTechnicalSpec = {
      ...TILE,
      installationModes: [
        { ...TILE.installationModes[0]!, gaugeRangeMm: undefined as never },
      ],
    };
    const readiness = deriveProjectReadiness(
      facts({
        coverings: [tile(roofPlaneIds(gable), noRange)],
        buildUp: { battenLayout: newBattenLayer() },
      }),
    );
    expect(
      readiness.issues.find((item) => item.code === 'covering-incompatible'),
    ).toMatchObject({
      severity: 'blocker',
      action: 'review-covering',
      safeRepair: false,
      params: { issue: 'invalid-product-data' },
    });
    expect(readiness.safeRepair.issueIds).toEqual([]);
  });

  it('manual gauge outside the product range is a blocker with Dopasuj automatycznie', () => {
    const readiness = deriveProjectReadiness(
      facts({
        coverings: [tile(roofPlaneIds(gable))],
        buildUp: {
          battenLayout: { ...newBattenLayer(), mode: 'manual', gaugeMm: 390 },
        },
      }),
    );
    expect(readiness.primary).toMatchObject({
      code: 'battens-incompatible',
      severity: 'blocker',
      action: 'fit-auto',
      safeRepair: false,
      params: { gaugeMm: 390, minMm: 338, maxMm: 366 },
    });
    expect(readiness.documents.materials.state).toBe('blocked');
    // An expert manual gauge is never part of the safe repair group.
    expect(readiness.safeRepair.issueIds).toEqual([]);
  });

  it('unresolved H1 counter-batten detail is a warning with a direct action, not a safe repair', () => {
    const readiness = deriveProjectReadiness(
      facts({
        template: hip,
        coverings: [tile(roofPlaneIds(hip))],
        buildUp: {
          battenLayout: newBattenLayer(),
          counterBattens: newCounterBattenLayer(),
        },
      }),
    );
    expect(readiness.primary).toMatchObject({
      code: 'hip-detail-required',
      severity: 'warning',
      action: 'choose-hip-detail',
      safeRepair: false,
      params: { count: 4 },
    });
    expect(readiness.documents.execution.state).toBe('warning');
    expect(readiness.limitations).toContainEqual({
      code: 'hip-detail-not-decided',
      params: { count: 4 },
    });
  });

  it('ambiguous installation mode is a blocker that is never auto-selected', () => {
    const readiness = deriveProjectReadiness(
      facts({
        coverings: [tile(roofPlaneIds(gable), TWO_MODES)],
        buildUp: { battenLayout: newBattenLayer() },
      }),
    );
    const issue = readiness.issues.find(
      (item) => item.code === 'covering-installation-mode',
    )!;
    expect(issue).toMatchObject({
      severity: 'blocker',
      action: 'choose-installation-mode',
      safeRepair: false,
    });
    expect(readiness.safeRepair.issueIds).not.toContain(issue.id);
  });

  it('membrane without a roll product is a warning for materials and cost only', () => {
    const readiness = deriveProjectReadiness(
      facts({
        buildUp: { membrane: { enabled: true } },
        membrane: { enabled: true, hasProduct: false },
      }),
    );
    const issue = readiness.issues.find(
      (item) => item.code === 'membrane-product-missing',
    )!;
    expect(issue.affects).toEqual(['materials', 'cost']);
    expect(readiness.documents.execution.state).toBe('ready');
    expect(readiness.documents.materials.state).toBe('warning');
  });

  it('membrane roll plan becomes a truthful limitation fact with laps in both axes', () => {
    const row: MaterialPlanRow = {
      id: 'membrane',
      category: 'layers',
      labelKey: 'membrane',
      unit: 'm2',
      basis: 'gross-area',
      suitability: 'execution-based',
      partial: false,
      membranePlan: 'roll-plan',
      metrics: [
        { labelKey: 'netArea', value: 87.9, unit: 'm2' },
        { labelKey: 'grossArea', value: 96.15, unit: 'm2' },
        { labelKey: 'overlapArea', value: 4.8, unit: 'm2' },
        { labelKey: 'endOverlapArea', value: 0.15, unit: 'm2' },
        { labelKey: 'rollCount', value: 2, unit: 'roll' },
      ],
      warnings: ['gross-area-no-roll-reuse', 'hip-course-width-approximated'],
      sourceReferences: [],
    };
    const readiness = deriveProjectReadiness(
      facts({
        buildUp: { membrane: { enabled: true } },
        membrane: { enabled: true, hasProduct: true, layoutStatus: 'resolved' },
        materialRows: [row],
      }),
    );
    const membrane = readiness.limitations.filter((item) =>
      [
        'membrane-roll-plan',
        'membrane-net-only',
        'gross-area-no-roll-reuse',
        'hip-course-width-approximated',
        'openings-not-subtracted',
      ].includes(item.code),
    );
    expect(membrane).toEqual([
      {
        code: 'membrane-roll-plan',
        params: expect.objectContaining({
          netAreaM2: 87.9,
          grossAreaM2: 96.15,
          overlapAreaM2: 4.8,
          endOverlapAreaM2: 0.15,
          rollCount: 2,
        }),
      },
      { code: 'gross-area-no-roll-reuse' },
      { code: 'hip-course-width-approximated' },
    ]);
    expect(membrane.map((item) => item.code)).not.toContain(
      'membrane-net-only',
    );
  });

  it('flags a first tile course that projects implausibly far past the eave', () => {
    const base = facts({
      coverings: [tile(roofPlaneIds(gable))],
      buildUp: { battenLayout: { ...newBattenLayer(), eaveOffsetMm: 0 } },
    });
    const readiness = deriveProjectReadiness(base);
    // A 500 mm tile hung from a batten at the eave edge projects 500 mm.
    expect(
      readiness.issues.find((issue) => issue.code === 'tile-eave-projection'),
    ).toMatchObject({
      severity: 'warning',
      action: 'review-eave-detail',
      params: { projectionMm: 500, direction: 'long' },
    });
    const sensible = deriveProjectReadiness(
      facts({
        coverings: [tile(roofPlaneIds(gable))],
        buildUp: { battenLayout: { ...newBattenLayer(), eaveOffsetMm: 430 } },
      }),
    );
    expect(sensible.issues.map((issue) => issue.code)).not.toContain(
      'tile-eave-projection',
    );
  });

  it('K1 ready without a cutting plan is a quiet info step', () => {
    const readiness = deriveProjectReadiness(facts({ hasCuttingPlan: false }));
    expect(
      readiness.issues.find((item) => item.code === 'k1-cutting-plan-missing'),
    ).toMatchObject({ severity: 'info', action: 'plan-k1', affects: [] });
  });

  it('K1 unresolved warns only the execution document', () => {
    const readiness = deriveProjectReadiness(
      facts({
        k1: {
          status: 'unresolved',
          reason: 'ridge-connection-not-modeled',
        } as K1CuttingRequirement,
      }),
    );
    expect(readiness.documents.execution.state).toBe('warning');
    expect(readiness.documents.materials.state).toBe('ready');
  });

  it('cost with missing prices and quantities says exactly what is missing', () => {
    const readiness = deriveProjectReadiness(
      facts({
        cost: { needsPriceCount: 3, needsQuantityCount: 1, complete: false },
      }),
    );
    expect(
      readiness.issues
        .filter((issue) => issue.area === 'cost')
        .map((issue) => [issue.code, issue.params?.count]),
    ).toEqual([
      ['cost-prices-missing', 3],
      ['cost-quantities-missing', 1],
    ]);
    expect(readiness.documents.cost.state).toBe('unavailable');
    expect(readiness.documents.execution.state).toBe('ready');
  });

  it('invalid geometry blocks every document but keeps the next action concrete', () => {
    const readiness = deriveProjectReadiness(
      facts({ constructionReady: false }),
    );
    expect(readiness.primary).toMatchObject({
      code: 'geometry-invalid',
      action: 'review-geometry',
    });
    expect(readiness.documents.execution.state).toBe('blocked');
  });

  it('every blocker carries a concrete action', () => {
    for (const scenario of [
      facts({ constructionReady: false }),
      facts({ coverings: [tile(['roof-plane:rear'])] }),
      facts({
        coverings: [tile(roofPlaneIds(gable))],
        buildUp: {
          battenLayout: { ...newBattenLayer(), mode: 'manual', gaugeMm: 500 },
        },
      }),
      facts({
        coverings: [tile(roofPlaneIds(gable), TWO_MODES)],
        buildUp: { battenLayout: newBattenLayer() },
      }),
    ])
      for (const issue of deriveProjectReadiness(scenario).issues)
        if (issue.severity === 'blocker') expect(issue.action).toBeDefined();
  });
});

describe('V51 drainage readiness', () => {
  const drainage = (
    status: 'disabled' | 'system-missing' | 'incomplete' | 'complete',
    issueCodes: string[] = [],
    unconfirmedRuns = 0,
  ) => ({ status, issueCodes, unconfirmedRuns });

  it('drainage disabled is not an issue', () => {
    const readiness = deriveProjectReadiness({
      ...facts({}),
      drainage: drainage('disabled'),
    });
    expect(codes(readiness).some((code) => code.startsWith('drainage'))).toBe(
      false,
    );
  });

  it('enabled without a system: an actionable warning, never a blocker', () => {
    const readiness = deriveProjectReadiness({
      ...facts({}),
      drainage: drainage('system-missing', ['system-missing']),
    });
    const issue = readiness.issues.find(
      (item) => item.code === 'drainage-system-missing',
    );
    expect(issue).toMatchObject({
      severity: 'warning',
      action: 'open-drainage',
      affects: ['materials', 'cost'],
    });
    // The execution package and construction are unaffected.
    expect(readiness.documents.execution.warningIds).not.toContain(issue!.id);
    expect(readiness.issues.some((item) => item.severity === 'blocker')).toBe(
      false,
    );
  });

  it('unconfirmed outlets and missing downpipe data are separate actions', () => {
    const readiness = deriveProjectReadiness({
      ...facts({}),
      drainage: drainage(
        'incomplete',
        [
          'outlets-unconfirmed',
          'downpipe-height-missing',
          'elbows-unconfirmed',
        ],
        1,
      ),
    });
    expect(codes(readiness)).toEqual(
      expect.arrayContaining([
        'drainage-outlets-unconfirmed',
        'drainage-downpipes-incomplete',
      ]),
    );
    expect(
      readiness.issues.find(
        (item) => item.code === 'drainage-downpipes-incomplete',
      )?.params,
    ).toEqual({ count: 2 });
  });

  it('enabled drainage adds the one hydraulic limitation to documents', () => {
    const readiness = deriveProjectReadiness({
      ...facts({}),
      drainage: drainage('complete'),
    });
    expect(readiness.limitations.map((item) => item.code)).toContain(
      'drainage-hydraulics-not-verified',
    );
    expect(
      deriveProjectReadiness(facts({})).limitations.map((item) => item.code),
    ).not.toContain('drainage-hydraulics-not-verified');
  });
});
