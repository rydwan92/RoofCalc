# Timber Connection Execution Research

## Status and safety boundary

Research and architecture note for V26C. RoofCalc currently resolves geometric
and fabrication information; it does not verify load paths, member sizing,
bearing capacity, fasteners, connectors, or code compliance. Those decisions
are **REQUIRES STRUCTURAL DESIGN**, including verification to the applicable
Polish/European rules and project conditions. The cited ICC/AWC material is a
recognized construction reference and useful terminology evidence, not a claim
of Polish compliance.

## Geometry layers for a connection

Every future timber connection must keep these layers distinct:

1. **Layout geometry** — member axis/centerline and theoretical intersection.
2. **Finished member geometry** — installed solid after explicit cuts/notches.
3. **Bearing/contact geometry** — faces or seats intended to transfer contact.
4. **Fabrication blank** — minimum physical stock envelope before machining,
   including only declared machining/trim allowances.
5. **Fastening/connector intent** — nails, screws, bolts, hangers, straps, plates,
   or other hardware with placement constraints.
6. **Structural verification** — loads, capacities, stability, code, species,
   grade, service class, and engineer acceptance.

An exact cut is not proof of structural adequacy. A connector selection is not
derivable from an axis intersection alone.

The current semantic audit follows the implementations and call sites of
`calculateCommonRafter`, `calculateRidgeCut`, and `calculateBirdsmouth` in
`packages/roof-math`, the K1/H1/J1 assembly and fabrication-plan resolvers, the
opening-framing resolver, and the timber schedule bridge in
`packages/quantity-core`.

## Current RoofCalc semantics

### Common rafter and ridge cut

`calculateCommonRafter(...)` first produces an ideal support-to-ridge-axis
reference line. That reference length explicitly excludes ridge deduction,
notches, and stock allowance.

`calculateRidgeCut(...)` assumes:

- a symmetric gable roof;
- a vertical ridge board centered on the run axis;
- the rafter terminates at the near face, located one-half ridge-board thickness
  from the ridge axis;
- a vertical/plumb end-cut plane;
- a face-to-member angle of `90 degrees - roof pitch` in the current reference;
- top/bottom intersection and cut-face length derived from that plane.

The assembly turns this result into a vertical end cut with datum `ridge-face`.
Its K1 `minimumStockLengthMm` reaches that finished top intersection from the
outer-eaves bottom frame. This is **CURRENTLY MODELED: common rafter butted to the
near face of a centered vertical ridge board**.

It is **NOT MODELED** as:

- a rafter bearing on top of a structural ridge beam;
- a rafter supported by a hanger at a ridge beam;
- two opposing rafters directly contacting each other;
- a gusset/plate/connector-specific ridge detail;
- a structural check of ridge board, ridge beam, tie, fastener, or bearing;
- a general asymmetric or offset ridge connection.

### Wall plate / birdsmouth

`calculateBirdsmouth(...)` resolves a horizontal seat from seat length and roof
slope, then derives vertical rise, normal notch depth, and remaining member
depth. It is useful finished-notch geometry for the current reference. It does
not determine required bearing length, permitted notch ratio/location,
fastening, uplift restraint, crushing capacity, or whether the selected cut is
structurally acceptable. Those are **REQUIRES STRUCTURAL DESIGN**.

### Hip rafter H1

The present H1 calculation is a regular equal-pitch hip-roof abstraction. It
deducts the centered ridge face by ridge-board thickness divided by square root
of two, derives a conceptual compound double-cheek end cut, and reports a
backing angle while explicitly leaving `back-or-drop-not-decided`. Geometry of
hardware, bearing, selected backing/drop operation, and structural adequacy is
not resolved.

### Jack rafter J1

J1 terminates at the theoretical vertical H1 center plane. It explicitly does
not apply a deduction to the physical hip-rafter face. Therefore the current
length is a center-plane geometric result, not a connector-ready finished end
or fabrication blank. Cheek cut, bevel reference, H1 section/face contact,
fastener/hanger clearance, kerf, and trim allowance remain unresolved.

### Roof-window framing

The current opening resolver is geometric: it identifies bounding common
rafters, adds two headers, and splits interrupted common rafters. It refuses
unsupported hip/jack intersections and edge-near cases. Header end joinery is
explicitly limited. It does not establish doubled trimmers, header sizing,
support/load transfer, connector selection, clearances from a window system, or
fabrication cuts. Its output must not be presented as structurally verified
opening framing.

### Quantity and procurement boundary

The generic timber schedule in `quantity-core` uses world-axis Euclidean lengths
(`axis-geometric`) for skeleton members. Calculator-specific K1/H1/J1 paths have
more specialized length facts, but those still do not universally include
connection preparation or machining allowance. A geometric member length is
therefore not automatically a safe procurement blank.

## Representative connection research

### Common rafter to ridge board

AWC describes a ridge board as a non-structural nailing/bearing surface for
opposing rafters; ICC guidance pairs this condition with opposing rafters and an
appropriate tie/load-path arrangement. Geometry may include a plumb cut against
the ridge-board face. The current solver captures that face termination only.
Opposition/alignment, fastening, ties, ridge-board sizing, and structural
conditions are missing and **REQUIRES STRUCTURAL DESIGN**.

### Common rafter to structural ridge beam

A structural ridge beam carries vertical roof load and needs supports/load path.
A rafter may bear on it, frame into its face with a hanger, or use another
designed detail. Each changes the reference surface, end cut, finished length,
bearing/contact, and possibly blank envelope. Reusing the current ridge-board
plumb cut would be an unjustified assumption. Connection and sizing are
**REQUIRES STRUCTURAL DESIGN**.

### Opposing rafters meeting directly

