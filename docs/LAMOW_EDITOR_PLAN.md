# LaMow Editor: recovered direction and proposed plan

Draft for discussion, 2026-09-09. This is a product and implementation plan, not a claim that
the work is complete or that every proposed choice has been approved. This pass changes
documentation only.

## What the editor is for

Build a species from a small vocabulary of growth operations, inspect its individual form
and its appearance across a lawn, tune the materials and distance representations in the
actual game rendering pipeline, and use that definition across LaMow maps.

The useful vertical slice is therefore:

**Build from empty → compare several views → tune variation, color and LOD → save/export →
resolve the species in a map → bake → play in LaMow with the authored appearance and correct
gameplay behavior.**

The current edit/export/mow harness proves part of that pipeline. It does not yet prove the
complete authoring experience, game appearance, or map/bake integration.

## Evidence and precedence

Reviewed the original vegetation conversation through its first message, relevant archived
editor and game discussions, editor commits `f7214aa`, `785d98d`, `86d9469`, `b77e0fd`, game
commits `4b82b78`, `09dc027`, `98bec9a`, `565ca15`, `c35d779`, and both projects' design notes.
The game checkout was read only. Older map interaction requests were sampled across several
pages; this is not an assertion that every historical map issue has been reproduced.

Key original vegetation conversation: task ID `019f19ea-9272-73e2-87bb-0e26d0fd96ba`.
Related archived tasks: “Adjust sidebar indentation”, “Improve editor UX and sidebar”, and
“Review Claude changes”.

Explicit user requests take precedence over assistant-authored proposals and subsequent
implementation shortcuts. In particular:

- The five-view request and the instruction to preserve the panes outweigh the recent
  single-preview optimization. The latest feedback explicitly reaffirms this.
- Piecewise growth, Fork and Branch supersede the earlier flat species-parameter UI proposal.
- The later request for editable OBJ primitives supersedes old notes saying the editor
  must never edit vertices.
- “Zero helper text” and custom tooltips supersede softer notes saying merely to reduce it.
- Tulips became expected content; dandelions remain a later behavior-specific extension.
- “v2” referred to possible map-format work, not permission to defer core editor requirements
  into an invented future product generation.

## Requirements to preserve

| Requirement | Meaning for the product |
| --- | --- |
| Construction, not a preset costume editor | Start empty and build root-to-tip with Grow, Fork, Branch and Form; recipes remain editable trees. |
| Few expressive tools | New plants should mostly require new recipes or primitives, not new hardcoded species controls. |
| Continuous growth | A curved segment has a defined path and an end tangent inherited by the next segment. No separate Turn tool. |
| Distinct Fork and Branch | Fork makes equivalent continuations; Branch emits a separately authored offshoot while the main path continues. |
| Several useful views together | Closeup, 50% population, 100% population, 50% vegetation/grass LOD, and 100% vegetation LOD. |
| Direct, stable interaction | Hold or drag changes geometry without flicker; useful increments and acceleration; selection and camera remain intelligible. |
| Quiet editor chrome | Subtle pane icons and custom tooltips; no explanatory filler or native browser title tooltips; inspector beside the preview. |
| Editable source geometry and color | OBJ primitives, XYZ vertex manipulation, per-vertex albedo, smoothing/sharp seams; optional emissive where implemented. |
| Game rendering fidelity | The same definition, primitives, seed, materials, LOD rules and environment settings produce the same appearance in both hosts. |
| Global assets | Maps reference stable species IDs; they do not contain the species library. Individual species remain independently customizable. |
| Confidence through use | Build several different plants from scratch and inspect all angles, not just assert that a buffer changed. |

## Current concessions and gaps

