# Architecture V17 — Units, Dimensions, Measurement and Workbench UX

## Status and scope

V17 is a usability and presentation iteration over the V13–V16 canonical roof model. It does not introduce a second geometry engine, structural sizing, covering products, commercial data, or persistence of editor state.

## Canonical units and display preference

All domain geometry remains millimetre-based. Existing `*Mm`, `*Mm2`, and `*Mm3` fields retain their meaning and precision. Quick Calc and Builder convert only at the web presentation boundary.

The first-visit display unit is centimetres. `apps/web/src/unit-preference.ts` owns a small versioned local-storage record. Missing, corrupt, unsupported, or unavailable storage falls back to centimetres. The preference is shared by both web stores, is not part of `RoofProjectDocumentV1`, and is not recorded by Undo/Redo. Project reset preserves it.

`apps/web/src/format.ts` is the ordinary length presentation boundary. Its shared maximum-fraction policy is 1 digit for mm, 2 for cm, and 3 for m. Canonical numbers are never rounded by this policy. Aggregate length may still be reported explicitly in metres; area and volume remain m² and m³.

## Dimension density

Rafter spacing is resolved by the existing roof-math solver. `drawing-engine/createSpacingDimensionPresentation` consumes exact ordered stations and creates renderer-independent display groups:

- `minimal`: no bay dimensions;
- `working`: consecutive equal bays collapse to a representative `count × spacing` group, while a genuinely different remainder stays separate;
- `full`: every exact bay is exposed, using alternating lanes.

The helper does not modify spacing values or station positions. A small deterministic label-priority helper accepts screen-space label bounds only for collision presentation. Protected selected and warning labels remain visible; lower-priority overlapping labels are suppressed. It is intentionally not a generic CAD annotation engine.

## Selection and context

The skeleton derives a local member HUD from the selected member, or from hover when nothing stronger is selected. It exposes the physical instance code, exact three-dimensional axis length, and known section. Essential actions and exact editing remain keyboard/touch accessible through the canvas and Inspector; hover is supplementary.

The context strip is task-first and then selection-specific. It avoids repeating the full Inspector. Member instances use generated physical codes, while schedule selection shows family, display-unit length, and piece count.

The roof Inspector follows a stable hierarchy: primary geometry, layout, result, and a collapsed advanced section for member sections and the ridge section. Toolbox remains the selection/add/enable surface; exact layer parameters remain in Inspector.

## Transient measurement contract

Measure is workbench state, never project state. Its snap candidates are memoized from current canonical geometry:

- member and support-axis endpoints represented by skeleton members;
- roof-plane boundary vertices;
- roof-window corners projected through the canonical roof-plane basis.

Screen coordinates are used only to choose the nearest candidate within a touch-friendly hit radius. `drawing-engine/measureDistance3d` receives canonical world points and returns `Math.hypot(dx, dy, dz)` in millimetres. It never accepts or stores pixel distance.

The workflow is first point, second point, exact result. A subsequent point restarts the measure. Escape cancels it; switching the main task clears it. Measurement blocks construction drags while active and creates no history or serialization output.

## Workspace and camera state

Workspace focus is transient layout state. Enabling it remembers Toolbox and Inspector state, hides both side panels, and expands the canvas column. Escape restores the remembered panel state. It is distinct from Fit.

The skeleton keeps an active projection fit separate from the latest candidate bounds. Canonical edits update geometry without replacing the active fit. Explicit Fit, a fit request, or a viewport-size change adopts the latest candidate fit and resets pan/zoom. Thus editing pitch, span, length, spacing, or sections does not continually move the camera.

On desktop the task controls, context strip, Toolbox, and Inspector use bounded sticky behavior. Mobile retains normal task access and a bottom-sheet Inspector without depending on hover.

## Ridge compatibility and quantity boundary

The canonical ridge keeps its established `thicknessMm` and adds optional `depthMm`. Old V1 documents parse without the optional field. No inferred structural value is inserted.

When `depthMm` is absent, the skeleton may retain its previous visual-only depth fallback, but quantity reporting marks the ridge section partial and excludes its volume. When both physical section dimensions are supplied, quantity-core may include ridge volume. The manual field is undoable canonical project intent and round-trips through V1 serialization.

## Performance boundaries

Changing unit, hover, a snap candidate, panel state, or workspace focus is presentation state and must not invoke a new canonical roof calculation. Measurement candidates are memoized from resolved geometry. `SkeletonCanvas` is loaded as a task-level chunk, while tiny primitives stay in their owning bundles.

## Verification boundary

Pure tests cover unit preference, precision, spacing grouping, label priority, exact 3D measurement, ridge compatibility, and quantity behavior. Store/UI tests cover history isolation, reset behavior, task cancellation, focus restoration, working/full spacing, selected HUD, layer switch semantics, placement-ghost units, and camera-fit preservation.

Browser/device QA must be reported separately from automated jsdom coverage. It must not be claimed when the in-app browser is unavailable.
