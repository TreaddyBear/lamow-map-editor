# Vegetation modifiers: what the numbers mean

Current contract, September 14, 2026. For a quick diagnosis: set **± to 0**, keep the
preview seed fixed, and compare a single component. **Ideal is the centre of a range;
± is its radius**, not a second angle, a percentage, or an additional fixed offset.

For example, distance `0.05 ± 0.10` samples between **−0.05 and +0.15 m**. Negative
results are retained. The editing limit applies to Ideal and ± individually; the
random result can extend beyond the Ideal input's limits. Counts must stay between
0 and 64. Direction randomness has a circular limit, explained below.

## A turn, a bend, and a random heading

**0°→360° travels one complete turn and ends at the same heading.** It does not
leave an extra bend in the stem. The angular bench follows all the intermediate
headings to check the travel rather than just comparing the endpoints.

- **Arc direction** chooses the plane the stem bends in. It is not an axial twist
  of the entire source mesh and flower. **Arc degrees** controls how far it bends.
- **±0°** is a fixed heading. **±90°** covers a half circle. **±180°** covers a full
  circle. **Any direction** sets ±180°; clicking it again returns to a fixed heading
  at Ideal. Ideal remains available when returning to a narrower sector.
- Random directions crossing 0° wrap smoothly. For example, `350° ±20°` reaches
  330° through 0° to 10°. Adding 360° to Ideal preserves every seeded heading.
- Orientation deviation saturates at ±180°. Imported larger deviations display/use
  the same full-circle range. Otherwise ±270° wraps 540° of samples onto one circle
  and weights some headings twice. This applies to Arc direction, Around axis and
  imported Steer rotations. Imported population yaw spans wider than 360° likewise
  use one full circle centred on the saved range. Saved files are not rewritten on load.

**Bend amount and Fork spread are not headings:** extra turns can change the actual
path or placement pattern, so those values keep their existing ranges. Uniform yaw
means an even distribution around the base, not uniform directions over a 3D sphere.

## Grow

| Control | Ideal input / maximum ± / button step | Actual effect |
| --- | --- | --- |
| Distance | −0.8…0.8 m / 0.8 / 0.005 | Signed **path length**, before any inherited scale. Negative moves backward; zero moves nowhere. On an arc it is not the plant's vertical height or the straight distance between endpoints. |
| Arc degrees | −180…180° / 180 / 1 | Total turn over a continuous arc. `90°` with direction `0°` bends from local up toward local +X; `−90°` bends toward −X. A randomized turn can reach ±360°. |
| Arc direction | −360…360° / 180 / 1 | Chooses the bend plane around local up: 0° toward +X, 90° toward +Z. Whole turns repeat the same direction. Disabled when both arc Ideal and ± are zero. Any direction covers the full circle. |
| Start radius | −0.08…0.08 m / 0.08 / 0.001 | Cross-section at the start of the path. The source mesh's X/Z coordinates are multiplied by twice this value. A source radius of 0.5 therefore produces this radius in meters. |
| End radius | −0.08…0.08 m / 0.08 / 0.001 | Cross-section at the end; interpolated linearly from the start. Opposite signs pinch through zero; negative signs invert the cross-section. |
| Form along path | none / stemSkin / blade | Draws a stem or slat along the path. **None still moves the cursor**, but draws no skin and disables radius controls. Zero-distance continuous growth draws no skin, while retaining its outgoing orientation. |

The next component inherits the endpoint and orientation. A 0.2 m path bent 90°
ends about 0.1273 m to the side **and** 0.1273 m up. It does not stand 0.2 m tall.
Changing distance on that arc changes both coordinates. Curve smoothness is tessellated
at up to 12° per band, so the mathematical path is smooth but the rendered mesh is finite.

Older imported Grow components use **legacy direction**: angle tilts a straight
segment instead of bending a continuous path. `Use curved growth` changes that meaning;
it is not a shape-preserving conversion. Legacy `bend` offsets only the skin quadratically
in its local X direction; it does not move the endpoint or attachments. It is ignored
in arc mode and has no current inspector. See [the equations](VEGETATION_PROCEDURAL_GEOMETRY.md).

## Fork

Fork runs its child recipe once per copy, at the current cursor. It does not move
the parent's cursor; a later sibling resumes from the original parent location.

