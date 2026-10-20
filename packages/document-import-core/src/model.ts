import { z } from 'zod';

/**
 * VNext document import — the versioned intermediate model between a
 * recognised document and a RoofCalc project.
 *
 * Nothing here is canonical project state. A recognition engine (text layer,
 * manual measurement, a future OCR or AI vision adapter) produces a
 * `RecognitionResult`; `deriveImportedRoofDraft` combines results with the
 * user's decisions into an `ImportedRoofDraftV1`; only an explicitly
 * confirmed draft is mapped to the existing project-start parameters, and
 * the ordinary RoofCalc solvers own every calculation afterwards.
 *
 * Canonical units: millimetres for lengths, degrees for angles. Page
 * coordinates use the document's own page space with the origin at the top
 * left and y pointing down (`pt` for PDF pages, `px` for raster images).
 */

export const IMPORTED_ROOF_DRAFT_SCHEMA_VERSION = 1 as const;

export type DocumentSourceKind = 'pdf' | 'png' | 'jpeg' | 'webp';
export type LengthUnit = 'mm' | 'cm' | 'm';
export type PageUnit = 'pt' | 'px';

/**
 * How a measurement was obtained. `transcription` = the user selected a
 * dimension written on a scan or photo and typed it exactly as written;
 * `manual` = the user measured a line on a calibrated underlay.
 */
export type RecognitionMode =
  | 'text-layer'
  | 'vector-geometry'
  | 'ocr'
  | 'ai-vision'
  | 'transcription'
  | 'manual';

export const RECOGNITION_MODES = [
  'text-layer',
  'vector-geometry',
  'ocr',
  'ai-vision',
  'transcription',
  'manual',
] as const satisfies readonly RecognitionMode[];

/**
 * Dimension-first policy (VNext-2). A value is either **written** — a
 * number printed on the drawing, read from its text layer, by OCR or typed
 * by the user from the drawing — or **scaled**, i.e. measured off the
 * drawing through a scale. Prints, scans and photos are routinely resized,
 * so a scaled value is never authoritative: written dimensions decide a
 * field; scaled ones only cross-check it, or stand in — flagged — when
 * nothing is written at all.
 */
export type ValueSource = 'written' | 'scaled';

export function measurementValueSource(measurement: {
  mode: RecognitionMode;
  unitBasis?: UnitBasis;
}): ValueSource {
  return measurement.mode === 'vector-geometry' ||
    measurement.mode === 'manual' ||
    measurement.unitBasis === 'calibrated'
    ? 'scaled'
    : 'written';
}

/** Roof parameters a document can supply; names match the project start. */
export type NumericRoofField =
  | 'buildingLength'
  | 'buildingWidth'
  | 'pitch'
  | 'eave'
  | 'spacing'
  | 'rafterWidth'
  | 'rafterDepth';

export const NUMERIC_ROOF_FIELDS: readonly NumericRoofField[] = [
  'buildingLength',
  'buildingWidth',
  'pitch',
  'eave',
  'spacing',
  'rafterWidth',
  'rafterDepth',
];

/** Without these the existing project start cannot describe a roof. */
export const REQUIRED_ROOF_FIELDS: readonly NumericRoofField[] = [
  'buildingLength',
  'buildingWidth',
  'pitch',
];

export type ImportRoofType = 'gable' | 'hip';
/** `unsupported` = the document names a roof RoofCalc does not compute yet. */
export type DetectedRoofType = ImportRoofType | 'unsupported';

/**
 * A named level, never a probability. It states how the value was obtained,
 * so the user can decide; `high` still never bypasses the final review.
 */
export type Confidence = 'high' | 'medium' | 'low';

/** Why a length has the unit it has. */
export type UnitBasis =
  | 'explicit'
  | 'document-declared'
  | 'user-declared'
  | 'plausible-range'
  | 'calibrated'
  /** The unit that makes the number equal to the line drawn at scale. */
  | 'drawing-scale';

