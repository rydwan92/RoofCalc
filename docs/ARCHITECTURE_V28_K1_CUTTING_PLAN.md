# Architecture V28 — K1 fabrication blank and cutting plan

Status: implemented and verified on 2026-09-14. This is a narrow
execution/procurement slice for whole common rafters K1.

## Definition of Ready

1. **User problem** — A carpenter sees geometric K1 quantities but cannot know
   which commercial lengths cover the modeled cuts. The plan turns verified
   whole K1 blanks into grouped stock lengths and cut layouts.
2. **Domain owner** — `roof-math` proves the blank from its resolved assembly;
   `apps/web` composes physical instances with `procurement-core`. Neither
   quantity rows nor procurement infer joinery.
3. **Canonical persistence impact** — None. The cutting scenario and result are
   transient; roof construction remains the only canonical input.
4. **Schema / migration impact** — None. ProjectDocument V1 and saved archives
   remain unchanged; procurement's runtime contract retains its V26D meanings.
5. **Undo / Redo / history** — Stock and settings edits create no roof-history
   entries. Any roof edit invalidates the displayed derived plan.
6. **Quantity impact** — Existing schedule stays geometric. Only an explicit K1
   resolver result becomes a physical blank; partial/unresolved instances are
   excluded from the planning adapter.
7. **Procurement impact** — The adapter supplies `requiredBlankLengthMm` once.
   Kerf and stock-end trim belong solely to procurement (ADR-009/010).
8. **Catalogue impact** — None. Commercial lengths are entered by the user and
   no species, grade or supplier is inferred.
9. **Future cost layer** — No currency, price, margin or generic waste
   allowance enters geometry, quantity or procurement (ADR-005).
10. **Offline behaviour** — The resolver, stock input, solver, list and copy
    operate locally without a database or network (ADR-006).
11. **Mobile UX** — K1 opens the same focused task in `MobileSheet`; exact
    length/setting inputs use the active display unit at 390×844 and 360×800.
12. **Domain research requirement** — The V26C execution audit and timber
    connection research identify the specific ridge-board termination and
    unresolved alternative connections. No new connection geometry is added.
13. **Regression strategy** — Resolver enclosure and exclusion tests, adapter
    instance/stock-class tests, UI flow tests and desktop/mobile Playwright.
    Reference gable/hip projects remain geometric invariants.
14. **Future multi-structure compatibility** — Instance IDs are opaque and
    passed through untouched; stock-class compatibility derives from explicit
    section values. A future structure scope must be supplied explicitly.

## Execution proof

`resolveAssembly` models a common rafter butted against the **near face of a
centered vertical ridge board**. It resolves an eave plumb cut, a ridge plumb
cut, and seat notches from the same local member frame. The K1 blank resolver
checks that every point of the finished profile, both end-cut lines, every
notch removal profile and marking datum lies inside the physical unmachined
section envelope. It derives the length from the largest local longitudinal
coordinate needed to contain those cuts, with the outer-eave start at zero.
The existing `minimumStockLengthMm` is only a cross-check, not the input renamed
as a blank. The resolved requirement carries the source prototype, end-cut and
joint IDs as its finished-geometry reference. No machining allowance is
silently added.

A missing/nonpositive ridge-board thickness, invalid/missing cuts or any point
outside the rectangular envelope returns an explicit unresolved reason. The
proof is geometric containment for **currently modeled cuts only**. It is not
structural approval, connector selection, a saw setup instruction or evidence
for ridge beam/direct meeting/hanger variants.

## Application boundary

The application adapter intersects whole K1 schedule member IDs with the
resolved K1 prototype IDs, preserving one `RequiredPiece` per physical
instance. Interrupted rafters, H1, J1, headers and other quantity rows cannot
pass this gate. `source.referenceId` is the opaque instance ID. The application
constructs a deterministic stock-class ID from the explicit width and depth
of the K1 section; procurement only compares this ID for exact equality.

The user supplies commercial lengths and optional finite availability in the
active display unit, converted to canonical millimetres. The derived plan is
recomputed from the current requirement and session-local scenario. A roof edit
invalidates the old plan. No plan is serialized into project history.

## Result semantics and limits

`aggregateStockRequirements` groups opened commercial stock by option; the UI
coalesces equal class/length rows into one material-list line. The resulting
list is a physical cutting-scenario requirement, not a
priced order or confirmed supplier offer. Each unassigned blank remains visible
with the structured solver reason. Utilization is assigned blank length divided
by purchased stock length. Kerf, stock-end trims, non-reusable waste and reusable
remnants remain separate. H1, J1, openings, covering, membrane and all prices
remain unresolved outside this pilot.
