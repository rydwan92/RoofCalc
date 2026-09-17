# V48 — commercial planning for battens and counter-battens

Status: IMPLEMENTED. Starting HEAD: `3e62f79` (V47 closeout).

Turns *"Łaty: 814,6 m geometrii"* into *"Łaty 40×60: 44 × 3,0 m, kupiono 132 m,
wykorzystanie 91,6%"* — but only where the geometry and the joining rules
actually support that claim.

Research: `docs/domain/BATTEN_STOCK_AND_JOINING_RESEARCH.md`.

## Definition of Ready

1. **User problem:** a geometric length is not something you can buy. The
   Material Plan said `816,4 m · GEOMETRIA` and left the user to divide by a
   stock length in their head — which is wrong, because a batten may not be
   jointed anywhere.
2. **Domain owner:** the new `packages/linear-procurement` owns *how a run may
   be assembled*; `procurement-core` keeps owning *how blanks are cut from
   stock*. Neither knows about roofs. `apps/web/linear-material-plan.ts` is the
   only bridge, exactly like `k1-cutting-adapter.ts`.
3. **Canonical persistence:** the user's commercial decision is canonical —
   `RoofBuildUp.linearStock`, additive-optional. The plan itself is derived and
   never stored.
4. **Schema / migration:** no migration. `linearStock` is absent on every
   pre-V48 project, which simply means no purchase plan was prepared.
5. **Undo / history:** choosing lengths or changing a cutting setting is one
   ordinary undoable project edit. Geometry never depends on it.
6. **Quantity:** unchanged. The installation requirement is still the resolved
   geometry; the purchase plan is a second, clearly separate number.
7. **Procurement:** `createCuttingPlan` is reused unchanged. It receives only
   indivisible pieces.
8. **Catalogue:** none added. The offered lengths are labelled `SUGESTIA`
   because no verified batten product backs them yet (§15 of the prompt).
9. **Cost:** a resolved plan replaces the geometric-length suggestion with one
   `linear-stock` suggestion per commercial length, priced per piece.
10. **Offline:** entirely local and pure; manual-first works with no database.
11. **Mobile:** the panel is a single column at 390 px with no overflow.
12. **Research:** BS 5534 / RTA / Marley and Polish practice, classified by
    strength of evidence before anything was modelled.

## 1. The layer V48 exists to add

`RequiredPiece.requiredBlankLengthMm` means **one indivisible physical blank**.
A batten row is not that: it may legitimately be three pieces. Feeding a row
straight into `procurement-core` would have silently redefined its contract.

```
resolved installation run          (roof-math: ResolvedBatten / ResolvedCounterBatten)
        ↓  join / support policy   (linear-procurement)
installable physical pieces        (InstallablePiece — indivisible)
        ↓
RequiredPiece[]                    (unchanged procurement-core contract)
        ↓
cutting plan · stock requirements
```

`packages/linear-procurement` depends on `procurement-core` and nothing else in
the workspace; an architecture test enforces both directions.

## 2. Join policies

| Policy | Meaning | Used by |
| --- | --- | --- |
| `joint-at-support` | a butt joint may only sit on a resolved support | tile battens (research §2.1) |
| `joint-along-supporting-member` | the member below carries the run everywhere | counter-battens (research §2.4) |
| `continuous-piece-required` | one piece per run | available, unused by default |
| `manual-required` | the project has not decided | available |

**Support positions are real.** They are the plane's resolved rafter axes, via
`planeRafterAxes` — the axis resolution extracted from the counter-batten
layout so both consumers read the same structure. A nominal `rafterSpacingMm`
is never used.

**No floating joints.** `splitAtSupports` runs a backward DP over the support
stations; an edge is legal only if the piece fits the longest stock, meets the
minimum length and rests on at least `minimumSupportsPerPiece` supports. If no
path exists the run is `no-legal-joint-position` — never spliced anyway.

**Stagger.** Among paths that keep the minimum piece count, the least-loaded
support wins, so joints spread across courses. Where the geometry admits only
one split (a 9,6 m run on 800 mm supports has exactly one), the planner keeps
the material minimal and reports `staggerRelaxed` instead of silently buying
more timber or silently breaking the rule.

