# PROMPT_ITERATION_012 — Roof Windows, Battens Layer, View System 2.0, and Assembly Composition

You are continuing the existing RoofCalc / CieślaCalc repository after completed Iteration 011.

This is a substantial product iteration. Do not rewrite the project and do not replace the existing geometry/fabrication pipeline.

The objective is to move RoofCalc from a timber-only workbench toward a true roof-project editor while preserving the existing professional fabrication workflow.

## 0. Mandatory reading and baseline

Before editing code, read in full:

- `AGENTS.md`
- `PROJECT_BLUEPRINT.md`
- `docs/ROOFCALC_PRODUCT_NORTH_STAR.md`
- `docs/ARCHITECTURE_V8_CUT_PREVIEWS_AND_DETAIL_DRAWER.md`
- `docs/ARCHITECTURE_V9_PROJECT_WORKBENCH_AND_VIEW_SYSTEM.md`
- `docs/ARCHITECTURE_V10_MEMBER_INSTANCE_WORKFLOW.md`
- `docs/ARCHITECTURE_V11_DIRECT_MANIPULATION_AND_QUICK_DETAILS.md`
- `docs/HIP_RAFTER_GEOMETRY.md`
- `docs/JACK_RAFTER_GEOMETRY.md`
- `docs/DOMAIN_RESEARCH_ROADMAP.md`
- current `WORK CHECKPOINT`

Inspect the latest source for Quick Calc, Builder, Toolbox, Inspector, SkeletonCanvas/render projection, `RoofProjectDocumentV1`, purlin direct drag, fabrication package, view presets/dimension policy, Quick detail dialog, and undo/redo transaction boundaries.

Run preflight:

```bash
git status
git diff --stat
git diff
pnpm typecheck
pnpm test
pnpm build
```

Do not discard user work.

## 1. Iteration objective

After this iteration, RoofCalc should feel less like a rafter calculator with extra panels and more like a coherent parametric roof project editor.

The user should be able to:
- work with the timber structure as today,
- add a roof window as a real project feature,
- drag it on a roof plane,
- see which members it geometrically conflicts with,
- optionally place it into a nearby clear rafter bay,
- switch on a batten layer,
- see a clean calculated batten layout over the roof,
- inspect/edit batten-layout parameters only when that layer is relevant,
- control visibility through a compact professional view system,
- keep fabrication/detail work readable instead of showing every project layer at once.

Do NOT implement structural redesign around openings yet.
Do NOT implement automatic headers/trimmers yet.
Do NOT implement roof covering products/prices yet.

## 2. Product principle

Preserve the core rule:

> rich model, selective view.

Adding windows and battens must NOT lead to a wall of permanent checkboxes.

The model may contain structure, openings, battens, future counter-battens and fabrication overlays, but the user sees a task-oriented combination.

## 3. View System 2.0

Evolve the current `Konstrukcja / Cięcia` concept.

Recommended visible top-level view presets:

```text
[ Konstrukcja ] [ Otwory ] [ Łacenie ] [ Cięcia ]
```

If a 4-tab control feels too wide on mobile, use a compact segmented control + overflow menu.

### Konstrukcja
Show rafters, hip rafters, jack rafters, wall plate, ridge, purlins and selected relevant dimensions.

Hide or strongly mute battens, fabrication cut overlays unless selected, and opening diagnostics unless selected.

### Otwory
Show roof planes enough for context, roof windows/openings, nearest/intersected rafters, placement dimensions and collision warnings. Mute unrelated repeated members.

### Łacenie
Show roof planes, battens, openings clipped/marked in the batten field and key batten dimensions. Structure remains as a subtle ghost/reference layer.

### Cięcia
Keep current fabrication-focused behavior: selected member, cuts, supports involved, datums, dimensions and detail drawer.

### Advanced view options
Add a compact `Widok` / eye/menu control for advanced visibility. Example:

```text
Widok
✓ Wymiary
✓ Etykiety
✓ Konstrukcja w tle
✓ Otwory
✓ Łaty
```

Do NOT put all of these permanently on the main toolbar.

## 4. Stronger active-state and visual hierarchy

Current UI should receive a deliberate contrast pass.

