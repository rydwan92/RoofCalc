# Codex Prompt — Iteration 004: Reactive Roof Skeleton + Faster Dual-Mode UX

You are continuing the existing `rydwan92/RoofCalc` project.

Do not rewrite the repository.
Do not start a new architecture from scratch.

Before code:

1. read `AGENTS.md`,
2. read `PROJECT_BLUEPRINT.md`,
3. read `docs/ARCHITECTURE_V3_WORKBENCH.md`,
4. read `docs/ARCHITECTURE_V4_ROOF_SKELETON.md`,
5. read `docs/DOMAIN_RESEARCH_ROADMAP.md`,
6. inspect `PROJECT_BLUEPRINT.md` → `WORK CHECKPOINT`,
7. run:
   - `git status`
   - `git diff --stat`
   - `git diff`
   - `pnpm typecheck`
   - `pnpm test`
   - `pnpm build`

Preserve user changes.
Do not use destructive Git commands.

---

## Goal of Iteration 004

Evolve RoofCalc from a single-member workbench into the first convincing version of a **professional, reactive roof-construction tool**.

This iteration must improve both product directions at the same time:

### Quick Calc
A roofer/carpenter should obtain useful dimensions in seconds.

### Visual Builder
A user should see a clear roof skeleton/construction and understand immediately what changes when dimensions, pitch, spacing or support positions change.

Both modes MUST share the exact same canonical state, solver and geometry.

Do not create separate math for the skeleton.
Do not create separate math for Quick Calc.

---

# 1. First inspect current Iteration 003 state

The repository may contain partial or completed Iteration 003 work.

Before deciding implementation details, inspect whether these already exist:

- `AssemblySpec`
- `ResolvedAssembly`
- dynamic datum IDs
- optional purlin
- purlin dragging
- Quick Calc / Builder split
- semantic dimension lanes
- contextual joint detail

If something already exists and works, extend it instead of replacing it.

Document any deviation between repository reality and previous checkpoint.

---

# 2. Add a roof-template layer

Introduce a small pure domain model for a **simple symmetric gable roof template**.

Do NOT model every future roof type yet.

Conceptually support:

```ts
interface GableRoofTemplateSpec {
  id: string;
  type: 'gable';
  buildingLengthMm: number;
  halfRunMm: number;
  pitchDeg: number;
  overhangMm: number;
  rafterSpacing: RafterSpacingSpec;
  rafterSection: TimberSection;
  wallPlate: ...;
  ridge: ...;
  intermediateSupports: SupportSpec[];
}
```

Exact type names may differ.

The template must reuse the existing common-rafter/assembly solver for one cross section.

Derive repeated rafter-pair positions along the building length.

Do not clone the whole fabrication model for every repeated pair unless required.
Prefer repeated-instance placement metadata.

---

# 3. Rafter spacing resolver

Add a pure tested resolver.

Inputs should include:
- building length,
- spacing value,
- explicit mode.

Prepare for:

```text
fixed-spacing
fit-evenly
```

At least one mode must be fully functional now.
If both can be implemented cleanly, implement both.

Return structured data such as:
- number of bays,
- number of rafter stations/pairs,
- actual spacing,
- station positions.

No UI math.

Add reference/boundary tests.

---

# 4. Reactive skeleton view

Add a new main Builder context called:

`Szkielet`

Keep only one other explicit main context if useful:

`Krokiew`

Do NOT bring back a permanent `Detal` top-level tab.

The Skeleton view should show a lightweight axonometric / 2.5D representation of a simple gable roof:

- left and right wall plates,
- ridge line,
- repeated rafter pairs,
- optional purlin lines if present,
- building length direction,
- enough visual structure that a non-expert immediately understands the roof skeleton.

Use SVG.

Do not introduce Three.js in this iteration.

Implement a small pure projection helper:

```text
world XYZ
  ↓
axonometric projection
  ↓
SVG XY
```

The skeleton geometry is derived from template/assembly domain data.
It must not contain fabrication formulas.

---

# 5. Skeleton reactivity

These changes must update the skeleton immediately:

