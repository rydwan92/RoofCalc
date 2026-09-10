# Gable Roof Template Geometry

## Scope

Iteration 004 adds a symmetric gable-roof template above the existing common-rafter assembly. It explains repeated construction members without replacing the precise 2D fabrication geometry.

## Canonical inputs

All lengths are millimetres and angles are degrees at the domain boundary.

- `buildingLengthMm` runs along world Y.
- `halfRunMm` is the horizontal wall-to-ridge run on world X.
- `pitchDeg` controls the roof plane and rafter cross section.
- `eaveOverhangMm` extends each rafter beyond its wall plate.
- `rafterSpacing` declares either `fit-evenly` or `fixed-spacing`.
- wall plate, ridge, section and intermediate purlins map directly to `AssemblySpec`.

## Coordinate system

The ridge lies on `X=0`. Left and right wall plates lie at `X=-halfRunMm` and `X=halfRunMm`; their support elevation is `Z=0`. The building begins at `Y=0` and ends at `Y=buildingLengthMm`.

For pitch $\theta$ in radians, ridge height is:

$$
ridgeHeight = halfRunMm * tan(theta)
$$

Rafters begin at `X=+/- (halfRunMm + eaveOverhangMm)` with elevation `Z=-eaveOverhangMm * tan(theta)` and end at the ridge. A purlin placed `xMm` from a wall appears symmetrically on both roof planes at elevation `xMm * tan(theta)`.

## Spacing behavior

`fit-evenly` derives $ceil(buildingLength / requestedSpacing)$ bays and equalizes every bay. `fixed-spacing` retains the requested module from the starting wall and adds a final, possibly shorter bay at the far wall. The resolver exposes the requested spacing, actual primary spacing, final-bay spacing and stable station IDs.

## Fabrication relationship

`assemblyFromGableTemplate()` creates one existing `AssemblySpec` for the common rafter. `calculateAssembly()` remains the only fabrication solver. Repeated skeleton rafters are visual instances with stable instance IDs and a shared semantic selection ID for that canonical fabricated member.

The SVG renderer projects world XYZ through `projectAxonometric()` in `drawing-engine`. It does not calculate lengths, cuts or joints.

## Limits

The template is a geometric and visualization model only. It does not verify loads, timber strength, fastening, kerf, allowances or structural compliance. The initial UI exposes one optional purlin, although the assembly solver supports multiple separated supports.