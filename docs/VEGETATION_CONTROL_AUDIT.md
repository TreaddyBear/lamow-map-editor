# Vegetation editor corrective pass

The added Population / Plant rotation control was subsequently removed at the user's
request. Direction and deviance remain on the existing Grow and Branch controls.

## September 14 composition audit: stability before refining assets

This pass tests meaning across components and editing workflows, in addition to
individual ranges. The first 27 behavioral scenarios reproduced **22 failing cases**
(several cases share a cause). Corrections now cover:

| Failure | Result after correction |
| --- | --- |
| Adding a zero Cup/Curl, an empty Fork, or an independent Form rerolled unrelated shapes | Stable per-component, per-field, per-copy randomness preserves those shapes. |
| Nested Branch reused an ancestor's path, losing Fork radius or its parent's attachment | Children start at their own attachment; only their own Grow supplies a new path. |
| Steer after curved Grow was ignored by the next Branch | Local steering carries into the attachment frame. |
| Radial spread jumped near 360° | One spacing formula applies throughout positive and negative sectors. |
| Invalid layouts, skin types, colors, density, preview values, and component identity silently passed import | These fail validation before being saved. |
| Blank numeric input committed zero; Escape did not cancel; a typed value was ignored before an arrow nudge | Blank/Escape retain the value; arrow keys commit then nudge. Invalid color text reverts. |
| Rejected geometry edits could still change materials and poison subsequent population edits | Compilation failures preserve the prior visible geometry/materials and restore the active asset. |
| Legal flat-shaded OBJ sources could exceed JavaScript's argument limit | A 45,000-render-vertex fixture renders and recovers after rejected oversized copies. |
| Individually valid scales could compose into GPU infinities | Unrepresentable output coordinates fail cleanly. Vertex/tessellation budgets also bound expansion. |
| 99% dot coverage filled only about 90% of its cell | Radius accounts for cell clipping; the production GPU mask matches coverage within 0.4 percentage points in the 256² test. |

The measuring bench now includes **128 combined recipes** (all phrase types,
signed growth, all layouts, random angles, weighted choices), checking export/reimport,
input immutability, finite/index-valid output and inherited scale. Choice frequencies
are measured over 4,096 seeds. Browser checks exercise actual controls and live
buffers; the LOD test compiles the production mask shader and counts its pixels.

Each of the 15 builder quantities also has a direct output-deviance check over
2,048 seeds: Width, Length, Cup, Curl, Distance, Arc degrees, Arc direction, both
path radii, Fork radius/spread/count, and Branch around-axis/tilt/count. Values are
recovered from generated coordinates or actual copy counts, without reading the
compiler's sampled inputs. All continuous controls covered **99.79–99.99%** of their
requested intervals; all count outputs 16–48 occurred for `32 ±16`. Bounds, means,
and distribution checks pass. Count endpoints correctly have half-width rounding
intervals. Signed/zero/maximum-Ideal and maximum-deviance combinations remain in the
larger analytical range sweeps for every primitive and layout.

Verification: **10,907 measuring cases, zero failures; 47 core tests**. All 35 browser
scenarios pass across the full run and targeted reruns after corrections. Warm five-view
CPU updates measured 4.2–9.7 ms at default coverage and 5.1–6.9 ms with 1,008 full-density
plants; idle rendering stops. These are update times, not total input latency/GPU frames.
The reruns also verify old unmarked versions recover as clean and preserve disk history.

**Protecting refined assets:** `generationVersion: 1` names this corrected behavior.
Unmarked older files use version 1; reading them does not rewrite files. Forty-eight
committed output fingerprints cover the starter flower, authored clover fixture and
a nested recipe across the entire 16-variant pool. Future semantic changes must keep
version 1 available and introduce an explicit new generation version/conversion,
rather than quietly refreshing expected output. These corrections can change older
seeded appearances once; saved parameters and user version files remain untouched.

