# VNext-8 — Roof families through the whole application

Owner request (2026-10-23): run more roof types through the RoofCalc engine
with the whole application connected — import, project, workbench,
materials, cost, documents — starting with the families that make RoofCalc
useful on real Polish jobs. Decision: ADR-016.

## Definition of Ready (mono-pitch as a project)

1. **User problem.** A carpenter pricing a carport, annex or garage today
   gets numbers from the mono-pitch workspace but cannot save the roof,
   price it or hand the crew a document; they retype it elsewhere.
2. **Domain owner.** `roof-math` (template schema, resolver, surface,
   skeleton) over `timber-model` (types). Not `calculator-core`: no
   composition beyond what gable/hip already get there.
3. **Canonical persistence.** The roof template in `RoofProjectDocumentV1`
   (`project.roof`). Layers, coverings, features keep their existing
   per-plane fields. The mono-pitch workspace draft stays a browser
   convenience.
4. **Schema / migration.** `RoofTemplateSpec` gains a variant;
   `schemaVersion` stays 1; existing documents unchanged; older builds
   refuse a mono-pitch document with their schema error (ADR-016).
   New reference fixture `11-mono-pitch-carport`.
5. **Undo / Redo.** Same store actions as gable: one history entry per
   committed edit; drags are gesture transactions; switching the roof type
   is one entry.
6. **Quantity.** Timber schedule, battens, counter-battens, membrane and
   coverings through the existing plane-generic sources; trusted only when
   the resolver is complete (no issues).
7. **Procurement.** Required blanks come from the shared fabrication plan
   (K1 stock length) as for the gable K1; no new allowance.
8. **Catalogue.** No new technical field.
9. **Cost.** None in geometry, quantity or procurement (ADR-005).
10. **Offline.** Everything is local; nothing needs the API.
11. **Mobile.** The same workbench inputs (exact numbers) at 390 × 844;
    the import and the start dialog already work on a phone.
12. **Domain research.** `docs/domain/MONO_PITCH_ROOF.md` §1–§12 (vectors
    F1–F3, P1–P3) covers it; the project resolver must reproduce F1.
13. **Regression.** roof-math tests (template ↔ framing parity), reference
    fixture, store/UI tests, `e2e` sample → project → materials → documents.
14. **Multi-structure.** One structure; nothing infers meaning from an ID;
    plane IDs stay opaque (`roofPlaneIds`).

## Branch-site audit

`type === 'gable' ? A : B` and `'hipRafter' in resolved` sites, and what a
third family needs there (✓ = safe as is, ✎ = changed in VNext-8).

| Site | Today | Mono-pitch |
| --- | --- | --- |
| `roof-math/roof-template.ts` dispatchers | gable / hip | ✎ third branch, `assertNever` |
| `roof-math/roof-surface.ts` `roofPlaneIds`, `boundaryMetrics` | gable else hip | ✎ one plane, verge/top metrics |
| `roof-math/roof-features.ts` basis, battens, membrane | gable else hip | ✎ the mono plane basis |
| `roof-math/counter-battens.ts` hip boundary | hip only | ✓ |
| `roof-math/opening-framing.ts` roofType | passes type | ✎ union grows |
| `calculator-core/fabrication-package.ts` | `'hipRafter' in` | ✓ (no hip) — upper cut labelled by end |
| `calculator-core/member-instance.ts` H1 | hip only | ✓ |
| `web/assembly/store.ts` hip/gable getters, actions | per type | ✎ mono inputs, assembly ↔ template |
| `web/assembly/Inputs.tsx` type selector, length min | gable / hip | ✎ third choice, mono fields |
| `web/assembly/Inspector.tsx` collar tie / hip panels | per type | ✓ hidden for mono |
| `web/assembly/SkeletonCanvas.tsx` labels, handles | gable else hip | ✎ family-neutral |
| `web/assembly/Summary.tsx`, `Page.tsx` labels | gable else hip | ✎ family label lookup |
| `web/assembly/project-start.ts`, examples | gable / hip | ✎ mono start values |
| `web/assembly/roof-scene.ts` | passes type | ✎ topology template |
| `web/assembly/project-readiness.ts`, `connections/census.ts`, `workbench.ts` | hip / gable only | ✓ |
| `web/assembly/export-adapter.ts` roofType | passes type | ✎ document label |