| Current state | Required correction |
| --- | --- |
| One Plant/Patch/Grass view | Restore the five simultaneous comparison panes. Keep resource reuse and demand-driven drawing. |
| Labeled view buttons, headings and helper text | Recover the requested subtle icon/menu design, with accessible names and custom tooltips. |
| Camera stays fixed but ignores selected recipe part | Restore a useful selected-part pivot while preserving orbit angle and zoom. With no selection, use the plant/head target; reset is explicit. |
| Arc selects the direction of a straight segment; bend separately deforms its skin | Define one continuous growth path and use it for the skin, endpoint, tangent and branch attachment frames. |
| Independent crossed-blade grass approximation | Use the game's actual wide, upright, alpha-textured waffle slats and their distance behavior. |
| Generic preview lighting and materials | Share the game material/environment configuration needed for meaningful color and appearance decisions. Geometry parity alone is insufficient. |
| OBJ sources and their colors are shared throughout the editor | Distinguish editing a shared primitive from a species-specific shape/color override; make propagation deliberate. |
| Sixteen geometry variants chosen by seed modulo 16 | Treat this as an implementation tradeoff to measure. Do not silently equate it with unrestricted per-instance procedural variation. |
| Some schema features are preserved but not rendered | Track each as implemented, unsupported, or migrated. Core growth/material requirements must be completed, not permanently dismissed by disabling controls. |
| Local draft recovery, but no vegetation undo/redo | Add transactional history for recipes, colors, source edits and species operations. Recovery and undo solve different problems. |
| Separate Playtest can import and mow flowers | Complete species lookup, map bake and actual game integration; retain protected tulip behavior. |

The recent performance measurements are useful for the current one-view implementation.
They do not establish five-pane responsiveness, total input-to-display delay, full-game
performance, or visual fidelity.

## Proposed sequence

### 1. Restore the comparison workspace without discarding the performance fixes

Keep the recipe tree on the left and the inspector on the right, with independent scrolling
and reserved scrollbar space. Restore a large closeup and four comparison panes. The two
population panes use the same physical area and a stable placement set, so the 50% case is a
meaningful subset of the 100% case. Counts such as 500/1,000 are useful fixtures, not the
definition of density for every species.

Each pane has a subtle, consistently sized icon with its menu, selected view state, and
reset action. Use the previously requested flower, orthogonal slat-grid, and quincunx visual
language. No permanent pane-name labels or filler instructions. Preserve accessible names,
focus indicators, actual validation messages and custom tooltips.

The implementation should share a rendering host, compiled plant data and resources across
views wherever practical. A pane is a UI/interaction boundary; it does not require its own
engine. Route input to the pane under the pointer and preserve per-pane camera state. Render
dirty views on edits and redraw for camera motion or enabled animation. Avoid duplicate
geometry compilation, texture creation, and material work. Profile CPU work, GPU draws and
input-to-display delay separately with all five panes visible.

During a held edit, update all visible comparisons coherently. If work must be scheduled
across frames, keep delay bounded and measured. Lower internal resolution or expensive
preview effects before removing views. Do not silently leave comparison panes stale.

**Acceptance:** editing one petal updates the closeup and both populations without camera
reset or flicker; all five panes remain available and independently operable. The LOD panes
must ultimately pass step 4's game-rendering checks as well.

### 2. Make the construction language mathematically faithful

Write a compact shared transform contract with worked diagrams and known numeric examples.
For Grow, specify arc length, curvature plane, start frame, end frame, taper, and the local
frame at any attachment point. Define straight and zero-length limits explicitly. Carry the
end tangent into subsequent growth. Branch angles are deviation from the local growth axis
and azimuth around it. Fork has a count, layout and shared continuation; Branch has its own
offshoot and preserves the main continuation.

Implement skinning and attachments from that same path. Settle how branch placement relates
to a curved segment and how a form attaches to it. Migrate legacy Continue/Steer data without
reintroducing Turn into authoring. An old asset must not silently acquire a different shape.

Keep ideal ± variation as the normal authoring model. Centralize limits, units, defaults and
sampling semantics so the UI and renderer cannot disagree. Use stable seed behavior and
decide explicitly how independent recipe branches sample variation. Review the current
16-variant pool against visual diversity and performance before fixing it as a contract.

**Acceptance:** build a field flower, clover and tulip from empty using the same vocabulary;
also build an asymmetric curved plant to expose hidden assumptions. Test basis values,
pairwise and multi-operation compositions, joins, angular boundaries and degenerate cases.
Inspect the results from all sides and across multiple seeds.

### 3. Finish the authoring interactions and asset ownership

Put the necessary initial values in sidecar Add popovers adjacent to the tree, preserving
the preview. Keep hierarchy connectors, compact indentation, drag/drop reordering and
nesting, and left-side delete actions. Selection should identify the generated part or
subtree and give the closeup a useful pivot without changing its orbit or zoom.

Use one numeric-field implementation for appropriate steps, readable values, focus, delayed
hold acceleration, keyboard operation and reliable pointer release. Verify a full held
gesture visually; timing a single update is not a substitute. Add undo/redo so one hold or
vertex drag is one undoable operation, alongside discrete add/delete/move/import operations.
Retain local recovery and ordinary file import/export, including replacement of matching IDs.

