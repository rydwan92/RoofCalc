# PROMPT_ITERATION_013 — Interaction Hardening, Roof-Window Workflow, Batten Workbench, and Scene UX

Continue RoofCalc / CieślaCalc from the current V12 repository state.

The goal of this iteration is NOT to add many new modules. V12 already introduced foundations for roof windows, roof features, view presets and battens. Now make the editor feel precise, obvious, reactive and comfortable for a roofer/carpenter.

## 0. Mandatory preflight

Read in full:
- `AGENTS.md`
- `PROJECT_BLUEPRINT.md`
- `docs/ROOFCALC_PRODUCT_NORTH_STAR.md`
- `docs/PROMPT_ITERATION_012_ROOF_FEATURES_BATTENS.md`
- relevant V8–V11 architecture docs
- current roof-feature/project-document/workbench/store/canvas source

Run:
```bash
git status
git diff --stat
git diff
pnpm typecheck
pnpm test
pnpm lint
pnpm build
```

Do not discard user work.

## 1. First: V12 audit and documentation repair

Before new UX work:
1. inspect every file changed by V12,
2. verify actual behavior against the V12 prompt,
3. create/finalize `docs/ARCHITECTURE_V12_ROOF_FEATURES_BATTENS_AND_COMPOSITION.md`,
4. update `PROJECT_BLUEPRINT.md -> WORK CHECKPOINT` so it describes the ACTUAL V12 state,
5. list any incomplete V12 requirements explicitly.

Do not leave Iteration 011 as the current checkpoint after V12.

## 2. Core UX objective

Target interaction:
> click the physical thing -> immediately understand it -> drag/edit it -> see the effect -> use exact numbers only when needed.

Every major object should have:
- obvious hover,
- obvious selected state,
- direct manipulation when safe,
- exact numeric fallback,
- useful local dimensions only,
- predictable Escape/Undo behavior.

## 3. Desktop workbench layout

Use the desktop viewport more effectively.

Target:
```text
┌──────────────────────────────────────────────────────────────────────┐
│ top app bar                                                         │
├─────────────┬───────────────────────────────────────┬────────────────┤
│ toolbox     │ main workbench canvas                 │ inspector      │
├─────────────┴───────────────────────────────────────┴────────────────┤
│ contextual detail/fabrication dock                                  │
└──────────────────────────────────────────────────────────────────────┘
```

Requirements:
- canvas dominates,
- avoid giant unused margins,
- left/right panels have bounded widths,
- lower content is contextual/collapsible,
- roof summary does not always compete with active editing,
- preserve mobile behavior.

## 4. Contextual detail dock

Refine the lower technical panel to three states:
```text
collapsed
working
focus
```

- fabrication operation can open `working`,
- `focus` uses most available workbench width/height,
- Escape steps focus -> working -> collapsed,
- close restores previous logical context,
- state is transient, never persisted.

## 5. Visual state semantics

Centralize CSS/theme tokens for:
```text
hover
selected
related
warning
muted
active-tool
visible-layer
```

Selection must use more than color (stroke/weight/outline).
Warnings use restrained amber/orange + icon/pattern.
Avoid using nearly identical pale-green fill for selected, enabled and visible states.

## 6. Context-aware view presets

Current presets:
```text
Konstrukcja | Otwory | Łacenie | Cięcia
```

Rules:
- selecting roof window -> `Otwory`,
- activating fabrication operation -> `Cięcia`,
- selecting batten/layout -> `Łacenie`,
- clicking `Połać` -> `Konstrukcja`,
- selecting K1/H1/J1 should not always force `Konstrukcja` if the current task intentionally uses it as context,
- closing detail returns to previous meaningful view.

Avoid surprising view jumps.

## 7. Roof-window creation workflow 2.0

`+ Dodaj okno dachowe` should enter a transient placement tool:

1. click add,
2. valid roof planes highlight on hover,
3. user clicks chosen plane,
4. window is created at clicked location,
5. window becomes selected,
6. Inspector opens.

Escape cancels creation with no history mutation.

