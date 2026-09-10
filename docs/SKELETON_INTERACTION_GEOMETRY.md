# Skeleton Interaction Geometry

## Identity

`member:rafter-1` is one fabrication prototype. Every visible common rafter is a physical `instance:rafter-pair-N:left|right` with its own station and side. Editing the prototype changes all instances; per-instance fabrication overrides are not implemented.

Purlin rails are physical left/right instances but share their canonical `support:purlin-N` selection because they describe one symmetric support.

## Solid 2.5D members

`createTimberPrismFaces()` converts a 3D member axis and its actual section into six rectangular faces. Rafters use a width direction along building Y and a normal depth direction in the roof plane. Wall plates, purlins and ridge use X/Z section directions around their building-Y axis.

`projectTimberPrismFaces()` applies the shared axonometric projection and stable face sorting. It is a renderer-neutral explanatory model, not a structural 3D/CAD model.

## Direct controls

All values are written back to the canonical template in millimetres/degrees:

- Ridge handle: projected vertical rise maps to `pitchDeg` through `atan(rise / halfRun)` and snaps to 0.5 degrees.
- Span handle: projected wall axis maps to `halfRunMm`, snaps to 10 mm and clamps to the furthest purlin/ridge envelope.
- Building-length handle: projected ridge axis maps to `buildingLengthMm` and snaps to 10 mm.
- Purlin handle: projected roof-slope axis maps to its horizontal `xMm`, snaps to 10 mm and clamps to the nearest free support segment.

Typed inputs retain exact values and do not apply drag snapping. Camera pan/zoom is local UI state and never changes the template.

## Purlin placement

`purlinPlacementSegments()` derives legal left-face intervals from the wall plate, ridge face and all other purlins. `addPurlin()` allocates the largest free segment with a sequential stable ID. The generic assembly solver resolves every resulting seat notch and fabrication station in order.

## Edit history

The Zustand store keeps up to 40 canonical-template snapshots. A pointer gesture begins a transaction, updates the live template without adding intermediate history entries, then commits one snapshot on pointer-up. Escape/pointer cancel restores the start snapshot. Invalid text drafts, unit/language changes, selection and viewport moves are not domain history. Reset returns to the example and clears history.