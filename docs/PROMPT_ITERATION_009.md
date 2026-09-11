# Codex Prompt — Iteration 009: Project Workbench, Smart Views, and Fabrication Package

You are continuing the existing `rydwan92/RoofCalc` repository after Iteration 008.

Do not rewrite the project.
Do not discard working V8 geometry, spacing, cut-preview, selection or undo/redo behavior.

## 0. Mandatory reading

Read in full before editing source:

- `AGENTS.md`
- `PROJECT_BLUEPRINT.md`
- `docs/ROOFCALC_PRODUCT_NORTH_STAR.md`
- `docs/ARCHITECTURE_V3_WORKBENCH.md`
- `docs/ARCHITECTURE_V4_ROOF_SKELETON.md`
- `docs/ARCHITECTURE_V5_INTERACTIVE_SKELETON.md`
- `docs/ARCHITECTURE_V6_HIP_ROOF_AND_RAFTER.md`
- `docs/ARCHITECTURE_V7_JACK_RAFTERS_AND_FABRICATION.md`
- `docs/ARCHITECTURE_V8_CUT_PREVIEWS_AND_DETAIL_DRAWER.md`
- `docs/ARCHITECTURE_V9_PROJECT_WORKBENCH_AND_VIEW_SYSTEM.md`
- `docs/HIP_RAFTER_GEOMETRY.md`
- `docs/JACK_RAFTER_GEOMETRY.md`
- `docs/DOMAIN_RESEARCH_ROADMAP.md`
- current `WORK CHECKPOINT` in `PROJECT_BLUEPRINT.md`

If some user-supplied local V8.1/V8.2 notes are not tracked in Git, do not require them for build correctness. Use the committed V9 docs as the approved iteration contract.

---

## 1. Preflight

Run:

```bash
git status
git diff --stat
git diff
pnpm typecheck
pnpm test
pnpm build
```

Record baseline test count and build/bundle output.

Do not discard unrelated user work.

---

## 2. Main goal

The product has enough geometry to expose the next problem: workbench complexity.

Iteration 009 must make RoofCalc easier to scale without turning Builder into a dense CAD screen.

Primary objectives:

1. explicit canonical-project vs transient-UI state boundary,
2. smart `Konstrukcja` / `Cięcia` view presets,
3. isolate/focus and dimension decluttering,
4. project-level fabrication package,
5. clearer `Przygotowanie elementu` workflow,
6. toolbox foundation for future typed `+ Dodaj element`,
7. small performance/bundle pass.

This iteration should produce a visible UX improvement, not only internal refactoring.

---

## 3. Canonical project document boundary

Introduce an explicit serializable canonical project document/snapshot type with schema version.

Minimum concept:

```ts
interface RoofProjectDocumentV1 {
  schemaVersion: 1;
  project: {
    roof: RoofTemplateSpec;
  };
}
```

Exact names can differ.

Requirements:

- serialization round-trip test,
- no selection/hover/pan/zoom/drawer/toolbox state in this document,
- canonical project history/undo continues to operate on domain snapshots,
- no backend/database/persistence service yet.

If current Zustand code can be cleanly split into domain and workbench slices/stores, do so without unnecessary churn.

At minimum create a clear type/module boundary and selectors.

---

## 4. Separate transient workbench state

Move/organize UI-only state under a clear workbench-view contract:

- Quick/Builder mode,
- selected entity/prototype,
- current view preset,
- isolate/focus,
- dimension level,
- toolbox collapsed groups,
- inspector open,
- detail drawer open/pinned/active,
- canvas camera/hover state where appropriate.

Changing these values must not create canonical project undo entries.

Keep input drafts/validation behavior correct and document whether they are transient editor state or committed canonical input.

---

## 5. Replace scaling view logic with view presets

Implement fully:

```text
Konstrukcja
Cięcia
```

Do not remove access to current single-rafter/H1 preparation views if they are still useful; make them contextual/focus views rather than the long-term primary top-level architecture.

### Konstrukcja preset

Show:

- roof context,
- structural member families,
- supports,
- direct manipulation handles,
- only essential/selected dimensions.

### Cięcia preset

Show:

- selected member or prototype strongly,
- current fabrication operations,
- involved supports,
- cut markers/datums,
- active operation dimensions,
- unrelated geometry heavily muted.

Use a derived semantic projection policy instead of spreading visibility booleans through renderers.

---

## 6. Add isolation/focus

Add a user action such as:

```text
Izoluj element
```

When active:

