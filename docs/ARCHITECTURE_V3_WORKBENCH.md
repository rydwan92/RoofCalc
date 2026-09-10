# RoofCalc / CieślaCalc — Architecture V3: Dual-mode Parametric Carpentry Workbench

## 1. Product direction

RoofCalc should no longer be treated as a single common-rafter calculator.

The core product is a **parametric carpentry workbench** with two user experiences that share exactly the same domain model, mathematical engine and drawing engine:

### Mode A — Quick Calc
For a roofer/carpenter who wants a result in seconds.

- minimal inputs,
- no canvas editing required,
- immediate lengths/cuts/marking dimensions,
- mobile-first,
- one-screen workflow,
- optional "show on drawing" actions.

### Mode B — Visual Builder
For a user who wants to understand/build the roof member visually.

- interactive 2D canvas,
- toolbox,
- add/remove supports and members,
- drag supports visually,
- precise numeric inspector,
- snapping and constraints,
- automatic cut/joint resolution,
- click any joint to zoom/detail,
- fabrication plan generated from the same model.

**Quick Calc and Visual Builder must not contain separate formulas.**
They are two editors/views over one parametric model.

---

## 2. Current repository — keep vs change

### Keep
The current repository has good foundations:

- monorepo,
- `roof-math`,
- `calculator-core`,
- `drawing-engine`,
- `timber-model`,
- canonical millimetres,
- calculator versioning,
- i18n,
- reactive local calculations,
- tests,
- assembly/member/detail concepts,
- support/cut domain objects.

### Change
The current implementation is still too strongly shaped around one fixed A-B-C-D common rafter.

Important scaling problems:

1. `DatumId = 'A' | 'B' | 'C' | 'D'` cannot represent multiple purlins/supports.
2. `DatumPoint.meaning` is hard-coded to one member/joint layout.
3. `WorkbenchObject` is a closed union tied to one calculator.
4. `createWorkbenchDrawing()` manually knows fixed stations, selected objects and view-specific offsets.
5. dimension offsets such as `offsetPx: -108` are presentation hacks that will not scale.
6. the canvas exposes too many explicit view toggles.
7. adding a purlin currently means extending a fixed calculator instead of adding a resolved support/joint to an assembly.
8. the current "detail" view is a manual mode; detail should usually be contextual after selecting/clicking a joint.

The next architecture should preserve the mathematical packages but generalize the workbench model.

---

## 3. Domain pipeline

Use one directional pipeline:

```text
User intent / template
        ↓
AssemblySpec
        ↓
Constraint / placement solver
        ↓
ResolvedAssembly
        ↓
Joint resolver
        ↓
FabricationPlan
        ↓
DrawingScene
        ↓
SVG UI / Quick results / PDF later
```

### AssemblySpec
Editable user model.

Contains:
- roof plane(s),
- timber members,
- supports,
- terminal conditions,
- requested joints,
- dimensions/constraints.

### ResolvedAssembly
Pure calculated geometry.

Contains exact:
- world position,
- member local coordinates,
- intersections,
- stations,
- support contact lines,
- resolved dimensions.

### FabricationPlan
What the carpenter actually prepares.

Contains:
- stock/member length,
- cuts,
- notches,
- marking stations,
- reference datums,
- cut angles,
- ordered workshop steps.

### DrawingScene
Renderer-friendly visual description.

Contains:
- member shapes,
- support shapes,
- dimensions,
- markers,
- semantic object IDs,
- selection/focus metadata.

---

## 4. Dynamic IDs and datums

Replace fixed A/B/C/D domain assumptions.

Use stable dynamic IDs, for example:

```text
member:rafter-1
support:wall-plate-1
support:purlin-1
support:purlin-2
terminal:ridge-1

datum:eave-top
datum:wall-plate-1-heel-top
datum:wall-plate-1-toe-top
datum:purlin-1-heel-top
datum:purlin-1-toe-top
datum:ridge-face-top
```

Letters A/B/C/D should become **display labels generated for a fabrication sheet**, not permanent domain IDs.

Example:

```ts
type EntityId = string;
type DatumId = string;

interface Datum {
  id: DatumId;
  entityId: EntityId;
  edge: MemberEdge;
  localPoint: Point2D;
  semanticRole:
    | 'member-start'
    | 'member-end'
    | 'support-heel'
    | 'support-toe'
    | 'cut-intersection'
    | 'reference';
}
```

