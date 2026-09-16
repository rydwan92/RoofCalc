# V38 — Technical 3D MVP

Status: implemented on main after `2041971` (V37), 2026-09-16. Not committed.

V38 adds a second renderer for the **same resolved roof project**. It is not a
decorative viewer: it is the first slice of the technical interaction surface
described in `docs/ARCHITECTURE_FUTURE_3D_BIM_IFC.md` §10 stages 1–3.

```text
RoofProjectDocumentV1
        ↓  existing resolvers (roof-math / calculator-core)
resolved roof skeleton + member geometry
        ↓  packages/technical-scene  (pure, renderer-neutral)
TechnicalScene { coordinateSystem, bounds, entities[] }
        ↙                               ↘
apps/web 2D SkeletonCanvas        apps/web scene3d viewport (Three.js)
```

Nothing below the scene contract knows a renderer exists, and the renderer
computes no roof geometry whatsoever.

## Definition of Ready

1. **User problem** — a carpenter reading a hip roof as four separate 2D views
   could not see how K1, H1, J1 and the collar ties sit in space, and had no
   way to point at a physical member and ask "which one is this?".
2. **Domain owner** — a new pure package `packages/technical-scene` owns the
   renderer-neutral scene contract and the domain→scene adapter. It sits
   *above* `timber-model`/`drawing-engine` and *below* `apps/web`; it is not in
   `roof-math`, because it consumes resolved geometry rather than producing it.
3. **Canonical persistence** — none. The renderer choice, camera, projection,
   view preset, family filters, X-ray and hover are all transient
   (ADR-002). `WorkbenchViewState.workspaceRenderer` is the only new store
   field and it is never serialized.
4. **Schema / migration** — none. `docs/SCHEMA_REGISTRY.md` is unchanged.
5. **Undo / Redo / history** — switching renderer, moving the camera,
   isolating, filtering and hovering create **no** history entry. Selecting in
   3D reuses the existing `select()` action, exactly as a 2D click does.
6. **Quantity impact** — none. The scene produces no quantity source.
7. **Procurement impact** — none.
8. **Catalogue impact** — none.
9. **Future cost layer** — none; no commercial concept enters the scene.
10. **Offline behaviour** — fully offline. The 3D chunk is bundled, not fetched
    from a CDN, and needs no API or database.
11. **Mobile UX** — at ≤800px the switch lives in the View sheet, the viewport
    controls become one horizontally scrollable row above a 34vh stage, and the
    2D-only tools (Miarka, Dopasuj, dimension level, drawing layers) stand
    down. 2D remains the default and stays completely usable.
12. **Domain research** — not required: no new geometry is derived. The
    existing hip/jack limitations are surfaced, not solved.
13. **Regression strategy** — 33 pure tests in `packages/technical-scene`
    (identity, transform, bounds, camera, visibility), 13 web tests in
    `apps/web/src/assembly/scene3d/`, 4 new architecture rules, and
    `e2e/technical-3d.spec.ts` (5 scenarios × desktop and mobile).
14. **Future multi-structure** — the adapter mints its own
    `scene:entity:<n>` namespace and carries canonical identity in
    `sourceRef`. No code parses an ID (ADR-007), and
    `packages/technical-scene` is now inside the opaque-ID architecture test.

## 1. Renderer stack decision

**Chosen: `three` 0.186.0 alone**, with `OrbitControls` from
`three/examples/jsm/controls/OrbitControls.js`. Plus `@types/three` as a dev
dependency. No React Three Fiber, no drei, no BIM/IFC framework.

`ARCHITECTURE_FUTURE_3D_BIM_IFC.md` §3 named **Three.js + React Three Fiber**
as the candidate to benchmark first. The benchmark was run and the R3F half of
that candidate was **rejected for this repository**, for one concrete reason:

- `@react-three/fiber@9.7.0` (latest stable) declares
  `peerDependencies.react: ">=19 <19.3"` and `react-dom: ">=19 <19.3"`.
  `apps/web` pins `react: ^19.1.0`, which resolves to **19.3.0**. Adopting R3F
  would mean either shipping a knowingly violated peer range or pinning the
  whole application back to React 19.2 for a viewer.
- `three` itself declares **no peer dependencies at all**, so it adds no
  constraint to the application's React version.

Two further reasons confirmed the choice rather than merely excusing it:

