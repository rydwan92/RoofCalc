# V52 — Roof detail system and drainage hardening

Code is the specification. This file says where things live and what they
deliberately do not claim.

## 1. Pipeline

```text
roof-math   resolveRoofFeatureTopology ─┬─ resolveRoofLineEnds   (open / junction ends)
                                        └─ resolveRoofOpenings   (perimeter per window,
                                                                  plane-local + 3D, pitch)
apps/web    roof-system.ts  → RoofSystemFacts (+ ridge-tile count from the V50 tile plan)
roof-system-core
            resolveDrainagePlan      hooks off joints · purchase policy · routes
            resolveRoofLineComponents rolls · pieces · open ends · per ridge tile
            resolveOpeningSystems    window identity · covering class · kit fit
apps/web    System dachu workspace · Material Plan · cost · readiness ·
            material list · execution "Detale dachu"
```

No new geometry solver in React: the workspace draws canonical features and
opening edges already resolved in 3D.

## 2. Drainage hardening (Galeco STAL² guide, retrieved 2026-09-19)

| Topic | Source | V52 |
| --- | --- | --- |
| Hooks ≤ 60 cm, not at joints | stated | `distributeAvoidingJoints`: fewest even hooks; a hook inside a joint zone moves to the zone edge; one more hook only if a gap would exceed the max. Joint stations come from each segment's installed pieces (`SectionAssembly.piecesMm/jointStationsMm`). |
| Clearance from a joint | not stated | ROOFCALC STRATEGY 100 mm (`HOOK_JOINT_CLEARANCE_MM`), always shown as RoofCalc's value. |
| Hook end distance | not stated | none invented; hooks stay at segment ends (strategy). |
| Corner takeout | no geometry published | not modelled — corners still do not shorten gutters (conservative). |
| Offcut reuse | not addressed | explicit policy `no-reuse-between-runs` (default) / `reuse-straight-remainders`; reuse sends installed pieces to `procurement-core` (kerf/trim 0); assembly, connectors and hooks are unchanged; never worse than no-reuse. |
| Downpipe offset | user geometry | route `straight` / `offset` (+ offset pipe length, own section assembly) / manual; offset ⇒ 2 elbows, optional discharge elbow +1. Height is outlet → discharge, not reduced by the offset (upper estimate). |

Reference change: gable 9,2 m eaves with 4 m sections now need 18 hooks per
eave instead of 17 (the 8th even hook landed 25 mm from a joint).

## 3. Components

- `roof-system-component` (one catalogue kind; role is a field): ridge tape,
  ridge end, clip, eave comb/ventilation strip/eave strip/drip edge/eave
  flashing/gutter apron, verge flashing, wind board. Optional source-stated
  `lengthMm`, `effectiveCoverLengthMm`, `rollLengthMm`, `widthMm`,
  `quantityRule`; compatibility `universal` or explicit covering product IDs.
  `LINE_ROLE_RULES` rejects nonsense (a ridge end is never per metre).
- Rules: `linear-effective-cover` (pieces per feature, never across lines),
  `roll-length` (whole rolls over the total — a roll is cut, not jointed),
  `one-per-feature-end` (open ends from topology: gable 2, hip 4, pyramid 4),
  `one-per-ridge-tile` (only from a fully resolved ridge-tile count), manual.
  Allowance only when entered; no hidden percentage.
- Requirement vs purchase stays visible: requirement m → rolls/pieces →
  purchased m → NADWYŻKA HANDLOWA (never "waste").
- `roof-window-component`: `roof-window` (size identity: system key, size
  code, nominal size) and `window-flashing-kit` (covering class with its
  limit, pitch range, installation depth, `includes`). Compatibility is
  structural: same system, same size code, user-confirmed covering class,
  plane pitch in range, rectangular opening. Generic openings never get a
  "compatible" kit; manual flashing always works (RĘCZNIE).

## 4. Application

- **Materiały › System dachu**: areas Pokrycie / Kalenica-grzbiety / Skraje /
  Okap / Otwory / Odwodnienie with READY / NEEDS A DECISION / NOT
  CONFIGURED / NOT APPLICABLE and counts (no percentage);
  "Uzupełnij system dachu" checklist; product cards (KOMPATYBILNE /
  Uniwersalny / Niezgodne) and a manual form; eave/verge feature chips;
  "Dotyczy: …" highlights the exact features; layer toggles; hook/joint
  markers on demand; opening editor.
- Material Plan: POKRYCIE (dachówka, gąsiory/grzbiet incl. tape/ends/clips,
  skrajne, inne), WARSTWY, OKAP / KRAWĘDZIE, OTWORY DACHOWE, ODWODNIENIE,
  KONSTRUKCJA; empty groups do not render; the SYSTEM DACHU summary is the
  single entry point for unconfigured areas.
- Cost: roof-system suggestions carry their sale unit (`roll` or `piece`);
  price joins require the same sale unit. Flashing kits are one piece each.
- Readiness: `opening-flashing-undecided` (info), `opening-flashing-
  incompatible` (warning), `roof-system-component-undecided` (info) — all
  affect only materials/cost.
- Documents: material list reads the rows; execution package gains an
  optional `roof-details` section (element → product → where), drainage
  outlets show their route and the hook/joint rule.

## 5. Catalogue `roof-system-2026-09-v52.json`

swissporTON RBF vent 310 / 390 mm (roll 5 m, `roll-length`; 310 → KODA,
SIMPLA, BALANCE; 390 → TITANIA as the source notes) and Gąsior początkowy
PS (ridge end, KODA/SIMPLA, no quantity rule stated → user confirms).
VELUX size identities MK04 (78 × 98) and MK06 (78 × 118); flashings EDW 0000
MK04/MK06, EDW 2000 MK06 (with BFX + BDX), EDS 0000 MK06 (flat ≤ 16 mm) —
covering class, pitch 15–90°, standard depth, from materialy.velux.pl and
velux.pl. The PS ridge tile's clamp is supplied with the tile (no separate
clip product). Seeded ×2 locally: second pass 0 new / 0 updated / 0 conflicts.

**Prices:** none imported. Retail prices for STAL² hooks differ ~2.5×
between shops and are colour-variant specific; V51/V52 products have no
commercial variants to join a price to. Manual prices work.

## 6. Not claimed / next

No hydraulic sizing, no corner takeout, no hook end-distance rule, no facade
model, no FAKRO, no collar-only products, no valley/compound work, no
snow guards. Next: commercial variants (colour) for drainage/system
components so verified net prices can join, and verge flashing products.