This makes any number of supports possible.

---

## 5. Support model

A support should be editable before it is resolved.

```ts
interface SupportSpec {
  id: EntityId;
  kind: 'wall-plate' | 'purlin' | 'ridge' | 'custom-support';
  section: {
    widthMm: number;
    heightMm: number;
  };
  placement: SupportPlacement;
  jointPreference?: JointPreference;
}
```

Supported placement modes should initially include:

```ts
type SupportPlacement =
  | { mode: 'horizontal-from-wall'; xMm: number }
  | { mode: 'along-member'; stationMm: number };
```

Later:
- from ridge,
- percentage,
- constrained between points,
- explicit world XY.

### Dragging
Dragging is only an editor for `SupportPlacement`.

Never store canvas pixel coordinates as geometry.

Flow:

```text
pointer drag in SVG
  ↓
screen → world transform
  ↓
snap / clamp
  ↓
update SupportPlacement
  ↓
solver recalculates
```

The inspector always shows the exact numeric position and allows direct entry.

---

## 6. Joint model

Do not create a separate calculator for every support.

A generic support/member intersection should create a joint.

```ts
interface JointSpec {
  id: EntityId;
  memberId: EntityId;
  supportId: EntityId;
  kind: 'seat-notch' | 'bearing' | 'end-contact' | 'custom';
}
```

Initial joint resolvers:

### Seat notch
Used initially for:
- wall plate,
- purlin.

Given roof/member angle and the support/contact geometry, resolve:
- heel line,
- seat line,
- toe line,
- normal notch depth,
- remaining member depth,
- removed depth ratio,
- stations on top/bottom edges.

Allow editing either:
- desired seat/contact length,
- or notch depth,

with a clearly selected controlling parameter.

### End/plumb cut
Used initially at:
- ridge,
- eave/tail if enabled later.

Resolve from actual member/reference intersection.

### Important
Geometric outputs are factual.
Do not infer structural safety from arbitrary depth ratios.

---

## 7. Geometry engine: use line/intersection math, not ad-hoc formulas

Trigonometry remains important, but the scalable engine should be based on geometry primitives:

- line,
- ray,
- segment,
- parallel offset,
- perpendicular projection,
- line-line intersection,
- line-polygon intersection,
- vector normal/tangent,
- transform world ↔ member local.

Then specialized formulas become validation/reference results.

Example:

For roof angle θ and horizontal seat length s:

```text
vertical change = s * tan(θ)
normal notch depth = s * sin(θ)
```

But the actual visible cut should be generated from intersections between:
- member bottom/top lines,
- support contact plane,
- plumb cut line.

This is more general for later purlins and non-default geometry.

---

## 8. Two user experiences

### 8.1 Quick Calc — "Szybkie obliczenie"

Goal: answer a job-site question in under ~15 seconds.

Example layout:

```text
Krokiew zwykła

Rozpiętość / bieg      [ 4000 mm ]
Kąt połaci             [ 35° ]
Okap                   [ 500 mm ]

Przekrój krokwi        [ 80 × 200 ]
Murłata                 [ 140 mm ]
Siedzisko               [ 100 mm ]
Kalenica                [ 40 mm ]

[ mini dynamic drawing ]

DŁUGOŚĆ MATERIAŁU       5609 mm
ZACIOS                   100 / 57.4 mm
CIĘCIE KALENICY          55°
OD KOŃCA DO ZACIOSU      610.4 mm

[ Pokaż trasowanie ]
[ Otwórz w kreatorze ]
```

Progressive disclosure:
- start with 3-4 essential fields,
- "Więcej ustawień" reveals timber/support details,
- drawing is always visible but compact.

### 8.2 Visual Builder — "Kreator"

Desktop:

```text
┌──────────────┬──────────────────────────────┬─────────────────┐
│ TOOLBOX      │                              │ INSPECTOR       │
│              │          CANVAS              │ selected item   │
│ + Murłata    │                              │ exact values    │
│ + Płatew     │     rafter + supports        │ constraints     │
│ + Kalenica   │                              │ joint settings  │
└──────────────┴──────────────────────────────┴─────────────────┘
│ FABRICATION BAR: stock / cuts / stations / warnings          │
└───────────────────────────────────────────────────────────────┘
```

