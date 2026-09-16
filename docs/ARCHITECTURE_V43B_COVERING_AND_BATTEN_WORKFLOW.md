# V43B — Covering and batten workflow

Status: IMPLEMENTED (not committed). Builds on V33/V34A (whole-course solver,
tile evaluation) and V39 (hip counter-batten detail). No solver was replaced.

## Product decision (frozen)

```
ROOF GEOMETRY → STRUCTURE → SELECT COVERING → AUTOMATIC BATTEN LAYOUT
→ STRUCTURE-DERIVED COUNTER-BATTENS → REVIEW → MATERIALS
```

A beginner never configures battens before choosing a tile. **AUTO** means
RoofCalc owns the regular gauge from a trusted covering snapshot. **MANUAL**
means the user owns it and RoofCalc still validates it. An expert may switch at
any time.

## 1. Quantity audit and root cause

The batten solver itself was correct. An independent diagnostic invariant
(`packages/roof-math/src/batten-layout-audit.test.ts`) proves it for gable and
all four hip planes: each row represents the band ±g/2 around its station and
an eave-parallel slice width is linear in v, so
`sum(row length) × gauge = plane area − eave strip − ridge strip` exactly, with
a tolerance of `(|first − g/2 − eave| + |ridge − (last + g/2)|) × widest slice`.
This is a regression check, never the production calculation.

**Defect found — silent plane-scope narrowing (application layer).**
A new covering assignment started on one plane. Two actions then copied that
covering's *current* plane list into `buildUp.battenLayout.roofPlaneIds`:

- the covering warning's "Dopasuj łaty automatycznie"
  (`BattenAutoRepair targetPlaneIds={assignment.roofPlaneIds}`), and
- the Toolbox batten switch for a first layer.

Assigning the tile to the whole roof afterwards never widened the batten
layer, so the summary showed one plane's battens as the roof total.

| Controlled fixture | Before | After |
| --- | --- | --- |
| App default hip (8 × 8 m, 35°), manual tile 33–36 cm, reproduced in browser | 68,7 m (1 of 4 planes) | 274,9 m (4 planes, 14 rows/plane, 40,33 cm KODA / 34,96 cm test tile) |
| Hip 15 × 15 m + 7,5 m half-run, left plane only vs whole roof (audit test) | ~27 % of total | whole roof |

The reported 362 m² / 283 m case matches this ratio (one long hip plane).

**Fix at the root:** repair and layer creation never write `roofPlaneIds`;
a new covering takes every plane no other assignment owns. The resolver now
reports `scope` (`whole-roof | subset`), so an existing narrowed project shows
"Tylko 1 z 4 połaci" with **Rozszerz łaty na cały dach**.

Also fixed: manual stations are `first + i × gauge` (no float drift from
repeated addition); zero-width clipped segments are dropped; the 2D batten HUD
showed the retained manual `gaugeMm` (e.g. 350) while Auto owned the gauge.

## 2. Per-plane evidence

`BattenPlaneLayoutResult` adds `slopeLengthMm`, `totalRowLengthMm`,
`openingDeductionMm` (unclipped − visible); `ResolvedBatten` adds `rowNumber`.
`BattenLayoutResult.totalLengthMm` is literally the sum of plane totals. Tests
assert aggregate = plane sum = row sum = segment sum, unique IDs, monotonic
stations, no NaN/negative, segments inside the plane polygon, and opening
deduction without double subtraction for overlapping windows. Counter-batten
tests assert aggregate = resolved runs for `not-decided`, `no-dedicated-run`
and `paired-plane-runs`, and truthful opening splits.

## 3. Value semantics (`apps/web/src/assembly/build-up-defaults.ts`)

| Kind | Where | Rule |
| --- | --- | --- |
| Display fallback | `disabledBattenLayer()` | disabled, produces no rows, never shown as a gauge |
| Project default | `newBattenLayer()` | written only by an explicit action; mode **Auto**; section and edge references become user-owned values labelled RĘCZNIE |
| Manual user value | `gaugeMm` | shown and validated only in Manual |
| Auto derived value | solver `actualGaugeMm` | never written back except Auto → Manual seeding (V33B) |

All scattered `350 / 250` literals in Page, Inspector, Toolbox and
CoveringWorkspace were removed. Legacy documents without `mode` remain Manual.

## 4. Workflow projection (`batten-workflow.ts`)

