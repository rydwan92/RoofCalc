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
7. **Quantities.** Each structure's quantities come from the same
   derivation as the workbench; the project total adds rows with the same
   material identity and keeps the per-structure breakdown. Nothing is
   assigned to a connection.
8. **Business.** Server estimations carry V1 records. A multi-structure
   project stays local in this version and the UI says so; the API is not
   changed.

## Consequences

- `tools/architecture/layering.test.ts` allows V2 in the project layer
  (`packages/project-core`, `apps/web/src/projects/`) and keeps it out of
  the workbench, solvers and documents, which see one V1 document.
- `SCHEMA_REGISTRY.md` §26 records the record and document versions, the
  removed kind and the downgrade rule (back to V1 when one unmoved structure
  remains).
- Junction framing, valleys between structures and flashing remain future
  work behind connections (ADR-008).
