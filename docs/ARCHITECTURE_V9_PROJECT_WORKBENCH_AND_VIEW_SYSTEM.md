# RoofCalc / CieślaCalc — Architecture V9: Project Workbench, Smart Views, and Fabrication Package

## 1. Why V9 exists

V8 proved several important foundations:

- one shared Quick/Builder model,
- multiple spacing policies,
- contextual K1/H1 cut previews,
- detail drawer,
- contextual selection,
- hip/jack roof families.

The next scaling risk is not missing formulas. It is **workbench complexity**.

As RoofCalc gains more members, supports, openings, cuts and later roof layers, the UI and state architecture must remain understandable.

V9 therefore focuses on three things:

1. separate canonical project state from transient workbench state,
2. introduce a scalable smart-view/layer foundation,
3. turn fabrication data into a reusable project-level package rather than scattered cards/text.

V9 remains focused on timber roof construction. It does not implement database/auth/PDF/covering/costing yet.

---

## 2. Current code pressure points

The current implementation works, but several areas will become bottlenecks if left unchanged:

### Page composition
`AssemblyPage` currently coordinates:

- Quick/Builder,
- Toolbox,
- Inspector,
- canvas switching,
- detail drawer,
- local marking expansion,
- selection/focus,
- history controls,
- contextual results/fabrication.

This is acceptable for V8, but too much responsibility for the future project workbench.

### Store composition
The current Zustand state combines:

- canonical roof template,
- derived assembly spec,
- history,
- units,
- selection,
- active view,
- inspector state,
- toolbox state,
- input drafts/validation.

Future project saving requires an explicit boundary between canonical data and view/session state.

### View enum
The current `skeleton | rafter | hip` view works for current cases, but does not scale cleanly to:

- isolated member preparation,
- cuts view,
- openings,
- assembly subviews,
- covering layers,
- future estimating.

### Hard-coded toolbox families
The current toolbox is manually aware of K1/H1/J1, supports and purlins. A future `+ Dodaj element` workflow needs a typed tool/member registry rather than a continually growing JSX branch tree.

---

## 3. Canonical project boundary

Introduce an explicit serializable project document boundary.

Do not add backend persistence yet.

Suggested concept:

```ts
interface RoofProjectDocumentV1 {
  schemaVersion: 1;
  project: {
    roof: RoofTemplateSpec;
  };
}
```

The exact shape may be slightly different, but key rules are mandatory:

- canonical domain input is serializable,
- schema version is explicit,
- project document contains no hover/selection/panel/camera state,
- existing geometry resolvers still consume the canonical roof/template model,
- history stores canonical project snapshots, not UI snapshots.

This document is the future persistence contract.

---

## 4. Workbench UI state boundary

Define transient UI state separately, conceptually:

```ts
interface WorkbenchViewState {
  mode: 'quick' | 'builder';
  selectedId: string;
  selectedPrototypeId?: string;
  viewPreset: ViewPreset;
  focusMode?: FocusMode;
  isolateSelection: boolean;
  dimensionLevel: DimensionLevel;
  toolboxCollapsed: boolean;
  inspectorOpen: boolean;
  detailDrawer: {
    open: boolean;
    pinned: boolean;
    activePreviewId?: string;
  };
  camera: ...;
}
```

It does not have to be a separate library. It does need a clear type/module boundary.

Changing camera or opening a drawer must never create a domain history entry.

---

## 5. Smart view presets

Introduce a small scalable view-preset model.

V9 should fully implement only:

```text
Konstrukcja
Cięcia
```

Future-safe enum/registry may contain disabled metadata for later presets, but do not expose fake working tools.

### Konstrukcja
Prioritize:

- primary/secondary timber members,
- supports,
- roof outline/planes,
- only useful selected dimensions,
- direct manipulation handles.

### Cięcia
Prioritize:

- selected member/prototype,
- fabrication operations,
- cut markers,
- involved supports,
- datums,
- local dimensions.

Unrelated repeated members should be muted strongly.

A selected object may temporarily override visibility if necessary for comprehension.