`deriveBattenWorkflow` composes solver result, auto composition, V34A decision
and covering capability into one presentation state used by the summary bar,
covering block, Inspector, guidance, Material Plan note and export:

`layer-off · awaiting-covering · awaiting-covering-scope ·
awaiting-installation-mode · auto-data-unavailable · unsupported-support-model ·
auto-ready · auto-incompatible · manual-unverified · manual-compatible ·
manual-incompatible · geometry-invalid`

`complete` is true only for `auto-ready` and `manual-compatible`. A manual gauge
with nothing to validate against is never "Gotowe". Covering removal leaves the
Auto intent in place but yields `awaiting-covering` and zero rows; a later
compatible covering restores Auto. Product change: Auto recomputes; Manual keeps
the value and revalidates (mismatch shows value and range, one-step
**Dopasuj automatycznie**). Counter-battens never change because a tile
changed.

`deriveCounterBattenWorkflow`: `layer-off · complete · needs-hip-detail ·
invalid · no-axes`, with interior-axis and hip-boundary counts. Page also
resolves the `paired-plane-runs` alternative once to preview what it would add
(+X m) — same resolver, never a second formula.

## 5. Covering-core

- `resolveTilePitchRule` / `evaluation.gaugeRangeMm`: V35 `installationRules`
  now select the applicable range by pitch. None or two matching rules (shared
  boundary) → `pitch-rule-data-missing` / `pitch-rule-ambiguous`, Auto
  unavailable ("Brak jednoznacznych danych automatycznych dla tego kąta.").
  No seeded product contains rules; none were fabricated, and no manufacturer
  research was needed.
- `deriveCoveringSupportCapability(spec)` (derived, never stored):
  roof tile → Auto gauge from range; modular sheet → fixed support gauge
  (`battenGaugeMm ?? moduleLengthMm`), manual with equality validation;
  standing seam → no support model, "Ten sposób podparcia wymaga osobnej
  konfiguracji."
- Installation mode: a sole mode is used; several require a choice shown as
  **Sposób montażu** (Standardowy / Wariant …). No first-element fallback.

## 6. Edge references

Regular gauge (AUTO/RĘCZNIE), **Detal okapu** and **Detal kalenicy** (always
RĘCZNIE) are separate, with a schematic sketch and hints. Neither edge equals
the regular gauge; no universal edge values were introduced.

## 7. Surfaces

- **Pokrycie → Montaż pokrycia** block: product, mode, pitch ✓/✗, battens
  (gauge, rows per plane, geometric length, owner, state, actions),
  counter-battens (length, axes, partial reason, action), **Szczegóły montażu**.
- **Warstwy summary**: counter-battens `m · osie · Częściowo · 4 grzbiety H1
  wymagają wyboru detalu`; battens `gauge · rows · m · AUTO · Zgodne z
  pokryciem`; link to the installation plan.
- **Warstwy → Montaż pokrycia** (`buildUpView: 'installation'`, a view, not a
  perspective): subtle covering underlay, counter-battens wide translucent green
  drawn *under* thin brown battens, dashed unresolved hips, toggleable legend.
  Selecting a row keeps the view and shows plane, row number, distance from
  eave, gauge to previous/next, visible length, owner/state; an axis shows
  source member, plane, visible length, opening breaks and interior/boundary.
- **Guidance** in build-up order: Wybierz pokrycie → Sprawdź automatyczne
  rozmieszczenie łat → Uzupełnij detal grzbietu kontrłat → Warstwy gotowe.

## 8. Quantity, Material Plan, export

Lengths remain **geometric installation length**, never "do zakupu", no waste.
Material Plan rows are unchanged in source (same schedule rows); battens gain
the note `batten-gauge-unverified` / `batten-gauge-incompatible` when relevant.
Execution export `layoutFacts` add workflow state, covering product,
installation mode, and for counter-battens the hip detail and unresolved count,
next to the existing allowed/actual gauge, rows and edge references.
Per-row evidence (plane, source type, segments, length, section) already exists
for a future commercial-stock resolver; no joining/splitting was introduced.

## Limitations

- Edge references remain user-owned; snapshots have no verified edge contract.
- Rows at a hip apex with a 0 mm ridge reference have zero visible length and
  remain counted as courses.
- Modular-sheet battens are manual with module validation only; standing seam
  support is not modelled.
- The E2E catalogue is served from the seeded import batch through the real
  client; the live catalogue API was not available in the preview server.
