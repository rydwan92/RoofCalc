# V39 — Execution geometry and the hip boundary

Status: implemented on main after `1705e89` (V38), 2026-09-16.

V39 closes three real execution gaps rather than adding a surface: the hip
counter-batten dead end, the jack's theoretical termination, and K1's
reference-only 3D solid.

## Definition of Ready

1. **User problem** — a hip roof showed *Częściowo automatyczne* counter-battens
   for ever, with a passive sentence and no way to finish the job. J1 reported a
   centre-plane length that is not a finished end. K1 was drawn in 3D as a plain
   prism even though its cuts have been resolved since V5.
2. **Domain owner** — `roof-math` owns all new geometry
   (`counter-battens.ts`, `jack-rafter.ts`, new `finished-rafter-solid.ts`).
   `timber-model` owns the new intent vocabulary. `technical-scene` transports
   the results; `apps/web` captures intent and presents it. No solver moved up
   or down a layer.
3. **Canonical persistence** — two additive-optional intents (§5). Everything
   derived — runs, cut planes, finished lengths, scene geometry — stays out of
   the document.
4. **Schema / migration** — additive-optional only; see
   `docs/SCHEMA_REGISTRY.md` §1. A project saved before V39 loads unchanged and
   keeps its truthful partial status.
5. **Undo / Redo** — choosing a hip detail or a hip execution intent is one
   normal history entry. 3D display toggles, build-up visibility and camera are
   transient and create none.
6. **Quantity** — the counter-batten total changes only because the resolver
   resolved more runs. Nothing downstream recomputes geometry.
7. **Procurement** — unchanged. J1 becoming `fabrication-resolved` deliberately
   does **not** create a procurement blank (§7).
8. **Catalogue** — unrelated to the execution work; V39 separately seeds the
   first real metal roofing products (§11).
9. **Future cost layer** — no commercial concept entered geometry. The existing
   V34B "project changed this value" workflow handles the new quantity.
10. **Offline** — everything here is pure geometry; no API or database.
11. **Mobile UX** — the hip chooser is reachable at 390×844 through the tools
    and inspector sheets, with its own E2E smoke test.
12. **Domain research** — `docs/domain/HIP_BOUNDARY_EXECUTION_RESEARCH.md`.
13. **Regression** — 27 new pure tests in `roof-math`, 7 web tests, 6 E2E
    scenarios across both viewports.
14. **Multi-structure** — no ID is parsed. Hip boundaries are reported by the
    physical `hipMemberId` the skeleton already carries.

## 1. Root cause of the partial counter-batten state

`resolveCounterBattenLayout` pushed one `hip-boundary-detail-unresolved` issue
per physical H1 whose adjoining planes were requested, and the result status was
`warnings.length ? 'partial' : 'resolved'`. So the status could never become
`resolved` on a hip roof, by construction — and nothing in the UI could change
that, because there was no input to change.

That refusal was **correct** (V33 would otherwise have invented a run). What was
missing was the decision itself.

## 2. Research conclusion

Two well-evidenced, mutually exclusive details exist, and they differ in
quantity, so no default is honest:

- the hip batten rides on **adjustable holders screwed into the hip rafter**
  (a whole product class exists for exactly this) — **no** counter-batten run
  at the hip;
- **paired runs** alongside the hip on both planes, giving the plane battens an
  end bearing and keeping the ventilation channel.

Full evidence and citations: `docs/domain/HIP_BOUNDARY_EXECUTION_RESEARCH.md`.

## 3. Supported hip-boundary details

```ts
HipCounterBattenDetail = 'not-decided' | 'no-dedicated-run' | 'paired-plane-runs'
```

| Detail | Runs per hip | Added length | Status |
| --- | --- | --- | --- |
| `not-decided` | — | — | `partial`, exactly as before V39 |
| `no-dedicated-run` | 0 | 0 mm | `resolved` |
| `paired-plane-runs` | 2 | resolved | `resolved` |

A **single run centred on the hip top** is deliberately unsupported: its seating
surface differs between a backed and a dropped hip, and the model resolves
neither. Guessing it was the thing V33 refused to do.