**Balance.** Ties prefer the station nearest an even division, because 4 m +
4 m fills two 4 m lengths exactly while 4,8 m + 3,2 m needs a 5 m and a 4 m and
throws away a metre.

## 3. Exact versus partial

| Case | Result |
| --- | --- |
| gable, square ends, no openings | **exact purchase plan** |
| gable with a roof window | **exact** — the opening already split the rows, and a piece can never bridge one |
| counter-battens, gable | **exact** |
| counter-battens, hip, H1 decided | **exact** for the runs the resolver produced |
| counter-battens, hip, H1 undecided | **blocked** — "Najpierw uzupełnij detal grzbietów H1" |
| any raking (hip/valley) end | **unplanned** unless the user sets an explicit allowance |

A raking end is the honest limit (research §2.6): the long point of a
bevel-cut batten of finite section is not derivable from the visible clipped
length. Without an allowance the run stays unresolved; with one, the allowance
is visible as `fabricationAllowanceMm` and is **never** folded into procurement
kerf — a fabrication allowance belongs upstream (prompt §9).

## 4. Surfaces

- **Material Plan.** `Łaty 816,4 m · GEOMETRIA` → `[Zaplanuj zakup]` →
  `Łaty 40×60 · 44 szt. · PLAN ZAKUPU`, with the installation requirement still
  shown as its own number. The summary counts move with the badge, so they can
  never disagree.
- **Purchase panel.** Requirement → commercial lengths (`SUGESTIA`) → plan →
  purchased / installed / waste / reusable offcuts / utilisation / joints.
  Repeated bar patterns, not one row per length. Advanced block holds kerf, end
  trim, smallest reusable offcut and the objective, phrased as *Najmniej
  odpadu* rather than as solver vocabulary.
- **Cost.** One `linear-stock` line per commercial length, `procurement-stock`
  basis, priced per piece. The geometric-length suggestion disappears, so an
  estimate never multiplies geometric metres by a per-length price. Quantity
  drift on an accepted line already flows through the existing §26 workflow.
- **Material list document.** States the same resolved plan: pieces, the
  per-length breakdown, requirement, purchased, waste and reusable offcuts. The
  detailed cut schedule stays out of the basic list.
- **Readiness.** `linear-plan-missing` is **info** (commercial planning is
  never mandatory) and `linear-plan-partial` is a **warning** that affects the
  material and cost documents.

## 5. Waste vocabulary

`procurement-core` already separates them and V48 keeps them separate
everywhere: **rzaz** (kerf), **obcięcie końców** (end trim), **odpad** (waste)
and **resztka użytkowa** (reusable offcut). An unused centimetre is not
automatically waste.

## 6. What this does not claim

- No structural statement: not that 40×60 is adequate, not that a joint pattern
  is approved, not that the fixings are sufficient (prompt §45).
- `1,2 m`, "three rafters" and "1 in 4" are BS 5534 values exposed as settings,
  not physical constants.
- The counter-batten joint *position* rule is a physical inference from
  continuous support, not a cited requirement.

## 7. Known limitation

Piece lengths are chosen before stock is packed. For the continuous policy an
even split can therefore be beaten by a stock-aware split: a 5,5 m run becomes
2 × 2,75 m (each from a 3 m length), where 4,0 m + 1,5 m would pack two 1,5 m
pieces into one 3 m length and use a 4 m length exactly. The plan is valid and
its numbers are true; it is not jointly optimal. Closing that gap means
optimising piece length and stock packing together — the natural V49.

## 8. Verification

21 package invariants (no unsupported joint, exact tiling, minimum length and
support count, stagger, determinism, allowance handling, policies), 16
reference fixtures on real roofs (gable exact plan, window adds runs, spread of
lengths beats a single length, finite availability, hip unplanned without an
allowance, undecided hip blocks the plan), Playwright flows for the gable
purchase plan, undo, the hip H1 route and the raking allowance, plus the full
suite, architecture tests and real-browser checks at 1920×1080, 1440×900,
1024×768 and 390×844.
