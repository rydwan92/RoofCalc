import { describe, expect, it } from 'vitest';
import {
  assembleLines,
  recognizeTextLayer,
  regionOfRange,
  type TextLayerItem,
  type TextLayerPage,
} from './text-layer';
import {
  chooseMeasurement,
  confirmField,
  conflictingReadings,
  deriveImportedRoofDraft,
  EMPTY_DECISIONS,
  enterValue,
  type ImportDecisions,
} from './draft';
import { mapDraftToRoofStart } from './mapping';
import { parseRecognitionResult, type ImportSource } from './model';

/** One text item per call; y grows downwards like a rendered page. */
function item(text: string, x: number, y: number, rotationDeg?: number) {
  return {
    text,
    box: { x, y, width: text.length * 5, height: 10 },
    ...(rotationDeg ? { rotationDeg } : {}),
  } satisfies TextLayerItem;
}

function page(items: TextLayerItem[], pageNumber = 1): TextLayerPage {
  return { page: pageNumber, width: 842, height: 595, unit: 'pt', items };
}

const SOURCE: ImportSource = {
  fileName: 'rzut-dachu.pdf',
  kind: 'pdf',
  byteLength: 4096,
  pageCount: 1,
  pages: [{ page: 1, width: 842, height: 595, unit: 'pt' }],
};

const DEFAULTS = {
  buildingLengthMm: 10_000,
  buildingWidthMm: 8_000,
  pitchDeg: 35,
  eaveOverhangMm: 500,
  rafterSpacingMm: 800,
  rafterWidthMm: 80,
  rafterDepthMm: 200,
};

/** A typical Polish roof-plan title block, split the way PDFs split text. */
const PLAN = page([
  item('RZUT DACHU', 50, 30),
  item('Dach dwuspadowy', 50, 50),
  item('Długość budynku:', 50, 80),
  item('12,40 m', 200, 80),
  item('Szerokość budynku:', 50, 100),
  item('9,60 m', 200, 100),
  item('Kąt nachylenia dachu', 50, 120),
  item('35°', 200, 120),
  item('Okap', 50, 140),
  item('50 cm', 200, 140),
  item('Krokwie 8x18 cm co 90 cm', 50, 160),
  item('Wszystkie wymiary podano w cm', 50, 500),
  item('Skala 1:100', 600, 500),
  item('1240', 400, 300),
  item('960', 700, 250, 90),
]);

describe('line assembly', () => {
  it('joins items on one baseline left to right with a space', () => {
    const lines = assembleLines(PLAN);
    expect(lines.map((line) => line.text)).toContain(
      'Długość budynku: 12,40 m',
    );
  });

  it('keeps rotated dimension text on its own line', () => {
    const rotated = assembleLines(PLAN).find((line) => line.rotated);
    expect(rotated?.text).toBe('960');
  });

  it('maps a character range back to its page region', () => {
    const line = assembleLines(PLAN).find((candidate) =>
      candidate.text.startsWith('Długość'),
    )!;
    const start = line.text.indexOf('12,40');
    const region = regionOfRange(line, start, start + 7);
    expect(region.page).toBe(1);
    expect(region.box.x).toBeCloseTo(200, 6);
    expect(region.box.y).toBe(80);
  });
});

