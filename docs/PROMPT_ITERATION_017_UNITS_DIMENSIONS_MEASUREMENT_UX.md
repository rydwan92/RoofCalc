# PROMPT_ITERATION_017 — Professional Workbench Polish, Units 2.0, Smart Dimensioning, Measurement Tool and Ridge Completion

Continue from commit `162613584d7f1d0f09f226bf4d691fd0ee223c74` (`W domu po robocie poprawa v16 ulepsz`). V17 is a professional usability and precision iteration, not a new large domain module.

## Required outcomes

1. Keep canonical geometry in millimetres while making centimetres the first-visit input/display unit in Quick Calc and Builder.
2. Store the UI unit choice behind one versioned local preference boundary. Corrupt or unavailable storage falls back to cm. Unit is not project data or history; reset preserves it.
3. Route ordinary user-facing lengths through shared formatting with maximum precision of 1 decimal for mm, 2 for cm, and 3 for m, without rounding canonical data. Keep explicit aggregates in m, areas in m², and volumes in m³ where appropriate.
4. Replace repeated working-mode rafter-bay labels with exact semantic groups. Minimal shows major dimensions only; Working shows representative equal groups plus any distinct end bay; Full may show each bay with collision-aware placement. Do not change the spacing solver.
5. Put pure spacing-presentation and deterministic label-priority helpers outside JSX. Selected, active-edit, and warning information must not be hidden.
6. Give meaningful physical members a restrained hover identifier and a compact selected canvas HUD with physical code, exact 3D member-axis length, and known section. No essential workflow may require hover.
7. Keep the context strip short and task-first. Identify roof, physical instance, operation, opening/layer, or schedule selection without duplicating Inspector.
8. Organize roof Inspector into Primary, Layout, Result, and collapsed Advanced groups. Toolbox selects/adds/enables; Inspector owns exact numeric editing. Layer enables use keyboard-operable `switch` semantics with explicit state.
9. Improve desktop stickiness and bounded side-panel scrolling while keeping mobile in normal sheet/document flow. Add a transient workspace-focus action that hides side panels and restores their previous state with Escape. Do not conflate this with Fit.
10. Add a transient Measure view tool. Snap to canonical member endpoints, roof-plane vertices, roof-window corners, and other unambiguous existing points. Use screen space only for picking; calculate exact canonical 3D distance. First/second point and result are transient, replace cleanly, block accidental edits, cancel on Escape, clear on task switch, and create no history or serialization.
11. Audit the ridge model. Add optional manual rectangular ridge depth only if semantically valid. Old documents remain valid and partial-volume behavior remains until a complete section exists. A complete section participates in geometric quantity volume. The edit is canonical, serializable, and undoable; it is not structural advice.
12. Preserve the user's camera across canonical edits. Only explicit Fit (or required viewport resize) adopts new fit bounds. Preserve existing F, Escape, and Undo/Redo shortcuts; add M for Measure only outside editable controls.
13. Keep Quick Calc fast and free of Builder-only Measure, layer, schedule, or opening-framing UI.
14. Audit bundle composition and add only meaningful task-level lazy splits. Record exact before/after chunks.

## Required tests and QA

Cover initial/restored cm, switching to mm/m, preference/reset and history isolation, shared precision, hard-coded HUD/ghost cleanup, working/full/remainder spacing, selected HUD, layer switch semantics, workspace focus, Measure activation/points/exact result/units/Escape/no-history/no-serialization/task switch, camera preservation, and ridge partial/complete/undo/round-trip behavior.

Run typecheck, all tests, lint, build, `git diff --check`, and formatting checks. If the Browser capability is genuinely available, inspect 1440×900, 1024, 768, and 360×800 for both gable and hip roofs, including a long 19-bay gable. Otherwise record browser/mobile visual QA as unavailable rather than claiming it.

## Non-goals

Do not add roof covering products, panelization, catalogues, prices, suppliers, waste/procurement, stock optimization, PDF/XLSX, accounts/database, structural sizing or Eurocode claims, new roof topology, dormers/chimneys, or generic CAD drawing.

Update `PROJECT_BLUEPRINT.md` with the actual baseline, implementation, exact validation and bundle sizes, QA status, limitations, and one precise next action. Do not begin V18 and do not commit or push without explicit instruction.