- selected member/prototype/instance stays strong,
- directly related supports/joints stay visible,
- roof outline/planes remain ghost context,
- unrelated repeated members are muted or hidden,
- no project/domain geometry changes occur.

Provide an obvious exit/reset action.

Test that isolation does not mutate canonical project state/history.

---

## 7. Dynamic legend

Add a compact contextual legend generated from visible scene families.

Examples:

```text
K1 Krokiew zwykła
H1 Krokiew narożna
J1 Kulawka
P1/P2 Płatwie
```

When relevant also show semantic roles:

```text
selected
removed material
guide
```

Requirements:

- collapsible,
- no irrelevant entries,
- selected-state emphasis separate from family styling,
- works with gable and hip roof scenes.

---

## 8. Dimension visibility levels

Implement central levels:

```text
Minimalne
Robocze
Pełne
```

Default: `Robocze`.

### Minimalne
Essential global/selected dimensions only.

### Robocze
Selected member + active operation + useful context.

### Pełne
All technically available dimensions allowed by current view.

On mobile/narrow width, reduce clutter automatically without losing exact values from Inspector/Detail Drawer.

Do not implement this as many unrelated local booleans.

---

## 9. Standardize visual interaction states

Across SkeletonCanvas, AssemblyCanvas and detail-linked highlighting implement consistent semantic states:

```text
normal
hover
selected
related
muted
warning
invalid
```

Selection must be obvious even on a dense hip roof.

Do not rely on color alone. Use opacity/stroke/outline/marker semantics.

Keep colors restrained and professional.

---

## 10. Formalize fabrication operations

Use existing `FabricationPlan`, `DetailPreviewModel`, joints and cuts to create a reusable operation-level projection.

Conceptually expose:

- operation ID/type,
- subject prototype/member,
- optional instance,
- related support,
- station/reference,
- dimensions,
- marking steps,
- linked detail preview,
- warnings/limitations.

Do not duplicate canonical cut math.

K1 operations should include wall-plate/purlin notches and ridge cut from existing data.
H1 should expose its currently supported compound upper-cut operation.
J1 should expose only geometry/fabrication facts that are already valid; do not invent missing physical H1-face deduction or purlin joinery.

---

## 11. Build MemberFabricationPackage

Create a pure derived project/fabrication type for member families/prototypes.

For current templates it should support as applicable:

- K1,
- H1,
- J1.

Expose at least:

- code/type,
- section,
- physical quantity,
- representative or grouped lengths,
- operation summaries,
- warnings/limitations.

For J1, group varying jack lengths intelligently rather than claiming every piece is identical.

Add tests for deterministic grouping/order.

---

## 12. Build RoofFabricationPackage

Create a pure project-level derived package containing current member families.

Use it for a new Builder section:

```text
PLAN PRZYGOTOWANIA DACHU
```

Suggested UI:

```text
K1  Krokiew zwykła      24 szt.
H1  Krokiew narożna       4 szt.
J1  Kulawki              32 szt. · kilka długości
```

Clicking a family:

- selects/focuses that prototype,
- exposes its grouped lengths/operations,
- connects to current Detail Drawer.

This is the foundation for future PDF worker instructions, but do NOT implement PDF/export yet.

---

## 13. Replace generic marking toggle with preparation workflow

Current generic `Pokaż trasowanie` should no longer be the main mental model.

Use wording such as:

```text
Przygotowanie elementu
```

For selected K1, show operation navigation such as:

```text
[Z1 Murłata] [Z2 Płatew P1] [Z3 Płatew P2] [K1 Kalenica]
```

Selecting an operation must:

- update/highlight its location on the member,
- update Detail Drawer,
- show marking steps,
- show dimensions,
- allow previous/next navigation.

Keep current translated `Trasowanie` wording inside the operation instructions where technically correct.

---

## 14. Before / after cut preview

For canonical detail types where removed geometry exists, add:

```text
Przed cięciem | Po cięciu
```

Before:

- original member outline,
- cut lines,
- removed material highlighted,
- support visible.

After:

- remaining/final member profile,
- removed material hidden/ghosted,
- contact relationship clear.

Both projections must reuse the same resolved geometry.

Do not add preview-specific formulas.

---

## 15. Quick Calc fabrication cards

Quick Calc must stay simple.

Polish compact cards driven by the same operation/package data:

- Zacios,
- Kalenica,
- H1 compound cut where applicable.

Clicking a card may expand a single detail.

`Otwórz w kreatorze` must preserve exact canonical project state.

Do not add Builder layer controls to Quick mode.

