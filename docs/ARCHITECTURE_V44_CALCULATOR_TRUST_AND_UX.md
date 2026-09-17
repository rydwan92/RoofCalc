# V44 — Calculator trust and UX hardening

Status: IMPLEMENTED. A hardening iteration: no new domain module, no schema
change, no new solver. Everything below either verifies existing solvers
independently or presents their facts more clearly.

## 1. Calculator audit

Independent checks (`packages/roof-math/src/calculator-oracles.test.ts`):

| Check | Relation | Result |
| --- | --- | --- |
| K1 top edge | `(run − ridge/2 + eave) / cos θ` | exact to 1e-6 mm |
| K1 geometric length | top edge + `depth · tan θ` | exact |
| K1 ridge cut | `90° − pitch` | exact |
| Quick K1 vs Creator K1 | same template → identical `minimumStockLengthMm`, `referenceLengthMm` | identical |
| H1 | plan `r·√2`, `tan(hip) = tan θ / √2`, 3D hypotenuse incl. eave | exact |
| Gable / regular hip area | `2L(r+e)/cos θ`, `(L+2e)(2r+2e)/cos θ` | exact |
| Metamorphic | run↑, pitch↑, eave↑ never shorten K1; overlap↑ never shrinks membrane gross; gross ≥ net; smaller max gauge never fewer courses | pass |
| Symmetry | left/right K1, left/right & front/rear J1, battens, counter-battens, hip plane areas | equal |

Procurement already had seeded invariant tests (`optimizer-hardening.test.ts`,
stock ≥ requirement) and was not duplicated. V43B's batten area invariant
remains in `batten-layout-audit.test.ts`.

No numerical solver defect was found. Quick and Creator K1 are the same
resolver; their *labels* differed ("Minimalna długość geometryczna" vs
"Dokładna długość"), so the shared K1 label is now **Długość krokwi
(geometryczna)** everywhere.

Reference acceptance numbers (`fixtures/projects/reference-projects.test.ts`)
lock roof area, K1 length, H1 length, K1/J1 counts, batten and counter-batten
totals for fixtures 01, 02, 04, 05, 09 and 10 at display precision. A change
must be a deliberate domain change.

## 2. Defects fixed

- **Display precision:** cm lengths printed to 0.01 cm (`34,96 cm`); now 0.1 cm.
  mm keeps 0.1 mm for small cuts; shared `formatAngle` (0.1°), `formatMetres`
  (0.1 m), `formatSquareMetres` (0.1 m²). Inputs still show the exact canonical
  value (UX contract §5).
- **Float noise becoming intent:** Auto → Manual seeded the batten gauge as
  `349.5657…`; the seed is now a tape-measurable 0.1 mm value.
- **Silent rounding on blur:** a draft length field committed its unchanged text
  on blur; it now commits only when the text changed.
- **Quick H1 subtitle** read "Kopertowy · Szkielet"; it names H1/K1.
- **Unstyled controls:** Materials and Cost buttons/selects rendered with
  user-agent styles; they now share the workbench control height, font and
  hierarchy. `select`/`textarea` inherit the app font.
- **Stacked context header:** the breadcrumb was a third bordered card repeating
  perspective and task ("Kosztorys › Kosztorys"); on desktop it is a quiet
  caption unless it carries an instance navigator or opening facts.
- **Performance:** finished-K1 3D solids were resolved on every 2D geometry edit
  even with 3D closed; they now resolve only while the 3D viewport is open.

Input guards (negative, zero, out-of-range pitch, non-numeric, overflow) were
verified next to the field with no project mutation and no NaN/Infinity in
results (`input-guards.test.tsx`); no defect was found.

## 3. Quick

`QuickResults.tsx`: one dominant answer (K1 length / H1 length), secondary
facts that highlight their part of the drawing on hover/focus (ridge cut,
birdsmouth, eave, length) with a halo marker, and a reusable
`CalculationEvidence` ("Jak policzono?") restating the verified relation from
resolved values. Highlight is transient component state — never history.
Hero chrome is compact and the drawing is larger (responsive height).

## 4. Shared vocabulary

- **Source:** `SourceBadge` — AUTO / RĘCZNIE / KATALOG / Z PROJEKTU — used by
  the batten owner badges and the covering product card; Material Plan already
  used KATALOG / RĘCZNIE.
- **Status:** covering and installation statuses read Gotowe / Częściowo
  policzone / Wymaga decyzji / Wymaga danych / Niezgodne / Niedostępne.
- **Geometry kind:** `GeometryKindBadge` marks H1 as *geometria referencyjna*
  and J1 as referencyjna or *wykonawcza* from the resolver's
  `executionStatus`, with a one-line explanation that reference is not an error.
- **Build-up figures:** batten and counter-batten values carry their meaning
  (ROZSTAW RZECZYWISTY, DŁUGOŚĆ GEOMETRYCZNA).
- **Cost empty state:** titled with a primary "Dodaj pozycję" action.

## 5. Browser QA

Playwright screenshots of Quick K1/H1 (incl. highlight), Creator gable/hip 2D,
hip 3D, covering technical/visual, installation plan, Materials and Cost at
1440×900 (plus 1920/1024 for construction and a 390×844 Quick smoke). The
embedded browser pane was not usable (zero-width hidden pane).

## Limitations / next

- Cut preview drawings (birdsmouth, ridge) were not redesigned: framing and
  grid prominence still need a dedicated pass.
- Membrane strip visualisation was not added: the solver exposes per-plane
  course counts but no per-course polygons.
- 2D selected-member dimensions in the roof view and tile glyph quality were
  audited only by screenshot; no change.
