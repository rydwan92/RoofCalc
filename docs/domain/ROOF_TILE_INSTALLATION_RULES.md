# Roof tile installation rules - targeted V34A evidence

Reviewed 2026-09-15. Scope: regular courses, boundary references, declared pitch.
No structural sizing, waterproofing-system selection or universal edge constant.

Primary evidence: [Koramic installation manual](https://www.wienerberger.pl/content/dam/wienerberger/poland/marketing/documents-magazines/brochures/PL_MKT_DOC_KOR_instrukcja_krycia_dachu_dachowka_ceramiczna_ebook.pdf),
printed pp. 62-63, 72-76; [Braas ceramic installation manual](https://store.bmigroup.com/medias/BMI-Braas-Instrukcja-Montazu-Dachowka-ceramiczna-2023-01.pdf),
2023/01, sections on roof measurement and product details. Braas search extract
was available; its PDF could not be opened by the browser reader. No new numeric
technical field depends on that extract.

| Rule | Source / scope | Semantics | Can Auto? | Required inputs |
| --- | --- | --- | --- | --- |
| Regular span divided into whole intervals must fit permitted gauge | Koramic pp. 62-63, interlocking tile model/mode | HARD range; RECOMMENDATION target | Yes | Exact project span, selected permitted range |
| Range midpoint is a deterministic target, not a manufacturer recommendation | V33 algorithm; Koramic table shows product-specific average gauges | RECOMMENDATION | Yes, labeled fallback | Permitted range; future verified preferred value |
| First regular axis must use an explicit slope reference | Koramic p. 76, eave detail and gutter/overhang dependencies | INFORMATION; HARD geometric bounds | Project value only | Known project offset; product edge detail remains manual |
| Last regular axis is distinct from ridge-batten height | Koramic pp. 74-75, product/pitch-dependent ridge detail | INFORMATION; HARD geometric bounds | Project value only | Known project offset; roof pitch and accessory detail for future automation |
| Declared minimum pitch applies to the selected technical mode | Koramic pp. 59, 81, product/pattern/underlay conditions; existing snapshot contract | HARD if declared; missing means unknown | Validate only | Project pitch and selected mode's declared minimum; declared additional condition stays unverified |

Koramic p. 72 determines coverage from sampled tiles on site. Do not derive gauge
from physical tile length, pieces/m2 or a typical installation number. V34A does
not prove physical-width/effective-width invariants for every supported pattern;
suspicious relationships produce a consistency advisory only.

Hand check: span 7130 mm, range 330-360 mm => 20-21 intervals. Midpoint target
345 mm chooses 21: actual 339.5238095 mm, 22 regular axes, exact final reference.
This is regular-course evidence, not a complete eave/ridge installation plan.
