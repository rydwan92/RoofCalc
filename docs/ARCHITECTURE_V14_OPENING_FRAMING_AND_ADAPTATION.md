# Architecture V14 — Opening Framing and Structural Adaptation Geometry

## Scope

V14 makes one bounded roof-window case participate in timber geometry. It is a geometric composition and fabrication-length feature, not structural engineering.

## Canonical model

`RoofProjectDocumentV1.project.openingFraming` is an additive optional V1 field normalized to `[]` for V13 and older V1 documents. This is backward-compatible because it does not reinterpret any existing field or resolver input.

`RoofOpeningFramingSpec` stores canonical intent only:

```text
id
kind = roof-opening-framing
featureId
headerSection
edgeOffsetMm
acceptedGeometrySignature
```

No derived member instance, length, world point, SVG point, selection, proposal, or camera state is serialized.

## Resolver

`resolveOpeningFraming()` consumes the current template, base skeleton, parent roof-window feature, and optional accepted spec. It uses the existing roof-plane basis and collision projection. The result contains:

- discriminated status and review status;
- affected and bounding physical member IDs;
- plane-local opening envelope;
- upper/lower header members and exact clear lengths;
- two deterministic segments for every interrupted source rafter;
- a current geometry signature and structured warning codes.

IDs are deterministic and scoped by opening:

```text
member:opening-framing:<featureId>
instance:opening-framing:<featureId>:upper|lower
instance:opening-rafter-segment:<featureId>:<sourceId>:upper|lower
```

## Composition

The template resolver and its base skeleton remain unchanged and recoverable:

```text
base roof skeleton
  + accepted current opening adaptations
  -> composed display skeleton
```

For an accepted `resolved + valid` result, composition removes each affected full K1 physical instance and adds its lower/upper segments plus both headers. A proposal adds only ghost headers and emphasis; it does not remove the source member or mutate the document. Removing or undoing the adaptation returns the untouched base skeleton exactly.

Conflicting, unsupported, invalid, orphaned, or `needs-review` results never enter the composed skeleton.

## Dependency and invalidation

The accepted signature covers roof type and principal geometry, spacing policy, roof plane, opening envelope, and the current affected/bounding IDs. Any relevant canonical change is re-resolved. A mismatch yields `needs-review`, displays a warning, and suspends the adaptation from composition until explicitly accepted again.

Multiple openings resolve independently. Overlapping envelopes or shared interrupted-rafter regions on the same plane yield `conflict`; V14 does not choose an order or merge them.

## Preview, apply, history, and deletion

- `planOpeningFraming` changes only transient `WorkbenchViewState` and creates no history.
- cancel clears the proposal and creates no history.
- apply stores one spec with the current signature and creates exactly one Undo entry.
- Undo/Redo restore the complete versioned document snapshot.
- deleting the parent opening removes its dependent framing spec in the same canonical transaction, preventing orphans.

## Workbench projection

The `Otwory` preset keeps the opening primary, emphasizes affected/bounding rafters, and renders headers with the shared selected/related/warning/muted semantics. Proposal headers use a restrained dashed ghost treatment. Exact geometry and status remain in the existing contextual Inspector; no permanent proposal panel is added.

The Toolbox nests framing status under its parent opening. Quick Calc has no opening-framing controls.

## Fabrication boundary

`withOpeningFramingFabrication()` adds only accepted, current header items to the project package:

- stable parent/physical IDs;
- section;
- quantity;
- exact clear geometric length.

Header-to-bounding-rafter joinery, saw angles, fasteners, allowances, and kerf are `LIMITED`/unresolved. The fabrication package consumes resolved geometry and does not calculate a second answer.

## Safety and non-goals

V14 does not select member sizes, double rafters, choose connectors, count fasteners, verify loads/capacity, or claim code compliance. It also adds no dormer, chimney, valley, covering, pricing, PDF, persistence service, authentication, database, or full 3D feature.

Research terminology and source notes are recorded in `docs/domain/ROOF_OPENING_FRAMING.md`.
