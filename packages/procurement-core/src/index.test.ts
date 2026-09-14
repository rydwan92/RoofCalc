import { describe, expect, it } from 'vitest';
import {
  aggregateStockRequirements,
  createCuttingPlan,
  ProcurementValidationError,
  validateCuttingPlanInput,
  type CuttingPlanInput,
  type CuttingSettings,
  type RequiredPiece,
  type StockOption,
} from './index';

const settings: CuttingSettings = {
  kerfMm: 0,
  endTrimMm: 0,
  minimumReusableRemnantMm: 500,
};

const piece = (
  id: string,
  lengthMm: number,
  stockClassId = 'timber:80x200',
): RequiredPiece => ({ id, stockClassId, lengthMm });

const stock = (
  id: string,
  lengthMm: number,
  options: Partial<Pick<StockOption, 'stockClassId' | 'availability'>> = {},
): StockOption => ({
  id,
  stockClassId: options.stockClassId ?? 'timber:80x200',
  lengthMm,
  availability: options.availability,
});

const input = (
  requiredPieces: RequiredPiece[],
  stockOptions: StockOption[],
  overrides: Partial<CuttingPlanInput> = {},
): CuttingPlanInput => ({
  requiredPieces,
  stockOptions,
  settings,
  ...overrides,
});

