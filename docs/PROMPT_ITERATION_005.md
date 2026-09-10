# Codex Prompt — Iteration 005: Interactive Solid Skeleton + Multi-Purlin Builder

You are continuing the existing `rydwan92/RoofCalc` project.

Do not rewrite the repository.
Do not start a new application.
Do not replace the existing domain engine with UI-specific math.

Before code:

1. read `AGENTS.md`,
2. read `PROJECT_BLUEPRINT.md`,
3. read `docs/ARCHITECTURE_V3_WORKBENCH.md`,
4. read `docs/ARCHITECTURE_V4_ROOF_SKELETON.md`,
5. read `docs/ARCHITECTURE_V5_INTERACTIVE_SKELETON.md`,
6. read `docs/DOMAIN_RESEARCH_ROADMAP.md`,
7. inspect `PROJECT_BLUEPRINT.md` → `WORK CHECKPOINT`,
8. run:
   - `git status`
   - `git diff --stat`
   - `git diff`
   - `pnpm typecheck`
   - `pnpm test`
   - `pnpm build`

Preserve user changes.
Do not use destructive Git commands.

The repository already has a validated Iteration 004 implementation with:

- `GableRoofTemplateSpec`,
- repeated rafter spacing,
- a shared Quick/Builder canonical state,
- common-rafter fabrication,
- one optional purlin,
- side-profile purlin dragging,
- a lightweight axonometric SVG skeleton,
- contextual inspector and fabrication output.

Extend this implementation. Do not replace it.

---

# Goal of Iteration 005

Make the Builder feel like a **professional direct-manipulation carpentry tool** rather than a static roof preview.

The most important visible outcome is:

> The user can work directly on a solid-looking 2.5D roof skeleton, select physical members, drag key construction parameters, add multiple purlins, zoom/pan, undo mistakes and immediately see fabrication consequences.

Quick Calc must remain simple.

Do NOT add another roof type yet.

---

# 1. Establish repository reality first

Inspect the current implementation and identify:

- current `SkeletonMember3D` / skeleton types,
- how repeated rafter IDs work,
- current projection helpers,
- current Builder view-switch behavior,
- how purlin dragging works in the side/profile canvas,
- how Zustand stores canonical template state,
- how history/reset currently behaves,
- where drawing selection IDs are generated.

Document any implementation detail that differs from V5 assumptions.

Do not introduce abstractions that duplicate an existing good helper.

---

# 2. Prototype vs physical instance identity

Refactor the skeleton member model so each visible repeated rafter is a unique physical instance.

A physical instance must have a unique ID, e.g.:

```text
instance:rafter-pair-1:left
instance:rafter-pair-1:right
instance:rafter-pair-2:left
...
```

It should also reference the common fabrication prototype/member definition, e.g.:

```text
member:rafter-1
```

Selecting one rafter in the skeleton should not make every visible rafter look individually selected unless the UI intentionally indicates that the common prototype is being edited.

Inspector should communicate both concepts clearly:

```text
Krokiew #4 — lewa połać
Typ: krokiew zwykła
Przekrój: 80 × 200 mm
Pozycja: 2400 mm od początku budynku
Wspólny element produkcyjny: K1
```

Do not implement per-instance custom lengths/cuts yet.

Editing common section/roof geometry still updates all repeated common-rafter instances.

Add tests for identity and selection mapping.

---

# 3. Upgrade skeleton from lines to solid-looking timber

The current line skeleton is too schematic.

Introduce a renderer-neutral helper/model that can derive a small rectangular ribbon/prism representation from:

- 3D member axis,
- member section,
- member kind/orientation hints.

Render projected SVG faces/polygons for at least:

- rafters,
- wall plates,
- ridge,
- purlins.

Use real section values where available.

Requirements:

- deterministic face ordering,
- selected item clearly highlighted,
- readable at desktop and mobile sizes,
- no photorealistic texture requirement,
- no Three.js,
- no canvas library as source of truth,
- line fallback allowed when projected thickness becomes too small.

Do not perform fabrication calculations in the renderer.

Add pure geometry/projection tests.

---

# 4. Add skeleton viewport interaction

Make Skeleton a real navigable technical canvas.

Implement a reusable viewport controller/state separate from domain state.

Required:

- wheel/trackpad zoom,
- pan on background drag or another unambiguous gesture,
- `Dopasuj` / Fit action,
- min/max zoom,
- selected-entity focus helper,
- no page horizontal scroll caused by canvas interaction.

If practical with the existing Pointer Event system, support pinch zoom on touch. If it would destabilize the iteration, document it as follow-up rather than adding a large dependency.

Camera/viewport changes must never modify roof geometry.

Prefer reusable helpers that can later be shared with the rafter/profile drawing.

---

# 5. Direct pitch / ridge-height editing on the skeleton

Add a visible handle near the ridge cross-section.

Dragging it vertically in the roof cross-section should change canonical `pitchDeg` while `halfRunMm` stays fixed.

Use:

```text
pitch = atan(rise / halfRun)
```

and existing template resolution for all downstream results.

During drag show a compact live value chip:

