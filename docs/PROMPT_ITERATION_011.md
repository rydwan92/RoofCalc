# Codex Prompt — Iteration 011: Quick Detail Dialogs, Direct Purlin Drag and Geometric Purlin Layout

This is the approved Iteration 011 contract for the current `rydwan92/RoofCalc` repository.

Reference baseline:

- branch: `main`
- latest implemented iteration: `010 — member instance workflow + spatial detail overlays + workbench UX hardening`
- Iteration 010 validation: 266 tests across 31 files, typecheck/lint/build pass

Do not discard user changes. Do not commit or push unless explicitly asked.

---

## 1. Mandatory preparation

Read in full:

1. `AGENTS.md`
2. `PROJECT_BLUEPRINT.md`, especially `WORK CHECKPOINT`
3. `docs/ROOFCALC_PRODUCT_NORTH_STAR.md`
4. `docs/ARCHITECTURE_V9_PROJECT_WORKBENCH_AND_VIEW_SYSTEM.md`
5. `docs/ARCHITECTURE_V10_MEMBER_INSTANCE_WORKFLOW.md`
6. `docs/ARCHITECTURE_V11_DIRECT_MANIPULATION_AND_QUICK_DETAILS.md`
7. `docs/HIP_RAFTER_GEOMETRY.md`
8. `docs/JACK_RAFTER_GEOMETRY.md`
9. `docs/DOMAIN_RESEARCH_ROADMAP.md`
10. current Quick Workspace, Builder, Detail Drawer, Toolbox, SkeletonCanvas, workbench/store and fabrication-package code/tests

Before source edits run:

```bash
git status
git diff --stat
git diff
npx pnpm@10.15.1 typecheck
npx pnpm@10.15.1 test
npx pnpm@10.15.1 build
```

Record baseline test count and preserve local work.

---

## 2. User-visible outcome

This iteration must make a visible UX jump.

After V11:

- Quick Calc should make better use of desktop width.
- K1 and H1 cut cards should be clickable.
- Clicking a cut card should open a large, closable detail without leaving Quick Calc.
- Detail should include larger canonical drawing, Before/After where supported, dimensions and marking instructions.
- Opening Builder from that detail should preserve the same model and operation context.
- In Builder, user-added purlins should be draggable by grabbing the timber body itself.
- Multiple purlins should have a geometric `Rozmieść równo` helper.
- The UI must clearly state that automatic purlin distribution is geometric, not structural verification.

Do not turn the app into CAD. Keep interactions obvious and task-oriented.

---

## 3. First: inspect current V10 implementation

Before changing UX, inspect the current implementation and identify:

- current Quick layout width constraints,
- `QuickCutPreviews` implementation,
- existing `DetailPreviewModel` / Before-After state,
- Detail Drawer reusable pieces,
- `SkeletonCanvas` purlin handles and `startDrag`,
- `movePurlin`, `clampPurlinPlacement`, placement segments,
- V9/V10 typed toolbox registry,
- project vs transient workbench state boundaries.

Do not duplicate logic that already exists.

---

## 4. Quick Calc — desktop layout refinement

The current desktop Quick view leaves excessive unused horizontal space.

Refine the layout so that on desktop:

- the overall content area can become wider,
- inputs remain a compact readable column,
- result/member drawing receives more space,
- cut cards use a useful horizontal grid,
- outer margins do not dominate the screen,
- typography and card widths remain readable.

Suggested relative balance around desktop widths:

```text
inputs 34–40%
results/details 60–66%
```

Do not hard-code one fixed pixel layout. Use responsive CSS/grid/clamp/minmax.

At tablet/mobile, retain a simple stacked flow.

---

## 5. Interactive Quick cut cards

Turn Quick K1/H1 preview cards into interactive semantic controls.

Each card must:

- show code + operation name,
- show compact canonical preview,
- show critical dimensions,
- have clear hover/focus/active affordance,
- work with pointer and keyboard,
- expose a useful accessible name.

Click opens a Quick Detail Dialog for exactly that `DetailPreviewModel`.

Do not use navigation to a separate page.

---

## 6. Quick Detail Dialog / Sheet

Implement a reusable detail surface.

Desktop:
- modal/dialog centered over Quick Calc,
- uses substantially more screen width than the cut thumbnail,
- closable using X and Escape,
- focus handling must be correct,
- background should not accidentally scroll/activate underlying cards during interaction.

Mobile:
- bottom sheet or full-height detail sheet,
- no horizontal overflow,
- close control always reachable.

Content:

1. operation code/name,
2. larger canonical detail drawing,
3. `Przed cięciem / Po cięciu` if the current preview supports both states,
4. key dimensions,
5. `Jak wytrasować` steps,
6. warnings/limitations,
7. `Otwórz w Kreatorze`.

