# V37 — Product experience and Covering Studio

Status: implemented on main after `e510bdf` (V36), 2026-09-15. Not committed.

V37 turns existing engines into one understandable roof project: primary
perspective navigation with a transient return model, a Document Hub, a guided
Creator with explanatory sketches and example projects, and a Covering Studio
that separates truthful effective coverage from a material preview.

## Definition of Ready

1. **User problem** — users lost context (where am I, how do I go back), met a
   single dense start form, and could not tell whether the tile drawing showed
   physical tiles or effective coverage.
2. **Domain owner** — `apps/web` only. Navigation, Creator and studio are
   presentation/composition. Readiness uses the existing resolver, quantity
   schedule and K1 adapter. No domain package changes.
3. **Canonical persistence** — none. Trail, perspective, covering view mode and
   Creator drafts are transient. Examples become ordinary project records.
4. **Schema / migration** — none. `createProjectStartTemplate` writes ridge
   connection / structure intent only when it changes the effective value, so
   an unchanged hand-off produces the identical V1 document.
5. **Undo / Redo** — navigation, Back, view mode, Creator steps and the hub
   create no roof history. Creating a project replaces the document as before.
6. **Quantity** — unchanged. Ghost cells and the visual preview never feed a
   count; quantities keep following clipped visible fragments.
7. **Procurement** — unchanged; K1 cutting moved from a dialog to a Materials
   tab over the same requirement and session plan.
8. **Catalogue** — reads existing snapshots only (display + technical). The
   product card shows a price-list state only for catalogue variants.
9. **Future cost** — no commercial concept enters geometry; the card reads the
   existing `usePriceOptions` downstream hook.
10. **Offline** — examples come from the bundled fixture corpus; Creator,
    readiness, studio and hub work without API or database.
11. **Mobile** — five-perspective dock plus contextual task tabs above the
    workspace; the Creator stacks preview above the form; exact numeric fields
    remain in the Inspector sheet.
12. **Domain research** — `docs/domain/ROOF_TILE_EDGE_PLACEMENT.md`. No
    physical edge rule is implemented; no universal overhang constant exists.
13. **Regression** — `navigation.test.ts`, extended `project-start.test.ts`,
    updated Page/Mobile/ProjectManager UI tests, updated e2e helpers and
    `e2e/v37-experience.spec.ts`.
14. **Multi-structure** — no ID parsing added; locations are task/view enums;
    example facts read structured template fields.

## 1. Navigation model

Before: `PerspectiveBar` above a permanent seven-task ribbon; Documents launched
the export dialog; K1 cutting and document preview were modal overlays with a
generic "Zamknij".

After:

```text
PROJEKT     → Konstrukcja · Otwory · Warstwy · Pokrycie
WYKONANIE   → Cięcia
MATERIAŁY   → Plan materiałów · Rozkrój K1 · Zestawienie techniczne
KOSZTORYS   → Kosztorys
DOKUMENTY   → Centrum dokumentów
```

- `ViewPreset` gains `documents`; `MaterialsView` gains `cutting`.
- `PerspectiveBar` = primary tabs + a compact **Przejdź do** jump menu (expert
  escape to any destination). `ContextualTaskTabs` shows only the active
  perspective's tasks; drawing tools render only for drawing tasks.
- Mobile dock carries the five perspectives; contextual tabs sit above the
  workspace.

## 2. Return model and breadcrumb

```ts
WorkbenchLocation { perspective; task; localView? }
WorkbenchViewState.navigationTrail: WorkbenchLocation[] // ≤ 6, deduplicated
```

- `navigatePerspective` — top-level switch, clears the trail.
- `navigateTo(location)` — cross-context jump, remembers the current location.
- `navigateBack` — pops the trail. Alt+← does the same.
- `withViewPreset` is the single transient cleanup shared by all switches.
- Context bar: `← {target}` (e.g. "← Plan materiałów", "← Centrum dokumentów")
  plus `Perspektywa › Zadanie › Produkt/element`; parents are actionable. A cut
  detail without a trail still returns through `returnViewPreset`.
- Undo/Redo are labelled **Cofnij zmianę / Ponów zmianę** with shortcuts, so
  navigation Back and edit history are visibly different.

## 3. Document Hub

