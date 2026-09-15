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

V27 basis indicators use text plus disclosure, never colour alone. The compact
result progression is `Geometry → Execution → Cutting → Purchase`; an absent
downstream layer is labelled pending/unavailable rather than rendered as a fake
zero result. Coverage positions and geometric runs use different typed units,
and their totals are never added together.

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

## 10. Creator start and covering studio

- A first Creator entry starts with one friendly building form and a small roof
  preview. Full building width maps to the existing symmetric `halfRunMm`; the
  preview is not a second geometry engine.
- Quick Calc hands its known width, pitch and eave into the project assistant and
  asks only for missing project data. A deliberate new-project action creates a
  separate project record rather than silently replacing the active project.
- Project guidance is derived, prioritised and quiet: at most two primary items
  are visible, while the rest stays behind disclosure. It never enters project
  history or persistence.
- Adding covering is always family → source → product. A family click is not a
  canonical edit; incomplete manual data remains a transient draft.
- The covering centre surface is titled **Schemat krycia**. Family-specific
  rhythm may aid recognition, but quantities still mean effective coverage
  positions or geometric runs, never purchase pieces.
- Roof-plane assignment uses cards with name, area and assigned state. Colour is
  reinforced by text and outline, and the legend contains only states present in
  the current drawing.

## 11. Structural system and ridge connection

- Roof structural system (Więźba krokwiowa / Więźba krokwiowo-jętkowa) and K1
  ridge connection (Deska kalenicowa / Połączenie bezpośrednie / Nakładka) are
  two separate segmented-button groups, styled like the existing roof-type
  selector. Neither is inferred from the other or from roof shape.
- A collar tie (Jętka) shares one height/section pair across the whole family;
  its inspector fields are reachable both from the roof-level "advanced"
  section and from selecting any individual collar tie in the drawing — there
  is exactly one place the values live, never two independent copies.
- Choosing `half-lap` shows an inline note next to the selector explaining
  that its geometry is not modeled yet, in addition to K1 preparation and
  cutting becoming unavailable. The user is told why, not just that something
  disappeared.
- The collar tie gets its own semantic 3D colour (`--a-collar-tie`), distinct
  from timber (K1/H1/J1), the ridge and purlins, following the existing
  `kind-<name>` CSS convention rather than a one-off class.

## 12. Roof build-up intelligence

- The left build-up tool group is the primary layer navigation. The centre
  summary is status-first and may open a layer, but the workbench must not add a
  second strip of equally prominent membrane/counter-batten/batten tabs.

- V34A keeps the shared segmented Auto/Manual pattern with mandatory text.
  Actual gauge leads; range is secondary, authority/explanation tertiary.
  Automatic regular spacing and manually retained edge references are named
  independently. Manual values remain validated; hard incompatibility cannot
  become ready because a field is manual. Missing technical data and a required
  mode selection have separate states from incompatibility.
- The compact calculation disclosure consumes per-plane solver evidence directly.
  It shows exact span, permitted range, midpoint target, possible/selected whole
  intervals, actual gauge, course count and first/last axis references.
- Repair previews show gauge, affected named planes and row count before one
  canonical action. Unrelated dimensions/offsets are retained. Separate hard
  pitch/geometry/data failures suppress gauge repair. Counter-battens describe
  placement from structural axes without a fictitious manual spacing mode; H1
  is a partial information limit, not a red layer failure.
- Batten spacing exposes two explicit intents: **Automatic from covering** and
  **Manual**. Automatic mode names the source product/range and shows the actual
  solved gauge and course count. Manual mode always retains an exact numeric
  gauge; switching modes never destroys that manual value.
- A covering compatibility warning is grouped by cause and numeric range. One
  primary message may list the number of affected roof planes; do not repeat the
  same sentence once per plane. Its primary repair action performs the safe
  automatic batten fit as one undoable canonical edit.
- K1/J1 counter-batten axes and opening interruptions are useful resolved facts
  on a hip roof. An unresolved H1 boundary connection is presented as a
  **partial** detail next to those facts, never as a generic empty "limited"
  result.
- Covering overlay checkboxes and drawing-detail controls are transient view
  state. Material and export views repeat the derived spacing mode, actual
  gauge/range, course count and counter-batten axis/segment status without
  implying purchase quantities.