- The scene is *generated* from a DTO, not hand-authored as JSX. A declarative
  reconciler buys little when every object comes from
  `scene.entities.map(...)`, while imperative code makes `InstancedMesh`
  bucketing, per-instance picking and on-demand rendering straightforward.
- One dependency instead of two keeps the lazy chunk small (§10) and keeps the
  renderer boundary — enforced by an architecture test — trivially auditable.

`docs/ARCHITECTURE_FUTURE_3D_BIM_IFC.md` §3 has been updated with this result.
Nothing about the BIM/IFC direction changes; no IFC code exists.

## 2. The scene contract — `packages/technical-scene`

Pure TypeScript. **No React, no DOM, no Three.js, no browser globals** —
enforced by `tools/architecture/layering.test.ts`. It also may not import a
solver (`roof-math`, `calculator-core`, `covering-core`, …): it consumes
already-resolved geometry.

```ts
TechnicalScene {
  coordinateSystem: SceneCoordinateSystem   // frozen, see §3
  bounds: SceneBounds                       // min/max/center/radius/empty
  entities: TechnicalSceneEntity[]
}

TechnicalSceneEntity {
  id: string                    // scene-local, minted by the adapter
  kind: 'timber-member' | 'roof-plane'
  semanticGroup: SceneSemanticGroup          // from the structured member kind
  label: { familyCode?: 'K1'|…, nameKey }    // presentation only
  geometry: SceneOrientedBox | ScenePolygon | SceneLine
  selectable: boolean
  sourceRef: SceneSourceRef                  // canonical identity, opaque
  geometryStatus: 'reference' | 'finished'
  limitations: SceneGeometryLimitation[]
  section?: { widthMm, depthMm }
  lengthMm?: number
}
```

Deliberately **not** in the contract: `THREE.Vector3`, `Matrix4`, materials,
lights, cameras-as-objects, an entity–component system, or a generic graphics
engine. Geometry is exactly the three primitives the current timber roof needs.

`SceneOrientedBox` carries `center`, an orthonormal right-handed
`basis {width, along, depth}`, `size` in millimetres, and the resolved `axis`
verbatim. A renderer builds its own matrix from the basis; the contract never
exposes one.

The camera and visibility policies are pure too:
`fitCamera(bounds, preset, aspect)` → `SceneCameraPose`, and
`resolveSceneEntityVisibility(entity, emphasis, policy)` →
`visible | ghosted | hidden`. Both are unit-tested without a renderer.

## 3. Coordinate convention — frozen

**The scene uses the resolved roof's own coordinates, unchanged.** There is
**no** axis swap, no unit change and no re-centring anywhere in the pipeline.

| Axis | Meaning | Origin |
| --- | --- | --- |
| `x` | **transverse** — across the span, `±halfRunMm` | `0` on the ridge / centre line |
| `y` | **longitudinal** — along the building, `0 … buildingLengthMm` | `0` at the reference gable/front wall |
| `z` | **vertical** — up | `0` at the wall-plate reference level |

Unit: **millimetres**. Handedness: **right**. Up axis: **Z**.

This is exactly what `gable-roof.ts` / `hip-roof.ts` already emit, so the
adapter performs **zero** transformations — the option §6 of the iteration
prompt allowed was not needed and deliberately not used. The Three.js layer
adapts to the model instead of the reverse: both cameras are constructed with
`camera.up = (0, 0, 1)`, which `OrbitControls` honours.

`roof-scene.test.ts` asserts the coordinate system object and that every
entity's `axis.from`/`axis.to` equal the member's `from`/`to` exactly.

## 4. Domain → scene adapter

`createRoofTechnicalScene({ skeleton, includeRoofPlanes })` reads only
structured fields from `RoofSkeleton`:

| Adapter reads | Never |
| --- | --- |
| `member.kind` → `semanticGroup` | parse `member.id` |
| `member.from` / `member.to` | recompute a length or a pitch |
| `member.section` | apply a hidden allowance |
| `member.selectionId` / `prototypeId` | infer a family from a display code |
| `skeleton.guides[].points` | invent a plane |

The oriented box is built with `createTimberPrismBasis`, newly extracted from
`drawing-engine`'s `createTimberPrismFaces` so the 2D faces and the 3D solid
derive from **one** formula (width horizontal and perpendicular to the plan
axis; depth = width × along). A member the rule cannot orient — a purely
vertical axis has no plan direction — is simply absent from the scene rather
than given a fabricated frame.

