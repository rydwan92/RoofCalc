import { engineRef, TRANSCRIPTION_ENGINE } from './engines';
import type {
  Confidence,
  EvidenceCode,
  NumericRoofField,
  PageBox,
  RecognitionResult,
  RecognizedMeasurement,
} from './model';
import { isAngleField } from './model';
import {
  LENGTH_UNIT_MM,
  percentSlopeToDegrees,
  scanMeasurementTokens,
} from './tokens';

/**
 * Transcription: the dimension-first path for scans, photos and PDF pages
 * without a text layer. The user frames a dimension written on the drawing
 * and types it exactly as written ("12,40", "1240", "38⁵", "35°", "8×18").
 * Nothing is measured and no scale is needed — the drawing's own number is
 * the value, and the framed region stays as evidence of where it was read.
 *
 * The written text is parsed by the same token scanner as a PDF text layer,
 * so a transcription and a text-layer reading of the same number agree.
 */

/** `rafterSection` takes a written pair such as "8×18" (width × depth). */
export type TranscriptionTarget = NumericRoofField | 'rafterSection';

export interface TranscriptionInput {
  /** Opaque, unique in the import session. */
  id: string;
  page: number;
  box: PageBox;
  /** Exactly what is written on the drawing. */
  text: string;
  /** What the dimension means; absent = an unassigned dimension. */
  target?: TranscriptionTarget;
}

export type TranscriptionError =
  | 'empty'
  | 'not-a-dimension'
  | 'several-values'
  | 'angle-expected'
  | 'length-expected'
  | 'pair-expected'
  | 'out-of-range';

export type TranscriptionOutcome =
  | { ok: true; measurements: RecognizedMeasurement[] }
  | { ok: false; error: TranscriptionError };

function measurement(
  input: TranscriptionInput,
  suffix: string,
  fields: Omit<
    RecognizedMeasurement,
    'id' | 'engineId' | 'mode' | 'region' | 'confidence' | 'evidence'
  >,
  confidence: Confidence,
  evidence: EvidenceCode[],
): RecognizedMeasurement {
  return {
    id: suffix ? `${input.id}:${suffix}` : input.id,
    ...fields,
    region: { page: input.page, box: input.box },
    confidence,
    evidence,
    engineId: TRANSCRIPTION_ENGINE.id,
    mode: TRANSCRIPTION_ENGINE.mode,
  };
}

/**
 * Turns one transcribed dimension into measurements. Confidence follows the
 * same rule as a labelled text-layer value: the user named the field (the
 * label) and typed the value; an explicit unit makes it `high`, a bare
 * number `medium` (its unit comes from the document or the user), and an
 * unassigned number `low` until a chain or the user gives it a meaning.
 */
export function transcribeDimension(
  input: TranscriptionInput,
): TranscriptionOutcome {
  const text = input.text.trim();
  if (!text) return { ok: false, error: 'empty' };
  const tokens = scanMeasurementTokens(text).filter(
    (token) => token.kind !== 'scale',
  );
  if (tokens.length === 0) return { ok: false, error: 'not-a-dimension' };
  if (tokens.length > 1) return { ok: false, error: 'several-values' };
  const [token] = tokens;
  const target = input.target;

  if (target && target !== 'rafterSection' && isAngleField(target)) {
    let valueDeg: number;
    let unit: 'deg' | 'percent' | undefined;
    if (token!.kind === 'angle') {
      valueDeg = token!.degrees;
      unit = 'deg';
    } else if (token!.kind === 'percent') {
      valueDeg = percentSlopeToDegrees(token!.percent);
      unit = 'percent';
    } else if (token!.kind === 'length' && !token!.unit) {
      valueDeg = token!.value;
    } else return { ok: false, error: 'angle-expected' };
    if (!(valueDeg > 0 && valueDeg < 90))
      return { ok: false, error: 'out-of-range' };
    const evidence: EvidenceCode[] = ['transcribed'];
    if (unit) evidence.push('explicit-unit');
    if (unit === 'percent') evidence.push('percent-slope-converted');
    return {
      ok: true,
      measurements: [
        measurement(
          input,
          '',
          {
            field: target,
            quantity: 'angle',
            raw: {
              text,
              value: token!.kind === 'percent' ? token!.percent : valueDeg,
              unit,
            },
            valueDeg,
            unitBasis: 'explicit',
          },
          unit ? 'high' : 'medium',
          evidence,
        ),
      ],
    };
  }

  if (target === 'rafterSection') {
    if (token!.kind !== 'pair') return { ok: false, error: 'pair-expected' };
    const evidence: EvidenceCode[] = ['transcribed', 'section-pair'];
    if (token!.unit) evidence.push('explicit-unit');
    const confidence: Confidence =
      token!.unit && token!.first <= token!.second ? 'high' : 'medium';
    const pair: [NumericRoofField, number][] = [
      ['rafterWidth', Math.min(token!.first, token!.second)],
      ['rafterDepth', Math.max(token!.first, token!.second)],
    ];
    return {
      ok: true,
      measurements: pair.map(([field, value]) =>
        measurement(
          input,
          field,
          {
            field,
            quantity: 'length',
            raw: { text, value, unit: token!.unit },
            ...(token!.unit
              ? {
                  valueMm: value * LENGTH_UNIT_MM[token!.unit],
                  unitBasis: 'explicit' as const,
                }
              : {}),
          },
          confidence,
          [...evidence],
        ),
      ),
    };
  }

  if (token!.kind !== 'length') return { ok: false, error: 'length-expected' };
  const evidence: EvidenceCode[] = ['transcribed'];
  if (token!.unit) evidence.push('explicit-unit');
  if (!target) evidence.push('unlabelled');
  const confidence: Confidence = !target
    ? 'low'
    : token!.unit
      ? 'high'
      : 'medium';
  return {
    ok: true,
    measurements: [
      measurement(
        input,
        '',
        {
          ...(target ? { field: target } : {}),
          quantity: 'length',
          raw: { text, value: token!.value, unit: token!.unit },
          ...(token!.unit
            ? {
                valueMm: token!.value * LENGTH_UNIT_MM[token!.unit],
                unitBasis: 'explicit' as const,
              }
            : {}),
        },
        confidence,
        evidence,
      ),
    ],
  };
}

/** All transcriptions of a session as one recognition result. */
export function transcriptionResult(
  measurements: readonly RecognizedMeasurement[],
): RecognitionResult {
  return {
    engine: engineRef(TRANSCRIPTION_ENGINE),
    measurements: [...measurements],
    warnings: [],
  };
}