A direct meeting can use a butt/mitre relationship, plate/gusset, or another
designed detail. The controlling reference may be the roof center plane or the
opposing finished member, not a board face. It needs an explicit connection
intent and participant IDs. It is **NOT MODELED** and **REQUIRES STRUCTURAL
DESIGN**.

### Wall plate bearing / birdsmouth

The seat and heel/plumb cut are distinct cut surfaces tied to plate faces and
the rafter section. Applicable rules constrain bearing and notching, while
fasteners/restraints establish the load path. Future geometry should name the
plate top/side faces and resulting cut planes, never expose only a generic
`notchDepth` detached from those references. Structural limits remain outside
the geometry solver.

### Hip termination

Hip-to-ridge, hip-to-wall/plate, and hip-at-apex conditions can require different
compound cuts, backing/drop choices, bearing, support, or hardware. A regular
hip centerline and conceptual cheek cut are not enough to manufacture every
accepted detail. The future intent must identify the actual target face(s) and
selected fabrication operation.

### Jack rafter to hip rafter

The physical hip face, roof-side/skew, member sections, and connection detail
control the jack end. Simpson Strong-Tie's LSSJ guide is a representative
hardware-assisted case: the hanger has explicit slope/skew and fastener
requirements. That is materially different from a field-cut jack simply
butting the hip. RoofCalc must choose one discriminated detail before deriving a
finished end or blank; it must not convert the existing center-plane length
directly into an order length.

### Roof opening headers and trimmers

ICC provisions illustrate that opening headers/trimmers and their sizing depend
on interrupted span and support conditions. A geometric rectangle does not
decide member duplication, load transfer, hanger choice, end bearing, or
fabrication. Future modeling should accept an explicit, structurally approved
framing intent and then resolve its members/connections. It must not infer
structural adequacy from the opening size alone.

### Hardware-assisted connections

Hangers and connectors impose product-specific seat, flange, clearance, skew,
slope, fastener, and substrate constraints. These belong to a versioned
connector technical snapshot plus project connection intent. They are not a
universal end allowance, and procurement-core must not know connector geometry.

## No universal timber connection contract

Reject fields such as `connectionOverlapMm`, `genericCutAngle`, or
`genericEndAllowance` on every member. A future conceptual family such as
`RafterEndConnectionIntent` should be discriminated by connection kind. Each
variant must identify participants by stable IDs and state:

- target face/plane and coordinate reference;
- finished contact/bearing intent;
- required cut/notch operations and their datum;
- connector technical snapshot, when used;
- whether a blank allowance is prescribed and by whom;
- unresolved structural-design obligations.

This is a direction, not a production schema. It remains compatible with a
future house plus lower garage because the resolver receives explicit member,
connection, support, and product identities; it must never parse global ID text
or assume one project-wide ridge.

## Fabrication blank semantics

Procurement should eventually receive `requiredBlankLengthMm` (and, when needed,
a richer blank envelope/orientation), not guess from `finishedLengthMm`.

```text
accepted connection and finished solid
  -> fabrication resolver applies declared machining/trim allowance once
  -> explicit physical blank requirement
  -> quantity-core creates indivisible required piece
  -> procurement-core assigns commercial stock, kerf, trims, remnants
```

The adapter should preserve both traceability and semantics: finished geometry,
allowance source, required blank, stock class, and source member/connection IDs.
Kerf and commercial stock end trims remain procurement concerns; a fabrication
trim allowance remains upstream. Neither layer may add the other's loss again.
No change to V26 `RequiredPiece` is justified by this research iteration.

## Current gap map

### Currently correct

- Current K1 ridge-face cut is exact for its stated centered vertical
  ridge-board assumption.
- Birdsmouth math produces internally consistent finished-notch geometry for
  the supplied seat/slope reference.
- H1/J1 calculations explicitly disclose important limited assumptions.

### Currently approximate

- H1 termination/backing and J1 center-plane termination are design geometry,
  not complete fabrication details.
- Opening framing is a geometric member arrangement, not an approved structural
  or fabrication solution.
- Axis-geometric schedule lengths are useful takeoff facts, not universal blank
  lengths.

### Currently missing

- Ridge beam/direct-rafter/hardware variants, physical hip-face deduction for
  J1, connector geometry, most end joinery, explicit blank allowances, and all
  structural verification.

### Must not be implemented generically

- One end allowance, one ridge cut, one cut angle, or one connector rule for all
  timber relationships; nor procurement inference of connection details.

## Ownership

- `roof-math`: pure structural-member geometry and explicit finished cuts.
- `timber-model`: canonical member/connection intent and fabrication identity.
- future versioned catalogue data: connector/product technical facts.
- `quantity-core`: exact physical blank requirements derived from accepted
  fabrication geometry.
- `procurement-core`: commercial stock compatibility, cutting, kerf, trims, and
  remnants; no joinery inference.
- `apps/web`: intent capture and honest presentation.
- structural-design module/process: load and code verification, separate from
  geometric fabrication.

## Recognized technical sources

- [ICC 2021 IRC, Chapter 8: Roof-Ceiling Construction](https://codes.iccsafe.org/content/IRC2021P2/chapter-8-roof-ceiling-construction)
- [American Wood Council: Lumber Ridge Boards](https://awc.org/resources/wood-products/roof/lumber-ridge-boards/)
- [AWC 2018 WFCM Workbook](https://web-media.awc.org/wp-content/uploads/2021/12/17210707/AWC-WFCM2018-Workbook-181128.pdf)
- [Simpson Strong-Tie LSSJ installation guide](https://www.strongtie.com/resources/product-installers-guide/lssj-installation)
- [Simpson Strong-Tie stronger-roof connection overview](https://www.strongtie.com/solutions/stronger-roof)