| Control | Ideal input / maximum ± / button step | Actual effect |
| --- | --- | --- |
| Count | 1…64 / min(Ideal, 64−Ideal) / 1 | Samples a number, then rounds to the nearest integer. A ± range can produce **zero copies**. Nested counts multiply. Empty children draw nothing regardless of count. |
| Spread degrees | −360…360° / 360 / 1 | Signed angular spread or spacing factor, depending on layout below. This changes placement and each child's local orientation. |
| Radius | −0.3…0.3 m / 0.3 / 0.005 | Offset from the cursor in its local X/Z plane, scaled by inherited scale. At angle 0 the offset is +Z. Negative radius moves to the opposite side; it does not independently rotate the child. |

For copy index `i` starting at 0, copy count `n`, and sampled spread `s`:

| Layout | Placement angle / consequence |
| --- | --- |
| radial | Angle is always `i × s / n`. The sector includes its start and excludes its end, so full turns have no duplicate endpoint and small spread changes remain smooth. |
| spiral | `i × 137.507764° × (s / 360°)`. Spread scales the golden-angle spacing; it is **not** the total occupied angle. |
| mirrored | Alternates negative/positive angles at increasing distances from the centre, up to approximately half the spread. With an odd count the sides are not perfectly balanced. |
| cluster | Each copy gets an independent angle between 0 and `s`. This is a randomized ring sector, **not** a filled disk; all copies share the sampled radius. |
| sameAxis | Every angle is 0. Copies share position and orientation, though their child deviations can differ. Identical children overlap completely. Spread is disabled. |

The September 14 composition pass removes the old spacing jump near ±360°.
Partial radial sectors now use the same spacing rule as full turns; existing partial
fans can consequently look different. Negative spread reverses the ordering.

## Branch

Branch places child recipes along the **most recent Grow path**, using that path's
orientation at each attachment. With no preceding Grow, attachments coincide at the
current origin. Branch does not move the parent's cursor. A Fork or Branch child starts
at its own attachment and does **not** inherit an ancestor's attachment path. A Grow
inside that child establishes a new local path. Steer after Grow rotates subsequent
Branch orientations relative to the path frame without moving attachment positions.

| Control | Ideal input / maximum ± / button step | Actual effect |
| --- | --- | --- |
| Offshoot count | 1…64 / min(Ideal, 64−Ideal) / 1 | Number of child recipes, rounded after sampling as for Fork. |
| Deviation angle | −180…180° / 180 / 1 | Tilts each child frame using **negative local X rotation**. A leaf's +Z direction tilts up at +90°. A subsequent Grow's +Y direction tilts toward −Z at +90°. These look different because leaves and growth use different forward axes. |
| Around axis | −360…360° / 180 / 1 | Adds rotation around the attachment's local up direction, in addition to the layout's spacing. Each child samples its own value. Legacy `sideBiasDegrees` is a fallback only when this field is absent. Any direction covers the full circle. |

| Layout | Attachment fraction along the previous path | Additional around-axis spacing |
| --- | --- | --- |
| alongPath | `(i+1)/(n+1)`; excludes both endpoints | `i × 360°/n` |
| alternating | Same fractions as alongPath | `i × 180°` |
| radial | All at the midpoint | `i × 360°/n` |
| tip | All at the endpoint | `i × 360°/n` |
| fromForm | **Unavailable in the UI.** Imported recipes currently fall back to tip. | No surface sampling is implemented. |

The name **Deviation angle** describes the branch's tilt. Its **± field** controls
random variation of that tilt. They are separate concepts despite the similar names.

## Form

Form places a source mesh at the cursor without advancing it. **Length and Width
are source-coordinate multipliers**, not guaranteed final bounding-box sizes. Local
X is width; leaves/petals extend along +Z, while stems/slats extend along +Y.

| Primitive | Length ideal limit | Width ideal limit | Axes multiplied by Length / Width | Cup and Curl |
| --- | --- | --- | --- | --- |
| stemSkin | ±0.70 | ±0.08 | Y / X and Z | Neither |
| saddlePetal | ±0.22 | ±0.16 | Y and Z / X | Both |
| leafBlade | ±0.35 | ±0.18 | Y and Z / X | Both |
| centerDisc | ±0.18 | ±0.18 | Y / X and Z | Neither |
| quadSlat | ±2.50 | ±0.45 | Y / X and Z | Neither |
| seedFuzz | ±0.18 | ±0.08 | Y and Z / X | Neither |

