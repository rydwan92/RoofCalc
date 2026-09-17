# V47 — project readiness, guardrails, document truth and two-axis laps

Status: IMPLEMENTED. Integrates the existing engines; no new geometry engine.
Starting HEAD: `e0f2e3d` (V46).

## Definition of Ready

1. **User problem:** states such as "Niezgodne / Nie gotowe" left users alone;
   documents looked final while carrying known limitations; the assumptions
   page printed a stale membrane sentence; membrane quantities ignored laps at
   roll joins; the tile view did not show how far tiles reach past the eave.
2. **Domain owner:** laps and eave evidence stay in their solvers
   (`roof-math` membrane course/roll plan, `covering-core` tile layout).
   Readiness is an application projection in `apps/web` — it composes resolved
   facts and never calculates geometry.
3. **Canonical persistence:** none. Readiness, limitations and document status
   are derived. A saved project is never mutated on load.
4. **Schema / migration:** no project schema change. Additive-optional result
   fields (`endLapCount`, `endOverlapAreaMm2`, `eaveProjectionMm`,
   `endOverlapAreaMm2` in quantity sources). `document-core`
   `AssumptionsSection` becomes structured (`scope` / `limitations` /
   `notModelled`) and `ExecutionDocument.status` is optional; documents are
   generated, never stored.
5. **Undo / history:** the safe repair group and every readiness action are at
   most one history entry; readiness itself creates none. The after-action
   feedback reuses the project Undo.
6. **Quantity:** membrane gross area now includes end laps along the roll.
7. **Procurement:** no change; roll plan stays a conservative laying plan.
8. **Catalogue:** no new field. The single product lap is used in both axes
   (a directional `overlapRules` schema already exists for later).
9. **Cost:** no price enters geometry; cost readiness reads
   `summarizeCostScenario`.
10. **Offline:** everything is local and pure.
11. **Mobile:** the readiness bar wraps; the panel is a full-width sheet at
    390×844 without horizontal overflow.
12. **Research:** end-lap and eave-projection vectors are hand-checked in tests.

## 1. Readiness model (`apps/web/src/assembly/project-readiness.ts`)

```
domain results (surface, covering layouts, batten/counter workflows,
membrane layout, K1 requirement, material rows, cost summary, candidates)
        ↓
deriveProjectReadiness → { issues, areas, documents, primary,
                           progress, safeRepair, limitations }
        ↓
bar · panel · Document Hub · Material Plan · export preview · document
```

`ReadinessIssue`: `id`, `code`, `severity`, `area`, `params`, `action`,
`secondaryAction`, `affects` (documents), `safeRepair`, `source` (resolver
fact). Architecture rule: no domain package imports readiness.

### Severity semantics

| Severity | Meaning | Examples |
| --- | --- | --- |
| BLOCKER | a dependent result would be invalid or misleading — only for the documents it `affects` | invalid geometry, stale plane scope, plane conflict, ambiguous installation mode, product incompatible with the roof, manual gauge outside the product range |
| WARNING | useful result with a known limitation | H1 counter-batten detail, battens off under a tile, membrane without a roll product, tile eave projection implausible, cost without prices |
| INFO | optional decision or next step | choose covering, add counter-battens, plan K1 cutting, prepare cost estimate |

Nothing locks the application: editing and navigation stay free. Blockers
gate only the final print of the affected document.

### Areas and progress

| Area | Requirement | Counted in "X/Y gotowe" |
| --- | --- | --- |
| Konstrukcja | required | always |
| Pokrycie | required | once construction is valid (pending until chosen) |
| Warstwy | conditional | when a covering needs battens or a layer is on |
| Wykonanie | conditional | when K1 resolves |
| Materiały | conditional (inherits blockers/warnings of its facts) | when rows exist |
| Kosztorys | optional | only once started |

An optional or not-applicable area is never shown as an error.

## 2. Safe repair vs expert decisions

Safe, deterministic and grouped ("Napraw bezpiecznie N problemy", preview
first, one history entry): stale plane scope, a single covering not on every
plane, battens off/absent under a batten-supported covering, layer scope
narrowing — all through `fitInstallationToRoof`, which now **never replaces a
manual gauge**. The preview lists `InstallationRepairChange`s.

Never auto-resolved: the H1 detail, an ambiguous installation mode, a manual
gauge (offered as a separate "Dopasuj automatycznie"), product/structural
choices.

## 3. Guided UI