```text
Kąt połaci
37.5°
Wysokość kalenicy
3069 mm
```

Rules:

- snap to sensible increments for drag convenience, e.g. 0.5° or 1° depending modifier/zoom,
- exact typed input remains available,
- Shift/keyboard may provide finer/coarser adjustment,
- Escape/cancel restores start value,
- one completed drag = one history transaction,
- skeleton and common-rafter fabrication update continuously during drag.

Add tests for the pure pointer-delta/axis conversion helper and pitch synchronization.

---

# 6. Direct span / half-run editing

Add an obvious symmetric eave/wall control.

Dragging changes canonical `halfRunMm` while the gable remains symmetric.

Show live:

```text
Rozpiętość 8420 mm
Półbieg 4210 mm
```

Update immediately:

- wall plate locations,
- ridge height for fixed pitch,
- rafter length,
- notch/ridge fabrication geometry,
- purlin legal ranges.

Do not let an invalid drag produce NaN/Infinity or overlapping illegal supports.

Define/document clamping behavior.

---

# 7. Direct building-length editing

Add a handle on the far/end frame or ridge end.

Dragging along the projected ridge/building-length axis changes `buildingLengthMm`.

Repeated rafter placements must update live using the existing spacing resolver.

Show:

```text
Długość budynku 9200 mm
12 par krokwi
Rozstaw rzeczywisty 836.4 mm
```

Keep current spacing mode semantics explicit.

Add tests proving cross-section fabrication geometry is unchanged when only building length changes.

---

# 8. Purlin dragging directly in Skeleton

Iteration 004 only made the purlin visually react in Skeleton while exact drag remains in the profile view.

V5 must allow direct purlin manipulation in the skeleton itself.

For each purlin:

- render an obvious selection/hit area,
- drag along the allowed roof-slope parameter,
- convert pointer movement to canonical `placement.xMm`,
- reuse the same snap/clamp policy as the side/profile interaction where possible,
- show live position chip,
- update both left/right symmetric purlin lines,
- update the same resolved notch/fabrication plan immediately.

The side/profile view and skeleton must not have separate purlin positions.

Add integration tests for same-model synchronization.

---

# 9. Expose multiple purlins in the Builder

The domain solver already supports multiple separated intermediate supports. Expose that in UI.

Requirements:

- `Dodaj płatew` adds another valid purlin with a stable sequential ID,
- adding chooses a sensible free initial station but does not silently overlap existing supports,
- allow more than one purlin while valid space exists,
- toolbox lists each independently, e.g. `Płatew P1`, `Płatew P2`, ...,
- selecting a purlin selects both symmetric visual rails but one canonical support entity,
- each has its own position, width, height and notch control,
- each can be removed explicitly,
- each generates its own ordered fabrication/joint station,
- all purlins appear in Skeleton and the rafter/profile fabrication view.

Do not add one special calculator per purlin.

Do not arbitrarily cap at one. A small UI cap such as 3 may be used only if clearly documented as a temporary product limit; the domain should remain dynamic.

Add tests for 0/1/2/3 purlin cases and invalid overlap.

---

# 10. Add edit transactions and Undo / Redo

Add lightweight local history around canonical Builder/template edits.

History should include:

- committed numeric geometry edits,
- add/remove purlin,
- completed purlin drag,
- completed pitch/span/building-length drag,
- spacing edits.

Do not add every pointer-move frame to history.

One gesture = one undo step.

Do not include:

- unit switch,
- language switch,
- current selected entity,
- viewport pan/zoom,
- invalid raw input drafts.

Add toolbar actions:

- Undo,
- Redo,

with disabled states and accessible labels.

Support:

- Ctrl/Cmd+Z,
- Ctrl/Cmd+Shift+Z,
- Ctrl/Cmd+Y where appropriate.

Keep a bounded history, e.g. 40 snapshots.

Add focused store tests.

---

# 11. Reduce visible view switching

The current explicit `Szkielet / Krokiew` switch may remain as a fallback/secondary control, but it should no longer be the primary mental model.

Preferred flow:

### Builder opens in Skeleton

### User clicks a rafter instance

Inspector shows the physical instance and common prototype.

Offer one clear action:

```text
Otwórz element
```

This opens the existing detailed fabrication/member view.

### User clicks a notch/cut

Use the contextual detail lens.

### Return

Provide obvious:

```text
Wróć do szkieletu
```

Do not introduce more permanent top-level tabs.

If removing the existing compact switch cleanly is safe, replace it with contextual actions. If not, visually demote it and document why.

---

# 12. On-canvas dimensions and live feedback

Improve the skeleton's visual explanation.

Default high-level dimensions:

- total span,
- building length,
- ridge height and/or pitch,
- rafter spacing summary.

Selection-specific overlays:

### Rafter instance
- along-building station,
- left/right side,
- common rafter length.

### Purlin
- horizontal distance from wall reference,
- derived elevation,
- seat/depth summary.

### Active drag
- floating value chip,
- axis/guide line,
- snap indication.

Keep fabrication dimensions out of the global skeleton unless relevant to the selected item.

Use semantic layout rather than dozens of hardcoded pixel offsets.

