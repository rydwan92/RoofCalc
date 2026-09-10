# Common-rafter assembly 3.0.0

Iteration 003 implements two editors over one domain pipeline:

`AssemblySpec → resolveAssembly → ResolvedAssembly → createFabricationPlan → DrawingModel → SVG / PL/EN presentation`.

## Editable model and scope

All lengths and positions are millimetres, angles are degrees at the domain boundary. No intermediate rounding. `AssemblySpec` contains roof run/pitch/overhang, a member ID and section, a list of typed supports, and a symmetric ridge terminal. Supports carry a stable ID, width/height, `horizontal-from-wall` placement and a seat-notch preference controlled by either horizontal seat length or normal depth. There are no pixels, translated instructions or SVG objects in the editable model.

The UI permits one wall plate and zero/one purlin. The solver accepts any non-overlapping list of purlins; a three-support test demonstrates generalization without another calculator. No extra-member, hip, valley, CAD, 3D, structural, persistence or export features are implemented.

## Placement and contact contract

World X points toward the ridge; world Y points upward. The plate's left face is X=0. Let pitch be θ, wall seat length s₀ and member normal depth d. The approved version-2 reference remains:

`bottom: y=(x−s₀)tanθ`.

The upper edge is the parallel line offset by d in the normal direction. The member frame originates at the eave/bottom intersection, with unit tangent `(cosθ,sinθ)` and normal `(−sinθ,cosθ)`. Rigid world/member transforms preserve distances.

For **every** support at left-face X=x with horizontal seat s:

1. Intersect the lower edge with the vertical at x+s to find the toe.
2. Place the horizontal support contact plane through that toe.
3. Intersect this plane and the lower edge with the vertical at x to find the heel-seat and heel-bottom points.
4. Transform those three points into member coordinates and remove their triangle from the retained material polygon.
5. Intersect the upper edge with the same heel/toe verticals to obtain marking datums.

The wall plate and purlin use the **same `resolveSupportJoint` function**. A purlin's contact elevation follows the member automatically. It is not an independently specified fixed-elevation beam. Changing support height changes its physical block extent below the contact plane; it does not shift its top plane. Width and seat length are distinct.

For both kinds of support:

`normalDepth = s sinθ`, `verticalHeelHeight = s tanθ`, `remainingDepth = d − normalDepth`, `removedRatio = normalDepth/d`.

When normal depth controls the joint, `s = normalDepth/sinθ`. Seat must fit the support width and the notch must remove strictly less than the member depth. The ratio is descriptive, not a structural safety threshold.

Ridge face X=`run−thickness/2`. Both retained edges end at that vertical. Cut angle to member axis is `90−θ`. Zero ridge thickness produces a reference line instead of a zero-width polygon. Ridge block extension 70 mm below the cut remains explicitly schematic (`visualExtentOnly`); wall/purlin heights are real editable model dimensions.

## Lengths, datums and fabrication

Dynamic IDs include `datum:eave-top`, `datum:wall-plate-1-heel`, `datum:wall-plate-1-toe`, `datum:purlin-1-heel`, `datum:purlin-1-toe`, `datum:ridge-face`. Each datum has an owning entity, semantic role, member edge and member-local point. Stable identity does not depend on support ordering or display labels.

The drawing/presentation engine assigns A, B, …, Z, AA… from the ordered datum list. These are only labels. Version 1/2 contracts retain their historical A–D outputs; the launched version-3 plan has no fixed-letter references. End cuts use `fromDatumId` and `stationMm`.

From the eave/top datum to a support heel at horizontal X=x, the marking distance is `(x+overhang)/cosθ`. Toe station uses x+s. These are top-edge stations; the toe is a vertical reference projection, not an extra plumb notch cut.

Top-edge end-to-end length = `(run−thickness/2+overhang)/cosθ`. Minimum rectangular stock = top-edge length + `d tanθ`. Moving the purlin changes notch coordinates, support elevation, stations and spacing between joints. It does **not** change the overall stock length while member endpoints/section remain fixed.

