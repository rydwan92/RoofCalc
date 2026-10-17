import { describe, expect, it } from 'vitest';
import { analyzeDimensionChains } from './chains';
import { calibrateFromPoints, manualMeasurementResult } from './calibration';
import { deriveImportedRoofDraft, EMPTY_DECISIONS } from './draft';
import { parseRecognitionResult, type ImportSource } from './model';
import { recognizeTextLayer, type TextLayerItem } from './text-layer';

const PAGE = { page: 1, width: 842, height: 595, unit: 'pt' as const };
const SOURCE: ImportSource = {
  fileName: 'rzut.pdf',
  kind: 'pdf',
  byteLength: 1,
  pageCount: 1,
  pages: [PAGE],
};

function at(text: string, x: number, y: number, width = 16): TextLayerItem {
  return { text, box: { x, y, width, height: 8 } };
}
/** Vertical dimension text: rotated, so its box is tall and narrow. */
function up(text: string, x: number, y: number): TextLayerItem {
  return { text, rotationDeg: 90, box: { x, y, width: 8, height: 16 } };
}

/**
 * A plan dimensioned the Polish way, in centimetres: a chain of wall parts
 * along each side and the overall dimension one row further out.
 *
 *   320   600   320          ← parts (y = 100)
 *        1240                ← overall (y = 120)
 *   vertical: 300 360 300 / 960
 */
const PLAN: TextLayerItem[] = [
  at('Wymiary w cm', 600, 40, 60),
  at('320', 60, 100),
  at('600', 170, 100),
  at('320', 280, 100),
  at('1240', 168, 120, 20),
  up('300', 40, 150),
  up('360', 40, 260),
  up('300', 40, 370),
  up('960', 20, 262),
];

describe('dimension chains', () => {
  it('finds a horizontal and a vertical chain without any scale', () => {
    const result = recognizeTextLayer([{ ...PAGE, items: PLAN }]);
    const { chains, mismatches } = analyzeDimensionChains(result.measurements);
    expect(mismatches).toEqual([]);
    const byAxis = Object.fromEntries(
      chains.map((chain) => [chain.axis, chain]),
    );
    const raw = (id: string) =>
      result.measurements.find((item) => item.id === id)?.raw.text;
    expect(raw(byAxis.horizontal!.totalMeasurementId)).toBe('1240');
    expect(byAxis.horizontal!.partMeasurementIds.map(raw)).toEqual([
      '320',
      '600',
      '320',
    ]);
    expect(byAxis.horizontal!.sum).toBe(1240);
    expect(raw(byAxis.vertical!.totalMeasurementId)).toBe('960');
    expect(byAxis.vertical!.sum).toBe(960);
  });

  it('turns the chains into building length and width', () => {
    const draft = deriveImportedRoofDraft({
      source: SOURCE,
      results: [recognizeTextLayer([{ ...PAGE, items: PLAN }])],
      decisions: EMPTY_DECISIONS,
    });
    expect(draft.fields.buildingLength).toMatchObject({
      value: 12_400,
      unitBasis: 'document-declared',
      // Unlabelled, but its parts add up: more than a stray number.
      confidence: 'medium',
      requiresConfirmation: true,
    });
    expect(draft.fields.buildingWidth).toMatchObject({
      value: 9_600,
      confidence: 'medium',
    });
    const total = draft.measurements.find(
      (item) => item.id === draft.fields.buildingLength.measurementId,
    );
    expect(total?.evidence).toContain('chain-total');
    expect(
      draft.relations.filter((relation) => relation.kind === 'dimension-chain'),
    ).toHaveLength(2);
    expect(() =>
      parseRecognitionResult({
        engine: { id: 'x', mode: 'text-layer', version: '1' },
        measurements: draft.measurements,
        relations: draft.relations,
        warnings: draft.warnings,
      }),
    ).not.toThrow();
  });

  it('flags a near miss as a probable misread instead of guessing', () => {
    const misread = PLAN.map((item) =>
      item.text === '320' && item.box.x === 280
        ? { ...item, text: '310' }
        : item,
    );
    const result = recognizeTextLayer([{ ...PAGE, items: misread }]);
    const { chains, mismatches } = analyzeDimensionChains(result.measurements);
    expect(chains.map((chain) => chain.axis)).toEqual(['vertical']);
    expect(mismatches).toEqual([
      expect.objectContaining({
        code: 'dimension-chain-mismatch',
        sum: 1230,
        total: 1240,
      }),
    ]);
  });

  it('respects written rounding: metres with two decimals', () => {
    const metres: TextLayerItem[] = [
      at('3,25', 60, 100),
      at('5,90', 170, 100),
      at('3,25', 280, 100),
      at('12,40', 168, 120, 22),
    ];
    const { chains } = analyzeDimensionChains(
      recognizeTextLayer([{ ...PAGE, items: metres }]).measurements,
    );
    expect(chains).toHaveLength(1);
    expect(chains[0]!.sum).toBeCloseTo(12.4, 9);
  });

  it('never pairs numbers that are not centred over each other', () => {
    const offset = PLAN.map((item) =>
      item.text === '1240' ? at('1240', 520, 120, 20) : item,
    );
    const { chains } = analyzeDimensionChains(
      recognizeTextLayer([{ ...PAGE, items: offset }]).measurements,
    );
    expect(chains.map((chain) => chain.axis)).toEqual(['vertical']);
  });
});

