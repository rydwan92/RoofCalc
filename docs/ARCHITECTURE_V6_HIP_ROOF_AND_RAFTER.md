# RoofCalc / CieślaCalc — Architecture V6: Hip Roof + Hip Rafter Fabrication

## 1. Why V6 exists

Iterations 004–005 proved the shared parametric model, reactive gable skeleton, solid 2.5D members, multiple purlins, direct manipulation, viewport controls and local undo/redo.

The next architectural milestone is the first **new roof/member family**: the regular equal-pitch hip roof and its diagonal hip rafter (`krokiew narożna`).

V6 must not become a separate legacy-style calculator bolted beside the current app. It must prove that RoofCalc can support multiple roof templates and multiple fabrication prototypes inside the same workbench.

The product model becomes:

```text
RoofTemplateSpec
  ├── GableRoofTemplateSpec
  └── HipRoofTemplateSpec
          ↓
Resolved roof geometry
          ↓
Skeleton member instances
          ↓
Fabrication prototypes
          ├── Common rafter K1
          └── Hip rafter H1
```

Quick Calc and Builder still share the same pure geometry/domain code.

---

## 2. V6 scope

Implement a **regular rectangular hip roof with equal pitch on all four roof planes**.

Supported in V6:

- rectangular footprint,
- equal pitch,
- uniform horizontal overhang,
- common rafters,
- four physical hip-rafter instances,
- one shared hip-rafter fabrication prototype,
- ridge when the building is longer than its span,
- square/pyramidal case where theoretical ridge length becomes zero,
- existing wall plate / purlin logic for the common-rafter cross-section,
- hip-rafter plan/elevation/cut calculations,
- hip ridge deduction,
- hip plumb/seat layout angle,
- hip cheek/side-cut angle,
- hip backing/bevel angle,
- interactive hip-roof skeleton,
- contextual opening of H1 fabrication information.

Explicitly out of V6:

- irregular/unequal pitches,
- non-rectangular footprint,
- valley rafters,
- jack-rafter fabrication and cut lists,
- dormers/openings,
- structural capacity verification,
- full 3D/Three.js.

Do not draw fake active jack rafters merely to make the skeleton look fuller. V7 can add them from a real jack-rafter solver.

---

## 3. Roof template union

Preserve the existing gable template and introduce a roof-template union instead of branching UI math.

Conceptually:

```ts
export type RoofTemplateSpec =
  | GableRoofTemplateSpec
  | HipRoofTemplateSpec;

export interface HipRoofTemplateSpec {
  id: EntityId;
  type: 'hip';
  buildingLengthMm: number;
  halfSpanMm: number;
  pitchDeg: number;
  eaveOverhangMm: number;
  rafterSpacing: RafterSpacingSpec;
  commonRafterSection: TimberSection;
  hipRafterSection: TimberSection;
  wallPlate: SupportSpec;
  ridge: {
    id: EntityId;
    thicknessMm: number;
  };
  intermediateSupports: SupportSpec[];
}
```

Names can differ, but the domain distinction must exist.

### Initial orientation rule

For V6, treat `2 * halfSpanMm` as the short building dimension and `buildingLengthMm` as the long/ridge direction.

Require:

```text
buildingLengthMm >= 2 * halfSpanMm
```

Equality is the square/pyramidal hip case with zero theoretical ridge length.

Do not silently swap dimensions in V6. If later automatic orientation is desired, add it as an explicit model behavior.

---

## 4. Hip roof plan geometry

Let:

```text
r = halfSpanMm
e = eaveOverhangMm
θ = common roof pitch
L = buildingLengthMm
```

For equal pitch and square corners:

```text
rise = r * tan(θ)
ridgeLength = L - 2r
```

For a non-square rectangle (`ridgeLength > 0`), using current world convention:

```text
X = building width direction
Y = building length / ridge direction
Z = vertical
```

wall corners:

```text
(-r, 0, 0)
(+r, 0, 0)
(-r, L, 0)
(+r, L, 0)
```