export type EvidenceCode =
  | 'explicit-label'
  | 'generic-label'
  | 'explicit-unit'
  | 'same-line'
  | 'nearby'
  | 'unlabelled'
  | 'only-angle-in-document'
  | 'percent-slope-converted'
  | 'dimension-pair'
  | 'section-pair'
  | 'manual-measurement'
  | 'drawn-at-scale'
  | 'scale-cross-check-match'
  | 'scale-cross-check-mismatch'
  /** One of several numbers standing alone in a row of dimensions. */
  | 'dimension-row'
  /** The overall dimension that a chain of part dimensions sums to. */
  | 'chain-total'
  /** A part of a dimension chain whose sum equals a written total. */
  | 'chain-part'
  /** Typed by the user from the drawing; its region is kept as evidence. */
  | 'transcribed';

export const EVIDENCE_CODES = [
  'explicit-label',
  'generic-label',
  'explicit-unit',
  'same-line',
  'nearby',
  'unlabelled',
  'only-angle-in-document',
  'percent-slope-converted',
  'dimension-pair',
  'section-pair',
  'manual-measurement',
  'drawn-at-scale',
  'scale-cross-check-match',
  'scale-cross-check-mismatch',
  'dimension-row',
  'chain-total',
  'chain-part',
  'transcribed',
] as const satisfies readonly EvidenceCode[];

export interface PageBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Where in the source document a value or label was read (page is 1-based). */
export interface SourceRegion {
  page: number;
  box: PageBox;
}

export interface EngineRef {
  id: string;
  mode: RecognitionMode;
  version: string;
}

export interface RecognizedMeasurement {
  /** Opaque, unique inside one import session. */
  id: string;
  /** Semantic interpretation; absent for an unlabelled dimension candidate. */
  field?: NumericRoofField;
  quantity: 'length' | 'angle';
  raw: {
    text: string;
    value: number;
    unit?: LengthUnit | 'deg' | 'percent';
  };
  /** Set when the unit is known from the document or a calibration. */
  valueMm?: number;
  valueDeg?: number;
  unitBasis?: UnitBasis;
  region?: SourceRegion;
  label?: { text: string; region?: SourceRegion };
  confidence: Confidence;
  evidence: EvidenceCode[];
  engineId: string;
  mode: RecognitionMode;
}

export interface DraftPoint {
  id: string;
  page: number;
  x: number;
  y: number;
}

export interface DraftSegment {
  id: string;
  page: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  role: 'calibration' | 'measurement' | 'outline' | 'unknown';
}

export type DraftRelation =
  | {
      kind: 'measures';
      measurementId: string;
      segmentId: string;
    }
  | {
      kind: 'scale-cross-check';
      measurementId: string;
      segmentId: string;
      documentMm: number;
      drawnMm: number;
      deviationRatio: number;
    }
  | { kind: 'outline'; segmentIds: string[] }
  /**
   * Written part dimensions whose sum equals a written overall dimension.
   * Unit-free and scale-free: it proves the numbers were read consistently.
   */
  | {
      kind: 'dimension-chain';
      axis: 'horizontal' | 'vertical';
      totalMeasurementId: string;
      partMeasurementIds: string[];
      /** Sum of the parts in the numbers' own written unit. */
      sum: number;
    };

export type DraftWarning =
  | { code: 'no-text-layer'; page?: number }
  | { code: 'page-limit-reached'; processed: number; total: number }
  | { code: 'text-limit-reached'; page: number }
  | { code: 'unsupported-roof-type'; text: string; region?: SourceRegion }
  | {
      code: 'value-outside-plausible-range';
      field: NumericRoofField;
      value: number;
      min: number;
      max: number;
    }
  | { code: 'unit-inferred'; field: NumericRoofField }
  | { code: 'unit-ambiguous'; field: NumericRoofField; rawText: string }
  | { code: 'conflicting-values'; field: NumericRoofField }
  | { code: 'width-exceeds-length' }
  | { code: 'hip-length-below-width' }
  | {
      code: 'scale-mismatch';
      field: NumericRoofField;
      documentMm: number;
      drawnMm: number;
    }
  /** Nothing written was found; the value was measured through a scale. */
  | { code: 'scaled-value-only'; field: NumericRoofField }
  /** A row of written parts nearly — but not exactly — sums to a total. */
  | {
      code: 'dimension-chain-mismatch';
      totalMeasurementId: string;
      partMeasurementIds: string[];
      sum: number;
      total: number;
    };

