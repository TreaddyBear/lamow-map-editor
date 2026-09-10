# Vegetation Procedural Geometry

This editor uses one explicit transform contract for generated vegetation. The game runtime should use the same contract for any matching procedural asset path.

## Coordinate Basis

- World axes are `+X` right, `+Y` up, and `+Z` forward.
- A growth cursor has an origin and a local basis.
- Stem-like growth advances along local `+Y`.
- Petal and leaf primitives use local `+X` for width, local `+Y` for surface lift/cup/curl, and local `+Z` for outward length.
- Transform order is scale, then rotation, then translation. In Babylon this is `Matrix.Compose(scale, rotation, translation)`.

## Continuous growth (new Grow segments)

`pathMode: "arc"` specifies arc length `L`, total bend `a` in radians, and azimuth `b`.
At normalized distance `t`:

```txt
p(t) = (L/a) * [(1-cos(a*t))*cos(b), sin(a*t), (1-cos(a*t))*sin(b)]
Q(t) = rotation around [sin(b), 0, -cos(b)] by a*t
```

The straight limit is `[0, L*t, 0]`; zero length advances orientation without moving.
`L` is signed travel: negative values move backward in the local frame without reversing
the frame itself. Form dimensions and uniform scale are signed transforms as well. Winding
is reversed for odd reflections so normals remain consistent. Start/end radii interpolate
directly through zero, including for legacy skin; no taper ratio is divided by the start.
The next segment inherits `Q(1)`. Branch attachment uses both `p(t)` and `Q(t)`.
Source skin triangles are sliced into horizontal bands, then placed in this moving frame
with linearly interpolated radius. Source colors and seam identities survive subdivision.
`growthPath.ts` owns the implementation.

Length π/2, bend 90°, azimuth 0 ends at `[1,1,0]` with tangent `+X`.
A subsequent straight unit segment ends at `[2,1,0]`.
Bends are signed: -90° ends at `[-1,1,0]` with tangent `-X`. The +/- amount
is a nonnegative sampling radius around that signed angle, including across zero.

Existing segments with no `pathMode`, or `legacyDirection`, retain the behavior below.
**Use curved growth** explicitly converts an old segment. Legacy skin-only `bend` does not
apply to the continuous path. Imports never silently change this choice.

## Legacy growth direction

A growth segment with length `height`, deviation `arcDegrees`, and `arcAzimuthDegrees` produces:

```txt
arc = radians(clamp(arcDegrees, -180, 180))
azimuth = radians(arcAzimuthDegrees)
radial = sin(arc) * height
growthVector = [
  cos(azimuth) * radial,
  cos(arc) * height,
  sin(azimuth) * radial
]
```

So:

- `arcDegrees = 0` grows straight up: `[0, height, 0]`.
- `arcDegrees = 90`, `azimuth = 0` grows along `+X`.
- `arcDegrees = 90`, `azimuth = 90` grows along `+Z`.

## Petal Fork Placement

For a petal in a radial fork:

```txt
radial(theta) = [sin(theta), 0, cos(theta)]
tangent(theta) = [cos(theta), 0, -sin(theta)]
elevation = -petalPitchRadians
forward = normalize([
  radial.x * cos(elevation),
  sin(elevation),
  radial.z * cos(elevation)
])
up = normalize(cross(forward, tangent))
right = normalize(cross(up, forward))
basePosition = headPosition + radial(theta) * baseRadius
```

The primitive's local axes map as:

- local `+X` to `right`
- local `+Y` to `up`
- local `+Z` to `forward`

This means fork angle controls placement around the head, while petal pitch controls elevation within the petal's own local frame.

## Test Expectation

The math layer must be testable without React, DOM, screenshots, or user interaction. Tests should cover:

- basis values for each function
- pairwise combinations, such as arc plus yaw, theta plus pitch, and fork radius plus theta
- multi-part flower composition, including stem, center, and petals
- sampled value ranges staying finite, orthonormal, and spatially meaningful
