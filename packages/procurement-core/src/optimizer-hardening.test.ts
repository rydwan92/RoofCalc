import { describe, expect, it } from 'vitest';
import {
  comparePlanScores,
  createCuttingPlan,
  evaluatePlanScore,
  validateCuttingPlanInput,
  type CuttingPlan,
  type CuttingPlanInput,
  type CuttingSettings,
  type PlanScore,
  type RequiredPiece,
  type StockOption,
} from './index';

const toleranceMm = 1e-7;
const defaultSettings: CuttingSettings = {
  kerfMm: 0,
  endTrimMm: 0,
  minimumReusableRemnantMm: 500,
};

function requiredPiece(
  id: string,
  requiredBlankLengthMm: number,
  stockClassId = 'class:K',
): RequiredPiece {
  return { id, stockClassId, requiredBlankLengthMm };
}

function stockOption(
  id: string,
  lengthMm: number,
  stockClassId = 'class:K',
  availability?: number,
): StockOption {
  return { id, stockClassId, lengthMm, availability };
}

function request(
  requiredPieces: RequiredPiece[],
  stockOptions: StockOption[],
  overrides: Partial<CuttingPlanInput> = {},
): CuttingPlanInput {
  return {
    requiredPieces,
    stockOptions,
    settings: defaultSettings,
    ...overrides,
  };
}

function expectClose(actual: number, expected: number) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(toleranceMm);
}

function verifyPlanInvariants(plan: CuttingPlan, input: CuttingPlanInput) {
  const pieceById = new Map(
    input.requiredPieces.map((piece) => [piece.id, piece]),
  );
  const optionById = new Map(
    input.stockOptions.map((option) => [option.id, option]),
  );
  const assignedIds: string[] = [];

  for (const usage of plan.stockUsages) {
    const option = optionById.get(usage.stockOptionId);
    expect(option).toBeDefined();
    expect(usage.stockClassId).toBe(option!.stockClassId);
    expectClose(usage.originalLengthMm, option!.lengthMm);
    expectClose(
      usage.originalLengthMm,
      usage.endTrimLossMm +
        usage.assignedBlankLengthMm +
        usage.kerfTotalMm +
        usage.remainingLengthMm,
    );
    expectClose(
      usage.usableLengthMm,
      usage.originalLengthMm - 2 * input.settings.endTrimMm,
    );

    usage.cuts.forEach((cut, index) => {
      const source = pieceById.get(cut.requiredPieceId);
      expect(source).toBeDefined();
      expect(source!.stockClassId).toBe(usage.stockClassId);
      expectClose(
        cut.requiredBlankLengthMm,
        source!.requiredBlankLengthMm,
      );
      expectClose(
        cut.toMm - cut.fromMm,
        cut.requiredBlankLengthMm,
      );
      expect(cut.fromMm + toleranceMm).toBeGreaterThanOrEqual(
        input.settings.endTrimMm,
      );
      expect(cut.toMm).toBeLessThanOrEqual(
        usage.originalLengthMm - input.settings.endTrimMm + toleranceMm,
      );
      if (index > 0) {
        const previous = usage.cuts[index - 1]!;
        expectClose(cut.fromMm - previous.toMm, input.settings.kerfMm);
      }
      assignedIds.push(cut.requiredPieceId);
    });
  }

  const unassignedIds = plan.unassignedPieces.map(
    (item) => item.requiredPieceId,
  );
  expect(new Set(assignedIds).size).toBe(assignedIds.length);
  expect(new Set(unassignedIds).size).toBe(unassignedIds.length);
  expect(assignedIds.some((id) => unassignedIds.includes(id))).toBe(false);
  expect([...assignedIds, ...unassignedIds].sort()).toEqual(
    input.requiredPieces.map((piece) => piece.id).sort(),
  );

  for (const option of input.stockOptions) {
    if (option.availability === undefined) continue;
    expect(
      plan.stockUsages.filter((usage) => usage.stockOptionId === option.id)
        .length,
    ).toBeLessThanOrEqual(option.availability);
  }

  expectClose(
    plan.summary.purchasedStockLengthMm,
    plan.summary.assignedBlankLengthMm +
      plan.summary.kerfLossMm +
      plan.summary.wasteLengthMm +
      plan.summary.reusableRemnantLengthMm,
  );
  expect(plan.summary.assignedPieceCount).toBe(assignedIds.length);
  expect(plan.summary.unassignedPieceCount).toBe(unassignedIds.length);
  expect(plan.summary.stockItemCount).toBe(plan.stockUsages.length);
  expect(Object.values(plan.summary).every(Number.isFinite)).toBe(true);
  expect(
    [
      plan.score.stockItemCount,
      plan.score.purchasedStockLengthMm,
      plan.score.irreversibleLossMm,
      plan.score.reusableRemnantLengthMm,
      plan.score.unusedPurchasedLengthMm,
    ].every(Number.isFinite),
  ).toBe(true);
}

