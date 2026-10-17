# VNext-2 — dimension-first import, roof connections, offline catalogue, visual clarity

Status: implemented in the working tree on 2026-10-17 (branch
`claude/roofcalc-vnext-audit-afa57d`, after `63dbc6e`). Builds on
`ARCHITECTURE_VNEXT_WORKSPACE_AND_DOCUMENT_IMPORT.md`.

User request: import should rely on the dimensions **written** on scans,
photos and PDFs — not on scaling, because a print's scale varies; modules
laid out so the app stays modular and extensible; an easier product
database; prepare adding and joining roof members and planning roof
connections on applicable standards; an intuitive, labelled,
colour-organized UI.

---

## 1. Definition of Ready

| # | Question | Dimension-first import | Connection plan | Offline catalogue |
| --- | --- | --- | --- | --- |
| 1 | User problem | A scan/photo had only "calibrate and measure", which is wrong whenever the print is resized. The carpenter reads the numbers anyway. | Joints were decided in four scattered places with no fastening, no norm reference and no overview. | With no database (static build, XAMPP) the picker showed only "catalogue unavailable". |
| 2 | Domain owner | `document-import-core` (pure); the web adapter only frames regions and renders. | New `connection-core` (pure, depends on `timber-model` only); census adapter in the web layer; plan persisted by `calculator-core`. | `catalog-core` read model (pure); data in `catalog-data`; client in `apps/web/src/catalog`. |
| 3 | Canonical persistence | None — transcriptions are session state of the import, like every recognition result (ADR-012). | `project.connectionPlan?` — decisions only (ADR-002). | None — the source choice is transient session state. |
| 4 | Schema / migration | `RecognitionResult` gains a mode, evidence codes, a relation and two warnings; session-only, no stored version. | Additive optional field in `RoofProjectDocumentV1` (SCHEMA_REGISTRY §15); old projects open unchanged; absent when nothing is planned. | None. |
| 5 | Undo / history | Import decisions are not project history. | `setConnectionPlan` = one entry per change; the field is carried by all 20 store composition sites (tested across six other actions). | None. |
| 6 | Quantity impact | None. | Planned pieces per node kind × occurrences are shown as evidence ("not an order"); no quantity source yet. | None. |
| 7 | Procurement impact | None. | None; connector products would need a technical snapshot first. | None. |
| 8 | Catalogue impact | None. | No technical field yet; future connector products need ETA/DoP snapshots (ADR-003). | Same immutable revisions and IDs as the server (ADR-003/004). |
| 9 | Cost layer | None. | No price anywhere in `connection-core` (architecture test). | Price lists never ship in the client. |
| 10 | Offline | Fully offline. | Fully offline. | That is the point. |
| 11 | Mobile UX | Frame by drag or tap, typed input, 390×844 tested. | Cards stack; summary 2×2; tested at 390×844. | Same picker sheet, tested at 390×844. |
| 12 | Domain research | Polish dimensioning conventions (§2). | `docs/domain/ROOF_TIMBER_CONNECTIONS_AND_STANDARDS.md`. | Not needed. |
| 13 | Regression | Unit (chains, transcription, policy, superscripts), integration (real pdf.js), E2E photo → project. | Unit (spacing vectors, schedule, plan schema, census, store), E2E plan → undo → reload. | Unit (read model on the real batches), E2E offline pick. |
| 14 | Multi-structure | No IDs parsed; transcription groups are explicit objects. | Keyed by node kind; one plan per structure under ADR-008; junction vocabulary lives above structures. | n/a. |

---

## 2. Dimension-first import

**Policy** (`measurementValueSource`): a measurement is *written* (text layer,
OCR, transcription, AI vision) or *scaled* (vector geometry, a calibrated
measurement). A field takes, in order: a labelled written value → an overall
dimension proven by a chain → any written value → a scaled value only as a
flagged stand-in (`scaled-value-only`, confidence `low`). Vector geometry
never fills a field; it cross-checks and may confirm the unit of a bare
number (`drawing-scale`), which never changes the number itself.

