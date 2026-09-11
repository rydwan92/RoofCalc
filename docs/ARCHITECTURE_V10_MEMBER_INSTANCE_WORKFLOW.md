# RoofCalc / CieślaCalc — Architecture V10: Member Instance Workflow

## 1. Purpose

V9 established a versioned project document, transient workbench state, intelligent view presets and one roof-level fabrication package. V10 connects those foundations to one physical piece in the roof.

The user-facing path is:

```text
roof
  → fabrication family / shared prototype
  → physical member instance
  → preparation operation anchored on that instance
  → canonical detail preview when supported
```

V10 remains a coordinated SVG/2.5D workbench. It does not add a second solver, full CAD, individual fabrication overrides or unverified H1/J1 geometry.

## 2. Canonical and transient boundaries

The persisted/revision-ready boundary remains unchanged:

```text
RoofProjectDocumentV1
└── project.roof: RoofTemplateSpec
```

It contains no selection, active instance, operation, breadcrumb, locator, drawer, isolation, view preset, dimensions, camera or hover data.

`WorkbenchViewState` owns the active semantic selection and instance-navigation context. These are view-only transitions and never create `historyPast` entries. Camera, pointer drag and hover remain component-local.

## 3. One resolved data graph

The page derives the expensive project graph once per canonical roof change:

```text
RoofTemplateSpec
  ├── resolveRoofTemplate()
  ├── createRoofSkeleton()
  └── createRoofFabricationPackage(resolved)
        ↓
createMemberInstanceProjection(resolved, skeleton, package)
        ↓
WorkbenchContextBar / Skeleton / Inspector / Preparation / Drawer
```

The skeleton is passed to renderers; a child must not resolve the roof again. UI-only selection/navigation changes reuse the same memoized resolved objects.

## 4. Physical instance projection

The renderer-neutral V10 projection is `MemberInstanceContext`:

```ts
interface MemberInstanceContext {
  instanceId: string;
  prototypeId: string;
  familyCode: 'K1' | 'H1' | 'J1';
  memberKind: 'common-rafter' | 'hip-rafter' | 'jack-rafter';
  instanceIndex: number;
  instanceCount: number;
  side: SkeletonMemberSide;
  roofPlaneId?: JackRafterRoofPlane;
  hipCorner?: HipCorner;
  buildingStationMm?: number;
  lengthMm: number;
  lengthGroupId: string;
  section: TimberSection;
  relatedInstanceIds: string[];
  relatedOperationIds: string[];
  operations: MemberInstanceOperationContext[];
  warningKeys: string[];
}
```

It is a pure projection in `calculator-core`. It may consume already-resolved geometry and fabrication output, but contains no React, DOM, CSS pixels, language strings or viewport state.

### 4.1 Identity

- `instanceId` identifies one physical `SkeletonMember3D`.
- `prototypeId` identifies one shared fabrication definition.
- `familyCode` is a stable technical code, not translated copy.
- K1/H1/J1 instances retain the IDs emitted by the canonical roof resolver.
- No per-instance fabrication calculation is introduced.

### 4.2 Length groups

Length groups come only from the matching `MemberFabricationPackage.lengthGroups`.

Stable group IDs are derived from deterministic package order:

```text
length-group:<family-code>:<one-based-index>
```

K1 and H1 normally share one group. Every J1 instance is matched by its `instanceId` to the correct exact-length group. No rounded display value is used for grouping.

### 4.3 Deterministic order

Family order is spatial and independent of view state:

- K1: building station, then side, then stable ID;
- H1: front-left, front-right, rear-left, rear-right;
- J1: hip corner, roof plane, ordinal from corner, then stable ID.

Previous/next navigation operates inside this order and wraps at the ends. Mirrored members keep separate instance identities while sharing the appropriate prototype/group.

## 5. Instance operation context

Each instance projects its prototype's real `FabricationOperationSummary` entries:

```ts
interface MemberInstanceOperationContext {
  operationId: string;
  code: string;
  labelKey: string;
  status: 'resolved' | 'limited';
  relatedSupportId?: string;
  stationMm: number;
  stationRatio: number;
  worldPoint: Point3D;
  reference: 'member-axis-from-outer-eave';
  removesMaterial: true;
  detailPreviewId?: string;
  warningKeys: string[];
}
```

Operation geometry is not recalculated:

- K1 uses exact stations already present in resolved seat/ridge operations.
- H1 uses the resolved ridge-face endpoint when its operation has no scalar station.
- J1 wall-seat uses the shared resolved wall-seat station; the theoretical H1 meeting uses the selected J1 reference length/endpoint.

`stationRatio` only places an existing operation on the selected 3D member axis. `worldPoint` is linear interpolation between the canonical skeleton instance endpoints. This is a spatial view projection, not cut mathematics.

