# RoofCalc / CieślaCalc — future 3D, BIM and IFC visualization strategy

**Status:** strategic product/architecture direction. Stages 1–3 of §10 were
implemented in V38 — see `docs/ARCHITECTURE_V38_TECHNICAL_3D_MVP.md` for what
actually exists. Everything beyond stage 3, and the whole BIM/IFC direction in
§4–§5, remains direction only: this document still authorizes no further
implementation by itself and introduces no further runtime dependency.

This direction extends the existing rule that the whole-roof preview must be derived from the same canonical project/assembly/geometry model as calculations, fabrication, quantities and documentation. A future 3D viewer must never become a second geometry engine.

---

## 1. Product intent

RoofCalc should ultimately provide an advanced interactive technical scene in which the user can move continuously between:

```text
3D roof / building scene
        ↕
canonical geometry and member identity
        ↕
member details and cuts
        ↕
fabrication / marking guidance
        ↕
roof build-up and covering
        ↕
quantities / procurement / costing
        ↕
documentation / PDF
```

The 3D experience is not intended to be a decorative render. It should become a technical interaction surface for carpenters, roofers and estimators.

Typical future interactions:

- select a physical member directly in 3D,
- focus the camera on a selected joint/cut,
- isolate a member, family, roof plane or layer,
- switch semantic presets such as `Konstrukcja`, `Cięcia`, `Montaż`, `Pokrycie`, `Kosztorys`,
- use X-ray / transparency,
- use exploded roof-build-up views,
- use section/clipping planes,
- switch perspective / orthographic / top / elevation views,
- display exact dimensions and technical annotations,
- open the same member's fabrication detail from the 3D selection,
- synchronize selection between 2D drawings, 3D, schedules and exported documentation.

The canonical project remains rich; the visualization remains selective and task-focused.

---

## 2. Non-negotiable source-of-truth rule

Future rendering architecture should follow:

```text
RoofProjectDocument / canonical domain model
                ↓
        pure geometry solvers
                ↓
       resolved technical scene
          ↙             ↘
     2D drawing        3D renderer
          ↘             ↙
        details / PDF / schedules
```

The renderer must **consume** already-resolved geometry. It must not reimplement roof formulas, cut formulas, placement rules or product-layout logic.

A value such as `2450 mm` must produce a technical scene representing exactly `2450 mm`; visual approximation or AI-generated shape must never be a calculation input.

The scene adapter may triangulate/mesh canonical geometry for rendering, but it may not infer domain facts from the resulting triangles.

---

## 3. Web 3D stack — benchmarked and decided in V38

The direction named here was **Three.js + React Three Fiber**. V38 benchmarked
it and adopted only half of it:

- **Three.js — adopted** (`three` 0.186.0), as the low-level rendering
  foundation, with `OrbitControls` from its own `examples/jsm`. It declares no
  peer dependencies, so it constrains nothing in `apps/web`.
- **React Three Fiber — rejected for this repository.**
  `@react-three/fiber@9.7.0`, the latest stable, declares
  `peerDependencies.react: ">=19 <19.3"`, while `apps/web`'s `react: ^19.1.0`
  resolves to 19.3.0. Adopting it would mean shipping a knowingly violated peer
  range or pinning the application's React back for a viewer. A generated scene
  also gains little from a reconciler, and one dependency keeps the lazy chunk
  smaller and the renderer boundary trivially auditable.
- Renderer-specific helpers stay above the renderer-neutral scene boundary,
  which is now real: `packages/technical-scene`.

This decision is reviewable, not permanent: if a future R3F release supports the
React version the application actually resolves, and the scene grows enough
interactive React-shaped surface to justify it, the boundary already makes the
swap local to `apps/web/src/assembly/scene3d/`.

That boundary now exists, as `packages/technical-scene`:

```text
canonical project + resolved geometry
              ↓
     visualization scene adapter      (technical-scene/roof-scene.ts)
              ↓
      renderer-neutral scene DTOs     (technical-scene/scene.ts)
              ↓
   Three.js view                      (apps/web/src/assembly/scene3d/)
```

An architecture test keeps it honest: no package may import a renderer, and
`apps/web` may import `three` only inside `assembly/scene3d/`.

Do not put React/Three.js into `roof-math`, `timber-model`, `calculator-core`, `covering-core`, `quantity-core` or another pure domain package.

Camera, orbit controls, hover, selection, clipping state, exploded-view amount, visibility filters and viewport settings are transient workbench state, not canonical project state.

---

## 4. BIM / IFC direction

RoofCalc should be architected so a user can eventually import a building/roof model from a BIM workflow and use it as a reference or as the source for an explicit conversion into RoofCalc's canonical parametric model.

The strongest candidate to research first for this boundary is **That Open Engine / Fragments**, because it is aimed at web-based AECO/BIM applications and preserves semantic BIM information while supporting efficient large-model visualization.

Other candidates worth benchmarking before a final choice include **xeokit** and **Autodesk Platform Services Viewer**. They are alternatives/benchmarks, not required dependencies.

The desired pipeline is:

```text
IFC file
   ↓
IFC parser / BIM engine
   ↓
reference BIM scene + semantic properties
   ↓
explicit RoofCalc import / mapping layer
   ↓
validated canonical RoofCalc entities
   ↓
RoofCalc geometry / fabrication / quantity pipeline
   ↓
technical 2D + 3D + documentation
```

The imported IFC scene must not silently replace RoofCalc's canonical model.

A user may first load the whole building as a reference, hide unrelated disciplines and inspect/select entities such as roof surfaces, beams, members, openings and slabs. Converting that data into an editable RoofCalc roof should be an explicit, validated operation with warnings for unsupported or ambiguous geometry.

---

## 5. Reference model versus editable RoofCalc model

