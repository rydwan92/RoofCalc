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
- **10E — the project schedule.** Structural timber and roof area per
  structure and for the project, timber added by exact section.
- **10F — Business.** A business estimation carries a project of several
  structures; its quote has a section per structure.

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

## Delivered — 10E (2026-10-25)

Readiness, briefly: the user (a carpenter pricing a house and a garage)
had to open every structure and add its timber by hand. Owner: the
schedule stays in `quantity-core` (adding parts by section is a quantity
rule, like `createSectionGroups`); the web project layer only feeds it each
structure's schedule. Derived, never stored — no schema, no migration, no
history entry. No allowance, stock length or price enters (ADR-005,
ADR-009, ADR-010). Offline. Phone: the same table, narrower. Structures are
keys, never parsed (ADR-007).

- `quantity-core` `summarizeProjectTimber(parts)`: adds section groups of
  the same exact section (width × depth) across parts, with each part's
  share; a member without an exact section (a ridge without its depth) is
  counted in the totals, named by its part and never guessed into a
  section; the volume is that of the exact sections.
- `structuralTimberSchedule(project)`
  (`apps/web/src/assembly/member-schedule.ts`): the workbench's own
  resolver, accepted opening framing and `createRoofMemberSchedule`;
  `structuralSectionOverrides` (the ridge section) is now one function the
  workbench uses too.
- `deriveProjectQuantities` (project layer) and "Zestawienie całego
  projektu" above the material plan of a project of structures: per
  structure roof area, members, length and volume ("bez 1 szt." when a
  member has no exact section); the project's timber by section with each
  structure's share; a row opens that structure.
- Tests: hand-checked section sums and volumes; fixture 13 (each structure
  equals its own schedule and surface, the total is the sum, a ridge
  without its depth stays out of the sections, with its depth it joins
  40 × 160); e2e desktop + phone (the total is the rows' sum, a row opens a
  structure).
- Not yet: build-up layers (battens, counter-battens, membrane, covering)
  per project — they need each structure's layouts, which the workbench
  resolves for the open structure only; a project CSV.

## VNext-10F — Business: one estimation, every structure (2026-10-25)

### Definition of Ready

1. **User problem.** A salesperson quoting a house and its garage had to
   open two estimations — Business offered no structure — and send two
   quotes for one customer and one site.
2. **Domain owner.** `quote-core` owns a quote of several parts (sections,
   line identity, merging a rebuilt part, part status): a commercial rule,
   no roof inside. The web business workspace builds each part through the
   existing material-plan → quote path. The API only validates and stores.
3. **Canonical persistence.** None new in the roof document. The
   estimation's snapshot may now be a V2 record (ADR-017 §8).
4. **Schema / migration.** SCHEMA_REGISTRY §30: estimation snapshot V1 |
   V2 in a JSON column (no SQL migration, every V1 row reads unchanged);
   `QuoteDraft.sections?` and `QuoteLine.sectionId?` additive optional,
   quote `schemaVersion` stays 1, old drafts parse.
5. **Undo / history.** Structure edits stay session edits (10A); quote
   edits are quote edits — no new history entry.
6. **Quantity.** Unchanged; each part is the open structure's material plan.
7. **Procurement.** Unchanged.
8. **Catalogue.** Unchanged; prices and SKUs come from the same lookups.
9. **Cost layer.** Quote money stays in `quote-core`; no price enters
   geometry, quantity or procurement.
10. **Offline.** A business estimation needs the server as before; the
    local project of structures still works offline.
11. **Mobile.** The same quote at 390 px: a section row above its groups;
    "Otwórz „…”" buttons for parts with no section yet; e2e on the phone.
12. **Domain research.** None (no geometry).
13. **Regression.** quote-core section tests (merge, identity, status,
    totals, schema), API estimation tests with fixture 13, QuoteWorkspace
    tests, e2e desktop + phone through the workspace fixture.
14. **Multi-structure.** Structure IDs stay opaque; a line is (section, id),
    never a concatenated string; sections follow the project's order.

### Delivered

- API: estimations create, save, read and duplicate a `ProjectRecord` (V1
  or V2) with `projectRecordSchema`; the server never opens structures.
- Web: the estimation autosaves the whole project (`exportRecord`, the open
  structure written back); an opened estimation restores its structures;
  "Dodaj bryłę" is offered in Business.
- `quote-core`: `QuoteSection`, `QuoteLine.sectionId`, `sameQuoteLine`;
  edits take a line (section and id); `withQuoteSection` rebuilds the open
  part and keeps the others frozen (a one-roof quote becomes the first
  structure's part; a removed structure leaves); `quoteSectionStatus` says
  whether the open part is stale and which parts have none;
  `summarizeQuoteBySection`.
- Quote: a section row per structure with its net subtotal ("bez ceny: n"
  while lines lack a price); "Bez pozycji w ofercie: …" with a button that
  opens that structure while the quote stays open; the refresh names the
  structure it rebuilds.
- Found on the way: a mono-pitch roof's low and high wall plates shared
  one schedule row id (`…:M:wall-plate:1`), so its quote held two lines
  with one id and the server refused it. Row ordinals now run across
  identities with a shared prefix (quantity-core; ids of every other row
  unchanged).
- Not yet: a quote part is rebuilt only while its structure is open (each
  structure's material plan lives in the workbench); a printed quote of
  several structures has no per-structure page break.
