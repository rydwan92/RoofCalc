# Architecture V16 — Professional Workbench and Roof Build-up

## Status and boundary

Iteration 016 turns Builder into a task-oriented workbench and introduces the first geometric roof-surface/build-up projection. The canonical project remains the source of construction intent. Camera, selection, active task, layer subview, schedule perspective and mobile surface selection remain transient.

This iteration calculates geometry only. Membrane area and counter-batten/batten lengths are not purchase quantities and include no overlaps, laps, allowances, stock lengths, kerf, waste, products, prices, suppliers or structural verification.

## Dependency flow

```text
RoofProjectDocumentV1
  ├─ RoofTemplateSpec + RoofFeature[]
  │    └─ resolveRoofSurfaceGeometry -> gross/opening/net plane areas
  ├─ accepted composed RoofSkeleton
  │    └─ resolveCounterBattenLayout -> rafter-aligned visible axes
  └─ RoofBuildUp intent
       ├─ membrane selection
       ├─ counter-batten section/plane selection
       └─ batten layout

derived geometry -> quantity-core -> Builder drawing / inspectors / schedule
```

`roof-math` owns pure geometric resolution and has no React, DOM, persistence, translations or commercial data. `quantity-core` consumes resolved geometry and keeps surface rows (`mm²`) separate from linear build-up rows (`mm`). The web layer owns projection, formatting and interaction.

## Roof-plane surface contract

Every supported roof plane is resolved in its canonical local `(u, v)` basis and projected to world coordinates only through the existing roof-plane basis functions. The resolver returns deterministic plane IDs and ordering, local/world polygons, gross area, union opening area, net area, slope lengths and eave/ridge/hip boundary lengths.

```text
net plane area = gross plane polygon area - union(clipped roof openings)
```

Openings are clipped against their assigned plane. Overlapping openings are counted once by partitioning their axis-aligned boundaries into disjoint cells and summing clipped cell polygons. Invalid, outside, clipped and unknown-plane cases produce deterministic issues; non-finite values never enter a valid result.

The gable template resolves left/right planes. The hip template resolves left/right/front/rear planes. Surface selection is a semantic drawing selection (`surface:<roof-plane-id>`), not a new canonical entity.

## RoofBuildUp canonical intent

`RoofBuildUp` now optionally stores:

- membrane enablement and selected roof-plane IDs,
- counter-batten enablement, selected roof-plane IDs and rectangular section,
- the existing batten layout.

These optional fields remain compatible with earlier schema-version-1 documents. Derived rows, areas, warnings and UI state are never serialized.

## Counter-batten geometry

Counter-battens are derived from physical common-rafter placements in the accepted composed skeleton. Rafter segments created by accepted opening framing are grouped back to one physical source axis, preventing duplicate rows. Each axis is intersected with the roof-plane polygon and split around canonical roof windows. The output retains source member IDs, local/world segment endpoints, visible geometric length and section.

Gable resolution is supported. Hip counter-battens intentionally return `limited` with `unsupported-hip-counter-battens`; no generic compound-member alignment is guessed before its face/reference convention is defined.

## Quantity boundary

The schedule preserves three distinct meanings:

- structural timber: physical member instances, geometric axis length and volume where section is complete;
- linear roof build-up: counter-batten and batten visible geometric rows;
- surface roof build-up: membrane net geometric area.

Membrane is displayed in square metres but retained in square millimetres in the result. Counter-battens and battens remain linear geometry. No row is called an order quantity.

## Workbench interaction

Builder exposes five task presets: Construction, Openings, Layers, Cuts and Schedule. Layers adds Overview, Membrane, Counter-battens and Battens subviews. A compact context strip follows the active task. The legend is collapsed by default.

Switching task, layer subview, schedule perspective or mobile Drawing/Schedule surface does not create project history. Leaving Cuts closes cut-specific detail/focus state; leaving Openings clears placement/proposal state; schedule selections remain scoped to Schedule. Canonical build-up toggles and numeric edits remain undoable, and continuous section edits use one transaction.

The schedule module is lazy-loaded. On wide screens its drawing and schedule share the workspace; on narrow screens a local switch exposes one major surface at a time. Quick Calc remains smaller and does not expose Builder task navigation or material quantities.

## Invariants and deferred work

- One geometry engine drives drawing, inspectors and schedule.
- Areas are real roof-plane areas, never screen pixels or plan projection.
- Openings affect only their assigned plane and overlapping voids are not double-counted.
- Accepted composed framing drives counter-batten axes; proposal members do not.
- Transient workbench state never enters `RoofProjectDocumentV1`.
- Millimetres and square millimetres are canonical; display units are presentation only.
- Hip counter-battens stay explicitly limited until compound alignment is researched.
- Products, pricing, roll widths, laps, waste, procurement and structural checks remain deferred.
