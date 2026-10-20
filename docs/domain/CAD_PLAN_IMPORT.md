# CAD plan import (DXF) — VNext-4

## Purpose

Most designers can export a plan as DXF (AutoCAD, BricsCAD, ArchiCAD,
Revit, many free viewers). Reading the geometry of that plan is faster and
more exact than measuring a PDF, and it is the most common exchange format
between an architect's office and a carpenter. VNext-4 reads it into the
existing project start; it never creates roof geometry of its own.

## Pipeline

```text
file ── classifyProjectFile (bytes, never the name) ──► dxf
     ── readDxf (ASCII DXF → 2D model-space pieces)     packages/bim-import-core/src/dxf.ts
     ── analyzeCadRoofPlan (outline, eave, roof lines,  packages/bim-import-core/src/cad-plan.ts
        pitch texts, dimensions) → proposal + evidence
     ── CadImportWorkspace (preview, questions, review)  apps/web/src/bim/cad/
     ── createProjectStartTemplate → createRoofProjectDocument (existing path)
```

## What is read

- `$INSUNITS` (mm, cm, dm, m, in, ft). Missing or unitless: the unit that
  makes the longest outline a plausible building (4–60 m) is proposed and
  flagged; when no unit fits, the user is asked.
- `LINE`, `LWPOLYLINE` (closed flag, bulges read as straight with a
  warning), `POLYLINE`/`VERTEX`/`SEQEND` (2D only), `TEXT`, `MTEXT`
  (formatting and `%%d`/`\U+` codes cleaned), `DIMENSION` (measured value),
  `INSERT` of blocks (base point, scale, rotation; at most 3 levels).
- Paper-space entities (code 67 = 1: sheet frames, title blocks) are skipped.
- Arcs, circles, splines, 3D polylines and meshes are skipped with a warning.

## Recognition rules

| Fact | Rule | Evidence code |
| --- | --- | --- |
| Outline | Closed loop with four right angles (from a polyline or chained lines; collinear vertices dropped); any rotation | — |
| Which outline | Outlines holding roof lines first, then by area; the user can pick another | `several-outlines` warning when others exist |
| Walls + eave | Two parallel, concentric outlines with an even offset on all four sides (≤ 2 m) → inner = walls, offset = horizontal overhang | `nested-outlines` |
| Single outline | The user says whether it is the walls or the eave edge; eave edge → walls = outline − 2 × overhang | `single-outline-meaning` warning |
| Gable | A centre line along the long axis spanning ≥ 90 % of the length | `ridge-full-length` |
| Gable on a deep plan (VNext-5) | A centre line across the long axis spanning ≥ 90 % of the short side → the building length (along the ridge) is the short side, the width the long side | `ridge-full-length`, `ridge-across-short-side` (informs), `ridgeAlongShortSide` |
| Hip | ≥ 3 lines at 45° (± 6°) from outline corners | `hip-diagonals`; `hip-geometry-consistent` when the ridge equals L − W |
| Roof type text | "kopertowy", "czterospadowy", "namiotowy", "hip" / "dwuspadowy", "siodłowy", "gable" — only when the lines decided nothing | `roof-type-text` |
| Pitch | "35°", "35 st.", "%%d" in texts, labelled texts first; a labelled "spadek 70 %" is converted with atan | `pitch-text`, `pitch-percent-converted` |
| Dimensions | A linear DIMENSION equal (± 0.5 %) to an outline side confirms it | `dimension-matches-length/width` |

Every value stays a proposal: the form shows its source ("Z obrysu ścian",
"Z dwóch obrysów", "Z opisu na rysunku: „…”", "Wartość RoofCalc — sprawdź"),
nothing is created before the user ticks the confirmation, and RoofCalc's
own solvers compute everything afterwards.

## Limits and safety

- 25 MB, 200 000 entities, 400 000 vertices, 20 000 block inserts, texts cut
  at 2 000 characters; past a limit the analysis is partial and says so.
- Binary DXF and DWG are refused with a "save as ASCII DXF" message; HEIC
  photos are sent to the PDF/photo path.
- Parsing runs on the device; nothing is uploaded; the file is data, never
  evaluated.

## Not supported (yet)

L-, T- and U-shaped plans (compound roofs, ADR-008), roofs on
non-rectangular plans, reading pitch from a section drawing's geometry, and
DWG. They fail with a named reason and a way forward (manual start or PDF).

## Regression

- `packages/bim-import-core/src/cad-plan.test.ts` — reader (binary/other
  formats, units, paper space, blocks, MTEXT) and recognition (gable, hip
  with L − W ridge, nested outlines in cm, inferred and unknown unit, rotated
  loose lines, a frame in model space, roof type from text, pitch ranking).
- `apps/web/src/bim/cad/CadImportWorkspace.test.tsx` — the reference plan
  `fixtures/cad/hip-12x8-eave-50.dxf` becomes a hip 12 × 8 m, eave 50 cm,
  35° start template only after confirmation; inferred unit; DWG message.
- `apps/web/src/import/file-kind.test.ts` — classification by bytes.
- `e2e/cad-import.spec.ts` — start dialog "Otwórz plik…" → DXF → project,
  desktop and phone.
