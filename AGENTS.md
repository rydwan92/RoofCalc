# RoofCalc / CieślaCalc — Agent Instructions

This file defines the mandatory working protocol for Copilot/Codex-style coding agents in this repository.

## Read before every iteration

Normal reading order. Stop when you have what the task needs; do not read the
historical set by default.

1. `PROJECT_BLUEPRINT.md` — product blueprint and the current `WORK CHECKPOINT`.
2. `docs/ARCHITECTURE_INDEX.md` — the current architecture in a few minutes:
   the design → fabrication → requirement → quantity → procurement pipeline,
   package responsibilities, dependency direction, state classification, schema
   boundaries, and which document covers which subsystem.
3. `docs/ROOFCALC_PRODUCT_NORTH_STAR.md` — long-term direction and the
   constraints current work must not block.
4. The currently requested iteration prompt.
5. The architecture documents for the subsystem you are actually changing.
   `docs/ARCHITECTURE_INDEX.md` §14 maps subsystem → document. Also read
   `docs/adr/` for any decision your change would alter, and
   `docs/SCHEMA_REGISTRY.md` if you touch anything persisted or versioned.
6. Relevant domain research in `docs/domain/` and
   `docs/DOMAIN_RESEARCH_ROADMAP.md` before implementing new geometry. Anything
   touching coverage, overlap or connection semantics must start from
   `docs/FUTURE_EXECUTION_SEMANTICS_AUDIT.md`.

Also worth reading when they apply: `docs/UX_DESIGN_CONTRACT.md` for workbench
layout or UI primitives; `docs/ACCEPTANCE_SCENARIOS.md` before changing a
user-visible flow; `docs/ARCHITECTURE_FUTURE_COMPOUND_ROOF_SCENE.md` for
anything touching IDs, plane references or document shape.

Historical architecture documents (`ARCHITECTURE_V3`–`V26`) and the
`PROMPT_ITERATION_*` contracts remain in `docs/` and remain authoritative for the
subsystem they introduced. They are **not** required reading every iteration.
Nothing is deleted.

If a newer explicit user-approved iteration prompt conflicts with an old
`WORK CHECKPOINT`, the newer prompt controls the next iteration, but the agent
must update the checkpoint at the start/end so the repository becomes consistent
again.

The Product North Star is not permission to implement every future feature
immediately. It constrains architecture so current work does not block future
saved projects, revisions, PDF worker instructions, openings, roof layers,
quantity/procurement/costing and covering modules.

## Definition of Ready

Before a **major** feature implementation, write a short answer to each point
below — a line or two each, in the iteration's architecture document or in the
checkpoint. The purpose is to force architectural thinking before coding, not to
produce paperwork. "Not applicable, because …" is a valid answer; a blank is not.

For a small fix or a local change, skip this and go straight to the preflight.

1. **User problem** — whose job gets easier, and what they do today instead.
2. **Domain owner** — which package owns the new logic, and why it is not a
   layer above or below (`docs/ARCHITECTURE_INDEX.md` §1–§2).
3. **Canonical persistence impact** — does any new state belong in the project
   document, or is it derived/transient (ADR-002)?
4. **Schema / migration impact** — which entry in `docs/SCHEMA_REGISTRY.md`
   changes, is it additive-optional, and can an existing saved project still
   open? If not, name the version bump and the reader for both versions.
5. **Undo / Redo / history** — which edits are one history entry; which
   interactions must create none; is a gesture transaction needed?
6. **Quantity impact** — does it produce a quantity source, and is that source
   trusted only when the result is complete?
7. **Procurement impact** — does it change what a required fabrication blank
   means, or add an allowance? Allowances are resolved upstream of procurement
   (ADR-009); procurement infers nothing (ADR-010).
8. **Catalogue impact** — does it need a technical field? Does it stay
   reproducible from a stored snapshot (ADR-003)?
9. **Future cost layer** — confirm no price, currency, waste or margin concept
   enters geometry, quantity or procurement (ADR-005).
10. **Offline behaviour** — what still works with no database and no network
    (ADR-006)?
11. **Mobile UX** — the route to the same capability at 390×844, including the
    exact numeric input. Not "later".
12. **Domain research requirement** — is a `docs/domain/<module>.md` with
    independent references and hand-checked vectors needed first?
13. **Regression strategy** — which unit tests, which reference fixture in
    `fixtures/projects/`, and whether an architecture or E2E test is warranted.
14. **Future multi-structure compatibility** — does anything infer meaning from
    an ID string, or assume a single roof (ADR-007, ADR-008)?

## Mandatory preflight

Run before changing code:

```bash
git status
git diff --stat
git diff
pnpm verify
```

`pnpm verify` runs, in order: `typecheck` → `lint` → `format:check` → `test`
(unit, UI, API, architecture boundaries and reference fixtures) → `build`.
Record the actual baseline, including any pre-existing failure.

When a gate fails, run the individual command to debug it:

```bash
pnpm typecheck
pnpm lint
pnpm format:check      # `pnpm format` writes the fixes
pnpm test
pnpm test:architecture # dependency direction and opaque-ID rules only
pnpm test:fixtures     # reference project corpus only
pnpm build
```

Real-browser QA (not part of `pnpm verify`, because it needs a downloaded
browser):

```bash
pnpm e2e:install   # once per machine
pnpm e2e           # desktop 1440x900 and mobile 390x844
```