`FabricationPlan` contains stock/section/reference data, ordered joints, end cuts, dynamic station chain and discriminated steps (`mark-plumb`, `mark-seat`, `check-depth`). React translates these data into PL/EN. Instructions reference the selected datum and the top edge explicitly. No kerf, trimming, defect or production allowances are added.

## Validation, dragging and numeric entry

One wall plate at X=0 is required. IDs are unique; support IDs have the `support:` prefix. Supports cannot overlap and need at least 1 mm horizontal separation. Their full widths must remain strictly before the near ridge face.

For the optional UI purlin of width w, drag limits are:

`minX = plateWidth + 1`, `maxX = run−ridgeThickness/2−w−1`.

Add is disabled when this interval is empty. Its initial position is the interval midpoint. Initial width/height are 140/180 mm; initial seat is the smaller of 90 mm and the resolved wall seat, so a shallow member does not receive an invalid default cut.

The numeric inspector preserves exact entered values and validates instead of silently clamping or snapping them. Invalid input remains editable but all stale geometry/fabrication is hidden. Errors link to the relevant inspector. mm/cm/m switching reformats display without mutating canonical values.

Drag flow: Pointer Events → inverse SVG screen matrix (CSS scaling, viewBox zoom, letterboxing, scroll offset) → inverse fit projection → world X in mm → subtract original grab offset → snap/clamp → update `AssemblySpec`. The projection is frozen during the gesture to prevent auto-fit feedback. Pointer capture maintains the gesture outside the polygon; a second pointer is ignored. Pointer cancellation, lost capture and Esc restore the exact starting position. Pointer-up commits the last preview value. Arrow keys move 1 mm, Shift+arrow 10 mm.

Snap grid is 1/5/10 mm according to mm per screen pixel (thresholds 2/8). Legal endpoints and the span midpoint attract within 7 screen pixels, capped at 40 mm; otherwise the grid applies. The live guide and dimension show the canonical position. Pixels exist only transiently in the view transform/gesture state.

## Views and annotation layout

SZYBKIE / KREATOR are the primary mode controls. Quick starts with run, pitch and overhang; timber/support settings are disclosed on demand. It shows immediate results and a compact reactive sketch. Opening Builder preserves the same model, including a purlin when returning to Quick.

Builder uses toolbox / canvas / inspector. Tools collapse to icons on desktop; mobile uses a wrapping toolbar and a non-modal bottom sheet, initially closed on entering Builder and opened by selection. Selecting a cut displays a contextual inset; Enlarge detail focuses the main canvas, with back/Esc returning to the assembly. Detail polygons are clipped from the same retained profile, not recalculated decorative shapes.

Dimensions carry `primary` / `support` / `joint` intent and priority. The drawing engine assigns lanes from projected spans and label footprints. Disjoint spans can share a lane. It expands fit bounds to reserve room for annotations; no A–D-specific offsets are emitted by V3. Compact drawings retain primary dimensions; joint detail shows its relevant dimensions, while the full station information remains in the fabrication plan. Basic pairwise lane allocation is not a general CAD annotation engine.

## Verification

Tests cover hand references, V2 regression at 1/30/35/80°, retained polygon area, horizontal contacts, coordinate round trips, independent wall notch, stable IDs, multiple-support ordering, depth-controlled seats, range endpoints, rejected overlap/IDs/full-depth cuts, zero overhang/ridge, purity, versioned registry, dimension fitting and collision lanes, inverse screen matrices, snapping, same-model modes, units, exact numeric input, error recovery, add/remove, keyboard selection/movement, contextual detail and simulated mouse/touch pointer sequences.

jsdom and numerical annotation tests do not verify native touch delivery or browser CSS layout. Requested Browser returned unavailable and the browser inventory was empty in this session; desktop/360px visual QA remains explicitly pending.