Define semantic visual tokens for:
- selected primary object,
- related object,
- hover,
- muted background,
- warning/collision,
- fabrication cut,
- removed material,
- roof feature/opening,
- battens.

Rules:
- selection cannot rely on color only,
- selected object should also gain stroke/weight/outline treatment,
- warning/collision must be visually distinct but not neon/aggressive,
- muted geometry must remain readable enough to provide context,
- active toolbar/view filters need stronger contrast than inactive controls,
- avoid many near-identical pale green buttons.

Do not hardcode one-off colors in components. Use shared CSS/theme variables.

## 5. Remove obsolete purlin drag dots

Iteration 011 made user-added intermediate purlins directly draggable by their timber body.

If the old visible purlin drag dots are no longer necessary:
- remove them from the normal view,
- do not remove useful geometric reference points used elsewhere,
- keep a precise numeric Inspector input,
- optionally expose a subtle drag affordance only on hover/selection.

Expected UX:

```text
hover purlin -> stronger outline + cursor: grab
drag         -> cursor: grabbing + active position guide
release      -> one undoable canonical change
Escape       -> cancel current drag
```

Do not leave duplicate primary interaction mechanisms that visually compete.

## 6. Introduce renderer-neutral RoofFeature architecture

Create a small typed domain abstraction for project features attached to a roof.

Suggested direction:

```ts
type RoofFeature =
  | RoofWindowFeature;

interface RoofWindowFeature {
  id: string;
  kind: 'roof-window';
  roofPlaneId: string;
  widthMm: number;
  heightMm: number;
  position: {
    uMm: number;
    vMm: number;
  };
  clearanceMm?: number;
}
```

Exact naming may differ.

Important:
- `u/v` are roof-plane-local canonical coordinates,
- never persist SVG pixels,
- stable ID required,
- type must be serializable,
- no React/DOM/localization in domain package.

Prepare architecture so later variants can include generic opening, chimney and dormer attachment/subassembly. Do not implement these future feature types yet unless a tiny generic base type is naturally needed.

## 7. Roof-plane local coordinate system

Define/test a clear local basis for each roof plane.

The feature system needs pure functions conceptually like:

```ts
projectPlaneLocalToWorld(...)
projectWorldToPlaneLocal(...)
```

Requirements:
- deterministic,
- independent of SVG/camera,
- works when pitch changes,
- works when span/building length changes,
- compatible with gable and hip roof planes,
- fully unit tested.

Document the basis clearly:

```text
u = across roof plane / parallel to eave
v = up roof slope
```

or the final equivalent.

## 8. Roof Window MVP

Add to Builder toolbox:

```text
OTWORY

Okna dachowe (N)
  O1
  O2

+ Dodaj okno dachowe
```

When no windows exist:

```text
OTWORY
+ Dodaj okno dachowe
```

Do not add roof-window editing to Quick Calc in this iteration.

Default add behavior:
- choose a sensible valid roof plane if there is only one obvious editable plane,
- otherwise ask/select roof plane with lightweight UI,
- create a reasonable geometric default size,
- place it near the visible/central region of the plane,
- select it immediately,
- switch context to `Otwory` if appropriate.

Use non-structural wording.

## 9. Roof window direct manipulation

The roof window must be draggable directly by its visible body.

Requirements:
- pointer/touch-friendly hit area,
- canonical `u/v` changes,
- clamp to roof-plane bounds,
- live reactive visualization,
- exactly one Undo/Redo transaction for one drag gesture,
- `Escape` cancels active drag,
- exact Inspector fields remain available.

During drag show only useful guides, for example:
- distance from eave,
- distance to nearest rafter axes,
- current bay highlight,
- collision state.

Avoid showing too many dimensions simultaneously.

## 10. Roof window Inspector

Selected window Inspector should show at minimum:

```text
Okno dachowe O1

Połać
Szerokość
Wysokość
Pozycja od okapu
Pozycja wzdłuż połaci / od wybranego odniesienia
Najbliższe krokwie
Kolizje
```

If a distance is derived, show it read-only. If it is a canonical control, allow numeric editing.

Include:
- remove window,
- action `Umieść między krokwiami`.