describe('deterministic text-layer recognition', () => {
  const result = recognizeTextLayer([PLAN]);
  const field = (name: string) =>
    result.measurements.find((measurement) => measurement.field === name);

  it('reads every labelled parameter with its unit and region', () => {
    expect(field('buildingLength')).toMatchObject({
      valueMm: 12_400,
      confidence: 'high',
      region: { page: 1 },
    });
    expect(field('buildingWidth')?.valueMm).toBe(9_600);
    expect(field('pitch')).toMatchObject({ valueDeg: 35, confidence: 'high' });
    expect(field('eave')?.valueMm).toBe(500);
    expect(field('spacing')?.valueMm).toBe(900);
    expect(field('rafterWidth')?.valueMm).toBe(80);
    expect(field('rafterDepth')?.valueMm).toBe(180);
  });

  it('records the label, document unit, scale and roof type', () => {
    expect(field('buildingLength')?.label?.text).toBe('Długość budynku');
    expect(result.documentUnit?.unit).toBe('cm');
    expect(result.scale?.denominator).toBe(100);
    expect(result.roofType?.value).toBe('gable');
  });

  it('offers standalone dimension text as unlabelled candidates', () => {
    const candidates = result.measurements.filter(
      (measurement) => measurement.field === undefined,
    );
    expect(candidates.map((candidate) => candidate.raw.value).sort()).toEqual(
      [1240, 960].sort(),
    );
    expect(
      candidates.every((candidate) => candidate.confidence === 'low'),
    ).toBe(true);
  });

  it('produces output that passes the engine boundary schema', () => {
    expect(() => parseRecognitionResult(result)).not.toThrow();
  });

  it('is deterministic', () => {
    expect(recognizeTextLayer([PLAN])).toEqual(result);
  });

  it('reports a scan without a text layer', () => {
    expect(recognizeTextLayer([page([])]).warnings).toContainEqual({
      code: 'no-text-layer',
    });
  });

  it('reports pages beyond the processing limit', () => {
    expect(
      recognizeTextLayer([PLAN], { totalPages: 40 }).warnings,
    ).toContainEqual({ code: 'page-limit-reached', processed: 1, total: 40 });
  });
});

describe('semantic edge cases', () => {
  const recognize = (...lines: string[]) =>
    recognizeTextLayer([
      page(lines.map((text, index) => item(text, 50, 40 + index * 20))),
    ]);

  it('converts a percentage slope to degrees', () => {
    const pitch = recognize('Spadek dachu 70%').measurements[0];
    expect(pitch?.field).toBe('pitch');
    expect(pitch?.valueDeg).toBeCloseTo(34.992, 3);
    expect(pitch?.evidence).toContain('percent-slope-converted');
  });

  it('reads a dimension pair with the longer side as the length', () => {
    const { measurements } = recognize('Wymiary budynku: 9,60 × 12,40 m');
    expect(
      measurements.map((measurement) => [
        measurement.field,
        measurement.valueMm,
        measurement.confidence,
      ]),
    ).toEqual([
      ['buildingLength', 12_400, 'medium'],
      ['buildingWidth', 9_600, 'medium'],
    ]);
  });

  it('does not take "rozstaw krokwi" as a rafter section label', () => {
    const { measurements } = recognize('Rozstaw krokwi 80 cm');
    expect(measurements).toHaveLength(1);
    expect(measurements[0]).toMatchObject({ field: 'spacing', valueMm: 800 });
  });

  it('finds a value in the line below a label', () => {
    const result = recognizeTextLayer([
      page([item('Kąt nachylenia', 50, 40), item('40°', 50, 52)]),
    ]);
    expect(result.measurements[0]).toMatchObject({
      field: 'pitch',
      valueDeg: 40,
      confidence: 'medium',
    });
    expect(result.measurements[0]?.evidence).toContain('nearby');
  });

  it('offers the only angle of a document as a low-confidence pitch', () => {
    const [pitch] = recognize('Przekrój A-A', '35°').measurements;
    expect(pitch).toMatchObject({ field: 'pitch', confidence: 'low' });
  });

  it('names an unsupported roof type without mapping it', () => {
    const result = recognize('Dach mansardowy');
    expect(result.roofType?.value).toBe('unsupported');
    expect(result.warnings[0]).toMatchObject({ code: 'unsupported-roof-type' });
  });

  it('ignores a window width', () => {
    expect(recognize('Szerokość okna 78 cm').measurements).toEqual([]);
  });
});