ridge endpoints:

```text
(0, r, rise)
(0, L-r, rise)
```

four theoretical hip centerlines connect each building corner to its nearest ridge endpoint.

For a square footprint (`L = 2r`) both ridge endpoints coincide and the roof becomes a pyramidal hip.

---

## 5. Hip rafter fundamental geometry

A regular hip rafter runs at 45° in plan.

For common run `r` and common pitch `θ`:

```text
commonRise = r * tan(θ)
hipPlanRun = r * sqrt(2)
hipSlopeAngle = atan(commonRise / hipPlanRun)
```

Equivalent:

```text
hipSlopeAngle = atan(tan(θ) / sqrt(2))
```

The theoretical centerline/arris length from wall corner to ridge-center reference is:

```text
hipLineLength = sqrt(hipPlanRun² + commonRise²)
              = r * sqrt(2 + tan²(θ))
```

For uniform horizontal overhang `e` on both meeting eaves:

```text
hipTailPlanRun = e * sqrt(2)
hipTailLineLength = e * sqrt(2 + tan²(θ))
```

These values are canonical geometry, not presentation shortcuts such as the traditional rounded 17-inch framing-square convention.

The UI may optionally display the traditional `17` reference later, but calculations must use exact `sqrt(2)`.

---

## 6. Hip layout / cut angles

V6 should calculate and name angles explicitly to avoid ambiguous "saw angle" terminology.

Let:

```text
p = hipPlanRun per unit common run = sqrt(2)
a = hip line length per unit common run = sqrt(2 + tan²(θ))
v = tan(θ)
```

### Hip slope angle

Angle of hip centerline above horizontal:

```text
hipSlopeDeg = atan(v / p)
```

### Plumb line angle relative to hip member axis

For marking a vertical/plumb line in the hip elevation:

```text
plumbToMemberDeg = 90° - hipSlopeDeg
```

### Seat/level line angle relative to hip member axis

```text
seatToMemberDeg = hipSlopeDeg
```

### Hip cheek / side-cut / top-face layout angle

Traditional square-roof geometry gives:

```text
cheekAngleDeg = atan(p / a)
```

Using exact terms:

```text
cheekAngleDeg = atan(
  sqrt(2) / sqrt(2 + tan²(θ))
)
```

This is the angle commonly represented by the hip/valley side-cut setting on framing-square tables.

### Hip backing / bevel angle

```text
backingAngleDeg = atan(v / a)
```

or:

```text
backingAngleDeg = atan(
  tan(θ) / sqrt(2 + tan²(θ))
)
```

This corresponds to the hip backing/bevel geometry for a regular equal-pitch hip.

### Important UI rule

Never expose only labels such as:

```text
Kąt 1
Kąt 2
```

Show:

- Nachylenie krokwi narożnej,
- Linia pionowa względem osi krokwi,
- Kąt cięcia bocznego / trasowania,
- Kąt fazowania / podcięcia grzbietu,

with a small visual glyph/detail indicating where the angle is measured.

---

## 7. Reference vector for regression tests

Use a deterministic reference case because it closely matches the original inspiration for RoofCalc:

```text
common run = 1000 mm
common pitch = 30°
overhang = 0
ridge thickness = 0
```

Expected approximately:

```text
common rise              = 577.350269 mm
hip plan run             = 1414.213562 mm
hip line length          = 1527.525232 mm
hip slope                = 22.207654°
plumb-to-member angle    = 67.792346°
cheek/layout angle       = 42.794137°
backing/bevel angle      = 20.704811°
```

Do not round intermediate values.

This test vector is especially valuable because the original reference app displayed values around:

```text
base ≈ 1.41
length ≈ 1.52
hip pitch ≈ 22.2°
bevel ≈ 20.7°
layout ≈ 42.8°
```

RoofCalc should calculate these from exact geometry while presenting better definitions and drawings.

---

## 8. Ridge deduction for a regular hip