- half-run / span-related value,
- pitch,
- building length,
- rafter spacing,
- overhang,
- purlin position if purlin exists.

At the same time the common-rafter fabrication result must remain synchronized.

Example:

```text
pitch 35° → 42°
```

must update:
- ridge height in skeleton,
- side-profile rafter geometry,
- rafter length,
- cut/joint results,
- displayed dimensions.

No request to backend.

---

# 6. Direct manipulation handles

Add direct manipulation only where it clearly improves UX.

Initial candidates:

### Skeleton / Builder
- drag purlin support position,
- optionally drag a roof/run handle if cleanly implementable,
- optionally drag a ridge-height/pitch handle if precise and unambiguous.

Rules:
- use Pointer Events,
- screen → drawing/world → canonical mm/degree value,
- snap/clamp,
- show live value while dragging,
- inspector numeric entry stays available,
- keyboard-accessible alternative exists.

Do not store pixels as domain values.

Do not force drag for essential workflows.

---

# 7. Fast reactive numeric controls

Improve parameter editing so it feels like a technical instrument rather than a form.

For suitable values add compact scrubber/step controls:

```text
[-]  35°  [+]
```

or an accessible slider paired with exact numeric entry.

Useful targets:
- pitch,
- rafter spacing,
- purlin position.

Rules:
- typing remains exact,
- hold/drag/scrub is optional convenience,
- values update continuously without requiring submit,
- no rounded-value feedback loop into canonical calculations.

---

# 8. Simplify Quick Calc further

Quick Calc should be notably simpler than Builder.

Default visible parameters:
- half-run/run,
- pitch,
- overhang.

Immediate key results:
- rise,
- rafter/reference length,
- minimum stock length.

Add one expandable group:

`Cięcia i przekrój`

containing:
- rafter width/depth,
- wall plate width,
- seat length,
- ridge thickness.

Show a compact live profile drawing with:
- real rafter thickness,
- wall-plate notch,
- ridge end cut.

Actions:
- `Pokaż trasowanie`
- `Otwórz w kreatorze`

Opening Builder must preserve the exact same current domain/template values.

---

# 9. Builder layout refinement

The Builder should feel like a lightweight professional design instrument.

Desktop target:

```text
COLLAPSIBLE TOOLBOX | LARGE MAIN CANVAS | CONTEXT INSPECTOR
-----------------------------------------------------------
LIVE RESULT RAIL / FABRICATION SUMMARY
```

Implement resizable regions with `react-resizable-panels` only if it clearly improves usability and remains robust.

Canvas should receive the most horizontal space.

Toolbox must collapse.
Inspector should be contextual.

Avoid visually wrapping every small thing in separate cards.

---

# 10. Contextual joint detail lens

Selecting a notch/cut should show its local detail automatically.

Required behavior:
- selected joint highlights,
- a small enlarged detail or side panel appears,
- exact local dimensions are visible,
- user can click `Powiększ`,
- closing detail returns focus to construction without changing the model.

Do not require switching the whole workbench to a `Detal` mode.

---

# 11. Skeleton ↔ member cross-selection

Selection should be semantically synchronized where possible.

Examples:
- select purlin in skeleton → inspector shows purlin and related joint information,
- select rafter line in skeleton → show common rafter member context,
- select wall plate → show wall-plate settings/joint,
- select a result related to notch → focus the notch detail.

Do not invent multiple unrelated selection stores.

Use stable semantic entity IDs.

---

# 12. Dynamic dimensions and decluttering

Continue removing fixed dimension-placement hacks.

Skeleton view should show only useful high-level dimensions:
- building length,
- span/run,
- ridge height or pitch indicator,
- rafter spacing when selected/relevant.

Do not cover the skeleton with fabrication dimensions.

Member view shows exact fabrication dimensions.

Selected joint detail shows local cut dimensions.

This is important UX separation:

```text
Skeleton = understand construction
Member   = prepare timber
Detail   = understand one joint
```

---

# 13. Live result rail

In Builder, create/refine a concise live result rail.

