# RoofCalc / CieślaCalc — Architecture V11: Direct Manipulation, Quick Detail Dialogs and Purlin Layout Assistant

## Status

Approved direction after Iteration 010. This document defines the next UX/interaction layer without changing the product's geometry-first architecture.

The main goals are:

1. make Quick Calc genuinely fast and visual on desktop,
2. make cut previews directly explorable instead of static thumbnails,
3. let users grab and move purlins by the timber itself,
4. add a geometric purlin-layout assistant without pretending to perform structural design,
5. use desktop space more intelligently while preserving mobile simplicity.

---

## 1. Product rule

RoofCalc remains a geometry/fabrication workbench, not a structural design solver.

A purlin's structurally correct position, section and quantity depend on loads, spans, timber class, support conditions and structural design. Therefore V11 may offer geometric distribution tools such as `Rozmieść równo`, but must not label them as structurally optimal or safe.

Future structural verification may replace/augment these helpers.

---

## 2. Quick Calc desktop composition

Current Quick Calc wastes too much horizontal space on wide desktop screens.

Use a responsive working area with a sensible max width and stronger two-column composition:

```text
QUICK WORKSPACE
┌───────────────────────┬───────────────────────────────────────┐
│ Inputs                │ Result + member preview               │
│                       │                                       │
│ K1 / H1               │ Primary numbers                       │
│ geometry              │ Large member drawing                  │
│ optional settings     │                                       │
│                       │ Cut cards                              │
└───────────────────────┴───────────────────────────────────────┘
```

On very wide screens, do not simply enlarge empty margins. Increase the useful result/drawing area within readable bounds.

Quick Calc must remain simpler than Builder.

---

## 3. Interactive Quick cut cards

Current compact K1/H1 cut previews are good raw material but must become interactive.

Each cut card is a button/card with:

- operation code and name,
- small preview,
- 1–2 critical dimensions,
- visual affordance that it can be opened.

Examples:

```text
K1 · Z1 Zacios przy podporze
100 × 57.4 mm
[ preview ]

K1 · K1 Cięcie kalenicowe
55°
[ preview ]
```

Click/tap opens a dedicated detail dialog/sheet.

Do not navigate away from Quick Calc.

---

## 4. Quick Detail Dialog

Desktop: centered/modal technical detail dialog, large enough to use available screen width.

Mobile: bottom sheet / full-height sheet.

Content:

```text
Z1 · Zacios przy podporze                         [X]

[ Przed cięciem ] [ Po cięciu ]

┌──────────────────────────────────────┐
│ large canonical detail preview       │
│ dimensions / support / removed area  │
└──────────────────────────────────────┘

Kluczowe wymiary          Jak wytrasować
...                       1. ...
...                       2. ...

[ Otwórz w Kreatorze ]
```

The dialog reuses the same `DetailPreviewModel` and fabrication steps as Builder. No duplicate cut math is permitted.

The user can:

- switch Before/After,
- inspect dimensions,
- read marking instructions,
- close with X/Escape/click outside where appropriate,
- open the exact same project state in Builder.

H1 must use its currently supported coordinated compound-cut explanation and keep limitations/warnings visible.

---

## 5. Direct purlin manipulation

Purlins added by the user should be draggable by grabbing the timber body itself.

The tiny handle/dot may remain as an optional precision cue/fallback, but it must not be the primary interaction.

Expected interaction:

```text
hover purlin -> highlight + grab cursor
pointer down on purlin body -> select + begin transaction
move along allowed roof-placement axis -> live geometry update
pointer up -> commit one Undo/Redo transaction
Escape -> cancel and restore starting position
```

Requirements:

- use a generous invisible hit target around the rendered purlin,
- only direct-drag actual editable intermediate purlins,
- wall plate and ridge do not accidentally inherit purlin behavior,
- reuse canonical `movePurlin()`/placement constraints,
- drag changes world/domain `xMm`, not pixels,
- clamp to existing legal purlin placement segments,
- preserve numeric editing in Inspector,
- support mouse, pen and touch where practical,
- show `grab` / `grabbing` states,
- selected purlin stays visually obvious in dense roofs.

---

## 6. Purlin placement axis and feedback

During direct purlin drag show a lightweight placement guide:

- slope/placement axis,
- live position from the chosen datum,
- optional neighboring distances,
- snap indication only when active.

Avoid permanent dimension clutter.

The live label should follow display units but edit canonical millimetres.

Potential snapping policy:

- normal drag: existing smooth canonical drag,
- optional snap mode: configurable coarse step such as 10 mm / unit-equivalent,
- exact numeric Inspector remains authoritative.

Do not silently snap if it makes precision surprising.

---

## 7. Geometric purlin layout assistant

Add a compact action associated with the purlin group, for example:

```text
Płatwie 3
[ + Dodaj ] [ Rozmieść ]
```