export interface ScaleStatement {
  denominator: number;
  text: string;
  region?: SourceRegion;
}

export interface DocumentUnitStatement {
  unit: LengthUnit;
  text: string;
  region?: SourceRegion;
}

export interface RoofTypeStatement {
  value: DetectedRoofType;
  text: string;
  region?: SourceRegion;
}

/** The single contract every recognition engine returns. */
export interface RecognitionResult {
  engine: EngineRef;
  measurements: RecognizedMeasurement[];
  documentUnit?: DocumentUnitStatement;
  scale?: ScaleStatement;
  roofType?: RoofTypeStatement;
  points?: DraftPoint[];
  segments?: DraftSegment[];
  relations?: DraftRelation[];
  warnings: DraftWarning[];
}

export interface DocumentPageInfo {
  page: number;
  width: number;
  height: number;
  unit: PageUnit;
}

export interface ImportSource {
  fileName: string;
  /**
   * VNext-6: content fingerprint of the file (SHA-256 hex, computed on the
   * device). Lets a reading be traced to the exact document it came from.
   * Optional and session-only; never derived from the name.
   */
  fingerprint?: string;
  kind: DocumentSourceKind;
  byteLength: number;
  pageCount: number;
  /** Pages actually analysed (bounded by the processing limits). */
  pages: DocumentPageInfo[];
}

export type FieldStatus =
  'recognized' | 'conflict' | 'missing' | 'user-entered';

export interface DraftField {
  field: NumericRoofField;
  status: FieldStatus;
  /** Canonical value (mm, or degrees for pitch) when one is selected. */
  value?: number;
  measurementId?: string;
  /** Other measurements that could fill this field. */
  alternatives: string[];
  confidence?: Confidence;
  unitBasis?: UnitBasis;
  /** True until the user accepts or types the value. */
  requiresConfirmation: boolean;
  confirmed: boolean;
}

export interface ImportedRoofDraftV1 {
  schemaVersion: typeof IMPORTED_ROOF_DRAFT_SCHEMA_VERSION;
  source: ImportSource;
  engines: EngineRef[];
  documentUnit?: DocumentUnitStatement & { basis: 'document' | 'user' };
  scale?: ScaleStatement;
  roofType: {
    value?: ImportRoofType;
    detected?: RoofTypeStatement;
    requiresConfirmation: boolean;
    confirmed: boolean;
  };
  measurements: RecognizedMeasurement[];
  fields: Record<NumericRoofField, DraftField>;
  points: DraftPoint[];
  segments: DraftSegment[];
  relations: DraftRelation[];
  warnings: DraftWarning[];
  /** Required parameters still without a value. */
  missing: Array<NumericRoofField | 'roofType'>;
}

/* ------------------------------------------------------------------------ */
/* Runtime validation of engine output. An engine — in particular a future  */
/* external AI adapter — is untrusted input; its result is parsed here       */
/* before it can influence a draft.                                          */
/* ------------------------------------------------------------------------ */

const finite = z.number().finite();
const nonNegative = finite.nonnegative();
const boxSchema = z.object({
  x: finite,
  y: finite,
  width: nonNegative,
  height: nonNegative,
});
const regionSchema = z.object({
  page: z.number().int().min(1).max(10_000),
  box: boxSchema,
});
const fieldSchema = z.enum([
  'buildingLength',
  'buildingWidth',
  'pitch',
  'eave',
  'spacing',
  'rafterWidth',
  'rafterDepth',
]);
const lengthUnitSchema = z.enum(['mm', 'cm', 'm']);
const shortText = z.string().max(500);
const idSchema = z.string().min(1).max(200);
const point = z.object({ x: finite, y: finite });

const measurementSchema = z.object({
  id: idSchema,
  field: fieldSchema.optional(),
  quantity: z.enum(['length', 'angle']),
  raw: z.object({
    text: shortText,
    value: finite,
    unit: z.enum(['mm', 'cm', 'm', 'deg', 'percent']).optional(),
  }),
  valueMm: nonNegative.max(1_000_000).optional(),
  valueDeg: nonNegative.max(90).optional(),
  unitBasis: z
    .enum([
      'explicit',
      'document-declared',
      'user-declared',
      'plausible-range',
      'calibrated',
      'drawing-scale',
    ])
    .optional(),
  region: regionSchema.optional(),
  label: z
    .object({ text: shortText, region: regionSchema.optional() })
    .optional(),
  confidence: z.enum(['high', 'medium', 'low']),
  evidence: z.array(z.enum(EVIDENCE_CODES)).max(20),
  engineId: idSchema,
  mode: z.enum(RECOGNITION_MODES),
});

