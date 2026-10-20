# VNext-6 — intelligent project intake, guided completion, compound-roof foundation

Branch `feature/vnext-6-project-intake` from `main` @ `fe7b6b3` (2026-10-20).
Decision record for the geometry contract: `docs/adr/ADR-015-roof-topology-graph.md`.

## 0. Audit of HEAD before this iteration (verified, not declared)

Baseline `pnpm verify`: typecheck, lint, format, **193 test files / 1953
tests (13 skipped)**, build web + API + Worker dry-run — all green.

| Area | Already there | Gap that VNext-6 closes |
| --- | --- | --- |
| Entry | Start dialog "Otwórz plik…" classifies by bytes (PDF/image → document import, DXF → CAD, IFC, project archive) — VNext-4 | — (kept; no second entry point added) |
| PDF reading | Text layer, vector outline cross-check, dimension chains, transcription of scans, calibration, per-value source + page, conflict pick, confirmation bound to the value (VNext–VNext-3) | No notion of **pages**: a multi-sheet design showed "Strona 2 z 4" only; no page roles; numbers from a window schedule competed with the plan |
| Conflicts | Two labelled readings conflicted only at the **same** confidence | A high and a medium **explicitly labelled** value on different sheets: the high one won silently |
| Review | Every field row, blockers list | No single count of what was read and no **one next step** — the user scanned eight rows |
| Provenance | Inline source line (page, text, unit basis) | No document fingerprint on the value; engine/alternatives/warnings not gathered in one place |
| After import | Lands on the construction view; journey bar shows one next action | Nothing says what the document gave vs. what RoofCalc defaulted (rafter section, spacing); no compact overview of the five things a job needs |
| DXF | Rectangle outline, eave, ridge/hips, pitch text | An L-shaped plan failed with "no rectangular outline" — nothing recognised, nothing explained |
| Geometry | One `RoofTemplateSpec` (gable/hip); roof-math resolves planes and canonical lines (V51) | No shape-neutral contract to describe a mono-pitch, an asymmetric gable or an L, and no way to say "drawn but not calculated" |

## 1. Definition of Ready

1. **User problem** — a roofer receives a 4–20 page building design and
   retypes dimensions from two or three sheets, resolves disagreements in
   his head and then hunts for the next tool. Today he reads the plan, the
   section and the schedule himself.
2. **Domain owner** — page roles, the conflict rule, the intake summary and
   provenance are recognition rules → `document-import-core` (pure, no
   parser). The topology graph is a geometry *contract* above the solver →
   new `roof-topology-core` (no solver import; roof-math stays the only
   geometry engine). The preparation card is presentation over the existing
   journey/readiness projections → `apps/web/src/assembly`.
3. **Canonical persistence** — none. Page roles, set-aside pages, the
   intake report and the topology graph are derived or session-only
   (ADR-002, ADR-012). `RoofProjectDocumentV1` is unchanged.
4. **Schema / migration** — additive optional, session-only:
   `ImportSource.fingerprint`, `ImportDecisions.excludedPages/pageRoles`,
   `CadPlanAnalysis` variant `compound-outline`, `RoofSceneGraph`
   `contractVersion: 1` (derived). `SCHEMA_REGISTRY.md` §17. Every saved
   project opens unchanged; no version bump. V2 migration designed in
   ADR-015, not executed.
5. **Undo / Redo** — import review and the preparation card create no
   history entries. Creating the project is one `createFromDocument`;
   preparation actions open existing editors through `runJourneyAction`
   (navigation, no undo entry).
6. **Quantity** — no new quantity source. The graph's areas are a
   cross-check of the solver (identical for gable/hip), not a takeoff.
7. **Procurement** — unchanged; no blank changes meaning.
8. **Catalogue** — unchanged. The card shows prices only as the cost
   scenario counts them (priced / without a current price — never 0 zł).
9. **Cost layer** — no price, currency or margin enters import, topology or
   preparation (ADR-005). Missing prices are counted, not zeroed.
10. **Offline** — everything runs in the browser; no file leaves the device
    (e2e asserts no non-GET request). No database needed.
