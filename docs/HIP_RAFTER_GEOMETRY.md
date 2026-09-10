# RoofCalc — Hip Rafter Geometry Contract (regular equal-pitch hip)

## Purpose

This document fixes the V6 geometry contract for the first `krokiew narożna` implementation.

It is intentionally limited to:

- rectangular building,
- square corners,
- equal pitch on adjacent roof planes,
- uniform overhang,
- regular hip running at 45° in plan,
- no structural capacity verification.

All canonical lengths are millimetres. Angles exposed by the domain are degrees; trig internals may use radians.

---

## 1. Symbols

```text
r  = common horizontal run / half-span
θ  = common roof pitch above horizontal
e  = uniform horizontal eave overhang
t  = physical ridge-board thickness
w  = hip-rafter width
h  = hip-rafter depth
```

Derived:

```text
q = tan(θ)
```

---

## 2. Common roof rise

The hip reaches the same ridge elevation as the adjacent common rafters:

```text
rise = r * tan(θ)
```

---

## 3. Hip plan run

For a regular square corner, the hip advances `r` in both horizontal plan axes:

```text
hipPlanRun = sqrt(r² + r²)
           = r * sqrt(2)
```

The exact engine uses `sqrt(2)`, never the trade approximation `17 / 12`.

Traditional framing-square references may be displayed as education only.

---

## 4. Hip centerline length

The theoretical wall-corner to ridge-center line length is:

```text
hipLineLength = sqrt(hipPlanRun² + rise²)
```

Equivalent:

```text
hipLineLength = r * sqrt(2 + tan²(θ))
```

---

## 5. Hip slope angle

The hip is shallower than a common rafter because its horizontal plan run is longer while the rise is unchanged.

```text
hipSlope = atan(rise / hipPlanRun)
```

Equivalent:

```text
hipSlope = atan(tan(θ) / sqrt(2))
```

---

## 6. Plumb and seat marking angles

In a vertical plane containing the hip centerline:

```text
plumbToMember = 90° - hipSlope
seatToMember  = hipSlope
```

UI labels must state the reference explicitly. Avoid generic labels such as `cut angle` without explaining the line/face/reference.

---

## 7. Hip cheek / side-cut / layout angle

Let a unit common run be 1.

Then:

```text
planUnit = sqrt(2)
lineUnit = sqrt(2 + tan²(θ))
```

The regular hip side-cut/top-face layout angle is:

```text
cheekAngle = atan(planUnit / lineUnit)
```

Equivalent:

```text
cheekAngle = atan(
  sqrt(2) / sqrt(2 + tan²(θ))
)
```

This corresponds to the traditional hip/valley side-cut setting for a square-corner equal-pitch roof.

It is not the same angle as the hip slope.

---

## 8. Hip backing / bevel angle

The regular hip backing angle is:

```text
backingAngle = atan(tan(θ) / lineUnit)
```

Equivalent:

```text
backingAngle = atan(
  tan(θ) / sqrt(2 + tan²(θ))
)
```

This is the angle historically used to describe backing the upper arrises of a hip so adjacent roof planes can bear correctly.

V6 may calculate and illustrate this angle without automatically deciding that a particular hip must be backed rather than dropped. That is a fabrication/detail choice, not a structural-safety verdict.

---

## 9. Overhang / hip tail

With equal horizontal overhang `e` along both adjacent eaves, the plan extension of the hip beyond the wall corner is:

```text
hipTailPlanRun = e * sqrt(2)
```

The sloping line extension is:

```text
hipTailLineLength = e * sqrt(2 + tan²(θ))
```

The total theoretical line from outer eave corner to ridge center is therefore:

```text
totalTheoreticalHipLine = (r + e) * sqrt(2 + tan²(θ))
```

---

## 10. Ridge deduction

For a regular hip approaching the end of a vertical ridge board of physical thickness `t`, use an explicit centerline-to-face deduction convention.

At 45° in plan:

```text
ridgePlanDeduction = t / sqrt(2)
```

Convert this plan distance to distance along the sloping hip axis:

```text
ridgeAxisDeduction = ridgePlanDeduction / cos(hipSlope)
```

