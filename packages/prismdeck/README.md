# prismdeckjs

Browser-native spatial presentation SDK used by
[PrismDeck Studio](https://lunarmoon26.github.io/PrismDeckJS/).

## Capabilities

- Local `.pptx`, `.odp`, and `.prismdeck` import.
- Versioned normalized document and asset bundle.
- Three.js mono, full-SBS, and half-SBS rendering from one scene.
- Editable depth, rotation, thickness, text, and optional Rapier physics.
- PowerPoint and ODP template layouts that can instantiate slides.

## Basic use

```ts
import { DeckPlayer, importPresentation } from 'prismdeckjs';

const input = await file.arrayBuffer();
const deck = await importPresentation(input, { sourceName: file.name });
const player = await DeckPlayer.create(canvas, deck, {
  physics: true,
  autoStart: true,
});
```

Call `player.dispose()` when the canvas is no longer used. Imported files are
parsed locally; the SDK does not upload source bytes or execute macros, scripts,
or OLE objects.

See the [repository](https://github.com/lunarmoon26/PrismDeckJS) for the schema,
compatibility policy, Studio, and development instructions.