Toolbox should be collapsible.

### Minimal visible controls
Remove permanent "Konstrukcja / Element / Detal" tabs from the primary hierarchy.

Preferred behavior:
- default canvas = assembly,
- select rafter → member dimensions overlay,
- select notch → contextual detail lens/zoom,
- double click / "Powiększ detal" → focused joint detail,
- Esc / back → return to assembly.

A small "Widok" menu may expose advanced view options, but it should not dominate the workflow.

---

## 9. Contextual detail lens

Instead of a permanent Detail mode, introduce a **detail lens**.

When a cut/joint is selected:

- canvas centers it,
- optional magnified inset appears,
- exact dimensions are shown,
- user can open a larger detail panel.

This reduces navigation and makes the visualization self-explanatory.

---

## 10. Pan/zoom/drag libraries

Do not adopt a full CAD framework yet.

Recommended small addition:
- `react-resizable-panels` for desktop toolbox/canvas/inspector sizing if useful.

For canvas input:
- prefer native SVG + Pointer Events,
- use existing viewBox projection,
- add world↔screen transforms.

Do not use Fabric.js/Konva as the domain model.

---

## 11. Snap system

Add a small domain-independent snap resolver.

Initial snap targets:

- wall-plate origin,
- ridge face/axis,
- round increments, e.g. 1/5/10 mm depending zoom,
- existing support reference stations.

Visual feedback:
- guide line,
- snapped station label.

---

## 12. Dimension engine improvements

Replace manual dimension offsets with semantic lanes.

Example:

```ts
interface DimensionIntent {
  id: string;
  from: DatumId;
  to: DatumId;
  edge?: MemberEdge;
  group: 'primary' | 'joint' | 'support';
  priority: number;
}
```

Drawing layout calculates lanes automatically.

Goal:
- no fixed `offsetPx` keyed to A-B-C-D,
- no overlap after adding multiple supports,
- mobile-friendly hiding of secondary dimensions.

---

## 13. Fabrication plan

This should become the product's strongest feature.

For one member:

```text
KROKIEW K1
Przekrój 80 × 200
Materiał minimalny: 5609.1 mm

1. Od końca A odmierz 610.4 mm po górnej krawędzi.
2. Wytrasuj pion zaciosu Z1.
3. Wyznacz siedzisko 100 mm.
4. Kontrola: głębokość prostopadła 57.4 mm.
5. Od A odmierz 5469.1 mm do linii cięcia kalenicowego.
6. Wytrasuj cięcie 55° względem osi krokwi.
```

Later:
- printable sheet,
- PDF,
- cut list,
- QR/open project.

---

## 14. Templates and roof systems

Use templates that instantiate the same assembly model.

Planned templates:

1. `common-rafter`
2. `gable-pair`
3. `common-rafter-with-purlin`
4. `collar-tie / jętka`
5. `purlin-and-strut frame`
6. hip roof
7. valley
8. jack rafters

Template ≠ separate geometry engine.

---

## 15. Free vs advanced product

Do not fork the codebase.

Possible entitlement keys later:

```text
quick.common-rafter
builder.interactive
builder.multiple-supports
builder.roof-templates
fabrication.cut-list
export.pdf
projects.history
company.templates
```

Initial release grants all shipped capabilities.

Potential packaging later:

### Free / essential
- quick calculators,
- basic visual drawing,
- units,
- basic cut dimensions.

### Advanced
- interactive builder,
- multiple supports,
- fabrication sheets,
- saved projects/history,
- PDF/share,
- advanced templates,
- team/company features.

Do not implement billing now.

---

## 16. Next implementation iteration

Iteration 003 should NOT add hip rafters yet.

It should prove that the architecture handles one arbitrary intermediate purlin/support.

Definition of success:

1. two modes: Quick Calc and Visual Builder,
2. same `AssemblySpec`,
3. add/remove one purlin,
4. purlin can be dragged along a constrained axis,
5. precise position editable numerically,
6. joint automatically follows the purlin,
7. notch/marking stations recalculate,
8. click notch → contextual detail,
9. dimensions automatically choose lanes,
10. mobile quick mode is genuinely fast.