If there is only one clearly valid plane in context, one-click insertion is acceptable.

## 8. Roof-window drag polish

User grabs the visible body, not a tiny handle.

During drag:
- selected plane emphasized,
- nearest rafter bay highlighted,
- collision state updates live,
- compact placement chip,
- only useful dimensions,
- `grab/grabbing`,
- Escape cancels,
- pointer-up creates exactly one Undo item.

## 9. Keyboard nudge

When a roof window is selected:
- arrows move it in plane-local coordinates,
- default step e.g. 10 mm,
- Shift+Arrow larger step e.g. 50/100 mm,
- optional modifier for 1 mm if compatible with existing shortcut policy,
- keyboard changes are undoable,
- shortcuts do not fire while typing in form fields.

## 10. Clarify roof-window geometry terminology

The current collision rectangle must not imply manufacturer-certified frame/opening dimensions.

Document and expose one explicit concept, e.g.:
```text
Otwór geometryczny
Szerokość otworu
Wysokość otworu
```

Prepare future distinction:
```text
nominal product size
structural opening size
installation envelope / clearance
```

Do not add manufacturer-specific clearances now.

## 11. Collision UX

When O1 intersects K1/J1/H1:
- O1 warning outline,
- intersected member related-warning state,
- Inspector lists exact IDs,
- compact warning badge on canvas,
- `Umieść między krokwiami` becomes prominent.

When clear:
- compact success status, no huge banner.

No structural-safety claims.

## 12. Improve "Umieść między krokwiami"

If practical, preview target bay with ghost placement.

After apply:
- highlight the two bounding rafters briefly,
- show concise status:
  `O1 umieszczono geometrycznie pomiędzy K1-07 i K1-08`.

If impossible:
- keep original geometry,
- explain why with actual width numbers,
- never resize silently.

## 13. Battens workbench

When entering `Łacenie`:
- structure becomes muted context,
- battens are primary,
- openings remain visible,
- Inspector becomes batten-focused,
- show local top summary:
```text
25 rzędów | moduł 350 mm | łączna długość 182,4 m
```

Important results should not require scrolling.

## 14. Batten Inspector

Group fields:
```text
GEOMETRIA ŁAT
Przekrój: 40 × 60 mm

ROZKŁAD
Moduł
Pierwsza łata od okapu
Strefa kalenicy / ostatnia łata

WYNIK
Liczba rzędów
Łączna długość
```

Invalid input:
- remains editable,
- shows inline validation,
- never crashes or erases text.

## 15. Numeric history / transaction cleanup

Audit numeric editing for:
- roof-window dimensions,
- roof-window positions,
- batten gauge/offsets,
- major roof fields where practical.

Avoid:
```text
typing 375 -> history entries: 3, 37, 375
```

Use a consistent strategy:
- local draft while typing,
- reactive preview if desired,
- canonical commit on blur/Enter/explicit apply,
- Escape restores prior canonical value,
- one deliberate edit = one Undo step.

## 16. Battens around openings

Validate and polish clipping:
- no line through a window,
- split segments clearly,
- one selected row may highlight both segments,
- total length equals real visible segment lengths,
- multiple windows supported,
- edge cases near eave/ridge and exact station crossings tested.

## 17. Batten row selection

Allow clicking a derived batten row.

Inspector:
```text
Łata L12
Połać
Pozycja od okapu
Długość całkowita
Segmenty
```

Selection stays transient.
Do not persist one entity per derived row.
Use deterministic derived IDs.

## 18. `Widok` popover

Make `Widok` a compact professional popover:

```text
Widok

POKAŻ
✓ Wymiary
✓ Etykiety
✓ Konstrukcja w tle
✓ Otwory
✓ Łaty

GĘSTOŚĆ WYMIARÓW
Minimalne
Robocze
Pełne

[Dopasuj widok]
```

Do not create a permanent checkbox wall.

## 19. Canvas navigation

Improve:
- wheel zoom around pointer,
- pan with middle mouse / space+drag if compatible,
- Fit command,
- safe keyboard Fit shortcut,
- double-click object -> focus/fit,
- min/max zoom,
- prevent losing model offscreen.

