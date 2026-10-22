# RoofCalc VNext-6.2 — self-audit

Branch `feature/vnext-6-2-self-audit` from `main` @ `b2055dd`, 2026-10-22.
Requested by the owner: "audyt własny, testy, scenariusze i poprawki obecnych
funkcjonalności, wyglądu, UI/UX, architektury i kodu". No new feature; every
item below was found by running the application or the code, and each fix
has a test that fails without it.

## 1. Method

| Probe | What it does |
| --- | --- |
| Visual tour (Playwright, 1440×900, 1366×768, 390×844) | landing, start dialog and two reference projects (05 roof tile, 04 hip with framing) in all six sections; per screen: page overflow, elements past the viewport, clipped text, controls without a name, phone tap targets, text below 11px, console errors |
| Journey script | new project from the guided start, then "Co teraz" until it stops |
| Keyboard walk | Tab through four sections; every focused element must show an outline, a shadow or a frame |
| Numeric input probe | `35,5`, `abc`, `0`, `90`, `1 200`, `1200,5`, `-5`, `1e3` in the exact inputs |
| Code scans | exported names nothing imports; CSS custom properties read but never defined; font sizes below the type scale; bundle sizes |

## 2. Findings

| # | Finding | Evidence | Class | Status |
| --- | --- | --- | --- | --- |
| 1 | **"Przywróć przykład" overwrote the open project.** The header icon next to the language switch replaced the open, autosaved project with the example and also cleared the history, so Undo was disabled | browser: stored record of fixture 05 went from 1 covering to 0, "Zapisano lokalnie", Undo disabled | **potwierdzony błąd** (data loss) | fixed: `restoreExample` is one undoable edit; the "Cofnij" notice says the project can come back; store, component and e2e tests |
| 2 | Dev proxy pointed at itself when `PORT` in the environment named the web server's own port (preview tools, hosts); every `/api` call answered 500 and the app said "Katalog niedostępny" | Vite log: `connect ECONNREFUSED 127.0.0.1:5174` for `/api/*` while the API answered on :3001 | **potwierdzony błąd** (tooling) | fixed: `apps/web/dev-api-port.ts`, resolved in a `config` hook where `--port` is known; unit tests |
| 3 | Five `--ui-*` tokens used but never defined (`--ui-border` in every Business card and field, `--ui-surface-2`, `--ui-surface-muted`, `--ui-on-accent`, `--ui-selected-soft`) and two local ones (`--a-green-dark`, `--a-ink`). An undefined property drops the declaration: Business had no borders | scan of `var(--…)` against declarations | **potwierdzony błąd** (visual) | fixed: mapped to existing tokens; contract test for every `var()` without a fallback |
| 4 | 182 screen CSS rules at 7–10px (badges, field hints, eyebrows, the phone dock, "Krycie efektywne" at 8px), although the type scale's smallest step is 11px | tour: "tinyText" on every screen | **potwierdzony** (UX, readability on site) | fixed: raised to `--ui-text-xs`; unstyled `<small>` floored at 11px; contract test (SVG labels and print sheet exempt) |
| 5 | The one next action was truncated at 1366–1440px ("Ustaw pierwszą łatę od ok…") | tour: clipped `project-next-action` | **potwierdzony** (UX) | fixed: the action keeps its label, the issue title yields to its icon, the progress dots fold below 1600px; e2e at 1366 and 1440 |
| 6 | Phone Covering screen showed two identical "Parametry / Popraw" buttons | phone screenshot | **potwierdzony** (UX duplication) | fixed: the card's copy hidden where the toolbar offers it; e2e |
| 7 | With readable labels the phone dock cut "Dokumenty" to "Dokume…" | phone screenshot after #4 | regression of #4 | fixed: dock spacing; e2e checks six uncut labels ≥ 11px at 390px |
| 8 | Sidecar prune trusted the project index: an unreadable index lists no projects, so pruning would erase the import evidence of every project; cost estimates of deleted projects were never pruned (preflight finding 13) | `LocalProjectRepository.list()` returns `[]` on a parse error | **potwierdzony** (latent data loss, own VNext-6.1 code) | fixed: `pruneOrphanSidecars` removes a sidecar only when its project RECORD is gone; import evidence and cost estimate both use it; tests with a damaged index |
| 9 | Checkboxes and radios had no visible keyboard focus (global `input:focus-visible { outline: none }`) | keyboard walk: 3 checkboxes, 1 radio in Covering | **potwierdzony** (a11y) | fixed: the reset now applies to framed text inputs only |
| 10 | The range or error under an exact input was not announced with the field | no `aria-describedby` | **potwierdzony** (a11y) | fixed |
| 11 | "Cięcie kalenicy 55°" did not say what the angle is measured from (90° − pitch, to the rafter edge) | quick calculator; AGENTS rule on angle references | **potwierdzony** (domain clarity) | fixed: "Cięcie kalenicy · do krawędzi krokwi" |
| 12 | Header icon buttons (example, language) had no tooltip | hover | minor | fixed |
| 13 | `HipResults`, `ContextualFabrication`, `K1Steps` (~300 lines) rendered nowhere | dead-export scan | **dług** (code) | removed |
| 14 | Business screens were in the first-load bundle | build output | **rekomendacja** → done | lazy: main chunk 1 259 → 1 172 kB (gzip 365 → 345 kB) |
| 15 | Header settings lived inside `Page.tsx` | — | **rekomendacja** → done | `HeaderSettings.tsx` with component tests; `Page.tsx` 3 970 → 3 898 lines |

Checked and found correct: decimal comma, out-of-range values (marked, last valid result kept, message shown), page overflow at all three widths, the document centre and print preview without console errors, project deletion behind a confirmation, all six sections reachable on the phone.

## 3. Not changed (recommendations)

- ~~Both languages are bundled~~ — done in VNext-7B-1: English loads on
  the first switch (`switchLanguage`); main chunk 1 172 → 1 081 kB, gzip
  345 → 317 kB.
- `1 200` (space as a thousands separator) is rejected by the exact inputs.
  The rejection is an explicit test from the first commit; accepting it is a
  product decision, not a defect.
- The main chunk is still 1.17 MB; the next split would be Quick versus
  Creator.
- The journey script stops where a covering product has to be chosen from
  the catalogue; that path is covered by the existing workbench e2e.
