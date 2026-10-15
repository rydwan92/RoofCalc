# VNext — one workspace navigation, document import, SQL first run

Audit and priorities: `docs/ROOFCALC_VNEXT_AUDIT.md`. Decision record for the
import contract: `docs/adr/ADR-012-document-import-intermediate-model.md`.

## Definition of Ready

1. **User problem** — a roofer starts from paper or a PDF plan and retypes
   every dimension; the workbench showed four stacked navigation rows above
   the drawing; a fresh local MariaDB could not be bootstrapped.
2. **Domain owner** — `packages/document-import-core` owns recognition rules,
   units, the intermediate model, validation and mapping (pure, no parser);
   `apps/web/src/document-import/` owns pdf.js, image decoding and the review
   UI; `apps/web` owns the navigation projection; `apps/api` owns DB tooling.
3. **Canonical persistence** — none of the new state is canonical. The draft,
   the document and the navigation section are transient (ADR-002). Only the
   ordinary roof template created after confirmation is saved.
4. **Schema / migration** — `RoofProjectDocumentV1` unchanged; no SQL
   migration. `ImportedRoofDraftV1` is registered as a session-only contract
   (`docs/SCHEMA_REGISTRY.md` §13).
5. **Undo / Redo** — reviewing an import creates no history; project creation
   is one `createFromDocument`. Section switches create no history.
6. **Quantity** — no new quantity source; imported values enter the existing
   solvers only through the project start.
7. **Procurement** — unchanged.
8. **Catalogue** — unchanged; recognition never reads the catalogue.
9. **Cost layer** — no price, currency or margin in import or navigation.
10. **Offline** — the whole import works offline in the browser; no file is
    uploaded. The workspace navigation is local view state.
11. **Mobile** — import panels stack (document above review) with the same
    exact inputs; the phone dock carries the same six sections and statuses.
12. **Domain research** — no new roof geometry. The recognition vocabulary,
    unit rules and plausibility ranges are documented below and tested with
    hand-written vectors and a real pdf.js parse.
13. **Regression** — core unit tests (tokens, text layer, draft, mapping,
    ingestion, calibration, engine gate), a real-PDF integration test through
    pdf.js into `createProjectStartTemplate`, architecture rules, updated
    navigation unit tests and E2E selectors.
14. **Multi-structure** — measurement IDs are opaque session handles; the
    import maps to one roof today and carries no meaning in ID strings.

## 1. One workspace navigation

Before: V53 stage strip (6) + V47 readiness bar + V37 perspectives (5) with a
"Przejdź do" menu + task tabs + view tools + breadcrumb. After: **one row** of
six sections — Projekt / Konstrukcja / Pokrycie / Materiały / Kosztorys /
Dokumenty — each with its journey status (complete / needs-action /
not-started from `deriveProjectJourney`), and the compact "next action" at the
end of the same row. Task tabs and view tools share one row in the canvas
column.

| Section | Tasks | Journey stage |
| --- | --- | --- |
| Projekt | Geometria dachu (`construction`), Otwory | geometry |
| Konstrukcja | Więźba (`construction`), Cięcia | construction |
| Pokrycie | Pokrycie, Warstwy | covering (+ layers) |
| Materiały | plan, system, drainage, K1 cutting, schedule | materials (+ roof system) |
| Kosztorys | costing | cost |
| Dokumenty | document hub | documents |

The construction drawing serves Projekt and Konstrukcja; the transient
`WorkbenchViewState.constructionSection` records which one opened it.
Switching a section changes neither selection nor panels. Keyboard: Alt+1…6
sections, `[`/`]` tools/properties panels, `?`-style help popover in the
header listing all shortcuts. The "Dokumenty" header button became "Drukuj /
PDF" (the global export action), so documents have one navigation entry.

## 2. Design tokens

`packages/ui/src/tokens.css` keeps every existing colour value and adds
surface/text/state colours, space, radius, type, elevation, focus ring, control
size and motion (with `prefers-reduced-motion`). New UI (import, navigation,
shell in `apps/web/src/assembly/workspace.css`) uses only tokens. Legacy
literal colours in older stylesheets remain; a dark theme is deliberately not
exposed until those are tokenised (it would render partially dark).

## 3. Document import

Pipeline (`document-import-core`, each stage pure):

1. **Ingestion** — `classifyDocumentBytes` by signature (PDF, PNG, JPEG,
   WebP; HEIC and DWG get a specific message), 25 MB limit, page/text/pixel
   limits.
2. **Preprocessing** (adapter) — pdf.js text content → positioned items in
   page space (top-left origin, points); images → bitmap.
3. **Text & dimensions** — `scanMeasurementTokens`: decimal comma, mm/cm/m,
   angles, % slope, pairs (`8×18`, `12,40 × 9,60 m`), scale `1:100`; rejects
   areas, money, identifiers (K1, A4) and dates.
4. **Geometry candidates** — manual: two-point calibration or a stated drawing
   scale on a vector page (`1 pt = 25.4/72 mm × n`); segments and relations are
   kept in the draft. Automatic line recognition is not implemented.
5. **Semantics** — PL/EN label vocabulary (building length/width, pitch,
   eave, spacing, rafter section, dimension pairs), roof type words
   (supported: gable, hip; named unsupported types are reported). Values on
   the same line after a label, or in the line below.
6. **Units** — explicit unit → document statement ("wymiary w cm") → user
   choice → the single plausible unit for that field (marked, low confidence).
7. **Validation** — plausibility ranges (not the canonical ranges), conflicts,
   hip length ≥ width, swapped dimensions warning.
8. **Template mapping** — `mapDraftToRoofStart` → `ProjectStartValues` names;
   absent optional values use RoofCalc defaults labelled as such.
9. **Confirmation** — per-field confirmation for anything not `high`, final
   review checkbox, edits revoke it.
10. **Project creation** — existing `createProjectStartTemplate` path.

Engines: text layer (on device, available), manual underlay (available), OCR
and AI vision (described, `not-configured`, never faked; external engines
need per-document consent).

**Supported today:** PDF files with a text layer (CAD/editor exports) whose
dimensions are written as labelled text; any PDF/JPG/PNG/WebP as an underlay
for calibrated manual measurement. **Not yet:** OCR of scans/photos, automatic
recognition of outlines/dimension lines, multi-roof documents, roof types other
than gable and hip.

## 4. SQL first run

See the audit §3. Fixed: cause-aware DB error codes (status/doctor), type-only
drizzle config import, passwordless local account, early block when the server
runs with `explicit_defaults_for_timestamp=OFF`, CORS for the public setup
status read by the static XAMPP build, and an explicit Business login message
for each failure (static build, API down, DB down, auth unconfigured).
