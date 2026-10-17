# Roof timber connections and the standards behind them (VNext-2)

Domain research for `packages/connection-core`. It extends
`TIMBER_CONNECTION_EXECUTION_RESEARCH.md` (V26C), which fixed the safety
boundary this module keeps: **RoofCalc resolves geometry and detailing; it
does not verify load-bearing capacity.** Every reference below names the
rule a structural designer applies — it never means "RoofCalc checked it".

## 1. Safety and legal boundary

- Designing a roof structure in Poland is a task for a designer with the
  appropriate building licence (uprawnienia budowlane). The connection plan
  is a carpenter's planning and communication tool, not a structural design.
- Capacity, the number of fasteners a node needs, timber grade, service class
  and load combinations come from the design (PN-EN 1990, PN-EN 1991,
  PN-EN 1995-1-1 with its National Annex). RoofCalc stores the *decision*
  ("2 × M12 bolts here"), checks whether that layout **fits the section**
  under the EN 1995-1-1 spacing tables, and says so — never that it carries
  the load.
- Wording rule (UI): "sprawdzenie geometrii rozmieszczenia, nie nośności".

## 2. Standards referenced

| Standard | Role | Edition recorded |
| --- | --- | --- |
| PN-EN 1990 | Basis of structural design | PN-EN 1990:2004 |
| PN-EN 1991-1-1 | Self-weight, imposed loads | PN-EN 1991-1-1:2004 |
| PN-EN 1991-1-3 | Snow | PN-EN 1991-1-3:2005 |
| PN-EN 1991-1-4 | Wind | PN-EN 1991-1-4:2008 |
| PN-EN 1995-1-1 | Timber design, general rules (Eurocode 5) | PN-EN 1995-1-1:2010 (+ amendments, NA) |
| PN-EN 1995-1-2 | Timber — fire design | check current edition |
| PN-EN 338 | Strength classes | check current edition |
| PN-EN 14081-1 | Strength grading | check current edition |
| PN-EN 14592 | Dowel-type fasteners (product) | check current edition |
| PN-EN 14545 | Connectors (product) | check current edition |
| PN-EN 912 | Timber connectors — rings, toothed plates | check current edition |
| PN-EN 1992-4 | Fastenings in concrete (wall-plate anchorage) | check current edition |

An edition is recorded only where the Polish adoption is certain; the others
carry `verifyEdition: true` and the UI tells the user to check the PKN
catalogue instead of showing a guessed year. CEN is publishing the second
generation of the Eurocodes; until PKN adopts it and withdraws the current
parts, the PN-EN editions above remain in force. Storing the edition per
reference makes a future edition change explicit instead of silent.

## 3. What Eurocode 5 does and does not cover

- **Section 8 covers connections with metal fasteners**: nails (8.3),
  staples (8.4), bolts (8.5), dowels (8.6), screws (8.7), punched metal plates
  (8.8), split-ring/shear-plate connectors (8.9), toothed-plate connectors
  (8.10); spacing tables 8.2 (nails), 8.3 (staples), 8.4 (bolts), 8.5
  (dowels); multiple fasteners 8.1.2; Section 10.4 detailing.
- **Traditional carpentry joints** (zacios, czop, nakładka, jaskółczy ogon)
  are *not* given design rules in Section 8 — "national regulations apply"
  (JRC/EC dissemination slides on EN 1995-1-1 Section 8, slide 4). A
  carpentry joint is checked through member rules: compression perpendicular
  to the grain at the bearing (6.1.5) and members with notches (6.5). The
  catalogue therefore never cites Section 8 for a carpentry joint (a test
  enforces this). The former Polish timber standard PN-B-03150, which had
  rules for carpentry joints, is withdrawn and is not cited as current.

## 4. Node taxonomy (węzły)

| Node kind | Participants | Modelled today |
| --- | --- | --- |
| `wall-plate-anchorage` | murłata — wieniec | not modelled |
| `rafter-wall-plate` | K1 — murłata | seat notch (birdsmouth), geometry resolved |
| `jack-rafter-wall-plate` | J1 — murłata | seat notch |
| `hip-rafter-wall-plate` | H1 — naroże murłat | not modelled |
| `rafter-purlin` | K1 — płatew | seat notch at the support |
| `collar-tie-rafter` | jętka — K1 | lap named, placement only |
| `opening-header-rafter` | wymian — K1 | not modelled |
| `jack-rafter-hip-rafter` | J1 — H1 | `hip-face-butt` when chosen (V39) |
| `rafter-ridge` | K1 — kalenica | ridge-board butt / direct meeting resolved; half-lap named |
| `hip-rafter-ridge` | H1 — kalenica | compound cheek cut (regular hip) |
| `counter-batten-rafter` | kontrłata — K1 | per axis |
| `batten-counter-batten` | łata — kontrłata | per axis |

Node kinds are structured facts derived from member *kinds* and project
intents (ADR-007), never parsed from IDs. Counts are occurrences in the
accepted composition (an opening-split rafter is one axis).

## 5. Connection types and their references

- Carpentry: seat notch (6.1.5, 6.5), ridge-board butt, rafters direct butt,
  ridge half-lap (6.5), bridle, collar lap (6.5), hip cheek cut, jack-to-hip
  butt.
- Dowel-type: nails (8.3, Tab. 8.2), screws (8.7), bolts (8.5, Tab. 8.4),
  dowels (8.6, Tab. 8.5); all with 8.1.2, 10.4 and PN-EN 14592.
