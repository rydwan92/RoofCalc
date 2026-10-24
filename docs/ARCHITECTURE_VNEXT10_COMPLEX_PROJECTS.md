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

## Delivered — 10C (2026-10-25)

- `recognizeDocumentStructures`: headings at the start of a line (after a
  numbering or a sheet title), never prose; "Garaż 1" and "Garaż 2" stay
  apart, "Dom" and "Budynek mieszkalny" on two pages join; text left of the
  heading column (the drawing, its dimensions) belongs to no structure; a
  structure without roof data does not make a document multi-roof.
- The review: a chooser of the structures (ready / to check / left out),
  per-structure decisions and values, "leave this structure out"; the
  create button names the structure count; one project, structures placed
  beside each other.
- Sample "Dom z garażem — dwa dachy"; integration tests over real pdf.js
  (two starts, nothing leaking between them, every single-roof sample
  unchanged); heading unit tests; e2e desktop + phone.
- Not yet: column layouts with two structures side by side on one sheet are
  read by vertical order; photos and scans are single-roof (no text layer to
  split).

## Delivered — 10D (2026-10-25)

- `deriveSiteScene` (`apps/web/src/projects/site-scene.ts`): every
  structure's roof is the scene the workbench already checks (ADR-015),
  placed by its transform with the topology core's `transformRoofScene`;
  no second geometry. Two roofs that share plan area are found by the core's
  own assessment (`junction-unresolved`) over the pair's merged scene, and
  reported as a pair of structure IDs — no ID is parsed (ADR-007).
- "Widok działki" in the structure row: the roofs of every structure in
  plan, the open one emphasised, an overlapping pair outlined in the warning
  colour; a click (or Enter) on a roof opens that structure. The plan follows
  the open structure's edits as they happen.
- The overlap warning names both structures and says the junction (valley,
  flashing) is not calculated (ADR-017 §6): nothing is inferred, and the
  warning shows with the site view closed too.
- Tests: fixture 13 apart (no overlap, the placed carport roof covers its
  outline) and stacked (one pair); e2e desktop + phone (apart → on top of
  the house → back, select by a click on the plan).
- Not yet: a 3D site view; an elevation check (a lower roof under an eave
  is still reported by plan); dragging a structure on the site (the exact
  inputs of the structure settings stay the way to place it).
