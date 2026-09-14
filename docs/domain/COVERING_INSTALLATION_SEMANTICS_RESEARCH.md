# Covering Installation Semantics Research

## Status

Research and architecture note for V26C. It does not change a covering layout,
quantity, catalogue schema, or purchase calculation. Manufacturer values below
are examples tied to the cited product and document revision, not universal
defaults.

## Canonical vocabulary

| Term                        | Meaning                                                                                                                          |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Physical dimension          | Outside manufactured dimension of one product. It describes the object, not the roof area newly covered by it.                   |
| Effective (cover) dimension | New roof width or length contributed by a correctly installed repeating unit under stated conditions.                            |
| Installation engagement     | Interlock, seam, hook, or other product-specific engagement between adjacent units.                                              |
| Installation overlap        | Shared physical region of adjacent units. It exists only when the selected system/detail has it.                                 |
| Installation joint          | Explicit relationship between two physical pieces, including its location, support, fastening, overlap, and applicability rules. |
| Net target geometry         | Roof plane area or run before execution allowances and product rules.                                                            |
| Gross installed requirement | Physical material needed after resolving the selected installation pattern, joints, boundaries, and reusable cuts.               |
| Purchase requirement        | Commercial sheets, panels, tiles, packs, or rolls that must be ordered after product and supply constraints.                     |

An interlock or seam is not necessarily well represented by one numeric
`overlapMm`. A joint is a discriminated rule with direction, participants,
conditions, and reference geometry.

## Anti-double-counting invariant

For a repeating direction, a manufacturer's effective dimension is commonly
the pitch of installed units. Conceptually:

```text
effective pitch = position(next unit) - position(current unit)
physical extent = effective pitch + engaged/shared extent
```

The second line is descriptive, not a universal subtraction formula: profiles,
locks, seams, and adjustable tile headlaps do not all reduce to the same scalar.
If the layout advances by `coverWidthMm`, `gaugeMm`, `effectiveWidthMm`, or
`effectiveLengthMm`, the corresponding engagement/overlap is already reflected
in that advance. Subtracting it again makes the layout too dense. An explicit
overlap is added to physical order lengths only when a resolved joint consumes
additional material and that consumption has not already been included in the
input length.

Architectural invariant: each engagement, overlap, trim, and allowance has one
owner and is represented exactly once from installation design through
procurement.

The current semantic audit is based on `packages/covering-core/src/index.ts`,
`tile-layout.ts`, `modular-sheet-layout.ts`, `variable-panel-layout.ts`,
`cut-to-length-sheet-layout.ts`, and `standing-seam-layout.ts`, plus the
covering/surface bridges in `packages/quantity-core/src/index.ts` and their
presentation in `apps/web/src/assembly/MaterialSchedule.tsx`.

## Roof tile

### Evidence and semantics

- Interlocking tiles publish outside dimensions separately from cover width and
  permitted batten gauge. For example, Koramic Alegra 8 data distinguish a
  478 x 336 mm physical tile, 285 mm cover width, and 370--400 mm cover length.
  The cover dimensions are installed pitches and already reflect the side lock
  and headlap relationship.
- BMI Celtycka similarly distinguishes 330 x 420 mm physical dimensions from
  about 300 mm cover width and a 312--345 mm gauge.
- Plain/double-lap tile is materially different. Marley Hawkins publishes
  265 x 165 mm physical size, 65 mm headlap, 100 mm maximum gauge, and 60
  tiles/m2. Double-lap, the eaves double course, and tile-and-a-half details
  show why a generic interlocking-tile rule is unsafe.
- Gauge and headlap can be conditional. Marley Edgemere publishes different
  headlaps and quantities for installation conditions. Eaves, ridge, verge,
  hip, valley, and penetrations use detail-specific rules rather than the
  repeating interior cell alone.

### Current RoofCalc mapping

- `physicalWidthMm` and `physicalLengthMm` are optional product facts. The
  layout does not use them as installed spacing.
- `coverWidthMm` is the U-direction installed pitch. It therefore already
  includes the lateral interlock/engagement relationship.
- A selected value from `gaugeRangeMm` is the V-direction batten/course pitch.
  It is installed vertical coverage, not physical tile length.
- A rendered `TilePosition` polygon/rectangle is a clipped **coverage cell**.
  It is not the physical tile footprint.
