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

## 2. Perspectives, contextual tasks and dock

V37 replaces the permanent seven-task ribbon. Perspective is primary; tasks are
contextual:

```text
Projekt    → construction · openings · layers · covering
Wykonanie  → cuts
Materiały  → Plan materiałów · Rozkrój K1 · Zestawienie techniczne
Kosztorys  → costing
Dokumenty  → Centrum dokumentów
```

- Desktop: one perspective row (`data-perspective`) plus a compact
  **Przejdź do** jump menu (`data-nav-shortcut`) as the expert escape; below it
  only the active perspective's tabs (`data-task`, or `data-materials-view`).
- Drawing tools (Miarka, Skup widok, Izoluj, Widok, legend) appear only on
  drawing tasks.
- Mobile (`≤800px`): a five-perspective bottom dock and contextual tabs above
  the workspace. Never all tasks at once.
- V36 rule kept: commerce inputs in the material plan belong to its downstream
  pricing workflow; price drafts never edit technical construction state.
- Changing task is transient view state: it closes the active mobile panel and
  any irrelevant detail, preserves canonical selection, and creates **no** history
  entry.
- The Toolbox filters its sections by the active task and always offers
  *Wszystkie narzędzia* as the explicit escape to the full model.

### 2.1 Return model (V37)

- A cross-context jump (guidance action, material-plan link, Documents → K1,
  summary CTA) uses `navigateTo` and remembers the current location in a
  transient, deduplicated trail of at most six entries.
- When a return target exists the context bar shows **← {target}** with the
  target's human name ("← Plan materiałów", "← Pokrycie", "← Centrum
  dokumentów"). Alt+← does the same. A switch of perspective clears the trail.
- The breadcrumb reads `Perspektywa › Zadanie › Produkt/element`; parents are
  actionable; no raw ID ever appears.
- Navigation Back is not Undo. Undo/Redo carry the labels **Cofnij zmianę** /
  **Ponów zmianę** with their shortcuts. Navigation never creates history and
  is never persisted.
- K1 cutting is the Materials › Rozkrój K1 tab, not a modal. Document preview
  returns with **← Centrum dokumentów**.

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

## 7.1 Technical 3D workspace (V38)

- The Workspace can be drawn by either renderer on a construction-capable task.
  `[ 2D | 3D ]` (`data-workspace-renderer`) sits with the technical view
  controls, never beside Projekt / Wykonanie / Materiały: **3D is a view of the
  current task, not a perspective.** Leaving such a task falls the renderer
  back to 2D rather than leaving a dead switch.
- 2D is the default and the whole 3D stack is lazily loaded. Its first open
  shows "Ładowanie widoku 3D...", never a blank workspace. If WebGL is
  unavailable the workspace says so and offers **Wróć do 2D**; every 2D
  calculation stays available.
- **There is one selection.** A 3D click calls the same `select()` a 2D click
  calls, so the Inspector, the context bar and the breadcrumb follow, and the
  member stays selected when the renderer changes. Display codes K1/H1/J1 are
  never the identity mechanism (§8).
- Selection is carried by an edge outline as well as colour; *related* is a
  distinctly lighter tone than *selected*, and §3's semantics are unchanged.
  Timber keeps its 2D semantic family colours so a member looks like the same
  member in both views.
- While 3D is active the 2D drawing tools (Miarka, Dopasuj, dimension level,
  drawing layers) stand down; the viewport owns its own camera, isolation,
  family and X-ray controls instead of duplicating them.
- **Izoluj element** is the same transient `isolateSelection` flag as in 2D.
  Family filters, X-ray, projection, view preset and camera are renderer-local
  transient state. None of it enters the project, its history or persistence.
- Hover is renderer-local feedback only — a quiet outline and a pointer cursor.
  It never writes a canonical selection on pointer move. A pointer that moved
  more than ~6 px is a camera gesture, never a selection.
- The HUD card restates already-resolved values and names the layer each comes
  from (§4): *Przekrój* and *Oś elementu*, never a bare number that could be
  mistaken for a fabrication blank. The Inspector owns full detail; the HUD
  owns none of it and edits nothing.
- **The scene never looks more finished than it is.** The viewport header reads
  "Geometria referencyjna — bez detalu cięć", and an H1/J1 selection adds
  "Geometria referencyjna — detal połączenia nie jest jeszcze modelowany."
  No cut, notch, hip face deduction or jack finished face is modelled.