Remaining boundaries are explicit in the [modifier reference](VEGETATION_MODIFIERS.md):
`fromForm` attachment is unavailable, imported Steer/Choose/Color lack full authoring
inspectors, Form dimensions are source multipliers, and 16 shape variants do not cover
every random extreme. Self-intersection at extreme settings and perceived transitions
between near geometry and distant slats are not certified by these tests. The main
game still needs the shared-renderer integration described in the interface audit.

The historical results below describe earlier checkpoints and are superseded where
this section or the current modifier reference specifies corrected behavior.

## September 14 follow-up: does the randomness make visual sense?

Added 45 angular scenarios, measuring actual compass headings rather than merely
accepting a numerical sample. Full-turn sweeps follow 5° increments and accumulate
exactly ±360° of travel; narrow sectors cross 0° without leaks or a discontinuity.
The tests cover Grow bend direction, Branch around-axis, imported yaw, and whole
flowers after their real instance matrices are applied.

The baseline caught **seven biased distributions**. Most visibly, ±270° described a
540° sample interval: one half of the compass received twice as much probability
as the other. This happened for bend direction, around-axis and imported yaw. An
imported 540° population yaw span also biased actual flower headings.

Direction variation now saturates at ±180°, one unbiased full circle. The editor
offers **Any direction** beside the relevant fields. **Population → Plant rotation**
exposes rotation of the complete plant around its base; the isolated plant stays in
its editing frame. Bend amount and Fork spread keep their separate geometric meaning.
Existing narrower variation settings preserve their sampling behavior. Larger imported
orientation ranges retain their saved parameters but now render as one full circle.

The extended bench passes **10,734 cases** and includes polar compass plots. It checks
4,096 actual rendered flower headings, not just 16 precompiled shapes: independent
instance rotation still permits thousands of distinct headings while keeping the
16-shape geometry budget. Circular randomness is uniform around an axis, not a claim
of uniform random orientation over a sphere. See the [modifier reference](VEGETATION_MODIFIERS.md).

Verification: 45 core tests and seven targeted browser scenarios pass; production
build passes. In the 4,096-flower fixture, 4,095 headings remain distinct when rounded
to 0.0001°, with a largest compass gap of 0.72°. Warm five-view CPU updates were
4.0–6.1 ms at default coverage and 4.7–7.5 ms with 1,008 full-density plants.
The new controls and interactive polar plots were checked visually in Chromium.

## September 14: measured modifier ranges

The current control-by-control contract is [Vegetation modifiers](VEGETATION_MODIFIERS.md).
Run `pnpm audit:modifiers` to generate a searchable HTML report and raw JSON in
`.tmp/modifier-audit/`. The assertions also run in the normal test suite.

The baseline measured 10,687 cases with **66 failures**: 64 legacy angle cases were
clipped at ±180°, plus two statistical range failures. For distance `0 ± 0.8 m`,
the exact 16 seeds used by the preview produced −0.422291…−0.412990 m: only **0.58%**
of the requested interval, all negative. After mixing the random draws, the same
pool spans −0.781272…+0.677818 m (**91.19%**); 4,096 consecutive seeds span **99.96%**.
The 16-bin histogram now ranges from 238 to 290 samples per bin (256 expected).

Final verification: **10,689 measured cases across 65 groups, zero failures**; 45 core
tests pass, including that bench. Seven browser scenarios pass, including three new
tests that type values and compare live vertex buffers to analytical coordinates.
Production build passes. Warm five-view CPU updates measured **4.3–6.0 ms** at default
coverage and **5.0–7.8 ms** with 1,008 full-density plants; these are not GPU frame times
or total input latency. The HTML report's filtering, plots and case table were checked
in Chromium and visually inspected.

Corrections:

- Mix adjacent random seeds before use; retain the 16-variant geometry pool.
- Preserve sampled legacy angles beyond ±180° rather than clipping them.
- Use separate mixed random draws for patch scale and yaw. Previously both shared
  the same biased value, tying size to orientation.
- Expose leaf Cup, which was already changing leaf geometry but had no visible control.
- Ignore deprecated side bias when Around axis is specified, including its random draw.