Keep these concepts distinct:

### Reference BIM model

May contain walls, slabs, installations, windows, arbitrary solids and other building data. Its job is context, inspection and import assistance.

### Canonical RoofCalc model

Contains only entities understood by RoofCalc's versioned domain contracts. These drive geometry, fabrication, quantities, procurement, costing and documents.

Conceptually:

```text
BIM reference scene
       │
       ├── display / isolate / inspect
       │
       └── explicit mapping
                ↓
        RoofCalc canonical model
```

Do not calculate fabrication directly from arbitrary imported IFC meshes.

---

## 6. Identity and synchronized views

The same stable physical/domain identity should connect all representations where possible:

```text
member instance ID
   ├── 3D object
   ├── 2D skeleton object
   ├── member schedule row/source
   ├── fabrication prototype/detail
   ├── quantity provenance
   └── documentation reference
```

Display labels such as `K1`, `H1`, `J1` remain presentation metadata and must not become the identity mechanism.

The future multi-structure scene rules in `ARCHITECTURE_FUTURE_COMPOUND_ROOF_SCENE.md` continue to apply. A 3D renderer must not solve global identity by parsing local string IDs.

---

## 7. Roof build-up and covering visualization

The 3D system should eventually visualize more than timber.

A roof-plane scene may expose semantic layers such as:

```text
primary covering
battens
counter-battens
membrane
sheathing / future layers
structural timber
```

The viewer should support isolation and exploded views of these layers.

However, every layer must be driven by already-resolved project/build-up/covering data. A 3D mesh cannot become the hidden source of product consumption, overlap, batten spacing or cost.

---

## 8. AI-generated 3D tools

Generative tools such as Meshy, Higgsfield or future equivalents may be useful in a **supporting** role, for example:

- decorative/context assets,
- rapid visual prototypes,
- non-technical presentation models,
- marketing renders/animations,
- optional appearance models for catalogue items when dimensions remain independently authoritative.

They must **never** be the source of truth for:

- structural geometry,
- member placement,
- lengths/angles,
- cuts/notches,
- openings,
- effective covering dimensions,
- quantities,
- procurement,
- costing.

For a catalogue item, the technical database/specification owns dimensions and calculation semantics; an optional GLB/3D asset owns only appearance.

---

## 9. Example future UX

A user selects a common rafter in the 3D roof.

The object highlights and the inspector can show, from canonical data:

```text
K1 — common rafter
section: 80 × 180 mm
resolved length: 4872 mm
roof pitch/reference angle: ...
ridge operation: ...
wall-plate operation: ...
```

Selecting the wall-plate operation can focus the 3D camera on that location and open the same canonical cut/marking detail used by the fabrication view and document engine.

A change to a numeric roof parameter updates the canonical project, runs the existing solver and regenerates both 2D and 3D views from the new result. The 3D object is never edited independently from the domain value.

---

## 10. Suggested implementation sequence

Do not begin with IFC or photorealism. A sensible future sequence is:

1. ~~**Scene contract**~~ — **done (V38)**: `packages/technical-scene`.
2. ~~**Technical 3D MVP**~~ — **done (V38)**: gable, hip and collar-tie
   skeletons with shared selection identity and deterministic dimensions.
3. ~~**Workbench interaction**~~ — **mostly done (V38)**: isolate, fit selected,
   view presets, orthographic/perspective and synchronized 2D/3D selection.
   Clipping/section planes remain unimplemented.
4. **Fabrication integration** — focus cuts/joints and link 3D instances to canonical fabrication details.
5. **Roof build-up / covering** — semantic layer visualization and exploded views derived from existing solvers.
6. **Reference BIM import** — load IFC as a separate reference scene.
7. **IFC-to-RoofCalc mapping** — explicit, validated recognition/conversion of supported roof data.
8. **Multi-structure scene** — integrate with the future structure-node/world-scene architecture.
9. **Advanced presentation** — materials, environment, animations and optional non-technical AI-generated assets.

Each stage should remain useful without requiring the next one.

---

## 11. Research gates

The first five gates were answered by V38 and are recorded in
`docs/ARCHITECTURE_V38_TECHNICAL_3D_MVP.md`: the scene contract and the frozen
Z-up millimetre coordinate convention (§2–§3), the member→solid mapping (§4),
one shared selection identity (§6), the mobile/fallback behaviour (§13) and the
instancing strategy (§9). WebGL was sufficient; WebGPU changed nothing about
the design, because the renderer sits behind a neutral DTO boundary either way.

Still open, before any further stage:

- clipping/section-plane behavior,
- covering/build-up layer visualization and exploded views,
- cut-solid modelling (boolean subtraction of resolved notches and end cuts),
- finished H1/J1 connection geometry, which is a fabrication-research question
  before it is a rendering one,
- That Open/Fragments license, bundle/runtime model and IFC conversion workflow,
- benchmark against xeokit and Autodesk APS for the exact RoofCalc use case,
- IFC classes/properties that can be mapped reliably versus those that must remain reference-only,
- import validation, unsupported geometry and unit/axis handling,
- security/resource limits for user-supplied IFC files.

No technology should be adopted solely because it produces attractive screenshots; it must preserve RoofCalc's technical truthfulness, modularity, offline behavior where applicable and deterministic project/document pipeline.

---

## 12. Strategic conclusion

The target is not merely a "3D viewer".

The long-term opportunity is a **technical roof CAD/BIM workbench for carpenters and roofers** where one canonical project connects:

```text
parametric roof geometry
+ construction/fabrication
+ interactive 2D/3D visualization
+ BIM/IFC context/import
+ build-up and covering
+ quantities/procurement/costing
+ execution documentation
```

That integration — rather than photorealistic rendering alone — is the product advantage to protect in future architecture decisions.
