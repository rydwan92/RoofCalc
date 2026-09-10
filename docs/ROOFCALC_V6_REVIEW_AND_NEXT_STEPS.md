# RoofCalc / CieślaCalc — V6 Review and Next-Step Analysis

## 1. Executive summary

The product has clearly crossed the line from a single-cut calculator into a real **reactive roof-construction workbench**.

Current strengths visible in the latest state:
- dual interaction modes (`Szybkie` / `Kreator`),
- a large central construction canvas,
- parametric roof skeleton rendering,
- support for a hip roof template,
- support for a dedicated hip-rafter prototype (`H1`),
- direct-selection workflow,
- multiple purlins,
- contextual right-side inspector,
- roof-scale metrics visible under the canvas,
- undo/redo and unit switching exposed in the header.

This is already a strong foundation.

However, the application is now entering a more demanding phase. The main risk is no longer “missing a calculator”, but rather:

> the product may become functionally richer while remaining visually and operationally harder than it should be for a working roofer/carpenter.

The next iterations should therefore focus on **clarity, context, speed, member preparation workflow, and visual hierarchy** — not just on adding more formulas.

---

## 2. What is already good

### 2.1 Product direction is now correct
The product is no longer pretending to be only a common-rafter app.
It now behaves like a technical roof workshop.

That is strategically correct.

### 2.2 The skeleton view is the right primary visual model
Showing a roof skeleton gives immediate understanding of:
- roof type,
- span,
- ridge,
- count/repetition of rafters,
- overall construction logic.

This is much stronger than showing only one isolated member.

### 2.3 Hip roof support is a major milestone
The introduction of a hip roof template and a named hip-rafter prototype is important because it proves that RoofCalc can evolve through **template + prototype + instance** architecture.

### 2.4 The app already starts to feel like a work instrument
The combination of canvas, toolbox, inspector, and result cards is the correct shape for a professional tool.

---

## 3. Main weaknesses / friction points observed now

### 3.1 Visual hierarchy is still too weak
The skeleton is mathematically richer than before, but visually still leans toward a dense technical wireframe.

Symptoms:
- too many members are rendered with similar visual weight,
- selected elements do not stand out strongly enough,
- support members and load-bearing logic are not immediately readable,
- the user can see “many lines”, but not always “what matters now”.

### 3.2 The selected element state should be more obvious
When an element is selected, the UI should visually answer three questions instantly:
1. what is selected,
2. where it is in the canvas,
3. what kind of thing it is.

Right now the selection system works, but the visual emphasis can be much stronger and more intuitive.

### 3.3 Roof-level results and member-level results are mixed
The bottom cards still read partly like a single common-rafter summary.
For a hip roof, users also need a roof-level summary such as:
- roof template,
- ridge length,
- number of common rafters,
- number of hip rafters,
- number of jack rafters,
- roof footprint dimensions,
- total roof planes count.

Results should become more contextual.

### 3.4 Missing or underdeveloped member family: jack rafters / kulawki
Once hip rafters exist, the next essential roof member family is jack rafters.
Without them, the hip roof is still incomplete as a preparation/planning tool.

### 3.5 The fabrication experience still needs to become more “job-site useful”
RoofCalc should eventually answer questions like:
- what exact member families exist,
- how many pieces of each,
- what is the typical preparation for each,
- which members are repeated identical pieces,
- what is the cut/cut-angle workflow per member type.

### 3.6 The app still needs a simpler “speed layer”
Even though `Szybkie` exists, the broader product still risks overexposing complexity.
A working roofer often wants:
- a tiny set of inputs,
- immediate outputs,
- an optional “show me visually” step.

### 3.7 Inspector semantics can improve
The right inspector is useful, but it should become more contextual and grouped.
For example:
- Dimensions,
- Placement,
- Joinery/Cuts,
- Fabrication,
- Warnings/Assumptions.

### 3.8 The color system is not yet doing enough work
The UI is pleasant and clean, but color can do more functional work:
- selected member,
- hovered member,
- prototype family,
- supports,
- roof geometry handles,
- caution / unresolved geometry,
- active editing state.