- Connectors (manufacturer-declared, PN-EN 14545 / ETA): angle bracket,
  rafter tie, joist hanger, perforated strap; punched metal plate (8.8);
  toothed-plate connector (8.10, PN-EN 912); anchor rod (PN-EN 1992-4).

## 6. Spacing rules implemented — and why only these

Implemented: **Table 8.4 (bolts)** and **Table 8.5 (dowels)**, d = 6–30 mm,
α = angle between force and grain.

| Distance | Bolts (8.4) | Dowels (8.5) |
| --- | --- | --- |
| a1 ∥ grain | (4 + \|cos α\|)d | (3 + 2\|cos α\|)d |
| a2 ⊥ grain | 4d | 3d |
| a3,t loaded end (−90°…90°) | max(7d; 80 mm) | max(7d; 80 mm) |
| a3,c unloaded end, 90°…150° and 210°…270° | max((1 + 6\|sin α\|)d; 4d) | max(a3,t\|sin α\|; 3d) |
| a3,c unloaded end, 150°…210° | 4d | 3d |
| a4,t loaded edge (0°…180°) | max((2 + 2 sin α)d; 3d) | max((2 + 2 sin α)d; 3d) |
| a4,c unloaded edge (180°…360°) | 3d | 3d |

Sources cross-checked: the bolt table on slide 14 of the JRC/EC "Eurocodes:
Background and Applications — EN 1995-1-1 Section 8" workshop (Leijten,
Brussels 2008); the bolt and dowel tables reproduced by Roymech (Timber
connections). Both agree.

**Not implemented: Table 8.2 (nails).** The independent sources disagree:
a DIN 1052:2004 table (Uibel & Blaß, CIB-W18/43-21-2, KIT 2010) differs from
the EC5 values in several rows (e.g. a3,t for d < 5 mm), and the Roymech
extraction has unreadable column headings and shows |cos α| where the
loaded-edge distance a4,t depends on sin α. Until the values are verified
against the text of PN-EN 1995-1-1, nails and screws carry their references
and the UI says the spacing is not computed. Screws follow 8.7.1 (nail rules
for d ≤ 6 mm, bolt rules above) but are usually governed by their ETA.

### Detailing envelope and row fit

Before the designer fixes the force direction (a roof member sees wind
pressure *and* suction) the layout basis is the envelope over α:
bolts M12 → a1 60, a2 48, a3 84, a4 48 mm. A single row of n fasteners across
a member of depth h fits when **2·a4 + (n − 1)·a2 ≤ h**.

Hand-checked vectors (`packages/connection-core/src/spacing.test.ts`):

- M12, α = 0°: a1 = 5·12 = 60; a2 = 48; a3,t = max(84; 80) = 84; a4,t =
  max(24; 36) = 36.
- M12, α = 90°: a1 = 48; a4,t = (2 + 2)·12 = 48.
- M12, α = 120°: a3,c = (1 + 6·0.866)·12 = 74.4; a1 = 4.5·12 = 54.
- M12, α = 180°: a3,c = 4d = 48. α = 240°: a3,c = 74.4, a4,c = 36.
- M10, α = 0°: a3,t = max(70; 80) = 80. M16: max(112; 80) = 112.
- Dowel Ø12: a1(0°) = 60, a2 = 36, a1(90°) = 36, a3,c(120°) = max(84·0.866; 36)
  = 72.7.
- Row fit: 2 × M12 in 180 mm → 2·48 + 48 = 144 ≤ 180 fits; 3 × M12 → 192 >
  180, at most 1 + ⌊(180 − 96)/48⌋ = 2.

## 7. Roof-to-roof junctions (łączenia dachów) — research only

ADR-008 places a junction above two structures, never inside a template,
and forbids inferring it from overlapping geometry. Vocabulary fixed now in
`connection-core/src/junctions.ts`, with what each changes and what it needs
before any resolver may run:

| Junction | Timber | Covering | Required inputs |
| --- | --- | --- | --- |
| Valley intersection (kosz) | valley rafter, valley jacks | valley lining | both pitches, eave heights, plan position, valley support |
| Ridge into a roof plane (T/L) | valley rafters, valley jacks, ridge | valley lining, ridge junction | as above |
| Wall abutment | ledger | abutment flashing | wall-face position, eave heights |
| Lean-to | ledger | apron + abutment flashing | wall-face position, eave heights, pitches |
| Dormer | trimmers, header, cripples, valley rafters | valley lining, cheeks, apron | dormer width, pitch, position |

Every junction changes the load path: `requiresStructuralDesign: true`.

## 8. Sources

- JRC / European Commission, *Eurocodes: Background and Applications —
  EN 1995-1-1 Section 8 Connections* (A. Leijten, Brussels, Feb 2008):
  https://eurocodes.jrc.ec.europa.eu/sites/default/files/2022-06/EN1995_5_Leijten.pdf
- Roymech, *Timber connections*: https://roymech.org/Related/Construction/Timber_connections.html
- T. Uibel, H. J. Blaß, *A new method to determine suitable spacings and
  distances for self-tapping screws*, CIB-W18/43-21-2, KIT 2010:
  https://publikationen.bibliothek.kit.edu/1000021140
- `docs/domain/TIMBER_CONNECTION_EXECUTION_RESEARCH.md` (V26C) and its
  ICC/AWC/Simpson Strong-Tie references for connection semantics.
