# RoofCalc / CieślaCalc — Architecture V7: Jack Rafters, Contextual Fabrication, and Visual Hierarchy

## 1. Purpose of V7

V7 should consolidate the recent hip-roof work and move the product from “reactive geometric visualization” toward a more complete and useful roof-planning tool.

The primary focus is:
- complete the regular hip-roof member family,
- improve clarity of the builder,
- improve selected-element understanding,
- make results more contextual,
- improve fabrication usefulness,
- keep one canonical math/domain model.

V7 is **not** about adding databases, auth, PDF, 3D, or many new roof types.

---

## 2. Core product principle

The application has two UX surfaces:
- Quick Calc,
- Visual Builder.

But there is still only **one canonical chain**:

```text
TemplateSpec
  ↓
AssemblySpec
  ↓
ResolvedAssembly
  ↓
Member Prototypes + Member Instances
  ↓
Joints / Cuts / FabricationPlan
  ↓
DrawingScene / UI projections
```

No formula duplication between modes.
No second geometry engine for builder-only behavior.

---

## 3. New member family: jack rafters / kulawki

### 3.1 Why this matters
Once a hip roof exists, jack rafters are a mandatory part of the real roof language.
Without them, the roof skeleton is visually and practically incomplete.

### 3.2 Domain model expectations
Add explicit jack-rafter member support.

Suggested conceptual distinction:

```ts
type MemberPrototypeKind =
  | 'common-rafter'
  | 'hip-rafter'
  | 'jack-rafter'
  | 'ridge-board'
  | 'wall-plate'
  | 'purlin';
```

A jack rafter should have:
- prototype identity,
- instance identity,
- side/roof-plane assignment,
- reference spacing position,
- exact resolved geometry,
- resolved meeting condition with hip or ridge support logic,
- fabrication summary.

### 3.3 Generation model
For a regular hip roof, jack rafters should be generated from the roof template according to the common spacing logic.

Do not hand-place every jack rafter in the base implementation.
They should be algorithmically generated from:
- building length,
- building width/span,
- eave logic,
- spacing rules,
- ridge extent,
- hip-line geometry.

### 3.4 Prototype vs instance
At minimum the architecture must distinguish:

```text
Prototype J1
  section, type, generic fabrication meaning

Instances J1/1, J1/2, J1/3...
  resolved positions and lengths
```

This is necessary for later grouped cut lists.

---

## 4. Contextual result system

The current result cards should become **selection-aware**.

### 4.1 Result contexts
Recommended contexts:

1. **Roof context**
   - roof type,
   - footprint size,
   - ridge length,
   - roof height,
   - member counts by family,
   - spacing summary.

2. **Prototype context**
   - prototype code,
   - section,
   - typical length,
   - repeated count,
   - cuts/joints summary.

3. **Instance context**
   - exact instance ID,
   - position,
   - exact resolved length,
   - exact cuts.

4. **Support context**
   - support section,
   - placement,
   - connected members summary.

5. **Joint/cut context**
   - exact dimensions,
   - controlling parameters,
   - local marking instructions.

### 4.2 Fabrication panel
A fabrication panel should become a first-class output area.
Initially it can show the selection only; later it can expand to the whole roof.

---

## 5. Visual hierarchy architecture

### 5.1 Drawing layers
Separate the drawing into semantic layers:
- roof guides / construction guides,
- primary structure,
- secondary repeated members,
- active/selected highlight,
- dimensions,
- interaction handles,
- focused detail overlays.

### 5.2 Selection behavior
When a member/support/joint is selected:
- selected object gets the strong accent color,
- directly related geometry gets medium emphasis,
- unrelated repeated members are visually muted,
- inspector and fabrication panel switch to the same context.

### 5.3 Color semantics
Recommended design-language roles, not exact colors:
- primary structure,
- secondary structure,
- support family,
- active selection,
- hover,
- warning/invalid,
- guide/ghost geometry.

This should be implemented through tokens, not ad hoc inline values.

### 5.4 Roof plane readability
Introduce subtle roof-plane ghost fills or silhouette hints to help the user read planes and edges more quickly.
These must not overwhelm the timber members.

---

## 6. Inspector architecture improvements

The right inspector should become grouped and contextual.

Suggested groups:
- Identity,
- Dimensions,
- Placement,
- Joinery / cuts,
- Fabrication,
- Assumptions / warnings.

Each group can be collapsible.

The inspector should also clearly show whether the selection is:
- a roof root,
- a prototype,
- an instance,
- a support,
- a joint/cut.

---

## 7. Quick Calc architecture guidance

Quick Calc must remain fast.
Do not turn it into a second builder.

Recommended V7 guidance:
- roof-type choice stays simple,
- only a small number of top inputs stay visible,
- “show advanced” reveals deeper inputs,
- the drawing remains compact,
- `Open in Builder` preserves the exact state.

V7 should improve Quick Calc clarity but not overload it with full skeleton editing.

---

## 8. Mathematical / geometry direction

### 8.1 New focus
The next math push should not just add formulas. It should make the member-family relationships explicit and testable.

### 8.2 Jack-rafter geometry contract
The domain docs and tests should clearly define:
- how jack positions are derived,
- how jack lengths vary as they approach the hip,
- how their meeting condition with the hip is represented,
- how roof pitch affects resolved length,
- which assumptions are currently supported.

### 8.3 Purlin interactions
If purlins remain active in the template, the relationship between generated members and purlins must stay predictable and explicit.
If some interactions are not yet supported for hip + purlin combinations, the UI should communicate the limitation honestly.

---

## 9. Performance principles

As skeleton density rises, avoid accidental slowdowns.

Recommended principles:
- resolve geometry in pure memoized selectors,
- keep pointer/drag state separate from heavy geometry resolution where possible,
- separate static repeated geometry from active overlays,
- avoid regenerating unrelated detail panels when only view-camera state changes.

---

## 10. Suggested V7 definition of success

V7 is successful if:

1. a hip roof visibly includes jack rafters,
2. jack rafters are real domain members, not decorative lines,
3. the user can select roof / prototype / instance / support / joint with clear visual feedback,
4. result cards become contextual,
5. fabrication output becomes more useful for the selected item,
6. the skeleton becomes easier to read visually,
7. Quick Calc remains fast,
8. test coverage increases around new geometry,
9. performance remains good despite denser scenes.
