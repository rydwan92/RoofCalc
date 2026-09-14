# Architecture V27 — Result semantics and professional takeoff UX

Status: implemented and verified on 2026-09-14. V27 changes the meaning exposed
by typed quantity contracts and presentation, while preserving every existing
geometric calculation.

## Definition of Ready

1. **User problem** — A carpenter or estimator can currently read a geometric
   covering position/run as a purchasable piece. V27 makes the basis and the
   unresolved downstream layers visible at the point where the number is used.
2. **Domain owner** — `covering-core` owns covering-result semantics at its
   quantity bridge; `quantity-core` owns schedule semantics and readiness. The
   web application owns translated explanations and disclosure UI.
3. **Canonical persistence impact** — None. Results, schedule rows, basis
   indicators and disclosure state remain derived or transient (ADR-002).
4. **Schema / migration impact** — None. No entry in `SCHEMA_REGISTRY.md`
   changes and all existing `RoofProjectDocumentV1` archives continue to open.
5. **Undo / Redo / history** — Result disclosure creates no history entry.
   V27 introduces no canonical edit and needs no gesture transaction.
6. **Quantity impact** — Covering sources gain discriminated semantic units;
   membrane and timber bases stay explicit. Only trusted resolved/limited
   family results continue to enter the schedule exactly as before.
7. **Procurement impact** — No `RequiredPiece[]` bridge is created and no blank
   is inferred. Readiness remains `geometric-only` until an upstream resolver
   supplies a real fabrication blank (ADR-009, ADR-010).
8. **Catalogue impact** — None. Technical snapshots and their deterministic
   calculation role stay unchanged (ADR-003).
9. **Future cost layer** — No price, currency, generic waste, margin or purchase
   quantity enters geometry, quantity or procurement (ADR-005).
10. **Offline behaviour** — All semantics and explanations render locally from
    the derived result; no database or network is required (ADR-006).
11. **Mobile UX** — The same basis badge and keyboard/touch-operable disclosure
    are present in the 390×844 Material Schedule and Covering flows, compact by
    default and without an additional permanent card stack.
12. **Domain research requirement** — Satisfied by the V26C execution-semantics
    audit and its covering/timber research. V27 adds no geometry or overlap rule.
13. **Regression strategy** — Focused source/row tests freeze all four covering
    counts, membrane net area and timber bases; UI tests cover precise wording
    and disclosure; Playwright adds one stable desktop/mobile semantics flow.
14. **Future multi-structure compatibility** — Semantics are explicit fields;
    no meaning is recovered from an ID and no new single-roof assumption is
    introduced (ADR-007, ADR-008).

## Result layers

V27 uses the following user-facing progression:

```text
GEOMETRIA → WYKONANIE → ROZKRÓJ → ZAKUP → future KOSZT
```

- **Geometry** is a design/layout fact: member axis, visible length, net
  surface, effective coverage position or geometric run.
- **Execution** exists only after physical installed pieces or fabrication
  blanks have actually been resolved.
- **Cutting** exists only after valid requirements and stock inputs have been
  supplied to a cutting planner.
- **Purchase** exists only after commercial order units have been resolved.
- **Cost** remains a future commerce concern.

The UI does not create empty result dashboards for absent layers. It shows one
compact basis badge beside a result and an optional progressive disclosure that
explains downstream states.

## Typed quantity vocabulary

`quantity-core` exposes a small renderer-independent vocabulary:

```text
QuantitySemanticKind
  axis-geometric
  resolved-visible
  net-geometric
  effective-coverage-position
  geometric-panel-run

RequirementReadiness
  geometric-only
  fabrication-resolved
  procurement-ready
```

`limited` is a result status, not a length basis, and therefore no longer sits
inside the length-basis union. Current schedule rows are all
`geometric-only`. The richer readiness union exists so a future composition
adapter must state when it has a real blank instead of treating every length as
procurement-ready.

Covering measures are discriminated:

| Layout family | Semantic | Unit |
| --- | --- | --- |
| roof tile | `effective-coverage-position` | `coverage-position` |
| fixed modular sheet | `effective-coverage-position` | `coverage-position` |
| standing seam | `geometric-panel-run` | `geometric-run` |
| cut-to-length sheet | `geometric-panel-run` | `geometric-run` |

The layout kind is also explicit. Presentation never identifies a family by
parsing an arbitrary `basis` string. Totals do not add positions and runs into
one false piece total; they remain separate by semantic.

## Covering and declared-consumption boundary

Tile/fixed-sheet counts remain effective-grid coverage positions. Standing-seam
and cut-to-length counts remain connected geometric runs, with exact geometric
length groups where available. None is an order quantity. A manufacturer's
declared units-per-area range stays a labelled reference/cross-check and never
replaces the resolved layout.

Effective widths, cover widths and gauges already encode their relevant
engagement in the current solvers. V27 adds no overlap or allowance. Applying
one again would double-count.

## Timber, membrane and procurement readiness

Structural timber schedule rows retain `axis-geometric`; batten and
counter-batten rows retain `resolved-visible`. The UI exposes those bases and
states that neither is a fabrication blank. The existing K1
`minimumStockLengthMm` calculation is presented as a minimum geometric length,
not material to buy; its number is unchanged.

Membrane remains `net-geometric` roof-plane area. It contains no laps, upstands,
roll layout, waste or commercial roll count.

`procurement-core` remains isolated from `quantity-core` and the application.
V27 creates no fake `requiredBlankLengthMm`, no stock UI and no cutting plan.

## UI language

- geometry/result basis is visible as text, not colour alone;
- tile and fixed-sheet values say *coverage positions*;
- standing-seam and cut-to-length values say *geometric runs*;
- explanations state both what is included and what is absent;
- disclosure uses native `<details>/<summary>` for keyboard and touch access;
- all copy comes from complete Polish and consistent English translation keys.

## Validation

- `pnpm verify`: typecheck, lint, format check, 631 tests in 64 files, and web/API
  production builds pass;
- `pnpm e2e`: 12/12 desktop/mobile tests pass, including result semantics and
  horizontal-overflow coverage;
- Chrome QA covers gable and hip, all four covering families, and Material
  Schedule at 1440×900, 1024×768, 390×844 and 360×800 with zero horizontal
  overflow;
- final web assets: main 542.66 kB / 155.48 kB gzip, CSS 121.47 / 23.00 kB gzip,
  ResultBasis 2.05 / 0.66 kB gzip, Material Schedule 12.93 / 3.29 kB gzip and
  Covering Workspace 40.99 / 8.09 kB gzip.

## Recommended next vertical slice

V28 should be limited to a K1 fabrication-blank-to-cutting-plan path: resolve a
real physical blank upstream, adapt only resolved requirements to
`procurement-core` at the application boundary, accept explicit stock/kerf/end
trim inputs and expose execution/cutting results. It must not generalize an
allowance, infer blanks from schedule axes, or introduce prices/costs.
