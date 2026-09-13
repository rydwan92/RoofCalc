# Architecture V21 — Workbench hardening and fixed modular sheets

## Scope

V21 has two ordered responsibilities: repair the professional workbench presentation exposed by the V20 desktop screenshots, then add the first metal-covering strategy. The only new covering solver is `modular-sheet` with `lengthModel.kind === 'fixed-sheet'`. Cut-to-length sheets, standing seam, commercial catalogues, pricing, persistence and exports remain outside this iteration.

## Token defect and semantic contract

The black Covering plane was a presentation failure, not a geometry failure. Assembly SVG rules referenced `--a-canvas`, `--a-accent` and `--a-line-strong`, while the assembly root did not guarantee all of those names. An invalid SVG `fill` declaration falls back to the SVG initial fill, which is black.

`packages/ui/src/tokens.css` now owns semantic `--ui-*` tokens for background, surface, canvas, panel, normal/strong lines, text/muted text, accent, selection, related state, warning, danger, timber, full covering, cut covering and openings. `.assembly-app` explicitly bridges those values to the local `--a-*` vocabulary. Critical SVG fills also carry concrete fallback colours. A token-contract test checks both the shared declarations and the fallback-safe Covering rules.

This bridge permits gradual component migration without another naming gap. It is not a branding redesign; the restrained green technical palette remains.

## Workbench presentation

Builder has a compact desktop introduction so the technical canvas begins higher. Quick Calc keeps its explanatory onboarding.

Desktop Toolbox uses the active task as its default filter, reusing the existing registry and actions. Construction, Openings, Layers, Covering, Cuts and Materials expose their relevant sections. `Wszystkie narzędzia` is the explicit full-model escape. The filtering is presentation state and creates no project history.

Layer projection uses an intentional hierarchy: the active membrane/counter-batten/batten layer is dominant; roof boundaries and openings remain readable; supporting members stay visible as subdued context.

## Presentation boundaries

Stable roof-plane IDs and installation-mode IDs remain domain data. `covering-presentation.ts` maps known plane roles and the manual installation mode to translation keys. Domain packages never translate IDs and calculations never branch on display labels. Unknown plane IDs retain a generic translated fallback.

The Covering centre owns assignment identity, compatibility, the selected plane, the drawing, assignment totals and the geometric-quantity boundary. The Inspector owns exact snapshot parameters, installation mode, alignment, plane assignment and removal. It may show compact status/issues but does not repeat the centre's full result dashboard. Assignment totals and the selected-plane result are labelled separately.

## Assignment selection and plane exclusivity

`ProjectDocument.project.coverings[]` remains canonical. `selectedCoveringAssignmentId` is transient workbench state: it is not serialized and changing it creates no Undo entry. Adding, editing or removing assignments is one canonical history operation. If the selected assignment is removed, the store selects the item at the removed index, clamped to the new array; if none remain it selects nothing.

`resolvePrimaryCoveringAssignments` enforces one primary covering per roof plane. It returns structured conflicts, conflicted assignment IDs and trusted plane IDs per assignment. Existing overlapping documents still parse and are not rewritten silently. A conflicted plane is excluded from all layout/quantity inputs, preventing duplicate trusted covering quantities while leaving non-conflicted planes usable.

The Page pipeline is generic:

```text
canonical covering assignments
  → primary-plane conflict resolution
  → strategy result per assignment kind
  → transient active assignment
  → shared Covering workspace / Inspector
  → trusted covering quantity sources
```

Standing-seam snapshots remain parseable but have no V21 strategy and therefore emit no trusted layout quantity.

## Additive layout intent

`CoveringLayoutIntent` is a discriminated union of `RoofTileLayoutIntent` and `ModularSheetLayoutIntent`. Modular sheets support `centered`, `from-u-min` and `manual` horizontal alignment with optional per-plane millimetre offsets. The schema checks that assignment kind and intent kind agree. Old roof-tile documents remain valid; all derived rows, positions, fragments and active selections remain unserialized.

## Fixed modular-sheet strategy

`resolveModularSheetLayout` is pure TypeScript in `covering-core`. It consumes an assignment snapshot, neutral plane-local polygons/openings and neutral resolved battens. It has no React, DOM, roof-type, manufacturer, catalogue, database or pricing dependency.

For a supported fixed sheet:

- coverage width is `effectiveWidthMm`, never total width;
- coverage row depth is `effectiveLengthMm`, never total length;
- U is one coherent plane-level grid parallel to the eave;
- V is an eave-based fixed-length grid up the slope;
- centred alignment is calculated once from the plane extent and is not recentered per hip row;
- stable ordering and IDs derive from assignment, plane, row and column;
- generic polygon clipping resolves gable and hip boundaries;
- canonical opening polygons subtract from the same uninterrupted grid;
- positions classify as `full`, `cut-roof-edge`, `cut-opening` or `split-by-opening`.

Disconnected fragments are geometric evidence only. V21 does not claim that one purchased sheet can produce every fragment or that an offcut can be reused.

## Compatibility

Minimum pitch is checked as product compatibility. Falling below it means `incompatible`, not structurally unsafe.

Where module support is declared, resolved regular batten spacing is checked against `moduleLengthMm`. The engine neither generates nor repairs battens. Missing battens make the result incomplete; a mismatch makes it incompatible. Manufacturer-specific eave, first-row and ridge offsets are not generalized by this contract and remain an explicit limitation.

`cut-to-length` snapshots return `limited` with `cut-to-length-not-supported`. They are not coerced to fixed sheets. A future solver must decide panel segmentation, maximum manufacture/transport lengths, transverse joints and overlaps, module-step constraints, opening fragmentation and multi-panel slope strategy.

## Quantity semantics

Only a resolved, non-empty fixed-sheet layout emits a covering quantity source. Its unit is `piece`, its value is the count of geometric coverage positions and its basis identifies a fixed modular-sheet layout. The schedule labels these as geometric sheets/modules—not purchase quantity—and preserves warnings that waste, breakage, accessories, packaging and offcut reuse are absent. Tile and modular-sheet rows remain separate; incompatible, incomplete, limited and conflicted results are untrusted and do not enter totals.

## Responsive behaviour and performance

The V20 mobile shell remains the owner of panels and contextual sheets. Covering stays drawing-first; assignment selection is compact and exact sheet parameters stay in the Inspector sheet. The shared canvas uses the existing fragment threshold and switches to a lightweight row/course representation for large layouts while retaining exact memoized domain counts. Sheet positions are derived data, never persistent component state.

## Future persistence boundary

The existing versioned `ProjectDocument` remains the future saved-project payload. A named project, save/autosave, project revision, import/export and a backend repository adapter are the next product-system concerns, but none is implemented here. Transient camera, task, panel, selected plane and selected covering assignment state must never enter that payload.

## Deferred work

V22 may develop variable-length metal covering architecture—standing seam and/or cut-to-length—from reverified manufacturer rules. It must remain separate from the fixed modular-sheet engine. Sheet nesting, offcut optimization, waste, purchase quantities, catalogue/API data, prices, VAT, discounts, accessories, structural verification and document exports are also deferred.
