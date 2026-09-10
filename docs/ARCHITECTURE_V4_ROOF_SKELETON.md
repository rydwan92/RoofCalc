# RoofCalc / CieślaCalc — Architecture V4: Reactive Roof Skeleton + Shared Parametric Core

## 1. Why this iteration exists

The current workbench successfully represents one fabricated rafter with wall plate/ridge/cuts. The next product leap is not another isolated calculator. It is a **reactive roof skeleton** that helps the user understand what is changing in the whole construction while still producing exact fabrication data for individual members.

The product must support two complementary ways of working:

- **Quick Calc** — fastest path to exact numbers.
- **Visual Builder** — visual construction/skeleton with direct manipulation.

Both must use the same canonical domain state and solver.

---

## 2. Product mental model

Think in three synchronized layers:

```text
ROOF TEMPLATE / SKELETON
        ↓
PARAMETRIC ASSEMBLY
        ↓
FABRICATION MEMBERS
```

### Roof template / skeleton
Explains the construction visually:
- wall plates,
- ridge,
- rafters,
- optional purlins,
- repeated rafter spacing,
- roof span/run/pitch,
- simple building footprint context.

### Parametric assembly
The exact geometric source of truth:
- supports,
- members,
- placements,
- constraints,
- intersections,
- joints.

### Fabrication member
What the carpenter cuts:
- exact member length,
- stock length,
- notches,
- plumb/end cuts,
- marking stations,
- ordered instructions.

A change in any editable parameter must flow through all three layers immediately.

---

## 3. Initial skeleton scope

Do not build full 3D or a full roof CAD.

For the next iteration, create a **2.5D/axonometric skeleton preview** for a simple symmetric gable roof template.

The skeleton should communicate:
- two wall-plate lines,
- ridge line,
- several repeated rafter pairs,
- optional intermediate purlin lines,
- building length / bay direction,
- rafter spacing.

This view is explanatory and interactive. Exact member fabrication remains in the existing side/profile drawing engine.

### Important
The skeleton is **derived** from the same template/assembly state.
It must not own separate math.

---

## 4. Template model

Introduce a simple roof-template state around the existing rafter assembly.

Conceptually:

```ts
interface GableRoofTemplateSpec {
  id: string;
  type: 'gable';
  buildingLengthMm: number;
  halfRunMm: number;
  pitchDeg: number;
  eaveOverhangMm: number;
  rafterSpacingMm: number;
  rafterSection: TimberSection;
  wallPlate: WallPlateSpec;
  ridge: RidgeSpec;
  intermediateSupports: SupportSpec[];
}
```

Derive:
- number of rafter bays/pairs,
- positions along building length,
- one canonical cross-section assembly used for fabrication,
- skeleton instance transforms.

Do not duplicate one full geometry object per repeated rafter if all share the same section and cross-section geometry. Prefer instancing/derived placement metadata.

---

## 5. Reactive parameter editing

Values should be editable in three ways where useful:

1. numeric input,
2. compact slider/scrubber for fast exploration,
3. direct manipulation handles on the drawing/skeleton.

Examples:

### Pitch
- numeric angle input,
- small slider/scrubber,
- optional draggable ridge-height handle later.

### Run/span
- numeric input,
- draggable wall/edge handle in builder.

### Purlin/support position
- numeric station,
- drag along permitted axis.

### Rafter spacing / building length
- numeric inputs,
- skeleton immediately adds/removes/repositions repeated rafters.

All direct-manipulation values must round/snap for usability but keep canonical precision internally.

---

## 6. Visual feedback principle

Every user edit should visibly answer:

> What changed in my construction?

Recommended feedback:
- changed element briefly highlighted,
- affected dimensions animate/update without page reload,
- skeleton member positions update immediately,
- fabrication results update simultaneously,
- invalid geometry is shown locally near the affected element rather than replacing the whole screen.

Respect reduced-motion preferences.

---

## 7. Workbench layout V4

### Desktop

```text
┌────────────────────────────────────────────────────────────────┐
│ Header: Quick Calc | Kreator        units / reset / language   │
├─────────────┬──────────────────────────────────────┬───────────┤
│ Toolbox     │                                      │ Inspector │
│ collapsible │          MAIN VIEW                   │ context   │
│             │                                      │           │
│ Geometry    │   Skeleton / fabrication context     │ exact     │
│ Members     │                                      │ values    │
│ Supports    │                                      │           │
├─────────────┴──────────────────────────────────────┴───────────┤
│ RESULT RAIL: length | stock | cuts | selected joint | warning │
└────────────────────────────────────────────────────────────────┘
```

Do not add many permanent tabs.

The main view can switch context through one compact view control:
- `Szkielet`
- `Krokiew`

`Detal` remains contextual after selecting a joint/cut.

### Mobile

Default to Quick Calc.

Builder mobile:
- large drawing/skeleton,
- bottom action bar,
- collapsible bottom-sheet inspector,
- no permanent left/right columns,
- selected joint detail shown inline or in bottom sheet.

