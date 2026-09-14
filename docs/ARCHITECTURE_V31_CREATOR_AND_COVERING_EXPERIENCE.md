# V31 — Creator Experience & Covering Studio

Status: implementation in progress, 2026-09-14. V31 is a presentation and
intent-capture iteration over the current V30 project, covering and export
boundaries. It changes no geometry or covering solver.

## Definition of Ready

1. **User problem:** A first-time roofer is dropped into an expert workbench and
   a covering can be created from unexplained defaults. V31 provides a short,
   visual project start and an explicit product-family → source → verified-data
   path without slowing direct task navigation for returning users.
2. **Domain owner:** `apps/web/src/assembly` owns project-start mapping,
   contextual guidance and covering presentation because they coordinate
   existing package outputs. `covering-core` continues to own validation and all
   layout mathematics.
3. **Canonical persistence:** Project basics map directly to the existing roof
   template (`buildingWidthMm / 2 → halfRunMm`). A confirmed covering product
   remains an existing `CoveringAssignmentSpec`; start, guidance and manual
   drafts are transient and never serialized.
4. **Schema / migration:** No registry entry changes. `RoofProjectDocumentV1`,
   `ProjectRecordV1` and `CoveringTechnicalSpec` remain byte-compatible, and old
   projects open through their existing readers.
5. **History:** Editing an existing project's basic dimensions is one canonical
   history entry. Opening/cancelling assistants, changing assistant steps,
   guidance, drawing detail and disclosures create none. Creating a new project
   starts its own empty history.
6. **Quantity:** V31 creates no quantity source. It only emphasizes already
   trusted coverage positions or geometric panel runs and withholds untrusted
   totals.
7. **Procurement:** No fabrication blank or allowance changes. K1 guidance opens
   the existing V28 planner; procurement continues to infer nothing.
8. **Catalogue:** No technical field changes. Catalogue selection stores the
   existing immutable revision reference plus snapshot. Manual drafts become
   canonical only after the currently required technical dataset validates.
9. **Future cost:** No price, currency, margin, supplier, waste or purchase
   quantity enters geometry, quantity, procurement or covering presentation.
10. **Offline:** Project start, manual products, guidance, layout and export work
    locally. Catalogue browse alone may report its existing offline state.
11. **Mobile:** At 390×844 and 360×800 the start assistant is one column with a
    compact preview and reachable primary action. Covering reads summary →
    drawing → action; product and plane editors use the existing sheet boundary.
12. **Research:** No new geometry or installation rule is introduced. V26C's
    execution-semantics audit governs all covering wording and visual cues.
13. **Regression:** Pure tests cover width mapping and guidance priority; UI
    tests cover gable/hip start, Quick handoff, safe manual draft/commit,
    catalogue detachment and semantic render metadata; Playwright covers the
    first-time, experienced and phone flows. Existing fixtures remain unchanged
    because the persisted schemas do not change.
14. **Multi-structure:** UI iterates supplied plane collections and resolves
    translated labels through the existing lookup. No ID is parsed and no new
    assumption that a roof always has two planes is introduced.

## Project-start boundary

The assistant owns a transient `ProjectStartDraft` expressed in display units.
On confirmation it creates one existing `RoofTemplateSpec`: building length maps
to `buildingLengthMm`, width maps to `halfRunMm = buildingWidthMm / 2`, pitch and
horizontal eave map unchanged, and spacing maps to the existing rafter-spacing
intent. Its preview derives only from this draft mapping. Quick handoff seeds
width, pitch and eave from the current symmetric template and asks only for
length, spacing and (where needed) roof type.

## Covering add and manual-data boundary

Adding uses three explicit decisions: family, catalogue/manual source, then
product confirmation. Choosing a family never edits the project. A manual draft
holds user-entered strings and is converted to the existing validated technical
snapshot only on submit; demo numbers are placeholders, not facts. Catalogue
selection retains the current exact-revision application path. Editing a
catalogue-derived technical value removes its catalogue reference in the same
canonical edit and the UI announces that detachment.

## Guidance and visual semantics

`ProjectGuidanceItem` is a derived application projection with blocker, warning,
info and success severities. It deduplicates sources and exposes at most two
highest-priority actions near the workflow; it is neither a toast stream nor
project data.

Covering drawings remain effective coverage cells/geometric runs and are named
`Schemat krycia`. Tile row rhythm, modular-sheet module/rib cues and standing-seam
longitudinal seams are presentation-only SVG metadata. Full/resolved, cut,
opening, warning, selected, related, hover, disabled and muted states use
separate semantic tokens; selection also uses an outline so it is not
colour-only. The contextual legend renders only states actually present.

## Responsive hierarchy and future compatibility

Desktop gives the covering canvas the dominant centre surface with a compact
summary and controlled inspector. Mobile keeps one sheet owner and large plane
cards instead of checkboxes. Technical snapshots remain independent of future
commercial offers and prices; all collections and source/status labels are ready
for more catalogue products and more roof planes without implementing
ProjectDocument V2.
