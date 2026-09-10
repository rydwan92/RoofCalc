# RoofCalc / CieślaCalc — V7 Review and V8 Direction

## 1. Executive assessment

The project has reached an important product threshold.
It is no longer just a roof-cut calculator. It is becoming a **reactive digital roof workshop**.

From the latest state visible in the product:
- Quick Calc has become cleaner and more focused,
- Builder now handles a richer roof skeleton,
- roof-level summaries are visible,
- preparation cards are starting to communicate “what to prepare”,
- hip-roof and hip-rafter concepts are already present,
- the application has a consistent visual language foundation.

This is good progress.

However, the next bottleneck is no longer “add another formula”.
The bottleneck is now:

> how quickly and intuitively can a roofer/carpenter understand **where to cut**, **what the cut looks like**, and **how to mark it out**?

That means the next quality jump should focus on:
- cut-detail understanding,
- fast visual orientation,
- contextual local previews,
- selection clarity,
- simpler editing workflow,
- more intelligent UI around fabrication.

---

## 2. What is already working well

### 2.1 Quick Calc is finally becoming useful
The simplified fast view is going in the right direction:
- fewer distractions,
- obvious inputs,
- visible results,
- compact drawing,
- direct “Open in Builder” handoff.

This should remain the “3 values → answer now” mode.

### 2.2 Builder has the correct general layout
The current structure is already product-correct:
- left toolbox,
- central canvas,
- right inspector,
- lower summary / preparation area.

That is the right long-term shape.

### 2.3 The skeleton is much more understandable than earlier versions
The move from isolated element drawings toward a roof skeleton is absolutely correct.
It helps users understand roof context and repetition.

### 2.4 Preparation summary is an important product asset
The new “co przygotować” direction is strategically strong.
This is the bridge between geometry and actual workshop usefulness.

---

## 3. Main gaps visible now

### 3.1 The app still does not sufficiently explain the cut itself
The user can often know the value, but not yet clearly see:
- where exactly the cut starts,
- which face is cut,
- how the cut looks from near view,
- what dimensions belong to that specific cut,
- how to mark it step-by-step.

This is the biggest immediate opportunity.

### 3.2 Detail access is still too indirect
A roofer should be able to click a notch/cut and immediately get:
- a focused zoomed preview,
- dimensions for that local cut,
- naming of faces/edges,
- short marking instruction.

Today the app is richer, but the local detail workflow can become much smarter.

### 3.3 The toolbox can become faster and more compact
The current toolbox is understandable, but it can evolve into a more efficient tool panel with:
- collapsible groups,
- quick actions,
- compact icon mode,
- section-level summaries,
- “jump to selected element type”.

### 3.4 Selection semantics need one more level of product polish
The user should always instantly understand:
- roof selected,
- member prototype selected,
- member instance selected,
- support selected,
- cut selected.

That meaning should be visible not only in the right panel, but also in the canvas behavior and lower detail panels.

### 3.5 The app needs a “micro-detail visualization system”
The next step is not full CAD.
The next step is a smart layer of:
- local detail cards,
- magnified cut previews,
- small orientation diagrams,
- mini orthographic views,
- face-aware dimension annotations.

---

## 4. Best next direction: Iteration 008

The most valuable next iteration is:

# Iteration 008 — Cut Detail Previews, Smart Detail Drawer, and Faster Builder UX

The point is to make the product significantly better at showing **how to execute the cut**, not only calculating it.

---

## 5. What Iteration 008 should achieve

### 5.1 Introduce a cut-detail preview system
When a user selects:
- birdsmouth / zacios,
- ridge cut,
- hip cut,
- support contact,
- similar fabrication-relevant joint,

the app should show a **focused local preview**.

This preview should be:
- zoomed in,
- visually clean,
- dimensioned,
- contextual,
- easy to understand.

### 5.2 Add a “detail drawer” / smart detail panel
The app needs a dedicated but lightweight place for local detail previews.

Suggested behavior:
- on desktop: bottom sheet / drawer / docked panel,
- on mobile: swipeable bottom sheet,
- opens automatically when a cut/joint is selected,
- can be collapsed or pinned.

This panel should show:
- enlarged local drawing,
- labels of key points,
- dimensions,
- short marking instructions,
- cut type name,
- related element identity.

### 5.3 Make the canvas react more intelligently
When a cut is selected:
- canvas can highlight that region,
- optionally auto-focus or offer “zoom to detail”,
- related member remains emphasized,
- irrelevant geometry gets muted.

This gives the user much better orientation.

### 5.4 Upgrade Quick Calc preview cards
Quick Calc should show not only numeric output, but also a compact visual “what the cut looks like” preview.
This is especially valuable for:
- common rafter birdsmouth,
- ridge cut,
- hip rafter upper cut.

### 5.5 Improve toolbox UX
Add a more professional tool-panel behavior:
- collapsible groups,
- compact mode,
- quick add actions,
- better active-state feedback,
- optional “selected item” shortcut.

### 5.6 Improve fabrication guidance
For selected joints/cuts, show concise execution guidance such as:
- “measure from top edge”,
- “mark plumb line at 55°”,
- “project vertically to bottom edge”,
- “seat cut 100 mm toward heel”,
- “verify remaining section”.

This should come from structured fabrication data, not freehand strings embedded everywhere.

---

## 6. Product idea in plain language

The next version should make the user feel:

```text
I click the cut.
I immediately see a close-up.
I understand what surface is being removed.
I see the exact dimensions.
I know how to mark it.
I can go back to the whole roof instantly.
```

That is the correct direction.

---

## 7. Strategic order after V8

Recommended order:
1. V8 — cut detail previews + smart detail drawer + faster toolbox UX,
2. V9 — grouped roof-wide cut list / fabrication sheet,
3. V10 — deeper member-instance workflow + advanced detail overlays,
4. only later broader roof families / exports / project persistence.

---

## 8. Conclusion

The product direction is strong.
The next win should come from **better communication of local cuts and execution details**.

If V8 is done well, RoofCalc will become much more valuable on site and in the workshop, because it will not just say **how much**, but also show **how it should look and where to cut**.
