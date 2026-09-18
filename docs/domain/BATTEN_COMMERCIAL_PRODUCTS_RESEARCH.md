# Batten-sized commercial timber — Polish market research (V49)

Scope: which real, currently offered products may be seeded as catalogue
stock for tile battens and counter-battens, which facts each source actually
states, and which prices meet the evidence rule of `pricing-core` (a **net**
amount, never a guessed one).

Retrieved **2026-09-18** from the live pages below. Prices are snapshots, not
timeless facts. Joining rules live in
`docs/domain/BATTEN_STOCK_AND_JOINING_RESEARCH.md`.

## 1. Rules applied

1. Only the original retailer or manufacturer page counts. Search-engine
   summaries were used to *find* pages, never as evidence.
2. A fact the page does not state is not recorded — not inferred from the
   section, the name or a sister product.
3. `declaredApplications` records what the source **markets** the product for.
   It is never a statement that the section is structurally adequate.
4. A price is imported only when the page states its tax basis. `pricing-core`
   stores net amounts, and a Polish retail price with no stated basis is not
   assumed to include 23 % VAT (the V35 rule, kept unchanged).

## 2. Imported products

Batch: `apps/api/src/data/import-batches/timber-linear-stock-2026-09.json`.

| Product | Source | Facts stated by the page | Declared use (page wording) | Classification |
| --- | --- | --- | --- | --- |
| Łata Complex suszona impregnowana 40×60×3000 | [Castorama 5063022666635](https://www.castorama.pl/lata-complex-suszona-impregnowana-40x60x3000-mm/5063022666635_CAPL.prd) | pine, C18, kiln-dried, moisture 14–28 %, pressure treatment use class 3; brand Kingfisher International Products B.V.; planing not stated | "konstrukcje lekkich budynków, altan, pergoli i dachów" | `batten` |
| Łata Complex suszona impregnowana 40×60×4000 | [Castorama 5063022667878](https://www.castorama.pl/lata-complex-suszona-impregnowana-40x60x4000-mm/5063022667878_CAPL.prd) | as above | as above | `batten` |
| Tarcica iglasta, łata konstrukcyjna 40×60×4000 | [BAT TAR-6040-IMP-4000](https://bat.pl/Tarcica-iglasta-lata-konstrukcyjna-40-x-60-mm/TAR-6040-IMP-4000) | softwood, pressure impregnated, EAN 2800001801792; grade, drying and planing not stated | "konstrukcja ścian, stropów, tworzenie więźby dachowej" | `batten`, `structural-framing` |
| Tarcica impregnowana ciśnieniowo 25×50×4000 | [BAT TAR-2550-IMP-4000](https://bat.pl/Tarcica-impregnowana-cisnieniowo-25x50mm-4m/TAR-2550-IMP-4000) | pressure impregnated, EAN 2800001801815; species, grade and drying not stated | "altany, pergole, ogrodzenia oraz inne projekty ogrodowe" | `general` |

The 40×60 products are named *łata* by their sources and marketed for roof
construction, which is what `batten` records. **No** product is classified
`counter-batten`: no verifiable source markets one as such (§4).

The 25×50 is the case §25 of the V49 prompt warned about. Its section matches
a common counter-batten, but its source markets it for garden projects only,
so it is `general` and the counter-batten picker never offers it.

Manufacturers: Castorama names the brand owner (Kingfisher, "Complex"); BAT
names no mill, so the product is attributed to an explicit placeholder,
"Producent niepodany (oferta BAT)", in the same spirit as the V35
"Generic sawn timber" entry.

## 3. Prices

Batch: `apps/api/src/data/import-batches/timber-linear-prices-2026-09-18.json`.

| Variant | Page price | Tax basis on the page | Net stored |
| --- | --- | --- | --- |
| BAT łata 40×60×4000 | 20,48 zł / szt. | "Cena zawiera VAT 23%" | 16,65 zł (`round(2048 / 1.23)` = 1665) |
| BAT tarcica 25×50×4000 | 11,06 zł / szt. | VAT 23 % included (page) | 8,99 zł (899) |

**Intentionally omitted:** Castorama 40×60×3000 (28,98 zł / szt.) and
40×60×4000 (34,18 zł / szt.). Neither page states whether the amount is
gross, net or at which rate. Deriving a net from them would be the invented
price the prompt forbids. The products are still importable and plannable;
they simply carry no price, and the estimate asks the user for one.

## 4. Not imported, and why

| Lead | Result |
| --- | --- |
| Leroy Merlin 40×50×4000 (A069), 25×50×4000 | page returned HTTP 403 — not verifiable |
| SIG "Łata drewniana PREFIX 40/60/4000", "Kontrłata impregnowana 25/50/4,0" | page returned HTTP 403 — not verifiable (and SIG would have been the one source to name a *kontrłata* explicitly) |
| BAT "Tarcica impregnowana kontłata 25×50×4000" (451141200) | page returned HTTP 404 — not verifiable |
| Castorama 40×50 / 25×50 | not needed for this batch; can be added the same way |

A counter-batten product should be added the moment a reachable source
markets one as *kontrłata*. Until then counter-battens are planned from
manual lengths, which works fully without the catalogue.

## 5. Availability

Every page shows *availability*, none shows a *quantity*. No stock quantity
is imported, and the planner treats every catalogue length as unlimited while
the UI states "Dostępność ilościowa nieznana."

## Sources

- [Castorama — Łata Complex 40×60×3000](https://www.castorama.pl/lata-complex-suszona-impregnowana-40x60x3000-mm/5063022666635_CAPL.prd)
- [Castorama — Łata Complex 40×60×4000](https://www.castorama.pl/lata-complex-suszona-impregnowana-40x60x4000-mm/5063022667878_CAPL.prd)
- [BAT — łata konstrukcyjna 40×60×4000](https://bat.pl/Tarcica-iglasta-lata-konstrukcyjna-40-x-60-mm/TAR-6040-IMP-4000)
- [BAT — tarcica impregnowana 25×50×4000](https://bat.pl/Tarcica-impregnowana-cisnieniowo-25x50mm-4m/TAR-2550-IMP-4000)
