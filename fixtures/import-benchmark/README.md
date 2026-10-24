# Import benchmark (VNext-6.1)

Measures what the document import actually reads, what it gets wrong and how
much work is left to the user — per document, with ground truth written by a
person. It exists so that recognition is improved, and an OCR or AI engine is
chosen, on numbers from a corpus instead of on a single demo file.

**Today the corpus is synthetic** (three generated PDFs). It proves the
harness and guards against regressions; it does **not** measure accuracy on
real customer designs. Do not quote these numbers as accuracy.

## Run

```bash
pnpm vitest run apps/web/src/document-import/import-benchmark.test.ts
# with the per-case table:
ROOFCALC_BENCHMARK_REPORT=1 pnpm vitest run apps/web/src/document-import/import-benchmark.test.ts
```

The test reads every case with the real pdf.js parser in Node, runs the same
recognition the browser runs, then `score.ts` replays the review with the
truth in hand.

## Case schema (`cases.ts`)

| Field | Meaning |
| --- | --- |
| `id` | Stable, descriptive, no personal data (`house-4p-cross-sheet-conflict`) |
| `input` | `pdf-text` · `pdf-vector` · `scan` · `photo` · `dxf` · `ifc` |
| `licence` | `synthetic`, or the licence / written permission of the source |
| `bytes()` | The document (generated, or read from `documents/` in this folder) |
| `truth.roofType` | `gable`, `hip`, `mono-pitch` or `asymmetric-gable` as the design states it |
| `truth.values` | Only what the document **states**: mm for lengths, degrees for pitch. A value the document does not state is left out — the import must then leave it to a labelled default, not invent it. |
| `conflicts` | Fields with two different written values in the document |

## Metrics (`score.ts`)

| Metric | Definition | Bar |
| --- | --- | --- |
| field recall | truth fields read with the right value before any user action | synthetic: 100 % |
| **false accepted values** | wrong value accepted **without** asking — the dangerous error | **always 0** |
| wrong but asked | wrong value the import asked to confirm (the review catches it) | reported |
| conflict detection | written disagreements reported as conflicts | all |
| roof type | detected type equals the truth | all |
| user actions | actions from the loaded document to a created project, following ONE next step at a time (choose, confirm, type, tick review, create) | synthetic: ≤ 8 |
| read time | parse + recognition, cold/warm, ms | reported |

## Current results (synthetic, Node, this laptop)

| Case | Recall | False accepted | Conflicts | Actions | Read ms |
| --- | --- | --- | --- | --- | --- |
| gable-1p-title-block | 7/7 | 0 | 0/0 | 3 | 243 (cold) |
| hip-1p-unitless-percent | 3/3 | 0 | 0/0 | 3 | 6 |
| house-4p-cross-sheet-conflict | 7/7 | 0 | 1/1 | 4 | 13 |
| mono-pitch-1p-carport | 7/7 | 0 | 0/0 | 3 | 4 |
| asymmetric-gable-1p | 8/8 | 0 | 0/0 | 3 | 5 |

## Adding real documents

1. Only documents you have the right to use: your own designs, documents with
   written permission, or public-domain sheets. Record the licence in
   `licence`.
2. Anonymise before committing: remove names, addresses, plot numbers,
   investor and designer data, stamps and signatures. Keep the drawing.
3. Never commit a document that cannot be anonymised; keep such files outside
   the repository and run the benchmark locally.
4. Write the truth from the document itself — not from what RoofCalc read.
5. Add scans and photos too: their expected result today is honest manual
   transcription (no OCR), with `falseAccepted` still 0.

Target corpus before choosing an OCR engine: 30–50 documents across text PDF,
vector PDF, scan, photo, DXF and IFC, with per-input breakdown.
