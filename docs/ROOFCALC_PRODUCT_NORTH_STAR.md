# RoofCalc / CieślaCalc — Product North Star

## 1. Product identity

RoofCalc is not a loose collection of roof calculators.

The long-term product is a **parametric roof project, fabrication and estimating workbench** for carpenters, roofers, roofing-company owners, estimators and people preparing roof work.

The current product focus remains:

> timber roof structure + geometry + joints/cuts + fabrication guidance + clear interactive visualization.

Future modules must extend the same project model instead of becoming disconnected mini-apps.

---

## 2. Long-term project model

The architecture should remain compatible with this direction:

```text
Project
├── Building / footprint
├── Roof geometry
│   ├── roof planes
│   ├── ridge / hips / valleys
│   └── subassemblies
├── Timber structure
│   ├── common rafters
│   ├── hip rafters
│   ├── jack rafters
│   ├── wall plates
│   ├── purlins
│   ├── collar ties / jętki
│   ├── posts
│   ├── struts / braces
│   └── headers / trimmers later
├── Openings / obstacles
│   ├── roof windows
│   ├── chimneys
│   ├── generic openings
│   └── dormers
├── Roof build-up
│   ├── membrane
│   ├── counter battens
│   ├── battens
│   └── covering
├── Fabrication
│   ├── cuts / notches
│   ├── marking / trasowanie
│   ├── preparation checklists
│   └── member schedule
├── Quantities
├── Costing
├── Documentation / PDF
└── Revisions
```

Not all modules are implemented now. Current iterations must simply avoid architectural decisions that block them.

---

## 3. Key product rule — rich model, selective view

The canonical project may eventually contain hundreds or thousands of objects.

The UI must never force the user to see all of them at once.

> **Rich model, selective view.**

Use view presets, contextual selection, isolation, filtering, semantic emphasis and a dynamic legend instead of a permanent wall of checkboxes.

Recommended future view presets:

```text
Konstrukcja
Cięcia
Montaż
Pokrycie
Kosztorys
```

Only presets that have real implementation should be enabled.

---

## 4. Timber structure — current and near-future core

Current and planned timber member families:

- K1 common rafters,
- H1 hip rafters,
- J1 jack rafters,
- valley rafters later,
- wall plates,
- ridge members,
- purlins,
- collar ties / jętki,
- posts,
- struts,
- braces,
- opening headers/trimmers later.

Every meaningful member family should eventually support:

- stable prototype/family identity,
- physical instances,
- section,
- placement,
- exact resolved geometry,
- joints/cuts,
- fabrication plan,
- quantities.

Do not duplicate a full fabrication calculation for identical physical instances.

---

## 5. Openings and special roof elements — future

Future objects include roof windows, chimneys, generic openings and dormers.

An opening is not decorative SVG. It participates in geometry:

```text
opening
↓
collision with members
↓
affected rafters
↓
required adaptation
↓
headers/trimmers or another explicit construction response
```

An early implementation may only detect and report collisions. Automatic construction modification should be introduced only with an explicit, tested domain contract.

A dormer should be a **subassembly** with its own roof planes/members and an opening in the parent roof, not one flat object.

---

## 6. Fabrication language

RoofCalc must distinguish:

### Trasowanie
Marking/layout before machining:

- choose datum/reference,
- measure distance,
- mark plumb line,
- project line,
- mark seat/notch,
- verify control dimensions.

### Cięcie
Actual material-removal operation.

Recommended umbrella concept:

```text
Przygotowanie elementu
├── Trasowanie
├── Cięcia
└── Wymiary kontrolne
```

The full roof gives context. A local detail preview explains execution.

---

## 7. Fabrication package — future document source

The application should progressively build a reusable structured fabrication package rather than only rendered text.

Conceptually:

```text
RoofFabricationPackage
├── MemberFamily K1
│   ├── count
│   ├── section
│   ├── representative / grouped lengths
│   └── operations
├── MemberFamily H1
├── MemberFamily J1
└── Support members
```

Each operation can expose:

- exact canonical dimensions,
- datums/reference edges,
- cut geometry,
- marking steps,
- detail-preview projection,
- warnings/assumptions.

This package should later feed PDF generation without recalculating geometry.

---

## 8. Project persistence — future requirement

Projects will need to be saved by users.

Do not implement persistence prematurely, but canonical project state must remain serializable and schema-versioned.

Future concepts:

```text
User
Project
ProjectRevision
ProjectSnapshot
ExportArtifact
```

A generated worker instruction or PDF must always identify the exact project revision it came from.

Transient UI state such as selection, hover, drawer visibility, pan/zoom and collapsed panels must not be part of the canonical project snapshot.

---

## 9. Authentication — future requirement

Future user system:

- registration,
- login,
- logout,
- password reset,
- secure sessions,
- project ownership/authorization.

Passwords must never be stored in plaintext. Prefer Argon2id or an appropriately configured bcrypt implementation. Prefer HTTP-only secure cookie sessions for a same-origin web deployment unless architecture requirements later justify another approach.

Authentication/database code must remain outside math/geometry packages.

---

## 10. Revisions

Projects should eventually support revisions:

```text
REV 1 — initial roof
REV 2 — pitch changed
REV 3 — roof window added
REV 4 — purlin moved
```

Documentation must reference its revision so workshop/site instructions cannot silently change when the live project is later edited.

---

## 11. PDF / worker instruction package — future

PDF must not be a screenshot export.

Future output should be a structured execution package, for example:

```text
01 Project summary
02 Overall roof skeleton
03 Member schedule
04 K1 — common rafter
   - member drawing
   - notches
   - ridge cut
   - marking sequence
05 H1 — hip rafter
   - plan/elevation
   - compound cut
06 J1 groups
07 Supports
08 Preparation / installation notes
```

PDF rendering must consume canonical fabrication/project data and never contain a second calculation engine.

---

## 12. Quantity engine — future

Each module should eventually expose quantities through a generic contract, for example:

```ts
interface QuantityItem {
  id: string;
  category: string;
  materialOrProductKey?: string;
  unit: 'pcs' | 'm' | 'm2' | 'm3';
  quantity: number;
}
```

Examples:

- timber pieces / linear metres / volume,
- battens,
- counter battens,
- membrane area,
- covering area,
- roof tiles,
- sheet roofing.

---

## 13. Covering module — future

Roof tiles and sheet roofing belong to a separate module.

Pipeline:

```text
RoofPlane geometry
↓
opening deduction
↓
net covering area
↓
product specification
↓
quantity calculation
↓
price engine
```

Product/pricing data may later come from manual user input, company price lists, supplier feeds or producer data.

Never couple product prices to `roof-math`.

---

## 14. Costing — future

A separate Cost Engine should combine quantity data with commercial rules such as:

- unit price,
- waste factor,
- transport,
- labour,
- margin,
- VAT.

Possible outputs:

- internal material estimate,
- contractor estimate,
- customer quotation.

Geometry remains independent from commercial rules.

---

## 15. Long-term architecture boundary

Conceptually preserve:

```text
Project Model
├── Geometry Engine
├── Fabrication Engine
├── Quantity Engine
├── Visualization / Workbench
├── Cost Engine
└── Export Engine
```

Current work is concentrated on Project/Assembly Model, Geometry, Fabrication and Visualization.

Future engines must attach without forcing a rewrite.
