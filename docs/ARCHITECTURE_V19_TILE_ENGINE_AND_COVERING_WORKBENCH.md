# Architecture V19 — Tile Engine and Covering Workbench

Status: implemented in Iteration 019 on 2026-09-12.

## Scope and dependency direction

V19 adds the first covering calculation without moving commercial data into geometry:

`ProjectDocument covering intent → roof-math surfaces/battens → covering-core layout → quantity-core schedule → web projection`

`covering-core` consumes neutral plane-local polygons, openings, resolved batten rows, and an immutable technical snapshot. It does not import React, the DOM, catalogue services, prices, or manufacturer-specific rules. `roof-math` remains independent of covering products.

## Backward-compatible technical schema

`RoofTileInstallationMode` gains optional `coursePattern`:

- `layers[]` identifies one or more tile layers attached to every batten row and gives each layer a normalized horizontal cover-width offset;
- `battenRowOffsetCycle[]` repeats normalized offsets across consecutive resolved batten rows.

Fractions are finite and constrained to `0 <= offset < 1`. Straight, alternating-row, and two-layer same-batten systems are data configurations, not engine branches. The field is optional so V18 snapshots remain valid. A roof-tile snapshot without it produces the explicit incomplete issue `tile-placement-pattern-required`; the engine never guesses a pattern.

## Canonical layout intent

The covering assignment may store `RoofTileLayoutIntent` with `centered`, `from-u-min`, or `manual` horizontal alignment. Manual alignment stores offsets by stable roof-plane ID in canonical millimetres. The default projection for an older assignment with no intent is deterministic centered alignment. Only intent and technical input are serialized; derived courses, positions, fragments, counts, selection, and active plane are not.

## Batten-aware vertical geometry

Resolved physical/geometric battens are the sole vertical course source. The Tile Engine does not reproduce the eave/ridge stepping algorithm and does not manufacture rows from a nominal gauge. It sorts rows per plane by `stationVMm`, validates their actual adjacent spacings against the selected installation mode, and partitions the plane into course cells at adjacent-row midpoints. Multiple pattern layers may share one row.

No enabled/assigned battens yields `batten-layout-required`; a single row yields `batten-course-spacing-required`; an actual spacing outside the mode range is incompatible. This keeps the tile result reactive to canonical batten edits and prevents two batten systems from diverging.

## Plane-level horizontal grid

One infinite cover-width grid is established per roof plane. Centered alignment distributes the residual width symmetrically; `from-u-min` anchors at the plane's minimum U coordinate; manual alignment adds the stored plane offset. Row-cycle and layer offsets shift that same grid by normalized cover-width fractions. Openings never restart columns, so a column identity remains coherent on both sides of a roof window.

## Position and clipping semantics

A `TilePosition` represents one required geometric covering position, not a purchase recommendation and not necessarily one reusable physical offcut. Each position retains its nominal U/V cell and one or more visible polygons. The pure resolver clips cells to gable rectangles or hip triangles/trapezoids and subtracts axis-aligned canonical openings.

Classification is explicit:

- `full` — the visible cell equals the nominal coverage cell;
- `cut-roof-edge` — clipped by eave, ridge, verge, or hip boundary;
- `cut-opening` — clipped by an opening but remains connected;
- `split-by-opening` — opening subtraction leaves multiple disconnected visible fragments.

Fully removed positions are absent. Stable IDs derive only from assignment, plane, batten-row index, layer, and plane-level column index. Results and issue ordering are deterministic and reject non-finite geometry.

## Quantities and declared-consumption reference

Only a `resolved` layout can emit a trusted `CoveringQuantitySource`. Its unit is `piece` and its quantity is the number of geometric tile positions across assigned planes. `quantity-core` aggregates these into a separate `coveringRows` section; it does not mix pieces with timber length, timber volume, or build-up area/length.

When a mode declares units per square metre, the engine also reports a reference range computed from the assigned net surface area. This is a cross-check alongside the geometric position count, not a replacement for the layout. No waste percentage, breakage, accessories, offcut optimization, packages, price, tax, discount, stock, or purchase recommendation is implied.

## Workbench projection

Builder adds a dedicated `Pokrycie / Covering` task; Quick Calc remains unchanged. A manual product can be created immediately with one selected mode, edited using exact display-unit-aware inputs, assigned to planes, and aligned. Compatibility issues link back to the existing batten settings. The plane-local SVG shows battens, full/cut fragments, and openings from the shared derived result. The active plane and all view state remain transient.

The workspace/editor is lazy-loaded. Above 1,200 visible fragments, the UI switches to course-line rendering while retaining exact engine totals and schedule output. Responsive layout stacks canvas and editor and keeps every essential action click/touch accessible.

## Snapshot and future catalogue boundary

A manual edit changes the project's current technical snapshot through one canonical history commit. A future catalogue selection will still copy an immutable technical snapshot plus optional `catalogRef`; refreshing a referenced revision must be an explicit future action. V19 adds no catalogue browser or manufacturer conditional.

The same neutral layout/quantity contracts are intended for V20 modular sheet, cut-to-length sheet, and standing-seam strategies. Those engines must not reuse roof-tile assumptions about rows or pieces.

## Explicit limitations

V19 supports geometric roof-tile positions for the current gable and hip surface topologies and rectangular roof-window openings. It does not calculate structural safety, fastening, accessories, specialized verge/ridge/ventilation/half tiles, dormers or chimneys, offcut reuse, optimization, ordering, stock, prices, taxes, exports, or metal covering layouts.
