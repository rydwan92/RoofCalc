# RoofCalc / CieślaCalc — Architecture V5: Interactive Timber Skeleton + Direct Manipulation

## 1. Why V5 exists

Iteration 004 proved that RoofCalc can derive a repeated gable-roof skeleton from the same canonical model that drives common-rafter fabrication. The next step is **not another roof type**. The next step is to make the existing Builder feel like a professional technical instrument rather than an explanatory line drawing.

V5 turns the skeleton into a direct-manipulation construction editor while preserving exact numeric control.

The product must continue to have two complementary experiences:

- **Quick Calc** — minimal inputs, immediate fabrication answers.
- **Builder** — visual construction editor, exact inspector and fabrication context.

They must continue to share one canonical template/assembly model and one solver.

---

## 2. Product goal

A user should be able to understand and modify a simple roof by looking at the construction itself.

Desired mental model:

```text
select / drag construction
        ↓
canonical parameter changes
        ↓
roof template resolves
        ↓
skeleton updates
        ↓
rafter assembly updates
        ↓
joints / notches update
        ↓
fabrication plan updates
```

The canvas is not merely a visualization. It is an editor for the same exact parameters available in the inspector.

---

## 3. Do not create a second geometry system

Keep the V4 pipeline:

```text
GableRoofTemplateSpec
        ↓
Resolved template / spacing
        ↓
AssemblySpec
        ↓
ResolvedAssembly
        ↓
FabricationPlan
```

The skeleton renderer receives derived world geometry only.

Direct manipulation must write back to `GableRoofTemplateSpec` / `AssemblySpec` fields. Never store screen pixels as construction geometry.

---

## 4. Skeleton identity: prototype vs instance

Iteration 004 intentionally instances repeated rafters, but every visible rafter currently selects the same fabrication member. That is insufficient for a future whole-roof editor.

Introduce a distinction between:

```text
prototype / definition
    common fabrication geometry shared by many members

instance
    one physical placement in the roof skeleton
```

Conceptually:

```ts
interface SkeletonMemberInstance3D {
  id: EntityId;                 // unique physical instance
  prototypeId?: EntityId;       // e.g. member:rafter-common-1
  selectionId: EntityId;        // normally instance ID in skeleton
  kind: SkeletonMemberKind;
  from: Point3D;
  to: Point3D;
  section?: TimberSection;
  side?: 'left' | 'right' | 'center';
  stationMm?: number;
}
```

Selecting `instance:rafter-pair-4:left` should allow the UI to say:

- this is physical rafter instance #4 left,
- it currently uses prototype `common-rafter`,
- editing the prototype changes all identical instances.

Do not implement per-instance fabrication overrides yet. Only prepare identity correctly.

---

## 5. Solid-looking 2.5D timber members

The current skeleton uses simple SVG lines. V5 should make the construction substantially more legible without introducing Three.js.

Render important structural members as **projected timber solids / bands** derived from their real section dimensions:

- rafters,
- wall plates,
- ridge,
- purlins.

The domain should expose member axis + section + orientation metadata sufficient for a renderer-neutral solid/ribbon representation.

Preferred path:

```text
3D member axis + section
        ↓
small pure prism/ribbon geometry helper
        ↓
project faces/corners axonometrically
        ↓
SVG polygons/edges
```

This is still explanatory 2.5D, not structural 3D CAD.

### Rendering requirements

- preserve proportions enough to communicate timber thickness,
- selected item must clearly stand out,
- far/near overlap order should be deterministic,
- supports should be visually distinct from rafters,
- no excessive gradients or photorealistic textures,
- use restrained timber/technical styling,
- line-only fallback may be used at very small zoom.

---

## 6. Skeleton direct-manipulation handles

Add explicit, discoverable handles. Every handle represents an exact canonical parameter.

### Pitch / ridge-height handle

A handle at the roof ridge cross-section changes `pitchDeg` while half-run remains fixed.

Geometry:

```text
rise = halfRun * tan(pitch)
pitch = atan(rise / halfRun)
```

Pointer movement is constrained to the projected vertical/rise control axis.

Show live:

```text
35.0°
2800.8 mm
```

Inspector numeric input remains authoritative and available.

