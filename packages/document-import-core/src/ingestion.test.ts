import { describe, expect, it } from 'vitest';
import {
  AI_VISION_ENGINE_SLOT,
  canRunEngine,
  enginesForSource,
  MANUAL_UNDERLAY_ENGINE,
  TEXT_LAYER_ENGINE,
  type RecognitionEngineDescriptor,
} from './engines';
import {
  checkImageDimensions,
  classifyDocumentBytes,
  DOCUMENT_IMPORT_LIMITS,
} from './ingestion';
import {
  calibrateFromDrawingScale,
  calibrateFromPoints,
  manualMeasurementResult,
  measureMm,
  PDF_POINT_MM,
} from './calibration';
import { measurementValueSource, parseRecognitionResult } from './model';

const bytes = (...values: number[]) => new Uint8Array(values);
const text = (value: string) =>
  new Uint8Array([...value].map((char) => char.charCodeAt(0)));

describe('file ingestion trusts bytes, not names', () => {
  it.each([
    ['pdf', text('%PDF-1.7\n')],
    ['png', bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0)],
    ['jpeg', bytes(0xff, 0xd8, 0xff, 0xe0)],
    ['webp', text('RIFF\0\0\0\0WEBPVP8 ')],
  ])('accepts %s by signature', (kind, header) => {
    expect(classifyDocumentBytes({ byteLength: 1000, header })).toEqual({
      status: 'accepted',
      kind,
    });
  });

  it('accepts a PDF header after a short prefix', () => {
    const header = new Uint8Array([0xef, 0xbb, 0xbf, ...text('%PDF-1.4')]);
    expect(classifyDocumentBytes({ byteLength: 10, header }).status).toBe(
      'accepted',
    );
  });

  it('rejects a renamed executable whatever its file name', () => {
    expect(
      classifyDocumentBytes({ byteLength: 1000, header: text('MZ\x90\0') }),
    ).toEqual({ status: 'rejected', reason: 'unsupported-format' });
  });

  it('explains HEIC phone photos and DWG drawings', () => {
    expect(
      classifyDocumentBytes({
        byteLength: 1000,
        header: text('\0\0\0\x18ftypheic\0\0'),
      }),
    ).toEqual({ status: 'rejected', reason: 'heic-photo' });
    expect(
      classifyDocumentBytes({ byteLength: 1000, header: text('AC1032') }),
    ).toEqual({ status: 'rejected', reason: 'dwg-drawing' });
  });

  it('rejects empty and oversized files before reading content', () => {
    expect(
      classifyDocumentBytes({ byteLength: 0, header: new Uint8Array() }),
    ).toEqual({ status: 'rejected', reason: 'empty' });
    expect(
      classifyDocumentBytes({
        byteLength: DOCUMENT_IMPORT_LIMITS.maxFileBytes + 1,
        header: text('%PDF-1.7'),
      }),
    ).toEqual({ status: 'rejected', reason: 'too-large' });
  });

  it('bounds decoded image dimensions', () => {
    expect(checkImageDimensions(4000, 3000).status).toBe('accepted');
    expect(checkImageDimensions(20_000, 100).status).toBe('rejected');
    expect(checkImageDimensions(9000, 9000).status).toBe('rejected');
    expect(checkImageDimensions(Number.NaN, 10).status).toBe('rejected');
  });
});

describe('recognition engine gate', () => {
  const source = { kind: 'pdf' as const, fingerprint: 'sha256:abc' };

  it('runs on-device engines without any consent', () => {
    expect(canRunEngine(TEXT_LAYER_ENGINE, source)).toEqual({ allowed: true });
    expect(canRunEngine(MANUAL_UNDERLAY_ENGINE, source)).toEqual({
      allowed: true,
    });
  });

  it('never runs an unconfigured AI slot', () => {
    expect(canRunEngine(AI_VISION_ENGINE_SLOT, source)).toEqual({
      allowed: false,
      reason: 'not-configured',
    });
  });

  it('binds external consent to one engine and one document', () => {
    const external: RecognitionEngineDescriptor = {
      ...AI_VISION_ENGINE_SLOT,
      availability: 'available',
    };
    expect(canRunEngine(external, source).allowed).toBe(false);
    expect(
      canRunEngine(external, source, {
        engineId: 'ai-vision',
        documentFingerprint: 'sha256:other',
      }),
    ).toEqual({ allowed: false, reason: 'consent-required' });
    expect(
      canRunEngine(external, source, {
        engineId: 'ai-vision',
        documentFingerprint: 'sha256:abc',
      }),
    ).toEqual({ allowed: true });
  });

  it('does not run the text layer on a raster photo', () => {
    expect(
      canRunEngine(TEXT_LAYER_ENGINE, { kind: 'jpeg', fingerprint: 'x' }),
    ).toEqual({ allowed: false, reason: 'unsupported-source' });
    expect(enginesForSource('jpeg').map((engine) => engine.id)).not.toContain(
      TEXT_LAYER_ENGINE.id,
    );
  });
});

