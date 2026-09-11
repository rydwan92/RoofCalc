# Roof opening framing — terminology and V14 geometry contract

## Purpose and safety boundary

This document records the research basis for the first geometric adaptation of a roof opening in RoofCalc. It is not structural design guidance. The V14 resolver identifies a bounded arrangement and derives member axes and lengths; it does not decide whether the arrangement, timber sections, reinforcement, connections, or fasteners are adequate.

Any real alteration of a load-bearing roof must be verified for the actual roof, loads, material, support system, connections, and applicable regulations by a qualified designer.

## Sources and terminology cross-check

The vocabulary and general arrangement were cross-checked against independent sources:

- Polish vocational material on roof-window installation shows variants with a `wymian`, a cut rafter, and framing around the opening: [PCEZ Bytów — Montowanie okien dachowych, świetlików i wyłazów](https://www.pcez-bytow.pl/download/plk/10-montowanie-okien-dachowych-swietlikow-i-wylazow.pdf).
- A Polish trade case study calls the transverse member a `wymian` and explicitly distinguishes upper and lower members around a roof window: [Nasz Dekarz — Okna połaciowe w starym dachu](https://naszdekarz.com.pl/okna-polaciowe-w-starym-dachu/).
- The USDA handbook diagram labels the transverse elements at a roof opening as `headers`: [USDA / GovInfo — Wood-Frame House Construction](https://www.govinfo.gov/app/details/GOVPUB-A-PURL-gpo18687).
- The International Building Code uses `header rafters` and `trimmer rafters` for framing around roof openings. Its sizing and connection clauses demonstrate why geometry alone is insufficient and are not adopted as Polish structural rules: [ICC — 2012 IBC, Chapter 23](https://codes.iccsafe.org/content/IBC2012P13/chapter-23-wood).
- A manufacturer installation guide confirms that the product opening is a separate installation concern. RoofCalc does not import its clearances or product dimensions into this generic solver: [VELUX / Solstro installation guide](https://afd-solstro.velux.com/-/media/pdfdocuments/solstroinstallationguides/how%20to%20install%20a%20solstro%20roof%20window.pdf).

RoofCalc uses:

- `otwór geometryczny` / `geometric opening` — the plane-local rectangle already stored by the feature model;
- `wymian górny` and `wymian dolny` / `upper header` and `lower header` — transverse timber members at the uphill and downhill sides of the opening;
- `krokiew ograniczająca` / `bounding rafter` — an uninterrupted common rafter on either side of the field;
- `krokiew przerwana` / `interrupted rafter` — a common rafter whose full physical instance is replaced by lower and upper derived segments;
- `obramowanie geometryczne` / `geometric framing` — the complete V14 adaptation intent and its resolved projection.

`Trimmer rafter` is not translated as `wymian`; it corresponds to the side/bounding rafter role. V14 never assumes that it must be doubled.

## Plane-local coordinate system

V14 reuses the V12/V13 orthonormal roof-plane basis:

- `u` is parallel to the eave;
- `v` runs uphill along the plane;
- positions and dimensions are canonical millimetres;
- world points are derived with the existing local/world transforms;
- no SVG or camera coordinates enter the resolver or project document.

For an opening with lower-left plane-local position `(u, v)`:

```text
opening envelope = [u, u + width] × [v, v + height]
lower header axis = v - edgeOffset
upper header axis = v + height + edgeOffset
```

The header length is the clear geometric distance between the inner faces of the two bounding common rafters. End joinery is not resolved in V14.

## Supported V14 case

V14 resolves only when all of the following are true:

- one rectangular roof-window feature lies on one resolved roof plane;
- it intersects at least one ordinary/common K1 rafter;
- parallel common rafters bound the affected field unambiguously on both sides;
- the lower and upper header axes remain strictly inside the plane/member span;
- no accepted adaptation overlaps or competes for the same interrupted-rafter region.

An opening entirely between rafters returns `not-needed`. It remains a geometric opening, but V14 does not add structural members when no K1 is interrupted.

## Explicitly unsupported or invalid

The resolver refuses rather than approximates:

- any H1 hip-rafter or J1 jack-rafter intersection;
- an opening crossing a roof-plane boundary;
- ambiguous eave, ridge, or member-end contact;
- missing bounding common rafters;
- overlapping/competing opening adaptations;
- orphan adaptation intent without its parent feature;
- dormers, chimneys, valleys, irregular roofs, and truss alteration.

The result is discriminated as `resolved`, `not-needed`, `unsupported-complex-boundary`, `invalid-opening`, `no-bounding-rafters`, or `conflict`, with a separate review state of `valid`, `needs-review`, `unsupported`, or `invalid`.

## Canonical intent and invalidation

The project stores only:

- stable adaptation ID;
- parent feature ID;
- manual header section;
- manual plane-local edge offset;
- the signature of the exact roof/member field accepted by the user.

Derived physical IDs, axes, segments, lengths, and SVG shapes are not persisted. A change to roof type, spacing, span, building length, pitch, overhang, opening plane, position, or size changes the current signature. The adaptation then reports `needs-review` and is excluded from composed geometry until the user previews and accepts the current proposal again.

## Structural-design boundary

The following are deliberately absent:

- automatic member sizing;
- automatic doubling or reinforcement of bounding rafters;
- connector or fastener selection/count;
- load path, capacity, deflection, stability, or Eurocode verification;
- manufacturer mounting clearances;
- claims that a result is recommended, safe, sufficient, or approved.

The UI therefore says: `Układ i przekroje wymagają weryfikacji konstrukcyjnej.`
