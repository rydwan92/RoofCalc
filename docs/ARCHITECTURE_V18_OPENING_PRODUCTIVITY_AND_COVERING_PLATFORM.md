# Architecture V18 — Opening Productivity and Covering Platform

## Scope delivered

V18 advances two independent foundations without coupling them:

1. Opening productivity: duplicate placement, transient multi-selection, exact group alignment, previewed equal-gap distribution, and ergonomic drag snapping.
2. Covering platform: pure versioned technical contracts, project snapshots, compatibility diagnostics, and layout strategy seams for V19/V20.

## Opening interaction model

`selectedId` remains the primary/anchor selection. `selectedFeatureIds` is a transient workbench set and is never serialized. Shift-click and explicit checkbox controls update the same transient selection, so keyboard, pointer, and mobile workflows share behavior.

Duplicate starts a placement tool referencing the source opening. Starting or cancelling changes no canonical data and creates no history. One placement creates one new stable opening ID and one undo step. Width, height, clearance, and initial roof plane are copied; accepted framing is intentionally not copied because it is derived for a specific position and surrounding rafters.

Alignment and distribution are pure roof-plane-local proposals:

- lower edge: equal `vMm`;
- centre: equal `vMm + heightMm / 2`;
- upper edge: equal `vMm + heightMm`;
- distribution: equal clear eave-parallel gaps with the outer openings fixed.

Cross-plane and out-of-plane proposals return explicit rejected results. Applying a successful proposal is one canonical transaction. Drag snapping uses the same canonical references with a screen-derived tolerance and writes exact millimetre values; holding Alt disables snap.

## Covering model

`@cieslacalc/covering-core` has no React, DOM, server, database, translation, price, or supplier dependency. It defines:

- roof-tile installation modes with effective width and gauge ranges;
- modular fixed-sheet or cut-to-length geometry;
- standing-seam selectable effective widths and panel limits;
- versioned technical snapshots and optional catalogue revision references;
- assignment of a product snapshot to stable roof-plane IDs;
- structured compatibility issues;
- generic layout strategy and quantity-source boundaries without speculative layout math.

The current roof/template and composition contracts can remain in `timber-model` through V19/V20 without creating a cycle: `covering-core` receives neutral surface/opening shapes and does not import `timber-model`. If later non-timber modules need to own shared roof construction intent, a small neutral `roof-model` extraction may become desirable, but V18 has no evidence justifying a broad rename or migration.

The project schema normalizes legacy documents to `coverings: []`. Existing canonical mutations preserve assignments. Undo/redo snapshots include them, while workbench selection and any future catalogue browsing state stay transient.

## Deferred intentionally

- tile layout and quantities: V19;
- modular sheet and standing-seam layout and quantities: V20;
- catalogue API, technical revision workflow, variants and price resources: V21;
- cost engine and documents: after the covering engines;
- additional structural families and roof types: later construction wave.