describe('manual calibration and measurement', () => {
  const a = { page: 1, x: 100, y: 100 };
  const b = { page: 1, x: 400, y: 500 }; // 500 units apart (3-4-5)

  it('derives a scale from two points and a known length', () => {
    const result = calibrateFromPoints(a, b, 10_000);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.calibration.mmPerUnit).toBe(20);
    expect(measureMm(a, { page: 1, x: 100, y: 350 }, result.calibration)).toBe(
      5_000,
    );
    expect(
      measureMm(a, { page: 2, x: 0, y: 0 }, result.calibration),
    ).toBeUndefined();
  });

  it('rejects calibration that cannot be trusted', () => {
    expect(calibrateFromPoints(a, { page: 1, x: 105, y: 100 }, 1000)).toEqual({
      status: 'rejected',
      reason: 'points-too-close',
    });
    expect(calibrateFromPoints(a, { page: 2, x: 0, y: 0 }, 1000)).toEqual({
      status: 'rejected',
      reason: 'different-pages',
    });
    expect(calibrateFromPoints(a, b, 0)).toEqual({
      status: 'rejected',
      reason: 'invalid-length',
    });
  });

  it('uses a stated drawing scale only on a vector PDF page', () => {
    // 1 pt = 25.4/72 mm on paper; at 1:100 one point is 35.28 mm real.
    const scale = calibrateFromDrawingScale(1, 'pt', 100);
    expect(scale?.mmPerUnit).toBeCloseTo(PDF_POINT_MM * 100, 10);
    expect(scale?.mmPerUnit).toBeCloseTo(35.2778, 4);
    expect(calibrateFromDrawingScale(1, 'px', 100)).toBeUndefined();
  });

  it('turns measurements into a schema-valid manual result', () => {
    const result = calibrateFromPoints(a, b, 10_000);
    if (result.status !== 'ok') throw new Error('calibration');
    const manual = manualMeasurementResult(result.calibration, [
      {
        id: 'manual:length',
        field: 'buildingLength',
        from: { page: 1, x: 0, y: 0 },
        to: { page: 1, x: 620.04, y: 0 },
      },
      {
        id: 'manual:pitch',
        field: 'pitch',
        from: a,
        to: b,
      },
    ]);
    expect(manual.measurements).toHaveLength(1);
    expect(manual.measurements[0]).toMatchObject({
      field: 'buildingLength',
      valueMm: 12_401,
      unitBasis: 'calibrated',
      // Measured through a scale: never more than a stand-in (VNext-2).
      confidence: 'low',
    });
    expect(measurementValueSource(manual.measurements[0]!)).toBe('scaled');
    expect(manual.segments?.map((segment) => segment.role)).toEqual([
      'calibration',
      'measurement',
    ]);
    expect(() => parseRecognitionResult(manual)).not.toThrow();
  });
});

describe('engine boundary schema', () => {
  it('rejects malformed or hostile engine output', () => {
    const valid = {
      engine: { id: 'ai-vision', mode: 'ai-vision', version: '1' },
      measurements: [],
      warnings: [],
    };
    expect(() => parseRecognitionResult(valid)).not.toThrow();
    expect(() =>
      parseRecognitionResult({
        ...valid,
        measurements: [
          {
            id: 'x',
            field: 'buildingLength',
            quantity: 'length',
            raw: { text: '-5', value: -5 },
            valueMm: -5000,
            confidence: 'high',
            evidence: [],
            engineId: 'ai-vision',
            mode: 'ai-vision',
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      parseRecognitionResult({
        ...valid,
        measurements: [
          {
            id: 'x',
            field: 'roofArea',
            quantity: 'length',
            raw: { text: '1', value: 1 },
            confidence: 'certain',
            evidence: [],
            engineId: 'ai-vision',
            mode: 'ai-vision',
          },
        ],
      }),
    ).toThrow();
  });
});
