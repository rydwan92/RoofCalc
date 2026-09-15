# Future Execution Semantics Audit

## Status and purpose

V26C research summary only. It does not authorize calculation, schema, UI, or
procurement changes. Detailed evidence and gap analysis live in:

- `domain/COVERING_INSTALLATION_SEMANTICS_RESEARCH.md`;
- `domain/TIMBER_CONNECTION_EXECUTION_RESEARCH.md`;
- `domain/EXECUTION_SEMANTICS_MATRIX.md`.

The research confirms that one length, area, or `piece` count cannot safely
describe design, installation, fabrication, execution, procurement, and cost.

## Five geometry layers and their outputs

### 1. Physical product/member geometry

The manufactured object: tile outside dimensions, sheet total width/length,
membrane roll, or timber solid/section. It does not state what roof area is newly
covered or what blank must be bought.

### 2. Effective coverage geometry

The new installed width/length contributed by a repeating covering unit under
the selected product rules. Cover width, tile gauge, and effective sheet width
commonly already encode the relevant engagement or overlap.

### 3. Installation and joint geometry

Explicit product-system relationships: engagement, headlap, transverse joint,
support, staggering, edge treatment, pitch condition, course orientation, and
boundary detail. A continuous standing-seam panel has no transverse joint merely
because such a joint exists in its product documentation.

### 4. Fabrication and connection geometry

Finished cut planes, bevels, notches, seats, holes, and connector-specific end
preparations. An accepted connection may then yield a physical fabrication
blank. The current ridge cut is specifically a common rafter terminating at the
near face of a centered vertical ridge board, not a universal ridge condition.

### 5. Procurement geometry

Commercial stock/products and transformations: stock lengths, panels, sheets,
rolls, packs, kerf, stock end trims, availability, and remnants. It consumes
explicit physical requirements; it does not infer installation or joinery.

The layers produce separate business outputs:

```text
design geometry
  -> accepted installation/fabrication geometry
  -> exact execution requirement
  -> commercial procurement requirement
  -> future purchase/cost valuation
```

`Net roof area` is design geometry. `Gross installed membrane` is an execution
requirement. `Rolls to order` is procurement. They are not interchangeable.

## Non-double-counting invariant

Every engagement, overlap, trim, kerf, and allowance has exactly one owner and
is applied exactly once.

- A tile layout advancing by manufacturer cover width and gauge must not also
  subtract side lock/headlap from those steps.
- A sheet grid advancing by effective width must not deduct the side lap again.
- A transverse overlap is consumed only if an explicit segmented installation
  joint exists; never add it to a continuous full-slope panel.
- A fabrication trim allowance is resolved before procurement; stock kerf and
  commercial end trim remain inside procurement. Neither duplicates the other.

There is no safe universal `overlapMm`, `installationAllowanceMm`,
`genericCutAngle`, or `genericEndAllowance`.

## Current semantic boundary

Current tile/fixed-sheet positions and panel runs are effective-coverage
geometry. Their warnings correctly state that they are not order quantities,
but `full`, `cut`, `sheet`, or `piece` labels can still look commercial when
shown without that context. Membrane is net geometric area only when no roll
product is set; V34C added an opt-in gross (overlap-inclusive) course basis
once one is — still not an order quantity (see
`docs/domain/EXECUTION_SEMANTICS_MATRIX.md` roadmap item 4 for what shipped
and what remains deferred). Timber schedule axis lengths are takeoff
geometry, not universal fabrication blanks.

Future product snapshots should preserve versioned physical/effective facts,
applicability conditions, and permitted installation rules so saved projects do
not depend on a live catalogue. Project-specific joint locations and connection
choices remain canonical project intent, not catalogue facts.

## Ownership and adapter boundary

- `roof-math`: pure member geometry and exact fabrication cuts.
- `covering-core`: installed layout and covering-system execution rules.
- `catalog-core`: immutable/versioned technical product facts.
- `quantity-core`: exact execution quantities and physical required pieces.
- `procurement-core`: stock selection, cutting, kerf, trims, availability,
  remnants, and order units.
- future `cost-core`: monetary valuation.
- `apps/web`: intent capture and honest presentation.

No generic `execution-core` is justified: the shared concern is semantic
provenance, while covering installation and timber fabrication use different
domain operations.

For timber, the future adapter should pass an explicit physical blank
requirement (for example `requiredBlankLengthMm`), preserving its source member,
connection, finished geometry, and declared allowance. `procurement-core` must
not discover why extra material is required.

## Deferred implementation

V26C changes no production calculation. After the unmerged architecture work is
integrated, the safest first change is terminology/basis hardening with no
numerical change. Product-backed execution slices should then be implemented one
system at a time, with current manufacturer evidence and explicit regression
tests; not by enabling generic overlaps everywhere.