Do not introduce full 3D.

## 20. Local canvas HUD

Small task-context HUD, not duplicate Inspector.

Examples:
```text
K1-07 • 5609 mm
O1 • 780 × 1180 • między K1-07/K1-08
L12 • moduł 350 mm
```

## 21. Toolbox hierarchy

Refine for scanning:

```text
GEOMETRIA
  Połać

DREWNO
  K1 Krokwie
  H1 Krokwie narożne
  J1 Kulawki

PODPORY
  Murłata
  Płatwie (2)
  Kalenica

OTWORY
  O1 Okno dachowe
  + Dodaj okno

WARSTWY
  Łacenie [włączone]
```

Use counts, compact state indicators, clear selection, collapsible groups.

## 22. Quick Calc

Keep Quick focused on fastest geometry/cut answer.

Only polish:
- fill wide result card space better,
- reduce excessive dead whitespace on wide desktop,
- keep clickable K1/H1 cut cards,
- do not add windows/battens to Quick.

## 23. Fabrication package readability

Improve:
- selected K1/H1/J1 family hierarchy,
- operation tabs,
- warning separation,
- bounded text line length,
- avoid collisions between `Trasowanie krok po kroku` and metric cards.

Keep J1 limitations explicit; do not invent missing physical H1-face geometry.

## 24. Responsive/mobile

At 360×800:
- view presets reachable,
- toolbox = sheet/drawer,
- inspector/detail = one major sheet at a time,
- canvas gets maximum useful height,
- roof-window touch target comfortable,
- no horizontal overflow.

At tablet consider hiding one side panel automatically.

## 25. Performance

Profile battens/openings interaction.

Requirements:
- hover does not rerun roof solver,
- window drag does not rebuild unrelated fabrication calculations if avoidable,
- battens recompute only from relevant dependencies,
- no per-batten React state,
- no hundreds of labels,
- add call-count/memoization regression where practical.

## 26. Tests

Add at minimum:
- placement tool cancel -> no history,
- window create on chosen plane,
- window drag -> one history entry,
- keyboard nudge,
- Escape rollback,
- view preset transitions,
- collision warning,
- failed place-between-rafters reason,
- numeric draft -> one history commit,
- batten row selection transient,
- multiple-window batten clipping,
- view/drawer state excluded from persistence,
- shortcuts ignored in inputs.

Keep all existing tests green.

## 27. Browser QA

Test:
### 1440×900
- gable + hip,
- K1/H1/J1,
- window on relevant planes,
- drag into/out of collisions,
- place between rafters,
- two windows,
- battens gauge/offset edits,
- select batten row,
- detail dock focus/collapse,
- Undo/Redo.

### wide desktop
- use width effectively,
- canvas not tiny with huge margins.

### 768 px
- side panel behavior.

### 360×800
- no horizontal overflow,
- one sheet at a time,
- window/batten editing reachable.

If real hardware touch/pointer cannot be tested, state it.

## 28. Domain research boundary

Do not hardcode:
- manufacturer roof-window opening clearances,
- covering-specific batten gauge,
- tile-specific first/last batten rules.

Keep geometry/manual inputs until a later manufacturer/product module.

Prepare future integration points only.

## 29. Architecture document

Create:
`docs/ARCHITECTURE_V13_INTERACTION_AND_LAYER_WORKBENCH.md`

Document:
- selection semantics,
- creation tool state,
- interaction transaction contract,
- numeric draft/commit contract,
- preset/context transition rules,
- roof-window manipulation,
- batten derived-row identity,
- transient vs persisted state,
- responsive panel strategy.

## 30. Definition of done

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

Update `PROJECT_BLUEPRINT.md -> WORK CHECKPOINT` with:
- V12 audit result,
- V13 work,
- interaction/history semantics,
- browser QA,
- known limitations,
- exact NEXT ACTION.

Do not commit or push unless explicitly requested.
Do not begin Iteration 014 automatically.