describe('draft derivation and review', () => {
  const results = [recognizeTextLayer([PLAN])];

  it('fills every field and keeps the source of each value', () => {
    const draft = deriveImportedRoofDraft({ source: SOURCE, results });
    expect(draft.schemaVersion).toBe(1);
    expect(draft.fields.buildingLength).toMatchObject({
      status: 'recognized',
      value: 12_400,
      requiresConfirmation: false,
    });
    // The standalone "1240" agrees (document unit cm) and is an alternative.
    expect(draft.fields.buildingLength.alternatives).toHaveLength(2);
    expect(draft.roofType).toMatchObject({
      value: 'gable',
      requiresConfirmation: true,
      confirmed: false,
    });
    expect(draft.missing).toEqual([]);
  });

  it('needs the detected roof type confirmed before mapping', () => {
    const draft = deriveImportedRoofDraft({ source: SOURCE, results });
    expect(mapDraftToRoofStart(draft, DEFAULTS)).toEqual({
      status: 'blocked',
      blockers: [{ code: 'roof-type-unconfirmed' }],
    });
    const confirmed = deriveImportedRoofDraft({
      source: SOURCE,
      results,
      decisions: { ...EMPTY_DECISIONS, roofTypeConfirmed: true },
    });
    expect(mapDraftToRoofStart(confirmed, DEFAULTS)).toEqual({
      status: 'ready',
      values: {
        roofType: 'gable',
        buildingLengthMm: 12_400,
        buildingWidthMm: 9_600,
        pitchDeg: 35,
        eaveOverhangMm: 500,
        rafterSpacingMm: 900,
        rafterWidthMm: 80,
        rafterDepthMm: 180,
      },
      provenance: {
        buildingLength: 'document',
        buildingWidth: 'document',
        pitch: 'document',
        eave: 'document',
        spacing: 'document',
        rafterWidth: 'document',
        rafterDepth: 'document',
      },
    });
  });

  it('infers a unit only from a plausible range and demands confirmation', () => {
    const unitless = [
      recognizeTextLayer([
        page([
          item('Dach kopertowy', 50, 20),
          item('Długość budynku 1240', 50, 40),
          item('Szerokość budynku 1000', 50, 60),
          item('Kąt nachylenia 30°', 50, 80),
        ]),
      ]),
    ];
    let decisions: ImportDecisions = {
      ...EMPTY_DECISIONS,
      roofType: 'hip',
    };
    const draft = deriveImportedRoofDraft({
      source: SOURCE,
      results: unitless,
      decisions,
    });
    expect(draft.fields.buildingLength).toMatchObject({
      value: 12_400,
      unitBasis: 'plausible-range',
      confidence: 'low',
      requiresConfirmation: true,
    });
    expect(draft.warnings).toContainEqual({
      code: 'unit-inferred',
      field: 'buildingLength',
    });
    const blocked = mapDraftToRoofStart(draft, DEFAULTS);
    expect(blocked.status).toBe('blocked');
    decisions = confirmField(decisions, draft, 'buildingLength');
    decisions = confirmField(decisions, draft, 'buildingWidth');
    const confirmed = deriveImportedRoofDraft({
      source: SOURCE,
      results: unitless,
      decisions,
    });
    const mapping = mapDraftToRoofStart(confirmed, DEFAULTS);
    expect(mapping.status).toBe('ready');
    if (mapping.status === 'ready') {
      expect(mapping.values.roofType).toBe('hip');
      // Not in the document → RoofCalc default, labelled as such.
      expect(mapping.provenance.eave).toBe('roofcalc-default');
      expect(mapping.values.eaveOverhangMm).toBe(500);
    }
  });

  it('applies a user-chosen document unit without losing typed values', () => {
    const unitless = [recognizeTextLayer([page([item('Okap 50', 50, 40)])])];
    const ambiguous = deriveImportedRoofDraft({
      source: SOURCE,
      results: unitless,
    });
    expect(ambiguous.fields.eave.status).toBe('missing');
    expect(ambiguous.warnings).toContainEqual({
      code: 'unit-ambiguous',
      field: 'eave',
      rawText: '50',
    });
    const decisions = enterValue(EMPTY_DECISIONS, 'pitch', 42);
    const inCm = deriveImportedRoofDraft({
      source: SOURCE,
      results: unitless,
      decisions: { ...decisions, documentUnit: 'cm' },
    });
    expect(inCm.fields.eave).toMatchObject({
      value: 500,
      unitBasis: 'user-declared',
    });
    expect(inCm.fields.pitch).toMatchObject({
      status: 'user-entered',
      value: 42,
    });
  });

  it('turns disagreeing labelled values into a conflict a choice resolves', () => {
    const conflicting = [
      recognizeTextLayer([
        page([
          item('Długość budynku: 12,40 m', 50, 40),
          item('Długość budynku: 13,00 m', 50, 200),
        ]),
      ]),
    ];
    const draft = deriveImportedRoofDraft({
      source: SOURCE,
      results: conflicting,
    });
    expect(draft.fields.buildingLength.status).toBe('conflict');
    // Both readings, side by side, for one click to decide.
    expect(
      conflictingReadings(draft, 'buildingLength').map(
        (reading) => reading.valueMm,
      ),
    ).toEqual([12_400, 13_000]);
    expect(mapDraftToRoofStart(draft, DEFAULTS)).toMatchObject({
      status: 'blocked',
      blockers: expect.arrayContaining([
        { code: 'value-conflict', field: 'buildingLength' },
      ]),
    });
    const other = draft.fields.buildingLength.alternatives[0]!;
    const resolved = deriveImportedRoofDraft({
      source: SOURCE,
      results: conflicting,
      decisions: chooseMeasurement(EMPTY_DECISIONS, 'buildingLength', other),
    });
    expect(resolved.fields.buildingLength).toMatchObject({
      status: 'recognized',
      value: 13_000,
    });
    expect(conflictingReadings(resolved, 'buildingLength')).toEqual([]);
  });

  it('revokes a confirmation when the confirmed value changes', () => {
    const conflicting = [
      recognizeTextLayer([
        page([
          item('Długość budynku: 12,40 m', 50, 40),
          item('Długość budynku: 13,00 m', 50, 200),
        ]),
      ]),
    ];
    const first = deriveImportedRoofDraft({
      source: SOURCE,
      results: conflicting,
    });
    const pickFirst = chooseMeasurement(
      EMPTY_DECISIONS,
      'buildingLength',
      first.fields.buildingLength.measurementId!,
    );
    const chosen = deriveImportedRoofDraft({
      source: SOURCE,
      results: conflicting,
      decisions: pickFirst,
    });
    const confirmed = confirmField(pickFirst, chosen, 'buildingLength');
    const switched = chooseMeasurement(
      confirmed,
      'buildingLength',
      chosen.fields.buildingLength.alternatives[0]!,
    );
    expect(
      deriveImportedRoofDraft({
        source: SOURCE,
        results: conflicting,
        decisions: switched,
      }).fields.buildingLength.confirmed,
    ).toBe(false);
  });

  it('blocks an unsupported roof type', () => {
    const draft = deriveImportedRoofDraft({
      source: SOURCE,
      results: [recognizeTextLayer([page([item('Dach mansardowy', 50, 40)])])],
    });
    expect(mapDraftToRoofStart(draft, DEFAULTS)).toMatchObject({
      status: 'blocked',
      blockers: expect.arrayContaining([
        { code: 'roof-type-unsupported', text: 'mansardowy' },
      ]),
    });
  });

  it('warns about a hip whose length is below its width', () => {
    const draft = deriveImportedRoofDraft({
      source: SOURCE,
      results: [
        recognizeTextLayer([
          page([
            item('Dach kopertowy', 50, 20),
            item('Długość budynku: 8,00 m', 50, 40),
            item('Szerokość budynku: 10,00 m', 50, 60),
          ]),
        ]),
      ],
    });
    expect(draft.warnings).toContainEqual({ code: 'hip-length-below-width' });
  });
});

