# ADR-012 — Document import goes through a versioned intermediate model

**Status:** Accepted (VNext, 2026-10-15)

## Context

Users want to start a project from a PDF plan, a scan or a photo. Recognition
can come from very different engines: the text layer of a PDF, manual
measurement on the underlay, and in future OCR or an AI vision service. An
engine can be wrong, and an external engine sees the user's document. A
reading must never silently become a construction dimension, and the
application must not depend on one provider.

## Decision

1. Every engine returns the same `RecognitionResult` contract
   (`packages/document-import-core`), validated with zod at the boundary.
   An engine never writes a roof template, a project or a quantity.
2. `deriveImportedRoofDraft` combines results with the user's decisions into
   `ImportedRoofDraftV1`: every value keeps its source region, unit basis,
   named confidence (`high | medium | low`, never a probability) and
   alternatives. Uncertain values require explicit confirmation; conflicts
   require a choice; a confirmation is bound to the exact value shown.
3. Only `mapDraftToRoofStart` turns a reviewed draft into the existing
   project-start parameters, and the existing `createProjectStartTemplate` →
   `createRoofProjectDocument` → `ProjectSession.createFromDocument` path
   creates the project. No import-specific geometry exists.
4. File format is decided from bytes, never from the name or MIME type.
   Parsing runs on the device. An engine with `locality: 'external'` may run
   only with consent bound to that engine and that document's fingerprint
   (`canRunEngine`). No external engine is configured in this version.
5. The PDF parser (`pdfjs-dist`) is allowed only in
   `apps/web/src/document-import/`; the core package imports nothing from the
   workspace, no parser, no network API.

## Consequences

- A future OCR or AI adapter plugs in by producing a `RecognitionResult`; the
  review, validation and project creation stay the same and stay honest.
- The draft is session-only today. Persisting it later needs a registry entry
  and a reader for `schemaVersion: 1`.
- Recognising geometry from drawing lines is a separate, future engine; the
  model already carries points, segments and relations for it.
- Enforced by `tools/architecture/layering.test.ts` (purity, offline, parser
  boundary) and `packages/document-import-core` tests.
