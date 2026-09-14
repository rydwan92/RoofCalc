# Execution Semantics Matrix

## Purpose and status

V26C research gate. This document maps current outputs to the physical and
execution facts still required before quantity or procurement may claim an
orderable result. It proposes no production schema and changes no calculation.

Status vocabulary: **MODELED** means the stated semantic is deliberately
resolved, not that the whole construction system is complete; **PARTIALLY
MODELED** means a useful geometric abstraction exists; **NOT MODELED** means no
executable result exists; **PRODUCT-SPECIFIC** requires a selected technical
system/snapshot; **RESEARCH REQUIRED** means evidence is not yet sufficient;
**REQUIRES STRUCTURAL DESIGN** is outside geometric correctness.

## Matrix

| System / member                | Physical input                                                     | Effective input                            | Overlap / joint rule                                                                                                   | Edge conditions                                                                       | Current RoofCalc output semantic                                                                          | Current status                                                       | Missing technical data                                                                               | Future owner                                                                          | Evidence |
| ------------------------------ | ------------------------------------------------------------------ | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------- |
| Interlocking / plain roof tile | Optional outside width/length; physical piece type                 | Cover width; selected gauge/course pattern | Side lock and headlap are already reflected in cover/gauge; double-lap is a different pattern                          | Eaves, ridge, verge, hip, valley, window, abutment all require separate detail        | Clipped coverage cells; `position/full/cut` are geometric classifications, not guaranteed purchase pieces | **PARTIALLY MODELED**; boundaries **NOT MODELED / PRODUCT-SPECIFIC** | Special/half tiles, minimum cuts, course terminals, fixings, offcut reuse, exposure/pitch conditions | `covering-core`; facts in catalogue snapshot; physical pieces through `quantity-core` | C1--C5   |
| Fixed modular sheet            | Total width/length and physical sheet role                         | Effective width/length; module pitch       | Side/end engagement already encoded in effective grid; any additional joint must be explicit                           | Start/end course, eaves, ridge, verge, hip/valley, opening/abutment                   | Effective coverage rectangles and geometric position counts                                               | **PARTIALLY MODELED**                                                | Start/end sheet rules, joint permissions, gross piece extents, fasteners, cut/reuse                  | `covering-core`; catalogue snapshot                                                   | C6--C8   |
| Cut-to-length profiled sheet   | Total width; manufactured sheet length/format                      | Effective width; visible slope run         | Only after a segmentation decision; no universal transverse overlap                                                    | Eaves/ridge allowances, side boundaries, hips/valleys, opening, wall, supported joint | Effective-width strips and connected geometric run lengths; no `orderLengthMm`                            | **PARTIALLY MODELED**; segmentation **NOT MODELED**                  | Production increment, max/order/handling/transport length, support and product joint detail          | `covering-core`; catalogue snapshot; exact pieces in `quantity-core`                  | C8--C10  |
| Standing seam                  | Total strip/panel width and manufactured length                    | Effective seam width; visible run          | No transverse joint on a valid continuous full-slope panel; explicit segmented joint is pitch/product/support-specific | Eaves/ridge forming, verge, hip/valley, window, wall, staggered joint                 | Effective-width columns and connected geometric runs; max violation is diagnostic only                    | Full-slope run **MODELED**; joint **NOT MODELED / PRODUCT-SPECIFIC** | Segmentation policy/location, joint type/overlap/support/stagger, forming allowances                 | `covering-core`; catalogue snapshot                                                   | C11--C13 |
| Roofing membrane               | Roll width/length and material orientation                         | None currently; net target area only       | Course/end laps and sealing are system/detail-specific                                                                 | Eaves, ridge, hip, valley, window, penetration, upstand/abutment                      | Net geometric roof-plane area (`net-geometric`)                                                           | Net area **MODELED**; gross installation **NOT MODELED**             | Product laps, orientation, boundary allowances, cut/reuse policy, roll format                        | `covering-core` installation resolver; catalogue snapshot; `quantity-core`            | C14--C16 |
| Common rafter                  | Section and physical solid; ridge-board thickness/support geometry | Not applicable                             | Explicit end connection required; current case terminates at near ridge-board face                                     | Ridge and eaves/support ends                                                          | Axis line plus K1 finished ridge-face plumb cut/minimum geometric stock extent                            | Current ridge-board case **MODELED**; alternatives **NOT MODELED**   | Connection intent, fastener/connector, blank allowance; structural acceptance                        | `timber-model` intent; `roof-math` cut; `quantity-core` blank                         | T1--T3   |
| Hip rafter H1                  | Section, physical target/support faces                             | Not applicable                             | Compound termination, backing/drop and connector are selected operations                                               | Ridge/apex, eaves/plate, intersecting jacks                                           | Regular equal-pitch centerline/face length, conceptual double-cheek cut, backing angle                    | **PARTIALLY MODELED**                                                | Final backing/drop choice, bearing/contact, hardware, blank; **REQUIRES STRUCTURAL DESIGN**          | `timber-model` + `roof-math`                                                          | T1, T4   |
| Jack rafter J1                 | Jack/H1 sections and actual H1 face                                | Not applicable                             | Butt/cheek/hanger detail must be selected; no universal face deduction                                                 | Hip end and wall/eaves support                                                        | J1 axis ends on theoretical vertical H1 center plane                                                      | **PARTIALLY MODELED**                                                | Physical hip-face deduction, finished cut datum/bevel, connector, allowance                          | `timber-model` + `roof-math`; connector snapshot when applicable                      | T4, T5   |
| Wall plate / birdsmouth        | Rafter and plate solids/face references                            | Not applicable                             | Seat/heel cuts and restraint are explicit operations, not an overlap                                                   | Plate edges, bearing location, eaves tail                                             | Seat length, rise, normal notch depth, remaining rafter depth                                             | Geometry **MODELED**; suitability **REQUIRES STRUCTURAL DESIGN**     | Bearing/notch limits, fastening/uplift restraint, approved connection, blank envelope                | `roof-math` + `timber-model`; structural process separate                             | T1--T3   |
| Roof-window framing            | Physical headers/trimmers/rafters and opening/product clearances   | Not applicable                             | Each header/trimmer end and connector must be explicit                                                                 | Proximity to eaves/ridge/hip/valley; flashing and load path                           | Bounding common rafters, two headers, split interrupted rafters; limited joinery                          | **PARTIALLY MODELED**; fabrication/structure **NOT MODELED**         | Member count/sizing, load transfer, bearing/hangers, window clearances, cuts                         | `timber-model` + `roof-math`; **REQUIRES STRUCTURAL DESIGN**                          | T1, T5   |

