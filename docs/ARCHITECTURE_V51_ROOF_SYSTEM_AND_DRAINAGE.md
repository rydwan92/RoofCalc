# V51 — Roof features, roof-system BOM and drainage

Contracts, dependency direction, truth limits and extension points. Code is
the specification; this file says where it lives and what it deliberately
does not claim.

## 1. Pipeline

```text
roof-math   resolveRoofSurfaceGeometry → resolveRoofFeatureTopology
                                          (eaves, ridges, hips, valleys, verges,
                                           eave corners, opening edges, plane edges)
                 │
apps/web    roof-system.ts (the one application adapter)
                 │  structural copies of eaves / corners / lines
roof-system-core  resolveDrainagePlan · resolveRoofLineComponents
                 │  (+ V50 tile-procurement accessories via roofLineLengthsFromFeatures)
apps/web    covering drawing · Materials › Odwodnienie · Material Plan rows ·
            cost suggestions · readiness · material list · drainage-plan section
```

## 2. Canonical roof features (`roof-math/src/roof-topology.ts`)

- Every plane polygon edge is matched in resolved 3D world coordinates
  (1 mm tolerance). A shared edge is **one** feature with all
  `incidentPlaneIds`: horizontal → ridge; sloped → hip (convex) or valley
  (concave, by the neighbour plane's side of the own plane). Unshared:
  horizontal at the plane's lowest level → eave; sloped → verge.
- `lengthMm` is the true 3D length. Eaves carry `outwardPlan` and are oriented
  with the roof on the left, so adjacent eaves meet end → start;
  `eaveCorners` are external under a hip, internal under a valley.
- IDs (`roof-line:<kind>-<n>`, `eave-corner:<n>`, `opening-edge:<n>`) are
  deterministic for identical geometry and **opaque**: meaning comes from
  `kind`, `ordinal`, `incidentPlaneIds` and topology. An architecture test
  allows the namespace literal only in the minting modules.
- Opening edges are a separate list (`lower | upper | side`), never eaves or
  verges. Current templates produce zero valleys; the kind exists for future
  compound roofs.
- Reference counts: gable = 1 ridge, 2 eaves, 4 verges, 0 corners; hip =
  1 ridge, 4 hips, 4 eaves, 4 external corners; square hip = 0 ridge, 4 hips.

The covering scheme (`covering-scheme-geometry.ts`) no longer classifies
edges; it projects `planeEdges` into the drawing. V50 ridge/hip accessory
line lengths come from `roofLineLengthsFromFeatures` (numbers unchanged).

## 3. `packages/roof-system-core` (depends on `zod` only)

- `roles.ts`: structured roles for covering system, ridge/hip, eave and
  drainage; V50 accessory roles map onto them. A small finite rule
  vocabulary — no expression language.
- `spacing.ts`: `distributeAlongLength` — fewest equal intervals ≤ max,
  positions computed from the index (no accumulated rounding).
- `sections.ts`: `planCommercialSections` for one straight run, policy
  `no-reuse-between-runs` (KONSERWATYWNY): fewest sections, then least
  commercial overage, bounded search. A gutter run is never sent to
  `procurement-core` as one indivisible blank.
- `drainage-spec.ts`: `roof-drainage-component` catalogue spec (role,
  explicit `systemKey`, lengths/spacings only when source-backed),
  `DrainageSystemSnapshot`, persisted `DrainageIntent`, line components and
  `createManualDrainageSystem` (works with no database).
- `drainage-planner.ts`: runs = chains of guttered eaves through connected
  corners (closed loop possible); sections/connectors per eave segment from
  the actual assembly; end caps from open run ends (left + right when the
  system declares handed caps); corners from connected corners; hooks per
  segment; outlets only explicit (proposals are shown, never counted);
  downpipe sections from the user's height; elbows only user-confirmed;
  clamps from source spacing or a user count. Rows needing a decision carry
  no quantity.

## 4. Intent, history, persistence

`project.roofSystem?` (see `docs/SCHEMA_REGISTRY.md` §1). AUTO follows the
roof (all eaves, proposed continuous corners, labelled PROPONOWANY UKŁAD);
the first manual edit freezes what AUTO showed into explicit decisions. Every
edit is one history entry; an outlet drag is one transaction
(`beginTransaction` → `previewRoofSystem` → `commitTransaction`) storing only
the normalized station.

## 5. Application surfaces

Materials › Odwodnienie (plan view + inspector, drag, numeric station,
heights, elbows, hooks AUTO/RĘCZNIE with visible incompatibility); Material
Plan grouped Pokrycie → Warstwy → Okap i obróbki → Odwodnienie →
Konstrukcja with a SYSTEM DACHU summary and a single compact row when
drainage is off; cost suggestions `drainage:<key>` / `line-component:<id>`
priced per commercial piece with the existing drift review; readiness
issues are warnings affecting only materials/cost; the material list reads
the same rows; the execution package gets a concise `drainage-plan`.

## 6. Catalogue

Batch `drainage-galeco-stal2-2026-09-v51.json` (immutable, technical only,
no prices): Galeco STAL² 125/80×80 — gutters 3/4 m, downpipes 1/3 m,
connector, 90° corners, left/right caps, outlet, hook (max 60 cm), socket,
72° elbow, clamp (max 1,8 m). Sources: galeco.pl product page, the STAL²
installation guide and the technical-information page (retrieved
2026-09-18). Seeded twice locally: second pass 0 new / 0 conflicts.

## 7. Truth limitations

- **No hydraulic assessment.** System size, outlet number and diameter are
  the user's choice; one sentence says so wherever drainage is enabled.
- No offcut reuse between runs; corner pieces do not shorten gutter length
  (conservative); hooks are placed at both ends of every eave segment, and
  the manufacturer's "not at a joint" advice is not enforced.
- Corner pieces are assumed to match the roof's 90° corners; whether a
  system needs extra connectors at corners is not modelled (no source).
- Downpipe height, elbows and offsets are user inputs; no wall/terrain model.
- Ridge tape and eave elements are manual products until catalogue data
  exists. Valleys, abutments, flashings and snow guards are future work.

## 8. Extension

Compound roofs reuse the topology (valleys → internal corners). Hydraulic
sizing would be a separate module reading runs + roof areas per outlet and
never changing the material planner. More systems are new batches with a new
`systemKey`.
