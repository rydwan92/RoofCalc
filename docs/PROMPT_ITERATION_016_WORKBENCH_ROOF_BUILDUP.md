# PROMPT_ITERATION_016 — Professional Workbench 2.0, Roof Surface Geometry, Membrane and Counter-battens

## Objective

Continue from the accepted V15 quantity engine. Reorganize Builder around professional roofing tasks and add a pure, reusable roof-surface/build-up foundation without introducing procurement, pricing or structural claims.

## Required audit

Before implementation verify that V15 still derives quantities from the accepted composed skeleton, excludes proposals, replaces interrupted rafters after accepted opening framing, keeps schedule state transient, treats battens geometrically, leaves Quick Calc simple, marks incomplete ridge volume partial and does not serialize quantity results.

## Workbench requirements

- Replace the old preset row with five task presets: Construction, Openings, Layers, Cuts and Schedule.
- Place the ribbon above a compact contextual strip.
- Keep the dynamic legend collapsed by default.
- Coordinate task-specific panels so stale opening, cut/detail and schedule state does not leak between tasks.
- Give Layers four transient subviews: Overview, Membrane, Counter-battens and Battens.
- Keep task/subview/perspective navigation outside canonical history.
- Use a three-column professional desktop layout with a dominant canvas and compact tools/inspector.
- In Schedule provide element/section grouping and separate drawing/schedule surfaces on narrow screens.
- Lazy-load the heavy schedule UI.

## Domain requirements

- Extend canonical `RoofBuildUp` with optional membrane and counter-batten intent while preserving V1 document compatibility.
- Add a pure roof-surface resolver for gable and hip templates.
- Resolve stable plane IDs, local/world polygons, gross area, opening-union deduction, net area, slope length and eave/ridge/hip boundary metrics.
- Clip openings to their assigned plane, avoid double-counting overlaps and return deterministic invalid/limited issues without non-finite output.
- Add a pure counter-batten resolver aligned to physical common-rafter axes from the accepted composed skeleton.
- Group interrupted rafter segments back to one source axis and split counter-battens around openings.
- Make hip counter-batten support explicitly limited rather than guessing compound geometry.
- Keep all geometry independent of React, DOM, pixels, translations and commercial data.

## UX and quantity requirements

- Render selectable membrane surfaces and selectable counter-batten rows from the same resolved geometry used by inspectors and quantities.
- Provide canonical on/off controls, per-plane membrane selection and exact counter-batten section inputs.
- Show compact net membrane area, counter-batten length/status and batten length/status summaries.
- Report membrane as net geometric surface area, separately from linear counter-batten and batten geometry.
- Preserve existing structural member schedule semantics and clear partial-volume messaging.
- Keep all new user-facing text translated in Polish and English.
- Maintain touch targets, readable inputs and task reachability on mobile.
- Quick Calc must not gain the Builder ribbon or material schedule.

## Explicit exclusions

Do not add product catalogues, roll/board optimization, lap rules, stock lengths, cutting allowances, kerf, waste factors, prices, suppliers, ordering, PDF export, authentication, database, Three.js/full 3D or structural safety conclusions.

## Required validation and handoff

- Add unit tests for gable/hip surfaces, one/multiple/overlapping/clipped openings, invalid values and deterministic finite output.
- Add counter-batten tests for physical placement, opening splits, accepted framing without double-counting and explicit hip limitation.
- Add persistence/history/undo tests and Builder UI tests for task reachability, layers and schedule separation.
- Run typecheck, complete tests, lint, production build and `git diff --check`.
- Record baseline/audit, implementation, validation, visual/mobile QA status, limitations and exact next action in `PROJECT_BLUEPRINT.md`.