## Evidence registry

Covering sources:

- C1: [Wienerberger/Koramic installation guide](https://www.wienerberger.pl/content/dam/wienerberger/poland/marketing/documents-magazines/brochures/PL_MKT_DOC_KOR_instrukcja_krycia_dachu_dachowka_ceramiczna_ebook.pdf)
- C2: [Marley Sitework Guide 2024](https://www.marley.co.uk/-/media/files/fixing-instructions/marley-sitework-guide-v11-16102024-pdf.ashx?rev=98581782a5d645ef92624e7651a31b62)
- C3: [Marley Hawkins plain tile](https://cm.marley.co.uk/roof-tiles/clay-roof-tiles/hawkins-plain-tile)
- C4: [Marley Edgemere](https://www.marley.co.uk/edgemere)
- C5: [Wienerberger V11](https://www.wienerberger.pl/o-nas/biuro-prasowe/v11-wyjatkowa-dachowka-ceramiczna-zaprojektowana-przez-studio-fa-porsche.html)
- C6: [Ruukki Modular](https://www.ruukki.com/pol/dachy/produkty/pokrycia-dachowe/pokrycia-dachowe-produkty/ruukki-modular)
- C7: [Ruukki Finnera technical data](https://www.ruukki.com/docs/default-source/system-products-pdfs/global-ruukki/ruukki-finnera-en.pdf?sfvrsn=0638782048349630000)
- C8: [Pruszynski modular sheet guide](https://pruszynski.com.pl/wp-content/uploads/2022/06/Instrukcja_montazu_blachodachowek_panelowych.pdf)
- C9: [Pruszynski cut-to-length guide](https://pruszynski.com.pl/wp-content/uploads/2022/06/Instrukcja_montazu_blachodachowek.pdf)
- C10: [Pruszynski production profile, June 2026](https://pruszynski.com.pl/wp-content/uploads/2022/06/profil-produkcji_czerwiec-2026_internet.pdf)
- C11: [Ruukki Classic Pro C](https://www.ruukki.com/roofing/products/roofing-sheets/roofing-sheets-detail/ruukki-classic-pro-c)
- C12: [Ruukki Classic Design brochure](https://www.ruukki.com/docs/default-source/roofing-documents/export/ruukki_classic_design_brochure_2021.pdf?sfvrsn=7638756765022300000)
- C13: [Ruukki Classic installation guide](https://www.ruukki.com/docs/default-source/roofing-documents/latvia/ruukki_classic_mont%C4%81%C5%BEas_instrukcija.pdf?sfvrsn=26638785878206800000)
- C14: [DuPont Tyvek Supro installation sheet](https://energy-efficiency.dupont.com/assets/files/is_installation_sheet_tyvek_supro_roofs.pdf)
- C15: [DuPont roll/product installation data](https://www.dupont.com/content/dam/dupont/amer/us/en/performance-building-solutions/public/documents/en/2022_Installation_Guide_Airtightness.pdf)
- C16: [Dorken membrane guidance](https://www.doerken.com/pl/pl/o-firmie/news/aktualnosci-doerken/prawidlowe-klejenie-membrany-dachowej)

Timber sources (recognized US references, not Polish code compliance):

- T1: [ICC 2021 IRC Chapter 8](https://codes.iccsafe.org/content/IRC2021P2/chapter-8-roof-ceiling-construction)
- T2: [American Wood Council: Lumber Ridge Boards](https://awc.org/resources/wood-products/roof/lumber-ridge-boards/)
- T3: [AWC WFCM Workbook](https://web-media.awc.org/wp-content/uploads/2021/12/17210707/AWC-WFCM2018-Workbook-181128.pdf)
- T4: [Simpson Strong-Tie LSSJ installation](https://www.strongtie.com/resources/product-installers-guide/lssj-installation)
- T5: [Simpson Strong-Tie roof connection overview](https://www.strongtie.com/solutions/stronger-roof)

Detailed interpretation is in
`COVERING_INSTALLATION_SEMANTICS_RESEARCH.md` and
`TIMBER_CONNECTION_EXECUTION_RESEARCH.md`.

## Rule ownership

```text
apps/web
  captures explicit product, member, plane, connection, and detail intent
        |
catalogue facts ----------> immutable/versioned technicalSpecSnapshot
        |                              |
        +----------+-------------------+
                   v
roof-math: member geometry and exact fabrication cuts
covering-core: installed covering layout and system-specific execution rules
                   |
                   v
quantity-core: exact physical required pieces / gross installed quantities
                   |
                   v
RequiredPiece or domain-specific adapter
                   |
                   v
procurement-core: commercial stock selection, cutting, kerf, trims, remnants
                   |
                   v
future cost-core: monetary valuation
```

`catalog-core` owns immutable/versioned technical product facts. This ownership
statement does not authorize schema changes in V26C. There is no proven common
algorithm that justifies a generic
`execution-core`: covering installation and timber fabrication should remain in
their respective domains while sharing vocabulary and provenance conventions.

`procurement-core` must never guess tile overlap, panel joint type, membrane lap,
rafter connection, birdsmouth allowance, or fabrication blank. Its input is an
already accepted physical requirement.

## Multi-structure contract check

All future rules must operate on explicitly supplied stable IDs for the member,
roof plane, connection, support, product snapshot, and physical requirement.
Nothing in this model depends on parsing ID text, assuming a unique global
ridge, or deriving a relationship from array position. It therefore permits a
future house plus lower garage without requiring `StructureNode` or
`ProjectDocument V2` in this iteration.

## Recommended post-merge roadmap

### 1. Make present geometric result semantics impossible to misread

- **User problem:** coverage positions and axis lengths can look order-ready.
- **Owner:** `apps/web` terminology fed by existing `quantity-core` basis/warnings.
- **ProjectDocument/schema:** none.
- **Catalogue:** none.
- **Quantity:** no numerical change; expose/preserve semantic basis consistently.
- **Procurement:** none.
- **UI:** rename full/cut tiles/sheets to geometric positions and keep boundary
  warnings adjacent to values.
- **Regression tests:** PL/EN labels, basis-to-label mapping, no result changes.
- **Evidence:** current source audit; no manufacturer value required.

This is the safest first implementation after the other branch is merged: it
reduces practical risk without prematurely choosing an execution schema.

### 2. Introduce one product-backed covering execution vertical slice

- **User problem:** a selected tile layout is not an executable physical-piece
  list at boundaries.
- **Owner:** `covering-core`, with immutable catalogue snapshot facts.
- **ProjectDocument/schema:** versioned additive intent/snapshot migration likely;
  decide only after the merged identity architecture is known.
- **Catalogue:** source revision, applicable mode, pitches/gauges, and selected
  boundary facts for one documented product family.
- **Quantity:** new execution-piece basis; retain geometric basis separately.
- **Procurement:** adapter only after physical pieces are exact; no overlap logic.
- **UI:** product/mode selection, unresolved-boundary warnings, geometric versus
  execution totals.
- **Regression tests:** effective-dimension non-double-counting, eaves/ridge,
  opening split, half/special piece and offcut identity.
- **Evidence:** current manufacturer installation guide for the exact market and
  product revision.

### 3. Resolve explicit long-panel segmentation for one metal system

- **User problem:** overlength cut-to-length/standing-seam runs stop at a warning.
- **Owner:** `covering-core`.
- **ProjectDocument/schema:** additive installation-joint intent and versioned
  product policy; explicit joint positions.
- **Catalogue:** manufacturing range/increment, pitch limits, allowed joint,
  overlap, support and staggering rules.
- **Quantity:** output physical panel/order lengths after each joint exactly once.
- **Procurement:** consume panels; do not add joint overlap.
- **UI:** choose/adjust joint positions and show support/constraint diagnostics.
- **Regression tests:** continuous no-joint case, max-length boundary, segmented
  gross length, pitch/support failures, deterministic multi-plane identities.
- **Evidence:** exact manufacturer product/revision plus current logistics data.

### 4. Resolve membrane installation before roll procurement

- **User problem:** net m2 is not enough to buy or install rolls.
- **Owner:** `covering-core` for course/boundary installation; `quantity-core` for
  gross physical strips.
- **ProjectDocument/schema:** product snapshot and laying intent required.
- **Catalogue:** roll sizes, permitted orientation/laps, boundary/detail rules.
- **Quantity:** net area retained; gross strips/area added with provenance.
- **Procurement:** later roll cutting/reuse adapter, without a waste percentage.
- **UI:** net versus installed versus rolls; unresolved detail warnings.
- **Regression tests:** horizontal courses, end laps, ridge/hip/valley, openings,
  roll-edge reuse and anti-double-counting.
- **Evidence:** selected membrane installation system and detail set.

### 5. Add a discriminated timber connection/blank slice

- **User problem:** geometric K1/J1 lengths are not universally cut-ready or
  order-ready.
- **Owner:** `timber-model` intent and `roof-math` fabrication resolver.
- **ProjectDocument/schema:** versioned connection intent only after merge;
  preserve stable participant IDs.
- **Catalogue:** connector snapshot only for a hardware variant.
- **Quantity:** create traceable explicit blank requirements from accepted cuts.
- **Procurement:** consume indivisible blanks; retain current stock optimizer.
- **UI:** select the supported connection, show datums/cuts and structural-design
  boundary, capture machining allowance explicitly.
- **Regression tests:** current ridge-board case unchanged, alternate variant
  discriminants, finished-versus-blank trace, no double allowance, multi-roof IDs.
- **Evidence:** agreed professional detail plus applicable structural approval;
  connector guide when hardware is selected.

Costing follows only after commercial requirements are reliable. It belongs to
a future `cost-core` and must not influence geometry.