The bench checks continuous/legacy travel, path cross-sections, every Form dimension
and supported deformation, all Fork/Branch layouts, copy counts, imported Steer axes,
defaults, material routing, budgets, coverage, serialization, finite normals, and actual
patch transform buffers. It includes signed Ideal endpoints, zero, maximum ± at negative,
zero and positive ideals, and fixed consecutive seeds. Independent expected geometry
uses a calibration tetrahedron and every rendered vertex of the shipped Form sources.

Some surprising behavior is documented rather than redesigned: Form Width is a source
multiplier (the shipped leaf is 0.48 × Width), branch tilt acts on different forward axes
for leaves and growth, and radial spacing jumps near a full turn. These are visible
design tradeoffs, not a claim that the whole experience is now beyond review.

Saved inputs/versions are unchanged; seeded geometry can look different after these
renderer corrections. The report measures geometry, not all possible compositions,
self-intersections, GPU pixels or game-side LOD transitions. Historical entries below
describe earlier milestones and may have been superseded.

## September 10: signed values and smooth holds

Grow arc and branch deviation angles now accept -180° to 180°. Azimuth and fork spread
accept signed turns; a -360° radial fork keeps distinct attachments. Cup/curl accept -1 to 1.
The +/- field is still a nonnegative magnitude around the signed ideal. Legacy growth no
longer discards negative bends.

The follow-up numeric audit also enables signed travel distance, form length/width, start/end
radii and fork radius, in both creation and editing controls. Negative travel moves backward
in the current frame; negative dimensions mirror their source axes; negative fork radius
places attachments on the opposite side. Signed growth radii invert the cross-section, with
opposite endpoint signs pinching through zero. Imported uniform scale can mirror the full
construction. Variation may cross zero for all these values without being flattened.
Mirrored forms correct their triangle winding. Legacy taper interpolates radii directly,
avoiding division by a zero start radius. Existing OBJ X/Y/Z controls already supported signs.
Counts, density/coverage, patch size, color/blend amounts and unsigned seed IDs keep their
domain-specific bounds; they are not signed geometric transforms.

NumberField accepts optional `holdAcceleration` parameters from `Components/Base/numberHold.ts`:
`delayMs`, `startRate`, `maxRate`, and `fine`/`coarse` points with `seconds` and
`stepsPerSecond`. One saturating curve fits both points exactly; there are no acceleration
stages or speed jumps. Defaults: an immediate single step, 300 ms repeat delay, about 2–3
steps/s initially, and 80% of the speed span at six active seconds. The ceiling scales with
the available range (one eighth of it per second), bounded to 4–120 steps/s.
Long stalls do not accumulate a catch-up burst; release, focus loss, hidden pages and bounds
stop the hold. A new hold restarts gently and remains one undo transaction.

Verification includes signed geometry across zero, both limits and 16 seeds, export/reload,
negative dimensions, offsets, cup/curl, scale, finite taper normals, exact curve anchors,
5–144 Hz timing, long browser holds, release/restart, bounds, focus loss and undo.
Core tests: 32 passing. The latest 16-scenario browser run passed 15; the focus-loss check
was interrupted by a development reload during a test-file edit and passed when rerun with
files unchanged. Production build passes. Five-view CPU updates remain 3.9–7.9 ms at default
coverage and 5.3–8.7 ms at 1,008 full-density plants (not GPU or total interaction timings).

## September 10: restored comparison workspace

The single-view optimization described below has been superseded. Five simultaneous panes
now use one engine and scene, independent cameras, shared compilation, reused buffers and
idle suspension. The 50% and 100% populations share a patch area and stable placement IDs.
The left-side **100% coverage · plants/m²** field is species-owned, persisted and exported;
Playtest uses the same calibration. Default: 25 plants/m², or 400 plants in a 4 × 4 m patch.

The LOD panes now use the actual game's extracted slat shader and baked detail, with bounded
patch geometry. They do not yet reproduce the full game's terrain masks or near/far transitions.
New Grow segments follow continuous arcs; legacy segments require explicit conversion.
Undo/redo groups held edits and vertex drags. Primitive overrides stay with their species.