- `position`, `full`, and `cut` currently classify geometric coverage
  positions. They are not proven purchase units. One ordinary uninterrupted
  position often maps to one standard tile, but the equivalence breaks at a
  split opening, reused offcut, half/tile-and-a-half bond, verge, eaves, ridge,
  hip, valley, proprietary accessory, or other special detail.
- The existing pattern/layer model can describe course offsets and multi-layer
  visual patterns, but it does not resolve all physical pieces or special
  units required by those patterns.

### Boundary audit

| Boundary      | Repeating interior rule valid?                                                                 | Status                         |
| ------------- | ---------------------------------------------------------------------------------------------- | ------------------------------ |
| Eaves         | No; first batten, overhang, under/eaves course, and drainage detail are system-specific.       | PRODUCT-SPECIFIC / NOT MODELED |
| Ridge         | No; last batten and ridge closure/ventilation/detail are separate.                             | PRODUCT-SPECIFIC / NOT MODELED |
| Verge         | Not necessarily; cut-width limits, half tiles, cloaked verges, or verge accessories may apply. | PRODUCT-SPECIFIC / NOT MODELED |
| Hip/valley    | No; diagonal cuts, minimum retained widths, special tiles, clipping, and offcut policy apply.  | PRODUCT-SPECIFIC / NOT MODELED |
| Roof window   | No; flashing system, clearance, cuts, and course coordination apply.                           | PRODUCT-SPECIFIC / NOT MODELED |
| Wall abutment | No; flashing, clearance, and terminal tile rules apply.                                        | PRODUCT-SPECIFIC / NOT MODELED |

### Safe future direction

Keep physical facts, installed pitches, course-pattern facts, and boundary
detail rules separate. A future execution resolver may turn coverage cells into
explicit physical-piece requirements, with piece type and cut/reuse identity.
Until then the current count must remain labelled geometric. Do not derive
headlap as `physicalLengthMm - gaugeMm` unless the product documentation defines
that relationship for the selected mode and conditions.

## Fixed modular metal sheet

### Evidence and semantics

Ruukki Modular publishes 1200/1145 mm total/effective width and 725/700 mm
total/effective length, with a 350 mm module. Ruukki Finnera publishes
1190/1140 mm total/effective width and 705/660 mm total/effective length, with a
330 mm step. The differences are physical material consumed by the product's
side/end engagement and edge formation; they must not be deducted again from
effective grid spacing. Current Pruszyński installation data also show that
profile, start/end sheet, fastening, and lengthwise joining details vary by
product.

### Current RoofCalc mapping

The fixed-sheet grid advances by `effectiveWidthMm` and fixed
`effectiveLengthMm`; `totalWidthMm` and `totalLengthMm` are evidence-only
physical facts. `moduleLengthMm` is compared with the batten spacing. Rendered
rectangles are coverage cells, not gross sheet extents. `totalPositions`,
`fullPositions`, and `cutPositions` are geometric positions. A split cell at an
opening is explicitly not proof that one purchased sheet supplies all
fragments. Waste, reuse, special start/end sheets, accessories, fastening, and
edge details are absent.

### Safe future direction

Resolve an installation pattern first, including product-specific sheet roles
and any permitted transverse joint. Only then derive physical sheets and their
gross dimensions. Do not apply an additional side or end lap to a fixed grid
already based on effective dimensions.

All eave, ridge, verge, hip, valley, roof-window, and wall-abutment conditions
remain PRODUCT-SPECIFIC and NOT MODELED as execution details.

## Cut-to-length profiled sheet

### Evidence and semantics

Manufacturer documentation distinguishes total/effective width, profile/module
pitch, available production format, and rules for joining sheets along the
slope. Some Pruszyński profiles document a product-specific longitudinal join
whose physical consumed length is assembled from two detailed regions; this is
evidence that a joint belongs to the selected profile/detail, not a universal
metal-roofing constant. Exact production increments, practical handling limit,
transport limit, support location, and current maximum order length are
PRODUCT-SPECIFIC; where no current datasheet is attached they remain UNKNOWN.

### Current RoofCalc mapping

- U strips use `effectiveWidthMm`, so the side engagement is already encoded.
- `geometricLengthMm` is the visible V extent of a connected roof-plane region.
  It is neither a confirmed manufactured length nor an order length.