Length/Width buttons step by 0.005. Maximum ± equals the corresponding positive
Ideal limit. Negative values mirror the listed axes; zero collapses them. The renderer
corrects winding for odd reflections. Collapsed geometry can be invisible, and large
bends/deformations can self-intersect even when all numbers and normals remain finite.

The shipped leaf has a source X span of **0.48**. Width `0.10` therefore gives a
local width of **0.048 m**, before rotation and inherited/instance scale. Editing
the source OBJ changes that relationship. There is no automatic source normalization.
The bench report lists the actual extents of every shipped source mesh.

| Control | Range / step | Actual effect |
| --- | --- | --- |
| Cup | Ideal −1…1; ± 0…1 / 0.01 | Adds `Cup × sourceX²` to source Y, then applies Length. Lifts both sides symmetrically; negative cups downward. |
| Curl | Ideal −1…1; ± 0…1 / 0.01 | Adds `0.42 × Curl × sourceZ²` to source Y, then applies Length. Lifts the tip quadratically; negative curls downward. This displaces vertices; it is not an angle or a rigid bend. |
| Material | Available species material IDs | Chooses this Form's material, multiplied by source vertex colors under scene lighting. It does not change geometry. |
| Primitive | Six listed meshes | Changes the source, resets dimensions to that primitive's creation defaults, and selects a suitable material. Existing cup/curl values are retained; they have an effect only on leaves/petals. Generic `importedMesh` is unavailable; use OBJ replacement in Meshes. |

Absent fields in an imported Form use compiler fallbacks: Width 0.05 for centerDisc,
0.04 otherwise; Length 0.09 except centerDisc, whose absent Length is **0.62 times the
same sampled Width**. Once Length is explicitly edited, it becomes an independent
sample. Cup/Curl default to zero. Creation defaults can differ from these import fallbacks.

## Randomness, previews, and limits

- Recipe execution is deterministic for the same asset, seed, and generation version.
  Draws are keyed by component ID, field, and parent copy path. Adding neutral optional
  fields or inserting/reordering independent Forms does not reroll existing shapes.
  Moving a component into a different parent or changing its ID changes its draws.
  Structural edits can still intentionally change the inherited position or orientation.
- A Fork's count/spread/radius are sampled once per Fork execution. Each child then
  samples its own controls. Branch samples its tilt/around-axis separately per child.
- Continuous ranges are uniform before transforms. Rounded counts are **not** uniformly
  distributed integers: the two endpoints have half-width rounding intervals.
- Patch rendering reuses **16 shape variants** to bound compilation, meshes and memory.
  The single-plant view also selects from that pool. A larger seed ID can select the
  same shape; it can still change placement rotation/scale. A small pool does not show
  every possible extreme. Patch scale/yaw are separate random draws, with explicit
  placement overrides taking precedence.
- September 14 corrects random mixing, attachment scope, and radial spacing. **Saved
  parameters and versions are untouched, but their appearance can change once with
  these corrections.** New parsed/exported assets carry `generationVersion: 1`; older
  unmarked assets use version 1 without rewriting their files. This version's geometry
  is protected by 48 committed output fingerprints plus analytical/behavior tests.
  A future intentional semantic change must preserve version 1 and introduce an explicit
  new generation version/conversion; do not silently replace the fingerprints.
  Asset versions remain input snapshots, not frozen meshes or renderer binaries.
- Limits: 64 copies per Fork/Branch, 2,048 emitted Forms per plant, 8,192 execution
  steps, 131,072 rendered vertices per plant, and 16 nested levels. Curved source
  subdivision also has a preflight tessellation budget. Individually valid controls can exceed a combined budget;
  compilation rejects the draft rather than generating invalid geometry.
- Imported scalar ranges may exceed the UI editing limits, up to the parser's finite
  magnitude budget (`abs(Ideal) + ± ≤ 10,000`). Focusing/blurring an unchanged value
  preserves it; typing a replacement or nudging applies the UI limit.

## Other controls and imported recipe features

