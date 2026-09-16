# Hip boundary execution research — V39

Scope: only the facts V39 needs to stop showing an unexplained *partial*
counter-batten result on a hip roof, and to terminate J1 against a physical H1
face. No structural rule, no member sizing, no fastener count. Structural
verification stays **REQUIRES STRUCTURAL DESIGN** (see
`TIMBER_CONNECTION_EXECUTION_RESEARCH.md`).

Each finding is classified as the V39 prompt requires:

| Class | Meaning |
| --- | --- |
| **GEOMETRIC** | Follows exactly from the resolved regular-hip model. No practice assumption. |
| **COMMON** | Widely used arrangement, evidenced by more than one independent source. |
| **SYSTEM** | Depends on a specific product/system; must never be assumed. |

---

## 1. The question

At a hip (PL *naroże* / *grzbiet*, DE *Grat*) the roof build-up must:

- terminate the plane battens of both adjoining planes,
- carry the hip tiles on a hip batten (PL *łata narożna*, DE *Gratlatte*),
- keep the ventilation path continuous into the hip.

The open question V33 deliberately refused to guess: **does a counter-batten
run along the hip, and if so how many and referenced to what?**

## 2. Finding — the plane counter-batten is a fall-line member

**GEOMETRIC / COMMON.** A counter-batten runs up the fall line, fixed on each
rafter over the underlay, and does three things: it forms the ventilation gap,
it presses the membrane onto the rafter, and it carries the battens. Cross
sections in use are 25×40, 30×50 and 40×60 mm; ZVDH relates the height to
rafter length (≈30 mm to 8 m, 40 mm above, 60 mm from 12 m), and DIN 4108-3
fixes the ventilation cross-section the gap must keep.

This is exactly what RoofCalc already resolves for K1 and J1 axes. Nothing
about it changes in V39.

## 3. Finding — the hip batten is carried by an adjustable holder fixed **into
the hip rafter**

**COMMON, product-backed.** A whole product class exists for this: the
adjustable ridge/hip batten holder (*First- und Gratlattenhalter*). Its stated
purpose is to be placed **on the rafter** and to compensate for differing
rafter heights with stepless height adjustment, so the hip batten reaches the
correct level for the hip tiles. A patented screw variant is described as being
screwed "into the ridge purlin **or the hip rafter**" (`Gratsparren`).

Consequence, and it is the decisive one: **a dedicated counter-batten run along
the hip is not required for the hip batten to be supported.** The holder's own
height adjustment does the job that a counter-batten would otherwise do. Any
model that silently adds a counter-batten run at every hip would over-state
material on every roof built this way.

## 4. Finding — a counter-batten run beside the hip is also real practice

**COMMON.** Polish practice describes the hip build-up as: hip rafters →
underlay membrane → *łaty kątowe oraz kontrłaty* forming the ventilation
channel → the hip batten carrying the hip tiles. Here counter-battens do run
alongside the hip, giving the plane battens a defined end bearing and keeping
the ventilation channel open into the hip roll.

## 5. Conclusion — there is no universal hip counter-batten detail

Findings 3 and 4 are both well evidenced and they are **mutually exclusive
quantities**. One adds zero counter-batten length at the hip; the other adds
two runs per hip. The choice follows from the chosen hip-batten holder / roofing
system, which is **SYSTEM** information RoofCalc does not hold.

Therefore V39 must not pick a default, must not label either one
"recommended", and must not silently convert *partial* into *resolved*. It must
ask the expert once, per project, and then resolve exactly.

### Supported detail A — `no-dedicated-run`

The hip batten is carried by holders fixed into the hip rafter; the plane
counter-battens terminate at the hip.

- Counter-batten runs added at the hip: **none**.
- The boundary is *decided*, so the layout becomes complete.
- Exactness: total. Nothing is added, so nothing is guessed.

### Supported detail B — `paired-plane-runs`

One counter-batten run on each of the two adjoining planes, parallel to the
hip.

- Runs added per hip: **two**, one per adjoining plane.
- **Reference line (definition, not inference):** the hip boundary of that
  roof plane — the exact line where the two resolved roof planes meet, which
  the plane polygon and the resolved H1 axis already define. The run's inner
  face lies on that line, so its axis sits half a counter-batten width inside
  the plane. This is stated as the definition of the modelled detail; it is not
  a claim about any particular manufacturer's drawing.
- Length: the visible extent of that hip boundary inside the plane, with roof
  openings subtracted exactly as interior axes are.

### Not supported in V39

A **single run centred on the hip rafter's top**. It is geometrically
conceivable, but its seating surface is the hip's top, which differs between a
backed and a dropped hip — and the current model resolves neither (§6). It
would be a guess, so it stays out.

## 6. Finding — backing versus drop is still undecided, and that is correct

