# RoofCalc — Architecture V26A: Timber Procurement Core Foundation

## 1. Purpose

`@cieslacalc/procurement-core` answers one technical question:

> How should exact required timber pieces be cut from the available commercial stock lengths?

It is a pure, renderer-independent TypeScript package. It does not decide roof geometry, which structural members exist, whether a section is structurally adequate, or what stock costs.

The intended layering is:

```text
geometry / accepted physical assembly
                ↓
          quantity-core
 exact indivisible member requirements
                ↓
        procurement-core
 stock selection, cutting and remnant plan
                ↓
        future cost-core
 commercial valuation of physical requirements
```

Quantity and procurement are deliberately separate. A quantity row can say that twelve exact K1 members of a given length exist. Procurement must additionally know which commercial lengths are available, how kerf and end preparation consume stock, whether finite availability is exhausted, and which remnants can be reused. Those are not geometric quantity facts.

## 2. Package boundary

The package contains only TypeScript types, validation and deterministic pure algorithms. It imports no React, Zustand, DOM, Express, Drizzle, MySQL, HTTP, local storage, translations, catalogue data or prices.

V26A does not integrate with Material Schedule or `RoofProjectDocumentV1`. A future application adapter may expand accepted `quantity-core` timber rows into one `RequiredPiece` per physical instance, preserving the upstream member ID and family as optional source metadata. Derived procurement plans remain outside canonical project persistence until a separately versioned persistence contract is approved.

## 3. Required pieces

`RequiredPiece` is one exact, indivisible physical requirement:

```ts
interface RequiredPiece {
  id: string;
  stockClassId: string;
  lengthMm: number;
  source?: {
    memberId?: string;
    family?: string;
  };
}
```

One required piece must come from one stock item. The optimizer never assembles a required piece from multiple remnants and never truncates an overlong piece.

Canonical dimensions are millimetres. Required pieces are compared and placed using their numeric millimetre values, never formatted `cm` or `m` strings.

## 4. Opaque stock classes

`stockClassId` is an opaque compatibility identity supplied by an upstream adapter. Procurement only tests exact equality. It does not parse a section from the ID, compare display labels, or infer C24/species/drying/treatment compatibility.

A future stock-class definition may combine:

- material and species,
- strength class,
- exact section,
- drying/moisture condition,
- treatment or other purchasing constraints.

That definition belongs outside the optimizer. Equal IDs are compatible; unequal IDs never share stock or remnants.

## 5. Commercial stock options and availability

`StockOption` identifies one commercial length for one stock class:

```ts
interface StockOption {
  id: string;
  stockClassId: string;
  lengthMm: number;
  availability?: number;
}
```

`availability: undefined` means unlimited for this planning run. An explicit availability is a finite nonnegative integer and is never treated as unlimited. Different options may expose lengths such as 6000, 7000, 8000 and 12000 mm without any price preference.

## 6. Kerf, end trims and usable length

V26A uses an explicit cutting convention:

```text
usableLength = originalLength - 2 × endTrimMm
```

`endTrimMm` is removed from each end of every opened stock item. Cut coordinates are measured along the original stock item, so the first required piece starts at `endTrimMm`.

One kerf is consumed between each adjacent pair of required pieces assigned to the same stock item:

```text
kerfTotal = max(0, assignedPieceCount - 1) × kerfMm
```

There is no hidden tolerance or implicit saw allowance. A single piece that occupies a stock item has no inter-piece kerf. End preparation is represented only by the explicit two trims. With zero trim, the 5600 mm + 1300 mm example consumes 6900 mm of pieces plus one 4 mm kerf from a 7000 mm stock item, leaving 96 mm.

A `1e-9 mm` internal epsilon is used only to normalize floating-point subtraction at exact boundaries. It is not a grouping, display-rounding or hidden fit tolerance.

## 7. Cutting plan and remnants

Each `StockUsage` records:

- exact stock class, option and deterministic physical instance ID,
- original and usable stock length,
- ordered `CutAssignment` coordinates,
- required-piece length used,
- kerf and two-end trim loss,
- one remaining unallocated segment,
- remnant classification.

