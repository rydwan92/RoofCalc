# ADR-016 — A single roof of any family is a template variant in the V1 project; V2 is for composed roofs

**Status:** Accepted (VNext-8, 2026-10-24). Refines ADR-015: the V2 writer
stays the format for several structures and their connections; it is no
longer the gate for a new single-roof family.

## Context

ADR-015 made the first non-gable/hip shape wait for the V2 document. By
VNext-7C the mono-pitch roof had a surface, a framing solver on the shared
rafter engine, plane-generic battens, counter-battens, membrane and
coverings, a skeleton and a timber schedule — but it lived in a separate
workspace, outside saving, the workbench, materials, cost and documents.

Two facts make the V2 detour unnecessary for one roof:

- Everything a V1 project holds besides the roof — features, opening
  framing, build-up, coverings, connection plan, stock choices — already
  refers to roof planes by opaque ID, not to a roof type.
- ADR-015's own V2 node is "today's local roof document" per structure. A
  project with one mono-pitch roof is one structure; its content is exactly
  a V1 project whose `roof` is a mono-pitch template. Writing it as V2 would
  fork every reader for no information.

## Decision

1. `RoofTemplateSpec` gains `MonoPitchRoofTemplateSpec` (`type:
   'mono-pitch'`), the same inputs as `MonoPitchFramingSpec`. Every later
   single-roof family (asymmetric gable, half-hip, …) is added the same way.
2. A family's resolver lives in `roof-math` and returns the shared resolved
   contract (`calculation`, `rafterSpacing`, `memberPrototypes`, planes and
   lines, skeleton). Mono-pitch delegates to `resolveMonoPitchFraming`: one
   formula set, used by the project and by the quick workspace.
3. Consumers branch on the **resolved capabilities** (has a hip rafter, has
   a ridge, has collar ties) or call a `roof-math` helper (`roofPlaneIds`,
   `roofTemplateSpanMm`, `roofTemplateFamily`). A `gable ? … : hip` ternary
   that would silently treat a third family as a hip is a defect.
4. `RoofProjectDocumentV1` keeps `schemaVersion: 1`. Documents without a
   mono-pitch roof are byte-identical; a mono-pitch document is refused by
   an older build with its ordinary schema error (forward-incompatible
   additive variant, recorded in `SCHEMA_REGISTRY.md`).
5. V2 (structures + connections) remains the format for composed roofs —
   the L with a valley and beyond (ADR-008, ADR-015).

## Consequences

- A mono-pitch roof is saved, reopened, revised, imported, edited in the
  workbench and carried into materials, cost and documents like a gable.
- Each new family costs one resolver, one template schema, one reference
  fixture, and an audit of the branch sites listed in
  `docs/ARCHITECTURE_VNEXT8_ROOF_FAMILIES.md`.
- The topology graph reports a solved mono-pitch structure as
  `calculation: supported`.
