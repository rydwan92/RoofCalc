# ADR-015 — Roofs are described by one topology graph; a drawing, a proposal and a calculation are different layers

**Status:** Accepted (VNext-6, 2026-10-20). Implements the contract part of
ADR-008. Persistence (the V2 document) is designed below and **not**
implemented.

## Context

`RoofProjectDocumentV1` holds one `RoofTemplateSpec` (gable or regular hip).
Every new shape added as another `roof.type` would grow `if (type === …)`
branches in the canvas, covering, quantities and documents. Users now bring
plans of L-shaped houses, mono-pitch annexes and asymmetric gables, and the
importers can already recognise an L outline. Three things were at risk of
being merged:

- a **drawing** — an outline recognised on a PDF or DXF;
- a **proposal** — planes and lines that would explain that outline;
- a **calculation** — what today's solver actually computes end to end.

Showing a proposed L as if it were a calculated roof would be a fake
success: the valley rafters, the junction framing and the covering cuts are
not solved.

## Decision

1. One renderer-neutral, solver-neutral contract, `RoofSceneGraph`
   (`packages/roof-topology-core`, `contractVersion: 1`):
   - `RoofStructureNode` — a building part with the transform that placed its
     local solver frame in the world (ADR-008) and the template family used;
   - `RoofPlane` — a planar 3D polygon (world mm, z up) with its frame
     (`u` along the eave, `v` up the slope), upward normal and pitch;
   - `RoofEdge` — `eave | ridge | hip | valley | verge | abutment | unknown`,
     one or two planes;
   - `RoofOpening` on a plane; `RoofStructureConnection` between two
     structures, above both (ADR-008);
   - every entity has an opaque ID (ADR-007), a `status`
     (`resolved | partial | unresolved`) and a `source`
     (`solver | document | cad | ifc | user | fixture`, with the source's own
     reference in `source.ref` and a stage
     `recognized | proposed | confirmed | computed`).
2. The package records, measures and checks geometry; it **solves nothing**.
   `assessRoofScene` answers two separate questions:
   - `geometry: complete | partial | invalid` — planar polygons, every
     boundary side classified, every declared line kind consistent with the
     geometry (a valley really is concave, judged next to the edge, so a
     notched plane is handled), every overlap between structures backed by a
     resolved connection;
   - `calculation: supported | not-supported` — `supported` only for one
     structure, computed by today's gable/hip solver, without connections.
   A complete mono-pitch or L graph is still `not-supported`: a correct
   drawing is not a calculated roof.
3. Three layers, never merged:
   - (a) recognised outline — `classifyPlanOutline` (rectangle, L, compound
     orthogonal, non-orthogonal) and `outlineSupport`;
   - (b) proposed graph — e.g. `outlineStructureCandidates` (structures
     without planes and an unresolved junction);
   - (c) canonical calculation model — `RoofProjectDocumentV1`, unchanged,
     adapted into the graph by `roofSceneFromResolvedRoof`, which copies the
     solver's planes and lines (structural input, no solver import) without
     changing a number.
4. Renderers (2D canvas, Three.js) and later covering/quantity code consume
   the graph produced by the one solver; intersections and angles are never
   computed a second time in a viewer.

Enforced by `tools/architecture/layering.test.ts` (the package imports no
workspace package, no renderer, no UI, no network) and by
`packages/roof-topology-core` tests: gable and hip adapted with identical
areas, pitches and line lengths; hand-checked mono-pitch, asymmetric gable
and L-with-valley scenes; an overlapping L without a solved junction is
`partial`; a valley declared as a hip is `invalid`.

## Migration design `RoofProjectDocumentV1 → V2` (not executed)

- V2 holds `structures: RoofStructureNodeV2[]`, each with today's local roof
  document (`roof`, `features`, `openingFraming`, `buildUp`, `coverings`,
  `connectionPlan`) and a transform; `connections` live beside them.
- A V1 file migrates to exactly one structure with the identity transform;
  its local IDs, technical snapshots and results stay byte-identical inside
  the node. References that leave a structure (selection, quantity sources,
  connections) become `{ structureId, localId }` pairs — never a parsed or
  concatenated string (ADR-007).
- The reader keeps V1 and V2; the writer writes V2 only after a user-visible
  version bump in `SCHEMA_REGISTRY.md`, a reference fixture per shape and the
  first non-gable/hip solver that passes surface → structure → covering →
  quantity → cost → documents (VNext-7, starting with mono-pitch).
- No SQL migration is needed: projects are stored as documents; the SQL
  catalogue and business tables do not hold roof geometry.

## Consequences

- New roof shapes are added by producing a graph (a solver in `roof-math`
  plus an adapter), not by a new `roof.type` branch in the UI.
- Import can show an L outline honestly today (CAD import:
  `reason: 'compound-outline'`) without pretending to calculate it.
- Until V2 exists, the graph is derived and session-only; nothing persisted
  changes, and old projects keep their exact semantics and results.
