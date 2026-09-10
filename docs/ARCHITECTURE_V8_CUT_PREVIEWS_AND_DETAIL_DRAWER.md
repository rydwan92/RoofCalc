# RoofCalc / CieślaCalc — Architecture V8: Cut Previews, Detail Drawer, and Fast Builder UX

## 1. Purpose of V8

V8 should improve the application's usefulness during actual preparation and cutting work.
The focus is not to add a large new roof family, but to create a product-quality system for:
- local cut visualization,
- fast contextual detail access,
- selection-aware zoom/focus,
- better tool-panel behavior,
- more intuitive fabrication guidance.

V8 must remain consistent with the one-model architecture of RoofCalc.

---

## 2. Architectural principle

There is still only one canonical data chain:

```text
TemplateSpec
  ↓
AssemblySpec
  ↓
ResolvedAssembly
  ↓
Members / Supports / Joints
  ↓
FabricationPlan
  ↓
View Projections (skeleton, single member, detail preview, quick preview)
```

Key rule:
**detail previews are derived projections**, not separately calculated geometry.

This means:
- no duplicate cut math for detail views,
- no separate “preview-only” formulas,
- no divergence between builder and quick mode.

---

## 3. New concept: DetailPreviewModel

Introduce a dedicated derived view model for local cut/joint previews.

Suggested concept:

```ts
interface DetailPreviewModel {
  id: string;
  sourceSelectionId: string;
  type:
    | 'birdsmouth-detail'
    | 'ridge-cut-detail'
    | 'hip-cut-detail'
    | 'support-contact-detail'
    | 'generic-joint-detail';
  title: string;
  subjectMemberId: string;
  relatedSupportId?: string;
  focusBounds: Bounds2D;
  localView: LocalGeometryView;
  dimensions: DetailDimension[];
  labels: DetailLabel[];
  fabricationSteps: FabricationStepRef[];
  warnings: string[];
}
```

This model is not the domain source of truth. It is a structured presentation layer derived from the resolved assembly and fabrication data.

---

## 4. Local geometry projection

A cut detail should often be shown in a local coordinate system.

Examples:
- along member axis,
- perpendicular to member axis,
- top/plumb/face-oriented mini-view,
- simplified section/elevation style.

Suggested concept:

```ts
interface LocalGeometryView {
  frame: 'member-elevation' | 'member-section' | 'joint-face' | 'plan';
  shapes: DetailShape[];
  referenceAxes: AxisGuide[];
}
```

This allows the app to present a cut from the best explanatory viewpoint instead of only reusing the whole-roof canvas.

---

## 5. Selection-aware detail flow

### 5.1 Supported selection types
The UI must handle at least:
- roof root,
- member prototype,
- member instance,
- support,
- joint/cut.

### 5.2 Detail behavior
When a joint/cut or cut-related marker is selected:
- generate/open `DetailPreviewModel`,
- highlight related region in the main canvas,
- open detail drawer automatically (unless dismissed),
- show zoomed preview,
- show fabrication details and measurement logic.

When a member instance is selected:
- detail drawer may show the most relevant cuts for that member,
- user can switch between them quickly.

---

## 6. New UI concept: Detail Drawer / Detail Sheet

### Desktop
Recommended pattern:
- docked bottom detail drawer or lower split panel,
- can be collapsed,
- can be pinned open,
- can contain tabs or segmented controls if multiple local details exist.

### Mobile
Recommended pattern:
- bottom sheet,
- partial / medium / expanded states,
- swipe interaction,
- quick close.

### Content groups
Suggested sections inside the detail area:
- Detail preview,
- Key dimensions,
- Marking steps,
- Notes / assumptions.

---

## 7. Quick Calc preview architecture

Quick Calc should gain compact detail previews for the most important outputs.

Key rule:
- Quick Calc does not expose full editor complexity,
- but it may show one compact explanatory preview card.

Example:
- common rafter result card with mini birdsmouth preview,
- ridge cut mini preview,
- hip rafter top cut mini preview.

This preview must use the same derived detail projection system.

---

## 8. Toolbox architecture improvements

The toolbox should evolve into a faster working instrument.

Recommended capabilities:
- collapsible groups,
- compact mode on desktop,
- selected-item shortcut section,
- “jump to active selection type”,
- quick add controls for supported supports,
- clearer active state styling.

The toolbox should support fast orientation, not feel like a form-heavy sidebar.

---

## 9. Fabrication guidance model

Fabrication guidance should be structured, not purely textual.

Suggested concept:

```ts
interface FabricationInstructionBlock {
  id: string;
  subjectId: string;
  title: string;
  steps: FabricationStep[];
  keyDimensions: FabricationDimensionRef[];
  referencePoints: ReferencePointRef[];
}
```

The UI may render this as:
- numbered steps,
- short imperative text,
- linked dimensions,
- highlightable points in the detail preview.

This is especially useful for:
- birdsmouth,
- ridge cut,
- hip rafter cut,
- future jack-rafter/valley details.

---

## 10. Visual hierarchy rules for V8

The product should communicate meaning visually.

Recommended semantics:
- selected element: strongest accent,
- related cuts / local markers: secondary accent,
- non-selected unrelated repeated members: muted,
- guide geometry: low-emphasis ghost style,
- editable handles: clearly interactive,
- detail preview dimensions: highest legibility priority.

Do not overload the UI with bright colors.
Aim for a professional workshop instrument.

---

## 11. Performance guidance

Detail previews must feel immediate.

Recommended approach:
- derive detail previews from memoized resolved assembly data,
- isolate camera state from geometry resolution,
- avoid full-canvas rerender when only the detail drawer tab changes,
- cache reusable detail projections for the active selection when possible.

---

## 12. V8 definition of success

V8 is successful if:
1. selecting a cut or cut-relevant area shows a useful close-up preview,
2. the detail preview is dimensioned and understandable,
3. fabrication steps are clearer and more contextual,
4. Quick Calc gets compact explanatory cut previews,
5. toolbox flow becomes faster and cleaner,
6. the main canvas and detail panel feel coordinated,
7. no duplicate math is introduced.