---

# 13. Improve visual hierarchy

This iteration must create a visible quality jump.

The skeleton should read like a real timber frame:

- members have thickness,
- near/far geometry is understandable,
- selected member is unmistakable,
- purlins and wall plates are distinguishable,
- canvas background remains restrained,
- controls feel like a technical instrument,
- selected values and dimensions are readable at a glance.

Do not solve this with heavy gradients/glows.

Use motion only to communicate cause/effect and respect `prefers-reduced-motion`.

---

# 14. Builder toolbox refinement

Toolbox should behave as a construction palette.

Suggested desktop groups:

```text
GEOMETRIA
Połać / dach

DREWNO
Krokiew

PODPORY
Murłata
Płatew P1
Płatew P2
+ Dodaj płatew
Kalenica
```

When collapsed, show compact icons with accessible tooltips.

On mobile use a compact action bar / bottom sheet instead of a full left column.

Do not expose unimplemented future elements as clickable tools.

---

# 15. Quick Calc must stay fast

Do not move Builder complexity into Quick Calc.

Quick should continue to show a minimal fast path:

- run/half-span,
- pitch,
- overhang,
- immediate rafter/rise/stock results,
- optional expanded cut/section settings,
- compact fabrication drawing,
- `Otwórz kreator` preserving state.

If multiple purlins already exist because the user entered Builder first, Quick may summarize that advanced supports are present without exposing the whole support editor.

---

# 16. Responsive/mobile

At ~360px width:

- Skeleton is still the visual focus in Builder,
- no horizontal page scrolling,
- selected-object inspector behaves as a bottom sheet/accordion,
- toolbox opens from a compact action,
- handles remain touchable without hiding the construction,
- pan/zoom vs object drag gestures are unambiguous,
- exact numeric editing is easy,
- Undo/Redo remains reachable but not visually dominant.

Do not merely stack all desktop panels vertically.

---

# 17. Tests

Add/maintain tests for at least:

- unique physical rafter instance IDs + prototype mapping,
- solid member/prism projection helper,
- deterministic projected face ordering,
- ridge/pitch drag mapping,
- span drag mapping,
- building-length drag mapping,
- purlin skeleton drag → exact canonical support movement,
- 0/1/2/3 purlin resolution and ordering,
- invalid purlin overlap/range,
- Undo/Redo for numeric edit,
- Undo/Redo for add/remove support,
- one drag = one history entry,
- cancel drag restores start state,
- viewport pan/zoom does not change canonical template,
- Builder/Quick canonical equivalence,
- existing common-rafter/birdsmouth/ridge regressions,
- no NaN/Infinity propagation.

Add UI integration tests for the most important direct-manipulation path where practical.

---

# 18. Do not implement yet

Do NOT implement during Iteration 005:

- hip roof,
- valley roof,
- jack rafters,
- collar ties/jętki,
- posts/struts,
- structural load/capacity checks,
- database,
- authentication,
- project persistence,
- PDF/e-mail,
- payment,
- Three.js/full 3D CAD.

V5 must first prove that the simple gable model is an excellent editor.

---

# 19. Documentation

If implementation details differ from the architecture, update:

- `docs/ARCHITECTURE_V5_INTERACTIVE_SKELETON.md`

Add a concise interaction/geometry document if useful, e.g.:

- `docs/SKELETON_INTERACTION_GEOMETRY.md`

Document:

- skeleton member instance/prototype identity,
- projection/solid geometry assumptions,
- pointer-to-domain conversion for each handle,
- history transaction model,
- purlin placement rules.

---

# 20. Validation

Before stopping run:

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
git diff --check
git status
git diff --stat
```

Fix known implementation errors before ending.

Perform visual QA at desktop and approximately 360px mobile width if a browser surface is available.

Specifically verify:

- no horizontal overflow,
- solid skeleton legibility,
- selected rafter instance behavior,
- multiple purlin selection,
- pitch/span/length direct manipulation,
- purlin drag in Skeleton,
- pan/zoom/fit,
- undo/redo,
- switch/open flow from Skeleton to fabrication member,
- Quick Calc remains simpler than Builder.

Update `PROJECT_BLUEPRINT.md` → `WORK CHECKPOINT`.

At the start of implementation, change checkpoint intent to Iteration 005. At the end record:

- implemented scope,
- instance/prototype identity model,
- solid skeleton model,
- viewport model,
- drag mappings,
- purlin behavior,
- history/transaction behavior,
- tests/build results,
- browser/mobile QA,
- known limitations,
- exact `NEXT ACTION`.

Do not begin Iteration 006 automatically.

---

# Expected final report

Report clearly:

1. what changed architecturally,
2. how the solid skeleton renderer works,
3. how physical rafter instances map to fabrication prototypes,
4. which values are directly draggable,
5. how multiple purlins work,
6. how undo/redo works,
7. how pan/zoom/focus works,
8. how skeleton selection opens fabrication context,
9. what changed visually on desktop/mobile,
10. what tests were added,
11. typecheck/test/lint/build results,
12. remaining limitations,
13. exact `NEXT ACTION` from the checkpoint.