**GEOMETRIC.** `HipBackingDetail` reports `angleDeg` and
`fabricationChoice: 'back-or-drop-not-decided'`. Both real operations place the
hip's upper arrises on the two roof planes, so **the plan position of a
hip-boundary counter-batten run is the same either way** — which is why detail
B can resolve its geometry without the backing decision.

What does differ is the **bearing**: a backed hip presents a continuous
bevelled surface flush with each plane, a dropped hip presents only the arris
line with a void beneath. V39 therefore keeps the backing choice as its own
explicit execution intent, resolves detail B's geometry independently of it,
and discloses the bearing consequence rather than inventing a top surface.

## 7. Finding — the J1 end against a physical H1 face is exactly derivable

**GEOMETRIC**, for the regular equal-pitch hip RoofCalc already models.

The hip rafter is plumb-sided: its section width is horizontal and
perpendicular to its 45° plan axis — the same convention
`createTimberPrismBasis` uses for every member. Its two side faces are
therefore vertical planes parallel to the hip axis, offset from the hip centre
plane by `width / 2`. Backing and drop remove material from the **top** only,
so they do not move the side faces.

A jack runs at 45° in plan to the hip. Moving from the centre plane to the near
side face along the jack's plan direction therefore costs

```text
hipFacePlanDeductionMm = hipWidthMm / √2        // (w/2) / cos 45°
hipFaceAxisDeductionMm = hipFacePlanDeductionMm / cos(pitch)
finishedLengthMm       = referenceLengthMm − hipFaceAxisDeductionMm
```

This is the same form as the existing H1 ridge deduction
(`ridgeThicknessMm / √2`, then divided by `cos(hipSlope)`), for the same
reason — a 45° plan approach to a vertical face.

The **angles are unchanged**: the finished cut plane is that vertical side
face, which is parallel to the centre plane the current cut already uses. So
`plumbLineToMemberAxisDeg`, the 45° plan line and the top-face line all stay
exactly as resolved today; only the station moves.

Scope of this slice: a **square-butt jack against the hip's side face**. It is
one discriminated detail as `TIMBER_CONNECTION_EXECUTION_RESEARCH.md` requires.
Hardware-assisted jack connections (e.g. a sloped/skewed jack hanger) impose
their own seat, clearance and fastener geometry and are explicitly **not**
covered; they need a connector snapshot, not an end allowance.

## 8. What V39 must still refuse

- Any structural claim: member adequacy, fastener count, uplift, bearing
  capacity, required sections.
- Ventilation cross-section verification at the hip (a roll/accessory product
  question, not geometry).
- A default hip-boundary detail.
- A hip top surface for backing or drop.
- Turning a J1 finished length into a procurement blank without a declared
  fabrication allowance (ADR-009/ADR-010).

## Sources

- [Naroże dachowe — definicja i budowa (Armet)](https://e-armet.pl/naroze-dachowe-definicja) — hip build-up sequence: hip rafters → membrane → *łaty kątowe oraz kontrłaty* → hip batten.
- [Łaty i kontrłaty: do czego służą? Wymiary, materiały, montaż (Budownictwo B2B)](https://budownictwob2b.pl/dachy/baza-wiedzy/konstrukcja-dachu/56505-laty-i-kontrlaty-do-czego-sluza-wymiary-materialy-montaz) — counter-batten function and cross sections.
- [Kontrłata na dachu — wymiary, montaż i wentylacja połaci (Kuropasz)](https://kuropasz.pl/kontrlata-na-dachu-wymiary-montaz-i-wentylacja-polaci) — 25×40 / 30×50 / 40×60 mm, membrane clamping.
- [Lüftungsquerschnitte nach ZVDH (Holzbauzentrum Nord)](https://hbz-nord.de/aktuelles/lueftungsquerschnitte-nach-zvdh/) — counter-batten height by rafter length.
- [Klöber — universeller First- und Gratlattenhalter](https://kloeber.de/produkte/steildach/first-und-grat/p/universeller-first-und-gratlattenhalter) — adjustable hip/ridge batten holder placed on the rafter.
- [BWK allform — First- und Gratlattenhalter verstellbar](https://bwk-dachzubehoer.de/produkt/first-und-gratlattenhalter-verstellbar/) — stepless height compensation for differing rafter heights.
- [DE102014003620A1 — Grat- und Firstlatten-Schraube](https://www.freepatentsonline.com/DE102014003620A1.html) — holder screwed into the ridge purlin *or the hip rafter* (`Gratsparren`).
- [DE19641065C1 — Verstellbarer First- bzw. Gratlattenhalter](https://patents.google.com/patent/DE19641065C1/de) — holder prepared for placement on a roof rafter.
- [Steildach-Belüftung: First- und Gratrollen (Baustoffwissen)](https://www.baustoffwissen.de/steildach-belueftung-funktion-von-first-und-gratrollen-31102023) — hip/ridge rolls carry the ventilation cross-section at the hip.