Latest complete browser run: 12 passing scenarios. Domain/runtime: 26 passing tests. Warm
five-view updates: 4.3–6.4 ms at the default calibration and 6.8–9.4 ms with 1,008 plants in
the full-density pane. These remain CPU update timings, not total input-to-display latency
or a claim about GPU frame rate. Visual inspection and production build are separate checks.

## Earlier corrective pass (historical)

The earlier export/playtest slice left real usability gaps. Several controls still used
legacy species renderers, the preview rebuilt resources repeatedly, five views rendered
continuously, and camera refitting made dimension changes difficult to judge.

## Control behavior

| Area | Current behavior |
| --- | --- |
| Grow | Distance, arc, direction, start/end radius and path form reach recipe geometry. Direction is disabled for a straight segment; radii are disabled when no path form is drawn. |
| Fork | Count, radial/spiral/mirrored/cluster/same-axis layout, spread and radius reach geometry. Spread is disabled for same-axis layout. |
| Branch | Count, along-path/radial/alternating/tip layout, deviation and axis angle reach geometry. Surface-based `fromForm` is visibly unavailable. |
| Form | Primitive, material, length and width reach geometry. Petal cup/curl and leaf curl deform the editable source. Unsupported generic `importedMesh` is unavailable; OBJ replacement works through Meshes. |
| Defaults | Absent optional dimensions/deformation display the compiler's actual defaults. Focusing and leaving a number unchanged does not write a new value. |
| Species | Flowers, clover and tulip use the same recipe execution path in Plant and Patch views. |
| Grass | Density changes actual slat counts. Coverage colors change patch ground tint; slat colors change vertex colors. Editing grass selects its preview. |
| Numbers | Typing commits on blur/Enter without rewriting partial decimals. Buttons support click, hold, Enter and Space; arrow keys nudge. |
| Preview | One active Plant/Patch/Grass canvas; seed, patch count, camera angle and Fit controls. Editing keeps the camera stable. |
| Source meshes | Vertex position/color and edge sharpness remain editable and embedded in exports. Their separate viewport mounts only in Meshes. |
| Persistence | Local drafts are debounced and flushed when leaving. Export/reload/independent Playtest/mow/restore/return preserves authored assets and primitives. |

Recipe/Colors/Meshes/Grass tabs keep the inspector focused. Conditional settings are disabled
instead of appearing to accept ineffective edits. Grass is an editor approximation, and the
game's automatic LOD and protected tulip behavior are not implemented by this preview.

## Responsiveness evidence

Headless Chromium on this workstation, default flower, warmed edits:

- Eight single-plant dimension edits: **0.6–2.9 ms** per renderer update.
- Five dimension edits in a 1,000-plant patch: **4.1–7.3 ms** per renderer update.
- Mesh/material identities and camera values stay unchanged across those edits.
- The main preview's scene frame count stops advancing while idle.

These measurements cover the synchronous preview update, not total input-to-display latency,
cold startup, arbitrary imported OBJ size, or frame rate inside the main game. The regression
check allows 50 ms for host variability. Ordinary material edits avoid geometry compilation;
shape edits reuse resources and pre-triangulated primitive data within each compilation.

## Verification and handoff

The complete browser suite covers 10 scenarios, including renderer-buffer assertions rather
than only screenshots. Domain/runtime coverage has 23 passing tests, including deterministic
cross-host geometry, mowing/visibility/reset, resource reuse, recipe layout distinctions,
invalid drafts and portable imports. Screenshots of the active plant and grass views were
visually inspected. TypeScript, package and production builds pass. The existing large
Babylon bundle warning remains; cold-start bundle size is not covered by the warm-edit figures.

Main LaMow remains unchanged. Begin its port with one field-flower species using
`packages/landscape-renderer/docs/porting.md`; keep placement, terrain queries, scoring and
gameplay in the game host. Profile there before expanding to all species or LOD transitions.