function classicGreedyCounterexample(settings = defaultSettings) {
  return request(
    [6000, 5000, 3000, 2000, 2000, 2000].map((lengthMm, index) =>
      requiredPiece(`P${index + 1}`, lengthMm),
    ),
    [stockOption('S', 10_000 + 2 * settings.endTrimMm)],
    { settings },
  );
}

function score(overrides: Partial<PlanScore>): PlanScore {
  return {
    stockItemCount: 1,
    purchasedStockLengthMm: 10_000,
    irreversibleLossMm: 0,
    reusableRemnantLengthMm: 0,
    unusedPurchasedLengthMm: 0,
    deterministicSignature: 'A',
    ...overrides,
  };
}

describe('V26B objective semantics', () => {
  it('compares each objective lexicographically without weighted magic', () => {
    const fewerButLonger = score({
      stockItemCount: 1,
      purchasedStockLengthMm: 15_000,
      unusedPurchasedLengthMm: 3000,
    });
    const shorterButMore = score({
      stockItemCount: 2,
      purchasedStockLengthMm: 14_000,
      irreversibleLossMm: 2000,
      unusedPurchasedLengthMm: 2000,
      deterministicSignature: 'B',
    });

    expect(
      comparePlanScores(fewerButLonger, shorterButMore, 'minimum-stock-count'),
    ).toBeLessThan(0);
    expect(
      comparePlanScores(
        fewerButLonger,
        shorterButMore,
        'minimum-purchased-length',
      ),
    ).toBeGreaterThan(0);
    expect(
      comparePlanScores(fewerButLonger, shorterButMore, 'minimum-waste'),
    ).toBeGreaterThan(0);
  });

  it('does not prefer a large reusable remnant over much less unused stock', () => {
    const oversizedReusable = score({
      irreversibleLossMm: 0,
      reusableRemnantLengthMm: 5000,
      unusedPurchasedLengthMm: 5000,
    });
    const compactWithWaste = score({
      irreversibleLossMm: 100,
      reusableRemnantLengthMm: 0,
      unusedPurchasedLengthMm: 100,
      deterministicSignature: 'B',
    });

    expect(
      comparePlanScores(compactWithWaste, oversizedReusable, 'minimum-waste'),
    ).toBeLessThan(0);
  });

  it('distinguishes stock-count and purchased-length plans without prices', () => {
    const pieces = [requiredPiece('A', 6000), requiredPiece('B', 6000)];
    const options = [stockOption('S7', 7000), stockOption('S15', 15_000)];
    const countPlan = createCuttingPlan(
      request(pieces, options, { objective: 'minimum-stock-count' }),
    );
    const lengthPlan = createCuttingPlan(
      request(pieces, options, { objective: 'minimum-purchased-length' }),
    );
    const wastePlan = createCuttingPlan(
      request(pieces, options, { objective: 'minimum-waste' }),
    );

    expect(countPlan.summary).toMatchObject({
      stockItemCount: 1,
      purchasedStockLengthMm: 15_000,
    });
    expect(lengthPlan.summary).toMatchObject({
      stockItemCount: 2,
      purchasedStockLengthMm: 14_000,
    });
    expect(wastePlan.summary.purchasedStockLengthMm).toBe(14_000);
  });

  it('exposes a score that reconciles reusable and irreversible material', () => {
    const plan = createCuttingPlan(
      request(
        [requiredPiece('A', 600), requiredPiece('B', 300)],
        [stockOption('S1', 1000)],
        {
          settings: {
            kerfMm: 4,
            endTrimMm: 10,
            minimumReusableRemnantMm: 50,
          },
        },
      ),
    );

    expect(plan.score).toEqual(evaluatePlanScore(plan));
    expect(plan.score).toMatchObject({
      stockItemCount: 1,
      purchasedStockLengthMm: 1000,
      irreversibleLossMm: 24,
      reusableRemnantLengthMm: 76,
      unusedPurchasedLengthMm: 100,
    });
  });
});