`paired-plane-runs` geometry: the run is parallel to the hip, its inner face on
the plane's own hip boundary (the exact line where the two resolved planes meet,
which the physical H1 member projects onto), so its axis sits half a
counter-batten width inside the plane. Openings are subtracted along the
diagonal exactly as they are for fall-line axes.

### Result semantics

```ts
CounterBattenLayoutResult {
  interiorAxisCount          // fall-line runs over a K1/J1 axis
  hipBoundaryRunCount        // runs parallel to a hip
  hipBoundaries[]            // every boundary, decided or not
  unresolvedHipBoundaryCount
}
ResolvedCounterBatten { role, reference, … }
```

Every row now states what it physically is (`plane-rafter-axis` /
`hip-boundary-run`) and what it is referenced to (`rafter-axis` /
`plane-hip-boundary`). Boundaries are reported whether or not they produced a
run, so the UI can always name what still needs a decision.

## 4. H1 physical references

Audited and left alone. `HipRafterResult` already carries the hip slope, plumb,
seat, cheek and backing angles, the ridge plan/axis deductions and the
outer-eave-to-ridge-face station; `HipBackingDetail` still reports
`back-or-drop-not-decided`.

V39 adds `HipExecutionIntent { hipTop?, jackConnection? }` so the backing choice
becomes explicit project intent instead of a permanent unknown, and proves the
one physical reference J1 actually needs: the hip's **vertical side face**. That
face is unaffected by backing or drop — both operations remove material from the
hip's *top* — which is why J1 can resolve while the top treatment stays open.

H1 itself is **not** promoted: it keeps `geometryStatus: 'reference'` and its
`compound-connection-not-resolved` limitation, and gains no procurement blank.

## 5. J1 physical termination

One discriminated, evidence-backed slice: a **square butt against the hip's near
vertical side face**.

```text
hipFacePlanDeductionMm = hipWidthMm / √2          // (w/2) / cos 45°
hipFaceAxisDeductionMm = hipFacePlanDeductionMm / cos(pitch)
finishedLengthMm       = referenceLengthMm − hipFaceAxisDeductionMm
```

Same form as the existing H1 ridge deduction, for the same reason — a 45° plan
approach to a vertical face. The cut plane is parallel to the centre plane the
reference cut already uses, so **every angle is unchanged**; only the station
moves.

**Reference geometry is never overwritten.** `referenceLengthMm`, `lengthBasis`
and the whole `result` stay exactly as before; the finished end is additive:

```ts
JackRafterMeetingCut.hipFaceDeduction: 'not-applied' | 'applied-to-hip-side-face'
JackRafterMeetingCut.finished?: JackRafterFinishedEnd
JackRafterFabricationPlan.executionStatus: 'reference-only' | 'fabrication-resolved'
JackRafterFabricationPlan.unresolvedReason?: 'hip-connection-not-selected'
```

Hardware-assisted jack connections (sloped/skewed hangers) are **not** modelled;
they need a connector snapshot, not an end allowance.

### Procurement

`fabrication-resolved` does not make J1 procurement-ready. No fabrication
allowance has been declared for it, and ADR-009/ADR-010 require the allowance to
be resolved upstream of procurement. `allowance: 'not-included'` says so
explicitly. Left for a later iteration, deliberately.

## 6. Finished K1 solid

`packages/roof-math/src/finished-rafter-solid.ts` turns the *already resolved*
fabrication result into a placed physical solid. **No boolean/CSG operation and
no new dependency**: `TimberMember2D.profile` is already the machined outline
with the birdsmouth and both end cuts taken out, so the solid is that closed
polygon extruded by the section width. A concave polygon is triangulated by the
renderer; that is not a CAD kernel.

The one thing that had to be established is the anchor between the 2D profile
and the 3D skeleton axis. The skeleton axis is the **roof-plane reference line**,
not the section centre: it runs through the seat notch at perpendicular distance
`normalDepthMm` above the bottom edge, and because the eave is cut plumb it
enters the end face at member-local `(normalDepthMm · tan θ, normalDepthMm)`.

