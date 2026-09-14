# Future Execution Semantics Audit

## Status and purpose

This is an architecture and research note only. It records a boundary that future RoofCalc work must make explicit before implementing covering procurement, installation rules, or additional timber connections. It does not authorize changes to current roof geometry, covering layouts, quantities, fabrication cuts, or procurement code.

The core finding is that one dimension or one area cannot safely represent every stage from a physical product to an installed roof. Future domain models must distinguish five related but different geometries.

## Five geometry layers

### 1. Physical product or member geometry

The actual manufactured object: a tile's outside dimensions, a sheet's total width and length, a membrane roll's dimensions, or a timber member's solid shape and section. These values describe what exists physically, not necessarily what one unit covers after installation.

### 2. Effective coverage geometry

The net roof width, length, or area contributed by one installed product under stated manufacturer rules. Effective coverage may already account for side locks, laps, hooks, seams, or gauge. It is a product-system property and must retain its source and applicability conditions.

### 3. Installation overlap and joint rules

Rules that relate adjacent products or runs: headlap, sidelap, transverse overlap, seam allowance, minimum bearing, edge treatment, pitch-dependent gauge, or rules for joining panels. These are operations and constraints, not automatically extra dimensions to subtract from effective coverage.

### 4. Fabrication and connection geometry

Geometry used to manufacture or connect members: explicit cut planes, bevels, notches, holes, seats, end preparations, and connection-type allowances. This layer derives fabrication facts from the accepted assembly but must not be conflated with a product's gross length or with procurement stock loss.

### 5. Procurement geometry

Commercial units that must be opened or ordered: stock lengths, sheet or panel lengths, roll sizes, packs, cutting kerf, end trims, reusable remnants, and other purchasing constraints. Procurement consumes exact physical requirements plus declared execution rules; it must not reverse-engineer them from formatted quantities.

## Non-double-counting rule

An overlap must be represented exactly once in the path from product data to installed coverage and procurement.

If a manufacturer-provided effective cover width, cover length, or gauge already encodes a lock or overlap, a future calculator must not subtract the same overlap again. Conversely, gross physical dimensions alone are insufficient when an installation joint consumes material. The model needs provenance such as `physical`, `effective`, or `explicit-joint-rule`, plus the conditions under which the value is valid.

This means there is no universal rule that every covering receives an additional numeric overlap deduction. The correct rule depends on how the supplied effective dimension was defined.

## Domain examples

### Roof tile

A tile can have physical width and length that differ from its cover width and installed batten gauge. Side interlock and headlap may already be reflected in manufacturer tables, and the permitted gauge may vary with pitch, exposure, or product variant.

Future data must therefore keep physical dimensions distinct from effective cover width and batten gauge. A layout using an effective value must not separately deduct the lock or headlap already encoded by that value. Edge, ridge, eaves, and cut-tile rules remain separate installation constraints.

### Profiled metal sheet

A sheet may expose total width and a smaller effective cover width because of the side lap. A transverse joint, when a slope needs more than one sheet along the fall, can additionally reduce the effective run length.

Future logic must know whether a quoted width is gross or effective and whether a transverse joint actually exists. It must not apply a transverse overlap to a single continuous sheet, nor subtract a side lap twice when effective width already includes it.

### Standing seam

A continuous panel from eaves to ridge has a physical run and seam-system allowances but no longitudinal joint merely because the roof is long. If manufacture, transport, or product constraints require panels to be joined along the fall, that explicit joint introduces a separate longitudinal overlap or connection rule.

Future modeling should distinguish a continuous run from a segmented run, record why a join is required, and derive procurement lengths from that decision. It must not assume every standing-seam panel has a longitudinal overlap.

### Timber connections

A ridge-board plumb cut is one explicit rafter end-connection geometry. Other accepted assemblies may use a ridge beam, opposing-rafter connection, hanger, birdsmouth/seat relationship, bevel, notch, or connector-specific end preparation. Those alternatives can change finished member geometry and stock allowance.

Future work must represent the selected connection as a discriminated domain operation with an exact reference plane or face. It must not reuse one generic `cut angle` or silently treat every ridge condition as a ridge-board plumb cut. Structural verification remains separate from geometric fabrication output.

### Membrane

Net roof surface area is not automatically the purchasable membrane requirement. A future roll plan may need declared sidelaps, endlaps, ridge/eaves/edge allowances, orientation, roll width and length, openings, and reuse policy.

If an upstream quantity already represents effective installed coverage including a particular overlap, the roll planner must not add that overlap again. If it represents net roof area, explicit installation rules may be required before procurement can be calculated. The semantic source of the area must therefore be carried with the value.

## Proposed future contract direction

A future execution layer should transform rather than blur these stages:

```text
physical assembly geometry
        + selected product/system facts
        + explicit installation and connection rules
        -> effective installed requirements
        -> fabrication requirements
        -> procurement requirements
```

Useful future contracts should:

- use discriminated rule types instead of ambiguous optional numbers;
- identify whether dimensions are gross, effective, or rule-derived;
- retain manufacturer/source/version and applicability constraints;
- state the reference face, plane, direction, and joint for every fabrication angle or allowance;
- keep exact canonical millimetres and square millimetres below display formatting;
- make derived execution/procurement data reproducible from canonical inputs;
- prevent the same overlap, trim, or allowance from being applied in two layers;
- remain independent of prices and structural-safety claims.

## Deferred implementation

No execution changes are implemented by V26B. Tile layout, sheet layout, standing-seam segmentation, rafter connection cuts, and membrane quantities must wait for the relevant architecture work to be merged and for explicit domain contracts to be approved.