describe('V26B bounded optimizer', () => {
  it('improves the classic best-fit-decreasing counterexample', () => {
    const fixture = classicGreedyCounterexample();
    const heuristic = createCuttingPlan({
      ...fixture,
      solverLimits: { exactPieceLimit: 1 },
    });
    const improved = createCuttingPlan(fixture);

    expect(heuristic.summary.stockItemCount).toBe(3);
    expect(improved.summary.stockItemCount).toBe(2);
    expect(improved.summary.purchasedStockLengthMm).toBe(20_000);
    expect(improved.optimality).toBe('proven-within-search-space');
  });

  it('finds the same better grouping with explicit kerf and end trims', () => {
    const settings: CuttingSettings = {
      kerfMm: 100,
      endTrimMm: 10,
      minimumReusableRemnantMm: 500,
    };
    const baseFixture = classicGreedyCounterexample(settings);
    const fixture: CuttingPlanInput = {
      ...baseFixture,
      stockOptions: [stockOption('S', 10_220)],
    };
    const heuristic = createCuttingPlan({
      ...fixture,
      solverLimits: { exactPieceLimit: 1 },
    });
    const improved = createCuttingPlan(fixture);

    expect(heuristic.summary.stockItemCount).toBe(3);
    expect(improved.summary.stockItemCount).toBe(2);
    expect(
      improved.stockUsages.every((usage) => usage.remainingLengthMm === 0),
    ).toBe(true);
    verifyPlanInvariants(improved, fixture);
  });

  it('recovers a complete plan that greedy ordering misses under finite availability', () => {
    const baseFixture = classicGreedyCounterexample();
    const fixture: CuttingPlanInput = {
      ...baseFixture,
      stockOptions: [stockOption('S', 10_000, 'class:K', 2)],
    };
    const heuristic = createCuttingPlan({
      ...fixture,
      solverLimits: { exactPieceLimit: 1 },
    });
    const improved = createCuttingPlan(fixture);

    expect(heuristic.status).toBe('partial');
    expect(improved.status).toBe('complete');
    expect(improved.stockUsages).toHaveLength(2);
    expect(improved.optimality).toBe('proven-within-search-space');
    verifyPlanInvariants(improved, fixture);
  });

  it('reports budget exhaustion and returns the deterministic incumbent', () => {
    const fixture = classicGreedyCounterexample();
    const plan = createCuttingPlan({
      ...fixture,
      solverLimits: {
        exactPieceLimit: 16,
        searchStateBudgetPerStockClass: 1,
      },
    });

    expect(plan.status).toBe('complete');
    expect(plan.optimality).toBe('search-budget-exhausted');
    expect(plan.diagnostics).toMatchObject({
      objective: 'minimum-waste',
      strategy: 'hybrid-bounded-branch-and-bound-v2',
      optimality: 'search-budget-exhausted',
      searchStatesVisited: 1,
      searchStateBudgetPerStockClass: 1,
      searchBudgetReached: true,
    });
    expect(plan.summary.stockItemCount).toBe(3);
  });

  it('partitions stock classes and merges their canonical plans deterministically', () => {
    const fixture = request(
      [
        requiredPiece('K2', 4000, 'class:K'),
        requiredPiece('H1', 7200, 'class:H'),
        requiredPiece('K1', 4000, 'class:K'),
        requiredPiece('H2', 3000, 'class:H'),
      ],
      [
        stockOption('K8', 8000, 'class:K'),
        stockOption('H12', 12_000, 'class:H'),
      ],
    );
    const plan = createCuttingPlan(fixture);

    expect(
      plan.diagnostics.stockClasses.map((item) => item.stockClassId),
    ).toEqual(['class:H', 'class:K']);
    expect(plan.stockUsages.map((usage) => usage.stockClassId)).toEqual([
      'class:H',
      'class:K',
    ]);
    verifyPlanInvariants(plan, fixture);
  });

  it('canonicalizes equivalent plans independently of input array order', () => {
    const fixture = classicGreedyCounterexample();
    const reversed = {
      ...fixture,
      requiredPieces: [...fixture.requiredPieces].reverse(),
      stockOptions: [...fixture.stockOptions].reverse(),
    };

    expect(createCuttingPlan(reversed)).toEqual(createCuttingPlan(fixture));
  });

  it('rejects solver limits that could remove the hard complexity bound', () => {
    const fixture = classicGreedyCounterexample();
    const issues = validateCuttingPlanInput({
      ...fixture,
      solverLimits: {
        exactPieceLimit: 21,
        searchStateBudgetPerStockClass: 100_001,
      },
    });

    expect(issues.map((issue) => issue.code)).toEqual([
      'invalid-solver-limit',
      'invalid-solver-limit',
    ]);
  });
});