The sequential one-dimensional layout keeps at most one open tail remainder per stock item. Later compatible pieces may consume it during the same plan. Every placement updates that single remainder, so no remnant is counted twice.

Classification is:

```text
remaining = 0                         → none
0 < remaining < reusable threshold   → waste
remaining ≥ reusable threshold       → reusable-remnant
```

End trims are counted in summary waste. Kerf is reported separately. `wasteLengthMm` therefore means end-trim loss plus positive non-reusable remainders; it excludes the separately reported kerf loss.

## 8. Optimization objectives and algorithm honesty

V26A supports:

- `minimum-waste` (default),
- `minimum-stock-count`.

The solver is `deterministic-best-fit-decreasing-v1`, a practical heuristic rather than a proof of mathematical global optimality.

Common behavior:

1. validate all boundaries before solving,
2. sort pieces by descending exact length with stable class/ID tie-breaks,
3. prefer a compatible already-open stock remainder,
4. choose the best-fitting open remainder deterministically,
5. open another available option only when no existing remainder fits.

For `minimum-waste`, a new stock item is the shortest immediately fitting usable option. For `minimum-stock-count`, a bounded one-stock greedy look-ahead prefers the option that can hold more remaining compatible pieces, then more required length, then less projected remainder. Stable stock length and ID tie-breaks make repeated runs identical.

This heuristic is bounded and suitable for larger project schedules. It intentionally avoids unbounded exhaustive search over an NP-hard cutting-stock problem. A later solver may replace the strategy behind the same input/result contract, but callers must not present V26A as a proven optimum.

## 9. Unassigned pieces

An impossible piece remains whole under `unassignedPieces` with a structured reason:

- `no-compatible-stock` — no stock option has the required opaque class,
- `piece-longer-than-stock` — compatible options exist, but the piece exceeds every usable length after trims,
- `availability-exhausted` — a fitting compatible option exists in principle, but the explicit stock limit is exhausted and no open remainder fits.

The optimizer never joins remnants, clips a piece, silently omits it or hides it in an invalid plan status.

## 10. Summary and grouping

The plan summary reports exact physical facts:

- required, assigned and unassigned piece counts,
- opened stock item count,
- total required and assigned piece length,
- total opened/purchased stock length,
- kerf and end-trim loss,
- non-reusable waste and reusable remnant length,
- utilization as assigned required length divided by opened stock length.

`requiredLengthMm` includes unassigned requirements; `assignedLengthMm` does not. For an empty/no-stock plan, utilization is `0`, never `NaN`.

`aggregateStockRequirements()` groups opened items by exact `stockClassId`, `stockOptionId` and millimetre length. It produces physical requirements such as `7000 mm × 8`; it does not attach a monetary meaning.

## 11. Catalogue and supplier boundary

Future catalogue/supplier integrations adapt their data into `StockOption[]`:

```text
catalogue timber product
        ↓ application adapter
opaque stock class + available lengths
        ↓
StockOption[]
```

`procurement-core` must not import `catalog-core`, call a catalogue API, or know supplier/manufacturer rules. Catalogue revisions and supplier availability remain external inputs.

## 12. Future Cost Engine boundary

A future Cost Engine consumes the procurement plan or its grouped stock requirements. It must not value raw `quantity-core.totalLengthMm` as though exact geometric length were already a commercial purchase plan.

V26A contains no price, currency, VAT, discount, supplier-offer or monetary objective fields. A future optional objective adapter may supply external weights without moving commercial data into the technical core, but that is not implemented here.

## 13. Multi-structure compatibility

The optimizer accepts only `RequiredPiece[]`; it does not assume one roof, building or project hierarchy. A future application can aggregate compatible requirements from a house, garage and other structures before calling procurement. Optional source metadata remains traceability information and never changes compatibility or packing behavior.

## 14. Explicit non-goals

V26A does not implement:

- UI or Material Schedule integration,
- ProjectDocument persistence,
- catalogue timber products or supplier databases,
- prices, Cost Engine, VAT, orders or warehouse state,
- automatic multi-roof/project aggregation,
- structural splicing, finger joints, scarf joints or glued composition,
- two-dimensional sheet nesting,
- roof-covering offcut optimization,
- structural sizing or safety verification,
- a globally optimal cutting-stock proof.