Show context-sensitive values such as:
- rafter length,
- minimum stock,
- selected notch seat/depth,
- ridge cut angle,
- rafter pair/station count,
- actual spacing.

Clicking a result should focus/select corresponding entity where practical.

Avoid giant dashboard statistics.

---

# 14. Better invalid-edit UX

Current live calculators often feel bad if the entire drawing disappears while a number is temporarily invalid during typing.

Improve behavior:
- preserve the last valid drawing state where safe,
- visually mark invalid field,
- show concise field-level message,
- resume live calculation immediately after valid input,
- never display NaN/Infinity.

Do not persist invalid canonical state.

---

# 15. Visual quality requirements

This iteration MUST improve the visual experience, not only architecture.

The application should feel:
- professional,
- modern,
- precise,
- lightweight,
- understandable without training.

Specific goals:
- skeleton is visually attractive and legible,
- timber/supports use restrained distinguishable materials/styles,
- selected objects stand out clearly,
- dimension typography is readable,
- controls feel compact but touch-friendly,
- canvas background is subtle and technical,
- no excessive gradients/glows,
- no old administrative-panel appearance.

Add small transitions for changed/highlighted geometry if useful, respecting `prefers-reduced-motion`.

---

# 16. Mobile requirements

At ~360px width:

Quick Calc:
- should be the easiest experience,
- no horizontal page scrolling,
- important result visible quickly,
- compact drawing readable.

Builder:
- canvas/skeleton remains usable,
- toolbox becomes compact/bottom action menu,
- inspector becomes bottom sheet/accordion,
- selected detail is readable,
- touch targets remain comfortable.

Do not simply stack the full desktop UI vertically.

---

# 17. Tests

Add tests for:

- gable roof template resolver,
- ridge height derivation,
- repeated rafter station generation,
- spacing mode behavior,
- skeleton instance count,
- skeleton projection helper,
- Quick Calc and Builder same canonical model,
- pitch change affecting both skeleton and fabrication result,
- building length/spacing only changing repeated placement, not common-rafter cross-section math,
- purlin movement reflected in skeleton and joint model,
- invalid live draft preserving last valid rendered model if implemented,
- current common-rafter/birdsmouth/ridge regressions.

Maintain strict no-NaN/no-Infinity guarantees.

---

# 18. Do not implement yet

Do NOT implement in this iteration:

- full 3D/Three.js,
- hip roof solver,
- valley rafter solver,
- jack rafters,
- collar tie/jętka geometry unless only represented as a disabled future item (prefer not to show it yet),
- structural load/capacity checks,
- database,
- auth,
- payment,
- PDF,
- e-mail,
- team/company features.

The goal is to prove the simple gable roof skeleton and polished dual-mode UX first.

---

# 19. Documentation

Update architecture docs if implementation decisions differ from the proposed V4 model.

Add a concise geometry/template document if needed, for example:

`docs/GABLE_ROOF_TEMPLATE_GEOMETRY.md`

Document:
- coordinate system,
- spacing assumptions,
- skeleton projection,
- relationship between template and canonical common-rafter assembly.

---

# 20. Validation

Before stopping run:

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
git status
git diff --stat
```

Fix known implementation errors before ending.

Update `PROJECT_BLUEPRINT.md` → `WORK CHECKPOINT`.

Record:
- current iteration/status,
- what was implemented,
- template model shape,
- spacing behavior,
- skeleton projection assumptions,
- direct-manipulation behavior,
- visual/mobile QA status,
- tests/build results,
- known limitations,
- exact `NEXT ACTION`.

If token/context budget is low, follow `AGENTS.md` and the blueprint continuity protocol.

Do not automatically begin the next iteration.

---

# Expected final report

When done, report clearly:

1. what changed in domain architecture,
2. how Quick Calc improved,
3. how Visual Builder improved,
4. how the roof skeleton works,
5. which values can be edited reactively/directly,
6. how purlin/support interaction works,
7. how skeleton and fabrication share the same model,
8. what tests were added,
9. typecheck/test/lint/build results,
10. remaining limitations,
11. exact `NEXT ACTION` from the checkpoint.