The adapter is pure: the same skeleton always produces an equal scene.

## 5. Rendered member families

Everything the current model resolves physically:

`rafter` and `rafter-segment` → **K1** · `hip-rafter` → **H1** ·
`jack-rafter` → **J1** · `collar-tie` → **C1** · `wall-plate` · `purlin` ·
`ridge` · `opening-header` (opening framing).

Roof planes are drawn as a very low-opacity surface plus a thin outline, not
selectable, and switchable off. Only hip skeletons carry `guides` today, so the
plane toggle appears only where there is a plane; a gable roof shows none.

No covering, battens, counter-battens or membrane are drawn. No support is
invented to fill a gap.

## 6. Selection — one identity

There is **no 3D selection state**. A click raycasts to a scene entity and
calls the same `state.select(selectionId, prototypeId)` the 2D canvas calls.

Emphasis in both renderers comes from one function. `resolveMemberVisualState`
(2D) was refactored to delegate to a new `resolveMemberRefVisualState`, which
takes exactly the `{ memberId, selectionId, prototypeId }` triple that a scene
`sourceRef` carries. A member cannot be selected in one view and not the other.

- 3D click → Inspector, context bar and breadcrumb update → switching to 2D
  keeps the member selected.
- 2D selection → switching to 3D highlights the same solid.
- Hover is renderer-local: one throttled raycast per animation frame draws a
  quiet outline and sets a pointer cursor. It never writes to the store.
- A pointer that moved more than 6 px is a camera gesture, never a selection.

## 7. Camera and view controls

- Orbit (left), pan (right / two-finger), zoom (wheel / pinch), via
  `OrbitControls` with damping off so rendering stays on demand.
- Bounded: `minDistance`/`maxDistance` and polar limits come from the pure fit
  result, so the camera cannot get lost far from the model.
- **Dopasuj widok** fits the whole roof; **Pokaż wybrany** (or double-click)
  frames the selected member with context and never changes the selection.
- Presets **Izometria / Z góry / Przód / Bok**; projection **Perspektywa /
  Ortogonalny**, fitted from the same extents so framing is preserved.
- First open fits automatically. Framing is computed from the **projected
  extent** of the bounds in the camera's own frame, not from the bounding
  sphere — a long, low roof would otherwise be framed as if it were a cube.
- The viewport re-frames itself when its size changes **until the user first
  touches the camera**; after that only an explicit fit moves it.

## 8. Isolation, filters and X-ray

- **Izoluj element** reuses the existing transient `workbench.isolateSelection`
  flag, so isolation means the same thing in 2D and 3D. Selected stays
  prominent, related is ghosted, everything else is hidden.
- **Rodziny** is a small popover listing only the families this roof resolves,
  with live counts. Hiding a family is transient and changes no project state.
- **Prześwietlenie** ghosts unselected context. No post-processing, no bloom,
  no SSAO.

## 9. Performance and instancing

Entities are bucketed by `(semanticGroup, width, depth, length)` and drawn as
`InstancedMesh`, one **solid** and one **ghost** mesh per bucket, sharing a
single cached `BoxGeometry`. Per-instance colour carries emphasis;
`userData.entityIds[instanceId]` maps a raycast hit back to the canonical
member. Edges are one merged `LineSegments`, rebuilt only on a presentation
change.

Measured entity counts and instancing keys:

| Project | Entities | Members | Instance keys |
| --- | --- | --- | --- |
| `01-basic-gable` | 25 | 25 | 3 |
| `02-basic-hip` | 59 | 55 (+4 planes) | 9 |
| `10-gable-collar-tie` | 36 | 36 | 4 |
| 24 m hip, 600 mm spacing | 129 | 125 (52 K1, 64 J1, 4 H1, 4 plates, 1 ridge) | 21 |

So a large hip roof is ~21 shared geometries and at most ~42 instanced draw
calls, not 125 independent boxes.

Rendering is **on demand**: a frame is requested only when the camera, scene or
presentation changes. A hidden tab renders nothing.

Scene geometry is rebuilt only when the resolved skeleton changes
(`useMemo` on `skeleton`). Selection, hover, isolation, filters, projection,
camera moves and task switches never rerun the adapter.