Do not claim product-specific installation clearance unless explicitly user-entered or generic.

## 11. Geometric member collision detection

Create pure geometry/domain logic that determines which structural member instances intersect the projected window/opening region.

At minimum handle relevant current member families:
- K1 common rafters,
- J1 jack rafters where the selected plane contains them,
- H1 if geometrically applicable at the opening boundary.

Return structured data, not translated text.

Concept:

```ts
interface FeatureCollision {
  featureId: string;
  memberInstanceId: string;
  memberPrototypeId?: string;
  type: 'intersects' | 'clear';
  clearanceMm?: number;
}
```

UI behavior:

No collision:
```text
✓ Otwór znajduje się pomiędzy krokwiami
```

Collision:
```text
⚠ O1 przecina K1-07
```

Canvas:
- window gets warning state,
- intersected member gets related/warning state,
- do not rely on red alone,
- Inspector lists exact affected members.

This is GEOMETRIC collision only. Do not infer structural acceptability.

## 12. "Umieść między krokwiami"

Implement a helpful geometric placement action.

Goal:
- find the nearest suitable current rafter bay on the selected roof plane,
- center/place the opening in that bay if its width fits with any configured geometric clearance,
- preview/apply the result.

If no bay can fit:
- explain clearly,
- do not silently resize the window.

Wording must stay geometric.

Good:
> Umieszczono geometrycznie pomiędzy K1-07 i K1-08.

Bad:
> Zalecane położenie okna.

## 13. Battens module foundation

Introduce a separate roof build-up / layout projection, not a timber structural member family.

Do not place battens inside the rafter solver as if they were structural supports.

Possible canonical project setting:

```ts
interface BattenLayoutSpec {
  enabled: boolean;
  roofPlaneIds?: string[];
  battenHeightMm: number;
  battenWidthMm: number;
  gaugeMm: number;
  eaveOffsetMm: number;
  ridgeOffsetMm?: number;
}
```

Exact field names may differ.

Important architectural rule:

> batten layout consumes solved roof-plane/opening geometry; roof geometry must not depend on battens.

Do not add commercial product/pricing data.

## 14. Batten visibility UX

Do NOT make a random checkbox floating next to the canvas.

Use the view system.

Recommended:

```text
[ Konstrukcja ] [ Otwory ] [ Łacenie ] [ Cięcia ]
```

The first time `Łacenie` is activated and no layout exists, open a compact configuration panel/drawer:

```text
Łacenie połaci

Przekrój łaty
[ 40 × 60 mm ]

Rozstaw / moduł
[ 350 mm ]

Odległość pierwszej łaty od okapu
[ ... ]

Odległość ostatniej / strefa kalenicy
[ ... ]

[ Zastosuj ]
```

If layout already exists:
- simply show it,
- Inspector/toolbox allows editing.

Do not force the dialog every time the user changes view.

## 15. Batten layout calculation

Implement only a GENERIC geometric/manual module.

Do not pretend to know a roof-tile manufacturer's required gauge.

The user supplies/accepts explicit layout parameters.

Pure resolver should produce structured rows conceptually like:

```ts
interface ResolvedBatten {
  id: string;
  roofPlaneId: string;
  stationMm: number;
  usableLengthMm: number;
  segments: ...
}
```

It should account for:
- roof-plane boundaries,
- eave offset,
- ridge boundary,
- regular gauge,
- roof openings by clipping/splitting visible batten segments where appropriate.

If clipping around a window is too large for this iteration, at minimum mark intersection zones clearly and structure the resolver so clipping can be added next. Prefer actual geometric clipping if current math primitives make it reliable.

## 16. Batten visualization

The `Łacenie` view should be visually understandable to a roofer.

Show:
- roof plane,
- repeated batten lines/rectangular members,
- first batten,
- last batten,
- selected batten,
- opening interruption,
- key gauge dimension,
- count.

Do not render every repeated gauge label.

Instead show something like:

```text
24 pola × 350 mm
```

plus selected/local dimensions.

Use a visually distinct but restrained batten color.

Structure underneath should be ghosted.

Allow zoom, pan, select layout, and return to structure without losing project configuration.

## 17. Batten results panel