| Control | Range and meaning | Verification boundary |
| --- | --- | --- |
| 100% coverage | 0.1…200 **complete plants/clusters per m²**, step 0.5. Count is `round(rate × patch area × density fraction)`. Not percentage of pixels covered by leaves. | Bench verifies exact counts and stable subsets. |
| Patch size | 1…8 m, step 0.5; square side length | Area grows quadratically, not linearly. Bench checks boundary placement/counts. |
| Seed | 0…4,294,967,295 integer | Deterministic placement/variant selection; repetition of shape is expected with 16 variants. |
| Cut appearance | Stems or grass stubble; height 0.01…0.3 meters, step 0.005; RGB hex color/tint | Saved on the species and rendered in Playtest after mowing. Stems add stalks over a 0.05-meter grass base. Grass style uses the selected height throughout; white tint preserves the game's vertex colors. Browser checks cover persistence, visible remnants, and unchanged ground texture. |
| Slat density | 0.05…3, step 0.01 | Multiplies distant slat geometry density. Independent of near-plant coverage calibration. Existing browser tests check buffer changes; this bench does not certify perceived LOD equivalence. |
| Coverage pattern / scale | Natural, stripes or dots; 0.1…10 m, step 0.1 | Opaque grass/vegetation surface selection. Natural uses irregular noise at multiple scales, thresholded before distance filtering so distant coverage stays mixed. Scale changes feature size, not opacity. GPU measurements check area and increasing coverage, including high-density dots and filtered Natural coverage. |
| Slat palette / vegetation far color | RGB hex; far-color strength 0…1, step 0.05 | Changes distant appearance. Material/vertex color, lighting and the pattern affect the displayed pixel. No colorimetric/GPU proof is claimed here. |
| Mesh vertex X/Y/Z | −2…2 source units, step 0.005 | Changes the source before recipe deformation/scale. Source imports allow a wider validated range. Source color multiplies material color; seams split normals rather than moving vertices. |
| Imported Steer | yaw/pitch/roll in degrees; signed uniform Scale | Local roll, then pitch, then yaw; scale multiplies all downstream dimensions/travel. Bench checks axes and signs. No current recipe inspector. |
| Imported Color | material ID | Changes subsequent Grow skin material; Form has its own explicit material. Bench checks this distinction. |
| Imported Choose | nonnegative weights | Executes one weighted child recipe, mutating the current cursor. All-zero weights execute none. Bench checks routing and measured 1:3 frequencies over 4,096 seeds. |

Typed decimals are retained at the control's supported precision; the button step is
an increment, not a requirement to snap every typed number to that increment. Held
buttons accelerate smoothly and stop at the editing limit. Empty input and Escape retain
the previous value; arrow keys first commit a typed value before nudging it. Invalid color
text reverts on blur. See the existing number-hold
tests for acceleration anchors and cancellation behavior.

## Run the measuring bench

```sh
pnpm audit:modifiers
```

Open `.tmp/modifier-audit/index.html`. Search a control, inspect its input/seed rows,
compare measured/expected coordinates, or inspect the random-range plots. The companion
JSON contains raw results. `--out path/to/report.html` chooses another output location;
`--baseline previous-report.json` includes failures/distributions from an earlier run.

The bench uses a calibration tetrahedron to separate position from orientation and
the shipped OBJ meshes to verify every transformed Form vertex. Expected calculations
use independent trigonometry and vector operations, not the renderer's transform
helpers. An optional compiler trace records sampled inputs; the random-range tests
measure output endpoints directly. Circular tests also unwrap full-turn sweeps, check
small sectors across 0°, and count actual headings in 24 compass sectors. The report
includes polar plots; select a result row to inspect its case. A full random circle
must reach all sectors without significant concentration or large angular gaps, including
after applying the real population transforms. Geometry tolerance is 0.000002 m. Normals and
indices are checked for finite/valid output, including zero and negative dimensions.

The same assertions run under `pnpm test`. The composition bench adds 128 generated
recipes covering all phrase types, export/reimport, input immutability, and inherited
scale. Separate output-deviance groups recover all 15 builder quantities from vertices
or copy counts over 2,048 seeds each, checking range coverage and distribution without
consulting the compiler's random-sample trace. Browser tests type through real controls, inspect live buffers, and measure the
actual LOD mask shader's area and monotonic growth. The audit does
not claim exhaustive nested combinations, all 2³² seeds, absence of self-intersection,
or correctness of every lighting/LOD pixel. [Dated findings](VEGETATION_CONTROL_AUDIT.md).