---

## 4. Product direction for the next serious iteration

The next best step is **not** “add random more roof types first”.

The best next step is:

# Iteration 007 — Hip roof completion, jack rafters, contextual fabrication, and visual hierarchy

This should make the product:
- easier to read,
- more useful in real work,
- more complete for the hip-roof workflow,
- more obviously professional.

---

## 5. Recommended goals for Iteration 007

### 5.1 Add jack rafters (`kulawki`) as first-class members
For the hip roof template, generate jack rafters on each side according to the spacing logic.

Must support:
- stable prototype(s) for jack rafters,
- instance generation from the roof template,
- counts,
- selection on canvas,
- contextual inspector,
- preparation/fabrication data.

Important:
A jack rafter must not be “just another line”.
It must be a domain-resolved member with geometry and preparation meaning.

### 5.2 Introduce contextual result modes
Bottom/result areas should change depending on what is selected.

Suggested modes:
- **Roof summary** (when no member or roof root is selected),
- **Prototype summary** (e.g. `K1`, `H1`, `J1`),
- **Instance summary** (specific rafter instance),
- **Support summary** (ridge, wall plate, purlin),
- **Joint/Cut summary** (selected notch/cut).

### 5.3 Improve visual hierarchy in the skeleton
Recommended changes:
- active element color accent,
- dim non-selected members,
- slightly thicker/lighter major members,
- lighter secondary repeated members,
- subtle roof-plane ghost fill,
- clearer handle styling,
- better member hover feedback.

### 5.4 Distinguish prototypes from instances in the UI
Example:
- `K1 — krokiew zwykła (prototyp)`
- `K1/12 — krokiew, lewa połać, pozycja 9600 mm (instancja)`

This is crucial for future cut-list generation.

### 5.5 Create a real fabrication panel
At least for the current selection.

Example outputs:
- prototype code,
- member count,
- section,
- theoretical length,
- stock/minimum material,
- major cuts,
- joinery summary,
- ordered marking steps.

Later this can become a roof-wide cut list.

### 5.6 Improve the “speed layer”
`Szybkie` should be reduced to a truly fast workflow.
Make the common cases incredibly fast.
Builder remains the full editor.

### 5.7 Strengthen geometry/maths contracts
Math improvements should now focus on consistency and test coverage:
- explicit jack-rafter geometry,
- jack-to-hip relationships,
- exact instance positioning,
- consistent template-driven generation,
- ridge and eave deductions,
- purlin interactions where relevant.

### 5.8 Performance / responsiveness
As member count grows, do not let the builder feel sluggish.
Recommended attention areas:
- selector-based state derivation,
- memoized resolved scenes,
- render-layer separation,
- avoid unnecessary full-canvas recomputation.

---

## 6. UX direction in plain language

The builder should increasingly feel like this:

```text
I open the roof.
I immediately understand the roof.
I click what interests me.
The app isolates it and explains it.
I can drag core geometry fast.
I still can enter exact numbers.
I immediately know what to prepare in the workshop.
```

Not like this:

```text
I see many fields and many lines.
I have to decode what is active.
I am not sure whether I am editing the roof, a member, or a detail.
```

---

## 7. Strategic feature order after Iteration 007

Recommended order after the next iteration:

1. **Jack rafters / kulawki** + contextual fabrication (Iteration 007)
2. roof-wide **cut list / grouped preparation sheet**
3. improved **selection/visual hierarchy** and simplified quick mode
4. optional **plan view / side view / focused detail overlays**
5. only then expand toward:
   - valley rafters,
   - more complex roof templates,
   - export/reporting,
   - saved projects/history.

---

## 8. Conclusion

The project is on a very promising trajectory.

The next step should not be “more screens”.
The next step should be **more clarity, more context, more preparation usefulness, and a more readable skeleton**.

If Iteration 007 is done well, RoofCalc will start to feel much less like a calculator and much more like a **professional digital workshop for roof carpentry**.
