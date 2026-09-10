# RoofCalc — Domain Research Notes & Source Strategy

## Purpose

Use literature to improve:
- vocabulary,
- geometry cases,
- fabrication workflow,
- product backlog,
- validation test cases.

Do NOT use old carpentry books or generic web articles as authority for structural safety.

## 1. Polish vocational domain taxonomy

Polish vocational material for `BUD.02 Wykonywanie robót ciesielskich` is useful for naming and organizing roof systems/components.

Useful taxonomy:
- krokiew,
- murłata,
- płatew,
- jętka,
- kleszcze,
- słup,
- wiatrownica,
- roof/truss systems.

Product use:
- Polish terminology/i18n,
- toolbox categories,
- template vocabulary,
- educational tooltips,
- project component hierarchy.

## 2. Traditional cut-roof joint patterns

Traditional cut-roof guidance describes recurring joints including:
- rafter to wall plate using a birdsmouth,
- rafter to purlin using a birdsmouth,
- purlin joints,
- hip roof connection details.

Product use:
- confirms that `support + seat notch` should be reusable,
- supports adding an intermediate purlin as the first generalization test.

## 3. Common-rafter fabrication sequence

A practical workflow is:
- calculate rafter length plate-to-ridge,
- lay out top plumb cut,
- establish a layout/reference line,
- locate birdsmouth plumb cut,
- determine overhang/tail,
- lay out tail/end cut,
- verify calculations.

Product use:
Turn this into structured `FabricationPlan` and user-facing "Trasowanie krok po kroku".

## 4. Historical carpentry geometry references

Public-domain carpentry references are useful as a geometry/problem catalogue.

Future backlog:
- common rafter,
- plumb cut,
- seat/end cut,
- ridge piece,
- hip/valley rafter,
- side/cheek cut,
- hip/valley length,
- ridge reduction,
- backing a hip rafter,
- jack rafters.

Do not encode old construction practice as current structural compliance.

## 5. Structural design boundary

For Poland/Europe, structural verification belongs under Eurocode 5 / relevant Polish National Annex and project requirements.

RoofCalc currently calculates geometry and fabrication information.

UI must clearly distinguish:
- `geometria / trasowanie`
from
- `weryfikacja konstrukcyjna`.

Future structural module would need explicit normative basis, material class, loads and assumptions.

## 6. Research workflow per new module

Before implementing a new advanced geometry module:

1. collect 2-4 independent references,
2. write `docs/domain/<module>.md`,
3. define vocabulary,
4. define coordinate/reference model,
5. list assumptions,
6. derive formulas geometrically,
7. create hand/reference test vectors,
8. implement pure functions,
9. compare outputs with independent reference examples,
10. only then build UI.