**Dimension chains** (`chains.ts`): numbers grouped into rows along a
dimension line; a contiguous run of parts whose sum equals a parallel,
centred total within the written rounding becomes a `dimension-chain`
relation. Unit-free and scale-free, so it works on a resized print. A near
miss (≤ 5 %) is a `dimension-chain-mismatch` warning — a probable misread,
never a guess. Chain totals suggest building length and width (larger axis
= length) with `medium` confidence and always need confirmation.

**Polish conventions**: centimetre plans write a half centimetre as a raised
5 (`38⁵` = 38,5 cm). The scanner reads superscript fractions; the text-layer
assembler writes a raised, smaller digit item back onto its number. A row of
numbers (`320 600 320`) is now a dimension row, split from unrelated text at
large gaps.

**Transcription** (`transcription.ts`, tool "Odczytaj wymiar"): the user
frames a dimension (drag or tap), sees it magnified, types it exactly as
written and picks its meaning (or leaves it unassigned for a chain). Parsed
by the same token scanner as a PDF; the region stays as evidence. It is the
default tool on a page without a text layer. Calibration and "measure at
scale" moved to a group labelled *Skala — tylko kontrolnie*.

**OCR slot**: an OCR adapter only has to return positioned text
(`TextLayerPage[]`); everything else is shared. No OCR library was added:
transcription already satisfies "use the written numbers" honestly, and a
recognition engine for technical drawings needs real-world fixtures before
it can be trusted.

## 3. Connection plan

```text
template + composed skeleton + build-up
  → roofConnectionCensus (web adapter: node kinds from member kinds/intents)
  → deriveConnectionSchedule (connection-core: modelled interface, options,
     planned fastening, EC5 detailing check, references, planned pieces)
  → ConnectionsWorkspace (Konstrukcja → Połączenia)
  → setConnectionPlan → project.connectionPlan (one history entry)
```

`connection-core` modules: `standards` (editions, verify flags),
`catalogue` (roles, node kinds, connection types with references),
`spacing` (Tables 8.4/8.5, envelope, row fit), `plan` (schema with
node/type compatibility), `schedule`, `junctions` (ADR-008 research
vocabulary). Carpentry interfaces with an existing canonical home (seat
notch, ridge connection, hip execution) are shown, not duplicated; "Zmień w
konstrukcji" leads there. Nails/screws are referenced but their spacing is
not computed (Table 8.2 not yet verified — see the domain document).

## 4. Offline technical catalogue (ADR-013)

`packages/catalog-data` now owns the technical catalogue batches (moved
with `git mv` from `apps/api/src/data/import-batches`; price lists stay in
the API). The API seed resolves files through `seedBatchPath`; the web app
lazy-loads the same JSON as separate chunks only when the user clicks
*Użyj wbudowanego katalogu technicznego* in a picker or the Material Plan.
`createOfflineCatalogue` answers the API read contracts with a
diacritic-insensitive, all-words search. While active, every picker shows
the data date and a way back to the server catalogue. Query keys are scoped
by source so results never mix. The default behaviour (unavailable → manual
path) is unchanged.

Product cards state whether the roof pitch meets the product minimum —
exactly what the preview knows. The readiness message for an automatic
batten layout without a solution no longer claims the pitch is too low
(`battens-auto-unresolved`, a fix of a misleading pre-existing message).

## 5. Visual clarity

- `--ui-member-*`: one colour per timber family in every view (equal to the
  3D scene's colours; a test keeps them in step). Used by the connection plan
  legend and node swatches.
- `--ui-section-*`: one calm hue per section for nav and dock icons and the
  active-task underline. Colour means "where am I"; status keeps its own
  success/attention/danger colours.
- Every section and task carries a one-line description (`title`, read by
  assistive technology through the section label + status).

## 6. Not done / next

- Table 8.2 (nails) after verification against the standard text; then the
  row-fit check for nails and screws ≤ 6 mm.
- A local OCR engine behind the existing slot, with real scanned fixtures.
- Connector products as catalogue technical snapshots (ETA/DoP), then
  connection quantities as a quantity source.
- Roof-to-roof junctions need the V2 multi-structure document (ADR-008).
