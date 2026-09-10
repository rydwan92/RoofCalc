# Codex Prompt — Iteration 008: Cut Detail Previews, Smart Detail Drawer, and Faster UX

You are continuing the existing `rydwan92/RoofCalc` repository.

Do not rewrite the project.
Do not discard the architecture or working features from previous iterations.

## 0. Mandatory reading

Before editing code, read in full:
- `AGENTS.md`
- `PROJECT_BLUEPRINT.md`
- all currently relevant architecture documents in `docs/`
- especially:
  - `docs/ARCHITECTURE_V7_JACK_RAFTERS_AND_FABRICATION.md`
  - `docs/ARCHITECTURE_V8_CUT_PREVIEWS_AND_DETAIL_DRAWER.md`
- `docs/DOMAIN_RESEARCH_ROADMAP.md`

## 1. Mandatory preflight

Run before changing code:

```bash
git status
git diff --stat
git diff
pnpm typecheck
pnpm test
pnpm build
```

Understand the current baseline first.
Do not delete or revert user work.

---

## 2. Primary goal of Iteration 008

The app already calculates and visualizes roof members much better than before.
The next quality jump is to help users understand **how cuts should look and where/how to mark them**.

The main goal is:

> add a smart, selection-aware local cut-detail preview system and improve Builder/Quick Calc UX around detail understanding.

This iteration should make the app more useful for roofers/carpenters during actual preparation work.

---

## 3. Must-have outcome A — cut-detail preview system

Add a dedicated system for local cut previews.

At minimum support useful local previews for currently relevant cuts such as:
- common-rafter birdsmouth / zacios,
- common-rafter ridge cut,
- hip-rafter upper cut (if already represented in the model),
- support-contact details where appropriate.

Requirements:
- previews must be derived from the canonical resolved model, not separately hand-calculated,
- previews must be visually enlarged and easier to read than the full member view,
- previews must show key dimensions,
- previews must show meaningful labels / references,
- previews must be linked to the selected item.

Do not create fake illustrative geometry disconnected from the real resolved assembly.

---

## 4. Must-have outcome B — detail drawer / detail sheet

Create a lightweight but powerful detail area.

Recommended behavior:
- on desktop: a bottom detail drawer / split panel / docked detail section,
- on mobile: a bottom sheet or equivalent compact expandable pattern,
- opens automatically when a cut or joint is selected,
- can be collapsed/closed,
- can display the active detail clearly.

This area should contain at least:
- detail title,
- close-up preview,
- key dimensions,
- short fabrication / marking steps,
- related element identity.

---

## 5. Must-have outcome C — better coordinated selection flow

Selection semantics should become smarter.

At minimum:
- selecting a cut should highlight the relevant region/member in the main canvas,
- selecting a member instance should expose available important local details,
- detail view and main canvas should feel connected,
- unrelated geometry should be visually quieter when a local detail is active.

If useful, add a `Zoom to detail` or equivalent quick action.

---

## 6. Must-have outcome D — Quick Calc gets compact cut previews

Quick Calc should remain fast and simple.
But it should gain more explanatory power.

For the currently selected calculation/result, show a compact preview that helps the user understand the cut.

Examples:
- birdsmouth mini preview,
- ridge-cut mini preview,
- hip-cut mini preview.

Do not overload Quick Calc with full Builder complexity.
Use the same detail-preview system in a compact form.

---

## 7. Must-have outcome E — toolbox UX improvements

Improve the toolbox to be faster and more comfortable.

Recommended expectations:
- collapsible groups,
- clearer active group/item state,
- possibility of more compact behavior,
- quick access to selected item type,
- better usability on narrower widths.

The toolbox should increasingly feel like a practical instrument panel.

---

## 8. Must-have outcome F — fabrication guidance improvements

For supported details/cuts, improve the app’s “how to execute” guidance.

Expected direction:
- structured fabrication steps,
- linked dimensions,
- clear marking references,
- concise wording,
- no hidden logic in random UI strings.

If needed, introduce structured instruction blocks derived from fabrication data.

---

## 9. Architecture constraints

Keep these rules:
- one canonical math/domain model,
- no duplicate formulas for Quick Calc vs Builder,
- no preview-only fake geometry,
- no ad hoc UI-only math for cut shapes,
- all user-facing text translatable,
- performance should stay responsive.

---

## 10. Things NOT to implement now

Do NOT implement in Iteration 008:
- full 3D / Three.js,
- auth,
- payments,
- database,
- PDF export system,
- saved-project persistence,
- many unrelated new roof types,
- structural engineering verification.

Stay focused on details, usability, and clarity.

---

## 11. Validation and QA

Before finishing:

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
git diff --check
```

If local browser QA is possible, verify:
- selecting a common-rafter notch opens/updates the detail drawer,
- selecting a ridge cut opens/updates the detail drawer,
- detail preview dimensions match the main model values,
- Quick Calc shows compact cut preview(s),
- toolbox interaction still feels good,
- mobile width remains usable.

---

## 12. Checkpoint discipline

Before stopping, update `PROJECT_BLUEPRINT.md` → `WORK CHECKPOINT`.

Record clearly:
- what detail preview types were added,
- how they are derived,
- which files changed,
- what fabrication guidance structure was introduced,
- known limitations,
- exact `NEXT ACTION`.

If token/context budget becomes low, use the continuity protocol from `AGENTS.md`.
Do not leave work in an ambiguous state.

Do not start Iteration 009 automatically.

---

## 13. Final report format

In the final response, report:
1. architecture changes,
2. detail-preview system design,
3. how the detail drawer works,
4. how Quick Calc previews changed,
5. toolbox UX changes,
6. fabrication guidance changes,
7. tests added,
8. validation results,
9. known limitations,
10. exact `NEXT ACTION`.
