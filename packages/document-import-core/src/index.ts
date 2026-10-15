/**
 * @cieslacalc/document-import-core — VNext intelligent document import.
 *
 * Pipeline (each stage a pure function; parsing a PDF or decoding an image
 * happens in an application adapter, never here):
 *
 *   1. ingestion          classifyDocumentBytes, checkImageDimensions
 *   2. preprocessing      (adapter) positioned text / page raster
 *   3. text & dimensions  scanMeasurementTokens
 *   4. geometry           calibrateFromPoints, calibrateFromDrawingScale
 *   5. semantics          recognizeTextLayer, manualMeasurementResult
 *   6. units              resolveMeasurementValue
 *   7. validation         deriveImportedRoofDraft (plausibility, conflicts)
 *   8. template mapping   mapDraftToRoofStart → existing project start
 *   9. confirmation       ImportDecisions (choices, entries, confirmations)
 *  10. project creation   (app) existing createProjectStartTemplate path
 */
export * from './model';
export * from './ingestion';
export * from './tokens';
export * from './units';
export * from './engines';
export * from './text-layer';
export * from './draft';
export * from './mapping';
export * from './calibration';
export { normalizeForMatching } from './vocabulary';
