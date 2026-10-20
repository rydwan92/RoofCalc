# Carpentry connection practice (VNext-4)

## Status and boundary

Research note behind `packages/connection-core/src/practice.ts` — the
"Zaproponuj połączenia" assistant in the connection plan.

The assistant proposes **connection types only** (which fastener family or
steel connector is usual at a node), from two answers the carpenter gives:

1. how the roof timber is joined — carpentry cuts with dowel-type fasteners,
   or steel carpentry connectors where they are usually used;
2. how the wall plate is anchored — anchor rods in the ring beam, perforated
   straps, or not decided yet.

It never proposes a diameter, a number of fasteners, a spacing or a
capacity. Every source below says the designer sizes the connection
according to the forces (e.g. Murator: the designer chooses the rafter–wall
plate connection depending on the thrust; KB.pl: final dimensions come from
the designer's calculation). That is ADR-014: the plan records decisions and
checks detailing, never capacity. A proposal becomes project intent only
when the user applies it; a node the user already decided is kept unless
the user ticks it explicitly; a note is always kept. Applying is one history
entry.

## Node-by-node practice

| Node | Carpentry joints | Steel connectors | Sources |
| --- | --- | --- | --- |
| Rafter / jack – wall plate | birdsmouth (zacios) + nails, usually skew-nailed | birdsmouth + rafter tie (łącznik krokwiowy) nailed | KB.pl, Murator |
| Hip rafter – wall plate | birdsmouth on the plate corner + nails | angle bracket (kątownik) + nails | Murator |
| Rafter / jack – purlin | birdsmouth + nails | rafter tie + nails | KB.pl (płatwiowo-krokwiowe łączniki), Murator |
| Purlin – hip rafter | no single common detail → designer | no single common detail → designer | — |
| Collar tie – rafter | lapped (nakładkowe), bolts in drilled holes | lapped, timber screws (wkręty ciesielskie) | Inżynier Budownictwa 2021 |
| Rafter – ridge (board or paired) | nailed to the ridge board / each other | structural screws | AWC (ridge board as nailing surface), Murator |
| Hip rafter – ridge | nailed | structural screws | AWC |
| Jack – hip rafter | skew (cheek) cut to the hip side face + nails | sloped/skewed hanger | Simpson Strong-Tie LSSJ |
| Header – rafter, interrupted rafter – header | nailed | joist hangers (wieszaki belek) | Murator (wymiany, wsporniki belek) |
| Wall plate anchorage | anchor rods (pręty gwintowane) cast into the ring beam, on a damp-proof layer | perforated straps | KB.pl, Murator |
| Counter-batten – rafter, batten – counter-batten | nails at every crossing | nails | PN-EN 1995-1-1 (nailed connections) |

Things the sources state that RoofCalc deliberately does **not** turn into
rules: anchor spacing (KB.pl mentions ≈ 1.5 m and M12–M16 rods), plank
cover-plate thickness, ring sizes. They are design values with one popular
source each — ADR-014 requires two independent sources and hand-checked
vectors before any number enters the package.

The Inżynier Budownictwa article also warns against mixing fastener types in
one joint (they deform differently). The connector proposals therefore pair
a connector only with the nails it is fixed with, never a second fastener
family.

## Alternatives

Each proposal lists the other fastener and connector types the catalogue
offers at that node (`CONNECTION_TYPES[...].nodes`), so the user can choose
another without leaving the assistant. Carpentry interfaces (seat notch,
ridge cut, hip cuts) are not alternatives: they have a canonical home in the
structure and stay there.

## Regression

`packages/connection-core/src/practice.test.ts`:

- every proposed type is offered by the catalogue at that node, for every
  answer combination (so a proposal can never break the plan schema);
- no diameter, count or note is ever proposed;
- the chosen style decides the seat and the jack–hip node;
- purlin–hip and an undecided anchorage stay with the designer;
- applying keeps decided nodes and notes unless asked, and the result
  parses with `roofConnectionPlanSchema`.

`apps/web/src/assembly/connections/connections-ui.test.tsx`: answer, apply
as one history entry, decided ridge kept, undo.

## Sources (retrieved 2026-10-19)

- Murator — [Łączniki i okucia ciesielskie do więźby](https://muratordom.pl/budowa/dach/laczniki-ciesielskie-okucia-ciesielskie-do-wiezby-jak-laczyc-elementy-wiezby-aa-ZzYd-k88V-Jv7U.html)
- KB.pl — [Wybór murłaty krok po kroku: wymiary, mocowanie](https://kb.pl/dachy/wiezba-dachowa/wybor-murlaty-krok-po-kroku-wymiary-mocowanie-ceny-izolacja)
- Inżynier Budownictwa (PIIB), 2021 — [Połączenie jętka-krokiew](https://inzynierbudownictwa.pl/polaczenie-jetka-krokiew/)
- Murator — [Montaż okien połaciowych do konstrukcji dachu](https://muratordom.pl/budowa/okna/montaz-okien-polaciowych-do-konstrukcji-dachu-aa-APFE-jT9d-pxFU.html)
- Simpson Strong-Tie — [LSSJ installation guide](https://www.strongtie.com/resources/product-installers-guide/lssj-installation)
- American Wood Council — [Lumber Ridge Boards](https://awc.org/resources/wood-products/roof/lumber-ridge-boards/)
- PN-EN 1995-1-1 (Eurokod 5), sections 8 and 10 — already referenced by the
  connection catalogue.
