# Conservative IFC gable recognition (V61B)

References checked 2026-09-24:

- [buildingSMART IfcRoofTypeEnum](https://standards.buildingsmart.org/IFC/RELEASE/IFC4_3/HTML/lexical/IfcRoofTypeEnum.htm):
  a gable has two slopes descending from a central ridge; a pavilion is pyramidal.
- [buildingSMART IfcRoof](https://standards.buildingsmart.org/IFC/RELEASE/IFC4_3/HTML/lexical/IfcRoof.htm):
  roofs may be aggregates. A container with no own surface is insufficient for
  this first conversion; V61B does not combine arbitrary child elements.
- Installed `web-ifc@0.0.78` node API, independently exercised against our IFC4
  metre fixture: placed mesh coordinates are metres, Y-up `(x,z,-y)`.
  The worker reverses that axis mapping before analysis and rendering. Source
  unit coordinates are obtained with `1000/sourceToMillimetres`; the pure domain
  applies `sourceToMillimetres` exactly once. Unknown units block conversion.

Supported geometry is intentionally narrow: a complete triangulated, symmetric,
two-plane rectangular roof surface with a full-length horizontal ridge and level
eaves. No slab thickness, openings, dormers, hip ends, compound/curved roofs or
aggregate reconstruction. Semantic names provide evidence, never acceptance.

Use source axes and double-precision positions before display recentering.
Subtract a physical reference point before millimetre projection. Top vertices
define a nonzero ridge, whose direction defines longitudinal/crosswise axes.
Every triangle must lie on one slope; boundary edges must lie on the expected
rectangle perimeter, shared edges must occur twice, and projected area must
cover each half rectangle. This rejects incomplete and duplicate surfaces.
Linear tolerance: 0.5 mm or 1e-6 of extent, whichever is larger.

Hand-checked vectors: width 8000 mm, length 12000 mm, half-run 4000 mm,
rise = 4000*tan(35°) = 2800.830152839 mm. Thus atan(rise/half-run) = 35°.
Rotation about Z by 33° and translation by 1e9 source units leave dimensions
unchanged within tolerance. A pyramid has a single highest point and cannot
prove a ridge. A 12000×8000 bounding box alone never proves a gable.

Roof extents do not prove wall/support positions. UI must explicitly require
checking proposed building dimensions and overhang; do not subtract an invented
overhang. Structural system, spacing, section and joints use labelled RoofCalc
defaults and user confirmation, never IFC inference.
