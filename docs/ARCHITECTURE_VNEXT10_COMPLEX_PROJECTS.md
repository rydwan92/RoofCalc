# VNext-10 — complex projects: several roof structures in one project

Owner request (2026-10-24): "wprowadź do silnika RoofCalc czytanie bardziej
skomplikowanych projektów kompleksowo dla całej aplikacji". Decision record:
`docs/adr/ADR-017-multi-structure-projects.md`.

## Definition of Ready

1. **User problem.** A design shows a house and a garage (or a shed, a
   carport). Today the user creates one project per roof and adds the
   materials up by hand; an import reads one roof and ignores the rest.
2. **Domain owner.** The V2 document and its pure edits: `calculator-core`
   (`project-document-v2.ts`, where V2 already lives). Records:
   `project-core`. Structure selection and persistence: the web project
   session (`apps/web/src/projects/`). Recognition of several roof parts in
   a document: `document-import-core`. Totals: a pure web composition over
   the existing per-structure derivation. No solver changes.
3. **Canonical persistence.** The structures, their names and transforms
   are canonical (V2 document). The selected structure is view state of the
   session, never persisted in the document (ADR-002).
4. **Schema / migration.** `ProjectRecordV2` + `RoofProjectDocumentV2`
   (`SCHEMA_REGISTRY.md` §26). One unmoved structure is still written V1;
   existing projects open unchanged. Readers for both versions; the V2 kind
   `mono-pitch` is removed (never persisted).
5. **Undo / history.** Workbench Undo stays per structure and starts empty
   after a switch. Structure add / rename / move / remove are session edits;
   removal asks first. No gesture transaction needed.
6. **Quantity impact.** Per-structure quantities from the existing
   derivation; project totals sum rows of identical material identity and
   are trusted only when every structure's source is complete.
7. **Procurement impact.** None: required blanks per structure unchanged;
   no connection allowance (no connections).
8. **Catalogue impact.** None. Coverings keep their snapshots inside each
   structure (ADR-003).
9. **Future cost layer.** No price enters the structure model; cost keeps
   reading quantities.
10. **Offline.** Everything is local: structures, switching, totals, the
    import. Business sync of a multi-structure project is not offered yet.
11. **Mobile UX.** The structure bar is a horizontally scrolling chip row
    above the workbench at 390×844; add/rename/move live in a sheet with
    exact numeric inputs (x, y, elevation, rotation).
12. **Domain research.** No new geometry. Placement is a rigid transform;
    the overlap check reuses the ADR-015 assessment.
13. **Regression.** Unit tests for the V2 edits and records; session tests
    (switch, write-back, downgrade); architecture test changed with the ADR;
    a two-structure reference fixture; e2e (desktop + phone).
14. **Multi-structure compatibility.** This is it: IDs stay opaque, nothing
    parses a structure ID, local IDs may repeat across structures.

## Phases

- **10A — the project of structures.** V2 edits (add, rename, move,
  remove, write back, downgrade), `ProjectRecordV2`, repository and session,
  structure bar in the workbench, a fixture, tests.
- **10B — project totals.** Quantities per structure and for the project.
- **10C — import of a multi-roof design.** A document with several roof
  parts becomes one project with one structure per part.
- **10D — the site.** All structures placed in one plan / 3D view with the
  overlap check.

## Delivered — 10A (2026-10-24)

- `calculator-core`: V2 document of `template-roof` structures only; pure
  edits `addRoofStructure`, `withRoofStructureProject`,
  `renameRoofStructure`, `moveRoofStructure`, `removeRoofStructure`,
  `roofStructureDocument`; `roofStructureFootprint`, default placement
  beside the others (3 m clear, corner on a whole 10 cm); corner placement
  (`structureCornerPlacement`, `structureTransformAtCorner`).
- `project-core`: `ProjectRecordV2`, `projectRecordSchema`,
  `canonicalProjectDocument`, `createProjectRecordFor`,
  `projectRecordWithDocument`; import reads V1, V2 and bare V2 documents.
- Session: holds the V2 document, writes the workbench document back into
  the selected structure, saves canonically; `addStructure`,
  `selectStructure`, `renameStructure`, `moveStructure`,
  `removeStructure`; the store keeps the perspective on a switch.
- UI: "Dodaj bryłę" in the project menu and the structure row; the
  Creator's `structure` mode; the structure row with settings (name,
  corner X/Y, plate level, rotation, removal with confirmation).
- Tests: V2 edits, records, six session scenarios, architecture gate,
  fixture 13, e2e (desktop + phone).
- Also fixed: editable lengths no longer show binary noise
  (826.3799999999999 → 826.38).

## Delivered — 10B (2026-10-24)

- Each structure has its own estimate (Kosztorys of the structure shown;
  its title names the structure). The first structure keeps the project's
  estimate key; further structures live in their own sidecar (SCHEMA_REGISTRY
  §27).
- "Wycena całego projektu" above the estimate: every structure with lines,
  net, gross and state; the project total from `summarizeCostScenarioParts`;
  a row opens that structure's estimate.
- One money formatter (`formatMoney`) replaces four private copies.
- Tests: cost-core totals (currency, VAT, missing parts), structure-scoped
  repository (keys, removal, downgrade, pruning), e2e (desktop + phone).
- Quantities per structure (timber, layers) as one project schedule remain
  for a later step; the pricing overview is the project total users asked
  for first.
