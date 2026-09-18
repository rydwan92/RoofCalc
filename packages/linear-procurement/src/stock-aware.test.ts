import { describe, expect, it } from 'vitest';
import {
  planLinearAssembly,
  planStockAwareAssembly,
  type LinearAssemblySettings,
  type LinearRun,
  type StockAwareInput,
} from './index';

/**
 * V49 stock-aware assembly. Every fixture is deterministic; the before/after
 * figures quoted in `docs/ARCHITECTURE_V49_STOCK_AWARE_LINEAR_PLANNING.md`
 * come from these tests.
 */

const CUTTING = { kerfMm: 3, endTrimMm: 0, minimumReusableRemnantMm: 300 };
const stock = (...lengths: number[]) =>
  lengths.map((lengthMm) => ({
    id: `stock-${lengthMm}`,
    stockClassId: 'class',
    lengthMm,
  }));

const counterSettings: LinearAssemblySettings = {
  policy: 'joint-along-supporting-member',
  maximumPieceLengthMm: 5000,
  minimumPieceLengthMm: 1200,
  minimumSupportsPerPiece: 3,
};
const battenSettings: LinearAssemblySettings = {
  policy: 'joint-at-support',
  maximumPieceLengthMm: 5000,
  minimumPieceLengthMm: 1200,
  minimumSupportsPerPiece: 3,
  stagger: { joints: 1, consecutiveRuns: 4 },
};

function supportsEvery(spacing: number, lengthMm: number) {
  const supports: { atMm: number; supportId: string }[] = [];
  for (let at = 0; at <= lengthMm; at += spacing)
    supports.push({ atMm: at, supportId: `rafter-${at}` });
  return supports;
}

