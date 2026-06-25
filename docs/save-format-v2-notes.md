# Save Format v2 Notes

- Formalize editor blueprints as parameterized archetypes. The current v1 editor metadata stores concrete area blueprints that compile into normal level `areas`; v2 should define reusable archetype parameters, defaults, and how those expand into base level components.
- Keep `objects` reserved until the runtime object schema is defined. Trees, rocks, props, and similar authored entities should not be inferred from the current empty `objects` array.