- Mobile (`≤800px`): the switch lives in the View sheet, the viewport controls
  become one horizontally scrollable row above the stage, and the page still
  never scrolls horizontally. 3D is a smoke-level capability there; 2D remains
  the primary phone experience.
- Every 3D control is a real labelled button with `aria-pressed` where it
  toggles; returning to 2D never requires touching the canvas.

## 7.2 Execution decisions that unblock a partial result (V39)

- A result that is **permanently** partial with no way to finish it is a defect,
  not honesty. When a partial status has exactly one cause and that cause is a
  decision only the expert can make, the surface that shows the status must also
  offer the decision.
- V39's case: hip counter-battens. The status row now reads the real numbers
  (`46 osi K1-J1 · 0 ciągów grzbietowych`, total length) and states what is
  missing (`4 grzbiety wymagają wyboru detalu`), with the choice immediately
  below and the affected hips drawn as dashed amber references in the 2D layer
  view — never simply absent.
- **Offer a choice, never a default.** Where research shows two legitimate
  details that produce different quantities, neither may be pre-selected or
  labelled "recommended". The panel says why in one sentence.
- Spatially meaningful alternatives get **small schematic SVG sketches**, a
  plain Polish name and a one-line explanation, as radio cards — not an enum
  dropdown and never an internal identifier.
- After the choice the same row states completion in the same vocabulary
  (`✓ Gotowe`, `4 grzbiety — układ kompletny`) with the added length broken out,
  so the user can see what their decision cost.
- Choosing an execution detail is **canonical project intent**: one normal
  Undo/Redo entry. Display-only toggles around it (3D build-up visibility,
  finished vs reference geometry, camera) stay transient and create no history.
- Downstream surfaces must not be told the news twice. Material Plan, Cost and
  Export read the resolver's own status, so the row upgrades from *CZĘŚCIOWE* to
  *GEOMETRIA* by itself; an accepted cost line still goes through the existing
  "Projekt zmienił tę wartość" workflow and is never silently rewritten.
- Truthfulness does not relax when a detail resolves. A resolved counter-batten
  total is still a *geometric visible length*, never a purchase length, and
  V39's finished K1 solid is labelled so that H1/J1 are still stated as
  reference geometry.

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

- V37: a Creator start offers **Szybki start**, **Projekt przykładowy** and
  **Od razu do edycji**. The guided path has four steps (Budynek, Geometria
  dachu, Konstrukcja, Sprawdź i utwórz), never all advanced fields at once.
- Every non-obvious input shows a short sentence, an explanatory sketch with a
  `role="img"` label and, where needed, one "Dowiedz się więcej" disclosure.
  Sketches are schematic and never a source of dimensions.
- The live preview draws the resolved skeleton of the draft; validation names
  the field and the rule; the last step shows readiness (geometry,
  construction, K1 cutting) and explicit limitations. No structural safety
  claim.
- Examples are fixture-backed and always open as a new project labelled
  "Projekt przykładowy — nie projekt konstrukcyjny."
- Full building width maps to the existing symmetric `halfRunMm`.
- Quick Calc hands its known width, pitch and eave into the Creator as confirmed
  values with **Zmień**, and asks only for missing project data. A deliberate
  new-project action creates a separate project record rather than silently
  replacing the active project.
- Project guidance is one quiet row: progress, one primary item, `+N więcej`,
  and one next action. It never enters project history or persistence.
- Adding covering is always family → source → product. A family click is not a
  canonical edit; incomplete manual data remains a transient draft.
- The covering centre surface is titled **Schemat krycia**. Family-specific
  rhythm may aid recognition, but quantities still mean effective coverage
  positions or geometric runs, never purchase pieces.
- Roof-plane assignment uses cards with name, area and assigned state. Colour is
  reinforced by text and outline, and the legend contains only states present in
  the current drawing.
- V37 covering views: **Techniczny** (default) draws the effective coverage
  truth — clipped fragments, dashed nominal cells for edge cuts, plane outline —
  and **Pogląd materiału** instances one generic tile glyph. The preview never
  changes a count and is labelled as illustration. The eave is drawn at the
  bottom. The UI states that physical tile projection beyond the edge is not
  modelled (`docs/domain/ROOF_TILE_EDGE_PLACEMENT.md`).
- Horizontal layout uses human choices (Wyśrodkuj docinki / Zacznij od lewej
  krawędzi / Ustaw ręcznie) with an exact offset; the enum never shows. Each
  plane explains its full, edge-cut and opening-cut positions.