When a vertical ridge board of physical thickness `t` exists and the hip approaches its end at 45° in plan, distinguish the theoretical centerline length from the physical ridge-face length.

For the V6 symmetric convention:

```text
ridgePlanDeduction = t / sqrt(2)
```

This is half the 45° diagonal thickness effect in plan.

Convert to distance along the sloping hip axis:

```text
ridgeAxisDeduction = ridgePlanDeduction / cos(hipSlopeAngle)
```

Then:

```text
hipLengthToRidgeFace = theoreticalHipLineLength - ridgeAxisDeduction
```

Document this convention carefully and add independent regression tests.

Do not scatter ridge deductions through React or SVG code.

---

## 9. Hip rafter domain model

Do not force diagonal members into assumptions that only fit common rafters.

Add explicit types such as:

```ts
interface HipRafterSpec {
  id: EntityId;
  section: TimberSection;
  commonRunMm: number;
  pitchDeg: number;
  overhangMm: number;
  ridgeThicknessMm: number;
}

interface HipRafterResult {
  commonRiseMm: number;
  planRunMm: number;
  tailPlanRunMm: number;
  theoreticalLineLengthMm: number;
  tailLineLengthMm: number;
  ridgePlanDeductionMm: number;
  ridgeAxisDeductionMm: number;
  lineLengthToRidgeFaceMm: number;
  hipSlopeDeg: number;
  plumbToMemberDeg: number;
  seatToMemberDeg: number;
  cheekAngleDeg: number;
  backingAngleDeg: number;
}
```

Exact names may differ.

Keep this pure and independent of rendering.

---

## 10. Compound fabrication operations

The current `EndCut` model is enough for common-rafter side elevation but insufficient to describe a diagonal hip end.

Extend the fabrication domain with a renderer-independent compound operation.

Conceptually:

```ts
interface CompoundEndCut {
  kind: 'compound-end-cut';
  id: EntityId;
  memberId: EntityId;
  end: 'ridge' | 'tail';
  plumbToMemberDeg: number;
  cheekAngleDeg: number;
  doubleCheek: boolean;
  referenceStationMm: number;
}
```

Likewise introduce structured hip-backing information rather than translated text in math packages.

Do not yet build a generic arbitrary-plane solid boolean CAD engine unless truly necessary. V6 only needs a correct regular hip fabrication description and visual detail.

---

## 11. Hip fabrication visualization requires multiple coordinated views

A single side elevation cannot explain a compound hip cut.

For H1, provide a technical fabrication sheet that can display coordinated views from the same result:

### Plan
Shows:
- common run,
- 45° hip plan direction,
- ridge endpoint,
- ridge deduction,
- overhang diagonal.

### Elevation along hip
Shows:
- hip slope,
- line length,
- plumb/seat references,
- ridge-face endpoint.

### Top-face / cut detail
Shows:
- cheek/side-cut line,
- double-cheek symmetry when applicable,
- backing/bevel angle as a separate cross-section/detail.

Do not turn these into three permanent application modes. They can appear as a coordinated drawing sheet/contextual detail for the selected H1 prototype.

---

## 12. Hip roof skeleton

Create a new renderer-neutral skeleton resolver for the hip template.

Skeleton must include at least:

- perimeter/wall-plate members,
- theoretical/physical ridge member when ridge length > 0,
- four hip-rafter physical instances,
- common-rafter instances along the central ridge region where applicable,
- existing optional purlins only where the current equal-pitch geometry can represent them honestly,
- solid/ribbon rendering using the V5 prism helpers.

The four hip instances should share one fabrication prototype:

```text
prototype: member:hip-rafter-H1
instances:
  instance:hip:front-left
  instance:hip:front-right
  instance:hip:rear-left
  instance:hip:rear-right
```

Selection must distinguish the physical instance while linking it to H1.

Do not create fake jack-rafter instances in V6.

---

## 13. Builder roof-type workflow

Add a simple roof-template selector in the geometry context, not a new app shell.

For example:

```text
Typ dachu
[ Dwuspadowy ] [ Kopertowy ]
```

