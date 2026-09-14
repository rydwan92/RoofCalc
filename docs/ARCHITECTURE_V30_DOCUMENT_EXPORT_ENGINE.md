# V30 - Document / Export Engine

Status: implementation in progress, 2026-09-14. The approved V30 export prompt
supersedes the previous checkpoint recommendation for connection research.

## Definition of Ready

1. **User problem:** A carpenter has project results scattered across workbench tasks and cannot carry one readable execution package to the workshop/site. Export gathers verified facts into printable pages.
2. **Domain owner:** `document-core` owns a pure typed output contract and ordering/readiness rules. `apps/web` composes existing domain results and renders pages; no solver moves into export.
3. **Canonical persistence:** Configuration, preview and generated document are transient. Only the existing project document is canonical (ADR-002).
4. **Schema / migration:** `ExecutionDocument` has an independent output version, is not saved in ProjectRecord, and needs no ProjectDocument migration. Existing archives open unchanged; a future output reader must distinguish versions.
5. **History:** Opening export, selecting sections, previewing and printing make no roof history entry or gesture transaction.
6. **Quantity:** Only complete/trusted schedule and covering rows enter figures, with their explicit geometric bases. Export adds no quantity source.
7. **Procurement:** K1 uses the existing proven blank and optional current `CuttingPlan`; no rerun or inferred allowance (ADR-009/010).
8. **Catalogue:** The saved covering product snapshot supplies identity and current resolved layout; no new catalogue field (ADR-003).
9. **Cost:** No price, currency, margin or commerce valuation enters output (ADR-005).
10. **Offline:** Composition, preview and browser print work from a local project without database or network (ADR-006).
11. **Mobile:** Export is a project action; configuration opens in the existing full mobile sheet, then a page-width preview with print action at 390x844 and 360x800. Numeric edits remain in existing workbench controls.
12. **Research:** No geometry, coverage or connection calculation changes. The V26C audit and timber connection research bound K1 and H1/J1 wording.
13. **Regression:** Document-core tests cover section order/readiness; adapter tests cover available/missing K1 plan and semantic bases; UI and Playwright cover selection, preview, print and mobile layout. Existing reference fixtures remain untouched.
14. **Multi-structure:** Source IDs remain opaque; the adapter receives the active roof and a scoped project source. No meaning is parsed from IDs (ADR-007/008).

## Boundary

`ProjectRecord/document + resolved roof/surface + schedule + detail previews + optional current CuttingPlan -> web adapter -> ExecutionDocument -> print renderer`.

`document-core` defines discriminated sections and stable ordering. It consumes
prepared evidence only. The web adapter is the sole place combining packages;
neither domain packages nor the document contract know about the renderer.

The browser print path uses A4 page CSS and `window.print()`, with no runtime PDF
dependency or network request. Browser Save as PDF supplies the file. The print
dialog controls its final filename; the UI can suggest a sanitized one.

The source identity uses the saved local project ID, name, `updatedAt` and
ProjectDocument schema. It does not invent a revision. Future immutable
`ExportArtifact {id,projectId,projectRevision,generatedAt,type,configuration,fileMetadata}`
belongs to an account/backend/revision design, not ProjectDocument V1.