In `Łacenie` context expose useful calculated quantities:

```text
Łaty
Liczba rzędów: ...
Łączna długość: ... m
Przekrój: ... × ... mm
Moduł: ... mm
```

If openings split rows, clearly define how total length is calculated.

These are geometry quantities only.

Do NOT add:
- prices,
- waste percentages,
- supplier products,
- structural/installation guarantees.

This output should be future-ready for Quantity Engine, but Quantity Engine itself is not implemented now.

## 18. Counter-batten readiness

Do not implement a full counter-batten module unless trivial and safe.

However, structure the roof-build-up model so future:

```text
CounterBattenLayout
BattenLayout
Membrane
Covering
```

can coexist.

Do not name generic build-up code specifically around only one batten implementation if a small generalization is obvious.

## 19. Windows + battens integration

Roof windows must participate in the `Łacenie` view.

At minimum:
- window outline visible,
- affected batten rows identifiable,
- batten/window intersection not visually ignored.

Preferred:
- split/clipped batten segments around the geometric opening.

Do NOT automatically add product-specific framing battens around the window in this iteration.

## 20. Assembly composition foundation

Introduce a small renderer-neutral model for project composition.

Conceptually:

```text
RoofProject
└── RoofAssembly
    ├── Roof planes
    ├── Structural members
    ├── Supports
    ├── Roof features
    └── Roof build-up specs
```

Prepare future `Subassembly` / `Attachment` without building a complex CAD graph.

Needed future cases:
- dormer attached to main roof plane,
- porch roof attached to building/main roof,
- roof-to-roof connection,
- chimney/opening.

Do not build dormers yet.

## 21. Project persistence boundary

Iteration 012 must strengthen `RoofProjectDocumentV1`.

Persist:
- window specs,
- batten layout specs,
- canonical feature positions,
- all current roof construction inputs.

Do NOT persist:
- active view preset,
- currently selected window,
- hover,
- open modal,
- drawer size,
- zoom/pan,
- current isolate state.

Add round-trip tests:

```text
Project -> JSON -> Project
```

with windows + batten layout.

Keep explicit schema versioning.

## 22. Builder layout polish

Current desktop layout is functional but vertically long when Detail Drawer, Fabrication package and roof summary are all expanded.

Improve information density without making the interface cramped.

Preferred approach:
- canvas remains dominant,
- detail drawer supports compact/medium/focus states OR equivalent bounded-height design,
- lower sections become collapsible/task-contextual,
- avoid rendering giant fabrication and summary sections when the user is actively placing a roof window or editing battens,
- preserve access without forcing page-long scrolling.

Do not turn the app into a tab-heavy admin dashboard.

## 23. Detail drawer states

Polish the existing detail panel.

Recommended controls:

```text
_   minimize
□   focus/expand
×   close
```

or equivalent accessible iconography.

States:

```text
compact
working
focus
```

Focus state can use most of the available workbench width/height for fabrication review.

Mobile remains a bottom sheet.

Do not store drawer state in project document.

## 24. Quick Calc — keep focused

Do not put roof-window or batten editing into Quick Calc.

Quick remains:

> fastest answer for member geometry and cuts.

Only make small UI polish if required by shared components.

## 25. Toolbox hierarchy

Refine the scalable hierarchy:

```text
GEOMETRIA
  Połać

DREWNO
  Krokwie K1
  Krokwie narożne H1
  Kulawki J1

PODPORY
  Murłata
  Płatwie (N)
  Kalenica

OTWORY
  Okna dachowe (N)
  + Dodaj okno dachowe

WARSTWY DACHU
  Łacenie
```

`WARSTWY DACHU` may use an icon/status dot instead of listing dozens of rows.

Active/visible/enabled states must be visually different and understandable.

A selected entity is not the same as a visible layer.

## 26. Active / visible / warning semantics

Define UI semantics explicitly:

```text
selected     = current object user is editing
visible      = layer/preset contributes geometry to canvas
active tool  = current creation/edit tool
warning      = geometric conflict
muted        = context only
```

Use different cues.

## 27. Responsive/mobile requirements