### Span / half-run handle

A symmetric eave/wall handle changes `halfRunMm`.

The opposite side mirrors automatically for the symmetric gable template.

Show live full span and half-run.

### Building-length handle

A handle on the far end frame changes `buildingLengthMm` along the ridge direction.

Repeated rafter instances update immediately.

### Purlin handle

Purlins must be draggable directly in the skeleton, not only in the side-profile view.

The drag is constrained to the roof slope parameter represented by the purlin's canonical horizontal `xMm` from wall reference.

Project pointer delta onto the screen-space direction produced by a small canonical change in `xMm`; convert it back into millimetres, then snap/clamp.

No inverse-perspective guessing is needed because the axonometric projection is linear.

---

## 7. Multiple purlins

The solver already supports multiple separated intermediate supports. V5 should expose this capability in Builder.

Requirements:

- `+ Płatew` can add another purlin while valid space remains,
- each receives a stable ID such as `support:purlin-1`, `support:purlin-2`, ...,
- each is independently selectable,
- each has exact position/section/joint settings,
- each creates its own resolved seat-notch joint in the canonical rafter assembly,
- fabrication stations are ordered along the rafter,
- each appears symmetrically on both roof slopes in the simple gable template,
- each can be removed explicitly,
- invalid overlap is prevented by domain validation/placement rules.

Do not create separate `Purlin1Calculator`, `Purlin2Calculator`, etc.

---

## 8. Interaction transaction model

Direct manipulation should feel immediate but not pollute future undo history with hundreds of pointer-move states.

Model a gesture as:

```text
pointer down
  → begin edit transaction

pointer move
  → preview canonical values live

pointer up
  → commit one edit transaction

Escape / pointer cancel
  → restore start value
```

This transaction model should be reusable for ridge, span, length and purlin dragging.

---

## 9. Undo / redo

A professional editor needs recovery from experimentation.

Add lightweight local history for Builder/template edits.

Scope:

- numeric committed edits,
- add/remove purlin,
- completed drag/scrub gestures,
- spacing mode/value changes,
- pitch/run/length changes.

Rules:

- pointer-move frames are coalesced into one history entry,
- invalid text drafts are not history states,
- unit/language/view selection is not domain history,
- reset should be reversible if straightforward; otherwise confirm/document behavior,
- cap history to a reasonable number such as 30–50 snapshots.

Expose keyboard shortcuts where appropriate:

- Ctrl/Cmd+Z — undo,
- Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y — redo.

---

## 10. Viewport / camera interaction

Unify canvas navigation into a small reusable viewport controller.

Required for Skeleton:

- wheel/trackpad zoom,
- touch pinch if practical with Pointer Events,
- pan on background drag / middle mouse / explicit pan gesture,
- `Fit` action,
- sensible min/max zoom,
- selected-item focus.

Do not mix camera state with domain state.

Conceptually:

```ts
interface ViewportState {
  zoom: number;
  panX: number;
  panY: number;
}
```

The same viewport helpers should be reusable by the rafter/fabrication canvas where sensible.

---

## 11. Reduce mode switching further

`Szkielet / Krokiew` may remain as a secondary fallback control internally, but the preferred user flow becomes contextual.

### Skeleton default

The Builder opens in Skeleton.

### Select a rafter instance

Show:

- selected physical instance,
- prototype/section information,
- important live dimensions,
- action `Otwórz element` / `Przygotuj krokiew`.

Opening the member view preserves selection and offers an obvious `Wróć do szkieletu` action.

### Select a cut/joint

Show the existing contextual detail lens; no permanent Detail mode.

Goal: a user should not need to understand an application view hierarchy before using the construction.

---

## 12. Contextual dimensions on skeleton

Do not flood the skeleton with fabrication dimensions.

Default skeleton dimensions:

- span,
- building length,
- ridge height or pitch,
- rafter pair count / actual spacing.

When selected:

### Rafter instance
- station along building length,
- side,
- common-rafter length.

### Purlin
- distance from wall reference,
- height derived from slope,
- related notch seat/depth summary.

### Ridge/roof handle
- live pitch and rise.

Dimension placement should use semantic screen lanes/callouts rather than manual per-case pixel constants.