describe('dimension-first policy', () => {
  const calibrated = calibrateFromPoints(
    { page: 1, x: 0, y: 0 },
    { page: 1, x: 100, y: 0 },
    1_000,
  );
  if (calibrated.status !== 'ok') throw new Error('calibration');
  const { calibration } = calibrated;

  it('prefers a written dimension to one measured through a scale', () => {
    const measured = manualMeasurementResult(calibration, [
      {
        id: 'manual:length',
        field: 'buildingLength',
        from: { page: 1, x: 0, y: 0 },
        to: { page: 1, x: 1_250, y: 0 },
      },
    ]);
    const draft = deriveImportedRoofDraft({
      source: SOURCE,
      results: [recognizeTextLayer([{ ...PAGE, items: PLAN }]), measured],
      decisions: EMPTY_DECISIONS,
    });
    expect(draft.fields.buildingLength.value).toBe(12_400);
    expect(draft.fields.buildingLength.alternatives).toContain('manual:length');
    expect(draft.warnings).not.toContainEqual({
      code: 'scaled-value-only',
      field: 'buildingLength',
    });
  });

  it('lets a scaled value stand in only when nothing is written — flagged', () => {
    const measured = manualMeasurementResult(calibration, [
      {
        id: 'manual:length',
        field: 'buildingLength',
        from: { page: 1, x: 0, y: 0 },
        to: { page: 1, x: 1_250, y: 0 },
      },
    ]);
    const draft = deriveImportedRoofDraft({
      source: { ...SOURCE, kind: 'jpeg' },
      results: [measured],
      decisions: EMPTY_DECISIONS,
    });
    expect(draft.fields.buildingLength).toMatchObject({
      value: 12_500,
      confidence: 'low',
      requiresConfirmation: true,
    });
    expect(draft.warnings).toContainEqual({
      code: 'scaled-value-only',
      field: 'buildingLength',
    });
  });
});

describe('text layer: raised half centimetres', () => {
  it('writes a raised small digit back onto its number', () => {
    const result = recognizeTextLayer([
      {
        ...PAGE,
        items: [
          at('Wymiary w cm', 600, 40, 60),
          { text: '38', box: { x: 100, y: 200, width: 10, height: 10 } },
          { text: '5', box: { x: 110.5, y: 197, width: 4, height: 6 } },
        ],
      },
    ]);
    const [value] = result.measurements;
    expect(value?.raw).toMatchObject({ text: '38⁵', value: 38.5 });
  });
});
