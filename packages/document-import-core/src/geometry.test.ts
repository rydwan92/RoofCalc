import { describe, expect, it } from 'vitest';
import {
  findOutlineCandidates,
  recognizeVectorGeometry,
  type PageSegment,
} from './geometry';
import { PDF_POINT_MM } from './calibration';
import { deriveImportedRoofDraft, EMPTY_DECISIONS } from './draft';
import { recognizeTextLayer, type TextLayerItem } from './text-layer';
import { parseRecognitionResult, type ImportSource } from './model';

const PAGE = { page: 1, width: 842, height: 595, unit: 'pt' as const };
/** 1 m at 1:100 is 10 mm on paper = 28.3465 pt. */
const PT_PER_M = 10 / PDF_POINT_MM;

function line(x1: number, y1: number, x2: number, y2: number): PageSegment {
  return { page: 1, from: { x: x1, y: y1 }, to: { x: x2, y: y2 } };
}

function rectangle(x: number, y: number, w: number, h: number) {
  return [
    line(x, y, x + w, y),
    line(x + w, y, x + w, y + h),
    line(x + w, y + h, x, y + h),
    line(x, y + h, x, y),
  ];
}

/** Outline 12.40 × 9.60 m at 1:100, a page frame and dimension lines. */
const W = 12.4 * PT_PER_M;
const H = 9.6 * PT_PER_M;
const DRAWING: PageSegment[] = [
  ...rectangle(10, 10, 822, 575), // page frame: never an outline
  ...rectangle(60, 160, W, H),
  line(60, 160 + H / 2, 60 + W, 160 + H / 2), // ridge
  line(60, 160 + H + 20, 60 + W, 160 + H + 20), // dimension line
  line(60, 160 + H + 15, 60, 160 + H + 25),
];

const SOURCE: ImportSource = {
  fileName: 'plan.pdf',
  kind: 'pdf',
  byteLength: 1,
  pageCount: 1,
  pages: [PAGE],
};

function text(...lines: string[]) {
  return recognizeTextLayer([
    {
      ...PAGE,
      items: lines.map((value, index): TextLayerItem => ({
        text: value,
        box: {
          x: 520,
          y: 60 + index * 16,
          width: value.length * 5,
          height: 10,
        },
      })),
    },
  ]);
}

describe('outline candidates', () => {
  it('finds the building rectangle and ignores the page frame', () => {
    const [outline, ...rest] = findOutlineCandidates(PAGE, DRAWING);
    expect(outline?.box.x).toBeCloseTo(60, 6);
    expect(outline?.box.width).toBeCloseTo(W, 6);
    expect(outline?.box.height).toBeCloseTo(H, 6);
    expect(rest).toEqual([]);
  });

  it('joins a side drawn as several collinear pieces', () => {
    const split = [
      line(60, 160, 60 + W / 2, 160),
      line(60 + W / 2, 160, 60 + W, 160),
      ...rectangle(60, 160, W, H).slice(1),
    ];
    expect(findOutlineCandidates(PAGE, split)).toHaveLength(1);
  });

  it('needs every side: an open shape is not an outline', () => {
    expect(
      findOutlineCandidates(PAGE, rectangle(60, 160, W, H).slice(0, 3)),
    ).toEqual([]);
  });
});

describe('vector-geometry engine', () => {
  it('measures the outline at the stated scale and cross-checks the text', () => {
    const written = text(
      'Długość budynku: 12,40 m',
      'Szerokość budynku: 9,80 m',
      'Skala 1:100',
    );
    const result = recognizeVectorGeometry({
      pages: [{ ...PAGE, segments: DRAWING }],
      scale: written.scale,
      written: written.measurements,
    });
    expect(() => parseRecognitionResult(result)).not.toThrow();
    const drawn = Object.fromEntries(
      result.measurements.map((item) => [item.field, item.valueMm]),
    );
    expect(drawn).toEqual({ buildingLength: 12_400, buildingWidth: 9_600 });
    const checks = result.relations?.filter(
      (relation) => relation.kind === 'scale-cross-check',
    );
    expect(checks).toHaveLength(2);
    // 9,80 m written against 9,60 m drawn: a 2.1 % disagreement is reported.
    expect(result.warnings).toEqual([
      {
        code: 'scale-mismatch',
        field: 'buildingWidth',
        documentMm: 9_800,
        drawnMm: 9_600,
      },
    ]);
  });

  it('shows the outline but claims no length without a stated scale', () => {
    const result = recognizeVectorGeometry({
      pages: [{ ...PAGE, segments: DRAWING }],
      written: [],
    });
    expect(result.measurements).toEqual([]);
    expect(result.segments?.map((segment) => segment.role)).toEqual([
      'outline',
      'outline',
      'outline',
      'outline',
    ]);
  });

  it('lets the drawing decide the unit of a number written without one', () => {
    const written = text(
      'Dach dwuspadowy',
      'Długość budynku 1240',
      'Szerokość budynku 960',
      'Skala 1:100',
    );
    const vector = recognizeVectorGeometry({
      pages: [{ ...PAGE, segments: DRAWING }],
      scale: written.scale,
      written: written.measurements,
    });
    const draft = deriveImportedRoofDraft({
      source: SOURCE,
      results: [written, vector],
      decisions: EMPTY_DECISIONS,
    });
    expect(draft.fields.buildingLength).toMatchObject({
      value: 12_400,
      unitBasis: 'drawing-scale',
      confidence: 'high',
      requiresConfirmation: false,
    });
    // The written value stays the primary reading; the drawn one is offered.
    expect(
      draft.measurements.find(
        (item) => item.id === draft.fields.buildingLength.measurementId,
      )?.mode,
    ).toBe('text-layer');
    expect(draft.warnings).not.toContainEqual({
      code: 'unit-inferred',
      field: 'buildingLength',
    });
  });
});
