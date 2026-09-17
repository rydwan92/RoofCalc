# Batten and counter-batten stock lengths and joining — domain research

Scope: what a commercial purchase planner for **linear roof build-up timber**
(tile battens, counter-battens) may legitimately claim. It answers one
question: *when may a geometric run be assembled from several commercial
pieces, and where may the joints be?*

This document does **not** decide structural adequacy. Section choice, fixing
and wind-uplift design stay outside RoofCalc (V48 §45).

Related: `docs/domain/BATTEN_COUNTERBATTEN_LAYOUT_RESEARCH.md` (where rows go),
`docs/domain/HIP_BOUNDARY_EXECUTION_RESEARCH.md` (hip boundary runs).

## 1. Sources

| # | Source | Kind | Weight |
| --- | --- | --- | --- |
| S1 | Roof Tile Association, *Installing Underlay and Tile Battens* | trade association | high |
| S2 | Marley, *Technical tips for installing roofing batten* | manufacturer | high |
| S3 | Cedral, *Building roofs to BS 5534 with counter roof battens* | manufacturer | medium |
| S4 | Dietrich's (PL), *Zasady doboru łat do rozstawu krokwi* — ATV DIN 18334 §3.8 | CAD vendor citing DIN | medium-high |
| S5 | Polish trade guidance (Merit, Dachy Expert) on `łączenie łat` | trade press | medium |
| S6 | BuildWiz UK, *Roofing battens* / *Counter-battens* | aggregator | low — corroboration only |

S1, S2 and S5 are independent of each other and agree on the load-bearing
rule, which is why §2.1 is modelled. S6 is never used alone.

## 2. Findings

### 2.1 UNIVERSAL ENOUGH TO MODEL — a joint must sit over a support

> "Where battens are jointed ensure the cut ends are square and the joint is
> located centrally over the rafter." (S1)

Polish practice states the same rule and names the alternative support
explicitly: a batten is joined *"zawsze na podporze (krokwi lub kontrłacie),
nigdy w powietrzu"* (S5). S2 agrees. A butt joint in the span is a defect in
every source found, with no dissenting source.

**Modelled as:** `joint-at-support`. The planner may only cut a batten run at
a resolved support station, and a run that cannot be covered that way stays
unresolved rather than being silently spliced.

Physical corollary, not a citation: a **counter-batten lies along the rafter
for its whole length**, so every point of it is supported. Its joint rule is
therefore geometrically weaker, not stronger — see §2.4.

### 2.2 COMMON PRACTICE / USER DECISION — minimum piece and span

> Battens "should span at least three rafters and be at least 1.2 m long." (S2)
> "Each batten should be not less than 1200 mm long." (S1)

Two independent sources agree, but both are BS 5534 restatements. The numbers
are a **UK code value**, not a physical constant, and the app is used under
Polish/EN practice. They are therefore defaults the user can change, not
invariants.

**Modelled as:** `minimumPieceLengthMm` (default 1200) and
`minimumSpansPerPiece` (default 2 bays = 3 supports), both settings.

### 2.3 COMMON PRACTICE / USER DECISION — joint staggering

> "no more than one joint in any four consecutive battens on the same rafter"
> (gauge > 200 mm); "no more than three joints in any twelve consecutive
> battens" (gauge ≤ 200 mm). (S1, S2 agree verbatim in substance)

S5 independently requires staggered (`mijankowe`) joints without giving a
ratio. So *"stagger them"* is common practice; *"1 in 4"* is a code value.

**Modelled as:** a `maximumJointsPerSupport` ratio the planner respects when
choosing joint stations, defaulting to the gauge-dependent BS values, and
reported as a constraint the plan satisfied — never presented as a structural
approval.

### 2.4 UNKNOWN / WEAK EVIDENCE — counter-batten jointing

Only S6, the weakest source, states a counter-batten joint rule, and it simply
repeats the tile-batten sentence ("must fall directly over a rafter") which is
geometrically vacuous for a member that runs *along* the rafter. S3 confirms
counter-battens are governed by the same standard but says nothing about
jointing them.

**Conclusion:** there is no good evidence for a *position* constraint on a
counter-batten joint, because the rafter supports it continuously. There is
also no good evidence that arbitrary short pieces are acceptable.

**Modelled as:** `joint-along-supporting-member` — a joint is allowed anywhere
along the run, still subject to the minimum piece length of §2.2, and the
resulting plan records that the position rule is a physical inference rather
than a cited requirement.

### 2.5 SYSTEM-SPECIFIC — section versus rafter spacing

ATV DIN 18334 §3.8 (S4): 24/48 up to 0,70 m; 30/50 up to 0,80 m; 40/60 up to
1,00 m rafter spacing, timber C24/C30 per DIN 4074-1 / PN-EN 338.

This is a **structural** selection rule. RoofCalc records it here for future
work and does not apply it: V48 plans the material the user chose, and never
claims a section is sufficient (§45).

### 2.6 UNKNOWN — angled ends at hips and verges

S1 requires "full support … to fix the ends of the battens at hips and
valleys" but gives no fabrication geometry. No source found states how the
long point of a bevel-cut batten of finite section relates to the visible
clipped run length.

**Consequence:** a run whose end is cut at an angle does not get a claimed
millimetre-exact purchase blank. See the architecture document §"exact vs
partial".

## 3. What V48 may and may not claim

| Claim | Allowed | Basis |
| --- | --- | --- |
| "this joint is over a rafter" | yes | §2.1, resolved member axes |
| "no joint falls in a span" | yes | §2.1, enforced invariant |
| "pieces are at least 1,2 m" | yes, as a stated setting | §2.2 |
| "joints are staggered 1 in 4" | yes, as a stated setting | §2.3 |
| "this counter-batten joint is permitted" | only as a physical inference | §2.4 |
| "this bevelled end needs exactly N mm" | **no** | §2.6 |
| "40×60 is strong enough here" | **no** | §2.5, §45 |

## Sources

- [Roof Tile Association — Installing Underlay and Tile Battens](https://rooftileassociation.co.uk/tech_lib/installing-underlay-and-tile-battens/)
- [Marley — Technical tips for installing roofing batten](https://www.marley.co.uk/support/installation/technical-tips-for-roofing-batten)
- [Cedral — Building roofs to BS 5534 with counter roof battens](https://www.cedral.world/en-gb/blog/129825/building-roofs-to-bs5534-certification-and-best-practice-with-counter-roof-battens/)
- [Dietrich's PL — Zasady doboru łat do rozstawu krokwi (ATV DIN 18334 §3.8)](https://pl.blog.dietrichs.com/2014/07/ausfuehrung-von-dachlatten/)
- [Merit — Prawidłowe łączenie łat na dachu](https://merit.pl/prawidlowe-laczenie-lat-na-dachu-uniknij-bledow-i-zbuduj-trwale)
- [BuildWiz — Counter-battens](https://www.buildwiz.uk/knowledge/materials/roofing/counter-battens) (corroboration only, see §2.4)
