# Codex Prompt — Iteration 007: Jack Rafters, Contextual Fabrication, and Visual Hierarchy

You are continuing the existing `rydwan92/RoofCalc` repository.

Do not rewrite the project.
Do not discard working architecture from previous iterations.

## 0. Mandatory reading

Before editing code, read in full:
- `AGENTS.md`
- `PROJECT_BLUEPRINT.md`
- `docs/ARCHITECTURE_V3_WORKBENCH.md`
- `docs/ARCHITECTURE_V4_ROOF_SKELETON.md`
- `docs/ARCHITECTURE_V5_INTERACTIVE_SKELETON.md`
- `docs/ARCHITECTURE_V6_HIP_ROOF_AND_RAFTER.md`
- `docs/ARCHITECTURE_V7_JACK_RAFTERS_AND_FABRICATION.md`
- `docs/HIP_RAFTER_GEOMETRY.md`
- `docs/DOMAIN_RESEARCH_ROADMAP.md`

## 1. Mandatory preflight

Run and inspect before changing code:

```bash
git status
git diff --stat
git diff
pnpm typecheck
pnpm test
pnpm build
```

If there are existing warnings/problems, understand them first.
Do not delete or revert user work.

---

## 2. Goal of Iteration 007

The current app is already significantly better, but it still needs to become more:
- useful on the job,
- visually readable,
- context-aware,
- intuitive when selecting/editing elements.

The primary goal of this iteration is:

> complete the regular hip-roof workflow by adding jack rafters (kulawki) as real domain members, while improving contextual results, fabrication usefulness, and visual hierarchy.

This is **not** the time to add many unrelated new roof types.

---

## 3. Must-have outcome A — jack rafters / kulawki

Add jack rafters for the current hip roof template.

Requirements:
- they must be generated from the existing roof template / spacing logic,
- they must be real member entities in the canonical model,
- they must have stable IDs,
- they must be selectable on the canvas,
- they must have a contextual inspector state,
- they must participate in roof/member summaries,
- they must expose meaningful fabrication data.

Important:
Do not implement jack rafters as dumb SVG lines only.
They must exist in the domain model and in the resolved assembly.

If necessary, introduce a prototype/instance scheme such as:
- `J1` prototype,
- `J1/1`, `J1/2`, `J1/3` instances.

If there are multiple jack families by symmetry/side, structure them clearly instead of hiding the distinction.

---

## 4. Must-have outcome B — contextual results

Refactor the lower results/fabrication areas so they are selection-aware.

Implement at least these contexts:

### Roof summary
When the roof root / nothing specific is selected, show:
- roof type,
- building length,
- span/width,
- ridge length,
- roof height,
- common-rafter count,
- hip-rafter count,
- jack-rafter count,
- spacing summary.

### Prototype summary
When a prototype is selected (e.g. `K1`, `H1`, `J1`), show:
- code,
- type,
- section,
- repeated count,
- representative fabrication data,
- key cuts/joints.

### Instance summary
When a specific instance is selected, show:
- exact ID,
- position within the roof,
- exact resolved length,
- exact cuts / meeting condition,
- local fabrication data.

### Support summary
When ridge / wall plate / purlin is selected, show support-centric information.

### Joint/cut summary
When a notch/cut/detail is selected, show local dimensions and marking instructions.

---

## 5. Must-have outcome C — stronger visual hierarchy

The skeleton is currently mathematically richer than it looks.
Improve readability.

Required improvements:
- clear highlight color for the active selection,
- muted unrelated repeated members when an item is selected,
- better hover feedback,
- stronger distinction between primary structure and secondary repeated members,
- clearer active handles,
- subtle roof-plane readability aid (ghost fill / silhouette / similar),
- no gaudy colors; keep it professional.

Color and emphasis should help the user instantly understand:
- what is selected,
- what family it belongs to,
- what related members matter.

Use design tokens / semantic styles where possible.
Do not solve this with scattered hardcoded hex values.

---

## 6. Must-have outcome D — fabrication usefulness

The app should better answer “what do I prepare?”

Improve or create a fabrication panel that can show at least:
- member code,
- member family/type,
- section,
- count (for prototype),
- exact or representative length,
- main cuts/joints,
- step-by-step marking hints,
- assumptions / limits when relevant.

This panel should react to selection context.
It is acceptable if full export is not implemented yet.

---

## 7. Builder UX improvements

Keep Builder professional and intuitive.

Important expectations:
- do not add more global mode clutter,
- preserve the existing roof skeleton flow,
- selection should feel more obvious,
- inspector should clearly state what is selected,
- prototype vs instance should be visible to the user,
- repeated members should not visually fight for attention.

If helpful, improve grouping or headings in the right inspector.

---

## 8. Quick Calc guidance

Do not turn Quick Calc into a full builder.

Iteration 007 may improve:
- clarity of top inputs,
- speed of obtaining the result,
- contextual compact outputs,
- handoff to Builder.

But Quick Calc must remain fast and simple.

---

## 9. Mathematical and geometry expectations

Add explicit tests and clear contracts for jack-rafter geometry.

At minimum cover:
- generation count rules,
- monotonic length behavior approaching hips,
- stable and valid instance positions,
- interaction with current roof template dimensions,
- no `NaN` / invalid geometry under valid inputs.

If some combinations (e.g. certain purlin interactions for hip roofs) are not fully supported yet, handle them explicitly:
- either implement safely,
- or present an honest limitation rather than silent wrong geometry.

Do not claim structural safety.
This remains geometric/fabrication assistance.

---

## 10. Performance expectations

As the skeleton gets denser, do not let the UI degrade.

Use best judgment to:
- memoize resolved geometry,
- separate heavy resolution from superficial view state,
- avoid unnecessary rerenders,
- keep drag/selection fluid.

---

## 11. Things NOT to implement now

Do NOT implement in Iteration 007:
- full 3D / Three.js,
- authentication,
- payments,
- database,
- PDF/export system,
- saved project history,
- valley roof,
- dormers,
- full structural verification,
- many new unrelated roof types.

Stay focused.

---

## 12. Validation and QA

Before finishing:

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
git diff --check
```

If local browser QA is possible, verify at least:
- roof summary selection,
- common-rafter prototype selection,
- hip-rafter prototype selection,
- jack-rafter selection,
- support selection,
- selection highlighting,
- contextual fabrication panel,
- mobile-width sanity.

---

## 13. Checkpoint discipline

Before stopping, update `PROJECT_BLUEPRINT.md` → `WORK CHECKPOINT`.

Record clearly:
- what was completed,
- which files changed,
- what jack-rafter assumptions were used,
- known limitations,
- exact `NEXT ACTION`.

If token/context budget becomes low, follow the continuity protocol in `AGENTS.md`.
Do not leave the repo in an ambiguous state.

Do not start Iteration 008 automatically.

---

## 14. Final report format

In the final response, report:
1. architecture changes,
2. how jack rafters were introduced,
3. how prototype vs instance is represented,
4. how contextual results work,
5. how fabrication output changed,
6. how visual hierarchy changed,
7. tests added,
8. validation results,
9. known limitations,
10. exact `NEXT ACTION`.
