# UX Design Contract

Practical rules for the workbench UI. Not a brand redesign — the restrained
green technical palette stays. It records how the surfaces already work so new
work stays consistent and reviewable.

---

## 1. The mental model

| Surface | Answers | Owns |
| --- | --- | --- |
| **Toolbox** | *What am I working on?* | choosing objects and tools |
| **Workspace** | *What does it look like?* | seeing the result, direct manipulation |
| **Inspector** | *What exactly is it?* | exact values, modes, assignment, removal |
| **Context bar** | *Where am I?* | naming the current selection and task |

Consequences enforced in review:

- The Toolbox never shows a computed result.
- The Workspace never hosts a form of exact numeric fields.
- The Inspector never repeats the Workspace's full result dashboard; a compact
  status or issue list is fine.
- The same editable value must not appear as an editable control in two places.
- **Every value editable by dragging must also have an exact numeric input**, on
  desktop *and* mobile. A product rule, not a preference.

## 2. Task ribbon and dock

Six tasks, one vocabulary, same order everywhere:

```text
construction · openings · layers · covering · cuts · materials
```

- Desktop: a horizontal ribbon of `role="tab"` buttons above the workspace.
- Mobile (`≤800px`): a fixed six-item bottom dock, short visible label plus a
  full `aria-label`, with bottom safe-area padding.
- Each button carries `data-task="<task>"` so browser QA does not depend on copy.
- Changing task is transient view state: it closes the active mobile panel and
  any irrelevant detail, preserves canonical selection, and creates **no** history
  entry.
- The Toolbox filters its sections by the active task and always offers
  *Wszystkie narzędzia* as the explicit escape to the full model.

## 3. Selection semantics

| State | Meaning | Token |
| --- | --- | --- |
| **selected** | the object the Inspector is editing | `--ui-selection` |
| **related** | participates in the selected object's geometry or operation | `--ui-related` |
| **warning** | a declared constraint is not met | `--ui-warning` |

`--ui-danger` is reserved for destructive actions and invalid geometry, not for
"needs attention". Isolation and view presets hide context; they never change
what *selected* means.

## 4. Status blocks and result honesty

A computed result is reported with an explicit status, never as a bare number:

```text
resolved | limited | incomplete | incompatible | invalid | disabled
```

- `limited` still shows geometric facts, clearly labelled as limited.
- `incompatible` means a declared technical constraint fails — **not** that the
  construction is unsafe. Structural verification is a separate future module
  and must never be implied.
- Untrusted results must not enter totals.

**Naming a result for what it is.** The layer a figure comes from decides its
label:

| The figure is | Call it | Never call it |
| --- | --- | --- |
| positions in a resolved covering layout | *pozycje krycia*, *pozycje pełne / docinane* | *arkusze*, *sztuki do kupienia* |
| net/visible geometric length or area | *zapotrzebowanie geometryczne* | *ilość do zamówienia* |
| a resolved cutting plan over real stock | *plan rozkroju* | *plan zakupu*, *oferta* |
| a priced list | — | nothing: no commerce layer exists yet |

Waste, offcuts, accessories and packaging are absent and must be said to be
absent. `assembly.coveringQuantityBoundary` carries that sentence in the
Material Schedule; do not remove it.

## 5. Fields, controls, disclosure

- **Number field**: label, exact value in the active display unit, unit shown,
  `inputMode="decimal"`, commit on blur/Enter, invalid entry marked without
  destroying the canonical value. Drafts are transient state.
- **Segmented control** (`role="tablist"`): 2–4 mutually exclusive views of the
  same thing. Never for destructive choices.
- **Disclosure** (`<details>`): secondary or advanced values, collapsed by
  default so the primary result dominates.
- **Dialog** (desktop) vs **`MobileSheet`** (mobile) for the same content. The
  sheet owns title, close, expand, safe-area padding, bounded internal scroll,
  Escape dismissal, initial focus and focus restoration.
- Only **one** sheet may own the mobile screen at a time.

## 6. Responsive ownership

| Width | Shell |
| --- | --- |
| `>1100px` | Toolbox │ Workspace │ Inspector |
| `801–1100px` | the same three columns, narrowed |
| `≤800px` | compact header + context row + workspace + six-task dock |
| `≤600px` | tighter spacing |
| `≤430px` | brand wordmark yields to its icon |

- The page is the normal scroll owner. Large tools and exact forms scroll inside
  a sheet, not the page.
- **The page must never scroll horizontally at any supported width**, asserted in
  `e2e/workbench.spec.ts` for 1440×900 and 390×844.
- Touch targets ≈44px. A tap selects; a drag edits only after ~6 screen pixels of
  movement, so a tap never creates an Undo entry.
- Screen width, panel state, camera, legend, task and sheet mode are never
  canonical project data.

## 7. Technical canvas

- The canvas draws from the **same** resolved model as the schedule. No second
  geometry engine, no preview-only maths.
- Drawing detail (Auto / Detailed / Simplified) is component view state: it
  changes rendering only and creates no history.
- Above ~1200 fragments the canvas switches to simplified linework while keeping
  exact memoized domain counts.
- SVG fills must resolve. `packages/ui/src/tokens.css` owns semantic `--ui-*`
  tokens; `.assembly-app` bridges them to the local `--a-*` vocabulary; critical
  covering fills carry a literal colour fallback. An unresolved custom property
  in an SVG `fill` falls back to black — the V21 defect, now guarded by
  `token-contract.test.ts` and E2E scenario C.

## 8. Language and identity

- All user-facing text is translatable; the app ships Polish and English.
- **No raw technical ID reaches the user.** A roof-plane label resolves through
  `roofPlaneLabelKey` / `roofPlaneShortLabelKey`, which fall back to a translated
  generic. Building a translation key by slicing an ID is rejected by
  `tools/architecture/opaque-ids.test.ts`.
- Display letters and numbers (K1, H1, J1, O1, P2, A/B/C/D) are generated labels,
  never identity.
- Fabrication vocabulary is precise: *Przygotowanie elementu* is the umbrella,
  *Trasowanie* is marking before cutting, *Cięcie* is the material-removal
  operation. They are not interchangeable.

## 9. Adding UI

1. Decide which of the four surfaces owns it (§1).
2. Decide which kind of state it is (ADR-002). Transient state goes in
   `workbench` and gets no schema entry.
3. Reuse an existing primitive. Extract a new shared primitive only when the same
   markup and behaviour already exist in three places.
4. Add the mobile route in the same change, not later.
5. Give any control browser QA needs a stable `data-*` hook rather than relying
   on copy.
6. If it shows a computed value, give it a status (§4), name it for its layer,
   and make sure it is not a duplicate of an existing result block.
