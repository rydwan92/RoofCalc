# V61 — local IFC reference import

V61A introduces an IFC reference session. `web-ifc@0.0.78` runs only in an
`apps/web` Web Worker. Its single-thread WASM is served from RoofCalc's own
`public/ifc/` assets. The worker closes the model and disposes the parser after
transferring semantic summaries and mesh buffers. Closing/replacing the import
terminates any active worker; the Three.js viewport disposes its GPU resources.

`packages/bim-import-core` owns renderer-free reference DTOs, unit labels and
roof candidate rules. `apps/web/src/bim/ifc/` owns file validation, worker
transport and UI. The reference renderer lives under the existing
`apps/web/src/assembly/scene3d/` boundary. IFC Express IDs are session handles;
GlobalIds are retained as source identity. Neither is parsed for domain meaning.

The reference model is session-only. No IFC bytes or meshes enter
`RoofProjectDocumentV1`, localStorage, SQL, technical-scene, quantity, costing
or fabrication. IFC candidate analysis can only propose parameters for explicit
user confirmation; after confirmation, the normal RoofCalc project and solvers
own every calculation. Unknown source units block conversion. Coordinates from
the parser are rendered in IFC's Z-up axes after subtracting a display origin;
this display transform is never a canonical roof transform.

V61A supports semantic discovery of `IfcRoof`, `IfcSlab.ROOF`, structural
members and openings, and a reference 3D viewer. It does not convert a roof.
The focused fixtures under `fixtures/ifc/` are synthetic IFC4 geometry with
source coordinates in metres.

## V61B — readiness and implementation contract

1. User problem: turn a locally viewed regular gable into an editable RoofCalc
   project without retyping proven dimensions.
2. Domain owner: `bim-import-core` owns conservative, renderer-free recognition;
   the web worker adapts parser geometry, the web UI confirms project values.
3. Persistence: analysis, source identity and draft are session-only. Only the
   accepted existing roof template becomes canonical.
4. Schema: no registry entry or migration changes; existing V1 readers apply.
5. History: browsing/editing the import draft creates none; confirmation creates
   one new project through `ProjectSession.createFromDocument`.
6. Quantities: no IFC quantity source; normal RoofCalc solvers own all results.
7. Procurement: no change to blanks or allowances.
8. Catalogue: no new fields or catalogue dependencies.
9. Cost: no commercial concepts enter BIM geometry.
10. Offline: local worker/WASM, analysis and creation use no backend.
11. Mobile: a scrollable parameter inspector with exact mm/degree inputs at
    390×844; no hidden desktop-only confirmation action.
12. Research: `domain/IFC_GABLE_ANALYSIS.md` records axes, units, evidence and
    hand-checked vectors before implementation.
13. Regression: pure shape/rejection vectors, real IFC parser fixtures, canonical
    creation equivalence and desktop/mobile Playwright confirmation/rejection.
    Existing `fixtures/projects/` corpus remains the canonical regression gate.
14. Multi-structure: analyze only an explicitly selected source candidate;
    opaque source handles never become canonical IDs. No V2 shape changes.

### Implemented boundary

`analysis.ts` accepts neutral source-unit Z-up triangles plus candidate identity,
unit multiplier and semantic evidence. It proves a full horizontal ridge, two
symmetric planar rectangular patches, triangle topology and projected area.
Rotation about Z and distant origins do not change dimensions. Unknown units,
incomplete geometry, asymmetric/hip/pyramid/curved roofs, holes and slab solids
are blocked. An IfcRoof aggregate without its own surface remains insufficient;
V61B does not infer an aggregate from arbitrary children.

The worker independently retains Float64 physical coordinates before recentering
the Float32 display mesh. web-ifc's metre Y-up output is mapped back to IFC Z-up;
source-unit normalization and the analysis multiplier are explicit. The viewer
uses the corrected axes too. Neither displayOrigin nor camera enters analysis.

The selected candidate exposes **Analizuj dach**, followed by editable mm/degree
fields. The proposal uses 0.1 mm / 0.01° precision to remove parser noise; the
pure analysis result remains unrounded. IFC-derived fields, RoofCalc defaults
and user edits have distinct labels. Roof extents are not claimed to establish
building wall positions: the user checks dimensions and the separate overhang.
Section, spacing, structural system and ridge connection remain explicit
RoofCalc settings. Editing any value revokes confirmation; validation and a
review checkbox gate the final action. Submission is guarded against double
clicks and storage failures keep the editable draft.

Confirmation uses `createProjectStartTemplate` and the ordinary
`createRoofProjectDocument` → `ProjectSession.createFromDocument` path, preserving
the prior project. No IFC data enters V1 or history. Subsequent geometry,
fabrication, quantity, material and cost calculations belong only to RoofCalc.
No API, SQL, auth, commerce, schema or V62 changes.

### Validation

- Pure analysis: 16 vectors covering rotation, distant translation, metre/mm/cm
  scaling, missing/invalid units, pyramid with misleading semantics, malformed
  input, incomplete/duplicate surfaces, asymmetric and warped slopes.
- Confirmation UI: manual-creation canonical equivalence, no store writes while
  browsing, double-submit protection, invalid values, confirmation revocation,
  comma decimal input, storage-failure recovery and unknown-unit rejection.
- All 10 IFC browser scenarios passed across desktop/mobile, including real
  web-ifc parsing in metre and millimetre models, edited canonical values,
  preservation of the prior project, reload and pyramid rejection.
- Full validation: 1687 unit/UI/API/architecture/fixture tests passed (13 skipped),
  all builds completed under Node 22.23.2; 131 E2E passed (31 conditional skips).
  Desktop/mobile screenshots inspected; no horizontal overflow at 390×844.