describe('mono-pitch and tent roofs (VNext-7C)', () => {
  const recognize = (...lines: string[]) =>
    recognizeTextLayer([
      page(lines.map((text, index) => item(text, 50, 20 + index * 20))),
    ]);

  it.each([
    ['Dach jednospadowy', 'jednospadowy'],
    ['Wiata — dach pulpitowy', 'pulpitowy'],
    ['Mono-pitch roof', 'Mono-pitch'],
    ['Lean-to carport', 'Lean-to'],
  ])('reads "%s" as a mono-pitch roof', (line, text) => {
    const result = recognize(line);
    expect(result.roofType).toMatchObject({ value: 'mono-pitch', text });
    expect(result.warnings).toEqual([]);
  });

  it('reads a tent roof as the square case of a hip', () => {
    expect(recognize('Dach namiotowy').roofType?.value).toBe('hip');
  });

  it('keeps mansard and half-hip roofs unsupported', () => {
    expect(recognize('Dach naczółkowy').roofType?.value).toBe('unsupported');
    expect(recognize('Half-hip roof').roofType?.value).toBe('unsupported');
  });

  it('names no roof when two supported types are named equally often', () => {
    expect(
      recognize('Dom: dach dwuspadowy', 'Garaż: dach jednospadowy').roofType,
    ).toBeUndefined();
    expect(
      recognize(
        'Dach jednospadowy',
        'Wiata jednospadowa',
        'Dach dwuspadowy nad domem',
      ).roofType?.value,
    ).toBe('mono-pitch');
  });

  it('maps a reviewed mono-pitch draft with its width as the run, no width warning', () => {
    const results = [
      recognizeTextLayer([
        page([
          item('Dach jednospadowy', 50, 20),
          item('Długość budynku: 3,00 m', 50, 40),
          item('Szerokość budynku: 5,00 m', 50, 60),
          item('Spadek dachu 10°', 50, 80),
        ]),
      ]),
    ];
    let decisions: ImportDecisions = {
      ...EMPTY_DECISIONS,
      roofType: 'mono-pitch',
      roofTypeConfirmed: true,
    };
    const draft = deriveImportedRoofDraft({
      source: SOURCE,
      results,
      decisions,
    });
    expect(draft.warnings.map((warning) => warning.code)).not.toContain(
      'width-exceeds-length',
    );
    for (const field of ['buildingLength', 'buildingWidth', 'pitch'] as const)
      decisions = confirmField(decisions, draft, field);
    const reviewed = deriveImportedRoofDraft({
      source: SOURCE,
      results,
      decisions,
    });
    expect(mapDraftToRoofStart(reviewed, DEFAULTS)).toMatchObject({
      status: 'ready',
      values: {
        roofType: 'mono-pitch',
        buildingLengthMm: 3000,
        buildingWidthMm: 5000,
        pitchDeg: 10,
      },
      provenance: { buildingWidth: 'document', eave: 'roofcalc-default' },
    });
  });

  it('accepts mono-pitch in an engine result', () => {
    const result = recognize('Dach jednospadowy');
    expect(parseRecognitionResult(result).roofType?.value).toBe('mono-pitch');
  });
});