11. **Mobile (390×844)** — page strip scrolls horizontally with thumbnails;
    the reading status with the next step is pinned above the document;
    every value keeps its exact numeric input; the preparation card is a
    bottom sheet above the task dock with a sticky "Dalej" button and a
    one-line pill when collapsed. No horizontal overflow (e2e).
12. **Domain research** — page-role vocabulary of Polish design sheets
    (rzut dachu, rzut więźby, przekrój A-A, rzut parteru, elewacja,
    zestawienie), tested on a generated four-sheet PDF. Topology fixtures are
    hand-checked vectors (§4); no new roof calculation is claimed.
13. **Regression** — unit: page roles, cross-page conflicts, set-aside
    pages, intake steps, provenance, preparation states, topology adapter
    equality, scenes, outlines, DXF compound outlines; integration: real
    pdf.js parse of `fixtures/documents/projekt-domu-4-strony.pdf` ending in
    a template **equal** to the manual project start; UI: CAD L-shape;
    architecture: `roof-topology-core` purity; e2e: PDF → card → editor and
    L-shaped DXF, desktop + phone.
14. **Multi-structure** — the graph scopes every entity by structure and
    keeps solver IDs in `source.ref`; no ID is parsed (ADR-007); the L
    proposal is two structures plus an unresolved connection (ADR-008).

## 2. P0 — intake and evidence

**One entry** (unchanged): start → "Otwórz plik…" or drop; bytes decide the
importer. No parser was copied into a component.