`DocumentHub` lists Pakiet wykonawczy, Lista materiałów and Kosztorys with a
status derived from the V30 `createExportCandidates` readiness, a sections
count, a primary **Podgląd**, **Wybierz sekcje** for the execution package and
CSV downloads through the existing exporters. `ExecutionExport` accepts
`initialSelection`, `startInPreview` and `backLabel`; the preview's back button
reads "← Centrum dokumentów". No second export engine.

## 4. Guidance

"Co dalej" is one row: progress dots (stage list on demand), one primary item,
`+N więcej`, and the single next-action button.

## 5. Creator 2.0

- Start: **Szybki start** · **Projekt przykładowy** · **Od razu do edycji**.
- Four steps: Budynek → Geometria dachu → Konstrukcja → Sprawdź i utwórz.
- Every non-obvious input carries a `ParameterIllustration` (length, width,
  pitch α, eave, rafter spacing, section b×h, rafter/collar-tie system, ridge
  board / direct meeting / half-lap). Sketches are fixed schematics with
  `role="img"` labels, never a geometry engine.
- Live plan preview draws the resolved skeleton members and roof-plane guides
  of the draft through `workbenchProjectResolver` — no preview formulas.
- `validateProjectStart` returns field-specific issues (required, schema range,
  hip length ≥ width, spacing ≤ length).
- `deriveProjectStartReadiness` reports geometry / construction / K1 cutting
  from the real resolver, schedule and K1 adapter, and names limitations such
  as the unmodelled half-lap. It never claims structural safety.
- Quick hand-off shows width, pitch and eave as confirmed chips with **Zmień**
  and keeps exact precision.

## 6. Example projects

`project-examples.ts` imports fixtures `01-basic-gable`, `02-basic-hip` and
`10-gable-collar-tie-direct-meeting` through `importProject`. Opening an example
calls `ProjectSession.createFromDocument`, which flushes the active project and
always saves a new record. Cards say "Projekt przykładowy — nie projekt
konstrukcyjny."

## 7. Covering Studio 2.0

Current truth preserved: `TilePosition` holds the nominal effective coverage
cell; `visibleFragments` are that cell clipped to the plane polygon; the counts
come from those positions.

- **Techniczny** (default): plane outline on top, clipped fragments coloured by
  full / edge cut / opening cut, dashed **nominal ghost cells** for edge-cut
  positions (may extend outside the plane), battens and openings.
- **Pogląd materiału**: one neutral `<symbol>` tile glyph instanced with `<use>`
  per position and clipped to the plane; above 1200 fragments it falls back to
  simple rectangles. It is labelled as illustration and never feeds a count.
- The drawing is mirrored so the eave is at the bottom (v runs uphill), with
  Kalenica/Okap orientation labels.
- Per-plane edge summary: pełne / docinane na krawędzi / docinane przy
  otworach, plus the alignment explanation ("RoofCalc rozkłada docinki
  symetrycznie względem połaci.").
- Always stated: "Detal fizycznego wysunięcia dachówki poza krawędź nie jest
  modelowany."
- **Układ w poziomie** radio group replaces the enum select for tile, sheet and
  standing-seam editors; manual keeps an exact offset field.
- Product card: source badge (KATALOG/RĘCZNY), manufacturer · variant ·
  revision · type, physical size, cover width, gauge range, minimum pitch,
  declared consumption and price-list state for catalogue variants.

## 8. Visual system

`v37.css` loads after `styles.css`: button roles (primary / secondary / ghost /
danger), distinct state tokens (brand, selected, related, ready, manual,
warning, error, partial, disabled) with outline/text cues, compact builder
header, hidden builder page heading, full-width costing/documents, no empty
covering Inspector, restyled catalogue cards, reduced-motion aware step
transition. The 2D workspace keeps a single central viewport slot so a future
2D/3D switch can sit above it; no 3D code is added.

## Known limitations

- No physical tile body, eave projection or verge accessory geometry.
- Visual glyph is generic; no manufacturer appearance metadata exists.
- Hip Creator does not offer ridge-connection or collar-tie choices (existing
  model limits).
- Catalogue picker already had search and manufacturer filter; V37 restyles it
  but adds no price column in results.
- The trail is session state only and resets on reload by design.

## Validation

See `PROJECT_BLUEPRINT.md` → WORK CHECKPOINT for the recorded run.