---

## 16. Typed toolbox/tool registry foundation

Refactor the current growing Toolbox logic into a typed workbench-tool descriptor/registry owned by the web/workbench layer.

Current active tools only:

- roof,
- K1,
- H1 and J1 when hip template,
- wall plate,
- purlins,
- ridge.

Keep `+ Dodaj płatew` working.

Architecture should later support a universal `+ Dodaj element`, but do not add fake active tools for jętki, windows, chimneys, battens, etc.

Do not move React icons into domain packages.

---

## 17. Controlled inline edit proof

If cleanly achievable, add 1–2 direct numeric edit affordances for values with an unambiguous canonical input, for example:

- roof pitch,
- purlin station,
- controlled seat length.

Derived measurements must remain read-only.

Inline editing must call the same canonical update/validation path as Inspector.

If this would destabilize V9, prioritize project/view/fabrication architecture first and record it as follow-up rather than implementing a partial hack.

---

## 18. Responsive/mobile pass

Validate the new architecture at narrow widths.

Expected behavior:

- view preset control remains reachable,
- dynamic legend does not cover useful canvas area,
- isolation can be exited,
- dimension level is accessible,
- fabrication package remains readable,
- Detail Drawer behaves as a bottom sheet,
- no horizontal page overflow.

Selection actions must have non-canvas alternatives.

---

## 19. Performance/bundle pass

Baseline V8 reports the main minified JS chunk over 500 kB.

Measure and record the current build chunk sizes.

Do a small targeted pass:

- lazy-load heavy fabrication/detail surfaces where appropriate,
- avoid domain recomputation for transient workbench changes,
- memoize fabrication package selectors,
- avoid rerendering the full skeleton for legend/drawer-only changes where reasonably possible.

Record before/after bundle sizes.

Do not introduce complexity for negligible gains.

---

## 20. Do not implement in V9

Do NOT implement yet:

- database/project persistence backend,
- user accounts/auth,
- PDF export,
- payments,
- cost engine,
- product price feeds,
- roof tiles/sheet roofing,
- battens/counter battens,
- roof windows/chimneys/dormers,
- collar ties/posts/struts,
- valley roofs,
- structural verification,
- full 3D.

These are explicitly preserved in the Product North Star for later phases.

---

## 21. Required tests

Add tests covering at minimum:

- canonical project document serialization round-trip,
- transient UI state excluded from canonical document,
- domain undo unaffected by view preset/isolation/drawer state,
- view projection policy for Konstrukcja vs Cięcia,
- dimension level policies,
- isolate/focus does not mutate geometry,
- dynamic legend contents for gable and hip roofs,
- fabrication operation mapping for K1/H1,
- member fabrication package quantity/grouping,
- J1 varying length grouping,
- roof fabrication package deterministic order,
- before/after preview uses same canonical operation,
- Quick/Builder operation/detail equivalence,
- existing 940/800 spacing regressions remain green.

Do not weaken existing tests.

---

## 22. Browser QA

If browser QA is available, verify:

### Gable
- Konstrukcja/Cięcia preset switch,
- isolate K1,
- dimension levels,
- select Z1/purlin/ridge operations,
- before/after cut preview,
- roof fabrication package.

### Multiple purlins
- operation list contains each real notch,
- selection/detail mappings remain stable.

### Hip
- H1 selection/isolation readable,
- J1 family/grouping readable,
- no false unsupported J1 joinery claims.

### Quick
- cut cards remain compact,
- exact same values as Builder,
- handoff preserves state.

### Mobile
- no horizontal overflow,
- Detail Drawer/bottom sheet usable,
- view preset and preparation flow reachable.

---

## 23. Final validation

Run:

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
git diff --check
git status
git diff --stat
```

Update `PROJECT_BLUEPRINT.md` → `WORK CHECKPOINT` with:

- canonical project boundary,
- transient state boundary,
- view preset/projection strategy,
- dimension-level strategy,
- fabrication operation/package model,
- toolbox registry strategy,
- performance before/after,
- browser/mobile QA status,
- known limitations,
- exact `NEXT ACTION`.

Do not begin Iteration 010 automatically.

---

## 24. Final report format

Report:

1. architecture/state changes,
2. smart view presets,
3. isolate/focus and visual states,
4. dimension decluttering,
5. fabrication operation model,
6. member/roof fabrication package,
7. preparation/detail UX changes,
8. toolbox architecture changes,
9. tests and validation,
10. bundle/performance results,
11. known limitations,
12. exact `NEXT ACTION`.