**Page roles** (`document-import-core/src/pages.ts`) — `suggestPageRoles`
names a page `roof-plan | framing-plan | section | floor-plan | elevation |
schedule | unknown` only from a written title: the matching line must be
larger than the page's typical text, or be most of a normal-size line (a
title-block cell). A drawing list on a title sheet ("Spis rysunków: rzut
dachu, przekrój…") or a note ("patrz przekrój A-A") does not name the page.
"Przekrój krokwi 8×18" is a timber size, not a section. Vectors and numbers
alone never name a role. The user can correct a role and **set a page
aside** (`excludedPages`): nothing read on it can fill a field; the text
layer is re-read from the remaining pages so a unit, scale or roof type
written elsewhere still applies.

**Source priority and conflicts** — written > drawn-at-scale (dimension
first, VNext-2) is kept. New: two **explicitly** labelled readings that
disagree are a conflict whatever their confidence; a generic weaker reading
stays an alternative. A choice or a set-aside page resolves it; nothing is
chosen silently.

**Intake summary** (`intake.ts`) — `summarizeIntake` counts roof type + 7
values as settled / to confirm / missing / defaulted / unsupported and gives
ONE next step in a fixed order: unsupported roof → roof type → conflicts →
missing → confirm roof type → confirm values (required first) → final review
→ create. The button takes the user to the exact control (the conflicting
reading, the confirm button, the checkbox).

**Provenance** — `fieldProvenance` gathers document fingerprint (SHA-256 on
the device), page, region, engine and mode, written/scaled, unit basis,
confidence, alternatives and the warnings naming the field; shown under each
value as "Szczegóły źródła". Clicking the source still scrolls the page to
the region; editing revokes confirmation (unchanged).

**Scans** — unchanged and honest: transcription of written dimensions,
calibration only for checking; OCR and AI Vision stay `not available`.

**CAD L/T/U** — `analyzeCadRoofPlan` returns `reason: 'compound-outline'`
with the outline in mm, corner counts and, for an L, its two parts; the
importer shows them and states that compound roofs are not calculated —
there is no "create" button.

## 3. P1 — from project to documents

`deriveProjectPreparation` (`apps/web/src/assembly/project-preparation.ts`)
groups the V53 journey into five groups — Konstrukcja i wymiary · Pokrycie i
warstwy · Odwodnienie i obróbki · Materiały i kosztorys · Dokumenty — and
picks ONE next step. After an import it first asks to check the values the
document did **not** give (RoofCalc defaults, e.g. rafter section and
spacing → `review-structure`); otherwise it is the journey's recommendation.
Documents report what can be produced **now** (execution package, material
list, cost estimate) from `readiness.documents`.

`ProjectPreparationCard` opens after every import (PDF/image, DXF, IFC),
collapses to a one-line pill while the user works in the opened editor, and
reopens from the pill or from "Przegląd projektu". Two levels, one model:
"Dalej: …" (quick path — only the missing decisions) and "Edytuj
szczegółowo" (the existing Creator with every parameter). Nothing on the
card is a second checklist: it renders the same journey the nav row and the
readiness panel use.

## 4. P2 — compound-roof foundation (contract, not a solver)

`packages/roof-topology-core` (ADR-015): model, measurement helpers,
builders, `assessRoofScene`, `roofSceneMetrics`, `planeAdjacency`, the
solver adapter `roofSceneFromResolvedRoof` and the outline classifier.

Hand-checked scenes (`scenes.test.ts`):

| Scene | Vectors | Result |
| --- | --- | --- |
| Mono-pitch 6 × 4 m, 15° | top edge at 4000·tan 15° = 1071.797 mm; area 24 m²/cos 15° | geometry complete, calculation **not-supported** |
| Asymmetric gable 10 × 8 m, ridge 3 m from the front at 3 m | front 45°, rear atan(3/5) = 30.964°; areas 10·3√2 and 10·√34 m² | complete, **not-supported** |
| L, all 45°: 12 × 8 m + 8 × 8 m wing | ridges meet at (8, 4, 4) m; hip and valley 4√3 m = 6928.2 mm; plan areas 40 + 24 + 56 + 40 = 160 m² = footprint | complete, **not-supported** (two structures, a connection) |
| Same L as two overlapping gables, junction unresolved | — | **partial** (`connection-unresolved`, `junction-unresolved`) |

Reuse proof (`adapter.test.ts`): gable 9 m, hip 12 m and hip 9 m from
roof-math become graphs with identical plane areas (1e-3 mm²), pitches,
line kinds and line lengths; `geometry: complete`, `calculation: supported`.

Next order for solvers (VNext-7): mono-pitch → asymmetric gable → L with a
valley → dormer/half-hip/mansard; each only after surface, structure,
connections, covering, battens, membrane, drainage, quantities and
documents agree.

## 5. Measured on the supported fixture (`projekt-domu-4-strony.pdf`)

| Measure | Value |
| --- | --- |
| Pages / roles recognised | 4 / roof plan, section, schedule (title sheet correctly "unknown") |
| Values filled from the document | 7 of 7 numeric + roof type (detected, confirmation required) |
| Still needing the user | 2 decisions: the length conflict (plan 12,40 m vs schedule 12,00 m) and the roof type confirmation |
| User actions from the loaded document to the project | 4 (set the schedule aside or pick 12,40 m · confirm roof type · tick review · create) |
| From the start screen to an open project | 6 (Otwórz plik… + file + 4) |
| From the project to a printable execution package | 1 ("Dokumenty → Otwórz" on the card; execution package and material list already available) |
| Reading time on the device | ≈ 1.1 s cold (pdf.js worker start), ≈ 0.11 s warm (browser, this laptop) |
| Import vs manual start | identical `RoofTemplateSpec` (integration test, deep equality) |

Validation after the iteration: `pnpm verify` 198 test files / 2014 tests
(baseline 193 / 1953), `pnpm e2e` 160 passed / 32 conditionally skipped / 0
failed on desktop and phone.

No OCR or recognition accuracy is claimed: the fixture is generated, not a
corpus (see §7).

## 6. Works / partly / not supported

- **Works**: multi-page text-layer PDF with written dimensions; page roles
  from titles; cross-page conflicts; set-aside pages; one next step;
  provenance with fingerprint; preparation card after PDF/DXF/IFC import;
  DXF L/T/U recognised and refused honestly; neutral graph for today's
  gable/hip.
- **Partly**: page roles need a title (a sheet without one is "Inna strona");
  a scanned design still needs manual transcription; the card reflects the
  journey, so its quality is the journey's.
- **Not supported**: OCR / AI reading of scans; calculating mono-pitch,
  asymmetric, L, T, U, dormers; reading pitch from section geometry;
  persisting the graph (V2).

## 7. Next

VNext-7: mono-pitch end to end through the graph (solver in roof-math →
graph → covering/battens/membrane/drainage/quantities/documents), then the
asymmetric gable. In parallel: a licensed/anonymised corpus of real Polish
designs to measure recognition before choosing any OCR engine; Platform
Admin as a separate authorisation boundary.