Budget kept: no shadows, no environment map, no textures, no photorealistic
materials, no post-processing. Ambient + hemisphere + two directional lights,
`MeshLambertMaterial`, `setPixelRatio(min(dpr, 2))`.

## 10. Bundle impact

| Artifact | Before V38 | After V38 | Δ |
| --- | --- | --- | --- |
| initial `index-*.js` | 725 404 B (210 809 B gz) | 729 682 B (210 819 B gz) | **+4 278 B raw, +10 B gz** |
| `index-*.css` | 181 714 B | 185 820 B | +4 106 B |
| `icons-*.js` | 23 432 B | 24 915 B | +1 483 B |
| lazy `TechnicalScene3D-*.js` | — | **595 613 B (150 813 B gz)** | new |
| total JS emitted | 1 203 951 B | 1 805 325 B | +601 374 B |

The whole Three.js stack — `three` (662 KB source) plus `OrbitControls`, the
viewport and the React component — lives behind one dynamic `import()` in
`Page.tsx`. Quick Calc and the Creator never load it. The initial bundle grows
by 4 KB raw / ~0 KB gzipped, which is the new translations, the renderer switch
and the lazy stub.

First open shows `Ładowanie widoku 3D...` in the Suspense fallback; there is no
blank screen.

## 11. Truthfulness limits — H1 / J1

Every solid in V38 is `geometryStatus: 'reference'` and carries
`limitations: ['no-cut-solids']`: resolved end cuts and notches exist in the
fabrication model but are **not** subtracted from the drawn timber.

H1 and J1 additionally carry `'compound-connection-not-resolved'`, and the HUD
states it in words:

> Geometria referencyjna — detal połączenia nie jest jeszcze modelowany.

No hip face deduction, backing/drop, jack-to-hip finished face or compound cut
solid is invented. The viewport header repeats
*"Geometria referencyjna — bez detalu cięć"* so the whole scene is labelled,
not only the selection. Asserted by `roof-scene.test.ts` and by the hip E2E.

## 12. Workbench integration

3D is a **view of the current task**, never a perspective. The hierarchy is
unchanged:

```text
PROJEKT   → Konstrukcja   [ 2D | 3D ]
WYKONANIE → Cięcia        [ 2D | 3D ]
```

`supportsTechnical3D(preset)` gates it; leaving a 3D-capable task falls the
renderer back to `2d` rather than leaving a dead switch. The switch sits with
the technical view controls (`data-workspace-renderer`), and the 2D drawing
tools stand down while 3D is active so nothing is duplicated.

From a 3D selection, **Otwórz przygotowanie elementu** uses the existing
navigation (`navigateTo(cuts)` + `navigateToInstance`) to reach the existing
detail. There is no 3D cut editor.

## 13. Failure and fallback

`new WebGLRenderer(...)` is constructed inside a `try`, and
`webglcontextlost` is handled. On failure the workspace shows

> Widok 3D jest niedostępny na tym urządzeniu. **[ Wróć do 2D ]**

as `role="alert"`, and every 2D calculation stays available. Proved by
`TechnicalScene3D.test.tsx`, which runs in JSDOM where WebGL genuinely does not
exist.

## 14. Accessibility

Every control is a real button with text and, where iconographic, an
`aria-label`/`title`; groups carry `role="group"` with a label; toggles carry
`aria-pressed`. The canvas has an `aria-label` describing the gestures.
Returning to 2D never requires touching the canvas. Selection information
always exists in normal DOM — the context bar, the breadcrumb and the Inspector
— so nothing depends on the 3D view, and selection is carried by an edge
outline as well as colour.

## Known limitations

- No cut solids: notches and end cuts are not subtracted (deliberate, §46 of
  the iteration contract).
- No finished H1/J1 connection geometry; disclosed in the UI.
- Roof-plane context exists only for hip roofs, because
  `createRoofSkeletonFromResolved` emits `guides` only there.
- No covering, batten, counter-batten or membrane layer in 3D.
- No section/clipping planes, no world-space dimensioning, no exploded views.
- No 3D editing of any kind, by design.
- A purely vertical member would have no orientable section and would be
  omitted; the current model resolves none.
- Orthographic zoom is not carried across a projection switch; framing is
  preserved approximately, not exactly.
- Mobile 3D is a smoke-level capability: usable, not tuned.

## Validation

See `PROJECT_BLUEPRINT.md` → WORK CHECKPOINT for the recorded run.