Reuse existing `DetailPreviewDrawing`, detail facts and fabrication-step rendering where possible. Extract reusable components rather than copy/paste Drawer code.

No preview-specific formulas.

---

## 7. Quick-to-Builder contextual handoff

When the user opens Builder from a Quick Detail Dialog:

- preserve the canonical roof/template exactly,
- preserve current display units,
- preserve K1/H1 timber inputs,
- preserve purlins/supports already in the model,
- map the operation to Builder when a stable operation/preview ID exists,
- open the Builder in `Cięcia` preset when entering from a cut detail,
- keep the relevant member/operation selected,
- open/focus the existing Detail Drawer if appropriate.

This is transient navigation only; it must not create project history.

---

## 8. Direct purlin body drag

This is a priority feature.

Currently purlin movement is primarily associated with a small handle. Add direct manipulation on the actual purlin timber body.

Behavior:

```text
hover purlin body
→ purlin visibly becomes editable
→ cursor: grab

pointer down
→ select purlin
→ begin one transaction
→ cursor: grabbing

pointer move
→ project movement onto the existing purlin placement axis
→ canonical support xMm updates reactively
→ all cuts/drawings/results update from normal solver

pointer up
→ commit transaction

Escape
→ cancel and restore starting position
```

Implementation constraints:

- do not use raw pixel deltas as construction values,
- reuse `valueFromAxisDrag` or the current axis/world conversion,
- reuse `movePurlin()` and `clampPurlinPlacement()`,
- use existing valid placement segment/range,
- keep current handle as precision/fallback if useful,
- provide a larger invisible hit target than visual timber thickness,
- prevent canvas pan from stealing an intentional purlin drag,
- do not make wall plate/ridge draggable as purlins,
- do not create a new geometry path for drag previews.

---

## 9. Direct drag feedback

While a purlin is actively dragged, show compact feedback:

- active purlin highlight,
- placement axis/guide,
- current position from the existing datum,
- optionally distances to adjacent purlins if cheap and not cluttered.

The feedback disappears after drag.

Use display units for labels and canonical mm internally.

Avoid adding more permanent dots.

---

## 10. Purlin group UX

Improve Toolbox representation of user-added purlins.

Desired compact direction:

```text
PODPORY
Murłata
Płatwie (3)                 [menu]
  P1
  P2
  P3
  + Dodaj płatew
Kalenica
```

Keep direct one-click selection of individual purlins.

Add a group-level action for `Rozmieść równo`.

Do not add dozens of permanent controls.

---

## 11. Geometric `Rozmieść równo`

Implement a pure deterministic helper that evenly distributes currently existing intermediate purlins over their valid placement range.

Important semantics:

- geometric helper only,
- does not choose structurally correct quantity,
- does not size timber,
- does not verify loads,
- does not claim optimal/safe/recommended spacing.

Preferred behavior for N existing purlins:

- obtain the legal purlin-placement interval from the current geometry/constraints,
- create N evenly distributed interior stations,
- do not place directly on invalid/end support boundaries,
- preserve deterministic order P1..Pn from eave toward ridge,
- apply as one transaction / one Undo entry.

Use a pure function in a geometry/domain package, not React.

Example conceptual formula for an open interval `[start, end]` with N purlins:

```ts
step = (end - start) / (N + 1)
positions[i] = start + step * (i + 1)
```

BUT use the existing legal segment semantics and exclusions rather than blindly applying this formula if the current domain has more precise limits.

---

## 12. Distribution preview / confirmation

Prefer a small popover/dialog:

```text
Rozmieść płatwie

3 płatwie
Tryb: Równo w dostępnym zakresie

P1  1450 → 1280 mm
P2  2210 → 2560 mm
P3  3100 → 3840 mm

ℹ Rozmieszczenie geometryczne. Wymaga weryfikacji konstrukcyjnej.

[ Anuluj ] [ Zastosuj ]
```

If implementing a preview is disproportionately expensive, the initial version may show count/range plus Apply, but the final positions must still be deterministic and undoable.

Do not hide the non-structural warning.

---

## 13. Do not implement structural auto-placement

Do not invent rules such as:

- one purlin every X metres,
- automatic purlin count from rafter length,
- 'recommended' spacing,
- structural optimization.

Correct structural placement requires engineering inputs not currently modeled, including loads, member spans/sections, support conditions and timber/material properties.

A future structural module may later provide a verified proposal.

For now, the only automatic action is geometric arrangement of purlins the user has chosen to include.

---

## 14. Builder desktop usability pass

Use the user's current desktop screenshots as a QA target.

Improve:

- useful canvas width,
- control density above canvas,
- Toolbox hierarchy,
- purlin hover/selection clarity,
- Inspector readability,
- Detail Drawer viewport usage,
- unnecessary page vertical travel where possible,
- duplicated information.

