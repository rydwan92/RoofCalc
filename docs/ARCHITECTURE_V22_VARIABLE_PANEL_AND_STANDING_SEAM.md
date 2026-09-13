# Architecture V22 — variable panels and standing seam

## Boundary

`@cieslacalc/roof-math` produces roof-plane-local polygons and opening geometry. `@cieslacalc/covering-core` owns covering placement. The pure `resolveVariablePanelPlane` kernel accepts one roof polygon, convex void polygons (or rectangular opening shorthand), effective width, alignment/offset and min/max run lengths. It contains no product, manufacturer, UI, price or persistence logic. The standing-seam strategy supplies a selected technical mode and translates generic length diagnostics. A later cut-to-length sheet strategy may call the same kernel while applying its own module, batten and transverse-joint rules.

## Coordinates, grid and geometry

`u` runs parallel to the eave, `v` up slope, both in canonical millimetres. One U origin is resolved for an entire plane: centered, from minimum U, or an exact manual offset. Nominal strips retain this grid across every opening and height. The kernel clips each strip to the roof polygon, then subtracts convex void polygons. Edge columns expose nominal and visible width separately. Connected visible polygon pieces are grouped into run candidates with deterministic column/run IDs. A full-width opening produces separate runs above and below it; a partial-width opening can leave a connected notched polygon. The kernel does not infer flashing or fabrication rules from that shape.

Each run records renderer-independent visible polygons, V bounds, the maximum V extent as geometric length, opening IDs, cause and length-limit issues. Short runs remain visible with `below-min-panel-length`. Overlong runs remain one run; the standing-seam adapter emits `transverse-joint-required`. An overlap field in a product snapshot is technical evidence only. Joint placement also needs a verified support, water-flow and installation-direction rule and is outside V22.

## Standing-seam strategy and quantities

`resolveStandingSeamLayout` requires an explicit selected mode for multi-mode snapshots and uses its effective width and pitch limit. A one-mode manual assignment stores its selected mode at creation. The result separates whole-assignment and per-plane column count, physical geometric run count, full/edge widths, opening-affected runs, total geometric length, min/max run lengths and exact-length groups. Invalid geometry and incompatible pitch suppress trusted quantity. Length-limit warnings produce a limited layout while preserving geometric run facts; they never become order quantities.

The quantity bridge has an ordinary covering piece row plus optional `totalLengthMm` and `lengthGroups`. It does not mix metres into a project-wide piece total or create timber rows. Groups use canonical run lengths and a 1e-7 mm numerical tolerance, never UI rounding. The schedule starts compact and exposes exact length groups on demand. No waste, offcut reuse, accessory, packaging, fastening or price is computed.

## Project and UI

`CoveringAssignmentSpec` stores the immutable technical snapshot, optional catalogue reference, selected mode, standing-seam intent and plane IDs. Columns, run polygons, lengths, quantities and active assignment selection are derived/transient and are not serialized. The normal plane-exclusivity resolver removes conflicted planes before layout/quantity resolution; standing seam adds no special ownership path. Canonical edits use the existing history mechanism; selecting an assignment or expanding schedule details creates no history.

The shared Covering workspace retains assignment selection, status, plane tabs, drawing frame, opening overlay and Inspector sheet. A strategy branch renders panel polygons and concise run facts. More than 1200 fragments use simplified technical linework while keeping exact domain results. Desktop and mobile use the same canonical model and numeric Inspector; Quick Calc is unchanged. Physical touch, sticky layout and viewport behavior still require live browser/device acceptance.
