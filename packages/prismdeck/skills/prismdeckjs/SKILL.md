---
name: prismdeckjs
description: "Create and export editable PrismDeckJS slide decks and spatial presentations. Use whenever a user asks an agent to build slides, a presentation, a deck, a browser-native HTML presentation, or a DeckDocument with optional stereo depth or physics."
compatibility: Requires Node.js 22.20+ for HTML export; Python 3.10+ may invoke the Node bridge through scripts/main.py.
metadata:
  plugin: prismdeckjs
---

# PrismDeckJS

Turn a narrative into a concise, editable `DeckDocument` and export it as a
single HTML viewer that PrismDeck Studio can re-import.

## Workflow

1. Confirm the audience, purpose, and requested deliverables only when the prompt
   leaves them ambiguous.
2. Plan a multi-slide story before authoring JSON. Give each slide one job and
   vary composition rather than repeating a generic title-and-bullets layout.
3. Start from [the bundled deck template](assets/deck.json). Read
   [the authoring guide](references/deck-authoring.md) and consult the packaged
   schema for exact element shapes when adding charts, tables, images, spatial
   transforms, stereo, or physics.
4. Write the source `DeckDocument` to the user's requested location. When none is
   given in a PrismDeckJS checkout, use `generated/<name>.json`.
5. Export through the bundled script instead of hand-authoring an HTML wrapper:

   ```bash
   echo '{"action":"export_html","input":"generated/story.json","output":"generated/story.html"}' | node scripts/main.mjs
   ```

   `python3 scripts/main.py` preserves the same contract by delegating export to
   the Node entrypoint.
6. Inspect the result in a browser when one is available. Check clipping,
   contrast, hierarchy, slide-to-slide rhythm, and desktop/mobile loading without
   console errors.
7. Report both the editable source JSON and exact generated HTML path.

## Guardrails

- Keep imported or user-supplied presentation data local. Never execute macros,
  OLE objects, embedded scripts, imported markup, or file-authored code.
- Author only normalized PrismDeck document shapes. Do not leak PPTX/ODP parser
  types or JavaScript renderer options into the document.
- Unsupported source features become structured warnings; do not silently drop
  them.
- The path-based HTML bridge has no binary asset input. Use Studio or the public
  `LoadedDeck` API for image-rich decks.
- Viewing the generated HTML requires network access to the version-pinned
  PrismDeckJS CDN runtime.

See [the tool contract](references/tool-contract.md) before changing an
entrypoint or host adapter.