- `orderLengthMm` is intentionally unresolved.
- A run over `maxPanelLengthMm` receives `segmentation-required`, but remains one
  run. No joint position, support, water-flow detail, overlap, or resulting
  physical sheet lengths are calculated.
- An opening may split a strip into multiple geometric run candidates. That
  does not infer flashing or a manufacturable cutting plan.

An overlap belongs in layout/execution geometry only after segmentation selects
an actual joint and establishes the installed extents of both sheets. The
derived gross sheet/order lengths then cross the quantity boundary. Procurement
must not add a guessed overlap to the geometric run.

## Standing seam

### Evidence and semantics

Ruukki Classic documentation publishes effective and total widths, panel length
ranges, minimum pitches, and conditional transverse-joint details. One current
Classic Pro example gives 510/540 mm effective/total width, 1200--8000 mm panel
length, an 8 degree minimum pitch, and stricter pitch/overlap rules when a
longitudinal extension is present. Another Classic installation revision
recommends one full-slope sheet where possible, and only introduces a staggered,
batten-supported extension joint for a slope beyond the permitted sheet length.
The documented overlap and maximum length differ between product revisions,
proving they are snapshot facts rather than global constants.

### Current RoofCalc mapping

- Columns advance by effective width; seam engagement is already encoded.
- A connected eave-to-ridge region becomes one geometric panel run. A continuous
  valid full-slope run therefore correctly contains no transverse joint.
- Min/max panel length is checked. Exceeding the maximum produces
  `transverse-joint-required`, but no segmentation or physical panels.
- `transverseOverlap` can exist in the technical snapshot but is not consumed by
  the layout. It is currently evidence-only, not an installed quantity.
- Openings split visible components, without resolving roof-window flashing or
  the fabrication/detail around the interruption.

Future segmentation must be an explicit installation decision with joint type,
location, pitch applicability, support, staggering, and physical/order lengths.
It must never add a transverse overlap to an uninterrupted full-slope panel.

## Roofing membrane

### Evidence and semantics

DuPont's Tyvek Supro installation sheet shows a representative system installed
horizontally, parallel to the eaves, with 150 mm course laps, explicit eaves and
ridge treatment, 300 mm hip coverage on each side, a 600 mm valley strip, and
sealed penetrations/laps. These values are specific to that documented system.
Roll width and length are commercial facts; representative Tyvek data list
multiple widths and a 50 m roll length. Dorken guidance likewise treats laps
and penetrations as installation details rather than a percentage uplift.

### Current RoofCalc mapping

`MembraneLayerSpec` identifies enabled planes only. `quantity-core` sums net
geometric plane area with basis `net-geometric`. It does not model course
orientation, side/end laps, eaves, ridge, hips, valleys, wall upstands, roof
windows, cuts, reuse, roll widths, or roll lengths. Therefore:

```text
net roof area != gross installed membrane requirement != commercial roll requirement
```

A generic waste percentage is not a substitute. A future membrane installation
resolver needs a selected product/system snapshot, laying orientation, lap and
boundary rules, then an explicit cutting/reuse policy before roll procurement.

## Product snapshot candidates

Existing saved projects must remain reproducible without live catalogue access.
Evidence-backed facts that may eventually belong to a versioned
`CoveringTechnicalSpec` and its immutable `technicalSpecSnapshot` include:

- physical and effective dimension roles, with mode and provenance;
- permitted gauge/course pattern and pitch/exposure conditions;
- product format, module pitch, production length range and increment;
- allowed segmentation/joint types and their conditional overlap/support rules;
- system-specific eaves, ridge, verge, hip, valley, opening, and abutment rules;
- membrane roll dimensions, permitted orientations, laps, and boundary details;
- source document identity, revision/date, market, and applicability notes.

These are candidate facts, not a proposed final schema. A product snapshot must
not embed project-specific joint locations or user installation intent.

## Current gap map

### Currently correct

- Effective widths/gauges drive the repeating layout without a second overlap
  deduction.
- A standing-seam full-slope geometric run can exist without a transverse joint.
- Current results and warnings generally identify geometric rather than purchase
  quantities.

### Currently approximate

- Tile and fixed-sheet `position` counts are coverage abstractions that often,
  but not always, correspond to physical units.
