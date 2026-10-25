# ADR-017 — A project of several structures is a V2 document; the workbench edits one structure at a time

**Status:** Accepted (VNext-10, 2026-10-24). Turns on the V2 writer designed
in ADR-015 for the case it exists for (ADR-008); refines ADR-016.

## Context

Real designs are rarely one roof: a house with a garage, a shed, a carport
against a wall. Since VNext-9 every family (gable, hip, mono-pitch,
asymmetric gable) is calculated end to end as a V1 project, and
`RoofProjectDocumentV2` (structures + transforms + connections) is designed
and tested but switched off. Users had to keep one project per roof and add
the materials up by hand.

## Decision

1. **Format.** A project with two or more structures — or one structure moved
   out of its own frame — is written as `RoofProjectDocumentV2` inside a
   `ProjectRecordV2` (`schemaVersion: 2`). A project with one structure in
   its own frame is still written as V1, byte-identical to today: nothing
   changes for existing projects. Readers accept V1 and V2; an older build
   refuses a V2 record with its ordinary schema error.
2. **One kind of structure.** Every structure is `template-roof`: its
   content is exactly a V1 project (roof template of any family, features,
   opening framing, build-up, coverings, connection plan). The VNext-7A
   `mono-pitch` geometry kind is removed — it was never persisted, and
   ADR-016 made mono-pitch a template variant.
3. **The workbench edits one structure.** The store, solvers, materials,
   cost, documents and readiness keep reading one V1 document: the selected
   structure's. Selecting another structure is a session operation: the
   open edit is committed, the structure is written back into the V2
   document, the next one is loaded. Undo/Redo belongs to the structure
   being edited and starts empty after a switch. Adding, renaming, moving
   and removing a structure are explicit session edits (a removal asks
   first), not workbench Undo entries.
4. **Identity.** Structure IDs are opaque (`structure:roof` for the roof a
   V1 project brings, `structure:<n>` for added ones; ADR-007). Local IDs are
   unchanged inside a structure; a reference that leaves a structure is a
   `{ structureId, localId }` pair, never a concatenated string.
5. **Placement.** `transform` places a structure's local solver frame on
   the site (plan translation x/y, elevation z, rotation about the vertical).
   No solver reads it: it serves the site view and the overlap check.
6. **No inferred connections.** `connections` stays empty. Structures whose
   plans overlap are reported as an unsolved junction (ADR-015 assessment);
   a valley or abutment between structures is never inferred from geometry.
7. **Quantities and estimates.** Each structure's quantities come from
   the same derivation as the workbench; the project total adds rows with
   the same material identity and keeps the per-structure breakdown.
   Nothing is assigned to a connection. Each structure has its own cost
   estimate; the project's is their sum in one currency, naming any
   structure without one (VNext-10B).
8. **Business.** Server estimations carry a project record — V1, or V2
   for a project of several structures — validated with the same
   `projectRecordSchema` the browser uses and stored as an opaque snapshot
   (a JSON column: no migration; every stored V1 record reads unchanged).
   The server never opens the V2 document: it neither edits nor totals
   structures. (VNext-10A–10E kept estimations V1 and offered no structure
   in Business; VNext-10F lifts that.)
9. **Quote of several structures.** A quote of a project of several
   structures has one section per structure (`QuoteDraft.sections`, each
   with its label and source fingerprint; `QuoteLine.sectionId`). A line is
   identified by the pair (section, line id), never by a concatenated
   string. A section is built by the same material-plan → quote path as a
   one-roof quote, while its structure is open in the workbench, and is
   refreshed only then; the other sections keep their frozen values. Lines
   of a removed structure leave the quote on the next refresh; a structure
   without a section is named, never priced as zero.

## Consequences

- `tools/architecture/layering.test.ts` allows V2 in the project layer
  (`packages/project-core`, `apps/web/src/projects/`) and keeps it out of
  the workbench, solvers and documents, which see one V1 document.
- `SCHEMA_REGISTRY.md` §26 records the record and document versions, the
  removed kind and the downgrade rule (back to V1 when one unmoved structure
  remains).
- Junction framing, valleys between structures and flashing remain future
  work behind connections (ADR-008).
- VNext-10E implements §7 for structural timber and roof area: the material
  identity added across structures is the exact section
  (`quantity-core` `summarizeProjectTimber`); a member without one is
  counted, never added to a section. Build-up layers stay per structure.