At narrow widths:
- toolbox becomes drawer/sheet,
- Inspector and Detail Drawer must not fight for screen space,
- view preset control remains reachable,
- roof-window dragging remains possible with touch,
- controls use adequate hit targets,
- batten configuration is a bottom sheet or compact step,
- no horizontal document overflow,
- Quick behavior remains unchanged/simplified.

Test 360 × 800 at minimum.

## 28. Accessibility

Maintain/improve:
- keyboard-operable feature list,
- focus visible,
- Escape cancels drag or closes modal/sheet in the correct order,
- roof window can be positioned numerically without pointer,
- warnings have text/icon, not color alone,
- view presets expose correct aria semantics,
- detail drawer controls have labels.

## 29. Performance

Adding repeated battens can create many primitives.

Requirements:
- domain geometry resolves only when canonical inputs change,
- view switching should mostly change projection/visibility,
- hover must not rerun roof math,
- memoize repeated batten rendering/projections where useful,
- avoid individual React state per batten,
- do not create hundreds of DOM labels.

Test a reasonably large roof with dense gauge.

## 30. Tests — required

Add coverage for at least:

### Roof feature model
- serialize/deserialize roof window,
- stable feature ID,
- invalid size rejection,
- plane-local bounds.

### Coordinate transform
- plane local -> world,
- world -> plane local,
- round-trip tolerance,
- pitch change,
- gable left/right plane,
- hip plane where supported.

### Window drag
- canonical position changes,
- clamping,
- cancel with Escape,
- one Undo/Redo transaction,
- no pixel values persisted.

### Collision
- no collision,
- one K1 collision,
- multiple K1 collision if window wide,
- J1 collision on hip roof,
- warning projection.

### Place between rafters
- valid bay,
- nearest bay,
- too-wide window,
- exact fit/clearance edge case.

### Battens
- deterministic station generation,
- first/eave offset,
- repeated gauge,
- last/ridge boundary,
- count,
- total linear length,
- window intersection/clipping behavior,
- gable plane,
- hip plane if implemented.

### UI state boundary
- selected window/view preset/drawer state not serialized.

### Regression
All current K1, H1, J1, purlins, direct drag, purlin equal distribution, Quick detail dialog, fabrication package, spacing policies, unit conversions and Undo/Redo tests must remain green.

## 31. Browser QA — required

Verify:
- no obsolete visible purlin dots in normal state,
- direct purlin body drag still works,
- add O1,
- drag on roof plane,
- edit numeric size,
- collision appears/disappears,
- place between rafters,
- change roof pitch and confirm feature remains attached correctly,
- enable/configure Łacenie,
- inspect repeated layout,
- edit gauge,
- window visibly affects layout,
- switch back to Konstrukcja,
- active preset contrast obvious,
- selected vs visible not confused,
- detail drawer compact/working/focus,
- mobile 360×800 with no horizontal overflow.

## 32. Architecture document

Create:

```text
docs/ARCHITECTURE_V12_ROOF_FEATURES_BATTENS_AND_COMPOSITION.md
```

Document:
- roof-plane coordinate contract,
- RoofFeature types,
- batten/build-up dependency direction,
- collision semantics,
- view-system semantics,
- assembly-composition boundary,
- project persistence boundary,
- limitations.

## 33. Explicit non-goals

Do NOT implement:
- automatic structural header/trimmer design around roof windows,
- static/load calculations,
- structural safety recommendation,
- product-specific roof-window installation rules,
- dormers,
- chimney framing,
- roof tile catalogue,
- sheet metal module,
- pricing,
- suppliers,
- estimating,
- auth/database,
- PDF generation,
- Three.js/full 3D,
- automatic purlin count/sizing.

## 34. Validation

Before finishing:

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
git diff --check
git status
git diff --stat
```

Update `PROJECT_BLUEPRINT.md` -> `WORK CHECKPOINT` with:
- iteration/status,
- exact domain types added,
- view semantics,
- roof-window behavior,
- collision contract,
- battens behavior,
- persistence changes,
- validation counts,
- browser/mobile QA,
- known limitations,
- exact NEXT ACTION.

Do NOT commit or push unless the user explicitly asks.

Do NOT begin Iteration 013 automatically.
