# V49 — stock-aware linear planning and the batten catalogue

Status: IMPLEMENTED. Starting HEAD: `2913dec` (V48).

V48 made battens and counter-battens buyable. V49 makes the plan choose its
joints *against the stock it will be cut from*, and connects it to real,
verified catalogue products with price provenance.

Research: `docs/domain/BATTEN_STOCK_AND_JOINING_RESEARCH.md` (joining),
`docs/domain/BATTEN_COMMERCIAL_PRODUCTS_RESEARCH.md` (products and prices).

## Definition of Ready

1. **User problem:** V48 split each run evenly before looking at stock, so a
   6,2 m counter-batten became 3,1 + 3,1 m — neither fits a 3 m length, so it
   bought two 4 m lengths. The user also had to type lengths with no link to
   anything they could actually buy.
2. **Domain owner:** the choice *between legal assemblies* stays in
   `packages/linear-procurement`; all stock accounting stays in
   `procurement-core`, which scores every candidate. The catalogue field lives
   in `catalog-core`; the application only bridges.
3. **Canonical persistence:** the user's decision grows two additive fields
   (`source`, per-length `catalogRef`). The plan stays derived.
4. **Schema / migration:** no version bump, no migration (`SCHEMA_REGISTRY.md`
   §1, §10). Every V35 timber revision stays valid and immutable.
5. **Undo / history:** choosing catalogue or manual lengths is one ordinary
   undoable edit, as in V48.
6. **Quantity:** unchanged. The installation requirement is still the resolved
   geometry.
7. **Procurement:** `createCuttingPlan` is unchanged and is the only packer.
8. **Catalogue:** four verified products; source-declared applications.
9. **Cost:** a catalogue length with exactly one per-piece price entry is
   suggested with its provenance; accepted lines are never silently refreshed.
10. **Offline:** manual planning needs neither database nor catalogue.
11. **Mobile:** single-column panel at 390 px, comparison stacks.
12. **Research:** both documents above, dated and sourced.

## 1. The V48 limitation, proven first

`stock-aware.test.ts` opens with the counterexample before the fix:

| Fixture | V48 (valid) | V49 |
| --- | --- | --- |
| 1 × 6,2 m counter-batten, 3/4/5 m | 3,1 + 3,1 → **8 m** | legal 4 + 3 split → **7 m** |
| 4 × 5,5 m (the case V48 documented) | 8 × 2,75 m → **24 m** | shared stock → **23 m** |
| 8 × 6,2 m | **64 m** | **≤ 53 m** |
| 4 × 12 m battens on 800 mm rafters | **51 m** | **< 51 m**, joints still on rafters |

Every V48 plan in that table is legal; V49 finds a *different legal*
arrangement with a better purchase score.

## 2. Algorithm (`planStockAwareAssembly`)

```
runs ─► V48 assembly (baseline)            planLinearAssembly, unchanged
     ─► legal candidate splits per run      same legality as V48
     ─► rank locally, keep ≤ K per run      ranking only, never the score
     ─► group identical runs
     ─► search over group assignments       every state scored by createCuttingPlan
     ─► re-pack the winner with full limits; keep V48 unless it still wins
```

**Candidates.** `joint-at-support`: paths over the run's resolved support
stations with at most one piece more than the minimum, bounded by
`maxEnumeratedPathsPerRun`. `joint-along-supporting-member`: even divisions,
one whole usable commercial length first or last, and two-pieces-per-length
pairs. Every candidate passes the same checks as V48 — longest stock, minimum
piece, minimum supports, explicit raking allowance — so commercial
optimisation can never make an illegal joint legal.

**Global score.** A state is priced by packing **all** pieces of **all** runs
at once, so pieces from different runs share commercial lengths. This is the
value over V48: a 1,5 m offcut piece is only worth creating if another run's
piece fills the rest of that length.

**Comparison of two complete states**, first difference wins:

1. fewer unassigned pieces (a valid, complete installation);
2. the user's objective — `procurement-core`'s own lexicographic
   `comparePlanScores`, with its signature tie-break neutralised;
3. fewer joints;
4. fewer stagger violations;
5. a stable state signature (determinism).

The stagger rule is also a hard acceptance condition: a move may never raise
the number of stagger violations above the current state's. Joints and stock
are optimised for **one** objective, never one each.

**Search.** Identical runs (same length, ends, support offsets *and* V48
split) form a group, and a state is how many runs of each group use each
candidate. Rows of one group are interleaved across candidates so joints
alternate between courses.

- If the whole space fits the evaluation budget it is enumerated.
- Otherwise a deterministic first-improvement local search moves runs between
  candidates, **largest move first** — identical runs usually want the same
  split, so moving a whole group converges in one evaluation.

**No regression.** Candidates are compared on a cheap packing budget; the
winner is then re-packed with the caller's full limits and kept only if it
still beats the V48 plan re-packed the same way. Otherwise the V48 assembly
is returned unchanged (`improvedOverBaseline: false`).

## 3. Bounds and honesty

| Limit | Default | Meaning |
| --- | --- | --- |
| `maxCandidatesPerRun` | 6 | legal splits kept per run (V48 split always included) |
| `maxEnumeratedPathsPerRun` | 256 | support paths enumerated before ranking |
| `maxEvaluations` | 80 | complete-plan packings the search may spend |
| `searchStateBudgetPerStockClass` | 1500 | packer budget while comparing candidates |

Optimality is reported, never implied:

| Internal | User sees |
| --- | --- |
| `proven-within-search-space` (enumerated, exact packing) | "Plan gotowy" — "najlepszy z rozważonych wariantów łączeń" |
| `heuristic` | "Plan znaleziony — wynik przybliżony" |
| `search-budget-exhausted` | "Plan znaleziony — wynik przybliżony"; advanced: "limit obliczeń osiągnięty" |

"Optymalny" is never shown. Even a proven result is only best *among the
candidates considered*, and the UI says exactly that.

## 4. Performance

Measured on real geometry through `planLinearPurchase`:

| Roof | Material | Runs | Candidates | Evaluations | Time | V48 → V49 purchased |
| --- | --- | --- | --- | --- | --- | --- |
| gable 16 m | battens, six lengths | 32 | 192 | 17 / 80 | 17 ms | 544 m → **512 m** (= installed) |
| gable 16 m | counter-battens, 4 m only | 42 | 252 | 43 / 80 | 19 ms | 336 m → **252 m** |
| gable 16 m | counter-battens, 3/4/5 m | 42 | 252 | 38 / 80 | 17 ms | 252 m → **231 m** (230,7 m installed) |
| gable 8 m | counter-battens, 4 m only | 22 | 132 | 43 / 80 | 19 ms | 176 m → 144 m |

The stress test (43 runs incl. an opening row, 800 mm rafters) stays inside
the budget and returns a complete, legal plan. The plan is memoised on
exactly the facts that change it — resolved runs, lengths, availability,
cutting settings, objective — so opening a disclosure, moving the camera,
selecting an element or opening the estimate never recomputes it.

## 5. Catalogue

`TimberStockTechnicalSpec.declaredApplications?` (`batten`,
`counter-batten`, `structural-framing`, `general`) — **what the source
declares**, never a structural adequacy statement. Additive under schema
version 1; absent means *not declared*. The technical preview carries it and
`treated`, so the picker filters from summaries: no JSON query in the
database, no API change (`?kind=timber-stock` is unchanged).

Seeded (immutable batch `timber-linear-stock-2026-09.json`): two Castorama
Complex 40×60 lengths and one BAT 40×60×4000 as `batten`, and a BAT
25×50×4000 marketed for garden use as `general`. Prices
(`timber-linear-prices-2026-09-18.json`): the two BAT items, whose pages state
"Cena zawiera VAT 23%". Castorama prices have no stated tax basis and are
deliberately omitted.

**Bootstrap** (disposable MariaDB on port 3399 from the XAMPP binaries):
migrate + seed + smoke-check `ok: true`, timber-stock 4 → 8, one batten price;
a second seed reports `new = 0, conflicts = 0` for all eleven batches.

## 6. Surfaces

- **Purchase panel.** Material → *Źródło długości* `[Z katalogu] [Ręcznie]` →
  plan → price. Catalogue mode lists only products declared for this use, in
  the project's section, where 40×60 and 60×40 are the same stock. Another
  section is offered only as the explicit "Zmień przekrój projektu na …".
  Undeclared same-section products are counted, not offered. One source per
  plan; switching never mixes provenance. Manual mode accepts custom lengths
  in metres and never commits an unparsable value.
- **Result.** Pieces, purchased and waste lead; then the breakdown per
  commercial length with product and `KATALOG` / `RĘCZNIE`; a two-column
  comparison against the V48 split when V49 improved on it; then installed,
  reusable offcuts and utilisation. Joints, solver effort and plan quality
  live in the advanced block.
- **Material Plan.** The row names the commercial lengths and their products
  with a source badge. A planned row shows no per-metre price picker: it is
  bought per piece, and one row can hold several lengths, so a metre price
  would multiply the wrong unit.
- **Cost.** One line per commercial length (`Łaty 60×40 × 4 m · product`),
  piece quantity, `procurement-stock` basis. A catalogue length with exactly
  one per-piece price entry gets it suggested with its date and a
  "zweryfikuj przed zakupem" note; a per-metre or ambiguous price is never
  applied. Accepted lines keep the existing update/keep workflow.
- **Documents.** The material list names section, commercial length,
  quantity and product for each length; the grouped cut patterns stay in the
  panel and the execution annex. No document recomputes anything.
- **Readiness.** The catalogue is optional: an unavailable catalogue says
  "Katalog chwilowo niedostępny — możesz podać długości ręcznie." and blocks
  nothing.

## 7. Deliberately not done

- **Price-aware objective** ("Najniższy koszt materiału"). Only two of the
  four products have a trusted price, and a cost objective over a partially
  priced stock set would silently prefer whatever happens to be priced. It
  should arrive together with complete price coverage.
- **Choosing between two products of the same length.** They are
  interchangeable to the packer, which picks deterministically by option ID;
  RoofCalc does not choose a retailer.
- **Counter-batten catalogue products.** None is reachable and marketed as a
  *kontrłata* (see the product research §4).

## 8. Known limitations

- The search is a bounded local search, not a proof over every legal
  assembly; it can miss a better mix that needs several coordinated moves.
- Candidate ranking uses a local fill heuristic, so a split whose value only
  appears through a rare combination may be pruned before scoring.
- Remote shared DEV was reachable but rejected the configured credentials, so
  it was not seeded (bootstrap was proven on a disposable database).
- XAMPP's bundled MariaDB 10.4 in strict mode rejects the importer's ISO
  `…Z` timestamps; CI and the remote use 10.11. Local bootstrap on XAMPP needs
  a relaxed `sql_mode` until the importer writes a 10.4-compatible format.