If no real `DetailPreviewModel` exists, `detailPreviewId` is absent. Activating such an operation keeps the instance and operation context, shows its dimensions/warnings in preparation/Inspector, and closes any stale drawer instead of inventing a detail.

## 6. Semantic selection model

`selectedId` continues to identify the currently deepest semantic object. V10 adds an explicit `selectedInstanceId` so opening an operation/detail does not discard the physical member that led to it.

Derived hierarchy:

```text
roof
prototype
instance (selectedInstanceId)
operation (activeOperationId / selectedId)
detail (detailDrawer.activePreviewId)
```

Supports and joints remain valid direct selection contexts. All panels derive from this shared state; they do not keep private copies.

State transitions:

- selecting roof clears instance, prototype, operation and isolation;
- selecting a prototype clears the physical instance;
- selecting a physical member stores both instance and prototype;
- activating an operation preserves a compatible physical instance;
- navigating inside a family preserves a compatible operation and clears it safely otherwise;
- `Escape` moves operation → instance → roof;
- form controls are excluded from global Escape/Undo shortcut handling.

Empty-canvas panning does not collapse an open operation/detail workflow. An explicit roof breadcrumb or repeated Escape provides the safe return.

## 7. Coordinated workbench surfaces

### WorkbenchContextBar

Renders one compact interactive breadcrumb from the semantic hierarchy. Ancestors are buttons with accessible names. It also hosts the instance navigator when an instance is active.

### InstanceNavigator

Shows family/index, previous/next, exact length, prototype-sharing note, length group, `Pokaż na dachu` and `Izoluj`. It changes view state only.

### SkeletonCanvas and MemberInstanceOverlay

The skeleton receives the already-derived skeleton and active instance. The overlay projects each operation's `worldPoint` through the same fit and viewport transform used by the member solids.

Marker collision policy is intentionally small and deterministic:

1. active operation has highest priority and an expanded label;
2. markers closer than the presentation threshold receive alternating offsets;
3. inactive markers use compact codes;
4. narrow layouts keep codes only while exact content remains in Inspector/Drawer.

Offsets are presentation layout after viewport projection. Operation locations themselves never use hard-coded pixels.

### OrientationMiniMap

Receives the existing `RoofSkeleton` and active instance ID. It fits the same member axes into a small SVG and applies the same selected/muted semantics. It performs no roof calculation.

### MemberInstanceInspector

Displays identity, spatial location, section, exact resolved length, group, prototype sharing, operations and limitations. It does not suggest per-instance editing.

### PreparationPlan and DetailDrawer

Preparation stays family/operation-driven but follows the selected instance and its length group. A marker, plan tab and drawer all activate the same operation ID. Before/After continues to use the existing canonical preview geometry.

## 8. Performance contract

The expensive calls are memoized from `template` only in the Builder composition layer. A testable resolver boundary/counter confirms that view-only state transitions do not resolve roof geometry again.

Zustand subscriptions should be narrowed to fields a component renders. Drawer cut-state changes must not rerender or resolve the skeleton scene.

## 9. Accessibility and mobile

- SVG members and operation markers expose `role="button"`, `tabIndex=0`, meaningful labels and `aria-pressed` where applicable.
- Enter/Space activates a focused member or operation.
- Previous/next buttons have complete accessible names and disabled states only where meaningful.
- All controls retain visible `focus-visible` styling.
- Mobile targets are approximately 44 px.
- At narrow width, breadcrumb text truncates visually but preserves full accessible labels; navigator wraps compactly; minimap moves inside contextual content; overlay labels collapse to codes.
- The existing narrow-dimension cap remains in force.

## 10. Explicit limitations

- No individual K1/H1/J1 fabrication override.
- No physical H1-face deduction for J1.
- No J1-to-purlin joinery.
- No fabricated J1 cut-detail preview.
- H1 remains a coordinated top-face/plan/elevation explanation, not a complete saw-face solid.
- No structural verdict, allowance, kerf, full CAD/Three.js, persistence, auth, PDF, costing, covering, openings or new roof/member family.

These limitations must remain visible in the instance/operation context.

## 11. Acceptance invariants

V10 is acceptable only when:

1. every selectable K1/H1/J1 resolves to one stable physical context;
2. all four H1 and every J1 group correctly;
3. instance navigation changes neither `RoofProjectDocumentV1` nor history;
4. operation markers activate the same package operation/detail used elsewhere;
5. unsupported previews fail safely and visibly;
6. Quick and Builder retain one canonical roof/geometry path;
7. the 940/800 spacing regression and K1/H1/J1 geometry remain unchanged;
8. new PL/EN copy and keyboard flows are covered;
9. mobile layout rules prevent horizontal overflow;
10. Browser status is reported honestly.