---

## 6. Semantic layer projection

Do not scatter visibility conditions across many SVG components.

Derive a projection policy such as:

```ts
interface WorkbenchProjectionPolicy {
  showRoofPlanes: boolean;
  showPrimaryMembers: boolean;
  showSecondaryMembers: boolean;
  showSupports: boolean;
  showCutMarkers: boolean;
  showDatums: boolean;
  showDimensions: boolean;
  muteUnrelated: boolean;
}
```

The policy is derived from:

- view preset,
- current selection,
- focus/isolate state,
- device/layout constraints.

This becomes the foundation for later Montaż/Pokrycie/Kosztorys presets.

---

## 7. Dynamic contextual legend

Add a compact legend generated from what the current scene actually contains and shows.

Examples:

```text
K1  Krokiew zwykła
H1  Krokiew narożna
J1  Kulawka
P1  Płatew
```

Optional semantic entries:

```text
● zaznaczone
//// usuwany materiał
┄ linia pomocnicza
```

Rules:

- collapsible,
- not permanently large,
- no entries for hidden/nonexistent families,
- family color is separate from selected-state emphasis.

---

## 8. Visual interaction states

Standardize visual states across skeleton/member/detail renderers:

```text
normal
hover
selected
related
muted
warning
invalid
```

Selection must not rely on color only.

Use combinations of:

- opacity,
- stroke/outline weight,
- semantic accent,
- marker/badge where appropriate.

Dense hip roofs must remain readable.

---

## 9. Dimension policy

Introduce a central dimension display level:

```ts
type DimensionLevel = 'minimal' | 'working' | 'full';
```

### Minimal
Only essential global/current values.

### Working — default
Main selected member + active operation + critical context dimensions.

### Full
All available technical dimensions allowed by the current projection.

On narrow/mobile layouts, the projection may reduce labels further while keeping exact values available in Inspector/Detail.

Do not implement dimension hiding via independent ad-hoc booleans across renderers.

---

## 10. Isolation / focus

Add an `Izoluj element` interaction.

Isolation is view-only.

When active:

- selected member and directly related supports/joints remain strong,
- roof outline remains as ghost context,
- unrelated members are strongly muted or hidden,
- fabrication/detail navigation continues to work.

This is particularly important for H1, J1 and future roofs with openings or many support members.

---

## 11. Fabrication operation model

Current `DetailPreviewModel` is useful, but V9 should formalize the project-level concept of a fabrication operation.

Suggested neutral contract:

```ts
interface FabricationOperationSummary {
  id: string;
  memberPrototypeId: string;
  memberInstanceId?: string;
  type: 'seat-notch' | 'ridge-cut' | 'hip-cut' | 'jack-cut' | 'other';
  relatedSupportId?: string;
  stationMm?: number;
  dimensions: FabricationDimension[];
  markingSteps: FabricationStep[];
  detailPreviewId?: string;
  warnings: FabricationWarning[];
}
```

The exact naming can follow existing domain models.

Important:

- detail previews project from the operation,
- UI labels project from the operation,
- future PDF projects from the operation,
- do not create separate operation definitions for Quick vs Builder.

---

## 12. Member fabrication package

Introduce a reusable package for one member family/prototype:

```ts
interface MemberFabricationPackage {
  prototypeId: string;
  code: string;
  memberType: string;
  section: ...;
  quantity: number;
  lengthGroups: ...;
  operations: FabricationOperationSummary[];
}
```

The package may group identical physical instances.

For current supported roofs this should work with K1/H1/J1 as far as current geometry safely allows.

Do not fabricate missing J1 joinery data. Explicitly mark unavailable/unsupported operations instead.

---

## 13. Roof fabrication package

Create a project-level derived output:

```ts
interface RoofFabricationPackage {
  roofType: ...;
  families: MemberFabricationPackage[];
  warnings: ...[];
}
```

This powers a new Builder section:

```text
PLAN PRZYGOTOWANIA

K1  Krokwiew zwykła      24 szt.
H1  Krokiew narożna       4 szt.
J1  Kulawki               32 szt. / grouped lengths
```

