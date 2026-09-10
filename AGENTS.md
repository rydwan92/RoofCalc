# RoofCalc / CieślaCalc — Agent Instructions

This file defines the mandatory working protocol for Copilot/Codex-style coding agents in this repository.

## Read before every iteration

Before editing code, read in this order:

1. `PROJECT_BLUEPRINT.md` — product and architecture source of truth.
2. `docs/ARCHITECTURE_V3_WORKBENCH.md` — dual-mode parametric workbench direction.
3. `docs/ARCHITECTURE_V4_ROOF_SKELETON.md` — current roof-skeleton and direct-manipulation direction.
4. `docs/DOMAIN_RESEARCH_ROADMAP.md` — domain-research rules.
5. the currently requested iteration prompt in `docs/`.

If a newer explicit user-approved iteration prompt conflicts with an old `WORK CHECKPOINT`, the newer prompt controls the next iteration, but the agent must update the checkpoint at the start/end so the repository becomes consistent again.

## Mandatory preflight

Run before changing code:

```bash
git status
git diff --stat
git diff
pnpm typecheck
pnpm test
pnpm build
```

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
- UI may expose direct manipulation, but every editable geometric value must also have an exact numeric input.
- Do not claim structural safety based only on geometry. Structural verification is a separate future module.
- User-facing text must remain translatable.
- Mobile UX is part of every iteration, not later cleanup.
- Do not add billing/database/auth/3D unless the active iteration explicitly asks for it.

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
- clear fabrication/marking output.

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
pnpm typecheck
pnpm test
pnpm lint
pnpm build
git status
git diff --stat
```

Update `WORK CHECKPOINT` with:

- iteration/status,
- completed work,
- changed/WIP files,
- assumptions,
- validation results,
- known limitations,
- exact next action.
