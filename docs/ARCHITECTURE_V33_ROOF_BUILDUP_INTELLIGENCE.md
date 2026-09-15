# V33 — Roof Build-up Intelligence

Status: COMPLETE after V33B closeout, 2026-09-15. This iteration composes the
existing roof structure, counter-battens, battens and roof-tile snapshots into
one derived workflow. It does not add structural sizing, purchase quantities,
pricing or a second geometry engine.

## Definition of Ready

1. **User problem:** A roofer currently receives four repeated covering errors
   and must manually copy a tile gauge into another task; hip counter-battens
   return no useful geometry. V33 derives a valid whole-course layout from the
   selected tile and exposes usable hip axes with an honest boundary limit.
2. **Domain owner:** `roof-math` owns the pure whole-course solver and
   rafter-axis geometry. `apps/web` owns the product-snapshot → neutral gauge
   constraint composition, workflow actions and presentation. `covering-core`
   remains the independent consumer/validator of resolved batten rows.
3. **Canonical persistence:** Only the user's batten mode intent is new
   canonical state. Calculated gauges, stations, statuses, overlay choices and
   grouped warnings are derived/transient (ADR-002).
4. **Schema / migration:** `RoofProjectDocumentV1.project.buildUp.battenLayout`
   gains optional `mode: 'manual' | 'auto-from-covering'`. Absence means manual,
   preserving every V12–V32 archive without a version bump. The schema registry
   and an old fixture regression are updated.
5. **Undo / Redo / history:** Switching mode or applying automatic repair is one
   canonical history entry. Disclosures, selected plane and overlay visibility
   create none. No gesture transaction is needed.
6. **Quantity:** Battens and counter-battens continue to emit only visible
   geometric lengths. Partial counter-batten geometry is explicitly marked and
   never promoted to a purchase quantity.
7. **Procurement:** No fabrication blank, allowance, stock length or procurement
   inference changes (ADR-009/ADR-010).
8. **Catalogue:** No new technical field is required. Auto mode reads only the
   selected installation mode's trusted `gaugeRangeMm` from the stored technical
   snapshot (ADR-003); catalogue labels remain presentation metadata.
9. **Future cost:** No price, currency, waste, margin or commercial quantity
   enters geometry, quantity or procurement (ADR-005).
10. **Offline:** All calculation, mode switching and manual repair work from the
    stored snapshot with no database or network. Only catalogue browsing keeps
    its existing remote dependency (ADR-006).
11. **Mobile:** The same Auto/Manual control, exact manual gauge, repair action,
    advanced offsets and overlay controls are reachable in the existing
    Inspector sheet at 390×844.
12. **Domain research:** `docs/domain/BATTEN_COUNTERBATTEN_LAYOUT_RESEARCH.md`
    records the whole-course fit, eave/ridge references, rafter-axis ownership
    and unresolved H1 face detail before implementation.
13. **Regression:** Pure solver boundary/invariant tests, gable/hip/opening
    counter-batten tests, V1 fixture compatibility, application composition
    tests, focused UI tests and two Playwright flows. Existing reference fixtures
    remain calculation baselines; fixture 09 covers old manual batten intent.
14. **Future multi-structure:** Inputs carry explicit plane/member IDs and use
    structured `side`/`sourceMemberId` provenance. No ID text is parsed and no
    new global-uniqueness claim is introduced (ADR-007/ADR-008).

## Decisions to implement

- `mode` is additive optional intent; `mode ?? 'manual'` is the compatibility
  rule. `gaugeMm` remains the retained manual value in both modes.
- Auto mode is derived from exactly one unambiguous roof-tile installation mode
  for the target planes. Missing or conflicting ownership produces a structured
  incomplete result instead of a guessed choice.
- `eaveOffsetMm` is the distance along plane-local `v` from the eave boundary to
  the first regular-course batten axis. `ridgeOffsetMm` is the distance from the
  ridge/upper boundary to the last regular-course axis. The span between those
  two references alone is divided into equal whole intervals.
- The solver evaluates every valid integer interval count and minimizes distance
  to the preferred gauge (or range midpoint). Equal-distance ties choose the
  smaller interval count, hence the larger actual gauge. Stations are calculated
  from their ordinal and the exact span; the final station is assigned to the
  exact final reference.
- Hip K1 and J1 axes are resolved from structured member kind/side/provenance and
  split around openings. H1 boundary counter-batten face geometry remains
  unresolved, so a useful hip result is `partial`, never a fake complete result.

## V33B closeout

The existing solver and roof build-up composition were retained. The closeout
completed Auto-to-Manual seeding from the resolved gauge, compatibility feedback
in both modes, compact result-first inspectors and independent drawing overlays.
Covering overlays render below batten/counter-batten axes. Local covering warnings
are grouped once with a repair action; cross-task guidance remains available.
Counter-batten plane selection stays in an advanced disclosure, with visible
ready/partial status and an explicit section-height label. Mobile header flex
wrapping was corrected so the required flows fit 390 px without overflow.

Hip boundary ownership now uses `roofPlaneIds` / `roofPlaneSide` and structured
member sides, preserving the existing opaque-ID boundary without a test allowlist
exception. H1 face geometry remains deliberately unresolved. No schema, solver,
procurement, catalogue-field or commercial-layer change was needed in V33B.

The required A flow covers a tile snapshot, automatic compatible battens and
useful partial hip counter-battens. The B flow covers invalid manual spacing,
one grouped warning and automatic repair, followed by gable batten/counter-batten
overlays. Both run in desktop and mobile Playwright projects. UI tests also
verify one repair history entry, derived gauge seeding and product-range changes.
Screenshots are inspected at 1920x1080, 1440x900, 1024x768 and 390x844. Native
Firefox control was unavailable under the Windows browser tool policy; browser
QA uses Playwright and its rendered screenshots.

Final `pnpm verify` passed all gates (74 test files / 705 tests and both builds);
`pnpm e2e` passed 32/32, including both V33 flows on desktop and mobile. The
existing Page.tsx exhaustive-deps lint warning remains, with zero lint errors.
The complete checkpoint is recorded in `PROJECT_BLUEPRINT.md`.