Selecting a family opens its operations/detail context.

This is the foundation for future worker PDFs and quantity/costing, but no PDF is generated in V9.

---

## 14. Preparation UX

Replace the mental model of a generic `Pokaż trasowanie` toggle with a clearer preparation workflow.

Preferred umbrella:

```text
Przygotowanie elementu
```

For a selected family/member:

```text
[Z1 Murłata] [Z2 Płatew P1] [Z3 Płatew P2] [K1 Kalenica]
```

Each operation:

- highlights its location on the member,
- updates the Detail Drawer,
- exposes marking steps,
- exposes cut result,
- can be navigated previous/next.

---

## 15. Before / after cut mode

For supported detail previews, add a projection mode:

```text
Przed cięciem | Po cięciu
```

### Before

- original member profile,
- cut lines,
- removed material highlighted/hatch/translucent,
- support/contact visible.

### After

- final member profile,
- removed area hidden or ghosted,
- support/contact relationship clear.

Both states derive from one canonical operation geometry.

---

## 16. Quick Calc integration

Quick Calc remains the fastest interface.

Use the same operation/package data to show compact cut cards:

```text
ZACIOS
100 / 57.4 mm
[mini detail]

KALENICA
55°
[mini detail]
```

Clicking may expand one local preview.

Do not add Builder layer controls to Quick Calc.

---

## 17. Typed tool registry foundation

Prepare the Toolbox for future `+ Dodaj element` without implementing future element families yet.

Instead of indefinitely hard-coding JSX branches, introduce a typed registry/descriptor concept for existing active tools.

Possible metadata:

```ts
interface WorkbenchToolDescriptor {
  id: string;
  category: 'geometry' | 'timber' | 'support';
  entityKind: ...;
  labelKey: string;
  icon: ...;
  canAdd?: ...;
  add?: ...;
}
```

Do not put React icon objects into domain packages.

Current active tools only:

- roof,
- K1,
- H1/J1 when applicable,
- wall plate,
- purlins,
- ridge.

Future tools (jętka, window, chimney, battens) remain documentation only.

---

## 18. Controlled inline editing

Allow direct editing from the canvas only for values with an unambiguous canonical source.

Possible first proof:

- roof pitch,
- purlin horizontal station,
- controlled seat length.

Derived values remain read-only.

Inline editing must use the same canonical store action/validation as Inspector.

Do not build a general constraint CAD editor.

---

## 19. Performance and bundle direction

V8 reports the main production JS chunk above 500 kB.

V9 should include a small performance pass:

- identify heavy view components,
- lazy-load heavy fabrication/detail sheets when reasonable,
- avoid recalculating domain geometry for hover/camera/drawer changes,
- memoize derived project/fabrication packages,
- keep direct manipulation fluid.

Do not optimize blindly. Measure bundle output and record before/after.

---

## 20. What V9 explicitly does not implement

Do not implement yet:

- backend project save,
- database,
- users/auth,
- PDF export,
- payments,
- cost estimates,
- roof covering products,
- battens/counter battens,
- roof windows,
- chimneys,
- dormers,
- collar ties/posts/struts,
- structural sizing/verification,
- full 3D.

V9 builds the workbench and data foundation those features need.

---

## 21. Definition of success

V9 is successful when:

1. canonical project state and transient UI state have a clear boundary,
2. Builder has scalable `Konstrukcja` / `Cięcia` view presets,
3. selected/focused/isolation behavior is obvious on dense roofs,
4. dynamic legend and dimension levels reduce visual chaos,
5. `Przygotowanie elementu` is operation-driven instead of one generic marking toggle,
6. K1/H1/J1 appear in a reusable roof fabrication package to the extent current geometry supports them,
7. detail previews support clear before/after semantics where valid,
8. Quick Calc reuses the same fabrication operations,
9. the toolbox architecture is ready for future typed `+ Dodaj element`,
10. performance does not regress and bundle work is documented.