Then:

```text
hipLineToRidgeFace = hipLineLength - ridgeAxisDeduction
```

If overhang is included in the fabrication reference:

```text
outerEaveToRidgeFace = totalTheoreticalHipLine - ridgeAxisDeduction
```

The API/result model must distinguish:

- theoretical centerline length,
- ridge plan deduction,
- ridge axis deduction,
- physical line length to ridge face.

Do not hide this inside a single unexplained `length` number.

---

## 11. Reference regression case: 1000 mm / 30°

Input:

```text
r = 1000 mm
θ = 30°
e = 0
t = 0
```

Expected approximately:

```text
rise                    577.3502691896 mm
hipPlanRun              1414.2135623731 mm
hipLineLength           1527.5252316519 mm
hipSlope                22.2076542986°
plumbToMember           67.7923457014°
seatToMember            22.2076542986°
cheekAngle              42.7941371071°
backingAngle            20.7048110546°
```

Use tolerances appropriate for floating-point tests. Do not round calculations to display precision.

---

## 12. Reference regression case: 6/12 pitch

A 6/12 common pitch is:

```text
θ = atan(6/12) ≈ 26.5650511771°
```

Per 12 units of common run:

```text
hip plan run ≈ 16.9705627485
hip line length = 18.0
hip slope ≈ 19.4712206345°
cheek/layout ≈ 43.3138566583°
backing ≈ 18.4349488229°
```

The exact 16.97056 value explains the traditional framing-square `17` convention.

---

## 13. Hip roof rectangular plan

For V6:

```text
span = 2r
L = building length
L >= span
```

Ridge height:

```text
ridgeHeight = r * tan(θ)
```

Theoretical ridge length:

```text
ridgeLength = L - 2r
```

If:

```text
L = 2r
```

then:

```text
ridgeLength = 0
```

and the template is a pyramidal hip with one apex.

No negative ridge length is allowed in V6.

---

## 14. World coordinates for skeleton

Use:

```text
X = span direction
Y = building length / ridge direction
Z = vertical
```

Wall corners:

```text
A = (-r, 0, 0)
B = (+r, 0, 0)
C = (-r, L, 0)
D = (+r, L, 0)
```

For `ridgeLength > 0`:

```text
R1 = (0, r, ridgeHeight)
R2 = (0, L-r, ridgeHeight)
```

Hip centerlines:

```text
A → R1
B → R1
C → R2
D → R2
```

For the square/pyramid case, `R1 == R2`.

---

## 15. Fabrication visualization contract

Hip geometry is inherently spatial. Do not attempt to explain H1 using only one side view.

The H1 technical sheet should derive three coordinated representations from the same result:

### Plan view

Shows:

- square corner,
- common run,
- exact diagonal plan run,
- 45° hip direction,
- ridge center/face reference,
- plan ridge deduction.

### Hip elevation

Shows:

- rise,
- hip plan run projected as horizontal basis,
- hip line length,
- hip slope,
- ridge axis deduction,
- plumb/seat layout.

### Top/cross-section detail

Shows:

- cheek/layout angle,
- symmetric double-cheek concept for a regular hip ridge end where appropriate,
- backing/bevel angle in a dedicated cross-section/detail.

Each dimension or angle must state its reference edge/face.

---

## 16. Structural boundary

This contract is geometric/fabrication-oriented.

It does not decide:

- required hip-rafter structural size,
- allowable notch depth,
- required backing vs dropping,
- connection hardware,
- load capacity,
- code compliance.

Any future structural module must version and state its normative basis separately.

---

## 17. Research cross-checks

Useful independent references for V6 verification:

- Ira Samuel Griffith, `Carpentry`, Project Gutenberg, Chapter III: hip/valley plumb cut, side/cheek cut, length, ridge reduction and backing.
- Fine Homebuilding, `Framing a Hip Roof`: practical explanation of the 45° plan direction and 17-inch hip run convention.
- JLC / Training the Trades, `One Way to Lay Out and Cut a Hip Rafter`: practical 6/17 hip plumb-cut workflow.

The engine should derive values from exact geometry and use historical tables only as independent reference checks.