---

## 8. Toolbox behavior

The toolbox is a catalog of **real implemented domain operations/entities**, not navigation pages.

Initial Builder groups:

```text
GEOMETRIA
- Dach / połać

DREWNO
- Krokiew

PODPORY
- Murłata
- Płatew (+)
- Kalenica

UKŁAD
- Długość budynku
- Rozstaw krokwi
```

Later:
- jętka,
- kleszcze,
- słup,
- zastrzał,
- hip/valley members.

If a feature has no actual domain implementation, do not present it as active.

---

## 9. Selection and contextual editing

Every drawable domain object should expose a stable semantic selection ID.

Selection behavior:
- click/tap member/support → inspector edits it,
- click/tap cut/notch → show joint detail lens,
- click empty canvas → clear local selection / return to roof context,
- selected object has obvious highlight,
- keyboard-accessible selection where practical.

The same selected entity should be reflected in:
- skeleton,
- side/profile drawing,
- inspector,
- fabrication result rail.

---

## 10. Detail lens

A user should not need a top-level `Detal` mode.

Selecting a cut should reveal a local magnified drawing with:
- seat length,
- perpendicular depth,
- plumb line,
- relevant datum station,
- useful angle,
- support outline.

Actions:
- `Powiększ`
- `Wróć do konstrukcji`

The detail uses the same exact domain geometry.

---

## 11. Repeated roof skeleton geometry

For a simple symmetric gable roof:

Coordinate concept:
- X = building width/run direction,
- Y = building length/ridge direction,
- Z = vertical.

For one side with half-run `r` and pitch `θ`:

```text
ridgeHeight = r * tan(θ)
```

Rafter-pair placements occur along Y according to the spacing layout.

Do not perform fabrication math in 3D. The skeleton renderer derives visual 3D/axonometric points from template geometry; fabrication remains based on the canonical 2D cross-section/member model.

A lightweight axonometric SVG projection is preferred before adding Three.js.

Example projection approach:

```text
world XYZ
   ↓
axonometric/isometric projection
   ↓
SVG XY
```

This makes the skeleton lightweight, printable and dependency-free.

---

## 12. Rafter spacing resolver

Introduce a small pure resolver that can answer:
- building length,
- preferred/max spacing,
- number of bays/rafters,
- actual equalized spacing when requested.

Support two explicit modes later:

```text
fixed-spacing
fit-evenly
```

For this iteration one mode may be primary, but the data model must make the choice explicit.

Avoid ambiguous automatic changes.

---

## 13. Result rail

Replace large scattered result blocks with a concise persistent result rail in Builder.

Show only the most useful live values:
- rafter/fabrication length,
- minimum stock,
- selected joint seat/depth,
- ridge cut angle,
- number of repeated rafters/pairs when skeleton context is active.

Clicking a result focuses the corresponding geometry/detail.

---

## 14. Quick Calc V4

Quick Calc should become substantially simpler than Builder.

Default visible fields:
- run/half span,
- pitch,
- overhang.

Main result immediately:
- rafter length,
- rise,
- stock length.

Expandable `Cięcia i przekrój`:
- rafter section,
- wall plate,
- seat length,
- ridge thickness.

Compact visual:
- real timber profile,
- wall-plate notch,
- ridge cut.

Actions:
- `Trasowanie`
- `Otwórz kreator`

Do not expose Builder-only complexity by default.

---

## 15. Geometry validation UX

Do not blank the whole drawing whenever one field becomes temporarily invalid during editing.

Prefer:
- preserve last valid drawing ghosted if safe,
- mark the affected control,
- show concise local error,
- recompute immediately when valid again.

Never show NaN/Infinity.

---

## 16. Libraries

Keep SVG as primary renderer.

Allowed if justified:
- `react-resizable-panels` for resizable desktop regions,
- a small utility for gestures only if native Pointer Events become unnecessarily complex.

Do not introduce Three.js in this iteration.
Do not adopt a canvas library as domain state.

---

## 17. Future architecture path

Once this skeleton/template model is proven, future features should fit naturally:

```text
Gable roof
  ↓
+ purlins
  ↓
+ collar ties / jętki
  ↓
+ posts/struts
  ↓
hip/valley templates
  ↓
jack rafters
  ↓
whole-project material/fabrication lists
```

The goal is to add domain entities/templates, not build unrelated calculator pages.

---

## 18. Success criteria for the next iteration

The next implementation should prove:

1. Quick Calc is visibly simpler and faster than Builder.
2. Builder has a collapsible toolbox and contextual inspector.
3. A simple roof skeleton view exists and updates reactively.
4. Building length and rafter spacing alter the skeleton immediately.
5. Pitch/run/overhang changes affect skeleton + fabrication data together.
6. Existing purlin can be added/moved with direct visual feedback.
7. Selecting a notch opens contextual detail without a permanent Detail tab.
8. Quick Calc and Builder share one canonical model/solver.
9. No separate formulas are introduced in view components.
10. Desktop and 360px mobile layouts remain usable.
