# Deck authoring guide

## Exact contract

The packaged [`prismdeck.schema.json`](../../../schema/prismdeck.schema.json) is
the machine owner for document and element shapes. Use
[`assets/deck.json`](../assets/deck.json) as a minimal working source, not as a
visual template to repeat unchanged.

## Composition

- Use normalized frames where `x`, `y`, `width`, and `height` describe fractions
  of the slide. Keep intentional content inside the visible slide bounds.
- Every visible element needs a stable `id`, semantic `name`, transform,
  opacity, visibility, and render order.
- Keep ordinary content planar. Use depth, rotation, thickness, and physics only
  when they clarify the story or demonstrate spatial behavior.
- Prefer a small visual system: one display face, one body face, a restrained
  palette, clear spacing, and repeated alignment anchors.
- Charts and tables store editable semantic data. Never persist ECharts options,
  callbacks, source XML, or renderer state.
- Give images useful alt text. The path-based agent bridge cannot package binary
  image assets, so use Studio or the `LoadedDeck` API when assets are required.

## Narrative checks

1. The opening establishes the claim or question.
2. Middle slides provide evidence, mechanism, comparison, or progression.
3. The ending states one conclusion or next action.
4. Titles remain scannable and body copy fits without relying on browser zoom.
5. Speaker notes hold explanation that should not crowd the visible slide.

## Export checks

- Preserve the source JSON next to the HTML output.
- Treat schema or semantic validation failures as authoring errors; fix the JSON
  rather than bypassing validation.
- Open the HTML through a browser with network access and verify navigation,
  Mono/Full SBS/Half SBS controls, and any declared physics.
