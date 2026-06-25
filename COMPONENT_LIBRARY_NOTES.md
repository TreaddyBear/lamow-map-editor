# Component Library Notes

Current decision: keep a small local UI wrapper layer backed by Radix primitives where behavior matters.

Why:

- Radix now backs dialogs, dropdown menus, popovers, and context-menu primitives.
- Native controls still cover simple fields, file inputs, checkboxes, and `details` panes.
- A thin wrapper layer in `src/components/ui/` gives us a stable API that can later be backed by shadcn/ui, Ariakit, React Aria, or another library without rewriting every feature surface.
- Tailwind belongs mostly in base wrappers, small semantic UI components, or tightly scoped viewport/SVG rendering modules. Feature components should prefer named components over long utility strings when the pattern is reusable.

Current local wrappers:

- `Button`
- `ActionRow`
- `FileButton`
- `Dialog`
- `Menu`
- `Popover`
- `ContextMenu` primitives
- `Panel`
- `PanelHeader`
- `PanelBody`
- `Stack`
- `Item`
- `SectionHeader`
- `Hint`
- `StatusMessage`

Good triggers for adding a real library later:

- Command palette, tooltips, comboboxes, or virtualized lists.
- Keyboard-navigable tool palettes with roving focus.
- A design-system pass where consistent variants, tokens, and component anatomy matter more than raw editor behavior.

Likely candidates:

- Continue with Radix UI for accessible primitives.
- React Aria if we want lower-level behavior hooks and strict accessibility coverage.
- shadcn/ui if we want Radix-backed components with local ownership of source.

Open cleanup direction:

- Create more semantic base/editor components so feature files do not carry raw layout classes everywhere.
- Rename or reorganize `src/components/ui/` if we want a stricter `components/Base/*` boundary.
- Pull large feature surfaces such as `Sidebar`, `ViewportToolbar`, `SnapControls`, and parts of `App` into smaller named components before adding more UI features.
