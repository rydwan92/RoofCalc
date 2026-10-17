import { describe, expect, it } from 'vitest';
import { deriveImportedRoofDraft, EMPTY_DECISIONS } from './draft';
import { mapDraftToRoofStart } from './mapping';
import { parseRecognitionResult, type ImportSource } from './model';
import {
  transcribeDimension,
  transcriptionResult,
  type TranscriptionInput,
} from './transcription';

const box = { x: 10, y: 20, width: 40, height: 12 };
const input = (
  text: string,
  target?: TranscriptionInput['target'],
  id = 't1',
): TranscriptionInput => ({ id, page: 1, box, text, target });

describe('transcribing a written dimension', () => {
  it('keeps the value exactly as written, with no scale', () => {
    const outcome = transcribeDimension(input('12,40 m', 'buildingLength'));
    expect(outcome).toMatchObject({
      ok: true,
      measurements: [
        {
          field: 'buildingLength',
          valueMm: 12_400,
          unitBasis: 'explicit',
          confidence: 'high',
          mode: 'transcription',
          region: { page: 1, box },
          evidence: ['transcribed', 'explicit-unit'],
        },
      ],
    });
  });

  it('leaves a bare number to the document unit and asks to confirm', () => {
    const outcome = transcribeDimension(input('1240', 'buildingLength'));
    expect(outcome.ok && outcome.measurements[0]).toMatchObject({
      raw: { value: 1240 },
      confidence: 'medium',
    });
    expect(outcome.ok && outcome.measurements[0]?.valueMm).toBeUndefined();
  });

  it('reads the Polish raised half centimetre', () => {
    const outcome = transcribeDimension(input('38⁵', 'eave'));
    expect(outcome.ok && outcome.measurements[0]?.raw.value).toBe(38.5);
  });

  it('reads a pitch in degrees or as a percentage slope', () => {
    const degrees = transcribeDimension(input('35°', 'pitch'));
    expect(degrees.ok && degrees.measurements[0]?.valueDeg).toBe(35);
    const percent = transcribeDimension(input('100%', 'pitch'));
    expect(percent.ok && percent.measurements[0]?.valueDeg).toBeCloseTo(45, 9);
  });

  it('splits a timber section into width and depth', () => {
    const outcome = transcribeDimension(input('8×18 cm', 'rafterSection'));
    expect(
      outcome.ok &&
        outcome.measurements.map((item) => [item.field, item.valueMm]),
    ).toEqual([
      ['rafterWidth', 80],
      ['rafterDepth', 180],
    ]);
  });

  it.each([
    ['', 'empty'],
    ['abc', 'not-a-dimension'],
    ['320 600', 'several-values'],
    ['12 m', 'angle-expected'],
    ['35°', 'length-expected'],
    ['18', 'pair-expected'],
    ['95°', 'out-of-range'],
  ] as const)('rejects "%s" with %s', (text, error) => {
    const target =
      error === 'angle-expected' || error === 'out-of-range'
        ? 'pitch'
        : error === 'pair-expected'
          ? 'rafterSection'
          : 'buildingLength';
    expect(transcribeDimension(input(text, target))).toEqual({
      ok: false,
      error,
    });
  });

  it('creates a roof start from a photo using only transcribed values', () => {
    const source: ImportSource = {
      fileName: 'zdjecie-rzutu.jpg',
      kind: 'jpeg',
      byteLength: 1,
      pageCount: 1,
      pages: [{ page: 1, width: 4000, height: 3000, unit: 'px' }],
    };
    const typed = [
      input('12,40 m', 'buildingLength', 'a'),
      input('9,60 m', 'buildingWidth', 'b'),
      input('40°', 'pitch', 'c'),
    ].flatMap((item) => {
      const outcome = transcribeDimension(item);
      return outcome.ok ? outcome.measurements : [];
    });
    const result = transcriptionResult(typed);
    expect(() => parseRecognitionResult(result)).not.toThrow();
    const draft = deriveImportedRoofDraft({
      source,
      results: [result],
      decisions: { ...EMPTY_DECISIONS, roofType: 'gable' },
    });
    expect(draft.missing).toEqual([]);
    const mapped = mapDraftToRoofStart(draft, {
      buildingLengthMm: 10_000,
      buildingWidthMm: 8_000,
      pitchDeg: 35,
      eaveOverhangMm: 500,
      rafterSpacingMm: 900,
      rafterWidthMm: 80,
      rafterDepthMm: 180,
    });
    // Explicit units and a named field: nothing left to confirm one by one.
    expect(mapped).toMatchObject({
      status: 'ready',
      values: {
        roofType: 'gable',
        buildingLengthMm: 12_400,
        buildingWidthMm: 9_600,
        pitchDeg: 40,
        eaveOverhangMm: 500,
      },
      provenance: { buildingLength: 'document', eave: 'roofcalc-default' },
    });
  });
});