Finish the XYZ vertex editing workflow and seam editing. Keep canonical OBJ primitives,
species geometry/color overrides, and generated meshes as distinct concepts. Editing a
flower's colors must not unexpectedly recolor other species using the same source petal.
Support per-vertex albedo first; complete material/gradient behavior required by authored
assets and treat emissive as an optional accent. A broader vegetation gizmo system remains
deferred, consistent with the earlier request to hold off on it.

**Acceptance:** build and revise all three reference species, undo mistakes, export/reimport,
reload, and verify appearance, source edits, selected state and intentional sharing.

### 4. Establish real game appearance and LOD comparison

Use shared materials, color handling, lighting/environment configuration and the relevant
game vegetation render paths. Provide a stable calibration setting so comparisons are
repeatable; editor cameras and surrounding interface remain editor-owned.

Bring the game's actual slat geometry, alpha texture and tint behavior into the two LOD
panes. Compare near geometry, transition and far representation using the same authored
patch. Include mixed grass/species and low-lying clover. Species definitions own far color,
contribution and representation. Editor camera or diagnostic settings stay editor metadata.
Do not force the full grass/terrain/mowing system into the flower species schema.

**Acceptance:** changing a species' color or LOD contribution produces the intended matching
change in both hosts. Inspect sparse/dense patches, mixed colors, clover, and distance
transitions for smearing, popping, disappearing flowers and incorrect hue. Show the same
reference asset in editor and game under matching conditions for visual comparison.

### 5. Complete the smallest real LaMow integration

Make the renderer and asset contract one maintained dependency used by both projects.
Recommended first step: establish the existing package as the canonical source, with an
explicit version/artifact consumed by the game. Avoid two independently edited copies.
A third repository is a reasonable eventual home once both consumers work; it is a packaging
decision, not a substitute for agreeing on and testing the shared behavior.

Keep species in project-global assets. Bake resolves map species IDs and writes stable
definition references and seeds or agreed visual samples. Runtime resolves those definitions
through the shared loader. Start with one flower species in a real map, then the other field
flowers, clover and tulip. Keep placement/scoring in the game and preserve tulip protection
and damage behavior. Test both baked maps and the supported fallback path, reset and map
switching. Use the same fixture definitions in editor, bake and runtime checks.

**Acceptance:** author a changed plant, export/copy it into the game assets, bake and play the
map, and recognize the same result. No manual reconstruction in game code or special
hardcoded treatment for the reference recipe. The full flower/clover/tulip slice is complete
only after appearance, performance and interactions pass in LaMow.

## Broader editor work to preserve

Use the product identity **LaMow Editor**, with Maps and Vegetation as distinct workspaces.
Keep global species/mesh data out of map files. Preserve the existing map editor; audit its
historically requested camera stability, small-object selection, gesture-sized undo/redo,
curve handles, snapping, tree disclosure and import/export behavior before marking them
settled. These are a verification backlog, not newly diagnosed failures.

Follow the requested Pages / Views / Components / Contexts / utilities structure. Extract
reusable controls, tree rows, preview panes and toolbars into semantic components; keep
Radix behavior and shared styling behind the Base layer. The large AssetsPage should not
become the permanent home for rendering, input machinery and every authoring operation.

Mower assembly, structural modules, trees, pack-local assets and dandelion special effects
remain extensions. Preserve space for them in contracts without building their editors now.
Resizable/reassignable Blender-style panes, bundles and direct project-file saving can wait;
simultaneous comparison panes, correct growth and game fidelity cannot.

## How to prevent further drift

Maintain this requirement list alongside implementation checks. A performance change must
state which user-visible behavior it preserves. A proposed reduction to a core workflow is
a product decision to discuss, not something to silently replace and label complete.

For each stage, retain deterministic reference assets, expected geometry cases, interaction
tests and before/after visual evidence. Distinguish “changes a buffer”, “matches the intended
math”, “feels usable”, and “matches the game”: each needs its own evidence. Keep feedback
attached to those outcomes and revise this plan when the intended behavior changes.

The next implementation should be step 1, followed by continuous-growth correctness. Scope
the rendering parity work alongside those foundations, then complete the actual map/game
loop. Further feedback can change the layout and interaction details before those are built.