That rule is not assumed — `finished-rafter-solid.test.ts` checks the placed axis
against the skeleton axis for 2 sides × 4 pitches × 3 overhangs, at three
stations each, to within 1e-6 mm. Without a resolved seat reference the module
returns `unresolved`, never a guess.

## 7. Scene and renderer

`technical-scene` gains a renderer-neutral `SceneExtrudedProfile` primitive plus
optional `counterBattens`, `unresolvedHipBoundaries` and `finishedMembers`
inputs. It still runs no solver: `apps/web` composes those from `roof-math`
results in one memo, so camera, selection and filter changes never rerun
geometry.

The viewport renders a finished member as an `ExtrudeGeometry`. **Instancing is
preserved**: every K1 resolved from the same prototype shares one profile, so
`sceneInstanceKey` keys on the profile and all of them collapse into a single
`InstancedMesh` exactly as the prism did. Edge wireframes are generated
per-geometry-kind (box edges, or two profile caps plus one edge per vertex).

New 3D controls, both transient: **Kontrłaty** (build-up context, off by
default) and **Wykonawczy / Referencyjny** (finished vs blank). An unresolved hip
boundary is drawn as a dashed amber line, never as a finished solid.

## 8. The workflow that replaced the dead end

```text
KONTRŁATY   174,57 m   Częściowo
            46 osi K1-J1 · 0 ciągów grzbietowych
            4 grzbiety wymagają wyboru detalu      ← and 4 dashed hips in 2D

  [ sketch ] Uchwyty w krokwi narożnej
  [ sketch ] Kontrłaty po obu stronach

→ choose

KONTRŁATY   231,38 m   ✓ Gotowe
            46 osi K1-J1 · 8 ciągów grzbietowych
            Długość z grzbietów  56,81 m
```

Both options are radio cards with a small section sketch, a plain Polish name
and a one-line explanation — no enum dropdown, no internal names. The numbers
above are the real resolver output for the bundled hip example.

## 9. Downstream

Material Plan, Cost and Export needed **no change**: they already consume
`counterBattens.status` and `totalVisibleLengthMm`. Choosing a detail upgrades
the Material Plan row from *CZĘŚCIOWE* to *GEOMETRIA* with the new total, and the
existing V34B "project changed this value" workflow protects any accepted cost
line — nothing is silently rewritten. It is still labelled a geometric visible
length, never a purchase length.

## 10. Validation flake fixed

`vitest.config.ts` now sets `testTimeout: 20000`. The heaviest suites render the
whole application in jsdom — `Page.test.tsx` ~2.1 s per test, `MobilePage` ~1.8 s,
`ProjectManager` ~2.6 s — so vitest's 5000 ms *unit*-test default was failing a
different healthy test on almost every full run while each passed isolated in
well under a second. 20 s is ~10× the slowest healthy test, so a real hang is
still caught. The full suite is deterministic again.

## 11. Catalogue extension

Unrelated to the execution work, and separately requested: the `modular-sheet`
catalogue was empty, so the covering picker could only offer manual entry for
blachodachówka and blacha trapezowa. `metal-sheets-2026-09.json` seeds three real
Pruszyński products — FIORD and TIGRA modular tile-profile sheets and the T18
Dach trapezoidal sheet as a cut-to-length product — with per-revision source
citations. Catalogue: 12 → 15 products.

## Known limitations

- H1 backing/drop remains an intent only; no hip top surface is modelled, so
  H1's 3D solid stays a reference prism.
- Only one J1 connection is modelled; no hardware variant.
- J1 and H1 remain outside procurement.
- A single centred hip counter-batten run is unsupported by design.
- The finished solid exists for K1 only; H1/J1 keep reference prisms and say so.
- No structural claim anywhere: member adequacy, fasteners, uplift and required
  sections remain **REQUIRES STRUCTURAL DESIGN**.

## Validation

See `PROJECT_BLUEPRINT.md` → WORK CHECKPOINT for the recorded run.