function runs(
  count: number,
  lengthMm: number,
  supports: LinearRun['supports'] = [],
  sequenceId = 'plane',
): LinearRun[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${sequenceId}-row-${index}`,
    sequenceId,
    sequenceIndex: index,
    lengthMm,
    supports,
    startEnd: 'square' as const,
    endEnd: 'square' as const,
  }));
}

function plan(
  input: Partial<StockAwareInput> & Pick<StockAwareInput, 'runs' | 'settings'>,
) {
  return planStockAwareAssembly({
    stockClassId: 'class',
    stockOptions: stock(3000, 4000, 5000),
    cutting: CUTTING,
    objective: 'minimum-purchased-length',
    ...input,
  });
}

/** Independent check that an assembly only ever joints where it may. */
function assertLegal(
  result: ReturnType<typeof plan>,
  source: readonly LinearRun[],
  settings: LinearAssemblySettings,
) {
  for (const run of source) {
    const pieces = result.assembly.pieces
      .filter((item) => item.runId === run.id)
      .sort((a, b) => a.fromMm - b.fromMm);
    if (!pieces.length) continue;
    expect(pieces[0]!.fromMm).toBe(0);
    expect(pieces.at(-1)!.toMm).toBe(run.lengthMm);
    for (let index = 1; index < pieces.length; index += 1)
      expect(pieces[index]!.fromMm).toBe(pieces[index - 1]!.toMm);
    for (const item of pieces) {
      expect(item.requiredBlankLengthMm).toBeLessThanOrEqual(
        settings.maximumPieceLengthMm,
      );
      if (pieces.length > 1)
        expect(item.installedLengthMm).toBeGreaterThanOrEqual(
          settings.minimumPieceLengthMm,
        );
      if (settings.policy === 'joint-at-support' && item.toMm !== run.lengthMm)
        expect(run.supports.some((s) => s.atMm === item.toMm)).toBe(true);
    }
  }
  // Every piece is assigned exactly once in the final purchase plan.
  const assigned = result.plan.stockUsages.flatMap((usage) =>
    usage.cuts.map((cut) => cut.requiredPieceId),
  );
  expect(new Set(assigned).size).toBe(assigned.length);
  expect(assigned.length + result.plan.unassignedPieces.length).toBe(
    result.assembly.pieces.length,
  );
}

describe('the V48 limitation, demonstrated before it is fixed (V49 §2)', () => {
  it('an even split is valid but a legal stock-aware split buys less', () => {
    // 6,2 m counter-batten: V48 cuts 3,1 m + 3,1 m, and a 3,1 m piece does
    // not fit a 3 m length, so it buys two 4 m lengths (8 m). A legal split
    // that respects the same minimum piece fits 4 m + 3 m (7 m).
    const source = runs(1, 6200);
    const v48 = planLinearAssembly({ runs: source, settings: counterSettings });
    expect(v48.pieces.map((item) => item.installedLengthMm)).toEqual([
      3100, 3100,
    ]);
    const result = plan({ runs: source, settings: counterSettings });
    expect(result.baseline.plan.summary.purchasedStockLengthMm).toBe(8000);
    expect(result.plan.summary.purchasedStockLengthMm).toBe(7000);
    expect(result.search.improvedOverBaseline).toBe(true);
    assertLegal(result, source, counterSettings);
  });

  it('the 5,5 m case from V48: pieces from different runs share stock', () => {
    // Four 5,5 m runs. V48: 8 × 2,75 m, one per 3 m length → 24 m.
    // V49 chooses legal splits whose pieces pack together → 23 m.
    const source = runs(4, 5500);
    const result = plan({ runs: source, settings: counterSettings });
    expect(result.baseline.plan.summary.purchasedStockLengthMm).toBe(24000);
    expect(result.plan.summary.purchasedStockLengthMm).toBe(23000);
    assertLegal(result, source, counterSettings);
  });
});

describe('global improvement over V48 (V49 §11, §41)', () => {
  it('counter-battens: 8 × 6,2 m buys 11 m less, still fully legal', () => {
    const source = runs(8, 6200);
    const result = plan({ runs: source, settings: counterSettings });
    expect(result.baseline.plan.summary.purchasedStockLengthMm).toBe(64000);
    expect(result.plan.summary.purchasedStockLengthMm).toBeLessThanOrEqual(
      53000,
    );
    expect(result.plan.status).toBe('complete');
    assertLegal(result, source, counterSettings);
  });

  it('battens: joints stay on rafters and the plan buys less', () => {
    const source = runs(4, 12000, supportsEvery(800, 12000));
    const result = plan({ runs: source, settings: battenSettings });
    expect(result.baseline.plan.summary.purchasedStockLengthMm).toBe(51000);
    expect(result.plan.summary.purchasedStockLengthMm).toBeLessThan(51000);
    assertLegal(result, source, battenSettings);
  });
});

describe('never worse than V48 (V49 §42)', () => {
  it('keeps an already-optimal V48 split', () => {
    // 8 m on 800 mm supports splits 4 + 4 and fills two 4 m lengths exactly.
    const source = runs(4, 8000, supportsEvery(800, 8000));
    const settings = { ...battenSettings, maximumPieceLengthMm: 4000 };
    const result = plan({ runs: source, settings, stockOptions: stock(4000) });
    expect(result.baseline.plan.unassignedPieces).toEqual([]);
    expect(result.plan.summary.purchasedStockLengthMm).toBe(
      result.baseline.plan.summary.purchasedStockLengthMm,
    );
    expect(result.plan.summary.wasteLengthMm).toBe(0);
  });

  it('the chosen score is never behind the baseline score', () => {
    for (const [count, length] of [
      [2, 5500],
      [4, 7000],
      [3, 9100],
    ] as const) {
      const result = plan({
        runs: runs(count, length),
        settings: counterSettings,
      });
      expect(result.plan.summary.purchasedStockLengthMm).toBeLessThanOrEqual(
        result.baseline.plan.summary.purchasedStockLengthMm,
      );
    }
  });
});

describe('stock sets (V49 §40)', () => {
  const source = runs(4, 7000);
  it.each([
    ['3 m only', [3000]],
    ['4 m only', [4000]],
    ['3 + 4 + 5 m', [3000, 4000, 5000]],
  ])('%s produces a complete, legal plan', (_, lengths) => {
    const result = plan({
      runs: source,
      settings: {
        ...counterSettings,
        maximumPieceLengthMm: Math.max(...lengths),
      },
      stockOptions: stock(...lengths),
    });
    expect(result.plan.status).toBe('complete');
    assertLegal(result, source, {
      ...counterSettings,
      maximumPieceLengthMm: Math.max(...lengths),
    });
  });

  it('a wider choice of lengths is never worse than one of them', () => {
    const only4 = plan({
      runs: source,
      settings: { ...counterSettings, maximumPieceLengthMm: 4000 },
      stockOptions: stock(4000),
    });
    const spread = plan({ runs: source, settings: counterSettings });
    expect(spread.plan.summary.purchasedStockLengthMm).toBeLessThanOrEqual(
      only4.plan.summary.purchasedStockLengthMm,
    );
  });

  it('finite availability is respected, never invented', () => {
    const result = plan({
      runs: runs(4, 7000),
      settings: counterSettings,
      stockOptions: [
        {
          id: 'stock-5000',
          stockClassId: 'class',
          lengthMm: 5000,
          availability: 2,
        },
      ],
    });
    const used = result.plan.stockUsages.length;
    expect(used).toBeLessThanOrEqual(2);
    expect(result.plan.unassignedPieces.length).toBeGreaterThan(0);
  });
});

describe('installation constraints survive optimisation (V49 §4)', () => {
  it('a run without an interior support is never jointed', () => {
    const source: LinearRun[] = [
      {
        id: 'bare',
        sequenceId: 'p',
        sequenceIndex: 0,
        lengthMm: 9000,
        supports: [
          { atMm: 0, supportId: 'a' },
          { atMm: 9000, supportId: 'b' },
        ],
        startEnd: 'square',
        endEnd: 'square',
      },
    ];
    const result = plan({ runs: source, settings: battenSettings });
    expect(result.assembly.pieces).toHaveLength(0);
    expect(result.assembly.unresolved[0]!.reason).toBe(
      'no-legal-joint-position',
    );
  });

  it('a raking end without an allowance stays unplanned', () => {
    const source: LinearRun[] = [
      { ...runs(1, 4000)[0]!, endEnd: 'angled' },
      ...runs(1, 4000, [], 'other'),
    ];
    const result = plan({ runs: source, settings: counterSettings });
    expect(result.assembly.status).toBe('partial');
    expect(result.assembly.unresolved.map((item) => item.reason)).toEqual([
      'angled-end-allowance-required',
    ]);
  });

  it('opening-split runs are planned independently', () => {
    // A roof window leaves two short runs on one course: they stay two runs.
    const source: LinearRun[] = [
      { ...runs(1, 2400, supportsEvery(800, 2400))[0]!, id: 'left' },
      { ...runs(1, 3200, supportsEvery(800, 3200))[0]!, id: 'right' },
    ];
    const result = plan({ runs: source, settings: battenSettings });
    expect(new Set(result.assembly.pieces.map((item) => item.runId))).toEqual(
      new Set(['left', 'right']),
    );
    assertLegal(result, source, battenSettings);
  });

  it('stagger is never made worse than V48 made it', () => {
    const source = runs(8, 12000, supportsEvery(800, 12000));
    const result = plan({ runs: source, settings: battenSettings });
    if (!result.baseline.assembly.summary.staggerRelaxed)
      expect(result.assembly.summary.staggerRelaxed).toBe(false);
  });
});

describe('determinism (V49 §43)', () => {
  it('same input, same assembly and same stock regardless of run order', () => {
    const source = runs(6, 6200);
    const a = plan({ runs: source, settings: counterSettings });
    const b = plan({ runs: [...source].reverse(), settings: counterSettings });
    expect(b.assembly.pieces).toEqual(a.assembly.pieces);
    expect(b.plan.stockUsages).toEqual(a.plan.stockUsages);
  });
});

describe('bounded and honest (V49 §9, §12, §44)', () => {
  it('a small space is enumerated and can be proven', () => {
    const result = plan({ runs: runs(1, 6200), settings: counterSettings });
    expect(result.search.exhaustive).toBe(true);
    expect(result.search.optimality).toBe('proven-within-search-space');
  });

  it('a large roof stays within the budget and returns a valid plan quickly', () => {
    // 2 planes × 20 courses of 10,4 m on 800 mm rafters, plus an opening row.
    const source = [
      ...runs(20, 10400, supportsEvery(800, 10400), 'left'),
      ...runs(20, 10400, supportsEvery(800, 10400), 'right'),
      ...runs(3, 4000, supportsEvery(800, 4000), 'right-window'),
    ];
    const started = performance.now();
    const result = plan({ runs: source, settings: battenSettings });
    const elapsed = performance.now() - started;
    expect(result.search.evaluations).toBeLessThanOrEqual(
      result.search.evaluationBudget,
    );
    expect(result.search.exhaustive).toBe(false);
    expect(result.search.optimality).not.toBe('proven-within-search-space');
    expect(result.plan.status).toBe('complete');
    expect(result.plan.summary.purchasedStockLengthMm).toBeLessThanOrEqual(
      result.baseline.plan.summary.purchasedStockLengthMm,
    );
    // Generous ceiling for slow CI machines; locally this is well under 2 s.
    expect(elapsed).toBeLessThan(8000);
    assertLegal(result, source, battenSettings);
  }, 20000);

  it('a zero budget returns the V48 plan unchanged and says so', () => {
    const source = runs(4, 6200);
    const result = plan({
      runs: source,
      settings: counterSettings,
      limits: { maxEvaluations: 1 },
    });
    expect(result.search.improvedOverBaseline).toBe(false);
    expect(result.assembly.pieces).toEqual(result.baseline.assembly.pieces);
    expect(result.search.optimality).toBe('search-budget-exhausted');
  });
});
