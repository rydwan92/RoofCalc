# PROMPT_ITERATION_015 — Timber Member Schedule, Quantity Engine Foundation, Composed-Assembly Material Projection and Material UX

## Iteration contract used

Continue from the accepted V14 opening-framing/composed-skeleton architecture. Before implementation, audit Git, the checkpoint, canonical project migration, framing resolver/composition, fabrication package, workbench state, tests and existing mobile UX. Preserve all valid V14 behavior.

## Primary objective

Create the first honest material-quantity foundation and expose it as a task-focused Builder schedule. The result must answer what physical timber geometry is present in the current accepted assembly, how many physical members share a geometric length, their known sections, total geometric lengths and computable geometric volumes.

The schedule is geometry-based. It is not a bill of materials for purchase, a stock/cut list, an allowance calculator, a waste estimate, a price engine or a structural verification.

## Mandatory architecture

1. Add a pure `@cieslacalc/quantity-core` package outside React and infrastructure concerns.
2. Consume the accepted composed `RoofSkeleton`; never create another roof geometry engine.
3. Measure physical member axes in 3D world millimetres.
4. Preserve source physical instance IDs and shared prototype IDs.
5. Group equal lengths with an explicit small equality tolerance, never display rounding.
6. Produce deterministic row IDs/order, family and section groups, totals, warning/status data and finite validation issues.
7. Keep geometry independent of stock sizes, prices and suppliers.
8. Keep all quantity results derived; do not serialize them into the canonical project.

## Required structural coverage

- common rafters K1,
- hip rafters H1,
- jack rafters J1, including several unequal length groups,
- wall plates,
- ridge,
- each real purlin,
- accepted opening headers,
- accepted upper/lower interrupted-rafter segments.

V14 opening behavior is a regression contract:

- a proposal must not change quantities,
- `needs-review`, unsupported or invalid framing must not alter the physical schedule,
- accepted valid framing must replace the interrupted full member with its real composed members,
- removal and undo/redo must restore the corresponding quantities,
- two independent openings must remain deterministic.

## Section and volume contract

Section-based grouping and rectangular geometric volume are required when section width and depth are known. Missing facts must stay explicit. In particular, if the ridge domain exposes only one section dimension, include its length but label total volume as partial and exclude the ridge from computed volume. Never fabricate the missing dimension.

Reject or flag zero/non-finite axes, invalid resolved lengths and invalid sections. Do not output `NaN` or `Infinity`.

## Roof-layer projection

If the existing batten resolver is enabled, expose battens separately from structural timber. Count resolved visible rows and their visible clipped geometric lengths/sections. Do not describe clipped rows or segments as commercial pieces. Covering quantities, membranes, tiles and sheet nesting are outside this iteration.

## UX contract

Add a fifth Builder view preset called `Zestawienie` / `Materials`. It must be reachable from the main presets and toolbox, remain understandable without a giant spreadsheet, and provide:

- clear geometry-based scope language,
- timber quantity and total geometric length,
- complete/partial volume status,
- family cards and length groups,
- expandable source-instance lists,
- section summary,
- optional batten summary,
- contextual selection that highlights source members on the existing skeleton,
- a schedule inspector,
- Polish and English strings,
- usable desktop and narrow/mobile layouts.

Schedule selection, expansion, filtering/preset and viewport state are transient. They must not mutate the canonical document or enter undo/redo history. Quick Calc must stay fast and uncluttered.

Millimetres remain the canonical and default workshop unit. Presentation may use metres and cubic metres for aggregate readability only.

## Required tests

- exact 3D axis length and finite guards,
- equal physical-instance grouping and no grouping by display rounding,
- exact length and rectangular-volume aggregation,
- gable K1, wall plate and purlin coverage,
- hip H1 and varying J1 groups,
- ridge incomplete-section/partial-volume behavior,
- accepted/proposed/review opening-framing effects,
- two-opening determinism,
- clipped batten-row semantics,
- fifth preset and material UI rendering,
- row selection highlights and transient-state history isolation,
- applied framing changes the UI schedule and undo restores it,
- narrow/mobile reachability and layout QA.

## Non-goals

Do not implement procurement stock lengths, cutting allowances, kerf, waste, optimization, prices, offers, suppliers, checkout, PDF export, database/auth, structural sizing, a second geometry engine, Three.js or full 3D.

## Completion protocol

Run typecheck, complete automated tests, lint, build, format check, `git diff --check`, Git status/diff review and Browser QA on desktop and mobile. Update the architecture document and `PROJECT_BLUEPRINT.md` checkpoint with exact scope, validations, limitations and the next action. Do not commit or push without explicit user authorization.