- Opening-clipped run/position geometry identifies affected regions but not
  executable flashing, cutting, or reuse.

### Currently missing

- Physical footprints in layout, special pieces, execution piece identity,
  offcut reuse, edge details, joint placement, gross membrane layout, and
  commercial covering requirements.

### Must not be implemented generically

- One `overlapMm` for all coverings; automatic overlap on every panel; one waste
  percentage; physical-minus-effective inference without product evidence; or
  interior-repeat rules reused unchanged at every roof boundary.

## UI terminology recommendations

Keep `Zapotrzebowanie geometryczne` for coverage cells/runs/net area,
`Zapotrzebowanie wykonawcze` for resolved physical installed pieces,
`Plan rozkroju` for cuts from commercial material, `Plan zakupu` for selected
commercial units, and `Ilość handlowa` for packs/rolls/units to order.

Current boundary notes are good, but labels such as `Pełne arkusze`, `Docinane
arkusze`, `Dachówki`, a bare `Liczba sztuk`, and exact-looking run counts can be
misread when separated from the note. Until execution resolution exists, prefer
`pełne/docinane pozycje pokrycia`, `pozycje geometryczne`, and `odcinki
geometryczne`; never present them as an order quantity.

## Official sources

- [Wienerberger/Koramic ceramic roof tile installation guide](https://www.wienerberger.pl/content/dam/wienerberger/poland/marketing/documents-magazines/brochures/PL_MKT_DOC_KOR_instrukcja_krycia_dachu_dachowka_ceramiczna_ebook.pdf)
- [Marley 2024 Sitework Guide](https://www.marley.co.uk/-/media/files/fixing-instructions/marley-sitework-guide-v11-16102024-pdf.ashx?rev=98581782a5d645ef92624e7651a31b62)
- [Marley Hawkins plain tile](https://cm.marley.co.uk/roof-tiles/clay-roof-tiles/hawkins-plain-tile)
- [Marley Edgemere technical page](https://www.marley.co.uk/edgemere)
- [Wienerberger V11 product data](https://www.wienerberger.pl/o-nas/biuro-prasowe/v11-wyjatkowa-dachowka-ceramiczna-zaprojektowana-przez-studio-fa-porsche.html)
- [Ruukki Modular product data](https://www.ruukki.com/pol/dachy/produkty/pokrycia-dachowe/pokrycia-dachowe-produkty/ruukki-modular)
- [Ruukki Finnera technical data](https://www.ruukki.com/docs/default-source/system-products-pdfs/global-ruukki/ruukki-finnera-en.pdf?sfvrsn=0638782048349630000)
- [Pruszynski modular sheet installation guide](https://pruszynski.com.pl/wp-content/uploads/2022/06/Instrukcja_montazu_blachodachowek_panelowych.pdf)
- [Pruszynski cut-to-length sheet installation guide](https://pruszynski.com.pl/wp-content/uploads/2022/06/Instrukcja_montazu_blachodachowek.pdf)
- [Pruszynski production profile, June 2026](https://pruszynski.com.pl/wp-content/uploads/2022/06/profil-produkcji_czerwiec-2026_internet.pdf)
- [Ruukki Classic Pro C product data](https://www.ruukki.com/roofing/products/roofing-sheets/roofing-sheets-detail/ruukki-classic-pro-c)
- [Ruukki Classic Design brochure](https://www.ruukki.com/docs/default-source/roofing-documents/export/ruukki_classic_design_brochure_2021.pdf?sfvrsn=7638756765022300000)
- [Ruukki Classic installation guide](https://www.ruukki.com/docs/default-source/roofing-documents/latvia/ruukki_classic_mont%C4%81%C5%BEas_instrukcija.pdf?sfvrsn=26638785878206800000)
- [DuPont Tyvek Supro roof installation sheet](https://energy-efficiency.dupont.com/assets/files/is_installation_sheet_tyvek_supro_roofs.pdf)
- [DuPont airtightness installation guide and roll data](https://www.dupont.com/content/dam/dupont/amer/us/en/performance-building-solutions/public/documents/en/2022_Installation_Guide_Airtightness.pdf)
- [Dorken membrane installation guidance](https://www.doerken.com/pl/pl/o-firmie/news/aktualnosci-doerken/prawidlowe-klejenie-membrany-dachowej)