const warningSchema = z.discriminatedUnion('code', [
  z.object({ code: z.literal('no-text-layer'), page: z.number().optional() }),
  z.object({
    code: z.literal('page-limit-reached'),
    processed: z.number(),
    total: z.number(),
  }),
  z.object({ code: z.literal('text-limit-reached'), page: z.number() }),
  z.object({
    code: z.literal('unsupported-roof-type'),
    text: shortText,
    region: regionSchema.optional(),
  }),
  z.object({
    code: z.literal('value-outside-plausible-range'),
    field: fieldSchema,
    value: finite,
    min: finite,
    max: finite,
  }),
  z.object({ code: z.literal('unit-inferred'), field: fieldSchema }),
  z.object({
    code: z.literal('unit-ambiguous'),
    field: fieldSchema,
    rawText: shortText,
  }),
  z.object({ code: z.literal('conflicting-values'), field: fieldSchema }),
  z.object({ code: z.literal('width-exceeds-length') }),
  z.object({ code: z.literal('hip-length-below-width') }),
  z.object({
    code: z.literal('scale-mismatch'),
    field: fieldSchema,
    documentMm: finite,
    drawnMm: finite,
  }),
  z.object({ code: z.literal('scaled-value-only'), field: fieldSchema }),
  z.object({
    code: z.literal('dimension-chain-mismatch'),
    totalMeasurementId: idSchema,
    partMeasurementIds: z.array(idSchema).max(50),
    sum: finite,
    total: finite,
  }),
]);

export const recognitionResultSchema = z.object({
  engine: z.object({
    id: idSchema,
    mode: z.enum(RECOGNITION_MODES),
    version: z.string().min(1).max(50),
  }),
  measurements: z.array(measurementSchema).max(5_000),
  documentUnit: z
    .object({
      unit: lengthUnitSchema,
      text: shortText,
      region: regionSchema.optional(),
    })
    .optional(),
  scale: z
    .object({
      denominator: z.number().int().min(1).max(10_000),
      text: shortText,
      region: regionSchema.optional(),
    })
    .optional(),
  roofType: z
    .object({
      value: z.enum(['gable', 'hip', 'unsupported']),
      text: shortText,
      region: regionSchema.optional(),
    })
    .optional(),
  points: z
    .array(
      z.object({
        id: idSchema,
        page: z.number().int().min(1),
        x: finite,
        y: finite,
      }),
    )
    .max(10_000)
    .optional(),
  segments: z
    .array(
      z.object({
        id: idSchema,
        page: z.number().int().min(1),
        from: point,
        to: point,
        role: z.enum(['calibration', 'measurement', 'outline', 'unknown']),
      }),
    )
    .max(50_000)
    .optional(),
  relations: z
    .array(
      z.discriminatedUnion('kind', [
        z.object({
          kind: z.literal('measures'),
          measurementId: idSchema,
          segmentId: idSchema,
        }),
        z.object({
          kind: z.literal('scale-cross-check'),
          measurementId: idSchema,
          segmentId: idSchema,
          documentMm: finite,
          drawnMm: finite,
          deviationRatio: finite,
        }),
        z.object({ kind: z.literal('outline'), segmentIds: z.array(idSchema) }),
        z.object({
          kind: z.literal('dimension-chain'),
          axis: z.enum(['horizontal', 'vertical']),
          totalMeasurementId: idSchema,
          partMeasurementIds: z.array(idSchema).min(2).max(50),
          sum: finite,
        }),
      ]),
    )
    .max(10_000)
    .optional(),
  warnings: z.array(warningSchema).max(1_000),
}) satisfies z.ZodType<RecognitionResult>;

/** Parses untrusted engine output; throws a ZodError on any violation. */
export function parseRecognitionResult(value: unknown): RecognitionResult {
  return recognitionResultSchema.parse(value);
}
