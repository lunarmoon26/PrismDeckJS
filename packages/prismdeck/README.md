# prismdeckjs

Browser-native spatial presentation SDK used by
[PrismDeck Studio](https://lunarmoon26.github.io/PrismDeckJS/).

## Capabilities

- Local `.pptx`, `.odp`, `.prismdeck`, and PrismDeck HTML import.
- Versioned normalized document and asset bundle.
- Canvas2D flat-slide rendering plus Three.js mono, full-SBS, and half-SBS spatial rendering.
- Editable depth, rotation, thickness, text, and optional Rapier physics.
- Source-independent semantic charts and merged/styled tables with deterministic ECharts SVG rendering.
- Planar imported elements by default with explicit opt-in extrusion.
- Native cut, fade, and slide transitions with reduced-motion fallback.
- Non-occluding per-slide scene background colors.
- Convergence-relative stereo depth calibration and aspect-correct slide textures.
- PowerPoint and ODP template layouts that can instantiate slides.
- Single-file editable HTML export with CDN-hosted Three.js playback.
- Active-slide screen-reader tables for presentation tables and chart data.
- Shared Agent Skill plus OpenCode and DeepSeek/Cordis adapter entrypoints.

## Basic use

```ts
import { DeckPlayer, importPresentation } from 'prismdeckjs';

const input = await file.arrayBuffer();
const deck = await importPresentation(input, { sourceName: file.name });
const player = await DeckPlayer.create(canvas, deck, {
  physics: true,
  autoStart: true,
  renderer: { overlayCanvas },
});
```

Call `player.dispose()` when the canvas is no longer used. Imported files are
parsed locally; the SDK does not upload source bytes or execute macros, scripts,
or OLE objects. `overlayCanvas` is optional; when supplied and positioned above
the WebGL canvas, flat zero-depth slides use it for crisp Canvas2D output.

## Browser module and HTML export

```js
import * as PrismDeck from 'https://cdn.jsdelivr.net/npm/prismdeckjs@latest/dist/prism-deck.min.js';
```

`savePrismDeckHtml(deck)` embeds the full document archive and assets into one
HTML file. `loadPrismDeckHtml(bytes)` recovers the same editable `LoadedDeck`
without executing HTML-authored scripts. The default runtime URL is pinned to the
installed `prismdeckjs` package version and can be overridden with an absolute
HTTPS URL.

## Agent entrypoints

OpenCode discovers the server plugin from the package's `./server` export.
DeepSeek Harness loads `prismdeckjs/deepseek` through the bundled
`cordis.patch.yml`. Claude Code, Codex, and Antigravity consume the shared skill
under `skills/prismdeckjs/`. Every adapter delegates to that skill's scripts,
which call the same validated HTML exporter as the SDK.

See the [repository](https://github.com/lunarmoon26/PrismDeckJS) for the schema,
element contract, PPTX/ODP compatibility matrix, Studio, and development
instructions.