## Phases

- **8A — domain.** Template type and schema, resolver over
  `resolveMonoPitchFraming`, surface planes and lines, skeleton, layers on
  the mono plane, dispatchers, topology `supported`. Parity tests with F1.
- **8B — project.** Project document, reference fixture, project start and
  the Creator, import → project.
- **8C — workbench.** Inputs, canvas (assembly with a top end), skeleton
  and 3D, summary, inspector.
- **8D — downstream.** Materials, cost, execution document, readiness.
- **8E — proof.** e2e: sample drawing → project → workbench → materials →
  cost → document, desktop and phone.

Then the next families: asymmetric gable (two pitches, one ridge), then the
L with a valley (V2: two structures and a connection, ADR-008).

## Delivered (VNext-8, 2026-10-24)

- 8A domain: template, schema (framing rules on template paths), resolver,
  plane basis, surface metrics, declared abutment line, dispatchers with
  exhaustive switches, topology `supported`, K1 blank `top-plumb-cut`,
  purlin range bounded by an upper plate, `AssemblySpec.upperEnd`.
- 8B project: fixture 11; Creator third family (15° start pitch); import →
  project; the quick workspace → "Utwórz projekt" (template + build-up).
- 8C workbench: three-way type selector, span / top edge / high and verge
  overhang fields, family labels, skeleton frame and handles, summary,
  inspector (plates instead of ridge), tools list without a ridge.
- 8D downstream: census, materials, covering, execution document (span,
  top cut, datum), documents scope.
- 8E proof: e2e sample drawing → project → materials → documents, and
  workspace → project, desktop and phone.

Known limits: no wall-flashing role for an abutment line yet; pitch from
plate tops lives in the quick workspace only; asymmetric gable and the L
with a valley are next.

## Delivered (VNext-9, 2026-10-24) — the asymmetric gable

- Domain: `AsymmetricGableRoofTemplateSpec`, `resolveAsymmetricGableTemplate`
  (ridge from the two pitches, equal heel height → right seat, two
  assemblies through `calculateAssembly`), schema issues on template paths
  (`right_seat_not_positive`, `right_seat_exceeds_plate`), plane basis,
  surface metrics, skeleton with K2 rafters, dispatchers, topology
  `supported`. Vectors A1–A4 (`docs/domain/ASYMMETRIC_GABLE.md`).
- Project: fixture 12 (A1 + battens, counter-battens); Creator fourth family
  with a right pitch field; conversion gable ↔ asymmetric in the workbench.
- Workbench: span, left and right pitch fields (angle input), span handle,
  frame from `roofTemplateFrameMm`, family label; the canvas edits K1's
  assembly; a new left pitch keeps the span and moves the ridge; purlins
  are not offered (no dead "add purlin" button). K2 is in the element list
  with its derived facts (pitch, seat, stock length, count); drawing and
  schedule codes read `familyCode` (K2-NN), member family names come from
  one lookup (`MEMBER_FAMILY_LABEL`), instance codes take the family from
  the instance context. A refused pair of pitches names its reason
  (`asymmetricGableSeatRefusal`) in the Creator and the workbench.
- Downstream: K1 and K2 operations and previews (prefixed selections),
  member instances, quantity schedule (K2 by `familyCode`), materials,
  execution document with a K2 page after K1, documents scope.
- Proof: e2e Creator → project → materials → documents (K1 and K2 pages),
  desktop and phone.

Known limits: no purlins or collar ties on an asymmetric gable; the import
does not recognise "niesymetryczny" yet; K2 has no cutting plan of its own
(the K1 plan is shown); no wall-flashing role for abutment lines. Next: the
L with a valley (V2 structures and a connection, ADR-008).
