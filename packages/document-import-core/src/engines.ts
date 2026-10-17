import type { DocumentSourceKind, EngineRef, RecognitionMode } from './model';

/**
 * Recognition engines are adapters behind one contract (`RecognitionResult`).
 * The application never depends on a particular provider: an engine is
 * described here, implemented in an app-level adapter, and its output is
 * parsed by `parseRecognitionResult` before it can influence a draft.
 */
export interface RecognitionEngineDescriptor extends EngineRef {
  /** `external` engines send the document off the device. */
  locality: 'on-device' | 'external';
  availability: 'available' | 'not-configured';
  accepts: readonly DocumentSourceKind[];
}

export const TEXT_LAYER_ENGINE: RecognitionEngineDescriptor = {
  id: 'roofcalc-text-layer',
  mode: 'text-layer',
  version: '1',
  locality: 'on-device',
  availability: 'available',
  accepts: ['pdf'],
};

/**
 * Dimensions the user frames on a scan, photo or text-less PDF page and
 * types exactly as written. Dimension-first: no scale, no calibration.
 */
export const TRANSCRIPTION_ENGINE: RecognitionEngineDescriptor = {
  id: 'roofcalc-transcription',
  mode: 'transcription',
  version: '1',
  locality: 'on-device',
  availability: 'available',
  accepts: ['pdf', 'png', 'jpeg', 'webp'],
};

/**
 * Outline lines of a vector PDF, measured at the drawing's stated scale.
 * Scaled evidence: it cross-checks written dimensions and never fills a
 * field on its own (see `measurementValueSource`).
 */
export const VECTOR_GEOMETRY_ENGINE: RecognitionEngineDescriptor = {
  id: 'roofcalc-vector-geometry',
  mode: 'vector-geometry',
  version: '1',
  locality: 'on-device',
  availability: 'available',
  accepts: ['pdf'],
};

export const MANUAL_UNDERLAY_ENGINE: RecognitionEngineDescriptor = {
  id: 'roofcalc-manual-underlay',
  mode: 'manual',
  version: '1',
  locality: 'on-device',
  availability: 'available',
  accepts: ['pdf', 'png', 'jpeg', 'webp'],
};

/**
 * Reserved slots. No OCR or AI vision provider is configured in this
 * version; they are listed so the UI can state the limitation honestly and
 * so a future adapter plugs into the same contract. They are never faked.
 *
 * An OCR adapter needs to deliver only positioned text — the
 * `TextLayerPage[]` shape a PDF text layer already produces — and then runs
 * through `recognizeTextLayer` unchanged: labels, units, dimension rows,
 * chains and plausibility are shared, so OCR output is held to exactly the
 * rules of a born-digital PDF. Its engine id must be its own, so a draft can
 * always say which numbers a machine read.
 */
export const OCR_ENGINE_SLOT: RecognitionEngineDescriptor = {
  id: 'ocr',
  mode: 'ocr',
  version: '0',
  locality: 'on-device',
  availability: 'not-configured',
  accepts: ['pdf', 'png', 'jpeg', 'webp'],
};

export const AI_VISION_ENGINE_SLOT: RecognitionEngineDescriptor = {
  id: 'ai-vision',
  mode: 'ai-vision',
  version: '0',
  locality: 'external',
  availability: 'not-configured',
  accepts: ['pdf', 'png', 'jpeg', 'webp'],
};

export const RECOGNITION_ENGINES: readonly RecognitionEngineDescriptor[] = [
  TEXT_LAYER_ENGINE,
  TRANSCRIPTION_ENGINE,
  VECTOR_GEOMETRY_ENGINE,
  MANUAL_UNDERLAY_ENGINE,
  OCR_ENGINE_SLOT,
  AI_VISION_ENGINE_SLOT,
];

/** A deliberate, per-document user decision to let one engine see a file. */
export interface ExternalProcessingConsent {
  engineId: string;
  documentFingerprint: string;
}

export type EngineGate =
  | { allowed: true }
  | {
      allowed: false;
      reason: 'not-configured' | 'consent-required' | 'unsupported-source';
    };

/**
 * The single gate an application calls before running an engine. An
 * external engine needs consent bound to this exact document; consent for
 * another file or another engine does not carry over.
 */
export function canRunEngine(
  engine: RecognitionEngineDescriptor,
  source: { kind: DocumentSourceKind; fingerprint: string },
  consent?: ExternalProcessingConsent,
): EngineGate {
  if (engine.availability !== 'available')
    return { allowed: false, reason: 'not-configured' };
  if (!engine.accepts.includes(source.kind))
    return { allowed: false, reason: 'unsupported-source' };
  if (
    engine.locality === 'external' &&
    (consent?.engineId !== engine.id ||
      consent.documentFingerprint !== source.fingerprint)
  )
    return { allowed: false, reason: 'consent-required' };
  return { allowed: true };
}

export function engineRef(engine: RecognitionEngineDescriptor): EngineRef {
  return { id: engine.id, mode: engine.mode, version: engine.version };
}

/** Every engine id the UI should describe for a source, in display order. */
export function enginesForSource(
  kind: DocumentSourceKind,
): RecognitionEngineDescriptor[] {
  return RECOGNITION_ENGINES.filter((engine) => engine.accepts.includes(kind));
}

export type { RecognitionMode };