- The selected covering is a product card: source badge, manufacturer, variant,
  revision, type, technical facts and a price-list state for catalogue variants
  only.

## 10.1 Visual system (V37)

- Button roles: `a-primary` (one per local context), default secondary,
  `a-ghost` for utility and navigation, `a-danger` for destruction.
- States have distinct hues plus a non-colour cue: brand, selected (outline),
  related, ready, manual, warning, error, partial (dashed/pill text), disabled.
- The work surface dominates: compact builder header, no builder page heading,
  no empty Inspector, full-width costing and documents.

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

## 12.1 Covering-first installation workflow (V43B)

- The order is covering → battens → counter-battens. A beginner never enters a
  raw gauge first; a covering proposes **Rozmieść łaty automatycznie**.
- Every gauge shows its owner badge (AUTO / RĘCZNIE) next to the value. A
  manual gauge without a covering reads "Rozstaw ręczny · niezweryfikowany z
  pokryciem" and is never "Gotowe". Auto without covering data draws no rows
  and offers **Wybierz pokrycie** / **Ustaw ręcznie**.
- Regular gauge, Detal okapu and Detal kalenicy are three separate facts; edge
  details are always manual and explained with a sketch.
- A mismatch states value and product range and offers one-step
  **Dopasuj automatycznie**; the manual value is never silently overwritten.