---

## 13. On-canvas numeric feedback

During drag/scrub, show a compact floating value chip adjacent to the active handle.

Examples:

```text
Kąt połaci
37.5°

Rozpiętość
8 420 mm

Płatew P2
2 360 mm od murłaty
```

This value is transient UI only; canonical numeric value stays in the model.

Keyboard arrows should provide exact small-step adjustment for selected handles/entities.

---

## 14. Builder layout refinement

Desktop target:

```text
┌──────────────┬──────────────────────────────────────┬──────────────┐
│ TOOLBOX      │                                      │ INSPECTOR    │
│ collapsible  │         INTERACTIVE SKELETON         │ contextual   │
│              │                                      │ exact values │
└──────────────┴──────────────────────────────────────┴──────────────┘
│ LIVE FABRICATION / SELECTED MEMBER BAR                           │
└─────────────────────────────────────────────────────────────────┘
```

The canvas should visually dominate.

Toolbox should behave more like a compact construction palette than navigation.

Inspector should avoid showing fields unrelated to the selected object.

---

## 15. Mobile Builder

At phone width:

- skeleton occupies most of the first screen,
- top-level Quick/Builder mode remains clear,
- tools are opened from a compact bottom action button/sheet,
- selected object opens a bottom inspector,
- detail/fabrication can expand from that sheet,
- pan/zoom and object dragging must not cause horizontal page scroll,
- exact numeric editing always remains available.

Quick Calc remains the default/easiest mobile path.

---

## 16. Quick Calc refinement

Do not overload Quick Calc with skeleton-builder controls.

Keep:

- run/half-span,
- pitch,
- overhang,
- immediate member/rise/stock result,
- expandable cut/section details,
- compact fabrication drawing,
- `Otwórz kreator` preserving exact canonical state.

Optionally show a tiny roof-context preview, but Quick Calc must stay faster than Builder.

---

## 17. Visual semantics

Use a consistent visual language:

- timber member faces: warm restrained wood tone,
- supports: distinct technical/support tone,
- selected entity: high-contrast accent outline,
- editable handle: visible circular/diamond control,
- active drag guide: accent line,
- dimensions: muted technical line + strong value,
- invalid geometry: local red/error cue, never replace entire canvas.

Respect `prefers-reduced-motion`.

Use subtle transitions only to show causality after an edit.

---

## 18. Architectural preparation for future roof systems

V5 still implements only a simple symmetric gable roof.

However, the new skeleton identity/instance/solid/interaction architecture should allow future templates to introduce:

- collar ties / jętki,
- additional purlins,
- posts,
- struts,
- braces,
- hip/valley members,
- openings/dormers later.

Do not encode assumptions such as `all roof members are rafters` in generic rendering/selection code.

---

## 19. Explicit non-goals for V5

Do not implement yet:

- hip roof geometry,
- valley geometry,
- jack rafters,
- collar tie/jętka domain geometry,
- structural capacity/load verification,
- database/auth,
- projects/history persistence,
- PDF/e-mail,
- payment,
- Three.js/full 3D CAD.

The purpose of V5 is to make the **existing gable roof model feel like a real editor** and prove multiple supports/direct manipulation.

---

## 20. V5 success criteria

V5 is successful when:

1. Skeleton members have readable physical thickness rather than being only lines.
2. Repeated rafter instances have unique physical IDs linked to one fabrication prototype.
3. A user can drag the ridge/pitch handle and see skeleton + fabrication update live.
4. A user can adjust span/half-run visually and numerically.
5. A user can adjust building length visually and numerically.
6. Purlin can be dragged directly in Skeleton.
7. More than one purlin can be added, selected, moved and removed.
8. Every purlin produces ordered fabrication/joint output from the same solver.
9. Undo/redo works for meaningful Builder edits and coalesces drag gestures.
10. Skeleton supports pan/zoom/fit without changing domain geometry.
11. Selecting a physical rafter instance clearly links to its common fabrication prototype.
12. The UI needs fewer deliberate view switches: selection/context drives details.
13. Desktop and ~360px mobile remain usable.
14. All math/domain behavior remains tested, local and deterministic.