describe('pitch and rafter wording (VNext-7C)', () => {
  const recognize = (line: string) =>
    recognizeTextLayer([page([item('Rzut', 50, 10), item(line, 50, 40)])])
      .measurements;

  it.each([
    ['Kąt dachu 30°', 30, 'high'],
    ['Pochylenie dachu 20°', 20, 'high'],
    ['Dach o spadku 12°', 12, 'high'],
    ['Kąt pochylenia połaci 45°', 45, 'high'],
    ['Kąt nachylenia połaci dachowych α=40°', 40, 'high'],
    ['α = 35°', 35, 'medium'],
  ] as const)(
    'reads "%s" as the pitch (%s°, %s)',
    (line, degrees, confidence) => {
      expect(recognize(line)).toEqual([
        expect.objectContaining({
          field: 'pitch',
          valueDeg: degrees,
          confidence,
        }),
      ]);
    },
  );

  it('reads the singular "krokiew" as a rafter section', () => {
    expect(recognize('Krokiew 80×200 mm, rozstaw 90 cm')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'rafterWidth', valueMm: 80 }),
        expect.objectContaining({ field: 'rafterDepth', valueMm: 200 }),
        expect.objectContaining({ field: 'spacing', valueMm: 900 }),
      ]),
    );
  });
});