Switching template type:

- is one undoable domain transaction,
- preserves compatible values such as span, length, pitch, overhang and common section where possible,
- initializes hip-specific section defaults explicitly,
- never silently changes units,
- updates skeleton immediately.

Builder remains canvas-first.

---

## 14. Quick Calc tool selection

Quick Calc should support at least:

```text
Krokiew zwykła
Krokiew narożna
```

Use a compact calculator/member selector rather than another permanent global navigation bar.

Hip Quick Calc default visible inputs:

- common run / half-span,
- pitch,
- overhang.

Expandable advanced fields:

- hip section,
- ridge thickness.

Immediate results:

- hip plan run,
- hip line length,
- hip slope,
- ridge-face length,
- plumb marking angle,
- cheek/layout angle,
- backing/bevel angle.

Include a compact live plan + elevation sketch.

Action:

`Otwórz w kreatorze`

must instantiate/preserve the corresponding hip roof/template state rather than recalculate using a separate engine.

---

## 15. Selection and fabrication prototype workflow

In Hip Builder:

- click common rafter → existing K1 context,
- click hip rafter → H1 context,
- Inspector says which physical corner instance is selected,
- action `Przygotuj krokiew narożną H1` opens the coordinated fabrication sheet,
- `Wróć do szkieletu` returns without changing geometry.

The result rail becomes context-sensitive:

### Common selected
Common-rafter values.

### Hip selected
- H1 line length,
- material length / ridge-face length,
- hip slope,
- cheek angle,
- backing angle.

---

## 16. Direct manipulation

Reuse V5 transactions/history/viewport.

For hip roof:

- pitch handle updates all four roof planes and both K1/H1 calculations,
- span handle updates ridge height, common run, hip line length and ridge length,
- building-length handle updates ridge length and skeleton geometry,
- undo/redo remains one transaction per gesture.

Do not introduce separate hip-specific camera state or history.

---

## 17. Visual semantics

The user should understand member types immediately.

Suggested semantic distinctions:

- common rafters: normal timber tone,
- hip rafters: slightly stronger/darker timber edge or dedicated accent,
- ridge: existing ridge/support treatment,
- selected H1: high-contrast outline,
- theoretical centerline/deduction: technical dashed line,
- cut lines: precise accent stroke.

Do not rely on color alone; use width/outline/labels too.

---

## 18. Research / engineering boundary

Traditional framing literature is valuable for geometry, terminology and layout sequence. It is not current structural certification.

V6 geometry should be cross-checked against:

- Ira Samuel Griffith, *Carpentry*, sections on hip/valley rafters, side cuts, length, ridge reduction and backing (Project Gutenberg public-domain edition).
- Practical modern roof-framing references explaining the regular hip's 45° plan run and 17-inch framing-square convention.

Use exact trigonometry (`sqrt(2)`), not rounded 17-inch values, in the calculation engine.

No structural safe/unsafe verdicts.

---

## 19. V6 success criteria

V6 is successful when:

1. `RoofTemplateSpec` can represent both gable and regular hip templates.
2. Existing gable behavior remains regression-safe.
3. Hip roof skeleton renders a real rectangular equal-pitch hip roof with four distinct hip instances.
4. Square footprint cleanly becomes a pyramid/zero-ridge case.
5. H1 is one shared fabrication prototype linked from all four physical hip instances.
6. Exact hip plan run, rise, line length and hip slope are pure/tested.
7. Cheek/layout and backing/bevel angles match independent reference vectors.
8. Ridge deduction is explicit, pure and documented.
9. Quick Calc has a genuinely fast hip-rafter path.
10. Selecting a hip in Builder opens understandable H1 fabrication information with plan/elevation/cut views.
11. Pitch/span/length edits update K1, H1 and skeleton in one shared state flow.
12. Undo/redo and viewport behavior remain intact.
13. Desktop and ~360 px mobile remain usable.
14. No jack/valley/unequal-pitch or structural-capacity logic is faked.
