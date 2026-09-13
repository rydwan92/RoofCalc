# Future compound-roof scene — architecture audit, not implementation

Status: strategic research for Iteration 025. No multi-structure document, resolver, UI or persistence is implemented here.

## Current V1 boundary

`RoofProjectDocumentV1` in `packages/calculator-core/src/project-document.ts` has exactly one `project.roof: RoofTemplateSpec`. `project.features`, `openingFraming`, `buildUp` and `coverings` implicitly belong to that roof. The roof template discriminates gable and regular hip cases; it is not a collection of buildings. A `ProjectRecordV1` in `project-core` wraps this technical document with name, timestamps and repository identity, while view/selection/camera/history stay outside both serialized layers. The current workbench resolver, fabrication package and quantity aggregation consume one roof's template and derived scene. They must continue to be described as single-roof.

Representative local IDs such as `roof-plane:left`, `instance:rafter-pair-4:left`, feature IDs, opening-framing references and member prototype IDs are stable **inside one roof**. A second independent roof could reuse any of them. `roofPlaneIds[]` in build-up and covering assignments, `feature.roofPlaneId`, quantity `sourceRoofPlaneIds`, canvas selection and fabrication references presently rely on this implicit scope. The V25 cut-to-length resolver takes explicitly supplied plane geometry and treats plane IDs as opaque; future solvers should follow that rule. New domain code must not infer roof type, side or plane role by parsing an ID string. Existing display-label helpers that know today's generated plane labels are presentation-only legacy conveniences to replace during a V2 migration.

## Possible V2 technical document boundary

One option for a later dedicated design iteration is a versioned `ProjectDocumentV2` with a collection of structure nodes, separate from the project record metadata:

```ts
interface RoofStructureNode {
  id: string;
  name: string;
  localRoofDocument: {
    roof: RoofTemplateSpec;
    features: RoofFeature[];
    openingFraming: RoofOpeningFramingSpec[];
    buildUp: RoofBuildUp;
    coverings: CoveringAssignmentSpec[];
  };
  transform: {
    translationXMm: number;
    translationYMm: number;
    elevationZMm: number;
    rotationAboutVerticalDeg: number;
  };
}
```

This is a candidate boundary, not a frozen schema. Local roof solvers would resolve a node before a pure transform places its geometry in the project world scene. That keeps gable, hip, surface, covering and fabrication math reusable without converting all existing local calculations to global coordinates. The transform must be defined against explicit axes, origin and handedness; rotated dimensions, roof-plane normals, elevation and contact tolerances need regression vectors.

Two identity designs remain open: (A) deterministic qualified global IDs, or (B) structured references `{ structureId, localId }`. Either must cover planes, members and prototypes, features/opening framing, build-up, covering assignments, drawing selection, quantities and fabrication operations together. A partial covering-only structure ID would create inconsistent references. Local IDs may remain unchanged inside each node. Generated display letters and left/right names are metadata, never global identity.

## Connections live above structures

A future `RoofConnectionSpec` should reference two structure IDs, anchors/contact references, a connection intent and explicit manual parameters. It must not be embedded in either `RoofTemplateSpec`. A separate connection resolver would consume transformed local scenes and derive intersection/contact geometry, affected members, structural adaptation candidates, covering interruption, flashing/junction geometry, quantities and warnings. Possible research classes include roof-to-wall abutment, roof-to-roof intersection, lower roof joining a higher structure, valley/intersection and constrained custom contact. This is not a finalized enum or an assertion that all are structurally equivalent. Joining two roofs requires geometric tolerances, sequencing, waterproofing and structural research before implementation.

Conceptual layering:

```text
ProjectDocumentV2
  → per-node local roof / skeleton / surface / feature / covering / fabrication resolution
  → node transforms into one world scene
  → independent connection graph resolution
  → connection-aware presentation and warnings
  → quantities per structure, connection, and whole project
```

Current `quantity-core` is single-roof; later aggregation should preserve a structure scope on every source and report both node subtotals and project totals, with connection material assigned once. Fabrication prototypes may be shared within a node but physical instance references must remain unambiguous across nodes. Covering's current one-primary-assignment-per-plane rule remains valid locally, while V2 will need consistently scoped plane references. The existing `ProjectRecord` concept can wrap a future versioned technical document; structure positions and connections belong in that document, never record metadata. Import/export and autosave must validate and persist one whole technical revision atomically; migration from V1 would place its one roof in one node under an explicit version upgrade, preserving technical snapshots and IDs.

The current Builder can later become the editor for one selected structure. A project-level Scene mode could list House/Garage/Porch and edit node position, elevation, rotation and connections. Selecting Garage would enter the familiar roof workbench scoped to it. Transient scene selection/camera remains outside canonical construction data. Quick Calc remains a single-member fast path.

## Research before a V2 implementation

- Define the transform origin and rotation convention, world/local coordinate references, intersection tolerance and precision policy.
- Compare qualified strings versus structured references through serialized documents, undo/redo, selection, API/export and migration.
- Specify contact anchors that survive roof template edits without parsing generated IDs.
- Research each roof connection class, affected structural members and roof-covering/waterproofing details using current technical sources; do not infer a joint from intersecting polygons alone.
- Determine whether separate structure-local fabrication prototypes may be coalesced in whole-project schedules, and how to avoid counting junction adaptations twice.
- Design V1-to-V2 import/export migration and failure handling before storing V2 documents.

Do not implement `StructureNode` persistence, global scene coordinates in local solvers, automatic valleys, roof-to-roof connections, flashing, connection quantities or V2 UI in Iteration 025.
