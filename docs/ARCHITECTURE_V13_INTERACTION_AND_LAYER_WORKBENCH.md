# Architecture V13 — Interaction and Layer Workbench

## Status and scope

Iteration 013 hardens the existing V12 roof-feature and batten foundations. It does not add dormers, opening framing, structural verification, manufacturer products, pricing, persistence, authentication, or PDF output.

## Persisted and transient boundaries

`RoofProjectDocumentV1` remains the only future persistence/revision boundary. It contains the canonical roof template, `RoofWindowFeature` objects, and the optional manual `BattenLayoutSpec`.

The following remain transient workbench state and must never be serialized:

- selection, hover, focus, and isolation;
- view preset and layer visibility;
- roof-window placement-tool state and placement feedback;
- selected derived batten-row ID;
- camera pan/zoom and fit requests;
- Inspector/toolbox visibility;
- detail-dock mode, pinning, active preview, and before/after view.

## Selection semantics

Selections use stable canonical or derived IDs:

- `roof` selects the roof editing context;
- prototype and physical member IDs preserve their existing fabrication semantics;
- `feature:roof-window-N` selects a persisted geometric opening;
- `batten:roof-plane:<side>:<row>` selects a deterministic derived row, not a persisted entity;
- joint/cut IDs select canonical fabrication operations.

Selection drives semantic visual states rather than isolated component colors: `hover`, `selected`, `related`, `warning`, and `muted`. A selected window coordinates its roof plane, nearest bounding rafters, collision members, canvas HUD, and Inspector. Selection is communicated through stroke weight/outline in addition to color.

## Creation-tool state

Roof-window creation is a transient tool transaction:

1. `beginRoofWindowPlacement()` switches to the `openings` preset and records no history.
2. Hover identifies a valid roof plane and projects a 780 × 1180 mm ghost in plane-local coordinates.
3. Clicking creates and clamps one `RoofWindowFeature`, selects it, opens the Inspector, and appends exactly one domain-history entry.
4. Escape or a second click on the active add tool cancels without changing the project document or history.

The ghost and highlighted plane are presentation projections only. Pixel coordinates are converted through the projected roof-plane basis; canonical geometry is always stored as millimetre `uMm/vMm` values.

## Interaction transaction contract

Direct manipulation follows `begin -> live canonical updates -> commit/cancel`:

- pointer-down snapshots the complete project document;
- pointer-move may update canonical world/plane values without creating intermediate history entries;
- pointer-up commits the snapshot as one Undo step;
- Escape/pointer-cancel restores the starting document;
- camera navigation, fit, selection, presets, and panel changes never enter project history.

Roof windows are dragged by their visible bodies. Arrow keys nudge plane-local values by 10 mm, Shift by 100 mm, and Alt by 1 mm. One key press is one undoable edit. Shortcuts are suppressed while typing in an input.

## Numeric draft/commit contract

Exact inputs use editable text drafts. Focus begins a transaction, intermediate text stays local (or uses the existing protected draft mechanism for legacy roof fields), Enter/blur commits one canonical edit, and Escape restores the prior canonical value. Empty, malformed, non-finite, or out-of-range text remains visibly invalid while editing and never corrupts the model.

This contract applies to roof-window size/position, batten section/gauge/offsets, and the existing major roof fields.

## Preset and context transitions

The four task presets remain `construction`, `openings`, `battens`, and `cuts`:

- selecting a roof window selects `openings`;
- selecting a derived batten row selects `battens`;
- selecting `roof` selects `construction`;
- activating a fabrication operation stores the previous meaningful preset and selects `cuts`;
- closing the detail dock restores that stored preset;
- K1/H1/J1 selection preserves an intentional openings/battens context.

The `Widok` popover owns layer visibility, labels, dimension density, and Fit. It is view state only.

## Roof-window geometry and collision semantics

The UI deliberately calls `widthMm/heightMm` the **geometric opening**. They are not nominal manufacturer size or a certified installation/structural opening. Product size, installation envelope, and manufacturer-specific clearances remain future concepts.

Collision tests project rafter/hip/jack axes into the selected roof-plane basis and expand the rectangle by the configured generic clearance plus half the physical member width. `resolveRoofWindowPlacement()` reports a discriminated success/failure result. Bay capacity is the clear face-to-face width; failure retains the original opening and reports required versus available width. Placement never silently resizes the opening.

## Batten derived-row identity

`resolveBattenLayout()` remains a pure `roof-math` projection. It validates finite positive section/gauge values and non-negative offsets before iteration. Each row uses a deterministic `batten:<plane>:<index>` ID. All visible segments of a split row share that ID, so one transient selection highlights the complete physical row and the Inspector can report plane, station, visible total length, and segment lengths.

Rows and segment selections are not stored in `RoofProjectDocumentV1`. Total batten length is the sum of the visible clipped segment lengths. Multiple openings and exact row/opening boundary intersections are covered by regression tests.

## Canvas and performance

The skeleton canvas supports cursor-centred wheel zoom, bounded pan, middle-button/background/Space drag, Fit (`F`), and double-click focus. Camera state does not affect domain data or Undo.

The roof/fabrication project resolver remains memoized by canonical roof-template dependencies. Window collision sets and batten resolver output are memoized by their relevant template/skeleton/feature/layout dependencies. Batten rows hold no individual React state and do not render permanent labels.

## Detail dock and responsive panels

The detail dock has explicit transient modes: `collapsed`, `working`, and `focus`. A fabrication operation opens `working`; Escape walks `focus -> working -> collapsed -> parent context`. The close action clears the active operation and restores the previous meaningful preset.

Desktop uses bounded left/right panels around a dominant canvas. Non-construction presets suppress the large lower fabrication/roof summary so they do not compete with active layer work. On narrow layouts the toolbox becomes a compact horizontal sheet and Inspector/detail use bottom-sheet presentation; when the detail dock is working or focused, the Inspector is hidden so only one major sheet occupies the viewport.

## Known limitations after V13

- Roof-window placement and bay fitting are geometric only; opening framing remains V14 research/work.
- No manufacturer product, nominal size, or installation-clearance database exists.
- Batten gauge is manual and is not validated against a covering product.
- Native touch hardware was not part of automated test coverage; pointer/touch behavior must be reported separately in browser QA.
- The canvas remains axonometric 2.5D SVG, not a full 3D renderer.
