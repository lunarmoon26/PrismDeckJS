# prismdeckjs

Browser-native spatial presentation SDK used by
[PrismDeck Studio](https://lunarmoon26.github.io/PrismDeckJS/).

## Capabilities

- Local `.pptx`, `.odp`, `.prismdeck`, and PrismDeck HTML import.
- Versioned normalized document and asset bundle.
- Three.js mono, full-SBS, and half-SBS rendering from one scene.
- Editable depth, rotation, thickness, text, and optional Rapier physics.
- PowerPoint and ODP template layouts that can instantiate slides.
- Single-file editable HTML export with CDN-hosted Three.js playback.

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

## Browser module and HTML export

```js
import * as PrismDeck from 'https://cdn.jsdelivr.net/npm/prismdeckjs@latest/dist/prism-deck.min.js';
```

`savePrismDeckHtml(deck)` embeds the full document archive and assets into one
HTML file. `loadPrismDeckHtml(bytes)` recovers the same editable `LoadedDeck`
without executing HTML-authored scripts. The default runtime URL is pinned to the
installed `prismdeckjs` package version and can be overridden with an absolute
HTTPS URL.

See the [repository](https://github.com/lunarmoon26/PrismDeckJS) for the schema,
compatibility policy, Studio, and development instructions.