describe('V26B realistic, stress and property-style invariants', () => {
  it('handles repeated K1/J1/H1-style requirements with finite multi-length stock', () => {
    const requiredPieces = [
      ...Array.from({ length: 14 }, (_, index) =>
        requiredPiece(`K1-${index + 1}`, 5600, 'class:80x200'),
      ),
      ...Array.from({ length: 18 }, (_, index) =>
        requiredPiece(
          `J1-${index + 1}`,
          1100 + (index % 6) * 220,
          'class:80x200',
        ),
      ),
      ...Array.from({ length: 4 }, (_, index) =>
        requiredPiece(`H1-${index + 1}`, 7350, 'class:100x240'),
      ),
    ];
    const stockOptions = [
      stockOption('K6', 6000, 'class:80x200', 6),
      stockOption('K7', 7000, 'class:80x200', 10),
      stockOption('K8', 8000, 'class:80x200', 6),
      stockOption('K12', 12_000, 'class:80x200', 5),
      stockOption('H8', 8000, 'class:100x240', 4),
      stockOption('H12', 12_000, 'class:100x240', 2),
    ];
    const fixture = request(requiredPieces, stockOptions, {
      objective: 'minimum-purchased-length',
      settings: {
        kerfMm: 4,
        endTrimMm: 10,
        minimumReusableRemnantMm: 800,
      },
    });
    const plan = createCuttingPlan(fixture);

    expect(plan.status).toBe('complete');
    expect(plan.diagnostics.stockClasses).toHaveLength(2);
    expect(plan.diagnostics.stockClasses[1]).toMatchObject({
      stockClassId: 'class:80x200',
      strategy: 'heuristic-fallback',
      fallbackReason: 'group-too-large',
    });
    verifyPlanInvariants(plan, fixture);
  });

  it('terminates deterministically on a larger mixed-class fixture', () => {
    const requiredPieces = Array.from({ length: 120 }, (_, index) =>
      requiredPiece(
        `R-${index + 1}`,
        850 + ((index * 977) % 4700),
        `class:${index % 3}`,
      ),
    );
    const stockOptions = Array.from({ length: 3 }, (_, classIndex) =>
      [6000, 7000, 8000, 12_000].map((lengthMm) =>
        stockOption(
          `S-${classIndex}-${lengthMm}`,
          lengthMm,
          `class:${classIndex}`,
        ),
      ),
    ).flat();
    const fixture = request(requiredPieces, stockOptions, {
      settings: {
        kerfMm: 4,
        endTrimMm: 5,
        minimumReusableRemnantMm: 600,
      },
    });
    const first = createCuttingPlan(fixture);
    const second = createCuttingPlan(fixture);

    expect(first).toEqual(second);
    expect(first.optimality).toBe('heuristic');
    expect(
      first.diagnostics.stockClasses.every(
        (item) => item.fallbackReason === 'group-too-large',
      ),
    ).toBe(true);
    verifyPlanInvariants(first, fixture);
  });

  it('preserves universal invariants over deterministic seeded fixtures', () => {
    let seed = 0x26b2026;
    const random = () => {
      seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
      return seed / 0x1_0000_0000;
    };

    for (let fixtureIndex = 0; fixtureIndex < 18; fixtureIndex += 1) {
      const classCount = 1 + Math.floor(random() * 3);
      const requiredPieces = Array.from(
        { length: 5 + Math.floor(random() * 8) },
        (_, index) =>
          requiredPiece(
            `F${fixtureIndex}-P${index}`,
            400 + Math.floor(random() * 5000),
            `class:${index % classCount}`,
          ),
      );
      const stockOptions = Array.from({ length: classCount }, (_, classIndex) =>
        [6000, 7000, 8000, 12_000].map((lengthMm, optionIndex) =>
          stockOption(
            `F${fixtureIndex}-C${classIndex}-S${lengthMm}`,
            lengthMm,
            `class:${classIndex}`,
            optionIndex === 0 ? 1 + Math.floor(random() * 3) : undefined,
          ),
        ),
      ).flat();
      const fixture = request(requiredPieces, stockOptions, {
        objective: (
          [
            'minimum-waste',
            'minimum-purchased-length',
            'minimum-stock-count',
          ] as const
        )[fixtureIndex % 3],
        settings: {
          kerfMm: Math.floor(random() * 6),
          endTrimMm: Math.floor(random() * 20),
          minimumReusableRemnantMm: 200 + Math.floor(random() * 900),
        },
        solverLimits: {
          exactPieceLimit: 7,
          searchStateBudgetPerStockClass: 4000,
        },
      });
      const first = createCuttingPlan(fixture);

      expect(first).toEqual(createCuttingPlan(fixture));
      verifyPlanInvariants(first, fixture);
    }
  });
});