`Rozmieść` opens a small popover/dialog, not a permanent panel.

Initial supported action:

### Równo w dostępnym zakresie

Evenly distribute the **currently existing user purlins** over the valid intermediate-support placement range.

Example concept:

```text
wall plate |---- P1 ---- P2 ---- P3 ----| ridge-side limit
```

The algorithm is geometric only.

Pure function direction:

```ts
interface PurlinDistributionRequest {
  supportIds: string[];
  rangeStartMm: number;
  rangeEndMm: number;
  mode: 'equal-gaps';
}
```

The exact type may follow current package conventions.

One user action must become one undoable transaction.

The preview should show proposed positions before Apply when implementation cost is reasonable.

---

## 8. Explicit non-structural wording

The purlin assistant must say something equivalent to:

> Rozmieszczenie geometryczne. Liczba, przekrój i położenie płatwi wymagają weryfikacji konstrukcyjnej.

Do not use labels such as:

- `optymalny rozstaw`,
- `zalecane płatwie`,
- `bezpieczny rozstaw`,

unless a future structural module actually verifies them.

---

## 9. Future-ready purlin assistant

The architecture should later allow additional strategies without changing UI/domain boundaries, for example:

- equal gaps,
- equal projected horizontal spacing,
- explicit stations,
- mirror/copy between roof sides where meaningful,
- structural-engine recommendation (future separate module).

Only implement verified geometry-safe strategies now.

---

## 10. Builder desktop density

Improve desktop space use without making the application look like CAD software.

Priorities:

- canvas remains visually dominant,
- top workbench controls stay compact,
- Inspector may be sticky within desktop viewport,
- Detail Drawer should not force excessive page scrolling when it can use available viewport space,
- preparation package should remain collapsible/contextual,
- avoid duplicated information in Canvas + Inspector + bottom cards.

At wide widths, allow canvas/result regions to grow before increasing outer margins.

---

## 11. Smart toolbox for purlins

The typed tool registry introduced in V9/V10 should expose group-level actions.

Example:

```text
PODPORY
Murłata
Płatwie (3)       [···]
  P1
  P2
  P3
  + Dodaj płatew
Kalenica
```

Group menu may provide:

- Rozmieść równo,
- Pokaż wszystkie,
- optional remove-all only with explicit confirmation if implemented later.

Do not add dangerous bulk actions casually.

---

## 12. Hover and direct-manipulation semantics

Introduce/standardize semantic interaction states:

```text
normal
hover-editable
selected
active-drag
related
muted
```

The purlin timber body should communicate editability by cursor + highlight, not only by an external dot.

Selection cannot rely only on color.

---

## 13. Quick-to-Builder handoff

Opening Builder from Quick Detail Dialog must preserve exactly:

- roof type,
- geometry,
- units,
- K1/H1 section inputs,
- supports/purlins already present,
- selected subject/operation when it can be mapped safely.

The target Builder should preferably open with the same operation selected and Cuts preset active.

No serialization round-trip or second model should be required.

---

## 14. State boundary

Persistable future project state:

- roof template/spec,
- supports/purlins,
- sections,
- geometry/fabrication inputs.

Transient V11 UI state:

- Quick detail dialog open,
- active Quick preview,
- purlin hover,
- drag preview,
- distribution popover open,
- proposed distribution before Apply,
- modal tab Before/After.

Do not put transient state into `RoofProjectDocumentV1`.

---

## 15. Tests

Add coverage for:

- Quick cut card opens correct detail,
- dialog close/Escape,
- K1 Before/After uses canonical preview,
- H1 dialog preserves warnings/references,
- Quick-to-Builder preserves state and operation where supported,
- pointer down on purlin body begins purlin drag,
- purlin drag changes only canonical support placement,
- Escape cancels drag,
- one completed drag = one history transaction,
- wall plate/ridge cannot be purlin-dragged,
- equal distribution deterministic positions,
- equal distribution stays inside valid range,
- distribution creates one undo step,
- transient dialog/distribution state excluded from project document,
- mobile/narrow Quick detail interaction.

Keep all K1/H1/J1, spacing and resolver-count regressions passing.

---

## 16. Excluded scope

Do not implement:

- structural purlin sizing,
- automatic structural number of purlins,
- load combinations,
- timber strength verification,
- auth/database/project saving,
- PDF/export,
- new timber member families,
- roof openings,
- battens/covering/costing,
- full 3D/CAD.

---

## 17. Definition of success

A successful V11 means:

1. Quick Calc uses desktop width better and cut cards feel interactive.
2. Clicking a K1/H1 cut opens a professional, closable large detail.
3. Builder purlins can be grabbed directly by the timber.
4. Multiple purlins can be evenly distributed geometrically with one intentional action.
5. No new solver is created.
6. No structural recommendation is implied.
7. Existing geometry and fabrication remain canonical and tested.
