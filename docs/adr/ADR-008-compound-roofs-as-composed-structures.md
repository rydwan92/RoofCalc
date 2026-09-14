# ADR-008 — Compound roofs are composed structures, not secondary roof fields

## Status

Accepted as direction. Nothing is implemented; this ADR constrains how it will be.

## Context

Real jobs are rarely one roof: a house with a lower garage, a porch, an
outbuilding. The cheap route is to bolt a `secondaryRoof` field onto the existing
template, or to special-case a "garage pitch" inside the gable resolver. That
produces a second geometry engine, duplicated covering, quantity and procurement
paths, and a document shape that cannot describe a third structure.

## Decision

A compound project is **a collection of structures, plus transforms, plus a
separate connection graph** — never extra fields on a roof template.

```text
ProjectDocumentV2
  → per-structure local roof / skeleton / covering / fabrication resolution
  → structure transforms place each local scene into one world scene
  → an independent connection resolver derives contact geometry and warnings
  → connection-aware presentation
  → quantities and procurement per structure, per connection, and per project
```

Constraints this fixes now:

- Local solvers keep working in **local** coordinates. A transform places their
  output; global coordinates never leak into `roof-math`.
- A connection (`RoofConnectionSpec`) references two structure IDs and lives
  above both. It is never embedded in a `RoofTemplateSpec`.
- Identity is scoped consistently across planes, members, prototypes, features,
  framing, build-up, coverings, selection, quantities and procurement — all of
  them or none.
- Migration from V1 places the single existing roof into one structure node under
  an explicit version upgrade, preserving technical snapshots and IDs.

Explicitly **not** decided here: whether identity is a qualified string or a
`{ structureId, localId }` pair; the transform origin, axes and handedness; the
taxonomy of connection classes. Those need the research listed in
`docs/ARCHITECTURE_FUTURE_COMPOUND_ROOF_SCENE.md`.

## Consequences

- ADR-007 becomes load-bearing: parsed IDs would collide across structures.
- Quantity and procurement sources need a structure scope when V2 lands; current
  single-roof behaviour must stay describable as "one structure".
- Two roofs intersecting is a research problem (tolerances, sequencing,
  waterproofing, structure), not a polygon-intersection problem. No connection
  may be inferred from overlapping geometry alone.
