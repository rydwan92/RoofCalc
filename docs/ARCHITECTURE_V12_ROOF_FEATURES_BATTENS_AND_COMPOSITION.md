# RoofCalc / CieślaCalc — Architecture V12: Roof Features, Battens and Composition

## Status

This document records the implementation that shipped in commit `f819085`. It is an audit of the actual V12 code, not a claim that every item from the V12 prompt was completed.

## 1. Canonical composition boundary

`RoofProjectDocumentV1` remains the schema-versioned persistence boundary and now contains:

```text
project.roof       RoofTemplateSpec
project.features   RoofFeature[]
project.buildUp    RoofBuildUp
```

The only V12 feature variant is `RoofWindowFeature`. The only build-up projection is `BattenLayoutSpec`. Selection, view preset, visibility, drawer state, camera, hover and pointer state remain transient and are not serialized. Older schema-version-1 documents without `features` or `buildUp` are normalized to empty values.

## 2. Roof-plane coordinates

Every supported roof plane has a renderer-neutral orthonormal basis:

- `u` is parallel to the eave;
- `v` runs uphill on the roof plane;
- the origin, unit axes, normal and local boundary polygon are derived from `RoofTemplateSpec`;
- local/world projection is pure and independent of SVG pixels or camera state.

The implementation covers left/right gable planes and left/right/front/rear planes of the regular equal-pitch hip template. A roof window stores only `roofPlaneId`, canonical millimetre size and canonical plane-local position.

## 3. Roof-window feature

```ts
interface RoofWindowFeature {
  id: string;
  kind: 'roof-window';
  roofPlaneId: string;
  widthMm: number;
  heightMm: number;
  position: { uMm: number; vMm: number };
  clearanceMm?: number;
}
```

`clampRoofWindow()` keeps the feature rectangle inside the selected plane. `createDefaultRoofWindow()` creates a `780 × 1180 mm` geometric rectangle near the plane centre. The store assigns stable `feature:roof-window-N` IDs and records add, remove, numeric update, drag and place-between changes in canonical document history.

V12 creates the window immediately on the default left plane. Plane choice remains an Inspector edit; there is no transient click-a-plane creation tool yet.

## 4. Collision and placement semantics

`resolveRoofFeatureCollisions()` projects structural member axes into the selected plane and reports geometric intersections with the window rectangle as structured `FeatureCollision` records. It covers K1, H1 and J1 member kinds when they lie on the selected plane.

`placeRoofWindowBetweenRafters()` finds the nearest consecutive K1/J1 axis pair whose axis distance can contain the requested width plus configured geometric clearance, then centres the feature between those axes. It does not resize the feature and returns no proposal when no bay fits.

These results are geometric diagnostics only. V12 does not design headers/trimmers, verify structure or apply manufacturer installation clearances.

## 5. Batten/build-up dependency

`BattenLayoutSpec` is canonical manual input. `resolveBattenLayout()` consumes the solved roof-plane basis plus roof features and returns deterministic derived rows:

```text
RoofTemplateSpec + BattenLayoutSpec + RoofFeature[]
  -> ResolvedBatten[] + totalLengthMm
```

Rows use deterministic `batten:<roof-plane-id>:<ordinal>` IDs, but they are not persisted entities. Window intervals split affected rows and total length is the sum of visible segments. Battens never feed the roof or timber solver.

V12 renders rows in the `Łacenie` preset and exposes manual width, height, gauge and eave offset. It does not select individual rows or implement product-specific gauge/first/last-row rules.

## 6. View semantics

The transient preset union is:

```text
Konstrukcja | Otwory | Łacenie | Cięcia
```

The projection policy controls roof planes, primary/secondary structure, roof features, battens, cut markers, datums, dimensions and manipulation handles. Advanced visibility is transient. In the batten preset the structure is muted; in the openings preset unrelated repeated structure is reduced.

The implemented V12 visual meanings are:

- selected — current semantic selection;
- related — connected/context geometry;
- muted — background context;
- feature — roof-window geometry;
- warning — a window/member geometric collision;
- batten — derived roof build-up row.

## 7. Actual V12 limitations found by the V13 preflight audit

- `PROJECT_BLUEPRINT.md` still named V11 as current and this architecture document was missing.
- Baseline lint failed because `SkeletonMember3D` was imported but unused in `roof-features.ts`.
- One legacy UI test still expected the obsolete visible purlin slider removed by V12; the suite passed 282 of 283 tests.
- Window creation was immediate on a default plane, not a cancellable placement tool.
- Window and batten number fields committed on every valid keystroke, so one intended edit could produce several Undo entries.
- The UI called the rectangle a window size rather than explicitly an `Otwór geometryczny`.
- Window drag lacked keyboard nudge, bay emphasis, a useful HUD and a detailed failure/success result for place-between.
- Intersected members did not receive a coordinated warning state on the canvas.
- Batten rows were not selectable and their deterministic IDs were not represented in workbench selection state.
- Batten configuration lacked a ridge-offset field, draft-preserving inline validation and a top-of-canvas task summary.
- The `Widok` control lacked a labels option and a Fit action; zoom did not preserve the world point under the cursor; Space-pan, Fit shortcut and object double-click focus were absent.
- The Detail Drawer still used open/collapsed plus pin rather than explicit collapsed/working/focus states.
- V12 did not complete the requested desktop density/mobile one-sheet-at-a-time pass or record browser QA.

These are the starting defects and scope of Iteration 013. They do not invalidate the V12 domain foundation.

## 8. Explicit exclusions

V12 added no dormers, chimneys, opening framing, structural calculations, covering catalogue, manufacturer rules, prices, estimates, auth/database, PDF or full 3D/CAD.
