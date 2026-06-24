# Component Library Notes

Current decision: keep a small local UI wrapper layer instead of adding a full external component library yet.

Why:

- The editor is not using complex widgets like modal dialogs, comboboxes, virtual lists, or nested accessible menus yet.
- Native controls cover the current sidebar panes, details menus, file inputs, buttons, checkboxes, and form fields.
- A thin wrapper layer in `src/components/ui/` gives us a stable API that can later be backed by Radix UI, shadcn/ui, Ariakit, React Aria, or another library without rewriting every feature surface.
- Avoiding a library right now keeps the migration focused on code ownership boundaries rather than visual churn.

Current local wrappers:

- `Button`
- `ActionRow`
- `FileButton`

Good triggers for adding a real library later:

- Custom accessible dropdown/menu behavior beyond native `details`.
- Dialogs, command palette, popovers, tooltips, or comboboxes.
- Keyboard-navigable tool palettes with roving focus.
- A design-system pass where consistent variants, tokens, and component anatomy matter more than raw editor behavior.

Likely candidates:

- Radix UI for accessible primitives.
- React Aria if we want lower-level behavior hooks and strict accessibility coverage.
- shadcn/ui if we want Radix-backed components with local ownership of source.
