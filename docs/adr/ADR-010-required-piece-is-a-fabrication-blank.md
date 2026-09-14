# ADR-010 — `RequiredPiece` means one required physical fabrication blank

## Status

Accepted (V26D contract freeze).

## Context

`lengthMm` on a procurement input is ambiguous in the worst possible way. It
could mean the theoretical member length, the axis length, the visible length
after opening subtraction, the length including overhang, the length after
fabrication allowance, or the commercial length someone intends to buy. A
schedule row and a stock item both have "a length", and they are different
things. An optimizer that quietly assumes the wrong one produces a plan that
looks right and cuts material short.

## Decision

The field is named **`requiredBlankLengthMm`**, and the contract states what it
means: the length that must be obtained from **one** compatible stock item,
before procurement kerf and stock-end trims are applied, with every fabrication
allowance already resolved upstream (ADR-009).

Supporting rules, frozen in V26D:

- A required piece is **indivisible**. Two remnants are never joined to make one
  member, and an overlong piece is never truncated to fit.
- `CutAssignment` and `UnassignedPiece` repeat `requiredBlankLengthMm`, so no
  consumer has to guess which length a cut refers to.
- `StockRequirement.lengthMm` is explicitly documented as a *commercial stock
  length, not a fabrication-blank length* — the two never share a name.
- `RequiredPieceSource.referenceId` is opaque upstream correlation. Procurement
  preserves it and never parses it (ADR-007).
- The summary separates `requiredBlankLengthMm`, `assignedBlankLengthMm`,
  `purchasedStockLengthMm`, `kerfLossMm`, `endTrimLossMm`, `wasteLengthMm` and
  `reusableRemnantLengthMm`, so no single figure has to carry two meanings.

## Consequences

- Anyone reading the contract knows which length they must supply.
- Renaming the field back to `lengthMm`, or adding a second ambiguous length,
  is an ADR change — and `tools/architecture/opaque-ids.test.ts` asserts the
  name is still there.
- A future UI must not label a procurement figure as a purchase quantity until a
  commerce layer exists to say so.
