# Roof tile edge placement — targeted V37 evidence

Reviewed 2026-09-15. Question: should the last roof tile visibly extend past the
roof outline, and can RoofCalc draw a physical tile body beyond the plane edge?

## Evidence

| Topic | Source | Finding | Universal? |
| --- | --- | --- | --- |
| Eave projection | [Koramic manual](https://www.wienerberger.pl/content/dam/wienerberger/poland/marketing/documents-magazines/brochures/PL_MKT_DOC_KOR_instrukcja_krycia_dachu_dachowka_ceramiczna_ebook.pdf), printed p.76, §5.6 | Eave projection ("WO") is 3.0–8.0 cm and is stated to be variable, dependent on slope length and gutter size. First batten distance ("ŁO") is a separate detail value. | No — range, depends on slope and gutter |
| Eave element type | Koramic printed p.34, §4.8 | Eave elements may discharge directly into the gutter (projected) or end at the structure edge, in which case a separate drip/gutter strip (pas nadrynnowy) is required; snow load or low pitch can force it. | No — two different details |
| Eave tile into gutter | BMI Braas concrete tile manual (search extract only; PDF could not be parsed here) | Eave tile enters the gutter between 1/4 and 1/2 of its width. | No — a range tied to gutter width; unverified here |
| Verge | Koramic printed p.35, §4.9 (plain tile system) | Verges are recommended with special verge tiles; at an external wall battens extend at least 20 mm past the render edge and the verge tile keeps at least 10 mm from the wall/timber edge. 3/4 and 5/4 tiles are used in the plain-tile pattern. | No — system/accessory specific |
| Physical vs effective size | [swissporTON KODA](https://www.swissporton.pl/produkty/koda) | Physical 304 × 503 mm; effective cover width 258–261 mm; gauge 390–430 mm. Physical width exceeds cover width by the interlock; physical length exceeds gauge by the head lap. | Product-specific numbers |
| Gauge from samples | Koramic printed p.72 (V34A note) | Coverage is determined from sampled tiles on site, not from nominal physical length. | Method, not a constant |

## Decision

1. **No universal edge constant.** Eave projection depends on gutter size,
   slope length, eave accessory and detail type; verge placement depends on
   the verge accessory (left/right verge tile, cloaked verge, mortar) and the
   wall/barge detail. A `lastTileOverhang` number would be invented.
2. **Current geometry stays effective coverage.** `TilePosition` carries the
   nominal effective coverage cell; `visibleFragments` are that cell clipped to
   the roof plane polygon. This is not a physical tile body.
3. **What V37 represents** (presentation only, no quantity change):
   - roof plane / covering boundary,
   - nominal effective coverage cell (shown as a dashed ghost for edge-cut
     positions, including the part outside the plane),
   - visible effective coverage (the clipped fragment — the counted truth),
   - physical tile body: **not modelled**. The UI says so explicitly:
     "Detal fizycznego wysunięcia dachówki poza krawędź nie jest modelowany."
4. **Future rule shape.** A real rule needs explicit inputs: eave detail kind
   (into gutter / at structure edge), gutter size or declared projection,
   verge accessory per side with its declared cover width, and a product
   revision reference. Only then may a physical overhang be drawn, and it must
   remain separate from effective coverage quantities.

No hand-checked numeric vector is added because no rule is implemented.