describe('timber procurement core', () => {
  it('assigns one indivisible piece to one stock item', () => {
    const plan = createCuttingPlan(
      input([piece('K1-1', 5600)], [stock('S6', 6000)]),
    );

    expect(plan.status).toBe('complete');
    expect(plan.stockUsages).toHaveLength(1);
    expect(plan.stockUsages[0]!.cuts).toEqual([
      { requiredPieceId: 'K1-1', fromMm: 0, toMm: 5600, lengthMm: 5600 },
    ]);
    expect(plan.stockUsages[0]!.remainingLengthMm).toBe(400);
  });

  it('places compatible K1 and J1 pieces into one 7000 mm item with one kerf', () => {
    const plan = createCuttingPlan(
      input([piece('J1-1', 1300), piece('K1-1', 5600)], [stock('S7', 7000)], {
        settings: { ...settings, kerfMm: 4 },
      }),
    );

    expect(plan.stockUsages).toHaveLength(1);
    expect(plan.stockUsages[0]).toMatchObject({
      usedLengthMm: 6900,
      kerfTotalMm: 4,
      remainingLengthMm: 96,
    });
    expect(plan.stockUsages[0]!.cuts).toEqual([
      { requiredPieceId: 'K1-1', fromMm: 0, toMm: 5600, lengthMm: 5600 },
      { requiredPieceId: 'J1-1', fromMm: 5604, toMm: 6904, lengthMm: 1300 },
    ]);
  });

  it('does not hide kerf when two pieces otherwise fit exactly', () => {
    const plan = createCuttingPlan(
      input(
        [piece('A', 600), piece('B', 400)],
        [stock('S1', 1000, { availability: 1 })],
        {
          settings: { ...settings, kerfMm: 4 },
        },
      ),
    );

    expect(plan.status).toBe('partial');
    expect(plan.stockUsages[0]!.cuts).toHaveLength(1);
    expect(plan.unassignedPieces).toEqual([
      {
        requiredPieceId: 'B',
        stockClassId: 'timber:80x200',
        lengthMm: 400,
        reason: 'availability-exhausted',
      },
    ]);
  });

  it('subtracts the configured trim from both stock ends', () => {
    const plan = createCuttingPlan(
      input([piece('A', 990)], [stock('S1', 1000)], {
        settings: { ...settings, endTrimMm: 10 },
      }),
    );

    expect(plan.status).toBe('unfulfilled');
    expect(plan.unassignedPieces[0]!.reason).toBe('piece-longer-than-stock');
  });

  it('supports 6000, 7000, 8000 and 12000 mm commercial alternatives', () => {
    const plan = createCuttingPlan(
      input(
        [piece('A', 7600)],
        [
          stock('S12', 12000),
          stock('S6', 6000),
          stock('S8', 8000),
          stock('S7', 7000),
        ],
      ),
    );

    expect(plan.stockUsages[0]!.stockOptionId).toBe('S8');
  });

  it('returns the same ordered plan and IDs for the same input', () => {
    const request = input(
      [piece('B', 1300), piece('A', 5600), piece('C', 1300)],
      [stock('S8', 8000), stock('S7', 7000)],
      { settings: { ...settings, kerfMm: 4 } },
    );
    const before = structuredClone(request);

    expect(createCuttingPlan(request)).toEqual(createCuttingPlan(request));
    expect(request).toEqual(before);
  });

  it('reuses open stock only for the same stock class', () => {
    const plan = createCuttingPlan(
      input([piece('A', 600), piece('B', 300)], [stock('S1', 1000)]),
    );

    expect(plan.stockUsages).toHaveLength(1);
    expect(plan.stockUsages[0]!.cuts.map((cut) => cut.requiredPieceId)).toEqual(
      ['A', 'B'],
    );
  });

  it('never mixes incompatible opaque stock classes', () => {
    const plan = createCuttingPlan(
      input(
        [piece('A', 400, 'class:A'), piece('B', 400, 'class:B')],
        [
          stock('SA', 1000, { stockClassId: 'class:A' }),
          stock('SB', 1000, { stockClassId: 'class:B' }),
        ],
      ),
    );

    expect(plan.stockUsages).toHaveLength(2);
    expect(plan.stockUsages.map((usage) => usage.cuts.length)).toEqual([1, 1]);
  });

  it('reuses a compatible remnant later in the same plan without double-counting it', () => {
    const plan = createCuttingPlan(
      input([piece('K1', 5600), piece('J1', 1300)], [stock('S7', 7000)], {
        settings: { ...settings, kerfMm: 4, minimumReusableRemnantMm: 50 },
      }),
    );

    expect(plan.stockUsages).toHaveLength(1);
    expect(plan.stockUsages[0]).toMatchObject({
      remainingLengthMm: 96,
      remnantClassification: 'reusable-remnant',
    });
    expect(plan.summary.reusableRemnantLengthMm).toBe(96);
  });

  it('classifies a short positive remnant as waste', () => {
    const plan = createCuttingPlan(
      input([piece('A', 800)], [stock('S1', 1000)], {
        settings: { ...settings, minimumReusableRemnantMm: 250 },
      }),
    );

    expect(plan.stockUsages[0]!.remnantClassification).toBe('waste');
    expect(plan.summary.wasteLengthMm).toBe(200);
  });

  it('classifies a sufficiently long remnant as reusable', () => {
    const plan = createCuttingPlan(
      input([piece('A', 600)], [stock('S1', 1000)], {
        settings: { ...settings, minimumReusableRemnantMm: 400 },
      }),
    );

    expect(plan.stockUsages[0]!.remnantClassification).toBe('reusable-remnant');
    expect(plan.summary.reusableRemnantLengthMm).toBe(400);
  });

  it('returns an overlong piece as unassigned instead of truncating it', () => {
    const plan = createCuttingPlan(
      input([piece('A', 1201)], [stock('S1', 1000), stock('S2', 1200)]),
    );

    expect(plan.status).toBe('unfulfilled');
    expect(plan.stockUsages).toEqual([]);
    expect(plan.unassignedPieces[0]!.reason).toBe('piece-longer-than-stock');
  });

  it('reports the absence of a compatible stock class', () => {
    const plan = createCuttingPlan(
      input(
        [piece('A', 500, 'class:missing')],
        [stock('S1', 1000, { stockClassId: 'class:other' })],
      ),
    );

    expect(plan.unassignedPieces[0]!.reason).toBe('no-compatible-stock');
  });

  it('does not join two remnants to manufacture one required piece', () => {
    const plan = createCuttingPlan(
      input(
        [piece('A', 600), piece('B', 600), piece('C', 500)],
        [stock('S1', 1000, { availability: 2 })],
      ),
    );

    expect(plan.stockUsages.map((usage) => usage.remainingLengthMm)).toEqual([
      400, 400,
    ]);
    expect(plan.unassignedPieces).toEqual([
      {
        requiredPieceId: 'C',
        stockClassId: 'timber:80x200',
        lengthMm: 500,
        reason: 'availability-exhausted',
      },
    ]);
  });

  it('validates finite positive dimensions and finite nonnegative settings', () => {
    const invalid = input(
      [piece('A', 0), piece('B', Number.POSITIVE_INFINITY)],
      [stock('S1', -1), stock('S2', 1000, { availability: 1.5 })],
      {
        settings: {
          kerfMm: -1,
          endTrimMm: Number.NaN,
          minimumReusableRemnantMm: 0,
        },
      },
    );

    expect(
      validateCuttingPlanInput(invalid).map((issue) => issue.code),
    ).toEqual([
      'invalid-required-piece-length',
      'invalid-required-piece-length',
      'invalid-stock-length',
      'invalid-availability',
      'invalid-cutting-setting',
      'invalid-cutting-setting',
    ]);
    expect(() => createCuttingPlan(invalid)).toThrow(
      ProcurementValidationError,
    );
  });

  it('rejects duplicate identities at the package boundary', () => {
    const invalid = input(
      [piece('A', 100), piece('A', 200)],
      [stock('S', 1000), stock('S', 1200)],
    );

    expect(validateCuttingPlanInput(invalid)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'duplicate-required-piece-id' }),
        expect.objectContaining({ code: 'duplicate-stock-option-id' }),
      ]),
    );
  });

  it('honours an explicit stock availability limit', () => {
    const plan = createCuttingPlan(
      input(
        [piece('A', 600), piece('B', 600)],
        [stock('S1', 1000, { availability: 1 })],
      ),
    );

    expect(plan.summary).toMatchObject({
      assignedPieceCount: 1,
      unassignedPieceCount: 1,
      stockItemCount: 1,
    });
    expect(plan.unassignedPieces[0]!.reason).toBe('availability-exhausted');
  });

  it('aggregates exact commercial requirements by class, option and length', () => {
    const plan = createCuttingPlan(
      input(
        [piece('A', 700), piece('B', 700), piece('C', 400, 'class:B')],
        [
          stock('SA', 1000, { stockClassId: 'timber:80x200' }),
          stock('SB', 1200, { stockClassId: 'class:B' }),
        ],
      ),
    );

    expect(aggregateStockRequirements(plan)).toEqual([
      {
        stockClassId: 'class:B',
        stockOptionId: 'SB',
        lengthMm: 1200,
        quantity: 1,
      },
      {
        stockClassId: 'timber:80x200',
        stockOptionId: 'SA',
        lengthMm: 1000,
        quantity: 2,
      },
    ]);
  });

  it('calculates exact aggregate losses and utilization', () => {
    const plan = createCuttingPlan(
      input([piece('A', 600)], [stock('S1', 1000)], {
        settings: { kerfMm: 4, endTrimMm: 10, minimumReusableRemnantMm: 500 },
      }),
    );

    expect(plan.summary).toMatchObject({
      requiredPieceCount: 1,
      assignedPieceCount: 1,
      requiredLengthMm: 600,
      assignedLengthMm: 600,
      purchasedStockLengthMm: 1000,
      kerfLossMm: 0,
      endTrimLossMm: 20,
      wasteLengthMm: 400,
      reusableRemnantLengthMm: 0,
      utilizationRatio: 0.6,
    });
  });

  it('uses the shortest immediately fitting option for minimum-waste', () => {
    const plan = createCuttingPlan(
      input(
        [piece('A', 6100)],
        [stock('S8', 8000), stock('S7', 7000), stock('S12', 12000)],
        { objective: 'minimum-waste' },
      ),
    );

    expect(plan.objective).toBe('minimum-waste');
    expect(plan.stockUsages[0]!.stockOptionId).toBe('S7');
  });

  it('uses bounded look-ahead for the minimum-stock-count objective', () => {
    const pieces = [piece('A', 6000), piece('B', 6000), piece('C', 6000)];
    const options = [stock('S8', 8000), stock('S12', 12000)];
    const wastePlan = createCuttingPlan(
      input(pieces, options, { objective: 'minimum-waste' }),
    );
    const countPlan = createCuttingPlan(
      input(pieces, options, { objective: 'minimum-stock-count' }),
    );

    expect(wastePlan.summary.stockItemCount).toBe(3);
    expect(countPlan.summary.stockItemCount).toBe(2);
    expect(countPlan.stockUsages[0]!.stockOptionId).toBe('S12');
  });

  it('handles a larger deterministic K1/J1-style fixture', () => {
    const pieces = [
      ...Array.from({ length: 12 }, (_, index) =>
        piece(`K1-${index + 1}`, 5600),
      ),
      ...Array.from({ length: 12 }, (_, index) =>
        piece(`J1-${index + 1}`, 1300),
      ),
    ];
    const plan = createCuttingPlan(
      input(pieces, [stock('S7', 7000)], {
        settings: { kerfMm: 4, endTrimMm: 0, minimumReusableRemnantMm: 500 },
      }),
    );

    expect(plan.status).toBe('complete');
    expect(plan.summary).toMatchObject({
      requiredPieceCount: 24,
      assignedPieceCount: 24,
      stockItemCount: 12,
      requiredLengthMm: 82_800,
      purchasedStockLengthMm: 84_000,
      kerfLossMm: 48,
      wasteLengthMm: 1152,
    });
    expect(plan.stockUsages.every((usage) => usage.cuts.length === 2)).toBe(
      true,
    );
  });
});
