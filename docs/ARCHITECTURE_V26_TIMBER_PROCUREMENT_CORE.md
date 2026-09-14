# RoofCalc - Architecture V26B: Timber Procurement Core

## 1. Purpose and boundary

`@cieslacalc/procurement-core` answers one technical question:

> How should exact, indivisible timber requirements be cut from available commercial stock lengths?

It is a pure, deterministic TypeScript package. It does not decide roof geometry, structural adequacy, product compatibility, prices, or supplier policy. Its intended position is:

```text
accepted roof geometry
        -> quantity-core: exact physical member requirements
        -> procurement-core: stock selection, cuts, losses and remnants
        -> future cost-core: commercial valuation
```

The package imports no UI, renderer, browser, server, persistence, catalogue, translation, or price code. V26B does not integrate the plan with Material Schedule or `RoofProjectDocumentV1`.

## 2. Physical inputs

`RequiredPiece` represents one exact physical member. It is indivisible: one piece must be cut from one stock item. Two remnants are never joined to manufacture one rafter, and an overlong piece is never truncated.

`stockClassId` is an opaque compatibility identity supplied by an upstream adapter. Only exact equality is meaningful to procurement. A future class definition may account for species, strength class, section, moisture condition, and treatment, but none of those meanings is parsed here.

`StockOption` represents one commercial length for one stock class. `availability: undefined` means unlimited for this planning run; a number is an exact finite nonnegative item count. Lengths are canonical millimetres.

## 3. Canonical cutting convention

Every solver path uses the same fit and placement primitives:

```text
usable length = original stock length - 2 * endTrimMm
kerf total    = max(0, cut count - 1) * kerfMm
```

The first piece begins at the leading `endTrimMm`. Each later piece begins one `kerfMm` after the previous cut. A one-piece usage has no inter-piece kerf. The trailing trim is reserved by reducing usable capacity before placement.

A `1e-9 mm` epsilon only normalizes floating-point boundary calculations. It is not a fabrication tolerance and does not permit an oversize piece to fit.

Each stock usage contains a single open tail remainder. A later compatible requirement may consume it in the same plan. Remainders are never merged and never counted twice.

## 4. Material accounting

The result deliberately separates:

- required member material: the sum of assigned physical piece lengths;
- kerf loss: material consumed between adjacent cuts;
- end-trim loss: the two configured trims for each opened stock item;
- non-reusable remainder: a positive tail below the configured reuse threshold;
- reusable remnant: a tail at or above the threshold;
- purchased stock: the full original length of every opened stock item.

For each `StockUsage`:

```text
original stock
  = assigned piece lengths
  + kerfs
  + both end trims
  + remaining tail
```

At plan level:

```text
purchased stock
  = assigned member material
  + kerf loss
  + wasteLengthMm
  + reusableRemnantLengthMm
```

`wasteLengthMm` is end trims plus non-reusable remainders. Kerf is reported separately. A reusable remnant is not irreversible waste, but it is still unused purchased material for the current project.

## 5. Explicit plan score

`PlanScore` evaluates a completed physical plan without prices:

```ts
interface PlanScore {
  stockItemCount: number;
  purchasedStockLengthMm: number;
  irreversibleLossMm: number;
  reusableRemnantLengthMm: number;
  unusedPurchasedLengthMm: number;
  deterministicSignature: string;
}
```

Definitions:

- `irreversibleLossMm = kerfLossMm + wasteLengthMm`;
- `unusedPurchasedLengthMm = purchasedStockLengthMm - assignedLengthMm`;
- `deterministicSignature` is derived from canonical stock usages and cuts and is only the final stable tie-break.

The comparator is lexicographic. It uses no weighted score, floating-point multiplier, currency, or hidden preference.

## 6. Objective semantics

V26B supports three technical objectives.

### `minimum-waste` (default)

Comparison order:

1. least total unused purchased length;
2. least irreversible loss;
3. least reusable-remnant length;
4. least stock-item count;
5. least purchased length;
6. deterministic signature.

Here "waste" first means all purchased material not assigned to this project's required members, irrespective of whether the tail is reusable. This prevents a very long stock item from winning merely because its large remainder crosses the reusable threshold. Only after total unused material ties does the objective prefer less irreversible loss.

For complete plans over the same fixed requirements, minimizing unused purchased length and minimizing purchased length have the same primary mathematical result. The separate objective names remain useful because they express different intent and define explicit secondary ordering; neither is a cost objective.

### `minimum-purchased-length`

Comparison order:

