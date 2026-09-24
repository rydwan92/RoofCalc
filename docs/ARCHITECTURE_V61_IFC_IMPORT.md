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