If direct `pnpm` is unavailable in the shell, use the pinned
`npx pnpm@10.15.1 ...`.

Do not discard uncommitted user work.

## Non-negotiable architecture rules

- `roof-math` and geometry/domain packages stay independent of React, DOM, Express, database and translations.
- Quick Calc and Visual Builder use the same canonical model and the same math/solver. Never duplicate formulas per UI mode.
- Canonical length unit is millimetres. Display units are presentation only.
- Dragging edits domain/world values, never pixel geometry.
- Supports and joints are dynamic entities with stable IDs. Do not return to fixed A/B/C/D domain IDs.
- Display letters such as A/B/C/D are generated labels only.
- Cuts/notches are domain operations, not decorative SVG overlays.
- A whole-roof/skeleton preview is derived from the same assembly/template model. Do not create a second geometry engine for visualization.
- Repeated skeleton members must distinguish a physical instance ID from a shared fabrication prototype/definition ID when the active architecture requires it.
- A roof template may resolve more than one fabrication prototype (for example common rafter K1, hip rafter H1 and jack rafter J1). Do not duplicate a full fabrication calculation for every identical physical instance.
- New roof types must be introduced through discriminated template/domain types and pure resolvers, not through view-specific conditional formulas.
- Hip/valley/compound geometry must state the exact plan/elevation/face reference for every angle. Never expose an ambiguous generic `cut angle`.
- Camera/viewport/selection/hover/panel state is UI/workbench state, never canonical project construction state.
- Future project persistence must serialize only canonical project/domain data with an explicit schema version; transient view state must remain separate.
- Direct-manipulation gestures should update canonical values through explicit constraints and should be modeled as transactions so cancel/undo is possible.
- UI may expose direct manipulation, but every editable geometric value must also have an exact numeric input.
- Fabrication/detail previews must derive from canonical joints/cuts/fabrication data. Never create preview-only math that can disagree with the solver.
- Do not claim structural safety based only on geometry. Structural verification is a separate future module.
- User-facing text must remain translatable.
- Mobile UX is part of every iteration, not later cleanup.
- Do not add billing/database/auth/Three.js/full-3D unless the active iteration explicitly asks for it.
- Future quantities/costing/covering/product prices must stay outside `roof-math`; geometry cannot depend on commercial data.
- Geometry IDs are opaque. Domain code must never recover a decision by parsing an ID string; carry a structured field instead (ADR-007). Presentation maps an ID to a label through one lookup table with a translated generic fallback.
- Fabrication allowances are resolved upstream of procurement. `procurement-core` receives explicit required blank lengths, infers no installation or fabrication rule, and depends on no other package (ADR-009, ADR-010).
- Effective coverage dimensions may already encode installation overlap. Never add an overlap allowance on top of an effective dimension (V26C research).
- Quantity and procurement output is physical evidence, not a purchase quantity or a quotation. User-facing wording must not imply otherwise until a commerce layer exists.
- The architecture rules in `docs/adr/` are executable. `tools/architecture/*.test.ts` fails `pnpm verify` when code stops matching them. Change the ADR first, then the test, then the code — never the test alone.

## UX rules

The product should feel like a professional carpentry/roofing instrument, not an administration panel.

Primary goals:

- immediate visual feedback,
- large and readable dimensions,
- minimal mode switching,
- contextual inspectors/details,
- collapsible tools,
- direct selection on drawing,
- reactive values and handles,
- exact numeric fallback for all direct manipulation,
- clear fabrication/marking output,
- skeleton visuals that communicate physical timber/member relationships rather than only abstract lines,
- a rich canonical model with a selective, task-focused view.

Quick Calc must remain clearly simpler and faster than Builder.

Builder should progressively become a direct-manipulation technical editor, while remaining understandable to a non-expert through visual feedback and contextual labels.

For spatial/compound members such as a hip rafter, prefer coordinated plan/elevation/cut details derived from the same result rather than forcing the user to infer a 3D cut from one side view.

Use `Przygotowanie elementu` as the broad workflow concept. `Trasowanie` means marking/layout before cutting; `Cięcie` means the actual material-removal operation. Do not conflate them.

As the project gains more families/layers, prefer view presets, isolation, semantic emphasis and a contextual legend over dozens of permanent checkboxes.

## Git safety

Never run destructive commands such as:

```bash
git reset --hard
git clean -fd
git checkout -- .
```

unless the user explicitly authorizes them.

Do not commit or push unless the user explicitly asks the agent to do so.

## Token/context interruption protocol

If context/token budget appears low:

1. stop starting new features,
2. finish the smallest safe syntactic unit,
3. keep all WIP files,
4. run the fastest relevant validation,
5. run `git status`,
6. update `PROJECT_BLUEPRINT.md` → `WORK CHECKPOINT`,
7. record exact unfinished file/function/state,
8. set one precise `NEXT ACTION`,
9. stop.

A future agent must inspect Git + checkpoint and continue, never assume unfinished work should be reverted.

## Definition of done

Before finishing an iteration:

```bash
pnpm verify
git diff --check
git status
git diff --stat
```

Run `pnpm e2e` as well when the change affects layout, the mobile shell, the
covering drawing or project persistence.

Update `WORK CHECKPOINT` with:

- iteration/status,
- completed work,
- changed/WIP files,
- assumptions,
- validation results,
- visual/mobile QA status,
- known limitations,
- exact next action.