1. least opened commercial stock length;
2. least irreversible loss;
3. least stock-item count;
4. least reusable-remnant length;
5. least unused purchased length;
6. deterministic signature.

No price or monetary proxy is involved. This objective must never be labelled `minimum-cost`.

### `minimum-stock-count`

Comparison order:

1. least opened stock-item count;
2. least purchased length;
3. least irreversible loss;
4. least reusable-remnant length;
5. least unused purchased length;
6. deterministic signature.

This objective can intentionally choose one longer commercial item over two shorter items. Its secondary purchased-length criterion still rejects gratuitously oversized alternatives when item counts tie.

## 7. Hybrid bounded solver

The reported solver is `hybrid-bounded-branch-and-bound-v2`.

The optimizer first partitions requirements by exact `stockClassId`; incompatible classes can never share stock and therefore form independent search problems. For each class it:

1. sorts requirements by descending length with stable identity tie-breaks;
2. builds a deterministic best-fit-decreasing heuristic plan as an initial incumbent;
3. for a supported small/medium group, explores a deterministic branch-and-bound search;
4. prunes states already worse than the incumbent and symmetric open-stock placements;
5. respects finite availability while opening every candidate stock item;
6. returns the best complete incumbent found, or the safe heuristic fallback.

The exact-search defaults are:

- at most 16 required pieces per stock class;
- at most 8 stock options per stock class;
- at most 50,000 visited states per stock class.

Callers may lower the piece/state limits. Validated hard ceilings are 20 pieces and 100,000 states per class, so the public configuration cannot turn this into an unbounded exponential solver. Groups beyond a limit use the deterministic heuristic. Search uses the same trim, kerf, capacity, and append primitives as the heuristic.

The search may recover a complete plan when a greedy ordering exhausts finite availability prematurely. Availability is enforced in both solver paths.

## 8. Optimality honesty and diagnostics

Every result includes the chosen objective, solver strategy, plan score, overall optimality, and bounded diagnostics. Diagnostics repeat the objective, strategy, and optimality and report visited states, configured per-class budget, budget exhaustion, and compact per-stock-class facts. Internal search trees are not exposed.

Optimality values mean:

- `heuristic`: exact improvement was intentionally skipped or no complete exact incumbent was established;
- `proven-within-search-space`: the bounded search completed for every class and proved the best result under the implemented input model and lexicographic objective;
- `search-budget-exhausted`: at least one class stopped at its state budget, so the returned incumbent is valid and deterministic but is not claimed optimal.

Large schedules, excessive option sets, impossible requirements, and exhausted budgets do not make a valid request throw. The best safe plan is returned with honest metadata and structured unassigned pieces where necessary.

## 9. Canonical result ordering

Equivalent results serialize deterministically:

- stock classes are solved and reported by stable class ID;
- stock options use stable length and ID tie-breaks;
- stock usages are ordered by class, original length, option ID, and cut signature;
- cuts retain deterministic placement order from the sorted requirements;
- physical stock instance IDs are regenerated from canonical option ordinals;
- unassigned pieces are ordered by class, descending length, and ID.

Repeated calls with identical values produce deep-equal results, including diagnostics and instance IDs. Physical `stockInstanceId` remains distinct from a shared stock-option identity.

## 10. Unassigned requirements

An unassigned piece remains whole and has one structured reason:

- `no-compatible-stock`;
- `piece-longer-than-stock` after trims;
- `availability-exhausted`.

The optimizer never clips, joins, duplicates, or silently omits a requirement.

## 11. Catalogue, persistence, and future cost boundary

Future catalogue or supplier adapters may produce `StockOption[]`, but procurement-core must not import catalogue data or supplier rules. Catalogue revisions and availability are external inputs.

A future Cost Engine may value `aggregateStockRequirements()` or the physical plan. It must not treat exact required-member length as already purchased commercial stock. Currency, VAT, discounts, supplier offers, inventory orders, and monetary objectives remain outside V26B.

Derived procurement plans remain outside canonical project persistence until a separately versioned persistence contract is approved.

## 12. Verification focus and non-goals

Tests cover greedy counterexamples, exact finite availability, kerf/trim boundaries, multiple stock classes, canonical ordering, realistic repeated K1/J1/H1-style fixtures, a larger fallback case, and seeded property-style accounting invariants.

V26B does not implement UI, Material Schedule integration, ProjectDocument persistence, prices, warehouse state, structural splicing, sheet nesting, covering offcut optimization, structural verification, or any execution-semantics change to roof coverings and rafter connections.