Do not make the page artificially dense. The drawing remains primary.

At desktop widths, consider sticky Inspector/workbench controls only if it improves use and does not create nested-scroll confusion.

---

## 15. Cut/detail visual polish

While touching Quick Detail, improve current details where evidence supports it:

- clear timber body vs removed material,
- stronger cut edge,
- support clearly distinct,
- dimensions readable at large size,
- no clipped labels,
- orientation labels restrained,
- Before/After change visually obvious.

Do not alter canonical geometry to make drawings prettier.

---

## 16. Accessibility and keyboard

Required:

- Quick cut cards keyboard operable,
- dialog focus is contained/restored appropriately,
- Escape closes Quick detail before triggering broader workbench escape behavior,
- purlins remain selectable without drag,
- direct drag has numeric Inspector fallback,
- actions have focus-visible state,
- interaction is not color-only.

---

## 17. Performance

Dragging a purlin may necessarily update canonical geometry reactively, but:

- hover must not resolve the roof,
- opening/closing Quick detail must not resolve geometry,
- Before/After toggles must not resolve geometry,
- dialog state must be transient,
- distribution proposal calculation should be pure/cheap,
- apply distribution should update canonical state once as a grouped transaction where architecture permits.

Preserve the V10 resolved-project memoization boundary.

---

## 18. State boundaries

Keep these transient:

- active Quick detail ID,
- Quick dialog open/closed,
- Before/After UI mode,
- hovered purlin,
- distribution dialog/proposal,
- active drag visual state.

Keep these canonical/future-persistable:

- actual purlin supports,
- their placement,
- section and joint configuration,
- roof/template geometry.

Confirm transient additions do not enter `RoofProjectDocumentV1`.

---

## 19. Required tests

Add/extend tests for:

### Quick detail
- K1 birdsmouth card opens exact K1 preview,
- K1 ridge card opens exact ridge preview,
- H1 card opens H1 preview,
- close button,
- Escape,
- Before/After where supported,
- Quick-to-Builder exact state handoff,
- correct Builder operation selection.

### Purlin dragging
- purlin body pointer-down starts drag,
- support selection occurs,
- world-axis conversion changes canonical xMm,
- legal clamp is respected,
- Escape restores start,
- pointer-up commits exactly one transaction,
- wall plate/ridge do not start purlin drag,
- hover has no domain mutation/resolver call.

### Distribution
- N=1,2,3+ deterministic positions,
- positions inside valid interval,
- stable P1..Pn order,
- invalid/no-space case rejected clearly,
- one apply = one undo step,
- undo restores all previous positions,
- proposal UI state excluded from project document.

### Regression
- existing K1/H1/J1 geometry,
- multiple purlin cuts,
- spacing 940/800 policies,
- Quick/Builder shared math,
- resolver-count guard,
- 360 px no-overflow DOM/CSS behavior where testable.

---

## 20. Browser/manual QA matrix

If a browser surface is available, test production build:

### Desktop
- Quick K1: both cut cards -> dialog -> Before/After -> close,
- Quick H1: detail dialog and warning,
- Quick detail -> Builder contextual handoff,
- gable with 1 purlin: drag timber body,
- gable with 3 purlins: drag each, then `Rozmieść równo`, Undo/Redo,
- hip roof purlin behavior only where current geometry officially supports it,
- zoom/pan must not conflict with purlin drag,
- wide-screen layout around 1440/1600 widths.

### Tablet/mobile
- Quick cards stack cleanly,
- detail sheet usable and closable,
- no horizontal overflow,
- purlin target is touch friendly,
- Inspector remains usable as exact input fallback.

If Browser is unavailable, record that honestly and do not claim native visual QA.

---

## 21. Excluded scope

Do not implement:

- structural purlin recommendations or verification,
- automatic purlin count,
- loads/statics,
- new timber families,
- users/auth/database,
- saved projects,
- PDF/export,
- roof windows/chimneys/dormers,
- battens/counter-battens/covering,
- price/cost engine,
- full 3D/CAD.

---

## 22. Validation and checkpoint

Before finish run:

```bash
npx pnpm@10.15.1 typecheck
npx pnpm@10.15.1 test
npx pnpm@10.15.1 lint
npx pnpm@10.15.1 build
git diff --check
git status
git diff --stat
```

Update `PROJECT_BLUEPRINT.md` -> `WORK CHECKPOINT` with:

- Iteration 011 status,
- Quick detail architecture,
- direct purlin drag contract,
- purlin distribution semantics,
- test counts,
- QA status,
- performance/resolver behavior,
- changed files,
- limitations,
- exact `NEXT ACTION`.

Do not begin Iteration 012 automatically.