- Partial counter-battens say why in the summary itself ("4 grzbiety H1
  wymagają wyboru detalu") with a direct action; each hip option shows what it
  changes in length.
- A narrowed batten plane scope is always visible ("Tylko 1 z 4 połaci").
- The composite plan uses stroke hierarchy, not colour alone: subtle covering,
  wide translucent counter-battens underneath, thin dark battens on top.
- Installation lengths are "geometric", never "do zakupu".

## 12.2 Calculator trust (V44)

- One dominant result per calculator; secondary facts are smaller and point at
  their part of the drawing on hover/focus (transient, never history).
- Important results offer **Jak policzono?**: inputs, the relation used and the
  result, built from resolved values only.
- Display precision: member/building lengths 0.1 cm, small cuts 0.1 mm, angles
  0.1°, linear totals 0.1 m, areas 0.1 m², money 0.01 PLN. Inputs keep the
  exact canonical value; a value seeded for the user is tape-measurable.
- Source vocabulary: AUTO · RĘCZNIE · KATALOG · Z PROJEKTU (`SourceBadge`).
- Status vocabulary: Gotowe · Częściowo policzone · Wymaga decyzji · Wymaga
  danych · Niezgodne · Niedostępne. Raw codes never reach the user.
- Reference geometry is labelled *Geometria referencyjna* with a one-line
  reason; only a resolved connection is *Geometria wykonawcza*.
- On desktop the context breadcrumb is a quiet caption, not a third header card.

## 13. Perspective navigation and Cost Workspace (V34B)

- Five perspectives are the primary navigation (§2): **Projekt**,
  **Wykonanie**, **Materiały**, **Kosztorys** and **Dokumenty**. Since V37
  Dokumenty is a real `documents` view (Centrum dokumentów) reusing the V30
  engine. `PerspectiveBar.tsx` derives the active perspective from the current
  task — no new persisted or canonical state.
- Each perspective carries one small, restrained accent used only for the
  active nav marker, its icon colour and a thin selected-tab underline: blue-teal
  (Projekt, `--a-feature`), warm amber (Wykonanie, `--a-warning`), green-teal
  (Materiały, `--a-accent`), indigo (Kosztorys, `--a-framing`), graphite
  (Dokumenty, `--a-text-muted`). Never recolour a whole page; `--a-warning` /
  `--a-danger` keep their existing semantic meaning for actual warnings/errors,
  unrelated to which perspective is active.
- The Cost Workspace (`CostWorkspace.tsx`) is a full-width panel like Materials
  and Covering — no Inspector alongside it; a line's detail expands inline in
  its own row instead.
- **Suitability, not a percentage.** Every cost line shows one of five named
  bases via `assembly.cost.suitability.*`: *Dokładna ilość zakupowa*, *Na
  podstawie wykonania*, *Szacunek geometryczny*, *Wymaga ilości ręcznej*, *Brak
  podstawy*. Never a fabricated confidence score. `assembly.cost.basis.*`
  separately names what the quantity itself means (plan zakupu / geometria /
  powierzchnia netto / pozycje krycia / ręcznie), mirroring `@cieslacalc/cost-core`'s
  `CostQuantityBasis` as plain strings.
- **Covering is never pre-priced.** A covering suggestion shows the raw
  geometric fact (coverage positions or a geometric run length) as text only;
  accepting it ("Uzupełnij") always creates a line with quantity `0`, never the
  geometric count, so the user must type a real purchase quantity themselves
  (§20/§46 of the V34B prompt; enforced by `cost-adapter.test.ts` and
  `CostWorkspace.test.tsx`).
- **No silent quantity change.** A project-derived line's live project value is
  compared against the value it was added with; a mismatch shows an inline
  banner ("Projekt zmienił tę wartość: X → Y") with *Aktualizuj* / *Zachowaj
  ręczną*, never a silent update. Directly editing a line's quantity always
  converts its `source` to `manual` (`withManualQuantity`); a `manual` line
  whose key still matches a live suggestion offers *Przywróć z projektu*.
- **VAT is scenario-level and off by default.** One optional tax rate applies
  to every included line; unset shows net only ("VAT: nie ustawiono" /
  `vatUnset`). No 23% default, no per-line override in V34B.
- **Completeness is honest.** The header never claims "gotowe" unless every
  *included* line has both a valid quantity and price
  (`CostScenarioSummary.complete`); an unpriced or quantity-less included line
  contributes zero to the total but still blocks that claim.

## V47 — Readiness, guardrails and document truth

- **No dead ends.** Every unresolved state answers: what is wrong, why it
  matters, whether RoofCalc can fix it safely, which decision the user owns and
  where to go. A blocker always carries an action.
- **Severity is semantic.** BLOCKER = a dependent result would mislead (gates
  only the affected document's final print); WARNING = useful with a known
  limitation (printable, and printed); INFO = optional next step. Optional or
  not-applicable work is never styled as an error.
- **Calm by default.** One primary item in the project bar; everything else in
  the on-demand "Sprawdzenie projektu" panel. Success is quiet, blockers strong,
  warnings moderate, info muted. Icons plus text, never colour alone.
- **Safe repair is explicit.** Only deterministic, non-controversial changes
  join "Napraw bezpiecznie N problemy", always previewed, one history entry,
  confirmed with "[Cofnij]". Expert decisions (H1 detail, installation mode,
  manual gauge, product or structure) are never included.
- **Consequential changes explain themselves first** (roof type with dependent
  data); ordinary numeric edits never ask.
- **Recalculated execution values show where they came from** briefly
  ("40,3 cm → 39,6 cm · przeliczono po zmianie"); no toast for derived numbers.
- **Documents state their readiness before opening** (hub card and preflight),
  in the preview header, and on the printed page. A working document never
  looks final.
- **Readiness actions land on the exact editor** (layer, section, focused
  field), not on a generic tab.
- **Invalid input stays local**: mark the field, explain, never commit.

## V48 — Commercial planning for linear materials

**A geometric length is never shown as a purchase quantity.** A batten row
reads `816,4 m · GEOMETRIA` until a plan exists, then `Łaty 40×60 · 44 szt. ·
PLAN ZAKUPU` with the installation requirement still visible as its own number.
The Material Plan's status counts move with the badge, so the summary and the
row can never disagree.

**Hierarchy:** WYMAGANIE → DŁUGOŚCI HANDLOWE → PLAN → KOSZT. Solver vocabulary
(`RequiredPiece`, `StockUsage`, branch and bound) never reaches the user. The
optimisation goal is phrased as *Najmniej odpadu* / *Najmniej kupionych metrów*
/ *Najmniej sztuk*, and a plan whose optimality was not proven says "Plan
znaleziony, nie potwierdzono optymalności" rather than "optymalny".

**Normal screen stays small:** requirement, lengths, and five plan numbers.
Kerf, end trim, smallest reusable offcut and the objective live behind
*Ustawienia rozkroju*. Cut patterns are grouped and repeated
(`3,00 m × 44 szt.`), never one row per length, with an explicit
"show the rest" affordance.

**Vocabulary is kept distinct:** rzaz, obcięcie końców, odpad and resztka
użytkowa are four different things. An unused centimetre is not automatically
waste.

**Blocked is never zero.** A layer that cannot be planned says why and offers
the fix — an undecided H1 hip detail shows "Najpierw uzupełnij detal grzbietów
H1" with a button that lands on that detail. Commercial planning itself is
never mandatory: readiness raises it as *info*, never as a blocker.

**Suggestions are labelled.** The offered 3 / 4 / 5 m lengths carry a
`SUGESTIA` chip because no verified batten product backs them yet.