- **Bar** (`ProjectReadinessBar`): progress pill → panel; one primary issue
  (blocker > warning > covering/construction info); one action; `+N`. A quiet
  "Projekt gotowy do dokumentacji" when nothing is open.
- **Panel** (`ProjectReadinessPanel`, "Sprawdzenie projektu"): areas with
  ✓ / ⚠ / ✕ / — / ○ plus text, issue rows (problem, consequence, primary +
  secondary action), the safe repair group, and an explanation when an area's
  state is inherited.
- **Direct navigation**: `hip-detail` → Warstwy › Kontrłaty with the detail
  scrolled into view; `review-eave-detail` → Warstwy › Łaty with advanced
  settings opened and "Pierwsza łata od okapu" focused; membrane, battens,
  covering, K1 cutting, materials and cost each have their own target.
- **Feedback**: "Dopasowano pokrycie i warstwy do dachu. [Cofnij]".
- **Consequence preview**: changing Dwuspadowy ↔ Kopertowy with dependent data
  lists covering, battens, counter-battens, membrane and windows on removed
  planes before applying (plane IDs from the template resolver).
- **Recalculated value hint**: the Auto batten gauge shows
  "40,3 cm → 39,6 cm · przeliczono po zmianie" for a few seconds.
- **Input guardrails**: covering numeric fields mark invalid input, never
  commit zero/negative/unparsable dimensions, and explain why (existing
  Inspector draft fields already did).
- **Material Plan**: each row shows the readiness issue that explains it with
  its action (e.g. counter-battens → "Uzupełnij detal H1").
- **Cost**: "3 wymaga ceny · 1 wymaga ilości · 2 szacunkowe" are filters that
  focus the affected rows.

## 4. Documents

- **Document Hub**: each card shows state before opening (Gotowy /
  N ograniczeń / N problemów do poprawy / Brak danych), a compact preflight of
  the areas it depends on, "Napraw: …" for a blocker and "Podgląd roboczy" for
  a warning.
- **Preview header**: title per document (Pakiet wykonawczy / Lista
  materiałów / Kosztorys) and a state pill. Blocker → primary "Napraw
  problemy", secondary "Drukuj wersję roboczą"; every page is marked.
  Warning → normal print; the first page carries the same issues.
- **Assumptions page**: `Zakres dokumentu` (✓ facts), `Ograniczenia tego
  projektu` (⚠, from `limitations`), `Poza zakresem RoofCalc` (—). Compact
  page that continues after the previous section in print.
- **Truth defect fixed**: the static "Membrana: podana powierzchnia netto nie
  obejmuje zakładów…" is gone. A roll plan prints net → gross with laps between
  courses, laps at roll joins, ridge overrun and the roll plan; net-only prints
  only when no roll product exists. Regression test:
  `execution-export-truth.test.tsx`.
- **Single source of limitations**: `deriveProjectLimitations` (membrane codes
  shared with the Material Plan card via `membrane-limitations.ts`, structural
  limitations shared with export callers via `structuralLimitations`).

## 5. Laps in both axes and eave evidence

**Membrane** (`roof-math/membrane-layout.ts` `planMembraneRolls`): courses are
laid in order from the current roll; when a roll ends inside a course the next
roll continues it with an end lap; a remnant no longer than one lap is left.
`grossAreaMm2 = courses · rollWidth · courseLength + endLaps · lap · rollWidth`.
Hand checks: 8 × 8 m courses on 50 m rolls, 10 cm lap → 2 rolls, 1 end lap,
64,1 m; a 120 m course, 20 cm lap → 3 rolls, 2 end laps, 120,4 m.

**Tiles** already count both laps through the effective module (cover width
× batten gauge); the V46 audit remains the reference.

**Eave projection** (`covering-core` `TilePlaneLayout.eaveProjectionMm`):
`physicalLength − (first batten station − eave)`; shown in the technical and
material views and the course facts. KODA 503 mm on a 250 mm first batten →
253 mm. Readiness warns only when physically implausible (does not reach the
eave, or more than half the tile hangs past it).

## 6. Verification

Unit tests (readiness matrix 16, export truth 6, readiness UI 4, roll plan 6,
overlap audit incl. eave, input guard), Playwright V47 flows (guided hip
project, broken saved project with one-step repair and Undo, export preflight
warning → ready), full e2e suite, architecture tests, typecheck, lint, build
with edge bundle check, and real-browser screenshots at 1920×1080, 1440×900,
1024×768 and 390×844.
